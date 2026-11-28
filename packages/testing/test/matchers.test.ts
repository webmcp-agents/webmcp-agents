import type { AgentEvent } from "@webmcp-agents/core";
import { toolError } from "@webmcp-agents/core";
import { describe, expect, test, vi } from "vitest";
import { fail, mockAdapter, text, toolCall } from "../src/chat";
import type { AgentRunEvent } from "@webmcp-agents/chat";
import "../src/matchers";
import { RUN_LOG, type RunLog } from "../src/run-record";
import { recordEvents } from "../src/helpers/events";

/** The message an assertion fails with (fails the test when it passes). */
async function failure(assertion: () => unknown): Promise<string> {
  try {
    await assertion();
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error("the assertion passed, but it should have failed");
}

const ok = (t: string) => ({ content: [{ type: "text", text: t }] });

describe("tool result matchers", () => {
  test("toBeToolResult passes on success and on matching text", () => {
    expect(ok("Added 2 × Field Mug")).toBeToolResult();
    expect(ok("Added 2 × Field Mug")).toBeToolResult("2 × Field Mug");
    expect(ok("Added 2 × Field Mug")).toBeToolResult(/2 × Field/);
    expect(ok("Added 2 × Field Mug")).toBeToolResult(expect.stringContaining("Mug"));
    expect({ content: [{ type: "text", text: "Error [not_found]: No such mug." }], isError: true }).not.toBeToolResult();
  });

  test("toBeToolResult says the call failed, with its code and text", async () => {
    const message = await failure(() => expect(toolError("invalid_input", "qty must be ≥ 1")).toBeToolResult());
    expect(message).toContain('Expected the call to succeed, but it failed with code "invalid_input"');
    expect(message).toContain("Error [invalid_input]: qty must be ≥ 1");
  });

  test("toBeToolResult says what text it got", async () => {
    const message = await failure(() => expect(ok("Added 1 × Field Mug")).toBeToolResult(/2 ×/));
    expect(message).toContain("its text does not match");
    expect(message).toContain('"Added 1 × Field Mug"');
  });

  test("a declarative form's Error text counts as a failure", () => {
    expect(ok("Error [needs_user]: Pick a size.")).toBeToolError("needs_user");
    expect(ok("Error: nope")).toBeToolError();
  });

  test("not.toBeToolResult says the call succeeded", async () => {
    expect(await failure(() => expect(ok("fine")).not.toBeToolResult())).toContain("Expected the call to fail, but it succeeded");
  });

  test("toBeToolError names both codes and prints the result's text", async () => {
    const message = await failure(() => expect(toolError("invalid_input", "qty must be ≥ 1")).toBeToolError("not_found"));
    expect(message).toContain('code "invalid_input", not "not_found"');
    expect(message).toContain("Error [invalid_input]: qty must be ≥ 1");
  });

  test("toBeToolError on a success, and negated", async () => {
    expect(await failure(() => expect(ok("fine")).toBeToolError())).toContain("but it succeeded");
    expect(await failure(() => expect(toolError("timeout", "slow")).not.toBeToolError("timeout"))).toContain(
      'not to fail with code "timeout"',
    );
    expect(toolError("timeout", "slow")).not.toBeToolError("cancelled");
  });

  test("toHaveStructuredContent matches part of it and names the keys that differ", async () => {
    const result = { ...ok("ok"), structuredContent: { total: 48, items: 2 } };
    expect(result).toHaveStructuredContent({ total: 48 });
    const message = await failure(() => expect(result).toHaveStructuredContent({ total: 50 }));
    expect(message).toContain('differs at "total"');
    expect(message).toContain("total: expected 50, got 48");
    expect(await failure(() => expect(ok("x")).toHaveStructuredContent({ a: 1 }))).toContain("has no structuredContent");
  });

  test("a value that is not a tool result fails with what the matcher needs, even negated", async () => {
    for (const run of [() => expect("Added").toBeToolResult(), () => expect("Added").not.toBeToolResult()]) {
      const message = await failure(run);
      expect(message).toContain("toBeToolResult needs a tool result ({ content, isError? })");
      expect(message).toContain('the string "Added"');
      expect(message).not.toMatch(/Cannot read|undefined is not/);
    }
    expect(await failure(() => expect(null).toBeToolError())).toContain("the call navigated the page away");
    expect(await failure(() => expect({ a: 1 }).toHaveStructuredContent({}))).toContain('an object with keys ["a"]');
  });
});

describe("event matchers", () => {
  const events: AgentEvent[] = [
    { type: "start", tool: "place_order", at: 0 },
    { type: "fill", tool: "place_order", field: "email", value: "sara@example.com" },
    { type: "fill", tool: "place_order", field: "qty", value: "2" },
    { type: "park", tool: "place_order", prompt: "Click Place order to confirm" },
    { type: "yield", reason: "pointer" },
    { type: "result", tool: "place_order", result: "ok", ms: 10 },
  ];

  test("they pass on what happened", () => {
    expect(events).toHaveStarted();
    expect(events).toHaveStarted("place_order");
    expect(events).toHaveFilled("qty", "2");
    expect(events).toHaveFilled("qty", 2);
    expect(events).toHaveFilled("email");
    expect(events).toHaveParked("place_order", /Place order/);
    expect(events).toHaveYielded("pointer");
    expect(events).toHaveEventOrder(["start", "fill", "park", "result"]);
    expect(events).not.toHaveStarted("add_to_cart");
  });

  test("not.toHaveParked says which tool parked and with what prompt", async () => {
    const message = await failure(() => expect(events).not.toHaveParked());
    expect(message).toContain('"place_order" parked with the prompt "Click Place order to confirm"');
  });

  test("toHaveParked lists the events when nothing parked", async () => {
    const message = await failure(() => expect(events.filter((e) => e.type !== "park")).toHaveParked("place_order"));
    expect(message).toContain("but nothing parked");
    expect(message).toContain("1. start place_order");
  });

  test("toHaveFilled names the values the field got", async () => {
    expect(await failure(() => expect(events).toHaveFilled("qty", "3"))).toContain('"qty" was filled with "2", not "3"');
    expect(await failure(() => expect(events).toHaveFilled("name"))).toContain('"name" to be filled, but no fill went into it');
  });

  test("toHaveEventOrder shows the expected and the actual order", async () => {
    const message = await failure(() => expect(events).toHaveEventOrder(["start", "result", "park"]));
    expect(message).toContain("Expected, in order:  start → result → park");
    expect(message).toContain("Happened:           start → fill → fill → park → yield → result");
  });

  test("toHaveYielded and toHaveStarted say what happened", async () => {
    expect(await failure(() => expect(events).toHaveYielded("keyboard"))).toContain('yielded for "pointer", not "keyboard"');
    expect(await failure(() => expect([]).toHaveYielded())).toContain("it never did");
    expect(await failure(() => expect(events).not.toHaveStarted())).toContain("started 1 time(s)");
  });

  test("they read an EventLog too", () => {
    const log = recordEvents();
    log.events.push({ type: "cancel", tool: "x" });
    expect(log.of("cancel")).toHaveLength(1);
    expect(log).not.toHaveStarted();
    log.stop();
  });

  test("a value that is not an event log fails with what the matcher needs", async () => {
    const message = await failure(() => expect({ type: "nope" }).toHaveStarted());
    expect(message).toContain("toHaveStarted needs the events fixture");
    expect(await failure(() => expect(events).toHaveEventOrder("start" as never))).toContain("takes a list of event types");
  });
});

describe("run matchers", () => {
  const run = {
    text: "Back in your cart.",
    steps: [
      { id: "c1", tool: "track_last_order", input: {}, state: "done" as const },
      { id: "c2", tool: "add_to_cart", input: { id: "mug-01", qty: 2 }, state: "done" as const },
      { id: "c3", tool: "place_order", input: { confirm: true }, state: "done" as const },
    ],
    messages: [],
  };

  test("they read a WebAgentResult", () => {
    expect(run).toHaveCalledTool("add_to_cart", { qty: 2 });
    expect(run).toHaveCalledTools(["track_last_order", "add_to_cart", "place_order"]);
    expect(run).not.toHaveCalledTool("delete_everything");
    expect(run).toHaveAnswered(/back in your cart/i);
    expect(run).toHaveAnswered("Back in your cart.");
    expect(run).toHaveFinishedWith("stop");
  });

  test("toHaveCalledTools lists the expected order, the called order, marks the unexpected call and prints its input", async () => {
    const message = await failure(() => expect(run).toHaveCalledTools(["track_last_order", "add_to_cart"]));
    expect(message).toContain("Expected tools, in order:  track_last_order → add_to_cart");
    expect(message).toContain("Called:                    track_last_order → add_to_cart → place_order");
    expect(message).toContain("^ unexpected");
    expect(message).toContain('place_order input: {"confirm":true}');
    // the caret sits under the unexpected call
    const lines = message.split("\n");
    const called = lines.find((l) => l.includes("Called:"))!;
    const caret = lines[lines.indexOf(called) + 1]!;
    expect(called.indexOf("place_order")).toBe(caret.indexOf("^"));
  });

  test("toHaveCalledTools says what is missing", async () => {
    expect(await failure(() => expect(run).toHaveCalledTools(["track_last_order", "add_to_cart", "place_order", "pay"]))).toContain(
      "Missing: pay",
    );
  });

  test("toHaveCalledTool says it was never called, or prints the inputs it got", async () => {
    expect(await failure(() => expect(run).toHaveCalledTool("pay"))).toContain(
      '"pay" to be called, but the WebAgentResult never called it',
    );
    const message = await failure(() => expect(run).toHaveCalledTool("add_to_cart", { qty: 3 }));
    expect(message).toContain('add_to_cart input: {"id":"mug-01","qty":2}');
    expect(await failure(() => expect(run).not.toHaveCalledTool("place_order"))).toContain('place_order input: {"confirm":true}');
  });

  test("toHaveAnswered and toHaveFinishedWith say what happened", async () => {
    expect(await failure(() => expect(run).toHaveAnswered("Done"))).toContain('Answer: "Back in your cart."');
    const message = await failure(() => expect(run).toHaveFinishedWith("max-steps"));
    expect(message).toContain('It ended with "stop", according to the WebAgentResult');
    expect(message).toContain("assert on the mockAdapter");
  });

  test("the error agent.invoke rejected with reads as how the run ended", async () => {
    const err = Object.assign(new Error("Too many requests."), { code: "rate_limited" });
    expect(err).toHaveFinishedWith("error", "rate_limited");
    expect(new DOMException("stopped", "AbortError")).toHaveFinishedWith("aborted");
    expect(await failure(() => expect(err).toHaveFinishedWith("error", "network"))).toContain(
      'It ended with "error" with code "rate_limited" ("Too many requests.")',
    );
    expect(await failure(() => expect(err).toHaveAnswered("x"))).toContain('has no answer: the run ended with "error"');
  });

  test("a value that is not a run fails with what the matcher needs", async () => {
    for (const run of [() => expect("text").toHaveCalledTools([]), () => expect("text").not.toHaveCalledTools([])]) {
      expect(await failure(run)).toContain("toHaveCalledTools needs a run: the WebAgentResult agent.invoke resolved to, a mockAdapter");
    }
    expect(await failure(() => expect({ events: [] }).toHaveAnswered("x"))).toContain("toHaveAnswered needs a run");
    expect(await failure(() => expect(run).toHaveFinishedWith("done" as never))).toContain('takes one of "stop", "max-steps"');
    expect(await failure(() => expect(run).toHaveBeenOfferedTools(["x"]))).toContain("toHaveBeenOfferedTools needs a mockAdapter");
  });

  test("they read a mockAdapter, and toHaveBeenOfferedTools checks every step", async () => {
    const adapter = mockAdapter([toolCall("add_to_cart", { qty: 2 }), text("Added.")]);
    const tools = [
      { name: "add_to_cart", description: "", inputSchema: {} },
      { name: "search", description: "", inputSchema: {} },
    ];
    const callTool = vi.fn(async () => ok("ok"));
    for await (const _ of adapter.run({ messages: [], tools, signal: new AbortController().signal, callTool }));
    expect(adapter).toHaveCalledTools(["add_to_cart"]);
    expect(adapter).toHaveAnswered("Added.");
    expect(adapter).toHaveFinishedWith("stop");
    expect(adapter).toHaveBeenOfferedTools(["add_to_cart"]);
    expect(adapter).toHaveBeenOfferedTools(expect.not.arrayContaining(["place_order"]));
    const message = await failure(() => expect(adapter).toHaveBeenOfferedTools(["place_order"]));
    expect(message).toContain("Model step 1 of 2 was offered: add_to_cart, search");
    expect(message).toContain("Missing: place_order");
    expect(await failure(() => expect(mockAdapter([])).toHaveBeenOfferedTools(["x"]))).toContain("has not run");
  });
});

describe("toContainSensitive", () => {
  test("names the sink, the event and the path, and prints nothing else", async () => {
    const events: AgentEvent[] = [
      { type: "start", tool: "fill_traveler", at: 0, args: { fullName: "Sara", passport: "A1234567" } },
      { type: "fill", tool: "fill_traveler", field: "passport", value: "A1234567" },
    ];
    const message = await failure(() => expect(events).not.toContainSensitive(["A1234567"]));
    expect(message).toContain("Found in the event log:");
    expect(message).toContain('"A1234567" at events[0].args.passport (event: start fill_traveler)');
    expect(message).toContain('"A1234567" at events[1].value (event: fill passport = "…" (fill_traveler))');
    expect(message).not.toContain("Sara");
    expect(events.filter((e) => e.type === "start")).not.toContainSensitive(["4242"]);
  });

  test("reads a console spy, a plain value, a mock adapter and a Response", async () => {
    const spy = vi.fn().mockName("console.error");
    spy("[web-agents] failed", { card: "4242 4242 4242 4242" });
    expect(await failure(() => expect(spy).not.toContainSensitive([/4242 \d{4}/]))).toContain(
      'Found in the spy "console.error":\n  - /4242 \\d{4}/ at calls[0][1].card',
    );
    expect({ nested: [{ token: "sk-test" }] }).toContainSensitive(["sk-test"]);
    expect(await failure(() => expect({ a: "x" }).toContainSensitive(["y"]))).toContain(
      'Expected the value to contain one of "y", but none is in it',
    );

    const adapter = mockAdapter([text("ok")]);
    for await (const _ of adapter.run({
      messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "passport A1234567" }] }],
      tools: [],
      signal: new AbortController().signal,
      callTool: async () => ok(""),
    }));
    expect(await failure(() => expect(adapter).not.toContainSensitive(["A1234567"]))).toContain(
      'Found in the mock adapter:\n  - "A1234567" at requests[0].messages[0].parts[0].text',
    );

    const res = new Response(JSON.stringify({ error: "bad key sk-live-123" }), { status: 500 });
    expect(await failure(() => expect(res).not.toContainSensitive(["sk-live-123"]))).toContain(
      'Found in the Response body (status 500):\n  - "sk-live-123" at body.error',
    );
    await expect(new Response("plain text")).not.toContainSensitive(["secret"]);
  });

  test("wrong arguments fail with a sentence", async () => {
    expect(await failure(() => expect({}).not.toContainSensitive([]))).toContain("takes a non-empty list");
    expect(await failure(() => expect(undefined).not.toContainSensitive(["x"]))).toContain("needs a sink to look in");
  });
});

