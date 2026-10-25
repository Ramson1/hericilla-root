/**
 * Prefix every Hericilla object with the company name: tables and views with `hericilla_`,
 * enum types and functions with `hericilla_`, storage buckets with `hericilla-`.
 *
 * The Supabase account hosts other projects, so the shared `public` schema must make
 * Hericilla's objects instantly recognisable and collision-free.
 *
 * Renames happen ONLY in syntactic positions that can hold an object reference:
 *   SQL  : create/alter/drop table, create view, references, from/join/update/into,
 *          index|trigger "on <table>", "table <name>" clauses, ::rowtype casts,
 *          `table.column` qualifiers (RLS policies name their protected table),
 *          `name%rowtype` attributes and declare-block row variables;
 *          create/alter/drop type, ::type casts, returns [setof] type, column and parameter
 *          definitions, function signatures; create/drop/alter function and every call site;
 *          storage bucket literals and storage policy names
 *   Code : .from("<name>"), table: "<name>" (realtime filters), Tables<'<name>'>, .rpc("<fn>"),
 *          storage.from("<bucket>"), uploadAll/uploadFile/storage_bucket/bucket ?? "<bucket>"
 * Never touched: column names, enum values, prose, React Query keys, permission resource keys.
 *
 * Usage: node scripts/rename-tables.mjs          # dry run + scripts/rename-report.txt
 *        node scripts/rename-tables.mjs --apply  # write the changes
 */
import fs from "node:fs";
import path from "node:path";
import { signatureLists } from "./sql-signatures.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const PREFIX = "hericilla_";
const BUCKET_PREFIX = "hericilla-"; // bucket ids in this project are hyphenated
const APPLY = process.argv.includes("--apply");

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

// ---------------------------------------------------------------- name discovery
const sqlFiles = ["supabase/migrations", "supabase/seed"]
  .map((d) => path.join(ROOT, d))
  .filter(fs.existsSync)
  .flatMap((d) => fs.readdirSync(d).map((f) => path.join(d, f)))
  .filter((f) => f.endsWith(".sql"));

const tables = new Set();
const views = new Set();
const types = new Set();
const fns = new Set();
const buckets = new Set();
for (const file of sqlFiles) {
  const sql = fs.readFileSync(file, "utf8");
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) tables.add(m[1]);
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) views.add(m[1]);
  for (const m of sql.matchAll(/create\s+type\s+(?:if\s+not\s+exists\s+)?(?:[a-z_]+\.)?([a-z_][a-z0-9_]*)/gi)) types.add(m[1]);
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:[a-z_]+\.)?([a-z_][a-z0-9_]*)\s*\(/gi)) fns.add(m[1]);
  // Bucket ids only appear in the `insert into storage.buckets` list; anything else that quotes a
  // bucket name (policies, defaults, app code) must resolve to one of these five.
  for (const m of sql.matchAll(/insert\s+into\s+storage\.buckets[\s\S]*?values([\s\S]*?)(?:on\s+conflict|;)/gi))
    for (const q of m[1].matchAll(/\(\s*'([a-z0-9_-]+)'/g)) buckets.add(q[1]);
}

// Already-prefixed objects are normalised back to their bare name so a second run is a no-op
// instead of producing hericilla_hericilla_clients.
const unprefix = (set) => new Set([...set].map((n) => (n.startsWith(PREFIX) ? n.slice(PREFIX.length) : n)));
for (const n of unprefix(tables)) tables.add(n);
for (const n of unprefix(views)) views.add(n);
[...tables].forEach((n) => n.startsWith(PREFIX) && tables.delete(n));
[...views].forEach((n) => n.startsWith(PREFIX) && views.delete(n));

