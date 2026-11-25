/**
 * @webmcp-agents/core/redact: keep passwords, card numbers, tokens, emails and the fields an app marks out of what the
 * library shows, logs or exports about a tool call. Its own entry and chunk, with no dependency: a page that never
 * imports it pays only for the control check and `mask` the cursor uses.
 *
 *   import { configureRedaction } from "@webmcp-agents/core/redact";
 *   configureRedaction({ keys: (d) => [...d, "loyaltyId"] });
 */
export { isSensitiveControl, mask } from "./control";
export type { RedactionStyle } from "./control";
export { configureRedaction, createRedactor, DEFAULT_SENSITIVE_KEYS, getRedactor } from "./redactor";
export type { BuiltInPattern, PatternRule, RedactContext, RedactKind, RedactOptions, Redactor, RedactUrlOptions } from "./redactor";
export { toolSensitivity } from "./sensitive";
export type { SensitiveOption, SensitiveSource, ToolSensitivity } from "./sensitive";
