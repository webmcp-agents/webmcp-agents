---
description: "One of the given values is somewhere in this sink; used negated to prove a secret leaks nowhere."
---

# `toContainSensitive`

Looks for any of `values` (strings found inside any text, or RegExps) in a sink: an event log, a console spy (`vi.spyOn(console, "error")`), a `Response` body, a [`mockAdapter`](./mock-adapter.md) (what it was sent), a run, or any value. Use it negated.

## Import

```ts
import "@webmcp-agents/testing/matchers"; // in setupFiles (the main entry and ./setup register them too)
```

## Example

```ts
const logs = vi.spyOn(console, "error");
// … run the agent …
for (const sink of [events.of("fill"), logs]) {
  expect(sink).not.toContainSensitive(["A1234567"]);
}
await expect(response).not.toContainSensitive(["sk-test"]);
```

## Options

`expect(received).toContainSensitive(values)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `values` | `(string \| RegExp)[]` | required | The secrets to look for. At least one. |

## Returns

Nothing: it passes, or fails the test with a message that says what happened.

## Notes

A failure names the sink, the path and (in an event log) the event, and prints nothing else of the sink's content:

```text
Found in the event log:
  - "A1234567" at events[0].args.passport (event: start fill_traveler)
```

On a `Response` it reads the body, so it is async: `await` it. Inside a value it reads what no own property holds too: a `URL`'s `href`, a `Request`'s `url` and headers, the entries of `Headers`, `URLSearchParams` and `FormData`, and an `Error`'s `message`, `cause` and own properties. It reads 24 levels down: when nothing was found but some part lies deeper, it fails with the path where it stopped instead of claiming the value is absent; pass that part itself. A `/g` or `/y` RegExp is matched from the start every time. `onAgentEvent` listeners get a call's `args` as the agent sent them (only a `fill`'s value is masked), so check `events.of("fill")` for what the cursor showed.

## See also

- [`@webmcp-agents/core/redact`](../core/redact.md)
- [The `redactor` fixture](./redactor.md)