const mapping = new Map();
for (const t of [...tables].sort()) mapping.set(t, PREFIX + t);
// Views drop the redundant `v_`: v_fleet_board -> hericilla_fleet_board
for (const v of [...views].sort()) {
  const next = PREFIX + (v.startsWith("v_") ? v.slice(2) : v);
  for (const [existing, mapped] of mapping) {
    if (mapped === next && existing !== v) throw new Error(`View ${v} -> ${next} collides with ${existing}`);
  }
  mapping.set(v, next);
}

// Longest first so `client_contacts` is never matched as `clients`.
const longestFirst = (map) => [...map.keys()].sort((a, b) => b.length - a.length).join("|");
const ALT = [...mapping.keys()].sort((a, b) => b.length - a.length).join("|");
const Q = "(?:public\\.)?";          // optional schema qualifier
const BOUND = "(?!\\w)";             // name must end here

// Enum types, functions and buckets get their own maps; names already carrying the prefix are
// normalised back so a second run stays a no-op.
const bareOf = (set, p) => new Set([...set].map((n) => (n.startsWith(p) ? n.slice(p.length) : n)));
const typeMap = new Map([...bareOf(types, PREFIX)].sort().map((n) => [n, PREFIX + n]));
const fnMap = new Map([...bareOf(fns, PREFIX)].sort().map((n) => [n, PREFIX + n]));
const bucketMap = new Map([...bareOf(buckets, BUCKET_PREFIX)].sort().map((n) => [n, BUCKET_PREFIX + n]));
/**
 * A bucket id may already be written with the canonical hyphen separator, so both spellings resolve
 * to one id and a second run stays a no-op instead of producing hericilla-hericilla-documents.
 * The underscore spelling is deliberately absent: `hericilla_documents` is the DOCUMENTS TABLE, so
 * reading it as a bucket would corrupt the dynamic audit-trigger array in 0017. A bucket left with
 * that spelling by an earlier rename is corrected by hand, and check-schema-refs keeps it honest.
 */
const bucketAlias = new Map([
  ...bucketMap,
  ...[...bucketMap].map(([n, v]) => [BUCKET_PREFIX + n, v]),
]);
const ALT_TYPE = longestFirst(typeMap);
const ALT_FN = longestFirst(fnMap);
const ALT_BUCKET = longestFirst(bucketAlias);

/** A rule is [regex, prefixGroup, map] — the name in the group right after the prefix is renamed. */
const SQL_RULES = [
  [new RegExp(`(create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${Q})(${ALT})${BOUND}`, "gi"), 1],
  [new RegExp(`(create\\s+(?:or\\s+replace\\s+)?(?:materialized\\s+)?view\\s+(?:if\\s+not\\s+exists\\s+)?${Q})(${ALT})${BOUND}`, "gi"), 1],
  [new RegExp(`(alter\\s+table\\s+(?:if\\s+exists\\s+)?${Q})(${ALT})${BOUND}`, "gi"), 1],
  [new RegExp(`(drop\\s+table\\s+(?:if\\s+exists\\s+)?${Q})(${ALT})${BOUND}`, "gi"), 1],
  [new RegExp(`(rename\\s+table\\s+(?:to\\s+)?${Q})(${ALT})${BOUND}`, "gi"), 1],
  [new RegExp(`(references\\s+${Q})(${ALT})${BOUND}`, "gi"), 1],
  [new RegExp(`(\\bfrom\\s+${Q})(${ALT})${BOUND}`, "gi"), 1],
  [new RegExp(`(\\bjoin\\s+${Q})(${ALT})${BOUND}`, "gi"), 1],
  [new RegExp(`(\\bupdate\\s+${Q})(${ALT})${BOUND}`, "gi"), 1],
  [new RegExp(`(\\binto\\s+${Q})(${ALT})${BOUND}`, "gi"), 1],
  [new RegExp(`(\\btable\\s+(?:if\\s+not\\s+exists\\s+)?${Q})(${ALT})${BOUND}`, "gi"), 1],
  // `on <table>`: index / trigger / RLS policy / publication targets. A bare known name
  // after `on` is always an object reference (join conditions use aliases or `name.column`,
  // both of which are still correct to rename). `on conflict` never matches.
  [new RegExp(`(\\bon\\s+${Q})(${ALT})${BOUND}`, "gi"), 1],
  [new RegExp(`(::)(${ALT})${BOUND}`, "g"), 1],
];

