/**
 * The on-device agent loop, the same for every provider: rank the page's
 * tools, generate, parse tool calls, validate them, run them on the page one
 * at a time, feed the results back, repeat. Small models get one chance to fix
 * a bad call per step, a step budget, and a timeout per generation.
 */
import type { AgentMessage, AgentRunRequest, AgentStreamPart } from "@webmcp-agents/chat";
import { buildLocalSystemPrompt, textOf, toChatTemplateMessages } from "./prompt";
import { type ParsedCall, parseToolCalls } from "./tool-call-parser";
import { rankTools, validateArgs } from "./tools";
import type { ChatTurn, CompactTool, GenerateRequest, GenerateResult, LocalProvider } from "./types";

/** Options for `runLocalAgent` (and the matching `createLocalAdapter` options). */
export interface LocalLoopOptions {
  /** Model steps per user message. Default 6: enough to find, open and add; small models plan poorly beyond that. */
  maxSteps?: number;
  /** Per generation. Default 60 s. */
  stepTimeoutMs?: number;
  /** Most tools shown to the model per step. Default 8. */
  maxTools?: number;
  /** Pass the tools in the prompt text (providers without native chat-template tools). */
  toolsInline?: boolean;
  /**
   * What the site is and how its tools fit together, in a few short lines ("To buy: search, open_product, then
   * add_to_cart"). Small models can't infer a site's flow from tool names; this is where the site tells them.
   */
  instructions?: string;
}

const TOO_LONG = "This request is too long for the on-device model. Start a new chat, or try the cloud assistant.";
const TIMEOUT = "The on-device model took too long. Try a shorter request or the cloud assistant.";
const APOLOGY = "Sorry, I couldn't work out how to do that on this page. Try rephrasing, or use the cloud assistant.";
const REPEAT = "I stopped because I was going in circles. Tell me more about what you want, or try the cloud assistant.";
const MAX_STEPS = (n: number): string =>
  `I stopped after ${n} steps without finishing. Try a more specific request (a product name, a size), or the cloud assistant.`;

/** What the person last wrote: the last text part of their last message (a note the session put before it, like a change of page, isn't a query). */
const lastUserText = (messages: readonly AgentMessage[]): string => {
  const m = messages.findLast((x) => x.role === "user");
  const part = m?.parts.findLast((p) => p.type === "text");
  return part?.type === "text" ? part.text : "";
};
const newId = (): string => (typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `l-${Date.now()}-${Math.random()}`);

/** Generate, racing the signal: a provider (or a browser API) that ignores it must not hang the loop. */
function generate(provider: LocalProvider, request: GenerateRequest): Promise<GenerateResult> {
  const aborted = new Promise<never>((_, reject) => {
    const fail = (): void => reject(request.signal.reason ?? new DOMException("Aborted", "AbortError"));
    if (request.signal.aborted) fail();
    else request.signal.addEventListener("abort", fail, { once: true });
  });
  const generated = provider.generate(request);
  // the loser of the race may settle later (a timeout after success, a late provider error)
  for (const p of [generated, aborted]) p.catch(() => {});
  return Promise.race([generated, aborted]);
}

/**
 * The nudge after a step's tool calls. Not shown in the chat: it only lives in this run's prompt. Small models copy
 * phrases from it, so it names no outcome ("done", "opened") they could parrot as if it had happened.
 */
export const continuePrompt = (query: string): string =>
  `Next step for my request "${query.slice(0, 200)}": the next tool call, or one short sentence about the tool results if nothing is left. Don't repeat a call that worked.`;

const normalize = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Whether `prose` is mostly a copy of an earlier tool result or assistant reply in `turns`. */
export function echoes(prose: string, turns: readonly ChatTurn[]): boolean {
  const p = normalize(prose);
  if (p.length < 12) return false;
  const head = p.slice(0, 48);
  return turns.some((t) => (t.role === "tool" || t.role === "assistant") && normalize(t.content).includes(head));
}

/** A tool result's gist, for a short answer: its first line, plus up to 3 list lines when that line introduces them. */
function brief(text: string): string {
  const [first = "", ...rest] = text.trim().split("\n");
  if (!first.trim().endsWith(":")) return first.trim();
  const items = rest.filter((l) => l.trim().startsWith("-")).slice(0, 3);
  const more = rest.filter((l) => l.trim().startsWith("-")).length - items.length;
  return [first.trim(), ...items, ...(more > 0 ? [`…and ${more} more.`] : [])].join("\n");
}

/**
 * The tool a reply tells the user to use themselves ("open the product page and click Add to cart" when add_to_cart
 * is right here), or null. Only when the user asked for an action, not a question ("What can you do?", "How do I…?"
 * are answered in words), and the reply names one or two tools (by name or in words) with an instruction.
 */
