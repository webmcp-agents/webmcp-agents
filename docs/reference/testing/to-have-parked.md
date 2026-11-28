---
description: "A tool waited for the person, with the expected prompt when one is given."
---

# `toHaveParked`

Passes when a `park` event is there: a confirmation the person must click, or a question. With `tool`, that tool; with `prompt`, a prompt that contains that string or matches that RegExp. Use it with `expect.poll` while the call is in flight.

## Import

```ts
import "@webmcp-agents/testing/matchers"; // in setupFiles (the main entry and ./setup register them too)
```

## Example

```ts
const call = tools.call("place_order");
await expect.poll(() => events).toHaveParked("place_order");
await user.confirm("Place order");
expect(await call).toBeToolResult();
```

## Options

`expect(received).toHaveParked(tool?, prompt?)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `tool` | `string` | any tool | The tool that parked. |
| `prompt` | `string \| RegExp` | any prompt | What the prompt says, e.g. `/Place order/`. |

## Returns

Nothing: it passes, or fails the test with a message that says what happened.

## Notes

Negated, a failure says which tool parked and with what prompt:

```text
expect(received).not.toHaveParked()

  Expected no tool to wait for the person, but "place_order" parked with the prompt "Click Place order to confirm".
```

## See also

- [`user.confirm`](./user.md)
- [`waitingForUser`](../core/waiting-for-user.md)
