import { createWebAgents, defineWebTool, installAgentVisuals, toolError, type WebAgents } from "@webmcp-agents/core";
import { describe, expect, vi } from "vitest";
import { beginTest, endTest } from "../src/guard";
import { cursorVisible, fixture } from "../src/helpers/dom";
import { echoForm, toolForm } from "../src/helpers/forms";
import { callTool, modelContext, toolNames } from "../src/helpers/tools";
import { until } from "../src/helpers/wait";
import { nextId } from "../src/ids";
import { test } from "../src/test";

describe("fixtures arrive by destructuring and leave after the test", () => {
  test("tools.mock is a spy: toHaveBeenCalledWith, mockResolvedValueOnce", async ({ tools }) => {
    const add = tools.mock("add_to_cart", async ({ qty }) => `Added ${qty}`);
    expect(await tools.list()).toContain("add_to_cart");
    expect(await tools.call("add_to_cart", { qty: 2 })).toBeToolResult("Added 2");
    expect(add).toHaveBeenCalledWith({ qty: 2 }, expect.anything());
    add.mockResolvedValueOnce(toolError("unavailable", "Only 1 left."));
    expect(await tools.call("add_to_cart", { qty: 2 })).toBeToolError("unavailable");
    expect(await tools.call("add_to_cart", { qty: 1 })).toBeToolResult("Added 1");
  });

  test("the mock from the last test is gone", async ({ tools }) => {
    expect(await tools.list()).not.toContain("add_to_cart");
  });

  test("events, mount and a declarative form", async ({ tools, events, mount }) => {
    mount(
      '<form toolname="add_mugs" tooldescription="Add mugs" toolautosubmit><input name="qty" type="number"><button>Add</button></form>',
    );
    const form = document.querySelector<HTMLFormElement>('form[toolname="add_mugs"]')!;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      e.agentInvoked && e.respondWith?.(Promise.resolve(`Added ${new FormData(form).get("qty")}`));
    });
    const visuals = installAgentVisuals();
    try {
      await until(async () => (await tools.list()).includes("add_mugs"), { label: "the form's tool" });
      expect(await tools.call("add_mugs", { qty: 2 })).toBeToolResult("Added 2");
      expect(events).toHaveStarted("add_mugs");
      expect(events).toHaveFilled("qty", "2");
      expect(events).toHaveEventOrder(["start", "fill", "result"]);
      expect(events).not.toHaveParked();
    } finally {
      visuals.destroy();
    }
  });

  test("mount renders React, and unmounts it after the test", async ({ mount }) => {
    const root = mount(<p className="greeting">Hello</p>);
    expect(root.querySelector(".greeting")?.textContent).toBe("Hello");
  });

  test("the React root from the last test is gone", () => {
    expect(document.querySelector(".greeting")).toBeNull();
  });

  test("user confirms a parked form and moves on from another", async ({ events, user, tools }) => {
    const visuals = installAgentVisuals();
    try {
      toolForm("place_order", { autosubmit: false, submit: "Place order", answer: "Order placed." });
      await until(async () => (await tools.list()).includes("place_order"));
      const call = tools.call("place_order", { qty: 1 });
      await expect.poll(() => events).toHaveParked("place_order");
      await user.confirm("Place order");
      expect(await call).toBeToolResult("Order placed.");
    } finally {
      visuals.destroy();
    }
  });

  test("user.confirm says when nothing is waiting", async ({ user }) => {
    await expect(user.confirm()).rejects.toThrow("no control is waiting for the person");
    await expect(user.confirm("Pay")).rejects.toThrow('no button or link named "Pay"');
  });

  test("redactor: a fresh page redactor", ({ redactor }) => {
    expect(redactor({ password: "hunter2" })).toEqual({ password: "[REDACTED]" });
  });
});

describe("tests do not see each other", () => {
  for (const n of [1, 2]) {
    test(`test ${n} mounts a page and calls a tool of the same name`, async ({ tools, events, mount }) => {
      expect(document.querySelectorAll(".test-fixture")).toHaveLength(0);
      expect(events.events).toHaveLength(0);
      mount(`<p id="mine">${n}</p>`);
      tools.mock("same_name", async () => `answer ${n}`);
      expect(await tools.call("same_name")).toBeToolResult(`answer ${n}`);
      expect((await tools.list()).filter((t) => t === "same_name")).toHaveLength(1);
      expect(document.querySelectorAll("#mine")).toHaveLength(1);
    });
  }
});

describe("storage starts empty", () => {
  for (const n of [1, 2]) {
    test(`test ${n} finds no conversation the last test saved`, () => {
      expect(sessionStorage.getItem("web-agents:chat")).toBeNull();
      expect(localStorage.length).toBe(0);
      sessionStorage.setItem("web-agents:chat", `conversation ${n}`);
      localStorage.setItem("kept", `${n}`);
    });
  }
});

describe("ids are predictable", () => {
  const seen: string[][] = [];
  for (const n of [1, 2]) {
    test(`run ${n}`, () => {
      seen.push([nextId("u"), nextId("a"), nextId("call"), nextId("call")]);
      if (n === 2) expect(seen[1]).toEqual(seen[0]);
      expect(seen[0]).toEqual(["u-1", "a-1", "call-1", "call-2"]);
    });
  }
});

