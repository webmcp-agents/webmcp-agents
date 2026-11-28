"use client";
/**
 * A sub-agent's run as shadcn/ui's Subagent pattern: the `delegate_to_<id>` call is the outer Trace line; inside it,
 * the sub-agent's own tool calls (each an AgentTool) and its answer. `phase.agent` comes from `useAgentChat().toolPhase`.
 */
import { createTranslator, redactToolCall, type ToolPhase, type Translate } from "@webmcp-agents/chat";
import type { UIMessage } from "ai";
import { Streamdown } from "streamdown";
import { Badge } from "@/components/ui/badge";
import { Trace, TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceLine, TraceTitle } from "@/components/ui/trace";
import { AgentTool, type AgentToolPart } from "@/components/web-agents/agent-tool";

/** English, for a block rendered without the chat's translate function. */
const english = createTranslator();

/** "delegate_to_checkout" → "checkout". */
export const subagentId = (toolName: string): string => toolName.replace(/^delegate_to_/, "");

/** `t`: the chat's translate function (`useAgentChat().t`), passed on to the nested tool lines. Default English. */
export function AgentSubagent({
  part,
  phase,
  toolPhase,
  t = english,
}: {
  part: AgentToolPart;
  phase?: ToolPhase;
  toolPhase(part: UIMessage["parts"][number]): ToolPhase | undefined;
  t?: Translate;
}) {
  const id = phase?.agent?.id ?? subagentId(part.toolName);
  const state = phase?.phase ?? "running";
  // the task is the model's own words about the person's data: shown through the page's redactor, like a tool's input
  const task = (redactToolCall({ name: part.toolName, input: part.input }).input as { task?: string } | undefined)?.task;
  const title =
    state === "running" || state === "parked"
      ? t("trace.agentRunning", { agent: id })
      : state === "done"
        ? t("trace.agentDone", { agent: id })
        : state === "cancelled"
          ? t("trace.agentCancelled", { agent: id })
          : t("trace.agentFailed", { agent: id });
  const nested = phase?.agent?.messages ?? [];
  return (
    <Trace data-slot="agent-subagent" data-wa-part="subagent" data-state={state}>
      <TraceCollapsible defaultOpen>
        <TraceCollapsibleTrigger>
          <TraceLine status={state === "running" || state === "parked" ? "running" : state === "error" ? "error" : undefined}>
            <TraceTitle>{title}</TraceTitle>
            <Badge variant="secondary">{t("trace.agentBadge")}</Badge>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          {task && <p className="mb-2 text-sm text-foreground">{task}</p>}
          <div className="flex flex-col gap-2">
            {nested.flatMap((m) =>
              m.parts.map((p, i) => {
                // a run's parts only grow at the end, so the position within its message is a stable key
                const key = p.type === "dynamic-tool" ? p.toolCallId : `${m.id}-${i}`;
                if (p.type === "dynamic-tool") return <AgentTool key={key} part={p} phase={toolPhase(p)} t={t} />;
                return p.type === "text" && p.text.trim() ? <Streamdown key={key}>{p.text}</Streamdown> : null;
              }),
            )}
          </div>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}
