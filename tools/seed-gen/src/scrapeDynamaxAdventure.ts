/**
 * Scrapes the dedicated `Dynamax Adventure` Bulbapedia article for its
 * roster — a single page fetch, not per-species, since both the "Rentable
 * and encounterable Pokémon" and "Special Pokémon" (legendary/Ultra Beast
 * den prizes) sections use one repeated, cleanly parseable template per
 * entry: `{{Pokémon | gen=8 | ndex=0026 | pokemon=Raichu | form=-Alola | ...}}`.
 * Verified live — contrary to last session's "no reliable per-species
 * signal" conclusion, this roster page is exactly that signal.
 *
 * The same flat 1/300 (1/100 w/ Charm) rate applies to both sections per
 * the article's own wording ("each Pokémon *encountered*..."), so both are
 * scraped identically and merged into one fact list.
 */
import type { FetchedSpecies } from "./fetchPokeapi.js";
import { findTemplateCalls, parseTemplateCall } from "./wikitext.js";
import { fetchNamedSection } from "./mediawikiClient.js";
import { readOutJson, writeOutJson } from "./httpCache.js";

const PAGE = "Dynamax Adventure";
const SECTIONS = ["Rentable and encounterable Pokémon", "Special Pokémon"];

/** Bulbapedia's `form=` suffix word -> our tracked variety's formName adjective. */
const FORM_SUFFIX_TO_ADJECTIVE: Record<string, string> = {
  Alola: "Alolan",
  Galar: "Galarian",
  Hisui: "Hisuian",
  Paldea: "Paldean",
};

export interface DynamaxAdventureFact {
  pokemonId: number;
  formId: number;
}

function resolveFormId(species: FetchedSpecies, formSuffix: string | undefined): number {
  if (!formSuffix) return 0;
  const word = formSuffix.replace(/^-/, "");
  const adjective = FORM_SUFFIX_TO_ADJECTIVE[word];
  if (!adjective) return 0; // -Gigantamax/-Mega/etc. — cosmetic, collapses to the base form
  const variety = species.varieties.find((v) => v.formName === adjective);
  return variety ? variety.formId : 0;
}

export function parseRoster(wikitext: string, speciesById: Map<number, FetchedSpecies>): DynamaxAdventureFact[] {
  const calls = findTemplateCalls(wikitext, "Pokémon");
  const seen = new Set<string>();
  const facts: DynamaxAdventureFact[] = [];

  for (const call of calls) {
    const { params } = parseTemplateCall(call);
    if (!params.ndex) continue;
    const pokemonId = Number(params.ndex);
    const species = speciesById.get(pokemonId);
    if (!species) continue; // outside the species set fetched this run (e.g. SEED_GEN_LIMIT in tests)

    const formId = resolveFormId(species, params.form);
    const key = `${pokemonId}:${formId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({ pokemonId, formId });
  }

  return facts;
}

export async function runScrapeDynamaxAdventure(): Promise<DynamaxAdventureFact[]> {
  const species = await readOutJson<FetchedSpecies[]>("species.json");
  const speciesById = new Map(species.map((s) => [s.pokemonId, s]));

  const allFacts: DynamaxAdventureFact[] = [];
  for (const heading of SECTIONS) {
    const section = await fetchNamedSection(PAGE, heading);
    if (!section) {
      console.log(`  scrapeDynamaxAdventure: section "${heading}" not found on "${PAGE}" — page structure may have changed`);
      continue;
    }
    allFacts.push(...parseRoster(section.wikitext, speciesById));
  }

  const seen = new Set<string>();
  const facts = allFacts.filter((f) => {
    const key = `${f.pokemonId}:${f.formId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`scrapeDynamaxAdventure: ${facts.length} (species, form) entries in the DA roster`);
  await writeOutJson("dynamax-adventure.json", facts);
  return facts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runScrapeDynamaxAdventure().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
