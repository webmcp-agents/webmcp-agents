---
description: "Every span belongs to one trace, with one root."
---

# `toBeOneTrace`

Passes when every span belongs to one trace and exactly one of them is a root (a span whose parent is not among them): the browser's and the server's spans of one turn joined up. No spans at all fails. It reads what [`toHaveSpan`](./to-have-span.md) reads; a failure names the traces, or the roots.

## Import

```ts
import "@webmcp-agents/testing/matchers"; // in setupFiles (the main entry and ./setup register them too)
```

## Example

```ts
expect([...browser.spans, ...server.spans]).toBeOneTrace();
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