describe("matcher types", () => {
  test("a misspelled matcher is a type error", () => {
    // @ts-expect-error: not a matcher
    expect(() => expect(ok("x")).toBeToolResutl()).toThrow();
  });
});

describe("run matchers on a RunLog (the runs fixture)", () => {
  const ref = (run: string, parent?: string) => ({ conversation: "c1", run, ...(parent ? { parent } : {}) });
  /** A log as `recordRuns` makes it, from events written by hand. */
  function log(events: AgentRunEvent[]): RunLog {
    return {
      [RUN_LOG]: true,
      events,
      types: () => events.map((e) => e.type),
      of: (run) => events.filter((e) => e.ref.run === run),
      runIds: () => [],
      clear: () => {},
      stop: () => {},
    } as RunLog;
  }
  const run = (reason: "stop" | "max-steps" | "aborted" | "error", extra: Partial<AgentRunEvent> = {}): AgentRunEvent[] => [
    { type: "run-start", ref: ref("r1"), adapter: "mock", at: 0 },
    { type: "tool-start", ref: ref("r1"), step: 1, call: "d1", tool: "delegate_to_helper", at: 1, input: { task: "find" } },
    { type: "run-start", ref: ref("r2", "d1"), agent: "helper", adapter: "mock", at: 2 },
    { type: "tool-start", ref: ref("r2", "d1"), step: 1, call: "c1", tool: "search", at: 3, input: { q: "mugs" } },
    { type: "run-finish", ref: ref("r2", "d1"), reason: "stop", ms: 1, steps: 1 },
    { type: "run-finish", ref: ref("r1"), reason, ms: 5, steps: 2, ...(extra as object) } as AgentRunEvent,
  ];

  test("calls, in order, with the sub-agent that made each", () => {
    expect(log(run("stop"))).toHaveCalledTools(["delegate_to_helper", "search"]);
    expect(log(run("stop"))).toHaveCalledTool("search", { q: "mugs" });
  });

  test("tells max-steps from stop (a WebAgentResult cannot), and reads an error's code", async () => {
    expect(log(run("max-steps"))).toHaveFinishedWith("max-steps");
    expect(await failure(() => expect(log(run("max-steps"))).toHaveFinishedWith("stop"))).toContain('It ended with "max-steps"');
    expect(log(run("error", { code: "rate_limited", error: "Too many." } as never))).toHaveFinishedWith("error", "rate_limited");
  });

  test("a sub-agent's run-finish is not the run's", async () => {
    const events = run("stop").slice(0, 5); // the top-level run has not finished
    expect(await failure(() => expect(log(events)).toHaveFinishedWith("stop"))).toContain("nothing yet: no run finished");
  });

  test("toHaveAnswered says a RunLog has no answer text", async () => {
    expect(await failure(() => expect(log(run("stop"))).toHaveAnswered("x"))).toContain("run events carry no answer text");
  });

  test("toContainSensitive names the run log and the event", async () => {
    const message = await failure(() => expect(log(run("stop"))).not.toContainSensitive(["mugs"]));
    expect(message).toContain("Found in the run log");
    expect(message).toContain("tool-start search");
  });
});

