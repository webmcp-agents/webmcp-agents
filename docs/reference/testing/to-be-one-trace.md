---
description: "Every span belongs to one trace with one root (telemetry, 0.5.0)."
---

# `toBeOneTrace`

Passes when every span belongs to one trace, with one root. It arrives with `@webmcp-agents/telemetry` (0.5.0): until then it is typed and registered, and calling it fails with a sentence saying so.

## Import

```ts
import "@webmcp-agents/testing/matchers"; // in setupFiles (the main entry and ./setup register them too)
```

## Example

```ts
expect(spans).toBeOneTrace();
```

## Options

`expect(received).toBeOneTrace()`.

| Name | Type | Default | Description |
|---|---|---|---|
| `received` | the value under test | required | What `expect(…)` was given; the matcher takes no arguments. |

## Returns

Nothing: it passes, or fails the test with a message that says what happened.

## See also

- [`toHaveSpan`](./to-have-span.md)
- [The `spans` fixture](./spans.md)
