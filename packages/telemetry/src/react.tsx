/**
 * @webmcp-agents/telemetry/react: `observeAgents()` as one element.
 *
 *   <WebAgentsProvider><ObserveAgents enabled={() => consent.analytics} /><App /></WebAgentsProvider>
 */
import { useEffect, useRef } from "react";
import { observeAgents } from "./browser/observe";
import type { ObserveAgentsOptions } from "./browser/types";

/**
 * Props of `<ObserveAgents>`: the options of `observeAgents()`.
 *
 * @experimental
 */
export type ObserveAgentsProps = ObserveAgentsOptions;

/**
 * Observe the page's agent runs while mounted (`observeAgents()`), and stop (sending what is buffered) on unmount.
 * Renders nothing. The options are read once, when it mounts, except `enabled`, which is read at every run's start
 * from the latest props (an inline function is fine).
 *
 * @experimental
 *
 * @example
 * import { ObserveAgents } from "@webmcp-agents/telemetry/react";
 * <ObserveAgents enabled={() => consent.analytics} />
 */
export function ObserveAgents(props: ObserveAgentsProps): null {
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => observeAgents({ ...latest.current, enabled: () => (latest.current.enabled ? latest.current.enabled() : true) }), []);
  return null;
}
