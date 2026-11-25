"use client";
/** The model's reasoning as shadcn/ui's Reasoning pattern: "Thinking" while it streams, "Thought" after, text inside. */
import { createTranslator, type Translate } from "@webmcp-agents/chat";
import type { UIMessage } from "ai";
import { Streamdown } from "streamdown";
import { Trace, TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceLine, TraceTitle } from "@/components/ui/trace";

export type AgentReasoningPart = Extract<UIMessage["parts"][number], { type: "reasoning" }>;

/** English, for a block rendered without the chat's translate function. */
const english = createTranslator();

/** `t`: the chat's translate function (`useAgentChat().t`). Default English. */
export function AgentReasoning({ part, t = english }: { part: AgentReasoningPart; t?: Translate }) {
  const streaming = part.state === "streaming";
  if (!part.text.trim() && !streaming) return null;
  return (
    <Trace data-slot="agent-reasoning" data-wa-part="reasoning">
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine status={streaming ? "running" : undefined}>
            <TraceTitle>{streaming ? t("reasoning.thinking") : t("trace.thought")}</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <Streamdown>{part.text}</Streamdown>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}