describe("a mockAdapter's runs: the matchers read its last top-level run", () => {
  const tools = [{ name: "add_to_cart", description: "", inputSchema: {} }];
  async function play(adapter: ReturnType<typeof mockAdapter>, callTool = vi.fn(async () => ok("ok")), ref?: object) {
    for await (const _ of adapter.run({
      messages: [],
      tools,
      signal: new AbortController().signal,
      callTool,
      ...(ref ? { ref } : {}),
    } as never));
  }

  test("a later run that failed has no answer: an earlier run's text is not it", async () => {
    const adapter = mockAdapter([text("Done."), fail("rate_limited")]);
    await play(adapter);
    await play(adapter);
    expect(await failure(() => expect(adapter).toHaveAnswered("Done."))).toContain('has no answer: the run ended with "error"');
    expect(adapter).toHaveFinishedWith("error", "rate_limited");
  });

  test("a sub-agent's run on the same adapter is not the run: the parent's failure is", async () => {
    const adapter = mockAdapter([toolCall("delegate_to_helper"), text("Found two mugs."), fail("rate_limited")]);
    // the parent's delegate call runs the sub-agent on the same adapter, under the call (ref.parent)
    const delegate = vi.fn(async () => {
      await play(adapter, undefined, { conversation: "c1", run: "r2", parent: "d1" });
      return ok("Found two mugs.");
    });
    await play(adapter, delegate, { conversation: "c1", run: "r1" });
    expect(delegate).toHaveBeenCalledOnce();
    expect(adapter).toHaveFinishedWith("error", "rate_limited");
    expect(await failure(() => expect(adapter).toHaveAnswered("Found two mugs."))).toContain("has no answer");
  });

  test("the error agent.invoke rejected with carries no calls: the call matchers refuse it, negated too", async () => {
    const err = Object.assign(new Error("Too many requests."), { code: "rate_limited" });
    for (const assertion of [
      () => expect(err).toHaveCalledTool("place_order"),
      () => expect(err).not.toHaveCalledTool("place_order"),
      () => expect(err).toHaveCalledTools([]),
      () => expect(err).not.toHaveCalledTools(["place_order"]),
    ]) {
      expect(await failure(assertion)).toContain("the error carries no calls. Assert on the mockAdapter or the runs log.");
    }
  });
});

