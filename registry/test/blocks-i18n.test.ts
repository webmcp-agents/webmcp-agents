/**
 * The registry blocks word everything through the chat's catalog (R-CHAT-4, "the registry blocks"): no visible
 * string of their own, `messages` / `locale` handed to `useAgentChat`, `classNames` applied per part, and
 * `data-wa-part` hooks named like `<AgentChat>`'s. Read with the TypeScript parser, so a string in any JSX position
 * is found.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { CHAT_PARTS } from "../../packages/chat/src/customize/parts";

const here = dirname(fileURLToPath(import.meta.url));
const BLOCKS = ["agent-chat", "agent-tool", "agent-subagent", "agent-reasoning", "agent-model-selector"];
const READ = new Set(["aria-label", "placeholder", "title", "alt"]);

/** Every string a person could read that the block wrote itself: JSX text, read attributes, string children. */
function hardcoded(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node) && /\p{L}/u.test(node.text.trim())) out.push(`text "${node.text.trim()}"`);
    if (ts.isJsxAttribute(node) && READ.has(node.name.getText(sf))) {
      const init = node.initializer;
      const literal =
        init &&
        (ts.isStringLiteral(init)
          ? init
          : ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)
            ? init.expression
            : undefined);
      if (literal && /\p{L}/u.test(literal.text)) out.push(`${node.name.getText(sf)}="${literal.text}"`);
      if (init && ts.isJsxExpression(init) && init.expression && ts.isTemplateExpression(init.expression))
        out.push(`${node.name.getText(sf)}={\`…\`}`);
    }
    // a string literal as a JSX child or a conditional's branch inside JSX
    if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteralLike(node.expression) && /\p{L}/u.test(node.expression.text))
      out.push(`{"${node.expression.text}"}`);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

describe("registry blocks: every string from the chat's catalog", () => {
  it.each(BLOCKS)("%s has no string of its own", (block) => {
    expect(hardcoded(join(here, "..", "default", block, `${block}.tsx`))).toEqual([]);
  });

  it("the chat block takes messages, locale and classNames, and hands them on", () => {
    const source = readFileSync(join(here, "..", "default", "agent-chat", "agent-chat.tsx"), "utf8");
    expect(source).toMatch(/classNames\?: Partial<Record<ChatPart, string>>/);
    expect(source).toMatch(/useAgentChat\(\{[\s\S]*?messages,[\s\S]*?locale,[\s\S]*?\}\)/);
    expect(source).toMatch(/dir=\{directionOf\(t\.locale\)\}/);
    // the standalone blocks fall back to English through the same translator
    for (const block of ["agent-tool", "agent-subagent", "agent-reasoning", "agent-model-selector"]) {
      expect(readFileSync(join(here, "..", "default", block, `${block}.tsx`), "utf8"), block).toContain("createTranslator()");
    }
  });

  it("every data-wa-part a block writes is one of <AgentChat>'s part names, with a matching classNames entry in the chat block", () => {
    const parts = new Set<string>(CHAT_PARTS);
    for (const block of BLOCKS) {
      const source = readFileSync(join(here, "..", "default", block, `${block}.tsx`), "utf8");
      for (const [, name] of source.matchAll(/data-wa-part="(\w+)"/g)) expect(parts.has(name!), `${block}: ${name}`).toBe(true);
    }
    const chat = readFileSync(join(here, "..", "default", "agent-chat", "agent-chat.tsx"), "utf8");
    const written = [...chat.matchAll(/data-wa-part="(\w+)"/g)].map((m) => m[1]!);
    const styled = new Set([...chat.matchAll(/classNames\.(\w+)/g)].map((m) => m[1]!));
    // the text-only parts have no class of their own to add
    const missing = written.filter((p) => !styled.has(p) && !["errorText", "root"].includes(p));
    expect(missing).toEqual([]);
  });
});
