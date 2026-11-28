/** One call, expanded: arguments, the fields the agent typed, the result or error, and Re-run. */
import type { ModelContextToolResult } from "@webmcp-agents/core";
import { type CallRecord, type DevtoolsStore, isOpen } from "../store";
import { JsonView } from "./json-view";
import { formatDuration } from "./labels";
import { useDevtools } from "./use-devtools";

/** Props of `CallDetail`. */
export interface CallDetailProps {
  id: string;
  call: CallRecord;
  store: DevtoolsStore;
  onRerun(call: CallRecord): void;
}

/** The expanded body of a timeline row. Values are redacted unless the panel's "Reveal values" is on (development). */
export function CallDetail({ id, call: recorded, store, onRerun }: CallDetailProps) {
  const canCancel = useDevtools(store, (s) => s.canCancel);
  const canReveal = useDevtools(store, (s) => s.canReveal);
  const revealed = useDevtools(store, (s) => s.revealed);
  const call: CallRecord = revealed ? { ...recorded, ...store.raw(recorded.id) } : recorded;
  const open = isOpen(call);
  const textParts: string[] = [];
  const otherParts: ModelContextToolResult["content"] = [];
  for (const part of call.result?.content ?? []) {
    if (part.type === "text" && typeof part.text === "string") textParts.push(part.text);
    else otherParts.push(part);
  }
  return (
    <div className="detail" id={id}>
      {call.args !== undefined && (
        <section>
          <h4>Arguments</h4>
          <JsonView value={call.args} label="arguments" />
        </section>
      )}
      {call.fills.length > 0 && (
        <section>
          <h4>Fields typed</h4>
          <ul className="fills">
            {call.fills.map((f) => (
              <li key={`${f.field}-${f.at}`}>
                <span className="muted">+{formatDuration(f.at - call.startedAt)}</span>
                <span>
                  {f.field} = {JSON.stringify(f.value)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {call.status === "waiting" && call.prompt && (
        <section>
          <h4>Waiting for you</h4>
          <p className="result-text">{call.prompt} on the page.</p>
        </section>
      )}
      {call.error && (
        <section>
          <h4>Error</h4>
          <pre className="result-text mono">{call.error}</pre>
        </section>
      )}
      {call.result && (
        <section>
          <h4>Result{call.result.isError ? " (isError)" : ""}</h4>
          {textParts.length === 0 && otherParts.length === 0 && <p className="hint">No content.</p>}
          {textParts.map((text, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: content parts are positional
            <pre key={i} className="result-text mono">
              {text}
            </pre>
          ))}
          {otherParts.length > 0 && <JsonView value={otherParts} label="result content" />}
        </section>
      )}
      <div className="runner-bar">
        <button type="button" className="btn" onClick={() => onRerun(call)}>
          Re-run…
        </button>
        {canReveal && (
          <button type="button" className="btn" aria-pressed={revealed} onClick={() => store.setRevealed(!revealed)}>
            {revealed ? "Hide values" : "Reveal values"}
          </button>
        )}
        {open && (canCancel || call.origin === "devtools") && (
          <button type="button" className="btn" onClick={() => store.cancel(call.id)}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
