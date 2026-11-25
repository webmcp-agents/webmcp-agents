/**
 * The span builder behind `observeAgents()` (design §7.5), a chunk loaded when the first consented run starts (a page
 * where no run happens, or no consent is given, never downloads it). A run is an `invoke_agent`
 * span whose ids are its `traceparent`'s, so the server's step spans (sent the same header) are its children; each
 * tool call is an `execute_tool` child with `webmcp.park` / `webmcp.yield` / `webmcp.resume` events; a sub-agent's run
 * is a child of its delegating call; an on-device run's steps are browser `chat` spans.
 *
 * Every finished span goes through `metadataMapping` → redaction → `spanFilter`, then a batch, then the exporters.
 */
import type { AgentRunEvent } from "@webmcp-agents/chat";
import { createRedactor, getRedactor, type Redactor } from "@webmcp-agents/core/redact";
import {
  ATTR_ADAPTER,
  ATTR_AGENT_ID,
  ATTR_CONVERSATION_ID,
  ATTR_ERROR_TYPE,
  ATTR_OPERATION_NAME,
  ATTR_PAGE,
  ATTR_PARENT_CALL_ID,
  ATTR_REQUEST_MODEL,
  ATTR_RUN_ID,
  ATTR_RUN_REASON,
  ATTR_RUN_STEPS,
  ATTR_STEP,
  ATTR_TOOL_CALL_ARGUMENTS,
  ATTR_TOOL_CALL_ID,
  ATTR_TOOL_CALL_RESULT,
  ATTR_TOOL_CONFIRM,
  ATTR_TOOL_ERROR_CODE,
  ATTR_TOOL_NAME,
  ATTR_TOOL_STATE,
  ATTR_TOOL_WAITED_MS,
  ATTR_USAGE_INPUT_TOKENS,
  ATTR_USAGE_OUTPUT_TOKENS,
  DEFAULT_AGENT_NAME,
  EVENT_PARK,
  EVENT_RESUME,
  EVENT_YIELD,
  SCOPE_NAME,
  SPAN_CHAT,
  SPAN_EXECUTE_TOOL,
  SPAN_INVOKE_AGENT,
} from "../semconv";
import type { Attributes, TracerProvider } from "../shared/types";
import { cleanAttributes, isSampled, parseTraceparent, randomHex, registeredGlobalTrace, VERSION, withMappedKeys } from "../shared/util";
import { DEFAULT_RELAY, postExporter, warnOnce } from "./exporters";
import type { BrowserSpanExporter, ObserveAgentsOptions, SpanRecord } from "./types";

/** Where finished span records go: a batch of exporters, or the bridge to an OpenTelemetry provider. */
export interface Sink {
  /** A span began (the bridge needs a parent's start before its first child ends). */
  start?(span: SpanRecord): void;
  /** A span ended and passed the pipeline. */
  end(span: SpanRecord): void;
  /** A started span was filtered out. */
  drop?(spanId: string): void;
  /** Send what is waiting. Never rejects. */
  flush(): Promise<void>;
}

/** A span still running, with what its end needs to know. */
interface Open {
  rec: SpanRecord;
  parked?: boolean;
  yielded?: boolean;
}

/** The adapter whose steps reach a server that makes the `chat` spans itself. */
const CLOUD_ADAPTER = "cloud";

const noop = (): void => {};

/** Send batches to exporters: at most every `batchMs`, sooner once `batchSize` spans wait. */
function batchSink(exporters: Promise<readonly BrowserSpanExporter[]>, batchMs: number, batchSize: number): Sink {
  const queue: SpanRecord[] = [];
  const inflight = new Set<Promise<unknown>>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const send = (): Promise<unknown> => {
    clearTimeout(timer);
    timer = undefined;
    const batches: SpanRecord[][] = [];
    while (queue.length) batches.push(queue.splice(0, batchSize));
    const sent = exporters
      .then((xs) =>
        Promise.all(
          xs.flatMap((x) =>
            batches.map(async (batch) => {
              // an exporter that throws or rejects drops this batch for itself only
              await x.export(batch);
            }),
          ),
        ),
      )
      .catch(noop);
    inflight.add(sent);
    void sent.then(() => inflight.delete(sent));
    return sent;
  };
  return {
    end(span) {
      queue.push(span);
      if (queue.length >= batchSize) void send();
      else timer ??= setTimeout(send, batchMs);
    },
    async flush() {
      // what was sent before, and what is queued now
      await Promise.all([...inflight, send()]);
      await exporters.then((xs) => Promise.all(xs.map((x) => x.flush?.()))).catch(noop);
    },
  };
}

/** The bridge chunk, loaded on first use. Every operation waits on the same promise, so they run in order. */
function bridgeSink(provider: TracerProvider | "global"): Sink {
  const ready = import("./bridge").then(
    (m) => m.createBridge(provider, SCOPE_NAME, VERSION),
    (err: unknown) => warnOnce(`browser spans are off: @opentelemetry/api could not be loaded (${getRedactor().error(err)})`),
  );
  const on =
    <T>(op: (s: Sink, arg: T) => unknown) =>
    (arg: T): void =>
      void ready.then((s) => s && op(s, arg)).catch(noop);
  return {
    start: on((s, span: SpanRecord) => s.start?.(span)),
    end: on((s, span: SpanRecord) => s.end(span)),
    drop: on((s, id: string) => s.drop?.(id)),
    flush: () => ready.then((s) => s?.flush()).catch(noop),
  };
}

