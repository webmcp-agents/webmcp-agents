# Docs media

Screenshots and clips of the example apps, the agent cursor, the devtools and the chat, embedded by the docs pages and
the README. Everything here is generated:

```bash
pnpm capture        # starts the four example apps, records with Playwright's Chromium, encodes with ffmpeg
```

`capture/*.capture.ts` take the stills (reduced motion: the cursor snaps) and the clips (motion on, video recording);
`capture/encode.mjs` copies the stills here as PNG (the docs site converts them to WebP), encodes clips to WebM + MP4
(≤ 1.5 MB each) and the hero clip to `hero.gif` (≤ 3 MB, for GitHub). `capture/gifs.mjs` then makes the README's
GIFs (GitHub plays no video stored in the repository): `cursor/*.gif` from the cursor clips and `demo/*.gif` from the
site's recorded demos (`apps/docs/public/demo`, re-recorded by `apps/docs/scripts/record-demo.sh`); `node
capture/gifs.mjs` alone re-makes them.

The chat stills that need a live model (`chat/tool-card.png`, `chat/subagent.png`) are only produced when
`examples/ecommerce/.env.local` holds a provider key; the picker still needs none.

`observability/*.png` are real traces in a backend running in Docker, one command each (not part of `pnpm capture`):

```bash
pnpm capture:backend jaeger    # jaegertracing/jaeger
pnpm capture:backend phoenix   # arizephoenix/phoenix, behind an OpenTelemetry Collector (it takes protobuf only)
pnpm capture:backend lgtm      # grafana/otel-lgtm (Grafana, Tempo)
```

`capture/backends/run.mjs` starts the backend, runs Field Store on Next.js on port 5186 with its spans sent there and a
scripted stand-in for the model (`capture/backends/scripted-model.mjs`, so no key is needed), drives one agent turn,
saves the backend's trace view and stops the containers. One backend at a time: each binds OTLP on 4318.