describe("toHaveBeenOfferedTools, negated", () => {
  const tools = (...names: string[]) => names.map((name) => ({ name, description: "", inputSchema: {} }));
  async function twoSteps() {
    const adapter = mockAdapter([toolCall("add_to_cart"), text("Added.")]);
    const callTool = vi.fn(async () => ok("ok"));
    const run = {
      messages: [],
      // step 1 (before its call ran) is offered place_order, step 2 is not
      get tools() {
        return callTool.mock.calls.length ? tools("add_to_cart") : tools("add_to_cart", "place_order");
      },
      signal: new AbortController().signal,
      callTool,
    };
    for await (const _ of adapter.run(run as never));
    return adapter;
  }

  test("with a list it refuses to run, and points at the asymmetric form", async () => {
    const adapter = await twoSteps();
    const message = await failure(() => expect(adapter).not.toHaveBeenOfferedTools(["place_order"]));
    expect(message).toContain('toHaveBeenOfferedTools(expect.not.arrayContaining(["place_order"]))');
    // the asymmetric form sees the step that was offered it
    expect(await failure(() => expect(adapter).toHaveBeenOfferedTools(expect.not.arrayContaining(["place_order"])))).toContain(
      "Model step 1 of 2 was offered: add_to_cart, place_order",
    );
  });

  test("an adapter that has not run fails either way", async () => {
    expect(await failure(() => expect(mockAdapter([])).toHaveBeenOfferedTools(expect.anything()))).toContain("has not run");
    expect(await failure(() => expect(mockAdapter([])).not.toHaveBeenOfferedTools(expect.anything()))).toContain("has not run");
  });
});