/** §7.2's order in the browser: a provider passed in, `exporters`, the page's global provider, the relay. */
function chooseSink(options: ObserveAgentsOptions): Sink | undefined {
  const { tracerProvider: provider, exporters, batchMs = 2000 } = options;
  const batchSize = Math.max(1, options.batchSize ?? 64);
  if (provider && typeof provider === "object") return bridgeSink(provider);
  const global = registeredGlobalTrace();
  if (provider === "global" && !global) {
    warnOnce('tracerProvider: "global" was set but the page registered no tracer provider: browser spans are off');
    return undefined;
  }
  if (provider === "global" || (provider !== "own" && !exporters && global)) return bridgeSink("global");
  const resource: Attributes = { "service.name": options.serviceName ?? location.host, "telemetry.sdk.language": "webjs" };
  if (!exporters) return batchSink(Promise.resolve([postExporter(DEFAULT_RELAY, resource)]), batchMs, batchSize);
  if (!exporters.length) return undefined;
  const list = import("./targets").then(
    (m) => exporters.flatMap((x) => m.toExporter(x, resource, postExporter, warnOnce) ?? []),
    () => [],
  );
  return batchSink(list, batchMs, batchSize);
}

/** JSON of a tool input or output for a span attribute; what cannot be serialized is left out. */
const json = (value: unknown): string | undefined => {
  try {
    return value === undefined ? undefined : JSON.stringify(value);
  } catch {
    return undefined;
  }
};

/** What the light `observeAgents()` drives: events in, spans out. */
export interface Engine {
  /** A run event; `consent` is what `enabled()` answered when a root run started (read by the caller, at that moment). */
  event(e: AgentRunEvent, consent?: boolean): void;
  /** The cursor came back after a yield. */
  resume(): void;
  /** Send what is waiting. */
  flush(): Promise<void>;
}

