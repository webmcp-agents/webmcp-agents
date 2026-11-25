---
description: "Creates the /api/chat endpoint as a web-standard function, (req: Request) => Promise<Response>, so it runs on Vercel, in any Node or edge server with web Request and Response, and in vite dev."
---

# `createChatHandler`

Creates the `/api/chat` endpoint as a web-standard function, `(req: Request) => Promise<Response>`, so it runs on Vercel, in any Node or edge server with web `Request` and `Response`, and in `vite dev`. One POST is one model step: the model's tool calls stream back to the browser, which runs them on the live page. Use it on the server side of [`<AgentChat>`](./agent-chat.md).

## Import

```ts
import { createChatHandler, DEFAULT_MODEL, turnstileVerify } from "@webmcp-agents/chat/server";
import type {
  AllowedTool,
  BeforeModelContext,
  TurnstileOptions,
  ChatHandlerOptions,
  ChatSessionOptions,
  ReasoningLevel,
} from "@webmcp-agents/chat/server";
```

## Example

A handler for the page's agents, a chosen model, sessions, a tool allowlist and a guard. The same file serves `GET` (is chat configured, and with which model) and `POST`.

<include meta='title="api/chat.ts"'>/_examples/shared/reference/chat/create-chat-handler.ts</include>

## Options

`createChatHandler(options?)` takes a `ChatHandlerOptions`; every option is optional. Each POST is run by an AI SDK `ToolLoopAgent` built for the request from the registered [`WebAgent`](./define-web-agent.md) the page named (instructions, tool subset, sub-agents, model), or from the plain assistant prompt.

| Name | Type | Default | Description |
|---|---|---|---|
| `model` | `LanguageModel \| string` | `env.WEB_AGENTS_MODEL ?? DEFAULT_MODEL` | The model: an AI SDK `LanguageModel` instance, or a `"<provider>/<model>"` id resolved with the provider's key from `env` (`anthropic/…`, `openai/…`, `google/…`, `deepseek/…`, `xai/…`, `mistral/…`, `openrouter/<vendor>/<model>`, or any `a/b` id through the AI Gateway: see [`resolveModel`](./resolve-model.md)). A bare `claude-…` id is Anthropic's. `DEFAULT_MODEL` is `"anthropic/claude-opus-5-5"`. |
| `system` | `string` | `DEFAULT_SYSTEM_PROMPT` | The base system prompt. Keep the default's per-code guidance if you replace it: see [system prompt](./system-prompt.md). |
| `agents` | `readonly WebAgent[]` | `[]` | The agents the page may name ([`defineWebAgent`](./define-web-agent.md)); sub-agents are found through their parents. Their instructions, tool subsets and models are read from here by id, never from the request. A request naming an agent not listed is refused with 400. |
| `maxOutputTokens` | `number` | `8192` | Output token cap per step. A thinking model's reasoning counts against it, so keep room beyond the visible reply. |
| `reasoning` | `ReasoningLevel` | `"low"` | How hard the model thinks per step (`"off"`, `"low"`, `"medium"`, `"high"`), for any provider that has the knob: see [`providerOptionsFor`](./resolve-model.md). Low keeps a chat about the page quick. |
| `effort` | `"low" \| "medium" \| "high" \| "xhigh" \| "max"` | not set | Deprecated: Anthropic's own effort levels (`xhigh` and `max` map to `high`). Wins over `reasoning` when set. |
| `maxSteps` | `number` | `8` | Tool steps per user turn. The request after the last one gets no tools, so the model sums up. Keep it equal to the cloud adapter's `maxSteps`; an agent's own `maxSteps` wins. |
| `guard` | `(req: Request) => Response \| undefined` (or a Promise) | not set | Runs first (after the method and cross-site checks); return a `Response` to end the request. For rate limits and origin checks: a public deployment needs one. |
| `beforeModel` | `(req, { agent, session }) => Response \| undefined` (or a Promise) | not set | Runs after validation, once chat is known to be enabled, right before the model call. Count budgets here, so malformed or refused requests never use them up. `session` is the request's session id (with `session` on): key per-session limits on it. |
| `session` | `boolean \| ChatSessionOptions` | `false` | Require a chat session: the page's first `GET` sets a random, signed, httpOnly cookie, and a `POST` without a valid one gets `401 session_required`. `true` or `{}` for the defaults. See [Sessions](#sessions). |
| `tools` | `readonly (string \| WebTool)[]` | not set (every tool the page sends) | The tools a page may offer the model. A tool from [`defineWebTool`](../core/define-web-tool.md) is pinned: the model gets its description and schema from the server, whatever the request says. A tool id allows a tool defined inline in a component, with the page's own (capped) description. The ids registered agents list are allowed too. Any other tool in the request is dropped. |
| `requireAgent` | `boolean` | `false` | Refuse a `POST` that names no agent (`400`), so every conversation runs with a registered agent's instructions. |
| `prepareAgent` | `(settings, { agent, request }) => settings` | not set | Tune the AI SDK `ToolLoopAgent` settings built for the request (add `prepareStep`, telemetry, middleware). The settings carry the model, the instructions and the page's tools already applied; return what to use. |
| `env` | `Record<string, string \| undefined>` | `process.env` (or `{}` without `process`) | Where the provider keys, `AI_GATEWAY_API_KEY`, `WEB_AGENTS_MODEL` and `WEB_AGENTS_SESSION_SECRET` are read. Pass it where the host does not expose `process.env`. |
| `redact` | `RedactOptions \| Redactor` | the process's redactor (`getRedactor()`) | This handler's redaction rules for everything it logs (model errors, failed requests, Turnstile) and the error text it sends back. Separate from the page's: whatever a page configures, the server follows these. Request bodies are never logged. Without it the handler reads the process's redactor at each log line, so a [`configureRedaction`](../core/configure-redaction.md) on the server applies. |
| `messages` | `ChatServerMessages` | English | The text this handler writes for the model and for clients that are not the chat UI: `toolBudget` (told to the model when the turn's tool budget is spent), `notOnPage` (the result of a call to a tool that is not on the page: a template with `{tool}`, or a function; keep its `Error [unavailable]:` code), `serverError` (a 500's `message`). A function that throws falls back to English. The chat UI words its own errors by code ([error codes](./chat-error-codes.md)); `SERVER_MESSAGES` holds the defaults. |

