import { mkdtempSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineWebAgent } from "../src/agent";
import { webAgentsChatDev } from "../src/vite";

let server: ViteDevServer;
let base: string;

beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: mkdtempSync(join(tmpdir(), "wa-chat-")),
    logLevel: "silent",
    server: { port: 0, host: "127.0.0.1" },
    plugins: [
      webAgentsChatDev({
        handler: async (req) => {
          const url = new URL(req.url);
          if (url.searchParams.has("cookies")) {
            const headers = new Headers({ "content-type": "application/json" });
            headers.append("set-cookie", "a=1; Path=/api/chat; HttpOnly");
            headers.append("set-cookie", "b=2; Path=/api/chat; HttpOnly");
            return new Response(JSON.stringify({ cookie: req.headers.get("cookie") }), { headers });
          }
          if (url.searchParams.has("stream")) {
            const enc = new TextEncoder();
            return new Response(
              new ReadableStream({
                start(c) {
                  c.enqueue(enc.encode("data: one\n\n"));
                  c.enqueue(enc.encode("data: two\n\n"));
                  c.close();
                },
              }),
              { headers: { "content-type": "text/event-stream" } },
            );
          }
          return Response.json({ method: req.method, path: url.pathname, body: req.method === "POST" ? await req.text() : null });
        },
      }),
    ],
  });
  await server.listen();
  base = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

describe("webAgentsChatDev", () => {
  it("passes requests to the handler with the full path and body", async () => {
    const res = await fetch(`${base}/api/chat`, { method: "POST", body: '{"hi":1}' });
    expect(await res.json()).toEqual({ method: "POST", path: "/api/chat", body: '{"hi":1}' });
    expect(await (await fetch(`${base}/api/chat`)).json()).toMatchObject({ method: "GET", path: "/api/chat" });
  });

  it("passes every Set-Cookie out and the Cookie header in (chat sessions)", async () => {
    const res = await fetch(`${base}/api/chat?cookies`, { headers: { cookie: "web_agents_session=v1.x" } });
    expect(res.headers.getSetCookie()).toEqual(["a=1; Path=/api/chat; HttpOnly", "b=2; Path=/api/chat; HttpOnly"]);
    expect(await res.json()).toEqual({ cookie: "web_agents_session=v1.x" });
  });

  it("streams the response body through", async () => {
    const res = await fetch(`${base}/api/chat?stream`);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(await res.text()).toBe("data: one\n\ndata: two\n\n");
  });

  it("leaves other paths to Vite", async () => {
    expect((await fetch(`${base}/api/chat-other`)).status).toBe(404);
    expect((await fetch(`${base}/api/other`)).status).toBe(404);
  });
});

describe("webAgentsChatDev secret guard", () => {
  const rootWith = (env: string): string => {
    const root = mkdtempSync(join(tmpdir(), "wa-chat-env-"));
    writeFileSync(join(root, ".env.local"), env);
    return root;
  };
  const start = (root: string, secretGuard?: boolean) =>
    createServer({
      configFile: false,
      root,
      logLevel: "silent",
      server: { port: 0, host: "127.0.0.1" },
      plugins: [webAgentsChatDev({ handler: async () => new Response("ok"), secretGuard })],
    });

  it("refuses to start when a VITE_ variable looks like a secret", async () => {
    await expect(start(rootWith("VITE_OPENAI_API_KEY=sk-test\nVITE_PUBLIC_FLAG=1\n"))).rejects.toThrow(/VITE_OPENAI_API_KEY/);
  });

  it("lets public VITE_ variables and server-side keys through, and can be switched off", async () => {
    const ok = await start(rootWith("VITE_PUBLIC_FLAG=1\nANTHROPIC_API_KEY=sk-test\n"));
    await ok.close();
    const off = await start(rootWith("VITE_X_TOKEN=abc\n"), false);
    await off.close();
  });
});

describe("webAgentsChatDev default handler", () => {
  it("registers the page's agents and forwards provider keys from .env files", async () => {
    const root = mkdtempSync(join(tmpdir(), "wa-chat-agents-"));
    writeFileSync(join(root, ".env.local"), "OPENAI_API_KEY=k\nWEB_AGENTS_MODEL=openai/gpt-5.5\n");
    const dev = await createServer({
      configFile: false,
      root,
      logLevel: "silent",
      server: { port: 0, host: "127.0.0.1" },
      plugins: [webAgentsChatDev({ agents: [defineWebAgent({ id: "shopper", instructions: "s" })] })],
    });
    await dev.listen();
    const port = (dev.httpServer!.address() as AddressInfo).port;
    expect(await (await fetch(`http://127.0.0.1:${port}/api/chat`)).json()).toEqual({
      enabled: true,
      model: "openai/gpt-5.5",
      provider: "openai",
      agents: ["shopper"],
    });
    await dev.close();
  });
});
