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

/**
 * Explicit overrides for Mega Stones PokéAPI hasn't indexed AT ALL yet —
 * confirmed live that "victreebelite" isn't even listed in PokéAPI's own
 * `item-category/mega-stones` category (not just a 404 on the item resource
 * itself), so there's nothing for the regex-parse loop below to discover no
 * matter how it's written. Mega Victreebel itself is real, confirmed via
 * Bulbapedia ("Victreebel can Mega Evolve into Mega Victreebel using the
 * Victreebelite. Mega Victreebel was introduced in Pokémon Legends: Z-A.")
 * — only the held-item fact is currently inexpressible from PokéAPI's
 * structured data, the same precedent PARTNER_FORM_OVERRIDES/
 * COSMETIC_BASE_FORM_OVERRIDES already set for other PokéAPI-inexpressible
 * facts. Merged in AFTER the live API data below so this never shadows a
 * real value once PokéAPI catches up.
 */
const MEGA_STONE_OVERRIDES: Record<string, string> = {
  "victreebel:mega": "victreebelite",
  // Confirmed live (round 26, auditing #1-151) — same gap, same fix: each of
  // these is a real, Bulbapedia-confirmed Legends: Z-A "Mega Dimension" Mega
  // Evolution (infobox `|mega=`/`|mega2=` field) whose stone item PokéAPI
  // hasn't indexed at all yet. Only the 4 species actually within the #1-151
  // audit range are added here — a much larger, database-wide sweep of the
  // same gap (42 more species/forms across every later generation) was found
  // while investigating this, but is out of scope for a Gen 1 audit; see
  // CLAUDE.md's own note on the remaining scope.
  "raichu:mega_x": "raichunite-x",
  "raichu:mega_y": "raichunite-y",
  "clefable:mega": "clefablite",
  "starmie:mega": "starminite",
  "dragonite:mega": "dragoninite",
};

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
  for (const [key, itemSlug] of Object.entries(MEGA_STONE_OVERRIDES)) {
    if (!map.has(key)) map.set(key, itemSlug);
  }
  return map;
}
