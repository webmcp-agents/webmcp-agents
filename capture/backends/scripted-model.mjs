/**
 * A scripted stand-in for the Anthropic Messages API, so a backend capture needs no model key. The example app talks
 * to it through its real provider (`ANTHROPIC_BASE_URL`): step 1 calls `get_cart`, step 2 (once a tool result is in
 * the prompt) answers in text. Everything else in the turn is real: the chat handler, the telemetry layer, the relay,
 * the page and its tool. Streams Server-Sent Events as the API does.
 *
 *   node capture/backends/scripted-model.mjs [port]   (default 18089)
 */
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? process.env.SCRIPTED_MODEL_PORT ?? 18089);

const event = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;

/** Whether the conversation already holds a tool result: then the model answers instead of calling a tool. */
const hasToolResult = (body) =>
  (body.messages ?? []).some((m) => Array.isArray(m.content) && m.content.some((part) => part?.type === "tool_result"));

function stream(res, body) {
  const model = body.model ?? "claude-sonnet-5-5";
  const answer = hasToolResult(body);
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  res.write(
    event("message_start", {
      message: {
        id: `msg_${Date.now()}`,
        type: "message",
        role: "assistant",
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: answer ? 1284 : 1196, output_tokens: 1 },
      },
    }),
  );
  if (answer) {
    const text = "I checked your cart: it is empty. Want me to find something for you?";
    res.write(event("content_block_start", { index: 0, content_block: { type: "text", text: "" } }));
    res.write(event("content_block_delta", { index: 0, delta: { type: "text_delta", text } }));
    res.write(event("content_block_stop", { index: 0 }));
    res.write(event("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 18 } }));
  } else {
    const id = `toolu_${Date.now()}`;
    res.write(event("content_block_start", { index: 0, content_block: { type: "tool_use", id, name: "get_cart", input: {} } }));
    res.write(event("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: "{}" } }));
    res.write(event("content_block_stop", { index: 0 }));
    res.write(event("message_delta", { delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 31 } }));
  }
  res.end(event("message_stop", {}));
}

createServer((req, res) => {
  if (req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
    return;
  }
  if (req.method !== "POST" || !req.url?.endsWith("/messages")) {
    res.writeHead(404, { "content-type": "application/json" }).end('{"type":"error"}');
    return;
  }
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => {
    let body = {};
    try {
      body = JSON.parse(raw);
    } catch {
      // an empty or broken body still gets the first step
    }
    console.log(`scripted model: ${hasToolResult(body) ? "answer" : "call get_cart"}`);
    stream(res, body);
  });
}).listen(port, () => console.log(`scripted model on http://localhost:${port}/v1`));