/**
 * Table references that carry no leading keyword, so they are matched by shape instead:
 *   `work_orders.id` — an RLS policy qualifies its protected table by the real relation name,
 *     which is exactly the name that moved (no alias in this codebase shadows a table name);
 *   `transport_jobs%rowtype` / `%type` — a PL/pgSQL attribute is a live dependency on the name.
 * The leading class keeps `hericilla_work_orders`, FK constraint names and quoted literals away
 * from the match; the trailing lookahead stops at a real column or `*`.
 */
const SQL_SHAPE_RULES = [
  [new RegExp(`([^\\w."'$:])(?:public\\.)?(${ALT})\\.(?=[a-z_*])`, "g"), 1],
  [new RegExp(`([^\\w."'$:])(?:public\\.)?(${ALT})%(?:rowtype|type)${BOUND}`, "g"), 1],
];

/**
 * Enum types. `cast(x as type)` is never written in this schema and a view alias (`v.status as
 * vehicle_status`) is a column label, so the `as` position is deliberately NOT a rule — only real
 * type positions are. Column/parameter definitions and function signatures are handled by their own
 * passes below, because there the type is the second word of the line, not after a keyword.
 */
const TYPE_RULES = [
  [new RegExp(`(create\\s+type\\s+(?:if\\s+not\\s+exists\\s+)?(?:[a-z_]+\\.)?)(${ALT_TYPE})${BOUND}`, "gi"), 1, typeMap],
  [new RegExp(`(alter\\s+type\\s+(?:if\\s+exists\\s+)?(?:[a-z_]+\\.)?)(${ALT_TYPE})${BOUND}`, "gi"), 1, typeMap],
  [new RegExp(`(drop\\s+type\\s+(?:if\\s+exists\\s+)?(?:[a-z_]+\\.)?)(${ALT_TYPE})${BOUND}`, "gi"), 1, typeMap],
  [new RegExp(`(::)(${ALT_TYPE})${BOUND}`, "g"), 1, typeMap],
  [new RegExp(`(returns\\s+(?:setof\\s+)?(?:[a-z_]+\\.)?)(${ALT_TYPE})${BOUND}`, "gi"), 1, typeMap],
];

/**
 * Functions. The qualified rule runs first so the bare-call rule never sees `public.is_ops(`
 * twice; a bare name followed by `(` can only be a call — column and variable references are never
 * parenthesised like that.
 */
const FN_RULES = [
  [new RegExp(`(create\\s+(?:or\\s+replace\\s+)?function\\s+(?:[a-z_]+\\.)?)(${ALT_FN})${BOUND}`, "gi"), 1, fnMap],
  [new RegExp(`(drop\\s+function\\s+(?:if\\s+exists\\s+)?(?:[a-z_]+\\.)?)(${ALT_FN})${BOUND}`, "gi"), 1, fnMap],
  [new RegExp(`(alter\\s+function\\s+(?:if\\s+exists\\s+)?(?:[a-z_]+\\.)?)(${ALT_FN})${BOUND}`, "gi"), 1, fnMap],
  [new RegExp(`((?:public|extensions)\\.)(${ALT_FN})(?=[\\t]*\\()`, "g"), 1, fnMap],
  [new RegExp(`(^|[^\\w."'])(?:public\\.|extensions\\.)?(${ALT_FN})(?=[\\t]*\\()`, "g"), 1, fnMap],
];

