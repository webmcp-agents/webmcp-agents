import { APICallError, RetryError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { createChatHandler } from "../src/server/handler";
import { describeModelError } from "../src/server/model-error";

const apiError = (statusCode: number, message: string) =>
  new APICallError({ message, url: "https://api.example.com/v1/responses", requestBodyValues: {}, statusCode, isRetryable: false });

describe("describeModelError", () => {
  it.each([
    [429, "You have no credits remaining. Add credits to continue.", "out of credits"],
    [400, "Your credit balance is too low to access the Anthropic API.", "out of credits"],
    [402, "Payment required", "out of credits"],
    [401, "Incorrect API key provided", "rejected the server's API key"],
    [404, "The model `gpt-9` does not exist", "doesn't offer the model"],
    [429, "Rate limit reached for requests", "rate-limiting"],
    [503, "Service unavailable", "having trouble"],
  ])("%i %s → %s", (status, text, expected) => {
    const prod = describeModelError(apiError(status, text), false);
    expect(prod.message).toContain(expected);
    expect(prod.message).not.toContain(text);
    expect(prod.log).toBe(`${status} from https://api.example.com/v1/responses: ${text}`);
    expect(describeModelError(apiError(status, text), true).message).toContain(`(${status} ${text})`);
  });

  it("looks through AI SDK's retry wrapper, and keeps unknown errors generic in production", () => {
    const retried = new RetryError({
      message: "failed after 3 attempts",
      reason: "maxRetriesExceeded",
      errors: [apiError(401, "bad key")],
    });
    expect(describeModelError(retried, false).message).toContain("API key");
    expect(describeModelError(new Error("boom"), false).message).toBe("The assistant had a problem answering. Try again.");
    expect(describeModelError(new Error("boom"), true).message).toContain("(boom)");
  });

  it("the handler streams the description as the error part", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw apiError(429, "You have no credits remaining.");
      },
    });
    const res = await createChatHandler({ model })(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] }], tools: [] }),
      }),
    );
    const body = await res.text();
    expect(body).toContain('"type":"error"');
    expect(body).toContain("out of credits");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("429 from https://api.example.com/v1/responses: You have no credits"));
    error.mockRestore();
  });
});
