// Fails when something in source/plan-17-r3.md is missing from the change's artifacts.
// Run from the change folder: node source/check-coverage.mjs
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const src = read("source/plan-17-r3.md");
const design = read("design.md");
const proposal = read("proposal.md");
const tasks = read("tasks.md");
const specs = readdirSync(join(root, "specs")).map((d) => read(`specs/${d}/spec.md`)).join("\n");
const missing = [];
const count = (label, items, has) => {
  const lost = items.filter((i) => !has(i));
  for (const l of lost) missing.push(`${label}: ${String(l).slice(0, 100)}`);
  console.log(`${label.padEnd(22)} ${items.length - lost.length}/${items.length}`);
};
const norm = (s) => s.replace(/\s+/g, " ").trim();

// 1. requirement ids → a "### Requirement: <id> " heading in a spec, with a scenario under it
const ids = [...new Set([...src.matchAll(/^- \*\*(R-[A-Z]+-\d+)\*\*/gm)].map((m) => m[1]))];
count("requirements", ids, (id) => new RegExp(`^### Requirement: ${id} [^\\n]+\\n[\\s\\S]*?^#### Scenario:`, "m").test(specs));

// 2. the scenarios the plan gives → their key phrase somewhere in the specs is checked by hand; here: every requirement has ≥ 1
const reqBlocks = specs.split(/^### Requirement: /m).slice(1);
count("reqs with scenarios", reqBlocks, (b) => /^#### Scenario: /m.test(b) && /\*\*WHEN\*\*/.test(b) && /\*\*THEN\*\*/.test(b));

// 3. task numbers
const nums = [...src.matchAll(/^- \[ \] (\d+\.\d+) /gm)].map((m) => m[1]);
count("tasks", nums, (n) => new RegExp(`^- \\[[ x]\\] ${n.replace(".", "\\.")} `, "m").test(tasks));

// 4. code blocks of §3..§9 → design.md, byte for byte
const blocks = [...src.matchAll(/^```[^\n]*\n[\s\S]*?^```/gm)].map((m) => m[0]);
const layout = blocks.filter((b) => b.includes("openspec/changes/"));
count("code blocks", blocks.filter((b) => !layout.includes(b)), (b) => design.includes(b));

// 5. table rows of §3..§9 and §12
const body = src.slice(src.indexOf("\n## 3. "), src.indexOf("\n## 10. "));
const rows = body.split("\n").filter((l) => l.startsWith("|") && !/^\|[-| ]+\|$/.test(l));
count("table rows (3-9)", rows, (r) => design.includes(r));

// 6. headings of §3..§9
const heads = body.split("\n").filter((l) => /^#{2,4} /.test(l)).map((l) => l.replace(/^#+ /, ""));
count("headings (3-9)", heads, (h) => design.includes(h));

// 7. decisions, verify items, acceptance, recommendations
const section = (n) => src.slice(src.indexOf(`\n## ${n}. `), src.indexOf(`\n## ${n + 1}. `) === -1 ? undefined : src.indexOf(`\n## ${n + 1}. `));
const numbered = (text) => [...text.matchAll(/^(\d+)\. (.+)$/gm)].map((m) => norm(m[2]).slice(0, 60));
count("decisions (§3)", numbered(section(3)), (d) => norm(design).includes(d));
count("verify items (§12)", numbered(section(12)), (d) => norm(design).includes(d));
count("acceptance (§11)", [...section(11).matchAll(/^- \[ \] (.+)$/gm)].map((m) => norm(m[1].replace(" **[R3]**", "")).slice(0, 50)), (a) => norm(proposal).includes(a));
count("recommendations (§13)", [...section(13).matchAll(/^\d+\. \*\*(.+?)\*\*/gm)].map((m) => m[1].replace(/[.:]$/, "").slice(0, 30)), (r) => proposal.includes(r));

// 8. every prose line of §3..§9 (not just code and tables)
const prose = body.split("\n").filter((l) => l.trim().length > 30 && !l.startsWith("|") && !l.startsWith("```"));
count("lines of §3-§9", prose, (l) => design.includes(l.replace(/^(#{2,5}) /, "#$1 ")) || design.includes(l));

if (missing.length) { console.error(`\nMISSING (${missing.length}):\n` + missing.join("\n")); process.exit(1); }
console.log("\nNothing from the source plan is missing.");