/**
 * Storage buckets. In .sql a quoted bucket id only ever sits in a bucket position (the bucket list,
 * `bucket_id` clauses, the `storage_bucket` default) — check-schema-refs re-proves that on every
 * run — so quoted literals are enough, plus the storage policy names. The captured name always
 * starts right after the opening delimiter, so the rewrite can never double the prefix, and the
 * dynamic table array is already moved by the time these rules run. When adding a rule here, never
 * leave an optional prefix outside group 1: `tail` is sliced relative to `prefix + name`, so text
 * matched outside the groups shifts the slice and corrupts the reconstruction.
 */
const BUCKET_SQL_RULES = [
  [new RegExp(`(['"])(${ALT_BUCKET})\\1`, "g"), 1, bucketAlias],
  // `if exists` sits between the keyword and the name in the drop half of the pair, so it belongs
  // inside the captured prefix — otherwise the drop keeps pointing at the pre-rename policy name.
  [new RegExp(`((?:drop|create)\\s+policy\\s+(?:if\\s+exists\\s+)?")(${ALT_BUCKET})`, "gi"), 1, bucketAlias],
];

/**
 * `declare sr service_requests;` is a row variable: PL/pgSQL takes the relation name as the type,
 * so it breaks on a rename like any other reference. Only lines inside a declare…begin block are
 * touched — nowhere else does `identifier name;` declare a type.
 */
const DECLARE_BLOCK = /(\bdeclare\b)([\s\S]*?)(\bbegin\b)/gi;
const DECLARE_VAR = new RegExp(`(^|\\n)([ \\t]+[a-z_][a-z0-9_]*[ \\t]+)(${ALT})(%(?:rowtype|type))?([ \\t]*;)`, "g");

const CODE_RULES = [
  // supabase.from("table"). `storage` and `from` share the single dot this match consumes, so the
  // lookbehind has to sit on the word: a lookbehind ending in the dot can never fire, and the table
  // rule then rewrites a bucket call site into the non-existent underscore form of the bucket id.
  // `scripts` is skipped above so these rules never run over their own source.
  [new RegExp(`((?<!storage)\\.from\\(\\s*['"\`])(${ALT})['"\`]`, "g"), 1],
  [new RegExp(`(\\btable:\\s*['"\`])(${ALT})['"\`]`, "g"), 1],
  [new RegExp(`(Tables<['"\`])(${ALT})['"\`]>`, "g"), 1],
  // headCount(table, build) forwards its first argument straight into .from()
  [new RegExp(`(headCount\\(\\s*['"\`])(${ALT})['"\`]`, "g"), 1],
  // supabase.rpc("fn", …) resolves the function by its PostgREST-exposed name. A name already
  // carrying the prefix is not in ALT_FN, so it never matches and a rerun stays a no-op.
  [new RegExp(`(\\.rpc\\(\\s*['"\`])(${ALT_FN})['"\`]`, "g"), 1, fnMap],
];

/**
 * Bucket ids referenced from app code. Only call sites whose first argument is a bucket are listed;
 * `queryKey: ["documents"]` and `{ key: "receipts" }` are UI labels and must not move.
 */
const BUCKET_CODE_RULES = [
  [new RegExp(`(storage\\.from\\(\\s*['"\`])(${ALT_BUCKET})['"\`]`, "g"), 1, bucketAlias],
  [new RegExp(`((?:uploadAll|uploadFile)\\(\\s*['"\`])(${ALT_BUCKET})['"\`]`, "g"), 1, bucketAlias],
  [new RegExp(`(storage_bucket:\\s*['"\`])(${ALT_BUCKET})['"\`]`, "g"), 1, bucketAlias],
  [new RegExp(`(bucket\\s*\\?\\?\\s*['"\`])(${ALT_BUCKET})['"\`]`, "g"), 1, bucketAlias],
];

/**
 * Enum type in its other two homes: a column/parameter definition (`priority priority not null`)
 * and a function signature's bare type list (`grant execute on function public.f(uuid, job_status)`).
 * Both put the type right after an identifier instead of after a keyword, so they are matched line
 * by line and the leading word is rejected when it is an SQL keyword — `and wo_status = 'open'` or
 * `order by job_status` reference a column, they do not declare a type.
 */
