# @webmcp-agents/vercel-api

Private, never published. The examples' `/api/chat` on Vercel: `createVercelChatRoute` puts an origin allow-list, a
per-IP rate limit (Upstash, or in memory without it) and a daily budget around `@webmcp-agents/chat`'s chat handler.

Used by `examples/*/api/chat.ts`. Copy the pattern for your own deployment; the options and guards are on the
reference pages: [`docs/reference/vercel-api`](../../docs/reference/vercel-api/README.md).
