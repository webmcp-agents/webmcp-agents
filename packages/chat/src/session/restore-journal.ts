/**
 * In-memory fill journal for chat restore: maps each tool call id to the fields
 * the cursor typed during that call, so restore can write the prior values back.
 * Controls are live DOM nodes — not kept in sessionStorage; after a reload, fill
 * reverse is skipped and only tool `revert` (when present) still runs.
 */
import {
  type FieldControl,
  type FieldValue,
  getRegisteredWebTool,
  onAgentEvent,
  writeControl,
} from "@webmcp-agents/core";
import type { AgentMessage, AgentPart, ToolOutput } from "../types";
import { allToolParts } from "./reducer";

/** One field the agent typed during a call. */
export interface JournalFill {
  field: string;
  from: FieldValue;
  value: FieldValue;
  control: FieldControl;
}

/** What `session.restore` returns for the UI and tests. */
export interface RestoreResult {
  /** The dropped user message's text, for the composer. */
  restoredText: string;
  /** Tool names whose `revert` ran. */
  reverted: string[];
  /** Done tool names with no `revert` (fills may still have been restored). */
  skipped: string[];
  /** True when a page checkpoint ran (`applySnapshot` or default URL restore). */
  snapshotApplied: boolean;
}

type ToolPart = Extract<AgentPart, { type: "tool" }>;

/** Live fill map for one chat session. */
export class RestoreJournal {
  private readonly fills = new Map<string, JournalFill[]>();
  /** Newest open call id per tool name (fills arrive by name only). */
  private readonly open = new Map<string, string>();

  /** A stream `tool-call` started: later fills for `name` attach to `callId`. */
  beginCall(callId: string, name: string): void {
    this.open.set(name, callId);
    if (!this.fills.has(callId)) this.fills.set(callId, []);
  }

  /** The call finished or was cancelled: stop attaching fills to it. */
  endCall(callId: string, name: string): void {
    if (this.open.get(name) === callId) this.open.delete(name);
  }

  /** Record a fill for the open call of `tool`, when `from` and `control` are known. */
  recordFill(tool: string, fill: Omit<JournalFill, "control"> & { control?: FieldControl }): void {
    const callId = this.open.get(tool);
    if (!callId || fill.control == null || fill.from === undefined) return;
    const list = this.fills.get(callId) ?? [];
    list.push({ field: fill.field, from: fill.from, value: fill.value, control: fill.control });
    this.fills.set(callId, list);
  }

  /** Fills for `callId` (empty after reload or when none were typed). */
  fillsFor(callId: string): readonly JournalFill[] {
    return this.fills.get(callId) ?? [];
  }

  /** Drop journal entries for calls that are leaving the conversation. */
  forget(callIds: Iterable<string>): void {
    for (const id of callIds) {
      this.fills.delete(id);
      for (const [name, openId] of this.open) if (openId === id) this.open.delete(name);
    }
  }

  /** Clear everything (New chat). */
  clear(): void {
    this.fills.clear();
    this.open.clear();
  }
}

/** Subscribe the journal to cursor fill events. Returns an unsubscribe. */
export function bindRestoreJournal(journal: RestoreJournal): () => void {
  return onAgentEvent((e) => {
    if (e.type !== "fill") return;
    journal.recordFill(e.tool, { field: e.field, from: e.from!, value: e.value, control: e.control });
  });
}

/** Text of every text part on a user message. */
export function messageText(message: AgentMessage): string {
  return message.parts
    .filter((p): p is Extract<AgentPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** Done tool parts in `messages` from `beforeId` onward (that user turn and after), document order. */
export function doneToolsAfter(messages: readonly AgentMessage[], beforeId: string): ToolPart[] {
  const idx = messages.findIndex((m) => m.id === beforeId);
  if (idx === -1) return [];
  return allToolParts(messages.slice(idx)).filter((p) => p.state === "done");
}

/** Best-effort execute return from an MCP tool result (for `revert`'s `output`). */
export function outputValue(output?: ToolOutput): unknown {
  if (!output) return undefined;
  const text = output.content.find((c) => c.type === "text")?.text;
  if (text == null) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** Write prior field values back for completed calls (newest call / newest field first). */
export function reverseFills(parts: readonly ToolPart[], journal: RestoreJournal): void {
  for (const part of [...parts].reverse()) {
    for (const f of [...journal.fillsFor(part.id)].reverse()) {
      if (f.control.isConnected) writeControl(f.control, f.from);
    }
  }
}

/**
 * Reverse page side effects for completed calls newest-first: restore fills, then
 * each tool's optional `revert`. Mutates nothing about the message list.
 * Prefer this only when no `applySnapshot` is available; otherwise restore fills and
 * let the checkpoint rehydrate the page (avoids `history.back` fighting `navigate`).
 */
export async function reverseToolCalls(
  parts: readonly ToolPart[],
  journal: RestoreJournal,
): Promise<{ reverted: string[]; skipped: string[] }> {
  const reverted: string[] = [];
  const skipped: string[] = [];
  const newestFirst = [...parts].reverse();
  for (const part of newestFirst) {
    const fills = [...journal.fillsFor(part.id)].reverse();
    for (const f of fills) {
      if (f.control.isConnected) writeControl(f.control, f.from);
    }
    const tool = getRegisteredWebTool(part.name);
    if (!tool?.revert) {
      skipped.push(part.name);
      continue;
    }
    try {
      await tool.revert(part.input, {
        signal: new AbortController().signal,
        source: "chat",
        toolCallId: part.id,
        output: outputValue(part.output),
      });
      reverted.push(part.name);
    } catch (err) {
      console.error(`[web-agents] revert for "${part.name}" threw`, err);
      skipped.push(part.name);
    }
  }
  return { reverted, skipped };
}
