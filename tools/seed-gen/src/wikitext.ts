/**
 * Minimal MediaWiki template-call parser — just enough to pull
 * `{{SomeTemplate|positional|key=value}}` invocations out of raw wikitext
 * without choking on nested templates/links inside parameter values (e.g.
 * `{{Availability/Entry2|v=Diamond|v2=Pearl|area=[[Route]]s {{rtn|209|Sinnoh}}}}`
 * — the `{{rtn|...}}` and `|`s inside the [[...]] must not be mistaken for
 * the outer template's own boundary/params).
 */

/** Finds every top-level `{{Name...}}` call whose name starts with `namePrefix`. */
export function findTemplateCalls(text: string, namePrefix: string): string[] {
  const calls: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "{" && text[i + 1] === "{") {
      const nameEnd = text.slice(i + 2).search(/[|}]/);
      const name = text.slice(i + 2, nameEnd === -1 ? undefined : i + 2 + nameEnd).trim();
      if (name.startsWith(namePrefix)) {
        let depth = 1;
        let j = i + 2;
        while (j < text.length && depth > 0) {
          if (text[j] === "{" && text[j + 1] === "{") {
            depth++;
            j += 2;
          } else if (text[j] === "}" && text[j + 1] === "}") {
            depth--;
            j += 2;
          } else {
            j++;
          }
        }
        if (depth > 0) break; // hit EOF before the closing }} — truncated/malformed page, stop rather than swallow the rest of the document into one bad call
        calls.push(text.slice(i, j));
        i = j;
        continue;
      }
    }
    i++;
  }
  return calls;
}

export interface ParsedTemplate {
  name: string;
  params: Record<string, string>;
}

/** Splits a single `{{...}}` call into its name + named (`key=value`) params, ignoring positional flags and pipes nested inside `{{}}`/`[[]]`. */
export function parseTemplateCall(call: string): ParsedTemplate {
  const inner = call.slice(2, -2);
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let i = 0;
  while (i < inner.length) {
    const two = inner.slice(i, i + 2);
    if (two === "{{" || two === "[[") {
      depth++;
      current += two;
      i += 2;
      continue;
    }
    if (two === "}}" || two === "]]") {
      depth--;
      current += two;
      i += 2;
      continue;
    }
    if (inner[i] === "|" && depth === 0) {
      parts.push(current);
      current = "";
      i++;
      continue;
    }
    current += inner[i];
    i++;
  }
  parts.push(current);

  const name = (parts[0] ?? "").trim();
  const params: Record<string, string> = {};
  for (const part of parts.slice(1)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue; // positional param, not needed here
    const key = part.slice(0, eq).trim();
    if (!/^[a-zA-Z0-9_]+$/.test(key)) continue; // guard against '=' inside an unkeyed value
    params[key] = part.slice(eq + 1).trim();
  }
  return { name, params };
}

/** Splits `text` on every top-level occurrence of `sep`, ignoring occurrences nested inside `{{}}`/`[[]]`. */
export function splitOutsideBrackets(text: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let i = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    if (two === "{{" || two === "[[") {
      depth++;
      current += two;
      i += 2;
      continue;
    }
    if (two === "}}" || two === "]]") {
      depth--;
      current += two;
      i += 2;
      continue;
    }
    if (depth === 0 && text.slice(i, i + sep.length) === sep) {
      parts.push(current);
      current = "";
      i += sep.length;
      continue;
    }
    current += text[i];
    i++;
  }
  parts.push(current);
  return parts;
}