/** The engine for these options, or undefined when there is nowhere to send (logged once when that is a mistake). */
export function createEngine(options: ObserveAgentsOptions): Engine | undefined {
  const sink = chooseSink(options);
  if (!sink) return undefined;
  const { recordInputs, recordOutputs, sampling, spanFilter, metadataMapping = {}, redact } = options;
  const own: Redactor | false | undefined =
    redact === false ? false : typeof redact === "function" ? redact : redact && createRedactor(redact);
  const runs = new Map<string, { span: Open; adapter: string; steps: Map<number, Open> }>();
  const calls = new Map<string, Open>();
  const epoch = (at: number): number => performance.timeOrigin + at;
  /** `fn()`, or `fallback` when it throws: an app's callback never breaks a run. */
  const safe = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };

  // ---------- 1. spans: begin, and the pipeline at the end (metadataMapping → redaction → spanFilter → the sink) ----------
  const begin = (
    name: string,
    traceId: string,
    parentSpanId: string | undefined,
    at: number,
    attributes: Record<string, unknown>,
    spanId = randomHex(8),
  ): Open => {
    const rec = {
      name,
      traceId,
      spanId,
      parentSpanId,
      startTime: epoch(at),
      endTime: 0,
      attributes,
      events: [],
      status: { code: "unset" },
    } as SpanRecord;
    sink.start?.(rec);
    return { rec };
  };
  const finish = ({ rec }: Open, endTime: number): void => {
    const attributes: Record<string, unknown> = { ...rec.attributes };
    for (const [from, to] of Object.entries(metadataMapping)) if (attributes[from] !== undefined) attributes[to] = attributes[from];
    const base = own ?? getRedactor();
    const r = base && withMappedKeys(base, metadataMapping);
    const clean = (a: Record<string, unknown>): Attributes => cleanAttributes(r ? r(a, { kind: "attribute" }) : a);
    const text = (t: string): string => (r ? r.text(t) : t);
    const out: SpanRecord = {
      ...rec,
      name: text(rec.name),
      endTime: Math.max(endTime, rec.startTime),
      attributes: clean(attributes),
      events: rec.events.map((e) => ({ ...e, attributes: clean(e.attributes ?? {}) })),
      status: rec.status.message ? { ...rec.status, message: text(rec.status.message) } : rec.status,
    };
    if (safe(() => spanFilter?.(out) !== false, false)) sink.end(out);
    else sink.drop?.(rec.spanId);
  };

  // ---------- 2. run events → spans (undefined attributes are left out by the pipeline) ----------
  const handle = (e: AgentRunEvent, consent?: boolean): void => {
    const run = runs.get(e.ref.run);
    const step = "step" in e ? e.step : undefined;
    const call = "call" in e ? calls.get(e.call) : undefined;
    const ids = { [ATTR_CONVERSATION_ID]: e.ref.conversation, [ATTR_RUN_ID]: e.ref.run };
    const child = (name: string, operation: string, at: number, attributes: Record<string, unknown>): Open =>
      begin(name, run!.span.rec.traceId, run!.span.rec.spanId, at, {
        [ATTR_OPERATION_NAME]: operation,
        [ATTR_STEP]: step,
        ...ids,
        ...attributes,
      });
    if (e.type === "run-start") {
      const parent = e.ref.parent ? calls.get(e.ref.parent) : undefined;
      const ref = parseTraceparent(e.ref.traceparent);
      const traceId = parent?.rec.traceId || ref?.[0] || randomHex(16);
      // a sub-agent's run follows its parent's decision; a root run asks for consent and sampling now
      if (e.ref.parent ? !parent : !(consent && isSampled(sampling, traceId, { agent: e.agent, conversation: e.ref.conversation }))) return;
      const span = begin(
        `${SPAN_INVOKE_AGENT} ${e.agent ?? DEFAULT_AGENT_NAME}`,
        traceId,
        parent ? parent.rec.spanId : undefined,
        e.at,
        {
          [ATTR_OPERATION_NAME]: SPAN_INVOKE_AGENT,
          [ATTR_AGENT_ID]: e.agent,
          ...ids,
          [ATTR_PARENT_CALL_ID]: e.ref.parent,
          [ATTR_ADAPTER]: e.adapter,
          [ATTR_PAGE]: location.href,
        },
        ref?.[1],
      );
      runs.set(e.ref.run, { span, adapter: e.adapter, steps: new Map() });
    } else if (!run) return;
    else if (e.type === "step-start") {
      // a cloud run's steps are the server's `chat` spans; any other adapter's are made here
      if (run.adapter !== CLOUD_ADAPTER) run.steps.set(e.step, child(SPAN_CHAT, SPAN_CHAT, e.at, {}));
    } else if (e.type === "step-finish") {
      const open = run.steps.get(e.step);
      if (!open) return;
      run.steps.delete(e.step);
      if (e.model) open.rec.name += ` ${e.model}`;
      Object.assign(open.rec.attributes, {
        [ATTR_REQUEST_MODEL]: e.model,
        [ATTR_USAGE_INPUT_TOKENS]: e.usage?.inputTokens,
        [ATTR_USAGE_OUTPUT_TOKENS]: e.usage?.outputTokens,
      });
      finish(open, open.rec.startTime + e.ms);
    } else if (e.type === "tool-start") {
      calls.set(
        e.call,
        child(`${SPAN_EXECUTE_TOOL} ${e.tool}`, SPAN_EXECUTE_TOOL, e.at, {
          [ATTR_TOOL_NAME]: e.tool,
          [ATTR_TOOL_CALL_ID]: e.call,
          [ATTR_TOOL_CALL_ARGUMENTS]: recordInputs ? json(e.input) : undefined,
        }),
      );
    } else if (!call && e.type !== "run-finish") return;
    else if (e.type === "tool-park") {
      call!.parked = true;
      call!.rec.events.push({ name: EVENT_PARK, time: epoch(e.at), attributes: { prompt: e.prompt } });
    } else if (e.type === "tool-yield") {
      call!.yielded = true;
      call!.rec.events.push({ name: EVENT_YIELD, time: epoch(e.at), attributes: { reason: e.reason } });
    } else if (e.type === "tool-finish") {
      calls.delete(e.call);
      const failed = e.state === "error";
      Object.assign(call!.rec.attributes, {
        [ATTR_TOOL_STATE]: e.state,
        [ATTR_TOOL_WAITED_MS]: Math.round(e.waitedMs),
        [ATTR_TOOL_ERROR_CODE]: e.code,
        [ATTR_TOOL_CONFIRM]: call!.parked
          ? e.state === "done"
            ? "accepted"
            : e.code === "needs_user"
              ? "timeout"
              : "cancelled"
          : undefined,
        [ATTR_TOOL_CALL_RESULT]: recordOutputs ? json(e.output) : undefined,
        [ATTR_ERROR_TYPE]: failed ? (e.code ?? "failed") : undefined,
      });
      if (failed) call!.rec.status = { code: "error" };
      finish(call!, call!.rec.startTime + e.ms);
    } else if (e.type === "run-finish") {
      runs.delete(e.ref.run);
      const end = run.span.rec.startTime + e.ms;
      for (const open of run.steps.values()) finish(open, end);
      const failed = e.reason === "error";
      Object.assign(run.span.rec.attributes, {
        [ATTR_RUN_REASON]: e.reason,
        [ATTR_RUN_STEPS]: e.steps,
        [ATTR_ERROR_TYPE]: failed ? (e.code ?? "error") : undefined,
      });
      if (failed) run.span.rec.status = { code: "error", message: e.error };
      finish(run.span, end);
    }
  };

  return {
    event: (e, consent) => safe(() => handle(e, consent), undefined),
    resume() {
      for (const call of calls.values())
        if (call.yielded) {
          call.yielded = false;
          call.rec.events.push({ name: EVENT_RESUME, time: Date.now() });
        }
    },
    flush: () => sink.flush(),
  };
}