const NOT_A_COLUMN_NAME = new Set([
  "and", "or", "not", "null", "by", "on", "in", "is", "as", "select", "from", "where", "join", "set",
  "using", "returning", "values", "into", "update", "insert", "delete", "case", "when", "then", "else",
  "end", "begin", "declare", "exists", "all", "any", "distinct", "group", "order", "limit", "offset",
  "union", "except", "intersect", "asc", "desc", "primary", "unique", "check", "references", "default",
  "constraint", "index", "trigger", "policy", "view", "function", "type", "if", "loop", "while", "for",
  "return", "returns", "perform", "raise", "notice", "execute", "with", "without", "cascade", "language",
  "stable", "immutable", "volatile", "security", "definer", "invoker", "true", "false", "grant", "to",
]);
// A type may also be used as an array (`chans notification_channel[]`), so `[` is a legal end of the
// type token in both the line definition and the signature list.
const LINE_TYPE_DEF = new RegExp(
  `^([ \\t]+[a-z_][a-z0-9_]*[ \\t]+)(${ALT_TYPE})(?=[ \\t]*(?:[,);]|$|\\[|not[ \\t]|default[ \\t]|references[ \\t]|primary[ \\t]))`,
  "gm",
);
// `grant/revoke … on function public.f(<types>)` carries the same signature list as `create`, `alter`
// and `drop`, so the scanner keys on the word `function`; an enum type named there is a live
// dependency and leaving it bare fails the migration with "type does not exist".
const SIGNATURE_TYPE = new RegExp(`(^|[,\\s])(${ALT_TYPE})(?=[\\s,)]|\\[|$)`, "g");

/**
 * PostgREST keys an embedded relation by the relation name, so a bare renamed embed would
 * silently break every `row.clients?.name` in the apps. Aliasing preserves the old key:
 *   "*, clients(name)"  ->  "*, clients:hericilla_clients(name)"
 * Already-aliased embeds ("driver:profiles!fk(...)") keep their alias; only the relation moves.
 * FK-hint tokens (trip_expenses_submitted_by_fkey) are constraint names and stay untouched.
 */
