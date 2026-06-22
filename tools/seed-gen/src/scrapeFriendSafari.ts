/**
 * Scrapes the dedicated `Friend Safari` Bulbapedia article for its roster —
 * a single page fetch, not per-species. The article's "Pokémon" section
 * contains all 18 type-safari subsections together, each listing species
 * via a repeated, positional (not key=value) template:
 * `{{catch/entry6|ndex|Name|...}}`. Verified live: 196 entries, 189 unique
 * species, one page fetch.
 *
 * X/Y only (ORAS replaced Friend Safari's role with DexNav — see
 * oddsFormulas.ts) — and no regional forms existed yet in Gen6, so unlike
 * scrapeDynamaxAdventure.ts there's no form disambiguation to do here.
 */
import { findTemplateCalls, splitOutsideBrackets } from "./wikitext.js";
import { fetchNamedSection } from "./mediawikiClient.js";
import { writeOutJson } from "./httpCache.js";

const PAGE = "Friend Safari";
const SECTION_HEADING = "Pokémon";

export interface FriendSafariFact {
  pokemonId: number;
}

export function parseRoster(wikitext: string): FriendSafariFact[] {
  const calls = findTemplateCalls(wikitext, "catch/entry6");
  const seen = new Set<number>();
  const facts: FriendSafariFact[] = [];

  for (const call of calls) {
    // catch/entry6 params are positional: name, ndex, species, ... — not
    // key=value, so parseTemplateCall's named-param extraction doesn't
    // apply here; split the raw inner text directly instead.
    const parts = splitOutsideBrackets(call.slice(2, -2), "|");
    const ndex = Number(parts[1]);
    if (!ndex || seen.has(ndex)) continue;
    seen.add(ndex);
    facts.push({ pokemonId: ndex });
  }

  return facts;
}

export async function runScrapeFriendSafari(): Promise<FriendSafariFact[]> {
  const section = await fetchNamedSection(PAGE, SECTION_HEADING);
  if (!section) throw new Error(`scrapeFriendSafari: section "${SECTION_HEADING}" not found on "${PAGE}"`);

  const facts = parseRoster(section.wikitext);
  console.log(`scrapeFriendSafari: ${facts.length} species in the Friend Safari roster`);
  await writeOutJson("friend-safari.json", facts);
  return facts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runScrapeFriendSafari().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
