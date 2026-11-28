---
description: "Builds the /api/chat handlers for a Vercel Function: @webmcp-agents/chat's handler behind origin and per-IP guards, with a global daily budget on model calls."
---

# `createVercelChatRoute`

Builds the `/api/chat` handlers for a Vercel Function: `@webmcp-agents/chat`'s handler with chat sessions and a tool allowlist, behind origin and per-IP guards, with per-session limits and a global daily budget on model calls. Reach for it in the example apps' `api/chat.ts`; every limit is an environment variable. The package is private and not published to npm.

## Import

```ts
import { createVercelChatRoute } from "@webmcp-agents/vercel-api";
import type { VercelChatRouteOptions } from "@webmcp-agents/vercel-api";
```

## Example

The route file of an example app, with the agents the page passes to `<AgentChat>`:

<include meta='title="api/chat.ts"'>/_examples/shared/reference/vercel-api/create-vercel-chat-route.ts</include>

## Options

`createVercelChatRoute(options)` takes a `VercelChatRouteOptions`.

| Name | Type | Default | Description |
|---|---|---|---|
| `app` | `string` | required | Namespaces the rate-limit keys per app (`<app>:minute`, `<app>:day`, `<app>:session`, `<app>:global`), so apps sharing one Redis do not share counts. |
| `env` | `Env` | `process.env` | Where every variable below is read. Also passed to the chat handler, which reads the provider's API key from it. |
| `model` | `LanguageModel \| string` | `env.WEB_AGENTS_MODEL`, else `"anthropic/claude-sonnet-5-5"` | A model instance, or a `"<provider>/<model>"` id (see [`resolveModel`](../chat/resolve-model.md)). |
| `agents` | `readonly WebAgent[]` | none | The page's agents ([`defineWebAgent`](../chat/define-web-agent.md)): the same list the page passes to `<AgentChat>`, so the server knows each agent's instructions. With agents, a request must name one (`requireAgent`). |
| `tools` | `readonly (string \| WebTool)[]` | every tool the page sends | The tools the page may offer the model: the app's `defineWebTool` tools (pinned) and the ids of tools defined inline in components. See [`createChatHandler`](../chat/create-chat-handler.md)'s `tools`. |
| `session` | `false \| ChatSessionOptions` | `{}` (on) | Chat sessions; Turnstile gates them when `TURNSTILE_SECRET_KEY` is set, and `verify` adds any other check. The secret is `WEB_AGENTS_SESSION_SECRET`. See [Sessions](../chat/create-chat-handler.md#sessions). |
| `observability` | `Observability` | the instance's shared layer | The layer that exports the chat's spans (`defineObservability()` from `@webmcp-agents/telemetry/server`), when the app owns it to share with its own `/api/telemetry` route (`examples/nextjs`). Default: one layer per function instance, off without the `OTEL_*` variables. |

### Environment variables

Numeric variables that are missing, not a number, or not greater than 0 fall back to the default.

| Name | Type | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, … | `string` | none | The key of the provider in `WEB_AGENTS_MODEL` (see [`resolveModel`](../chat/resolve-model.md)). Without it `GET` reports `enabled: false` and `POST` answers 503 `chat_disabled`, naming the variable. |
| `AI_GATEWAY_API_KEY` | `string` | none | Serves any `a/b` model id through the AI Gateway when the provider's own key is missing. |
| `WEB_AGENTS_MODEL` | `string` | `"anthropic/claude-sonnet-5-5"` | The model, as `<provider>/<model>`, when `model` is not passed. |
| `WEB_AGENTS_MAX_OUTPUT_TOKENS` | `number` | `4096` | Output token cap per model step. Thinking counts against it. |
| `WEB_AGENTS_MAX_STEPS` | `number` | `6` | Tool steps per user turn. |
| `RATE_LIMIT_PER_MINUTE` | `number` | `30` | Requests per IP per minute (fails open). |
| `RATE_LIMIT_PER_DAY` | `number` | `300` | Requests per IP per day (fails open). |
| `RATE_LIMIT_PER_SESSION` | `number` | `150` | Requests per chat session per day (fails open). Past it, the page needs a new session. |
| `RATE_LIMIT_GLOBAL_DAILY` | `number` | `3000` | Model calls per day across all visitors (fails closed). |
| `TURNSTILE_SECRET_KEY` | `string` | none | Turns on Cloudflare Turnstile for new sessions (`session.turnstile`). The page sends the token with [`turnstileHeaders`](../chat/create-cloud-adapter.md#turnstile) and the widget's public site key (`VITE_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in the examples). |
| `WEB_AGENTS_SESSION_SECRET` | `string` | random per instance | Signs the session cookies, 32+ characters, the same on every instance. Required when `VERCEL_ENV` is `production` or `preview`: without it chat stays off (`GET` says `enabled: false`, `POST` gets 503 `chat_disabled`) and the function log says so. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | `string` | none | Upstash Redis for the limiters; `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` also work. Without them limits are per function instance. |

## Returns

`{ GET, POST, OPTIONS }`, all the same handler: `(req: Request) => Promise<Response>`. Export them from the function file.

## Notes

- Env is read when the route is created (the function's cold start), not at import time.
- Each tool step is one request: a 6-step turn is 7. The per-minute limit must leave room for a few turns.
- The per-session limit and the budget are checked in the handler's `beforeModel` hook, after validation, so malformed requests never use them up.
- The per-IP limiters fail open (a Redis outage must not take the chat down). The global budget fails closed (an outage must not turn into an unbounded bill); the chat then answers 503 with reason `busy`.
- The step cap is counted from the conversation the browser sends, so a scripted caller can sidestep it. The budget is what bounds the bill.
- Never prefix these variables with `VITE_`: Vite ships `VITE_*` variables to the browser.
- The example apps (`examples/playground`, `examples/ecommerce`, `examples/flights`) use the package as a workspace dependency.

## See also

- [Deploy](../../more/deploy.md), where the environment variables are set
- [Guards](./guards.md) and [`createLimiter`](./limiter.md), the parts it is made of
- [`createChatHandler`](../chat/create-chat-handler.md), the handler it wraps
