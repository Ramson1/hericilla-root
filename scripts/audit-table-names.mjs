/**
 * Audit the `hericilla_` table rename: find every surviving mention of an old table/view name.
 *
 * The old names are read from git HEAD (pre-rename migrations), so the audit stays truthful
 * even after the working tree has been rewritten.
 *
 * Usage: node scripts/audit-table-names.mjs [--all]     # --all also lists comment/prose hits
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PREFIX = "hericilla_";
const SHOW_ALL = process.argv.includes("--all");

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", ".expo", "dist", "dist-verify", "build",
  "coverage", "android", "ios", ".turbo", "scripts",
]);
const EXTENSIONS = new Set([".sql", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".md", ".toml"]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// Old object names, straight out of the committed migrations.
const originalSql = [...fs.readdirSync(path.join(ROOT, "supabase/migrations")).map((f) => `supabase/migrations/${f}`)];
if (fs.existsSync(path.join(ROOT, "supabase/seed"))) {
  for (const f of fs.readdirSync(path.join(ROOT, "supabase/seed"))) originalSql.push(`supabase/seed/${f}`);
}

const oldNames = new Set();
for (const rel of originalSql) {
  let sql;
  try {
    sql = execFileSync("git", ["show", `HEAD:${rel}`], { cwd: ROOT, encoding: "utf8" });
  } catch {
    continue; // new file, nothing committed to compare against
  }
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) oldNames.add(m[1]);
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) oldNames.add(m[1]);
}
oldNames.delete("hericilla");

const FIND = new RegExp(`(?<![_A-Za-z0-9])(${[...oldNames].sort((a, b) => b.length - a.length).join("|")})(?![_A-Za-z0-9])`, "g");

const buckets = new Map();
let total = 0;

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);
  fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    const trimmed = line.trim();
    // Comments and prose still name the old table; they are reported separately so real
    // code references stand out.
    const kind = /^--|^\/\/|^\*/.test(trimmed) || rel.endsWith(".md") ? "prose" : "code";

    const hits = [...line.matchAll(FIND)];
    if (!hits.length) return;
    if (kind === "prose" && !SHOW_ALL) return;
    for (const h of hits) {
      if (!buckets.has(kind)) buckets.set(kind, []);
      buckets.get(kind).push(`${rel}:${i + 1}  [${h[1]}]  ${trimmed.slice(0, 130)}`);
      total++;
    }
  });
}

for (const [kind, lines] of buckets) {
  console.log(`\n### ${kind} — ${lines.length}`);
  for (const l of lines.slice(0, SHOW_ALL ? 400 : 120)) console.log(`  ${l}`);
  if (lines.length > (SHOW_ALL ? 400 : 120)) console.log(`  … ${lines.length - (SHOW_ALL ? 400 : 120)} more`);
}
if (!SHOW_ALL) console.log("\n(prose/comment hits hidden — rerun with --all)");
console.log(`Old names tracked: ${oldNames.size}   hits shown: ${total}`);
