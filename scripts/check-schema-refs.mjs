/**
 * Schema guard for the `hericilla_` prefix convention.
 *
 * The Supabase account hosts projects beyond Hericilla, so every object we create there carries the
 * company name: tables, views, enum types and functions with `hericilla_` (they all live in the
 * shared `public` schema), storage buckets with `hericilla-` (bucket ids in this project are
 * hyphenated). This checks six things:
 *   1. every table, view, type, function and bucket defined in supabase/migrations is prefixed;
 *   2. every reference in SQL or app code resolves to something that actually exists;
 *   3. every literal bound to a jsonb column (insert values and column defaults) is valid JSON;
 *   4. every policy predicate sits inside its USING / WITH CHECK parentheses;
 *   5. every policy guard column compared to auth.uid() exists on the table the policy protects;
 *   6. every literal bound to an array column is Postgres array syntax, not a JSON array.
 * The reference positions covered are the ones a rename strands: relation qualifiers, `%rowtype`
 * attributes, declare-block row variables, embedded relations, type casts and column/parameter
 * definitions, function definitions and calls, `.rpc("…")`, and every bucket-id literal.
 *
 * Usage: node scripts/check-schema-refs.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { signatureLists } from "./sql-signatures.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const PREFIX = "hericilla_";
const BUCKET_PREFIX = "hericilla-";

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".expo", "dist", "dist-verify", "build", "coverage", "android", "ios", ".turbo", "scripts"]);
const EXTENSIONS = new Set([".sql", ".ts", ".tsx", ".js", ".mjs", ".cjs"]);

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

const sqlFiles = ["supabase/migrations", "supabase/seed"]
  .map((d) => path.join(ROOT, d))
  .filter(fs.existsSync)
  .flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith(".sql")).map((f) => path.join(d, f)));

const sql = sqlFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");

// ---------------------------------------------------------------- 1. definitions
const defined = new Map(); // name -> kind, one namespace so a bare twin is recognisable everywhere
const badNames = [];
for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
  defined.set(m[1], "table");
  if (!m[1].startsWith(PREFIX)) badNames.push(`table ${m[1]}`);
}
for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
  defined.set(m[1], "view");
  if (!m[1].startsWith(PREFIX)) badNames.push(`view ${m[1]}`);
}
for (const m of sql.matchAll(/create\s+type\s+(?:if\s+not\s+exists\s+)?(?:[a-z_]+\.)?([a-z_][a-z0-9_]*)/gi)) {
  defined.set(m[1], "type");
  if (!m[1].startsWith(PREFIX)) badNames.push(`type ${m[1]}`);
}
for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:[a-z_]+\.)?([a-z_][a-z0-9_]*)\s*\(/gi)) {
  defined.set(m[1], "function");
  if (!m[1].startsWith(PREFIX)) badNames.push(`function ${m[1]}`);
}
// Bucket ids are only ever introduced by the storage.buckets insert, so that list is the definition.
const buckets = new Set();
for (const m of sql.matchAll(/insert\s+into\s+storage\.buckets[\s\S]*?values([\s\S]*?)(?:on\s+conflict|;)/gi))
  for (const q of m[1].matchAll(/\(\s*'([a-z0-9_-]+)'/g)) buckets.add(q[1]);
for (const b of buckets) if (!b.startsWith(BUCKET_PREFIX)) badNames.push(`bucket ${b}`);
// The bare half of a bucket id, and of any object name: `documents` next to `hericilla-documents`.
const bareBucket = (id) => id.replace(new RegExp(`^${BUCKET_PREFIX}|^${PREFIX}`), "");
const bucketBare = new Set([...buckets].map(bareBucket));

// Objects that legitimately live outside our namespace.
const external = new Set([
  "auth", "users", "storage", "objects", "buckets", "refresh_tokens", "migrations", "schema_migrations",
  "pg_class", "pg_namespace", "information_schema", "pg_stat", "pg_policies", "pg_indexes",
  "public", "cron", "net", "realtime", "extensions", "graphql", "graphql_public", "vault", "pg_catalog",
]);

// ---------------------------------------------------------------- 2. references
const problems = [];
function check(kind, name, where) {
  if (defined.has(name) || external.has(name)) return;
  // A prefixed name that is not defined is always a defect; an unprefixed name is only a
  // defect when its hericilla_ twin exists (otherwise it is Buffer.from(), a label, a pg type…).
  if (name.startsWith(PREFIX)) problems.push(`${kind}: ${name}  @ ${where}`);
  else if (defined.has(`${PREFIX}${name}`)) problems.push(`unprefixed ${kind}: ${name}  @ ${where}`);
}

/** Bucket ids are hyphenated, so they need their own resolution against the bucket list. */
function checkBucket(name, where) {
  // A quoted literal naming a real SQL object is a relation reference — the dynamic audit-trigger
  // array in 0017 holds `'hericilla_documents'`, which is the documents table, not the documents
  // bucket. Bucket ids in this project are hyphenated, so the canonical spelling is never a name.
  if (defined.has(name)) return;
  const bare = bareBucket(name);
  if (!bucketBare.has(bare)) return; // an ordinary string literal or enum value, not a bucket
  if (name !== `${BUCKET_PREFIX}${bare}`) problems.push(`bucket id: ${name}  @ ${where}`);
}