export function delegatedTool(prose: string, names: ReadonlySet<string>, query: string): string | null {
  if (/\?\s*$|^\s*(what|how|why|which|who|where|when|can you|could you tell|do you|is|are)\b/i.test(query)) return null;
  const text = prose.toLowerCase();
  const mentioned = [...names].filter((n) => text.includes(n) || text.includes(n.replace(/_/g, " ")));
  if (mentioned.length === 0 || mentioned.length > 2) return null;
  return /\b(click|tap|press|use|go to|open|select|choose|please|you can|you need to)\b/.test(text) ? mentioned[0]! : null;
}

/** The correction for a reply that handed the user a tool's job. */
export const doItPrompt = (tool: string): string =>
  `Don't tell me how to do it: you do it. Call ${tool} now. If you need something from me first (a size, an address), ask for just that.`;

/** After a failed call answered with prose: the failure, and what to do instead. */
export const failedPrompt = (error: string): string =>
  `That tool call failed: ${error} Fix it with a different tool call (search first if you don't know the exact name), or tell me plainly that it failed. Don't say it worked.`;

const clip = (s: string | null | undefined, max = 80): string | undefined => {
  const t = s?.replace(/\s+/g, " ").trim();
  return t ? (t.length > max ? `${t.slice(0, max - 1)}…` : t) : undefined;
};
/** The page's title and main heading (skipping the chat's own UI). */
function pageSummary(): { title?: string; heading?: string } {
  if (typeof document === "undefined") return {};
  const h1 = [...document.querySelectorAll("main h1, h1")].find((h) => !h.closest("[data-web-agents-ui]"));
  return { title: clip(document.title), heading: clip(h1?.textContent) };
}

