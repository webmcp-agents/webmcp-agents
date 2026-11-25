---
description: "An adapter's name in the page's language: built-in adapters are worded from the catalog, any other shows its own label."
---

# `adapterLabel`

Returns an adapter's name as the switcher shows it: a built-in adapter that describes itself (`labelParts`) is worded
from the catalog (`adapter.cloud`, `adapter.cloudNamed`, `adapter.onDevice`); any other adapter, or one given an
explicit `label`, shows its `label`. Use it in a switcher or menu of your own.

## Import

```ts
import { adapterLabel } from "@webmcp-agents/chat";
```

## Example

```tsx
const { adapters, t } = useAgentChat({ messages: es, locale: "es" });

adapters.map((a) => <option key={a.id}>{adapterLabel(a, t)}</option>);
// "Claude (nube)", …
```

## Options

`adapterLabel(adapter, t)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `adapter` | `AgentAdapter` | required | The adapter. |
| `t` | `Translate` | required | The translate function ([`createTranslator`](./create-translator.md), or `useAgentChat().t`). |

## Returns

`string`: the worded name.

## See also

- [Adapter types](./adapter-types.md), `labelParts`
- [`ChatMessages`](./chat-messages.md), `adapter`