describe("toContainSensitive reads what Object.entries misses", () => {
  test("URL, Request, Headers, URLSearchParams and FormData", async () => {
    expect(new URL("https://shop.example/?token=sk-test")).toContainSensitive(["sk-test"]);
    const request = new Request("https://shop.example/api", { headers: { authorization: "Bearer sk-test" } });
    expect(await failure(() => expect({ request }).not.toContainSensitive(["sk-test"]))).toContain(
      'value.request.headers.get("authorization")',
    );
    expect(new Request("https://shop.example/?key=sk-test")).toContainSensitive(["sk-test"]);
    expect(new Headers({ "x-key": "sk-test" })).toContainSensitive(["sk-test"]);
    expect(new URLSearchParams({ passport: "A1234567" })).toContainSensitive(["A1234567"]);
    const form = new FormData();
    form.set("passport", "A1234567");
    expect(form).toContainSensitive(["A1234567"]);
    expect(new Headers({ a: "b" })).not.toContainSensitive(["sk-test"]);
  });

  test("an Error's cause and own properties, not only its message", async () => {
    const err = Object.assign(new Error("Failed.", { cause: { token: "sk-test" } }), { body: { passport: "A1234567" } });
    expect(await failure(() => expect(err).not.toContainSensitive(["sk-test"]))).toContain("value.cause.token");
    expect(await failure(() => expect(err).not.toContainSensitive(["A1234567"]))).toContain("value.body.passport");
  });

  test("a value nested deeper than it reads is not claimed absent", async () => {
    let deep: Record<string, unknown> = { token: "sk-test" };
    for (let i = 0; i < 30; i++) deep = { next: deep };
    const message = await failure(() => expect(deep).not.toContainSensitive(["A1234567"]));
    expect(message).toContain("could not read all of the value: it stops 24 levels down, at value.next");
    // a value found above the limit still answers
    expect({ token: "A1234567", deep }).toContainSensitive(["A1234567"]);
  });

  test("a /g RegExp matches every time (its lastIndex is reset)", async () => {
    const key = /sk-\w+/g;
    expect({ a: "sk-test" }).toContainSensitive([key]);
    expect({ a: "sk-test" }).toContainSensitive([key]);
    expect(await failure(() => expect({ a: "sk-test" }).not.toContainSensitive([key]))).toContain("Found in the value");
    const answer = /mugs/g;
    const run = { text: "Two mugs.", steps: [], messages: [] };
    expect(run).toHaveAnswered(answer);
    expect(run).toHaveAnswered(answer);
  });
});
