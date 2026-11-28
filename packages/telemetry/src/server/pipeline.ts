/**
 * The pipeline of a provider this package builds (design §7.4): the app's `spanProcessors` run first (they are the
 * provider's earlier processors), then this processor: `metadataMapping` → redaction → `spanFilter` → batch →
 * exporters. Each exporter call is capped by its timeout; a throw, a rejection or a hang drops that batch for that
 * exporter only, logged once. Nothing here ever throws into the SDK or the chat request.
 */
import type { Redactor } from "@webmcp-agents/core/redact";
import type { ReadableSpanLike, SpanExporter } from "../shared/types";
import { cleanAttributes, withMappedKeys } from "../shared/util";
import type { Log } from "./log";

/** What the pipeline needs. */
export interface PipelineOptions {
  exporters: readonly SpanExporter[];
  /** The redactor at the time of use (`false`: off, for local debugging). */
  redactor: () => Redactor | false;
  mapping: Record<string, string>;
  filter?: (span: ReadableSpanLike) => boolean;
  batchSize: number;
  /** How long a span may wait for a batch to fill, ms. */
  delayMs: number;
  /** The cap on one export call, ms. */
  timeout: number;
  debug: boolean;
  log: Log;
}

/** A finished span with its attributes, events, status and name replaced (everything else read from `span`). */
function copySpan(
  span: ReadableSpanLike,
  name: string,
  attributes: Record<string, unknown>,
  events: ReadableSpanLike["events"],
  status: ReadableSpanLike["status"],
): ReadableSpanLike {
  const s = span as ReadableSpanLike & Record<string, unknown>;
  const ctx = span.spanContext();
  return {
    name,
    kind: span.kind,
    spanContext: () => ctx,
    parentSpanContext: span.parentSpanContext,
    startTime: span.startTime,
    endTime: span.endTime,
    status,
    attributes,
    events,
    instrumentationScope: span.instrumentationScope,
    resource: span.resource,
    // the rest of the SDK's ReadableSpan, as it was
    ...({
      links: s.links ?? [],
      duration: s.duration,
      ended: true,
      droppedAttributesCount: s.droppedAttributesCount ?? 0,
      droppedEventsCount: s.droppedEventsCount ?? 0,
      droppedLinksCount: s.droppedLinksCount ?? 0,
    } as object),
  };
}

/** The last processor of a provider this package builds. Also takes the relay's spans (`push`). */
export class Pipeline {
  #queue: ReadableSpanLike[] = [];
  #timer: ReturnType<typeof setTimeout> | undefined;
  #inflight = new Set<Promise<void>>();
  #closed = false;
  constructor(private readonly o: PipelineOptions) {}

  onStart(): void {}

  onEnd(span: ReadableSpanLike): void {
    this.push(span);
  }

  /** A finished span: prepared, then queued for the next batch. */
  push(span: ReadableSpanLike): void {
    if (this.#closed) return;
    let out: ReadableSpanLike | undefined;
    try {
      out = this.prepare(span);
    } catch (err) {
      this.o.log.error("prepare", "a span could not be prepared for export and was dropped", err);
      return;
    }
    if (!out) return;
    this.#queue.push(out);
    if (this.#queue.length >= this.o.batchSize) void this.send();
    else if (!this.#timer) {
      this.#timer = setTimeout(() => void this.send(), this.o.delayMs);
      (this.#timer as { unref?: () => void }).unref?.();
    }
  }

  /** metadataMapping → redaction → spanFilter. Undefined when the filter drops it. */
  prepare(span: ReadableSpanLike): ReadableSpanLike | undefined {
    const attributes: Record<string, unknown> = { ...span.attributes };
    for (const [from, to] of Object.entries(this.o.mapping)) if (attributes[from] !== undefined) attributes[to] = attributes[from];
    const base = this.o.redactor();
    const r = base && withMappedKeys(base, this.o.mapping);
    const clean = (a: Readonly<Record<string, unknown>> | undefined) =>
      r ? cleanAttributes(r(a ?? {}, { kind: "attribute" })) : cleanAttributes(a);
    const out = copySpan(
      span,
      r ? r.text(span.name) : span.name,
      clean(attributes),
      (span.events ?? []).map((e) => ({ name: e.name, time: e.time, ...(e.attributes && { attributes: clean(e.attributes) }) })),
      span.status?.message && r ? { ...span.status, message: r.text(span.status.message) } : (span.status ?? { code: 0 }),
    );
    if (this.o.filter) {
      try {
        if (this.o.filter(out) === false) return undefined;
      } catch (err) {
        this.o.log.error("filter", "spanFilter threw: the span was dropped", err);
        return undefined;
      }
    }
    return out;
  }

  /** Export everything queued, in batches. Resolves when each exporter answered or timed out. */
  send(): Promise<void> {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    const sends: Promise<void>[] = [];
    while (this.#queue.length) {
      const batch = this.#queue.splice(0, this.o.batchSize);
      if (this.o.debug) for (const s of batch) this.print(s);
      for (const exporter of this.o.exporters) {
        const p = this.exportOne(exporter, batch);
        this.#inflight.add(p);
        void p.finally(() => this.#inflight.delete(p));
        sends.push(p);
      }
    }
    return Promise.all(sends).then(() => {});
  }

  /** One exporter, one batch: resolves on its callback, a throw, or the timeout, whichever first. */
  private exportOne(exporter: SpanExporter, batch: ReadableSpanLike[]): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;
      const end = (failure?: unknown): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (failure !== undefined)
          this.o.log.error("export", "an exporter failed; that batch was dropped (the chat is unaffected)", failure);
        resolve();
      };
      const timer = setTimeout(() => end(new Error(`no answer within ${this.o.timeout} ms`)), this.o.timeout);
      (timer as { unref?: () => void }).unref?.();
      try {
        exporter.export(batch, (result) => end(result?.code === 0 ? undefined : (result?.error ?? new Error("export failed"))));
      } catch (err) {
        end(err);
      }
    });
  }

  private print(s: ReadableSpanLike): void {
    const ctx = s.spanContext();
    console.log(`[web-agents/telemetry] span ${s.name}`, {
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      parentSpanId: s.parentSpanContext?.spanId,
      attributes: s.attributes,
    });
  }

  /** Send what is queued and wait for it and every export in flight (each capped by its timeout). Never rejects. */
  async forceFlush(): Promise<void> {
    await this.send();
    await Promise.all([...this.#inflight]);
    await Promise.all(this.o.exporters.map((x) => this.capped(() => x.forceFlush?.())));
  }

  /** Flush, then shut the exporters down. Spans arriving after are dropped. */
  async shutdown(): Promise<void> {
    await this.forceFlush();
    this.#closed = true;
    await Promise.all(this.o.exporters.map((x) => this.capped(() => x.shutdown?.())));
  }

  private capped(fn: () => Promise<void> | undefined): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, this.o.timeout);
      (timer as { unref?: () => void }).unref?.();
      try {
        Promise.resolve(fn())
          .catch((err: unknown) => this.o.log.error("exporter-flush", "an exporter failed to flush or shut down", err))
          .finally(() => {
            clearTimeout(timer);
            resolve();
          });
      } catch (err) {
        clearTimeout(timer);
        this.o.log.error("exporter-flush", "an exporter failed to flush or shut down", err);
        resolve();
      }
    });
  }
}