### Sessions

`session` takes `true` or a `ChatSessionOptions`:

| Name | Type | Default | Description |
|---|---|---|---|
| `secret` | `string` | `env.WEB_AGENTS_SESSION_SECRET`, else random per process | The HMAC key, at least 32 characters (a shorter one throws). Every server instance must share it: on serverless hosts set `WEB_AGENTS_SESSION_SECRET` (`openssl rand -base64 32`). The per-process fallback is for one dev server. |
| `ttl` | `number` | `1800` | Seconds a session lives without a request. A `POST` past half of it renews the cookie (same id). |
| `maxAge` | `number` | `86400` | Seconds after which a session is not renewed any more, so the page starts a new one. |
| `cookie` | `string` | `"web_agents_session"` | The cookie's name. |
| `verify` | `(req: Request) => boolean` (or a Promise) | every `GET` | Whether this `GET` may start a session: the place for any bot check (Vercel BotID, your own). Refused, no cookie is set and the page's `POST`s get `401`. |
| `turnstile` | `boolean \| TurnstileOptions` | off | Require a solved [Cloudflare Turnstile](#turnstile) challenge to start a session. `true` reads the secret from `TURNSTILE_SECRET_KEY`; without one, creating the handler throws. With `verify` too, both must pass. |

The cookie is `HttpOnly; SameSite=Strict`, its path is the endpoint's, and it is `Secure` over https. The token is
`v1.<id>.<expires>.<born>.<signature>`: 128 random bits and an HMAC-SHA256 signature, so the server keeps no store. The
[cloud adapter](./create-cloud-adapter.md) needs no change: its availability check is the `GET`, and a `401
session_required` makes it start a session and retry once.

### Turnstile

With `turnstile` on, a session starts only from a `GET` carrying a token Cloudflare accepts. The page gets one with
[`turnstileHeaders`](./create-cloud-adapter.md#turnstile) only when it needs a session (the first message, or after one
expired), so a visitor who never chats loads nothing. The server posts the token and the secret to Cloudflare's
siteverify and sets the cookie on success. A `GET` without the header never calls Cloudflare. A token is single-use, so
it starts exactly one session; later messages ride on the cookie.

`TurnstileOptions` (also `turnstileVerify(options, env)`, a plain `verify` function):

| Name | Type | Default | Description |
|---|---|---|---|
| `secret` | `string` | `env.TURNSTILE_SECRET_KEY` | The widget's secret key. |
| `header` | `string` | `"x-turnstile-token"` | The request header carrying the token. |
| `hostname` | `string \| readonly string[]` | any | Accept only tokens solved on these hostnames. |
| `action` | `string` | any | Accept only tokens rendered with this action (`turnstileHeaders` sends `"web_agents_chat"`). |
| `timeout` | `number` | `5000` | Milliseconds to wait for siteverify. |

It fails closed: a missing token, a rejected one, a network error or a timeout starts no session. Cloudflare's test keys
work end to end: site key `1x00000000000000000000AA` with secret `1x0000000000000000000000000000000AA` always passes,
secret `2x0000000000000000000000000000000AA` always fails.

## Returns

A handler. By method, in order:

| Request | Response |
|---|---|
| `OPTIONS` | `204` |
| Anything but `GET` or `POST` | `405 { error: "method_not_allowed" }` |
| A browser request from another origin (`Origin` differs) | `403 { error: "forbidden" }` |
| `guard` returned a `Response` | That response |
| `GET` | `{ enabled, model, provider, agents }`: `enabled` is true with a model instance or the key the model needs; `agents` lists the registered ids |
| `GET` with `session` on and chat enabled | Also a `Set-Cookie` starting a session (unless `verify` refused), or renewing a live one that is due |
| `POST`, no key for the model (and no instance) | `503 { error: "chat_disabled", message }`, the message naming the env var(s) to set |
| `POST` with `session` on and no valid session cookie | `401 { error: "session_required" }`, before the body is read |
| Not `application/json` | `415 bad_request` |
| Body over 1 MB (counted while streaming) | `413 bad_request` |
| Body not JSON | `400 bad_request` |
| Fails [`chatRequestSchema`](./chat-request-schema.md) | `400 { error: "bad_request", issues }` (the first 10) |
| Names an agent not in `agents` | `400 { error: "bad_request", message: 'Unknown agent "…"' }` |
| Names no agent, with `requireAgent` | `400 { error: "bad_request", message: "Name an agent: …" }` |
| `beforeModel` returned a `Response` | That response |
| The provider package is not installed | `503 { error: "chat_disabled", message: "Install @ai-sdk/… on the server …" }` |
| OK | An AI SDK UI message stream (SSE), reasoning included |
| The model call throws before streaming | `500 { error: "server_error" }` |

## Notes

- **A public deployment needs `guard`, `session` and `tools`.** Cross-site browser requests are refused, but anyone can still call the endpoint directly (requests without `Origin` pass).
- **What a session proves, and what it doesn't.** A `POST` needs a cookie this server issued, and every request belongs to a session you can count. A script that keeps cookies can still `GET` first: only `verify` (a bot check) makes starting a session cost a real browser. Nothing can prove a request came from your page.
- **What the allowlist covers.** No tool reaches the model unless the server listed it, and listed `defineWebTool` tools can't be redescribed by a request. The chat still works with no tools at all (the model just talks); the default system prompt keeps it to the site and has it decline anything unrelated. The messages themselves are the caller's: limits and budgets bound what they cost.
- Page tools are declared without `execute`, with control characters stripped from descriptions and `$schema` and `$id` removed from schemas. Tool descriptions go in tool definitions only, never the system prompt.
- Of the page, only its path reaches the prompt, and only from a same-origin browser request.
- When the turn already has `maxSteps` assistant messages with tool calls, the request gets no tools and the system prompt asks for a summary.
- With a model id the request carries that provider's reasoning options (Anthropic: `effort` and `fallbacks: "default"`). With a model instance none are set, and no provider SDK is loaded.
- A named agent: its instructions and the delegation note go into the system prompt, its `tools` filter and delegate tools shape the tool set (delegate descriptors sent by the page are ignored and rebuilt), its `model` is resolved with the server's keys, and its `maxSteps` bounds the turn.
- Provider metadata on tool calls (Gemini thought signatures, OpenAI item ids) round-trips through the conversation like reasoning signatures.
- A call to an unknown tool, or with invalid input, goes back to the model as that call's error (`Error [unavailable]: …`, `Error [invalid_input]: …`). Other model errors are logged and streamed as "The assistant had a problem answering. Try again."
- The provider SDKs (`@ai-sdk/anthropic`, `@ai-sdk/openai`, …, `@openrouter/ai-sdk-provider`) are optional peer dependencies: install the one your model id needs on the server. The gateway needs none.
- The example apps wrap the handler with origin, rate-limit and budget guards through [`createVercelChatRoute`](../vercel-api/create-vercel-chat-route.md).

## See also

- [Add the chat](../../build/add-the-chat.mdx), the page that teaches it
- [`defineWebAgent`](./define-web-agent.md), [`toToolLoopAgent`](./to-tool-loop-agent.md) and [`resolveModel`](./resolve-model.md)
- [`webAgentsChatDev`](./web-agents-chat-dev.md), the same endpoint in `vite dev`
- [`chatRequestSchema` and `LIMITS`](./chat-request-schema.md)
- [`buildSystemPrompt` and `DEFAULT_SYSTEM_PROMPT`](./system-prompt.md)
- [`createCloudAdapter`](./create-cloud-adapter.md), the client side
- [Tool error codes](../core/tool-error.md)
