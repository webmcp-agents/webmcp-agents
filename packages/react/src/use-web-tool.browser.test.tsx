import { defineWebTool } from "@webmcp-agents/core";
import { StrictMode, useMemo, useState } from "react";
import { userEvent } from "vitest/browser";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { WebAgentsProvider } from "./provider";
import { countToolChanges, modelContext, resultText, sleep, toolNames, uniqueName, until } from "@webmcp-agents/testing";
import { useWebTool } from "./use-web-tool";

function Counter({ id, description = "Read the counter", enabled = true }: { id: string; description?: string; enabled?: boolean }) {
  const [count, setCount] = useState(0);
  // A new tool object every render on purpose: registration must follow the definition, not the identity.
  const tool = defineWebTool({ id, description, execute: async () => `count is ${count}` });
  const { registered } = useWebTool(tool, { enabled });
  return (
    <button type="button" data-registered={registered} onClick={() => setCount((n) => n + 1)}>
      Increment
    </button>
  );
}

function SelfDisabling({ id }: { id: string }) {
  const [items, setItems] = useState(3);
  const tool = useMemo(
    () =>
      defineWebTool({
        id,
        description: "Empty",
        execute: () => {
          setItems(0);
          return "emptied";
        },
      }),
    [id],
  );
  useWebTool(tool, { enabled: items > 0 });
  return null;
}

function ClearButton({ id, onClick }: { id: string; onClick: () => void }) {
  const [items, setItems] = useState(3);
  const tool = useMemo(
    () =>
      defineWebTool({
        id,
        description: "Clear",
        requireConfirmation: true,
        execute: () => {
          setItems(0);
          return "cleared";
        },
      }),
    [id],
  );
  useWebTool(tool);
  return (
    <button type="button" toolname={id} onClick={onClick}>
      Clear {items}
    </button>
  );
}

describe("useWebTool", () => {
  beforeAll(() => modelContext());
  afterEach(() => sleep(20));

  it("always runs the latest render's execute, without re-registering", async () => {
    const id = uniqueName("w_count");
    const changes = countToolChanges();
    const screen = await render(
      <StrictMode>
        <Counter id={id} />
      </StrictMode>,
    );
    await sleep(20);
    expect(changes.count()).toBe(1);
    await screen.getByRole("button").click();
    await screen.getByRole("button").click();
    expect(resultText(await modelContext().executeTool(id, {}))).toBe("count is 2");
    expect(changes.count()).toBe(1);
    changes.stop();
    await expect.element(screen.getByRole("button")).toHaveAttribute("data-registered", "true");
    await screen.unmount();
    await until(async () => !(await toolNames()).includes(id), 1500, "release after the answer grace");
  });

  it("re-registers exactly once when the description changes", async () => {
    const id = uniqueName("w_desc");
    const screen = await render(<Counter id={id} />);
    const changes = countToolChanges();
    await screen.rerender(<Counter id={id} description="Read the counter value" />);
    await sleep(20);
    changes.stop();
    expect(changes.count()).toBe(2); // unregister + register
    expect((await modelContext().getTools()).find((t) => t.name === id)?.description).toBe("Read the counter value");
    await screen.unmount();
  });

  it("stays unregistered while enabled is false", async () => {
    const id = uniqueName("w_off");
    const screen = await render(<Counter id={id} enabled={false} />);
    await sleep(20);
    expect(await toolNames()).not.toContain(id);
    await expect.element(screen.getByRole("button")).toHaveAttribute("data-registered", "false");
    await screen.unmount();
  });

  it("keeps a tool that disables itself until its call is answered", async () => {
    const id = uniqueName("w_self");
    const screen = await render(<SelfDisabling id={id} />);
    expect(resultText(await modelContext().executeTool(id, {}))).toBe("emptied");
    await sleep(100);
    expect(await toolNames()).toContain(id); // within the answer grace
    await sleep(1000);
    expect(await toolNames()).not.toContain(id);
    await screen.unmount();
  });

  it("with requireConfirmation, runs only after the user clicks the target, and only once", async () => {
    const id = uniqueName("w_clear");
    const onClick = vi.fn();
    const screen = await render(
      <WebAgentsProvider visuals={{ linger: 50, yieldToUser: false }}>
        <ClearButton id={id} onClick={onClick} />
      </WebAgentsProvider>,
    );
    let settled = false;
    const call = modelContext()
      .executeTool(id, {})
      .finally(() => (settled = true));
    await sleep(300);
    expect(settled).toBe(false);
    await userEvent.click(screen.getByRole("button"));
    expect(resultText(await call)).toBe("cleared");
    await expect.element(screen.getByRole("button")).toHaveTextContent("Clear 0");
    expect(onClick).not.toHaveBeenCalled();
    await screen.unmount();
  });
});