/**
 * Comments describe the schema in prose (`-- Employees always see their own payslips (once
 * generated)`) and can never strand a reference, so they are blanked before scanning. Blanks keep
 * the length and the newlines, so the reported line numbers stay exact.
 */
const blank = (s) => s.replace(/[^\n]/g, " ");
const stripComments = (text) => text.replace(/--[^\n]*/g, blank).replace(/\/\*[\s\S]*?\*\//g, blank);

/**
 * Several patterns have to consume a lead character (the newline of an indented column definition,
 * the dot of a qualifier), so the match starts before the name. Report the line the name itself sits
 * on, found by locating the captured name inside the match.
 */
const nameStart = (m) => m.index + m[0].indexOf(m[1]);

/**
 * A jsonb column rejects anything that is not a JSON document: `'"Hericilla" <a@b>'` is a fine text
 * literal and a broken jsonb one (22P02 at INSERT). The key/value tables — app_settings and
 * page_content — are populated from migration and seed text, so every literal bound to a jsonb
 * column has to parse. PL/pgSQL bodies are blanked first: their inserts use jsonb_build_object()
 * and resolve at runtime, so a literal there is not this statement's problem.
 */
const DOLLAR_BODY = /(\$[a-zA-Z_]*\$)[\s\S]*?\1/g;

/** Index of the paren that closes the one at `open`, honouring '' escapes and dollar quotes. */
function matchParen(text, open) {
  let depth = 0, i = open, inStr = false;
  while (i < text.length) {
    const c = text[i];
    if (inStr) {
      if (c === "'" && text[i + 1] === "'") { i += 2; continue; }
      if (c === "'") inStr = false;
      i++; continue;
    }
    if (c === "'") { inStr = true; i++; continue; }
    const tag = /^\$[a-zA-Z_]*\$/i.exec(text.slice(i));
    if (tag) { const end = text.indexOf(tag[0], i + tag[0].length); i = end < 0 ? text.length : end + tag[0].length; continue; }
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i;
    i++;
  }
  return -1;
}

/** Split on commas that sit at depth zero, so a `default '[]'` or numeric(14,2) cannot cut a row. */
function splitArgs(s) {
  const out = [];
  let start = 0, depth = 0, i = 0, inStr = false;
  while (i < s.length) {
    const c = s[i];
    if (inStr) {
      if (c === "'" && s[i + 1] === "'") { i += 2; continue; }
      if (c === "'") inStr = false;
      i++; continue;
    }
    if (c === "'") { inStr = true; i++; continue; }
    const tag = /^\$[a-zA-Z_]*\$/i.exec(s.slice(i));
    if (tag) { const end = s.indexOf(tag[0], i + tag[0].length); i = end < 0 ? s.length : end + tag[0].length; continue; }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
    i++;
  }
  out.push(s.slice(start));
  return out;
}

/** The SQL text of a simple string literal, decoded, or null when the expression is not one. */
function literalText(expr) {
  const t = expr.trim().replace(/::\s*(?:jsonb|json)\s*$/i, "");
  const m = /^(E?)'((?:[^']|'')*)'$/is.exec(t);
  if (!m) return null;
  let s = m[2].replace(/''/g, "'");
  if (m[1] === "E") s = s.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\r/g, "\r").replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  return s;
}

