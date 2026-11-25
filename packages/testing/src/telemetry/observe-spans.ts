/**
 * The `spans` fixture's recorder: `observeAgents` sending every browser span to a memory exporter. Its own module,
 * loaded by the fixture on use, so a test that never destructures `spans` needs no `@webmcp-agents/telemetry`.
 */
import { observeAgents } from "@webmcp-agents/telemetry";
import { MEMORY_EXPORTER, type MemoryExporter, memoryExporter } from "./index";

/** The `spans` fixture: the spans in memory, `flush()` to wait for the ones still buffered, `stop()` to stop observing. */
export interface SpansFixture extends MemoryExporter {
  /** Send what `observeAgents` still buffers (spans are built when the first run starts) and resolve once they are here. */
  flush(): Promise<void>;
  /** Stop observing (the fixture does it after the test). */
  stop(): void;
}

/** Start observing every run into memory: one span per batch, so nothing waits on a timer. */
export function observeSpans(): SpansFixture {
  const memory = memoryExporter();
  const stop = observeAgents({ exporters: [memory], batchSize: 1 });
  // a wrapper, not the exporter itself: observeAgents calls its exporters' `flush`, which must not be this one
  return {
    get spans() {
      return memory.spans;
    },
    reset: () => memory.reset(),
    export: (spans, done) => memory.export(spans, done),
    forceFlush: () => memory.forceFlush(),
    shutdown: () => memory.shutdown(),
    [MEMORY_EXPORTER]: true,
    flush: () => stop.flush(),
    stop: () => stop(),
  };
}
