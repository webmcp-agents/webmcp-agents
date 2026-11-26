/**
 * One backend screenshot for the observability docs, from a real trace: `pnpm capture:backend <jaeger|phoenix|lgtm>`.
 *
 * Starts the backend in Docker (one at a time: each binds OTLP on 4318), runs Field Store on Next.js (examples/nextjs)
 * on port 5186 with its spans sent there and the scripted model (scripted-model.mjs) in place of a model key, drives
 * one agent turn in Playwright's Chromium, opens the backend's trace view and saves a still, then stops the
 * containers. The still lands in capture/out/backends/ and is copied to docs/media/observability/<backend>.png.
 * Not part of `pnpm check` or `pnpm capture`: it needs Docker and pulls the images below on first use.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

/** Each backend: its containers, where OTLP goes, and the URL that answers once it is up. */
const BACKENDS = {
  jaeger: {
    ready: "http://localhost:16686/",
    containers: [{ name: "wa-capture-jaeger", image: "jaegertracing/jaeger:2.23.0", ports: ["16686:16686", "4318:4318"] }],
  },
  // Phoenix takes OTLP as protobuf only; the app sends JSON, so a Collector in front converts it (its otlp_http
  // exporter sends protobuf), as a Collector would in production. It reaches Phoenix through the host
  // (host.docker.internal), not a network of their own, so the capture needs no Docker network.
  phoenix: {
    ready: "http://localhost:6006/",
    containers: [
      {
        name: "wa-capture-phoenix",
        image: "arizephoenix/phoenix:version-22.1.0",
        ports: ["6006:6006"],
        // a throwaway local instance: no sign-in, so the Collector and the capture need no key
        env: ["PHOENIX_ENABLE_AUTH=false"],
      },
      {
        name: "wa-capture-collector",
        image: "otel/opentelemetry-collector:0.166.0",
        ports: ["4318:4318"],
        volumes: [`${join(here, "phoenix-collector.yaml")}:/etc/otelcol/config.yaml:ro`],
      },
    ],
  },
  lgtm: {
    ready: "http://localhost:3000/api/health",
    containers: [{ name: "wa-capture-lgtm", image: "grafana/otel-lgtm:0.41.1", ports: ["3000:3000", "4318:4318"] }],
  },
};

const backend = process.argv[2];
const spec = BACKENDS[backend];
if (!spec) {
  console.error(`usage: pnpm capture:backend <${Object.keys(BACKENDS).join("|")}>`);
  process.exit(1);
}

const docker = (args, options = {}) => execFileSync("docker", args, { stdio: "inherit", ...options });
const stop = () => {
  for (const c of spec.containers) spawnSync("docker", ["rm", "-f", c.name], { stdio: "ignore" });
};

async function waitFor(url, ms = 180_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${backend} did not answer at ${url}`);
}

stop();
let status = 1;
try {
  for (const c of spec.containers) {
    const args = ["run", "-d", "--rm", "--name", c.name];
    for (const p of c.ports) args.push("-p", p);
    for (const v of c.volumes ?? []) args.push("-v", v);
    for (const e of c.env ?? []) args.push("-e", e);
    docker([...args, c.image]);
  }
  await waitFor(spec.ready);
  console.log(`${backend} is up`);
  // the example consumes the packages' dist: build what it depends on (cached by Turbo)
  execFileSync("pnpm", ["turbo", "run", "build", "--filter=@webmcp-agents/example-nextjs^..."], { cwd: root, stdio: "inherit" });
  const run = spawnSync("pnpm", ["exec", "playwright", "test", "-c", "capture/backends/playwright.config.ts"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, CAPTURE_BACKEND: backend },
  });
  status = run.status ?? 1;
  const still = join(here, "..", "out", "backends", `${backend}.png`);
  if (status === 0 && existsSync(still)) {
    const media = join(root, "docs", "media", "observability");
    mkdirSync(media, { recursive: true });
    copyFileSync(still, join(media, `${backend}.png`));
    console.log(`still  observability/${backend}.png`);
  }
} finally {
  stop();
}
process.exit(status);
