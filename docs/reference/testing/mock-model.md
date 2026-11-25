---
description: "A scripted AI SDK model for createChatHandler: no provider key, no network."
---

# `mockModel`

A model (`MockLanguageModelV4` from `ai/test`) that plays steps, one per call, for `createChatHandler({ model })`. `model.calls[n]` is what call `n` was offered (`tools`) and sent (`prompt`).

## Import

```ts
import { mockModel, text, toolCall } from "@webmcp-agents/testing/server";
```

## Example

<include meta='title="endpoint.test.ts"'>/_examples/testing/endpoint.test.ts</include>

## Options

`mockModel(steps)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `steps` | `StepInput[]` | required | The steps, one per model call; the last repeats. `[]`: a model that must never be called. |

## Returns

A `MockModel`: the model, with `calls`.

## Notes

It takes the same steps as [`mockAdapter`](./mock-adapter.md). `mockModel([])` is a model that must never be called: a call fails with a sentence. The `./server` entry needs `ai`: importing it without `ai` fails with a sentence naming it.

## See also

- [`chatRequest`](./server-requests.md)
- [`createChatHandler`](../chat/create-chat-handler.md)
