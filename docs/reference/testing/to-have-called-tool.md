---
description: "The run called the tool, with an input containing the given keys when given."
---

# `toHaveCalledTool`

Reads a run: the `WebAgentResult` that `agent.invoke` resolved to, a [`mockAdapter`](./mock-adapter.md), or the error `agent.invoke` rejected with. Passes when the run called `tool`; with `input`, with an input that contains those keys (a partial match).

## Import

```ts
import "@webmcp-agents/testing/matchers"; // in setupFiles (the main entry and ./setup register them too)
```

## Example

```ts
expect(run).toHaveCalledTool("add_to_cart", { qty: 2 });
expect(run).not.toHaveCalledTool("place_order");
```

## Options

`expect(received).toHaveCalledTool(tool, input?)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `tool` | `string` | required | The tool's name (a sub-agent's calls count too). |
| `input` | `Record<string, unknown>` | any input | Keys the input must have, with these values. |

## Returns

Nothing: it passes, or fails the test with a message that says what happened.

## Notes

Negated, a failure prints the call's input. A run the matcher cannot read fails with a sentence saying what it needs. The `runs` fixture's `RunLog` is read too once the chat emits run events (0.5.0).

## See also

- [`toHaveCalledTools`](./to-have-called-tools.md)
- [`mockAdapter`](./mock-adapter.md)
- [`defineWebAgent`](../chat/define-web-agent.md)