function assertJson(value, where) {
  if (value === null) return;
  try {
    JSON.parse(value);
  } catch (e) {
    problems.push(`jsonb literal: ${value.replace(/\n/g, "\\n").slice(0, 70)}  @ ${where}  [${e.message}]`);
  }
}

/** table -> lowercased names of its jsonb columns, across the whole migration set. */
const tableText = stripComments(sql).replace(DOLLAR_BODY, blank);
const jsonbCols = new Map();
for (const m of tableText.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(hericilla_[a-z0-9_]+)\s*\(/gi)) {
  const open = m.index + m[0].length - 1, close = matchParen(tableText, open);
  if (close < 0) continue;
  const cols = new Set();
  for (const def of splitArgs(tableText.slice(open + 1, close))) {
    const c = def.trim().match(/^([a-z_][a-z0-9_]*)\s+(?:[\w\s(,)]*\s)?(?:jsonb|json)(?![\w-])/i);
    if (c) {
      cols.add(c[1].toLowerCase());
      // A column default is an expression the table definition evaluates on every insert.
      const d = def.match(/default\s+('(?:[^']|'')*')(?:::|\s*,|\s*$)/i);
      if (d) assertJson(literalText(d[1]), `${m[1]}.${c[1]} default`);
    }
  }
  if (cols.size) jsonbCols.set(m[1].toLowerCase(), cols);
}

/** table -> lowercased names of ALL its columns, from create-table defs plus later add-column. */
const allCols = new Map();
for (const m of tableText.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]+)\s*\(/gi)) {
  const open = m.index + m[0].length - 1, close = matchParen(tableText, open);
  if (close < 0) continue;
  const set = allCols.get(m[1].toLowerCase()) ?? new Set();
  allCols.set(m[1].toLowerCase(), set);
  for (const def of splitArgs(tableText.slice(open + 1, close))) {
    const d = def.trim();
    if (/^(unique|primary|foreign|constraint|check|exclude)\b/i.test(d)) continue; // table constraints, not columns
    const c = /^([a-z_][a-z0-9_]*)\b/i.exec(d);
    if (c) set.add(c[1].toLowerCase());
  }
}
for (const m of tableText.matchAll(/\balter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]+)\b[^;]*?\badd\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi)) {
  allCols.get(m[1].toLowerCase())?.add(m[2].toLowerCase());
}

/** table -> lowercased names of its array-typed (`type[]`) columns, across the whole migration set. */
const arrayCols = new Map();
for (const m of tableText.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(hericilla_[a-z0-9_]+)\s*\(/gi)) {
  const open = m.index + m[0].length - 1, close = matchParen(tableText, open);
  if (close < 0) continue;
  const cols = new Set();
  for (const def of splitArgs(tableText.slice(open + 1, close))) {
    const c = def.trim().match(/^([a-z_][a-z0-9_]*)\s+(?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*\[\]/i);
    if (c) cols.add(c[1].toLowerCase());
  }
  if (cols.size) arrayCols.set(m[1].toLowerCase(), cols);
}

/** The `;` that ends the statement starting at `from`; semicolons inside parens or strings don't count. */
function statementEnd(text, from) {
  let depth = 0, i = from, inStr = false;
  while (i < text.length) {
    const c = text[i];
    if (inStr) {
      if (c === "'" && text[i + 1] === "'") { i += 2; continue; }
      if (c === "'") inStr = false;
      i++; continue;
    }
    if (c === "'") { inStr = true; i++; continue; }
    const tag = /^\$[a-zA-Z_]*\$/i.exec(text.slice(i));
    if (tag) { const end = text.indexOf(tag[0], i + tag[0].length); i = end < 0 ? text.length : end + tag[0].length; continue; }
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === ";" && depth <= 0) return i;
    i++;
  }
  return -1;
}