describe("the setup", () => {
  test("installs the polyfill and reduces motion", () => {
    expect(document.modelContext).toBeDefined();
    expect(matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
  });

  test("a call left in flight fails the test, naming the tool, and is cancelled", async () => {
    const mc = modelContext();
    const controller = new AbortController();
    let cancelled = false;
    let started = false;
    mc.registerTool(
      {
        name: "never_answers",
        description: "Waits forever.",
        inputSchema: { type: "object", properties: {} },
        execute: (_args, { signal }) =>
          new Promise((_, reject) => {
            started = true;
            signal.addEventListener("abort", () => {
              cancelled = true;
              reject(signal.reason);
            });
          }),
      },
      { signal: controller.signal },
    );
    const call = callTool("never_answers", { reason: "test" }).catch((e: unknown) => e);
    await until(() => started, { label: "the call to start" });
    const problems = await endTest();
    expect(problems).toEqual([
      'The test ended while a call to the tool "never_answers" was still running (input {"reason":"test"}). Await the call, or cancel it with an AbortSignal, before the test ends.',
      expect.stringContaining('The test left the tool "never_answers" registered.'),
    ]);
    expect(((await call) as Error).name).toBe("AbortError");
    expect(cancelled).toBe(true);
    expect(await toolNames()).not.toContain("never_answers");
    await beginTest(); // the setup checks this test again after it: nothing left
  });

  test("a tool left registered fails the test, naming the tool, and is removed", async () => {
    modelContext().registerTool({
      name: "left_behind",
      description: "x",
      inputSchema: { type: "object", properties: {} },
      execute: () => "ok",
    });
    const problems = await endTest();
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('The test left the tool "left_behind" registered. Unregister it before the test ends');
    expect(await toolNames()).not.toContain("left_behind");
    await beginTest();
  });

  test("a tool released with a delay (a provider unmounting) is waited for, not reported", async () => {
    const controller = new AbortController();
    modelContext().registerTool(
      { name: "released_later", description: "x", inputSchema: { type: "object", properties: {} }, execute: () => "ok" },
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 300);
    expect(await endTest()).toEqual([]);
    await beginTest();
  });

  test("a tool a beforeAll registered is the file's, not the test's", async () => {
    // registered "before the test": beginTest snapshots it
    const controller = new AbortController();
    modelContext().registerTool(
      { name: "file_tool", description: "x", inputSchema: { type: "object", properties: {} }, execute: () => "ok" },
      { signal: controller.signal },
    );
    await beginTest();
    expect(await endTest()).toEqual([]);
    controller.abort();
    await until(async () => !(await toolNames()).includes("file_tool"));
    await beginTest();
  });
});

describe("an agent, without a model", () => {
  test("a scripted run calls the page's tools in order, answers, and makes no request", async () => {
    const { defineWebAgent } = await import("@webmcp-agents/chat");
    const { mockAdapter, text, toolCall } = await import("../src/chat");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const order: string[] = [];
    toolForm("track_last_order", {
      fields: "",
      answer: () => {
        order.push("track_last_order");
        return "Mug, 2.";
      },
    });
    echoForm("add_to_cart");
    document.querySelector('form[toolname="add_to_cart"]')!.addEventListener("submit", () => order.push("add_to_cart"));
    await until(async () => (await toolNames()).includes("add_to_cart"));
    const store = defineWebAgent({ id: "store", instructions: "Reorder things." });
    const adapter = mockAdapter([toolCall("track_last_order"), toolCall("add_to_cart", { word: "mug" }), text("Back in your cart.")]);

    const run = await store.invoke("Reorder my last purchase.", { adapter });

    expect(order).toEqual(["track_last_order", "add_to_cart"]);
    expect(run).toHaveCalledTools(["track_last_order", "add_to_cart"]);
    expect(run).toHaveCalledTool("add_to_cart", { word: "mug" });
    expect(run).toHaveAnswered("Back in your cart.");
    expect(run).toHaveFinishedWith("stop");
    expect(adapter).toHaveBeenOfferedTools(["track_last_order", "add_to_cart"]);
    expect(run.steps[1]!.output).toBeToolResult("ok: mug");
    expect(fetchSpy).not.toHaveBeenCalled();
    // ids made under the setup are deterministic
    expect(run.messages[0]!.id).toBe("u-1");
    fetchSpy.mockRestore();
  });

  test("a scripted failure: the run finishes with that error code", async () => {
    const { defineWebAgent } = await import("@webmcp-agents/chat");
    const { fail, mockAdapter } = await import("../src/chat");
    const adapter = mockAdapter([fail("rate_limited")]);
    const error = await defineWebAgent({ id: "store", instructions: "x" })
      .invoke("hi", { adapter })
      .catch((e: unknown) => e);
    expect(error).toHaveFinishedWith("error", "rate_limited");
    expect(adapter).toHaveFinishedWith("error", "rate_limited");
  });
});

describe("cursor helpers", () => {
  test("cursorVisible is false with no visuals; fixture() mounts markup", () => {
    expect(cursorVisible()).toBe(false);
    expect(fixture("<b>x</b>").querySelector("b")?.textContent).toBe("x");
  });

  test("createWebAgents' tools register and are removed when it stops", async ({ tools }) => {
    const greet = defineWebTool({ id: "greet", description: "Say hello.", execute: async () => "hello" });
    let agents: WebAgents | undefined;
    try {
      agents = createWebAgents({ tools: [greet], visuals: false, polyfill: false });
      await until(async () => (await tools.list()).includes("greet"));
      expect(await tools.call(greet)).toBeToolResult("hello");
    } finally {
      agents?.destroy();
    }
  });
});
