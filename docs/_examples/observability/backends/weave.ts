import { defineObservability } from "@webmcp-agents/telemetry/server";

// The endpoint, key and protocol come from the environment.
export const observability = defineObservability({
  // Weave files traces under this entity and project.
  resourceAttributes: {
    "wandb.entity": "my-team",
    "wandb.project": "field-store",
  },
  // Weave groups turns into threads by this key.
  metadataMapping: { "webmcp.conversation.id": "wandb.thread_id" },
});
