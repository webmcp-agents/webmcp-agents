/**
 * One run's events, from the stream parts and tool calls `runAgent` sees: it opens and closes model steps, times tool
 * calls (and the time they spent parked for the person) and emits `AgentRunEvent`s in order. It never throws into the
 * run (`emitRun` catches listeners), and once sealed (`finish`, `abort`) it emits nothing more.
 */
import { toolErrorCode } from "@webmcp-agents/core";
import { isDelegateTool } from "../agent";
import { en } from "../customize/en";
import { chatErrorCode } from "../customize/errors";
import type { ChatErrorCode } from "../customize/types";
import { isCancelled } from "../shared";
import type { AgentStreamPart, ToolOutput } from "../types";
import { type AgentRunEvent, emitRun, type RunRef } from "./run-events";

/** The tool call in flight (calls run one at a time within a run). */
interface InFlight {
  id: string;
  tool: string;
  started: number;
  /** When it parked for the person; 0 while it is not parked. */
  parkedAt: number;
  /** Time spent parked so far. */
  waited: number;
}

/** A step that is open (its request went out, its reply has not ended). */
interface OpenStep {
  n: number;
  started: number;
  firstToken?: number;
  toolCalls: number;
}

const now = (): number => (typeof performance === "undefined" ? Date.now() : performance.now());

/** The run's events. One per run: a sub-agent's run has its own. */
export class RunTracker {
  /** Model steps opened so far. */
  private steps = 0;
  private open: OpenStep | undefined;
  private call: InFlight | undefined;
  private readonly started = now();
  private sealed = false;
  /**
   * A `step-finish` part just closed the step, and no new step began: a `tool-call` part now belongs to that reply
   * (an adapter that announces calls after closing the step), so it opens no step.
   */
  private afterReply = false;

  constructor(
    readonly ref: RunRef,
    /** How many tools the model is offered right now (read when a step opens). */
    private readonly toolCount: () => number,
  ) {}

  private emit(e: AgentRunEvent): void {
    if (!this.sealed) emitRun(e);
  }

  /** `run-start`. */
  start(adapter: string, agent: string | undefined): void {
    this.emit({ type: "run-start", ref: this.ref, ...(agent && { agent }), adapter, at: this.started });
  }

  /** The id of the tool call in flight, if it is `tool` (any tool when `tool` is omitted) and not a delegate call. */
  inFlight(tool?: string): string | undefined {
    if (this.sealed || !this.call || (tool !== undefined && this.call.tool !== tool)) return undefined;
    return this.call.id;
  }

  private openStep(): void {
    if (this.open) this.closeStep();
    this.open = { n: ++this.steps, started: now(), toolCalls: 0 };
    let tools = 0;
    try {
      tools = this.toolCount();
    } catch {
      // the tool list is the page's: a getter that throws must not break the run
    }
    this.emit({ type: "step-start", ref: this.ref, step: this.open.n, tools, at: this.open.started });
  }

  private closeStep(part?: Extract<AgentStreamPart, { type: "step-finish" }>): void {
    const step = this.open;
    if (!step) return;
    this.open = undefined;
    const usage = part?.usage && Object.keys(part.usage).length > 0 ? part.usage : undefined;
    this.emit({
      type: "step-finish",
      ref: this.ref,
      step: step.n,
      ms: now() - step.started,
      ...(step.firstToken !== undefined && { firstTokenMs: step.firstToken - step.started }),
      ...(part?.model && { model: part.model }),
      ...(usage && { usage }),
      toolCalls: step.toolCalls,
    });
  }

  /** Follow one of the adapter's stream parts (this run's own, not a sub-agent's). */
  part(part: AgentStreamPart): void {
    if (this.sealed) return;
    switch (part.type) {
      case "step-start":
        this.afterReply = false;
        this.openStep();
        return;
      case "step-finish":
        // an adapter that reports the end of a step after its tool calls: the step was closed when the first call started
        this.afterReply = !!this.open;
        this.closeStep(part);
        return;
      case "message-start":
        this.afterReply = false;
        if (!this.open) this.openStep();
        return;
      case "tool-call":
        if (!this.open && this.afterReply) return;
        this.count(true);
        return;
      case "text-delta":
      case "reasoning":
        this.afterReply = false;
        this.count(false);
        return;
      default:
        return;
    }
  }

