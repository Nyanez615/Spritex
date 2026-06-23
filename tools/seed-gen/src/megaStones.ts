/**
 * Maps each Mega-capable species to the item (Mega Stone) required, fully
 * derived from PokéAPI — no hardcoded species/stone table. The mega-stone
 * *item names* are irregular (confirmed live: "abomasite" ← Abomasnow,
 * "alakazite" ← Alakazam, "manectite" ← Manectric, "sablenite" ← Sableye,
 * "lucarionite" ← Lucario — none follow a clean `{species}ite` suffix rule),
 * and PokéAPI's `item.held_by_pokemon` is empty for these items (confirmed
 * live — no relational species link there). But every mega-stone item's
 * `effect_entries` text is a structured, consistently-phrased mechanical
 * fact: "Held: Allows Charizard to Mega Evolve into Mega Charizard X." —
 * verified against several items including the irregular-named and X/Y-split
 * ones. Parsing that text is what this module does; it's the same kind of
 * PokéAPI-derived mechanical fact already used everywhere else in this
 * pipeline (abilities, types, stats), not a new data-sourcing category.
 */
import { cachedJson, ConcurrencyLimiter } from "./httpCache.js";

const POKEAPI_BASE = "https://pokeapi.co/api/v2";

interface PokeApiItemCategory {
  items: Array<{ name: string; url: string }>;
}

interface PokeApiItem {
  name: string;
  effect_entries: Array<{ effect: string; language: { name: string } }>;
}

const EFFECT_PATTERN = /^Held: Allows (.+?) to Mega Evolve into Mega \1(?: (X|Y))?\.$/;

/** Keyed by `${baseSpeciesName}:${kind}`, e.g. "venusaur:mega", "charizard:mega_x" — values are item slugs, e.g. "venusaurite". */
export async function fetchMegaStoneMap(): Promise<Map<string, string>> {
  const category = await cachedJson<PokeApiItemCategory>(
    "pokeapi-item-category",
    "mega-stones",
    `${POKEAPI_BASE}/item-category/mega-stones/`,
  );

  // Same bounded-concurrency convention as fetchPokeapi.ts/scrapeBulbapedia.ts
  // — a fixed ~47-item category is small, but there's no reason to be the
  // one fetch loop in the pipeline that doesn't respect it.
  const limiter = new ConcurrencyLimiter(6);
  const map = new Map<string, string>();
  await Promise.all(
    category.items.map(async (itemRef) => {
      const item = await limiter.run(() => cachedJson<PokeApiItem>("pokeapi-item", itemRef.name, itemRef.url));
      const effect = item.effect_entries.find((e) => e.language.name === "en")?.effect ?? "";
      const match = effect.match(EFFECT_PATTERN);
      if (!match) {
        console.log(`  fetchMegaStones: couldn't parse species from "${item.name}"'s effect text ("${effect}") — skipped, not guessed`);
        return;
      }
      const speciesName = match[1].toLowerCase().replace(/\s+/g, "-");
      const kind = match[2] === "X" ? "mega_x" : match[2] === "Y" ? "mega_y" : "mega";
      map.set(`${speciesName}:${kind}`, item.name);
    }),
  );
  return map;
}
