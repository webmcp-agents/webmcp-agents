---
description: "The cursor got out of the person's way, for the given reason when one is given."
---

# `toHaveYielded`

Passes when a `yield` event is there: the person moved, typed, scrolled or touched, and the cursor stepped aside. With `reason`, for that reason (`"pointer"`, `"keyboard"`, `"wheel"`, `"touch"`).

## Import

```ts
import "@webmcp-agents/testing/matchers"; // in setupFiles (the main entry and ./setup register them too)
```

## Example

```ts
await user.scroll();
expect(events).toHaveYielded("wheel");
```

## Options

`expect(received).toHaveYielded(reason?)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `reason` | `"pointer" \| "keyboard" \| "wheel" \| "touch"` | any reason | Why it yielded. |

## Returns

Nothing: it passes, or fails the test with a message that says what happened.

## Notes

Only trusted input counts as the person: use the [`user`](./user.md) fixture, not `dispatchEvent`.

## See also

- [`installAgentVisuals`](../core/install-agent-visuals.md)
- [The `user` fixture](./user.md)
