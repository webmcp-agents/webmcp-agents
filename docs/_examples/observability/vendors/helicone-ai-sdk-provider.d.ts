// A stand-in for
// @helicone/ai-sdk-provider
// so the recipes type-check without installing it (tsconfig and
// knip.json map the name here). Read from its docs and published
// package on 2026-11-25.
import type { LanguageModel } from "ai";
export declare function createHelicone(options: {
  apiKey?: string;
}): (model: string) => LanguageModel;