/**
 * A policy predicate has to live inside the parentheses of its USING / WITH CHECK clause. Postgres
 * parses `using (a = b) or is_admin()` as a complete clause followed by junk and aborts the whole
 * migration with 42601 — the tail reads like prose, so no amount of skimming catches it. Only the
 * next clause or the statement's semicolon may follow a closing paren.
 */
function checkPolicyClauses(rel, text, line) {
  const body = text.replace(DOLLAR_BODY, blank);
  for (const m of body.matchAll(/\bcreate\s+policy\b/gi)) {
    const end = statementEnd(body, m.index);
    if (end < 0) { problems.push(`unterminated create policy  @ ${rel}:${line(m.index)}`); continue; }
    const stmt = body.slice(m.index, end + 1);
    if (/%[Is]|\$\d/.test(stmt)) continue; // assembled by format() in a do-block, not parsed here
    for (const clause of stmt.matchAll(/\b(using|with\s+check)\s*\(/gi)) {
      const open = m.index + clause.index + clause[0].length - 1;
      const close = matchParen(body, open);
      if (close < 0 || close > end) {
        problems.push(`unbalanced ${clause[1].trim().toUpperCase().replace(/\s+/g, " ")} clause  @ ${rel}:${line(m.index)}`);
        continue;
      }
      let rest = body.slice(close + 1, end).trim();
      if (/\busing\b/i.test(clause[1]) && /^with\s+check\s*\(/i.test(rest)) {
        const wc = matchParen(body, close + 1 + rest.indexOf("("));
        rest = wc < 0 ? "unclosed with check" : body.slice(wc + 1, end).trim();
      }
      if (rest) problems.push(`policy predicate escapes its ${clause[1].trim().toUpperCase().replace(/\s+/g, " ")} parens: ${rest.slice(0, 60)}  @ ${rel}:${line(m.index)}`);
    }
  }
}

/**
 * A policy's USING / WITH CHECK expression is parsed and column-resolved against its protected table
 * at CREATE time, so a column named there that the table lacks aborts the whole migration with
 * 42703 — `feedback_insert … created_by = auth.uid()` on request_feedback (which stores raised_by /
 * handled_by, not created_by) was exactly that. Only guard columns compared to auth.uid() are checked,
 * and only at the clause's own depth: a bare column inside an EXISTS(...) subquery belongs to that
 * inner table, and a qualified one (js.profile_id) names another relation — neither is the protected
 * table's column, so flattening the predicate to depth zero and skipping dotted names keeps them out.
 */
function checkPolicyColumns(rel, text, line) {
  const body = text.replace(DOLLAR_BODY, blank);
  for (const m of body.matchAll(/\bcreate\s+policy\s+[a-z0-9_]+\s+on\s+(?:public\.)?(hericilla_[a-z0-9_]+)\b/gi)) {
    const have = allCols.get(m[1].toLowerCase());
    if (!have) continue;
    const end = statementEnd(body, m.index);
    if (end < 0) continue;
    const stmt = body.slice(m.index, end + 1);
    if (/%[Is]|\$\d/.test(stmt)) continue; // assembled by format() in a do-block, not parsed here
    for (const clause of stmt.matchAll(/\b(using|with\s+check)\s*\(/gi)) {
      const open = clause.index + clause[0].length - 1;
      const close = matchParen(stmt, open);
      if (close < 0) continue;
      // keep depth-0 characters only: this drops subquery bodies and call parentheses
      let depth = 0, flat = "";
      for (const c of stmt.slice(open + 1, close)) {
        if (c === "(") { depth++; continue; }
        if (c === ")") { if (depth) depth--; continue; }
        if (depth === 0) flat += c;
      }
      // the call parens of auth.uid() were stripped above, so it now reads `auth.uid`
      for (const cmp of flat.matchAll(/(?<![\w.])([a-z_][a-z0-9_]*)\s*=\s*auth\.uid|auth\.uid\s*=\s*([a-z_][a-z0-9_]*)/gi)) {
        const col = (cmp[1] ?? cmp[2] ?? "").toLowerCase();
        if (col && !have.has(col))
          problems.push(`policy column: ${m[1]}.${col}  @ ${rel}:${line(m.index)}  [no such column; predicates resolve at CREATE time]`);
      }
    }
  }
}

function checkJsonbInserts(rel, text, line) {
  const body = text.replace(DOLLAR_BODY, blank);
  for (const m of body.matchAll(/\binsert\s+into\s+(?:public\.)?(hericilla_[a-z0-9_]+)\s*\(([^)]*)\)\s*values/gi)) {
    const cols = jsonbCols.get(m[1].toLowerCase());
    if (!cols) continue;
    const idx = m[2].split(",").map((c) => c.trim().toLowerCase()).reduce((a, c, i) => (cols.has(c) && a.push(i), a), []);
    if (!idx.length) continue;
    // The match ends on the word `values`, so walk to the first real character: that opens row one.
    let pos = m.index + m[0].length + body.slice(m.index + m[0].length).search(/\S/);
    while (body[pos] === "(") {
      const close = matchParen(body, pos);
      if (close < 0) return;
      const exprs = splitArgs(body.slice(pos + 1, close));
      for (const i of idx) if (exprs[i] !== undefined) assertJson(literalText(exprs[i]), `${rel}:${line(pos + 1)}`);
      // Rows are separated by commas, so step over whitespace and commas to reach the next one; any
      // other character (`on conflict …`, `returning …`, the next statement) ends this insert.
      let at = close + 1;
      while (at < body.length && /[\s,]/.test(body[at])) at++;
      pos = body[at] === "(" ? at : body.length;
    }
  }
}

/**
 * A `text[]` / enum[] column takes a Postgres array literal — `'{a,b}'` — never a JSON array. Binding
 * `'["a","b"]'` aborts the insert with 22P02 (`malformed array literal: "[" …"`, the blog_tags seed
 * was exactly this). A valid plain-string array literal always opens with `{`; anything else — a JSON
 * `[`, or a bare word — is malformed. `array[…]` expressions and NULL aren't plain string literals, so
 * literalText returns null for them and they are left alone.
 */
function checkArrayInserts(rel, text, line) {
  const body = text.replace(DOLLAR_BODY, blank);
  for (const m of body.matchAll(/\binsert\s+into\s+(?:public\.)?(hericilla_[a-z0-9_]+)\s*\(([^)]*)\)\s*values/gi)) {
    const cols = arrayCols.get(m[1].toLowerCase());
    if (!cols) continue;
    const idx = m[2].split(",").map((c) => c.trim().toLowerCase()).reduce((a, c, i) => (cols.has(c) && a.push(i), a), []);
    if (!idx.length) continue;
    let pos = m.index + m[0].length + body.slice(m.index + m[0].length).search(/\S/);
    while (body[pos] === "(") {
      const close = matchParen(body, pos);
      if (close < 0) return;
      const exprs = splitArgs(body.slice(pos + 1, close));
      for (const i of idx) {
        const v = exprs[i] === undefined ? null : literalText(exprs[i]);
        if (v !== null && !v.startsWith("{"))
          problems.push(`array literal: ${exprs[i].trim().slice(0, 40)}  @ ${rel}:${line(pos + 1)}  [text[] wants '{a,b}', not JSON]`);
      }
      let at = close + 1;
      while (at < body.length && /[\s,]/.test(body[at])) at++;
      pos = body[at] === "(" ? at : body.length;
    }
  }
}

for (const file of sqlFiles) {
  const rel = path.relative(ROOT, file);
  const text = stripComments(fs.readFileSync(file, "utf8"));
  const line = (i) => text.slice(0, i).split("\n").length;
  checkJsonbInserts(rel, text, line);
  checkArrayInserts(rel, text, line);
  checkPolicyClauses(rel, text, line);
  checkPolicyColumns(rel, text, line);
  const patterns = [
    ["references", /\breferences\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi],
    ["from", /\bfrom\s+(?:public\.)?([a-z_][a-z0-9_]*)\b(?!\s*\()/gi],
    ["join", /\bjoin\s+(?:public\.)?([a-z_][a-z0-9_]*)\b/gi],
    ["update", /\bupdate\s+(?:public\.)?([a-z_][a-z0-9_]*)\b\s+set/gi],
    ["insert-into", /\binto\s+(?:public\.)?([a-z_][a-z0-9_]*)\b\s*\(/gi],
    ["on-object", /\bon\s+(?:public\.)?([a-z_][a-z0-9_]*)\b\s*(?:\(|for|;|where|$)/gi],
    ["table-clause", /\btable\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi],
    ["dynamic-array", /'([a-z_][a-z0-9_]*)'/gi],
    // Three positions with no leading keyword, all real dependencies on the relation name that a
    // rename strands: a policy qualifies its protected table (`work_orders.id`), a PL/pgSQL
    // attribute names a relation (`transport_jobs%rowtype`), and a bare `var table;` line inside a
    // declare block is a row variable. No alias in this codebase shadows a table name, so `name.`
    // is always the relation.
    ["qualified-column", /(?:^|[^\w."'$:])((?:hericilla_)?[a-z_][a-z0-9_]*)\.(?=[a-z_*])/g],
    ["rowtype-attr", /(?:^|[^\w."'$:])((?:hericilla_)?[a-z_][a-z0-9_]*)%(?:rowtype|type)/g],
    ["row-variable", /(?:^|\n)[ \t]+[a-z_][a-z0-9_]*[ \t]+((?:hericilla_)?[a-z_][a-z0-9_]*)[ \t]*(?:%(?:rowtype|type))?[ \t]*;/g],
    // Enum types and functions live in the same shared schema, so they carry the prefix too. The
    // bare-call pattern is safe because check() only reacts to a name that has a hericilla_ twin:
    // count(), format() and auth.uid() resolve to nothing of ours, while is_ops() is a stranded call.
    ["type-def", /\b(?:create|alter|drop)\s+type\s+(?:if\s+(?:not\s+)?exists\s+)?(?:[a-z_]+\.)?([a-z_][a-z0-9_]*)/gi],
    ["type-cast", /::\s*([a-z_][a-z0-9_]*)\b/g],
    ["returns-type", /\breturns\s+(?:setof\s+)?([a-z_][a-z0-9_]*)\b/gi],
    // `priority priority not null` — the type is the second word of the line, so it has no keyword
    // to anchor on; the required tail stops (`not null`, `default`, a comma…) keeps conditions out.
    ["type-definition", /(?:^|\n)[ \t]+[a-z_][a-z0-9_]*[ \t]+((?:hericilla_)?[a-z_][a-z0-9_]*)[ \t]*(?:(?:not[ \t]+null|null|default|primary[ \t]+key|unique|check|references)[ \t,)]|[,)])/g],
    ["fn-def", /\b(?:create\s+(?:or\s+replace\s+)?|alter\s+|drop\s+)function\s+(?:[a-z_]+\.)?([a-z_][a-z0-9_]*)/gi],
    ["fn-call", /\b(?:public|extensions)\.([a-z_][a-z0-9_]*)\s*\(/gi],
    ["fn-bare-call", /(?:^|[^\w."'])([a-z_][a-z0-9_]*)\s*\(/g],
    // `<type>[]` — an enum used as an array column or parameter. The type token ends at the `[`, so
    // no keyword-anchored pattern sees it (`chans notification_channel[], ttl text`).
    ["array-type", /(?:^|[^\w."'$:])([a-z_][a-z0-9_]*)\[\]/g],
    // In .sql a hyphenated or bucket-shaped quoted literal is always a bucket reference, so every
    // spelling must match the canonical id exactly — that catches `hericilla_documents` drift.
    ["bucket-id", /'([a-z0-9_-]+)'/g],
  ];
  for (const [kind, re] of patterns) {
    for (const m of text.matchAll(re)) {
      const where = `${rel}:${line(nameStart(m))}`;
      if (kind === "bucket-id") {
        checkBucket(m[1], where);
        continue;
      }
      // Quoted literals are labels and enum values as often as tables, so only the prefixed ones
      // (our namespace by definition) are policed.
      if (kind === "dynamic-array" && !m[1].startsWith(PREFIX)) continue;
      check(kind, m[1], where);
    }
  }
  // Function signature type lists — `grant execute on function public.f(uuid, job_status)` names the
  // enum type as a live dependency, in a position no keyword-anchored pattern reaches. Parameter names
  // in the same list resolve to nothing of ours, so check() ignores them. The shared scanner reads the
  // list as balanced text, so a `default gen_random_uuid()` in the middle does not hide what follows.
  for (const sig of signatureLists(text)) {
    for (const p of sig.params.matchAll(/(?:^|[, \t\n])([a-z_][a-z0-9_]*)/g)) {
      check("signature type", p[1], `${rel}:${line(sig.paramsStart + nameStart(p))}`);
    }
  }
}

for (const file of walk(ROOT).filter((f) => !f.endsWith(".sql"))) {
  const rel = path.relative(ROOT, file);
  const text = fs.readFileSync(file, "utf8");
  const line = (i) => text.slice(0, i).split("\n").length;
  const where = (i) => `${rel}:${line(i)}`;
  // `storage` and `from` share the one dot this match consumes, so the lookbehind has to sit on the
  // word: without it, storage.from("bucket") would be policed as a table and reported twice.
  for (const m of text.matchAll(/(?<!storage)\.from\(\s*['"`]([a-z_][a-z0-9_]*)['"`]/g)) {
    check("code .from()", m[1], where(nameStart(m)));
  }
  for (const m of text.matchAll(/\btable:\s*['"`]([a-z_][a-z0-9_]*)['"`]/g)) {
    check("code realtime table", m[1], where(nameStart(m)));
  }
  // headCount(table, build) forwards its literal straight into .from(), so it is a table reference.
  for (const m of text.matchAll(/\bheadCount\(\s*['"`]([a-z_][a-z0-9_]*)['"`]/g)) {
    check("code headCount()", m[1], where(nameStart(m)));
  }
  // PostgREST resolves the rpc name as the function's exposed name.
  for (const m of text.matchAll(/\.rpc\(\s*['"`]([a-z_][a-z0-9_]*)['"`]/g)) {
    check("code .rpc()", m[1], where(nameStart(m)));
  }
  // The four call shapes whose first argument is a bucket id.
  for (const m of text.matchAll(/storage\.from\(\s*['"`]([a-z0-9_-]+)['"`]/g)) checkBucket(m[1], where(nameStart(m)));
  for (const m of text.matchAll(/(?:uploadAll|uploadFile)\(\s*['"`]([a-z0-9_-]+)['"`]/g)) checkBucket(m[1], where(nameStart(m)));
  for (const m of text.matchAll(/storage_bucket:\s*['"`]([a-z0-9_-]+)['"`]/g)) checkBucket(m[1], where(nameStart(m)));
  for (const m of text.matchAll(/bucket\s*\?\?\s*['"`]([a-z0-9_-]+)['"`]/g)) checkBucket(m[1], where(nameStart(m)));
  // Embedded relations must stay readable: every hericilla_ relation in a select needs an alias.
  for (const m of text.matchAll(/\.select\(\s*['"`]([^'"`]*)['"`]/g)) {
    for (const e of m[1].matchAll(/(?:^|[,\s(])(hericilla_[a-z0-9_]+)[(!]/g)) {
      problems.push(`unaliased embed: ${e[1]}  @ ${where(m.index)}`);
    }
  }
}

const kindCount = (kind) => [...defined.values()].filter((k) => k === kind).length;
console.log(
  `Defined objects: ${defined.size} (${kindCount("table")} tables, ${kindCount("view")} views, ${kindCount("type")} types, ${kindCount("function")} functions) + ${buckets.size} buckets`,
);
if (badNames.length) console.log(`\nMissing prefix:\n  ${badNames.join("\n  ")}`);
if (problems.length) {
  console.log(`\nProblems (${problems.length}):`);
  for (const p of [...new Set(problems)]) console.log(`  ${p}`);
}
console.log(`\n${badNames.length || problems.length ? "FAIL" : "PASS"} — schema prefix + reference check`);
process.exit(badNames.length || problems.length ? 1 : 0);
