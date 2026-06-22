/**
 * Scrapes Bulbapedia's "List of unobtainable Shiny Pokémon" — the real
 * source for the "small, finite exclusion list" the plan's §4.1 describes
 * (it speculatively called this a separate "Shiny-Locked wiki"; it's
 * actually one Bulbapedia article using the same MediaWiki API as
 * scrapeBulbapedia.ts, organized as one row per species/form with a column
 * per generation rather than per our finer Game buckets).
 *
 * Row shape (verified against the live page):
 *   | <image(s)>
 *   | {{p|Articuno}}                         <- plain species
 *   | {{p|Articuno}}<br><small>Galarian Form</small>   <- one of our 4 tracked regional forms
 *   | {{yes}}<br>... || {{yes}}<br>... || ~ || ~ || ...   <- one cell per generation-group column
 * `{{yes}}` = obtainable, `{{no}}` = shiny-locked, `~` = event/transfer-only
 * (not obtainable through normal play — treated the same as locked for
 * hunting purposes), a gray `colspan=N style="background:#999"` cell =
 * "doesn't exist yet in these generations" (no claim either way).
 *
 * Rows whose name cell is anything other than a bare `{{p|Name}}` (plus,
 * optionally, one of our 4 tracked region-form annotations) are skipped
 * entirely rather than guessed at — this matters because several rows
 * describe cosmetic sub-variants (Cosplay Pikachu, Partner Pikachu/Eevee,
 * Pikachu in a cap) that still reference the base species via `{{p|}}`.
 * Naively matching those would wrongly lock the *entire* base species —
 * e.g. "Partner Pikachu" is shiny-locked in Let's Go Pikachu, but regular
 * wild Pikachu in that same game is not.
 */
import { fetchFullWikitext } from "./mediawikiClient.js";
import { splitOutsideBrackets } from "./wikitext.js";
import { writeOutJson } from "./httpCache.js";
import type { Game } from "./gameMap.js";

const PAGE = "List of unobtainable Shiny Pokémon";

/** Generation-group column order exactly as the table's header row lists them. */
const COLUMN_GAMES: Game[][] = [
  ["gen2_vc"], // I & II (Gen 1 has no shiny mechanic, so it's a no-op either way)
  ["gen3_rs", "gen3_e", "gen3_frlg"], // III
  ["gen4_dp", "gen4_pt", "gen4_hgss"], // IV
  ["gen5_bw", "gen5_b2_w2"], // V
  ["gen6_xy", "gen6_oras"], // VI
  ["gen7_sm", "gen7_usum", "lgpe"], // VII
  ["swsh", "bdsp", "pla"], // VIII
  ["sv"], // IX
];

export interface ShinyLockFact {
  pokemonName: string; // PokéAPI-style lowercase species name, resolved by deriveShinyMethods.ts
  formName: string | null; // "Galarian" etc., or null for the base form
  game: Game;
}

function extractTable(wikitext: string): string {
  const start = wikitext.indexOf('{| class="roundy sortable"');
  if (start === -1) throw new Error(`scrapeShinyLocks: couldn't find the table start on "${PAGE}" — page structure may have changed`);
  let depth = 0;
  let i = start;
  while (i < wikitext.length) {
    if (wikitext[i] === "{" && wikitext[i + 1] === "|") {
      depth++;
      i += 2;
      continue;
    }
    if (wikitext[i] === "|" && wikitext[i + 1] === "}") {
      depth--;
      i += 2;
      if (depth === 0) break;
      continue;
    }
    i++;
  }
  if (depth !== 0) throw new Error(`scrapeShinyLocks: table on "${PAGE}" never closed — truncated fetch or page structure changed`);
  return wikitext.slice(start, i);
}

function cellStatus(cell: string): "open" | "locked" | "unknown" {
  if (cell.includes("{{yes}}")) return "open";
  if (cell.includes("{{no}}")) return "locked";
  if (cell.trim() === "~") return "locked";
  return "unknown"; // gray N/A placeholder, or anything unrecognized — no claim either way
}

function parseGenerationCells(line: string): Array<"open" | "locked" | "unknown"> {
  const rawCells = splitOutsideBrackets(line, "||");
  const expanded: Array<"open" | "locked" | "unknown"> = [];
  for (const raw of rawCells) {
    const colspanMatch = raw.match(/colspan=["']?(\d+)["']?/);
    const span = colspanMatch ? Number(colspanMatch[1]) : 1;
    const status = cellStatus(raw);
    for (let i = 0; i < span; i++) expanded.push(status);
  }
  return expanded;
}

const NAME_CELL_PATTERN = /^\{\{p\|([^}|]+)\}\}(?:\s*<br ?\/?>\s*<small>\s*([A-Za-z]+)\s+Form\s*<\/small>)?$/;

function parseNameCell(rawLine: string): { name: string; formName: string | null } | undefined {
  const stripped = rawLine
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/<ref[^>]*\/>/g, "")
    .trim();
  const match = NAME_CELL_PATTERN.exec(stripped);
  if (!match) return undefined;
  return { name: match[1].trim(), formName: match[2] ?? null };
}

export function parseShinyLockTable(wikitext: string): ShinyLockFact[] {
  const table = extractTable(wikitext);
  const rowChunks = table.split(/\n\|-/).slice(1); // [0] is the bit before the first row marker
  const facts: ShinyLockFact[] = [];

  for (const chunk of rowChunks) {
    if (!chunk.includes("{{p|")) continue; // header rows, or rows for things we don't track at all

    const lines = chunk
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("|") && !l.startsWith("|}"));
    if (lines.length < 2) continue;

    const genLine = lines[lines.length - 1].replace(/^\|/, "");
    const nameLine = lines[lines.length - 2].replace(/^\|/, "").trim();

    const parsedName = parseNameCell(nameLine);
    if (!parsedName) continue; // special sub-variant row (Partner Pikachu, Cosplay Pikachu, ...) — don't guess

    const cells = parseGenerationCells(genLine);
    if (cells.length !== COLUMN_GAMES.length) continue; // malformed/unexpected row shape — skip rather than misattribute

    for (let col = 0; col < COLUMN_GAMES.length; col++) {
      if (cells[col] !== "locked") continue;
      for (const game of COLUMN_GAMES[col]) {
        facts.push({ pokemonName: parsedName.name.toLowerCase(), formName: parsedName.formName, game });
      }
    }
  }

  return facts;
}

export async function runScrapeShinyLocks(): Promise<ShinyLockFact[]> {
  const wikitext = await fetchFullWikitext(PAGE);
  if (!wikitext) throw new Error(`scrapeShinyLocks: page "${PAGE}" not found`);
  const facts = parseShinyLockTable(wikitext);
  console.log(`scrapeShinyLocks: ${facts.length} (species/form, game) shiny-locks found`);
  await writeOutJson("shiny-locks.json", facts);
  return facts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runScrapeShinyLocks().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