const SELECT_CALL = /(\.select\(\s*['"`])([^'"`]*)(['"`])/g;
const PREFIXED_EMBED = new RegExp(`(^|[^:\\w."'])(${PREFIX}(${ALT}))(?=[(!])`, "g");
const BARE_EMBED = new RegExp(`(^|[^:\\w."'])(${ALT})(?=[(!])`, "g");

/**
 * Dynamic SQL in 0017 attaches audit triggers by looping a string array of table names
 * through format('%I'); those literals are real table references.
 */
const ARRAY_LOOP = /(foreach\s+\w+\s+in\s+array\s+(?:array\s*)?\[)([\s\S]*?)(\]\s*loop)/gi;
const PREFIX_RE = new RegExp(`^${PREFIX}`);
const QUOTED_NAME = new RegExp(`(['"])(?:${PREFIX})?(${ALT})\\1`, "g");

const report = [];
let replacements = 0;
let currentFile = "";

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

function applyRules(text, rules) {
  let out = text;
  for (const [re, prefixGroup, map = mapping] of rules) {
    out = out.replace(re, (match, ...args) => {
      const groups = args.slice(0, -2);
      const offset = args[args.length - 2]; // then the match offset, then the whole string
      const name = groups[prefixGroup]; // group right after the captured prefix
      const prefix = groups[prefixGroup - 1];
      const moved = map.get(name);
      if (!moved) throw new Error(`no mapping for ${name}`);
      const tail = match.slice(prefix.length + name.length);
      if (match === `${prefix}${moved}${tail}`) return match; // already moved — a no-op, not a change
      replacements++;
      report.push(`${path.relative(ROOT, currentFile)}:${lineOf(out, offset)}  ${name} -> ${moved}   | ${match}`);
      return `${prefix}${moved}${tail}`;
    });
  }
  return out;
}

/**
 * Enum types declared as a column or parameter type: `priority priority not null,`,
 * `role app_role primary key,`. Comment lines are skipped and a leading SQL keyword means the
 * second word is a column reference, not a type.
 */
function applyTypeDefinitions(text) {
  return text.replace(LINE_TYPE_DEF, (match, lead, name, offset, whole) => {
    const column = lead.trim();
    if (NOT_A_COLUMN_NAME.has(column)) return match;
    // A line that is really a condition (`  and wo_status = 'open'`) never reaches here: the keyword
    // guard above rejects it, and `column` would be the keyword rather than an identifier.
    if (!/^[a-z_][a-z0-9_]*$/.test(column) || /^\s*--/.test(whole.split("\n")[lineOf(whole, offset) - 1] ?? "")) return match;
    replacements++;
    report.push(`${path.relative(ROOT, currentFile)}:${lineOf(text, offset)}  type definition ${name} -> ${typeMap.get(name)}   | ${match.trim()}`);
    return `${lead}${typeMap.get(name)}`;
  });
}

/**
 * Bare type names inside a function's parameter list: `grant execute on function public.f(uuid, job_status)`.
 * The list is read as balanced text by the shared scanner, and the segments are rebuilt in offset order
 * so a rewrite cannot disturb the offsets of the lists that follow it.
 */
function applyFunctionSignatures(text) {
  let out = "";
  let cursor = 0;
  for (const sig of signatureLists(text)) {
    if (sig.paramsStart < cursor) continue; // inside a list already rewritten
    out += text.slice(cursor, sig.paramsStart);
    cursor = sig.close;
    out += sig.params.replace(SIGNATURE_TYPE, (m, lead, name, inner) => {
      replacements++;
      // The list starts after `function <name>(`, so the type's own offset inside it is what
      // identifies its line.
      report.push(`${path.relative(ROOT, currentFile)}:${lineOf(text, sig.paramsStart + inner)}  signature type ${name} -> ${typeMap.get(name)}   | ${m.trim()}`);
      return `${lead}${typeMap.get(name)}`;
    });
  }
  return out + text.slice(cursor);
}

function applySelectEmbeds(text) {
  return text.replace(SELECT_CALL, (match, open, inner, close, offset) => {
    const log = (note) =>
      report.push(`${path.relative(ROOT, currentFile)}:${lineOf(text, offset)}  ${note}`);
    // Relation already moved: put the original name back as an explicit alias.
    let next = inner.replace(PREFIXED_EMBED, (m, lead, full, bare) => {
      replacements++;
      log(`embed ${full} -> ${bare}:${full}`);
      return `${lead}${bare}:${full}`;
    });
    // Not yet moved: rename the relation and alias it to the old name in one step.
    next = next.replace(BARE_EMBED, (m, lead, name) => {
      replacements++;
      log(`embed ${name} -> ${name}:${mapping.get(name)}`);
      return `${lead}${name}:${mapping.get(name)}`;
    });
    return `${open}${next}${close}`;
  });
}

function applyDynamicTableArrays(text) {
  return text.replace(ARRAY_LOOP, (match, head, body, tail) => {
    const next = body.replace(QUOTED_NAME, (m, quote, name) => {
      const moved = mapping.get(name.replace(PREFIX_RE, ""));
      if (m === `${quote}${moved}${quote}`) return m; // already prefixed — a no-op, not a change
      replacements++;
      report.push(`${path.relative(ROOT, currentFile)}  dynamic table ${name} -> ${moved}`);
      return `${quote}${moved}${quote}`;
    });
    return `${head}${next}${tail}`;
  });
}

/** Row variables in a declare block (`sr service_requests;`, `j transport_jobs%rowtype;`). */
function applyDeclareVars(text) {
  return text.replace(DECLARE_BLOCK, (match, head, body, tail, offset) => {
    const next = body.replace(DECLARE_VAR, (m, lead, decl, name, attr, end, inner) => {
      replacements++;
      report.push(`${path.relative(ROOT, currentFile)}:${lineOf(text, offset + head.length + inner)}  row variable ${name} -> ${mapping.get(name)}   | ${m.trim()}`);
      return `${lead}${decl}${mapping.get(name)}${attr ?? ""}${end}`;
    });
    return `${head}${next}${tail}`;
  });
}


// ---------------------------------------------------------------- leftover audit
// Every surviving mention of an old name, so nothing can hide in unhandled syntax.
if (process.argv.includes("--audit")) {
  const leftovers = new Map();
  const ALL_OLD = [...mapping.keys(), ...typeMap.keys(), ...fnMap.keys(), ...bucketMap.keys()]
    .sort((a, b) => b.length - a.length)
    .join("|");
  const OLD = new RegExp(`(?<!${PREFIX})\\b(${ALL_OLD})\\b(?!\\w)`, "g");
  for (const file of walk(ROOT)) {
    const rel = path.relative(ROOT, file);
    fs.readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        for (const m of line.matchAll(OLD)) {
          if (!leftovers.has(rel)) leftovers.set(rel, []);
          leftovers.get(rel).push(`${i + 1}: ${line.trim().slice(0, 140)}   [${m[1]}]`);
        }
      });
  }
  let total = 0;
  for (const [rel, lines] of leftovers) {
    console.log(`\n── ${rel}`);
    for (const l of lines.slice(0, 30)) console.log(`   ${l}`);
    if (lines.length > 30) console.log(`   … ${lines.length - 30} more`);
    total += lines.length;
  }
  console.log(`\nLeftover old-name mentions: ${total}`);
  process.exit(0);
}

for (const file of walk(ROOT)) {
  currentFile = file;
  const isSql = file.endsWith(".sql");
  const isMd = file.endsWith(".md");
  const before = fs.readFileSync(file, "utf8");
  const SQL_ALL = SQL_RULES.concat(SQL_SHAPE_RULES, TYPE_RULES, FN_RULES, BUCKET_SQL_RULES);
  const CODE_ALL = CODE_RULES.concat(BUCKET_CODE_RULES);
  // Markdown holds schema snippets, so both the SQL and the code rules apply there. The dynamic
  // table array runs first so its literals are moved before the bucket rules look for bare names.
  const after = isSql
    ? applySelectEmbeds(
        applyRules(
          applyDeclareVars(
            applyFunctionSignatures(applyTypeDefinitions(applyDynamicTableArrays(before))),
          ),
          SQL_ALL,
        ),
      )
    : isMd
      ? applySelectEmbeds(applyRules(applyRules(before, SQL_ALL), CODE_ALL))
      : applySelectEmbeds(applyRules(before, CODE_ALL));
  if (after !== before) {
    const rel = path.relative(ROOT, file);
    const count = report.filter((r) => r.startsWith(rel + ":")).length;
    console.log(`${APPLY ? "updated    " : "would edit "} ${rel}  (${count} refs)`);
    if (APPLY) fs.writeFileSync(file, after);
  }
}

fs.writeFileSync(path.join(ROOT, "scripts", "rename-report.txt"), report.join("\n") + "\n");
console.log(
  `\nTables ${tables.size} · Views ${views.size} · Types ${typeMap.size} · Functions ${fnMap.size} · Buckets ${bucketMap.size} · replacements ${replacements}${APPLY ? "" : "  (dry run — no files written)"}`,
);
console.log("Mapping: " + [...mapping].map(([f, t]) => `${f}→${t}`).slice(0, 6).join(", ") + ", …");
