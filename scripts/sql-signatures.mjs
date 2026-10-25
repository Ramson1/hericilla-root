/**
 * Shared scanner for SQL function parameter lists, used by scripts/rename-tables.mjs (to rewrite
 * them) and scripts/check-schema-refs.mjs (to police them).
 *
 * A parameter list has to be read as balanced text, not "up to the first )". A default value such as
 * `p_event_id uuid default gen_random_uuid()` nests a call inside the list, and a non-balanced scan
 * stops there — hiding every parameter that follows, which is exactly where an enum type is declared
 * (`p_source hericilla_event_source default 'web'`). That silently strands the type and the migration
 * fails with "type ... does not exist".
 */
const FN_SIG_START = /\bfunction\s+[a-z_.]*\s*\(/gi;

/**
 * Yield each parameter list of `… function <name>(<params>)` as
 *   { headStart, open, paramsStart, params, close }
 * where `headStart` is where `function …` begins, `open`/`close` are the offsets of the surrounding
 * parentheses and `params` is the text between them (may span lines and contain nested calls).
 */
export function* signatureLists(text) {
  for (const m of text.matchAll(FN_SIG_START)) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let close = -1;
    for (let i = open; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")") {
        depth--;
        if (depth === 0) { close = i; break; }
      }
    }
    if (close < 0) continue; // unbalanced — leave the text alone rather than guess
    yield { headStart: m.index, open, close, paramsStart: open + 1, params: text.slice(open + 1, close) };
  }
}
