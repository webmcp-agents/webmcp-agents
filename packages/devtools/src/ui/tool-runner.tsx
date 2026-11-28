/**
 * Run one tool: a generated form (or raw JSON), Run / Cancel, copy as code,
 * and the latest result inline. Form and JSON stay in sync; JSON that doesn't
 * parse keeps the last valid value and says why.
 */
import { type KeyboardEvent, useState } from "react";
import { toAgentInvokeCode, toExecuteToolCode } from "../copy-as-code";
import { textOf } from "../execute";
import { SchemaForm } from "../schema-form/schema-form";
import { type DevtoolsStore, isOpen, type ToolView } from "../store";
import { CopyButton } from "./copy-button";
import { StatusIcon } from "./icons";
import { statusText } from "./labels";
import { useDevtools } from "./use-devtools";

/** Props of `ToolRunner`. */
export interface ToolRunnerProps {
  store: DevtoolsStore;
  tool: ToolView;
  /** Starting arguments (defaults, or a timeline call being re-run). */
  initial: unknown;
  /** The tool was unregistered while open. */
  gone?: boolean;
  /** Called with the arguments of each run, so the row's quick Run can repeat them. */
  onRun?(args: Record<string, unknown>): void;
  id: string;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** The runner under an expanded tool row. */
export function ToolRunner({ store, tool, initial, gone = false, id, onRun }: ToolRunnerProps) {
  const hasVisuals = useDevtools(store, (s) => s.hasVisuals);
  const [value, setValue] = useState(initial);
  const [mode, setMode] = useState<"form" | "json">("form");
  const [json, setJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // This tool's latest run from the panel: a stable record, so other calls' events don't re-render the runner.
  const last = useDevtools(store, (s) => s.calls.find((c) => c.tool === tool.name && c.origin === "devtools"));
  const running = !!last && isOpen(last);
  const args = (value ?? {}) as Record<string, unknown>;

  const run = () => {
    if (gone || jsonError) return;
    onRun?.(args);
    void store.runTool(tool.name, args);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      run();
    }
  };
  const showJson = () => {
    setJson(JSON.stringify(value ?? {}, null, 2));
    setJsonError(null);
    setMode("json");
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Cmd/Ctrl+Enter from any field inside; Run is the button
    <div className="runner" id={id} onKeyDown={onKeyDown}>
      {gone && <p className="notice">This tool is no longer registered. It comes back when the page registers it again.</p>}
      <div className="runner-bar">
        <fieldset className="segmented">
          <legend className="sr-only">Arguments editor</legend>
          <button type="button" aria-pressed={mode === "form"} disabled={!!jsonError} onClick={() => setMode("form")}>
            Form
          </button>
          <button type="button" aria-pressed={mode === "json"} onClick={showJson}>
            JSON
          </button>
        </fieldset>
        <span className="grow" />
        <CopyButton text={() => toAgentInvokeCode(tool.name, store.shown(tool.name, args))} label="Copy as agent.invoke()">
          agent.invoke()
        </CopyButton>
        <CopyButton text={() => toExecuteToolCode(tool.name, store.shown(tool.name, args))} label="Copy as executeTool()">
          executeTool()
        </CopyButton>
      </div>

      {mode === "form" ? (
        <SchemaForm schema={tool.schema} value={value} onChange={setValue} idPrefix={`${id}-f`} />
      ) : (
        <div className="field">
          <label htmlFor={`${id}-json`}>Arguments (JSON)</label>
          <textarea
            id={`${id}-json`}
            className="input"
            rows={Math.min(14, json.split("\n").length + 1)}
            spellCheck={false}
            value={json}
            aria-invalid={jsonError ? true : undefined}
            aria-describedby={jsonError ? `${id}-json-error` : undefined}
            onChange={(e) => {
              const text = e.currentTarget.value;
              setJson(text);
              try {
                const parsed: unknown = JSON.parse(text || "{}");
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("arguments must be an object");
                setValue(parsed);
                setJsonError(null);
              } catch (err) {
                setJsonError((err as Error).message);
              }
            }}
          />
          {jsonError && (
            <p id={`${id}-json-error`} className="error-text">
              Not valid JSON: {jsonError}
            </p>
          )}
        </div>
      )}

      <div className="runner-bar">
        <button type="button" className="btn primary" disabled={gone || !!jsonError} onClick={run}>
          Run <span className="kbd">{isMac ? "⌘↵" : "Ctrl+↵"}</span>
        </button>
        {running && last && (
          <button type="button" className="btn" onClick={() => store.cancel(last.id)}>
            Cancel
          </button>
        )}
      </div>

      {last && (
        <div className="field" data-status={last.status} aria-live="polite">
          <span className="status-line">
            <span className="status-icon">
              <StatusIcon status={last.status} />
            </span>
            <span className="status">{statusText(last, tool.confirms && !hasVisuals)}</span>
          </span>
          {(last.result || last.error) && <pre className="result-text mono">{last.error ?? (textOf(last.result) || "(no content)")}</pre>}
        </div>
      )}
    </div>
  );
}