  /** The first token of the step, and its tool calls; opens a step for an adapter that sends no `step-start`. */
  private count(call: boolean): void {
    if (!this.open) this.openStep();
    const step = this.open!;
    step.firstToken ??= now();
    if (call) step.toolCalls++;
  }

  /** `tool-start`: a call begins (the model step that asked for it is over). */
  toolStart(call: { id: string; name: string; input: unknown }): void {
    if (this.sealed) return;
    const step = this.open?.n ?? this.steps;
    // the reply that asked for this call is complete: a later call of the same reply opens no step
    this.afterReply = true;
    this.closeStep();
    const at = now();
    this.call = { id: call.id, tool: call.name, started: at, parkedAt: 0, waited: 0 };
    this.emit({ type: "tool-start", ref: this.ref, step, call: call.id, tool: call.name, at, input: call.input });
  }

  /** True while a page tool (not a `delegate_to_*` call) is in flight: core's cursor events belong to it. */
  inPageCall(): boolean {
    return !this.sealed && !!this.call && !isDelegateTool(this.call.tool);
  }

  /** `tool-park`: the call in flight waits for the person. */
  park(prompt: string): void {
    const call = this.call;
    if (this.sealed || !call || call.parkedAt) return;
    call.parkedAt = now();
    this.emit({ type: "tool-park", ref: this.ref, call: call.id, tool: call.tool, prompt, at: call.parkedAt });
  }

  /** The call in flight runs again after the person's click: its parked time ends. */
  unpark(): void {
    const call = this.call;
    if (!call?.parkedAt) return;
    call.waited += now() - call.parkedAt;
    call.parkedAt = 0;
  }

  /** `tool-yield`: the person interacted while the call ran. */
  yielded(reason: string): void {
    if (this.sealed || !this.call) return;
    this.emit({ type: "tool-yield", ref: this.ref, call: this.call.id, reason, at: now() });
  }

  /** `tool-finish` for the call in flight. `stopped`: the run was stopped meanwhile. */
  toolFinish(output: ToolOutput | undefined, stopped = false): void {
    const call = this.call;
    if (this.sealed || !call) return;
    this.unpark();
    this.call = undefined;
    const first = output?.content.find((c) => c.type === "text")?.text ?? "";
    const cancelled = stopped || (output?.isError === true && isCancelled(first));
    const state = cancelled ? "cancelled" : output?.isError ? "error" : "done";
    const code = state === "done" ? undefined : state === "cancelled" ? "cancelled" : (toolErrorCode(output) ?? "failed");
    this.emit({
      type: "tool-finish",
      ref: this.ref,
      call: call.id,
      tool: call.tool,
      ms: now() - call.started,
      waitedMs: call.waited,
      state,
      ...(code && { code }),
      ...(output && { output }),
    });
  }

  /** `run-finish`, once: the step still open is closed first. Seals the tracker. */
  finish(reason: "stop" | "max-steps" | "aborted" | "error", code?: ChatErrorCode | string): void {
    if (this.sealed) return;
    if (this.call) this.toolFinish(undefined, true);
    this.closeStep();
    const failed = reason === "error" ? chatErrorCode(code) : undefined;
    this.emit({
      type: "run-finish",
      ref: this.ref,
      reason,
      ms: now() - this.started,
      steps: this.steps,
      // the catalog's text for the code: an error event never carries the conversation (or a provider's echo of it)
      ...(failed && { error: en.errors[failed], code: failed }),
    });
    this.sealed = true;
  }

  /** The run was stopped: the call in flight ends `cancelled`, then `run-finish` `aborted`. */
  abort(): void {
    if (this.sealed) return;
    if (this.call) this.toolFinish(undefined, true);
    this.finish("aborted");
  }
}
