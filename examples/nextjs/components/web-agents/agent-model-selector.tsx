"use client";
/**
 * shadcn/ui's Model Selector pattern for web-agents: menu 1 picks which assistant answers (cloud, on-device), menu 2
 * which local model runs (size, "on this device"). Both read from `useAgentChat()`.
 */
import { type AgentChatState, adapterLabel, createTranslator } from "@webmcp-agents/chat";
import { ChevronDownIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroupButton } from "@/components/ui/input-group";

/** English, for a selector given a `chat` without its translate function. */
const english = createTranslator();

export function AgentModelSelector({
  chat,
  disabled,
}: {
  chat: Pick<AgentChatState, "adapters" | "adapter" | "selectAdapter" | "models" | "selectModel"> & Partial<Pick<AgentChatState, "t">>;
  disabled?: boolean;
}) {
  const t = chat.t ?? english;
  const current = chat.models.find((m) => m.selected) ?? chat.models[0];
  return (
    <>
      {chat.adapters.length > 1 && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<InputGroupButton size="sm" disabled={disabled} data-wa-part="adapterSwitcher" />}>
            {adapterLabel(chat.adapter, t)}
            <ChevronDownIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{t("adapter.label")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={chat.adapter.id} onValueChange={(id) => chat.selectAdapter(id)}>
              {chat.adapters.map((a) => (
                <DropdownMenuRadioItem key={a.id} value={a.id} closeOnClick>
                  {adapterLabel(a, t)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {chat.models.length > 1 && current && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<InputGroupButton size="sm" disabled={disabled} data-wa-part="modelPicker" />}>
            {current.label}
            <ChevronDownIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{t("model.label")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={current.id} onValueChange={(id) => void chat.selectModel?.(id).catch(() => {})}>
              {chat.models.map((m) => (
                <DropdownMenuRadioItem key={m.id} value={m.id} closeOnClick>
                  <span className="flex flex-col">
                    <span>{m.recommended ? t("model.recommended", { model: m.label }) : m.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {[m.brief, m.bytes ? t.format.bytes(m.bytes) : "", m.cached ? t("model.onDevice") : ""].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}
