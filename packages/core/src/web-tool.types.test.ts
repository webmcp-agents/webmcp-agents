import type { StandardSchemaV1 } from "@standard-schema/spec";
import { describe, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { defineWebTool, type WebToolContext } from "./web-tool";

/**
 * Mirrors the shape of Mastra's `createTool` config. Mastra's real type is
 * checked in Phase 5 when `@mastra/client-js` is optionally tried; this mirror
 * documents the contract.
 */
type MastraLikeToolConfig<I, O> = {
  id: string;
  description: string;
  inputSchema?: StandardSchemaV1<unknown, I>;
  outputSchema?: StandardSchemaV1<unknown, O>;
  // biome-ignore lint/suspicious/noExplicitAny: Mastra types its execution context loosely
  execute?: (input: I, context: any) => Promise<O>;
};

describe("WebTool types", () => {
  it("is assignable to a Mastra-style tool config", () => {
    const tool = defineWebTool({ id: "x", description: "d", inputSchema: z.object({ a: z.string() }), execute: async ({ a }) => a.length });
    expectTypeOf(tool).toExtend<MastraLikeToolConfig<{ a: string }, number>>();
  });

  it("infers execute's input from the schema", () => {
    defineWebTool({
      id: "x",
      description: "d",
      inputSchema: z.object({ a: z.string(), n: z.number().optional() }),
      execute: (input, ctx) => {
        expectTypeOf(input).toEqualTypeOf<{ a: string; n?: number | undefined }>();
        expectTypeOf(ctx).toEqualTypeOf<WebToolContext>();
      },
    });
  });

  it("`sensitive` takes the input's own parameter names, as a list or per side", () => {
    const inputSchema = z.object({ fullName: z.string(), passport: z.string() });
    defineWebTool({ id: "x", description: "d", inputSchema, sensitive: ["passport"], execute: () => 1 });
    const tool = defineWebTool({
      id: "x",
      description: "d",
      inputSchema,
      sensitive: { input: ["passport"], output: ["bookingReference"], hideFromModel: true },
      execute: () => 1,
    });
    expectTypeOf(tool.sensitive).toExtend<
      readonly string[] | { input?: readonly string[]; output?: readonly string[]; hideFromModel?: boolean } | undefined
    >();
    // @ts-expect-error a parameter the schema doesn't have
    defineWebTool({ id: "x", description: "d", inputSchema, sensitive: ["pasport"], execute: () => 1 });
    // @ts-expect-error hideFromModel is a flag
    defineWebTool({ id: "x", description: "d", inputSchema, sensitive: { hideFromModel: "yes" }, execute: () => 1 });
    // an untyped (JSON Schema) input takes any name
    defineWebTool({ id: "x", description: "d", inputSchema: { type: "object" }, sensitive: ["anything"], execute: () => 1 });
  });
});
