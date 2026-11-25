"use client";
/**
 * A WebMCP tool call as shadcn/ui's Tool pattern (a Trace line with its input and output). One state the AI SDK has
 * no word for: a call **parked on the page**, waiting for the person's own click (an order, a booking). It renders as
 * an Item without approve/deny buttons: the click happens on the page, not in the chat, so a script can never confirm
 * on the person's behalf.
 */
import { redactToolCall, type ToolPhase } from "@webmcp-agents/chat";
import type { UIMessage } from "ai";
import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";

export type AgentToolPart = Extract<UIMessage["parts"][number], { type: "dynamic-tool" }>;

/** `add_to_cart` → "add to cart". */
export const toolWords = (name: string): string => name.replace(/[_.-]+/g, " ").trim();

const outputText = (output: unknown): string => {
  const content = (output as { content?: { type: string; text?: string }[] } | undefined)?.content;
  return content ? content.map((c) => (c.type === "text" ? (c.text ?? "") : "")).join("\n") : JSON.stringify(output, null, 2);
};

export function AgentTool({ part, phase }: { part: AgentToolPart; phase?: ToolPhase }) {
  const words = toolWords(part.toolName);
  const state = phase?.phase ?? (part.state === "output-available" ? "done" : part.state === "output-error" ? "error" : "running");
  const title =
    state === "running"
      ? `Running ${words}…`
      : state === "parked"
        ? `Waiting for you: ${words}`
        : state === "done"
          ? `Ran ${words}`
          : state === "cancelled"
            ? `Cancelled ${words}`
            : `Failed to run ${words}`;
  const status = state === "running" ? "running" : state === "error" ? "error" : state === "cancelled" ? "pending" : undefined;
  // as the person sees it: the page's redaction rules and the tool's `sensitive` fields applied (the call itself is unchanged)
  const shown = redactToolCall({
    name: part.toolName,
    input: part.input,
    output: part.state === "output-available" ? part.output : undefined,
    error: part.state === "output-error" ? part.errorText : undefined,
  });
  const input = shown.input && Object.keys(shown.input as object).length ? JSON.stringify(shown.input, null, 2) : "";
  const output = part.state === "output-available" ? outputText(shown.output) : (shown.error ?? "");

  if (state === "parked") {
    return (
      <Item variant="outline" size="sm" data-slot="agent-tool" data-state="parked">
        <ItemContent>
          <ItemTitle>Confirm on the page</ItemTitle>
          <ItemDescription>{phase?.prompt ?? `${words}: click to confirm.`}</ItemDescription>
        </ItemContent>
      </Item>
    );
  }
  return (
    <Trace data-slot="agent-tool" data-state={state}>
      <TraceCollapsible defaultOpen={state === "error"}>
        <TraceCollapsibleTrigger>
          <TraceLine status={status}>
            <TraceTitle>{title}</TraceTitle>
            {state === "done" && <TraceDescription>done</TraceDescription>}
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          {input && (
            <CodeBlock size="sm">
              <CodeBlockContent wrap className="max-h-40">
                {input}
              </CodeBlockContent>
            </CodeBlock>
          )}
          {output && (
            <CodeBlock size="sm" variant={state === "error" ? "destructive" : "default"} className="mt-2">
              <CodeBlockContent wrap className="max-h-64">
                {output.replace(/^Error(?: \[[a-z_]+\])?:\s*/, "")}
              </CodeBlockContent>
            </CodeBlock>
          )}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}
