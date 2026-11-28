/**
 * What a tool marks as sensitive: its `sensitive` option plus the schema's `x-sensitive` / `format: "password"`.
 * Read by the cursor (which parameters to mask), the devtools and the chat (which fields to mask, which to hide from
 * the model).
 */

/**
 * A tool's `sensitive` option. A list names fields that are sensitive wherever they appear, in the input and in the
 * result; the object form says which side, and whether the model is kept from the result's fields too.
 */
export type SensitiveOption<Input extends string = string> =
  | readonly Input[]
  | {
      /** Parameters whose values are masked in events, the devtools, the tool card, logs and telemetry. */
      input?: readonly Input[];
      /** Result fields (any depth, by name) masked in the same places. */
      output?: readonly string[];
      /**
       * Also replace the `output` fields with the token in what the model receives and in the chat's stored history.
       * The page and the person still get the value (the tool's own UI shows it). Default `false`: the model usually
       * needs the data it asked for.
       */
      hideFromModel?: boolean;
    };

/** {@link toolSensitivity}'s answer: field names, deduplicated. */
export interface ToolSensitivity {
  /** Input fields: the option's, then each schema property marked `x-sensitive: true` or `format: "password"`. */
  input: string[];
  /** Result fields. */
  output: string[];
  /** The `output` fields are hidden from the model. */
  hideFromModel: boolean;
}

/** The part of a tool {@link toolSensitivity} reads: a `WebTool`, its config, or a registered tool. */
export interface SensitiveSource {
  sensitive?: SensitiveOption;
  /** JSON Schema of the input (a `WebTool`'s `jsonSchema`). */
  jsonSchema?: unknown;
}

type SchemaNode = { properties?: Record<string, SchemaNode>; items?: SchemaNode; format?: string; "x-sensitive"?: unknown };

/**
 * The fields a tool marks as sensitive. Never throws (a schema that fails to derive counts as unmarked), and answers
 * empty lists for `undefined` (a declarative form, a tool that is not registered).
 *
 * @example
 * toolSensitivity(defineWebTool({ id: "pay", sensitive: { output: ["ref"], hideFromModel: true }, … }));
 * // { input: [], output: ["ref"], hideFromModel: true }
 */
export function toolSensitivity(tool: SensitiveSource | null | undefined): ToolSensitivity {
  const s = tool?.sensitive;
  const list = Array.isArray(s) ? (s as readonly string[]) : undefined;
  const side = list ? undefined : (s as Exclude<SensitiveOption, readonly string[]> | undefined);
  const input = [...(list ?? side?.input ?? [])];
  const visit = (node: SchemaNode | undefined, depth: number): void => {
    if (!node || typeof node !== "object" || depth > 8) return;
    for (const [name, p] of Object.entries(node.properties ?? {})) {
      if (p?.["x-sensitive"] === true || p?.format === "password") input.push(name);
      visit(p, depth + 1);
    }
    visit(node.items, depth + 1);
  };
  try {
    visit(tool?.jsonSchema as SchemaNode, 0);
  } catch {
    // a schema that cannot be derived marks nothing; the call itself reports it
  }
  return { input: [...new Set(input)], output: [...new Set(list ?? side?.output ?? [])], hideFromModel: !!side?.hideFromModel };
}
