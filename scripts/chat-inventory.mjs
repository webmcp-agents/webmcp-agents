#!/usr/bin/env node
/**
 * Lists what the chat shows that a page may want to change (0.5.0, chat customization, task 3.1):
 *
 * - every user-visible string in `packages/chat/src`: JSX text, `aria-label` / `placeholder` / `title` / `alt`, the
 *   text of a live region, and the sentence-like string literals of the components, the adapters and the session (error
 *   text the person reads);
 * - every raw CSS value in `packages/chat/src/chat.css` outside a `--wa-chat-*` declaration: a color, a length, a
 *   duration, a z-index, and every physical side (`left`, `right`, `margin-left`…).
 *
 *   node scripts/chat-inventory.mjs            # both lists on stdout
 *   node scripts/chat-inventory.mjs --out dir  # writes dir/strings.txt and dir/css.txt
 *
 * Read with the TypeScript compiler's parser (no type check), so a string split over lines or inside a template is
 * found as one. The output is the inventory the message catalog and the tokens were built from: run it again after a
 * change and an empty diff (strings) or an empty list (css, outside tokens) is the check.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const src = join(root, "packages/chat/src");

/** Files whose sentence-like literals reach the person (components) or carry error text (adapter, session). */
const SCANNED = [/^components\//, /^adapter\/cloud\.ts$/, /^session\/[^/]+\.ts$/, /^customize\/[^/]+\.tsx?$/];
/** Attributes the person (or their screen reader) reads. */
const READ_ATTRS = new Set(["aria-label", "placeholder", "title", "alt", "aria-valuetext", "aria-roledescription"]);
/** Attributes and props that never hold words: class names, ids, roles, keys, data hooks. */
const SKIP_ATTRS =
  /^(className|class|id|key|role|type|htmlFor|data-[\w-]+|aria-(?!label|valuetext|roledescription)[\w-]+|viewBox|d|fill|stroke\w*|width|height|x|y|rx|focusable|rel|href|name|value|inputMode|autoComplete)$/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** A literal a person might read: words with a space, or a capitalized word, or ending in punctuation. */
const sentenceLike = (text) => /[A-Za-z]/.test(text) && (/\s/.test(text.trim()) || /^[A-Z][a-z]/.test(text) || /[.…!?]$/.test(text));
/** Literals that are code, not copy: CSS selectors and units, ids, storage keys, event names, URLs, error codes. */
const codeLike = (text) =>
  /^[\w:.-]*$/.test(text) && !/^[A-Z][a-z]+$/.test(text)
    ? true
    : /^(\[|\.|#|\(|@|\/|https?:|[a-z]+-[a-z]+:)/.test(text) || /^\w+\/\w+/.test(text);

function strings() {
  const out = [];
  for (const file of walk(src).filter((f) => /\.tsx?$/.test(f))) {
    const rel = relative(src, file);
    if (!SCANNED.some((r) => r.test(rel))) continue;
    const text = readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const at = (node) => `${relative(root, file)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
    const literal = (node) =>
      ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
        ? node.text
        : ts.isTemplateExpression(node)
          ? node.head.text + node.templateSpans.map((s) => `\${${s.expression.getText(sf)}}${s.literal.text}`).join("")
          : undefined;
    const visit = (node, inAttr) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
      // console lines are for developers, never the person
      if (ts.isCallExpression(node) && /^console\./.test(node.expression.getText(sf))) return;
      if (ts.isJsxText(node)) {
        const t = node.text.replace(/\s+/g, " ").trim();
        if (t && /[A-Za-z]/.test(t)) out.push(`${at(node)}\tjsx-text\t${t}`);
      } else if (ts.isJsxAttribute(node)) {
        const name = node.name.getText(sf);
        const init = node.initializer;
        const value =
          init &&
          (ts.isStringLiteral(init) ? init.text : ts.isJsxExpression(init) && init.expression ? literal(init.expression) : undefined);
        if (READ_ATTRS.has(name) && init) {
          out.push(`${at(node)}\tattr:${name}\t${value ?? `{${init.getText(sf).replace(/^\{|\}$/g, "")}}`}`);
          return;
        }
        if (SKIP_ATTRS.test(name)) return;
      } else {
        const value = literal(node);
        if (value !== undefined && !inAttr && sentenceLike(value) && !codeLike(value)) {
          const parent = node.parent;
          const kind = parent && ts.isPropertyAssignment(parent) ? `literal:${parent.name.getText(sf)}` : "literal";
          out.push(`${at(node)}\t${kind}\t${value}`);
          return;
        }
      }
      ts.forEachChild(node, (child) => visit(child, inAttr));
    };
    visit(sf, false);
  }
  return out;
}

// ---------- css ----------
const RAW = [
  ["color", /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/i],
  ["length", /(?<![\w-])-?\d*\.?\d+(?:px|rem|em|vh|vw|dvh|dvw|lh)\b/],
  ["duration", /(?<![\w-])\d*\.?\d+m?s\b/],
  ["z-index", /^z-index$/],
  ["physical-side", /^(?:left|right|top|bottom|(?:margin|padding|border)-(?:left|right|top|bottom)(?:-\w+)?)$/],
];

function css() {
  const file = join(src, "chat.css");
  const out = [];
  const lines = readFileSync(file, "utf8").split("\n");
  let comment = false;
  lines.forEach((line, i) => {
    let code = line;
    if (comment) {
      const end = code.indexOf("*/");
      if (end === -1) return;
      code = code.slice(end + 2);
      comment = false;
    }
    code = code.replace(/\/\*.*?\*\//g, "");
    const open = code.indexOf("/*");
    if (open !== -1) {
      comment = true;
      code = code.slice(0, open);
    }
    const decl = code.match(/^\s*([\w-]+)\s*:\s*(.+?);?\s*$/);
    if (!decl || code.includes("{")) return;
    const [, prop, value] = decl;
    if (prop.startsWith("--wa-chat-")) return; // a token declaration: raw values belong here
    const kinds = RAW.filter(([kind, re]) => (kind === "z-index" || kind === "physical-side" ? re.test(prop) : re.test(value))).map(
      ([k]) => k,
    );
    // a shorthand whose values name sides in physical order (top right bottom left) or a physical keyword
    const parts = value
      .replace(/\([^()]*\)/g, "f")
      .trim()
      .split(/\s+/);
    if (/^(margin|padding|inset|border-width|border-radius)$/.test(prop) && parts.length >= 3 && new Set(parts).size > 1)
      kinds.push("physical-shorthand");
    if (/^(transform-origin|text-align|float|clear)$/.test(prop) && /\b(left|right)\b/.test(value)) kinds.push("physical-keyword");
    if (/translateX\(/.test(value)) kinds.push("physical-transform");
    if (kinds.length) out.push(`${relative(root, file)}:${i + 1}\t${kinds.join(",")}\t${prop}: ${value}`);
  });
  return out;
}

const header = (title, rows) =>
  [`# ${title}`, `# ${rows.length} entries · generated by scripts/chat-inventory.mjs`, ...rows, ""].join("\n");
const s = header("User-visible strings in packages/chat/src (file:line, kind, text)", strings());
const c = header("Raw CSS values in packages/chat/src/chat.css outside --wa-chat-* declarations (file:line, kinds, declaration)", css());
const outIdx = process.argv.indexOf("--out");
if (outIdx !== -1) {
  const dir = resolve(process.argv[outIdx + 1] ?? ".");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "strings.txt"), s);
  writeFileSync(join(dir, "css.txt"), c);
  console.log(`wrote ${relative(root, join(dir, "strings.txt"))} and css.txt`);
} else {
  console.log(`${s}\n${c}`);
}