/** Run one user message through `provider`: an AgentAdapter `run()` body. */
export async function* runLocalAgent(
  provider: LocalProvider,
  req: AgentRunRequest,
  opts: LocalLoopOptions = {},
): AsyncGenerator<AgentStreamPart> {
  const { stepTimeoutMs = 60_000, maxTools = 8, toolsInline = false } = opts;
  // the page's agent (defineWebAgent) wins over the adapter's options: its instructions, its step budget
  const maxSteps = req.agent?.maxSteps ?? opts.maxSteps ?? 6;
  const instructions = req.agent?.instructions.length ? req.agent.instructions.join("\n") : opts.instructions;
  const delegation = (req.agent?.agents.length ?? 0) > 0;
  const query = lastUserText(req.messages);
  const format = provider.callFormat ?? "tags";
  const turns: ChatTurn[] = toChatTemplateMessages(req.messages, format);
  // Retry resumes an interrupted turn after its last finished call: carry on from that result, don't start over.
  if (turns.at(-1)?.role === "tool") turns.push({ role: "user", content: continuePrompt(query) });
  const used: string[] = [];
  /** Each call made in this run (name + arguments) and what it returned: a call that brings nothing new is a loop. */
  const seen = new Map<string, string>();
  let loops = 0;
  /** The last tool call's error, until a later call succeeds: a reply that ignores it isn't accepted as the answer. */
  let failure: string | null = null;
  /** This run's successful tool results, newest last: what a final answer has to be about. */
  const results: string[] = [];
  // A resumed turn's calls count: a repeat is still a repeat, and a failure still has to be dealt with.
  for (const m of req.messages.slice(req.messages.findLastIndex((m) => m.role === "user") + 1)) {
    for (const p of m.parts) {
      if (p.type !== "tool" || (p.state !== "done" && p.state !== "error")) continue;
      const answer = p.error ?? textOf(p.output);
      seen.set(JSON.stringify({ name: p.name, arguments: p.input ?? {} }), answer);
      used.push(p.name);
      failure = p.state === "error" ? answer.slice(0, 300) : null;
      if (p.state === "done") results.push(answer);
    }
  }
  const path = typeof location === "undefined" ? undefined : location.pathname;
  const page = pageSummary();

  for (let step = 1; step <= maxSteps; step++) {
    if (req.signal.aborted) return yield { type: "finish", reason: "aborted" };
    // ---------- 0. the prompt: the page's tools fresh each step, as many as the model's window takes ----------
    let tools: CompactTool[] = [];
    let system = "";
    let fitted = false;
    for (const max of [...new Set([maxTools, 4, 2, 1])].filter((n) => n <= maxTools)) {
      tools = rankTools(req.tools, query, { max, recent: used.slice(-2) });
      system = buildLocalSystemPrompt({
        path,
        page,
        tools,
        toolsInline: toolsInline ? tools : undefined,
        firstTool: tools[0],
        format,
        instructions,
        delegation,
      });
      if (!provider.fits || (await provider.fits({ system, messages: turns, tools }).catch(() => true))) {
        fitted = true;
        break;
      }
    }
    // still too long: drop the oldest turns (the newest user turn always stays)
    while (!fitted && provider.fits) {
      const from = turns.findIndex((t, i) => i > 0 && t.role === "user");
      if (from === -1) break;
      turns.splice(0, from);
      fitted = await provider.fits({ system, messages: turns, tools }).catch(() => true);
    }
    if (!fitted) return yield { type: "error", error: TOO_LONG };
    const names = new Set(tools.map((t) => t.name));
    const messageId = newId();
    yield { type: "message-start", messageId };

    // ---------- 1. generate; read the reply before showing it ----------
    // A small model's reply is checked before anyone sees it: it may claim a failed action worked, parrot an earlier
    // result, or tell the user to do what a tool here does. Each gets one corrective retry per step (a malformed call
    // gets its own); the typing indicator covers the wait.
    let calls: ParsedCall[] = [];
    let shown = ""; // the prose this step has shown so far
    let corrected = false;
    let repaired = false;
    for (;;) {
      const signal = AbortSignal.any([req.signal, AbortSignal.timeout(stepTimeoutMs)]);
      let raw: GenerateResult;
      try {
        raw = await generate(provider, { system, messages: turns, tools, signal });
      } catch (err) {
        if (req.signal.aborted) return yield { type: "finish", reason: "aborted" };
        if (signal.aborted) return yield { type: "error", error: TIMEOUT };
        return yield { type: "error", error: `The on-device model failed: ${err instanceof Error ? err.message : String(err)}` };
      }

      const parsed = parseToolCalls(raw.text, names);
      for (const c of parsed.calls) {
        const problem = validateArgs(tools.find((t) => t.name === c.name)!.parameters, c.arguments);
        if (problem) parsed.errors.push(`${c.name}: ${problem}`);
      }
      const plain = parsed.calls.length === 0 && parsed.errors.length === 0;
      // a plain answer that ignores a failed call, or hands the user a job a tool here does: back once, with why
      const delegated = plain ? delegatedTool(parsed.text, names, query) : null;
      const correction = !plain || corrected ? null : failure ? failedPrompt(failure) : delegated ? doItPrompt(delegated) : null;
      if (correction) {
        corrected = true;
        turns.push({ role: "assistant", content: raw.text }, { role: "user", content: correction });
        continue;
      }
      let prose = parsed.text.trim();
      // a final answer that only repeats an earlier result or reply: say what the last call did instead
      if (plain && !failure && results.length && echoes(prose, turns)) prose = brief(results.at(-1)!);
      if (prose && prose !== shown) {
        yield { type: "text-delta", messageId, delta: (shown ? "\n\n" : "") + prose };
        shown = prose;
      }
      turns.push({ role: "assistant", content: raw.text });
      if (parsed.errors.length === 0) {
        calls = parsed.calls;
        break;
      }
      if (repaired) {
        yield { type: "text-delta", messageId, delta: (shown ? "\n\n" : "") + APOLOGY };
        return yield { type: "finish", reason: "stop" };
      }
      // feed the problem back once, as the tool's error
      repaired = true;
      turns.push({ role: "tool", name: parsed.calls[0]?.name ?? "tool", content: `Error: ${parsed.errors.join(" ")} Try again.` });
    }
    if (calls.length === 0) return yield { type: "finish", reason: "stop" };

    // ---------- 2. run the calls on the page, in order ----------
    for (const call of calls) {
      const key = JSON.stringify(call);
      const id = newId();
      yield { type: "tool-call", messageId, id, name: call.name, input: call.arguments };
      const output = await req.callTool({ id, name: call.name, input: call.arguments });
      used.push(call.name);
      // The same call with the same answer as before (search → browse → search …): it learned nothing. Say so once;
      // the second time, stop. A repeat that answers differently (the cart changed) is fine.
      const same = seen.get(key) === textOf(output);
      seen.set(key, textOf(output));
      if (same && ++loops >= 2) {
        yield output.isError ? { type: "tool-error", id, error: textOf(output) } : { type: "tool-result", id, output };
        yield { type: "text-delta", messageId, delta: REPEAT };
        return yield { type: "finish", reason: "stop" };
      }
      const note = same
        ? "\n\n(You already made this exact call and got this same answer. Don't repeat it: try different words, another tool, or answer the user with what you found.)"
        : "";
      turns.push({ role: "tool", name: call.name, content: textOf(output).slice(0, 1500) + note });
      failure = output.isError ? textOf(output).slice(0, 300) : null;
      if (!output.isError) results.push(textOf(output));
      yield output.isError ? { type: "tool-error", id, error: textOf(output) } : { type: "tool-result", id, output };
      if (req.signal.aborted) return yield { type: "finish", reason: "aborted" };
    }
    // small models echo the last tool answer and stop: restate the request, as the user, so the next step continues it
    turns.push({ role: "user", content: continuePrompt(query) });
    yield { type: "step-finish", step };
  }
  // out of steps: say so (with what was found), rather than end on a silent tool card
  const messageId = newId();
  yield { type: "message-start", messageId };
  yield { type: "text-delta", messageId, delta: (results.length ? `${brief(results.at(-1)!)}\n\n` : "") + MAX_STEPS(maxSteps) };
  yield { type: "finish", reason: "max-steps" };
}
