import { defineWebTool, registerWebTool, writeControl } from "@webmcp-agents/core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { RestoreJournal, reverseToolCalls } from "../src/session/restore-journal";
import { cleanupFixtures, fixture, modelContext, uniqueName } from "./browser-utils";

describe("reverseToolCalls", () => {
  const handles: Array<() => void> = [];
  beforeAll(() => modelContext());
  afterEach(() => {
    cleanupFixtures();
    for (const u of handles.splice(0)) u();
  });

  it("restores fills then calls revert newest-first with input and output", async () => {
    const order: string[] = [];
    const id = uniqueName("mut");
    handles.push(
      registerWebTool(
        defineWebTool({
          id,
          description: "Mutates.",
          execute: () => "done",
          revert: (input, ctx) => {
            order.push(`revert:${JSON.stringify(input)}:${String(ctx.output)}`);
          },
        }),
      ),
    );

    const input = fixture(`<input name="name" value="Ada" />`).querySelector("input")!;
    writeControl(input, "Bob");
    expect(input.value).toBe("Bob");

    const journal = new RestoreJournal();
    journal.beginCall("c2", id);
    journal.recordFill(id, { field: "name", from: "Ada", value: "Bob", control: input });
    journal.endCall("c2", id);

    const { reverted, skipped } = await reverseToolCalls(
      [
        {
          type: "tool",
          id: "c1",
          name: id,
          input: { n: 1 },
          state: "done",
          output: { content: [{ type: "text", text: '"first"' }] },
        },
        {
          type: "tool",
          id: "c2",
          name: id,
          input: { n: 2 },
          state: "done",
          output: { content: [{ type: "text", text: '"second"' }] },
        },
      ],
      journal,
    );

    expect(input.value).toBe("Ada");
    expect(order).toEqual([`revert:{"n":2}:second`, `revert:{"n":1}:first`]);
    expect(reverted).toEqual([id, id]);
    expect(skipped).toEqual([]);
  });

  it("skips tools without revert", async () => {
    const id = uniqueName("ro");
    handles.push(
      registerWebTool(
        defineWebTool({
          id,
          description: "Reads.",
          readOnly: true,
          execute: () => "ok",
        }),
      ),
    );
    const { reverted, skipped } = await reverseToolCalls(
      [{ type: "tool", id: "c1", name: id, input: {}, state: "done", output: { content: [{ type: "text", text: "ok" }] } }],
      new RestoreJournal(),
    );
    expect(reverted).toEqual([]);
    expect(skipped).toEqual([id]);
  });
});
