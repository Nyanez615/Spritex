/**
 * Pulls per-species metadata + regional-form varieties + sprite URLs from
 * the live PokéAPI REST API (cached to disk — see httpCache.ts). PokéAPI's
 * own fair-use guidance prefers the bulk `api-data` dump for crawlers, but
 * that repo is multi-gigabyte (it includes every sprite binary); since this
 * pipeline only needs ~3 lightweight JSON endpoints per species (~3000
 * requests total) and caches them, a polite rate-limited REST crawl is the
 * more practical choice here without meaningfully departing from that
 * guidance's intent (don't hammer the live API with naive, uncached,
 * unbounded-concurrency requests).
 *
 * Wild/static/gift availability per game is NOT fetched here — see
 * scrapeBulbapedia.ts's header for why Bulbapedia's Game-locations table
 * ended up being the better single source for that, including for the
 * newest games where PokéAPI's own encounter data is known-incomplete.
 */
import { cachedJson, ConcurrencyLimiter, writeOutJson } from "./httpCache.js";

const POKEAPI_BASE = "https://pokeapi.co/api/v2";

/**
 * Regional-form adjectives, used as an English-name *prefix* match rather
 * than matching PokéAPI's raw `form_name` slug. Verified live: real regional
 * forms' English names all start with "<Adjective> " — "Alolan Raichu",
 * "Galarian Meowth", "Paldean Tauros (Combat Breed)" — while cosmetic forms
 * that also reference a region never use the adjective form: "Alola Cap
 * Pikachu", "High Plains Vivillon". An exact `form_name` match (the
 * previous approach) misses Paldean Tauros's 3 breeds, whose `form_name` is
 * `"paldea-combat-breed"` etc., not exactly `"paldea"`; this prefix check
 * catches them while still excluding the cap/pattern cosmetics.
 */
const REGIONAL_ADJECTIVES = ["Alolan ", "Galarian ", "Hisuian ", "Paldean "];

interface PokeApiNamedResource {
  name: string;
  url: string;
}

interface PokeApiSpeciesList {
  count: number;
  results: PokeApiNamedResource[];
}

interface PokeApiLocalizedName {
  name: string;
  language: PokeApiNamedResource;
}

interface PokeApiSpecies {
  id: number;
  name: string;
  gender_rate: number;
  is_legendary: boolean;
  is_mythical: boolean;
  is_baby: boolean;
  generation: PokeApiNamedResource;
  egg_groups: PokeApiNamedResource[];
  names: PokeApiLocalizedName[];
  varieties: Array<{ is_default: boolean; pokemon: PokeApiNamedResource }>;
  color: PokeApiNamedResource;
  shape: PokeApiNamedResource | null;
  growth_rate: PokeApiNamedResource;
  capture_rate: number;
  base_happiness: number;
  evolution_chain: { url: string };
}

interface PokeApiSprites {
  front_default: string | null;
  front_shiny: string | null;
  front_female: string | null;
  front_shiny_female: string | null;
  other?: {
    "official-artwork"?: { front_default: string | null; front_shiny: string | null };
    home?: { front_default: string | null; front_shiny: string | null };
  };
}

interface PokeApiPokemon {
  id: number;
  name: string;
  height: number;
  weight: number;
  types: Array<{ slot: number; type: PokeApiNamedResource }>;
  sprites: PokeApiSprites;
  forms: PokeApiNamedResource[];
  stats: Array<{ base_stat: number; stat: PokeApiNamedResource }>;
  abilities: Array<{ ability: PokeApiNamedResource; is_hidden: boolean }>;
}

interface PokeApiForm {
  is_battle_only: boolean;
  is_mega: boolean;
  form_name: string;
  names: PokeApiLocalizedName[];
}

export interface FetchedVariety {
  formId: number;
  formName: string | null;
  displayName: string;
  types: string[];
  spriteUrl: string;
  shinySpriteUrl: string;
  /** Gender-difference sprites — null for the ~90% of species with no visual gender difference. */
  spriteUrlFemale: string | null;
  shinySpriteUrlFemale: string | null;
  height: number;
  weight: number;
  abilities: string[];
  /**
   * Base stats computed at level 100 with max neutral IVs (31), 0 EVs, neutral
   * nature — Bulbapedia's standard Gen 3+ stat formula collapses to
   * `2*base+141` for HP and `2*base+36` for every other stat at those inputs.
   * Confirmed convention with the user; not raw PokéAPI base_stat values.
   */
  statHp: number;
  statAttack: number;
  statDefense: number;
  statSpecialAttack: number;
  statSpecialDefense: number;
  statSpeed: number;
  statTotal: number;
}

export interface FetchedSpecies {
  pokemonId: number;
  name: string;
  displayName: string;
  generationNumber: number;
  genderRate: number;
  isLegendary: boolean;
  isMythical: boolean;
  isBaby: boolean;
  isBreedable: boolean;
  color: string;
  /** Null for a handful of legacy species PokéAPI never assigned a shape to. */
  shape: string | null;
  growthRate: string;
  eggGroups: string[];
  captureRate: number;
  baseHappiness: number;
  evolutionChainUrl: string;
  varieties: FetchedVariety[];
}

function englishName(names: PokeApiLocalizedName[], fallback: string): string {
  return names.find((n) => n.language.name === "en")?.name ?? fallback;
}

function bestSprite(sprites: PokeApiSprites, shiny: boolean): string {
  const oa = sprites.other?.["official-artwork"];
  const home = sprites.other?.home;
  const fromOa = shiny ? oa?.front_shiny : oa?.front_default;
  if (fromOa) return fromOa;
  const fromHome = shiny ? home?.front_shiny : home?.front_default;
  if (fromHome) return fromHome;
  const fallback = shiny ? sprites.front_shiny : sprites.front_default;
  return fallback ?? "";
}

/**
 * Gender-difference sprites only ever appear in the base `sprites.front_female`/
 * `front_shiny_female` fields, never in the official-artwork/home sub-objects —
 * unlike bestSprite() there's no fallback chain to walk.
 */
function femaleSprite(sprites: PokeApiSprites, shiny: boolean): string | null {
  return shiny ? sprites.front_shiny_female : sprites.front_female;
}

function statAt100(base: number, isHp: boolean): number {
  return isHp ? 2 * base + 141 : 2 * base + 36;
}

function generationNumberFromName(name: string): number {
  // "generation-i" .. "generation-ix"
  const roman = name.split("-")[1]?.toUpperCase() ?? "";
  const romanToInt: Record<string, number> = {
    I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9,
  };
  return romanToInt[roman] ?? 0;
}

function extractStats(stats: PokeApiPokemon["stats"]): Pick<FetchedVariety, "statHp" | "statAttack" | "statDefense" | "statSpecialAttack" | "statSpecialDefense" | "statSpeed" | "statTotal"> {
  const base = (name: string) => stats.find((s) => s.stat.name === name)?.base_stat ?? 0;
  const statHp = statAt100(base("hp"), true);
  const statAttack = statAt100(base("attack"), false);
  const statDefense = statAt100(base("defense"), false);
  const statSpecialAttack = statAt100(base("special-attack"), false);
  const statSpecialDefense = statAt100(base("special-defense"), false);
  const statSpeed = statAt100(base("speed"), false);
  return {
    statHp, statAttack, statDefense, statSpecialAttack, statSpecialDefense, statSpeed,
    statTotal: statHp + statAttack + statDefense + statSpecialAttack + statSpecialDefense + statSpeed,
  };
}

async function fetchVarietyDetail(limiter: ConcurrencyLimiter, variety: { is_default: boolean; pokemon: PokeApiNamedResource }, fallbackDisplayName: string, formIndex: number): Promise<FetchedVariety | undefined> {
  const pokemon = await limiter.run(() => cachedJson<PokeApiPokemon>("pokeapi-pokemon", variety.pokemon.name, variety.pokemon.url));
  const shared = {
    types: pokemon.types.map((t) => t.type.name),
    spriteUrl: bestSprite(pokemon.sprites, false),
    shinySpriteUrl: bestSprite(pokemon.sprites, true),
    spriteUrlFemale: femaleSprite(pokemon.sprites, false),
    shinySpriteUrlFemale: femaleSprite(pokemon.sprites, true),
    height: pokemon.height,
    weight: pokemon.weight,
    abilities: pokemon.abilities.map((a) => a.ability.name),
    ...extractStats(pokemon.stats),
  };

  if (!variety.is_default) {
    const formRef = pokemon.forms[0];
    if (!formRef) return undefined;
    const form = await limiter.run(() => cachedJson<PokeApiForm>("pokeapi-form", formRef.name, formRef.url));
    if (form.is_battle_only || form.is_mega) return undefined; // Mega/Gmax/battle-only — not a distinct dex entry
    const formDisplayName = englishName(form.names, pokemon.name);
    const adjective = REGIONAL_ADJECTIVES.find((prefix) => formDisplayName.startsWith(prefix));
    if (!adjective) return undefined; // cosmetic-only variant (pattern/cap/season/etc.) — not modeled

    return {
      formId: formIndex,
      formName: adjective.trim(),
      displayName: formDisplayName,
      ...shared,
    };
  }

  return {
    formId: 0,
    formName: null,
    displayName: fallbackDisplayName,
    ...shared,
  };
}

export async function fetchAllSpecies(): Promise<FetchedSpecies[]> {
  const list = await cachedJson<PokeApiSpeciesList>("pokeapi-species-list", "all", `${POKEAPI_BASE}/pokemon-species?limit=2000`);
  const limiter = new ConcurrencyLimiter(8);
  const out: FetchedSpecies[] = [];

  const limit = process.env.SEED_GEN_LIMIT ? Number(process.env.SEED_GEN_LIMIT) : undefined;
  const targets = limit ? list.results.slice(0, limit) : list.results;

  // NB: each task below issues several *nested* network requests (species,
  // then per-variety pokemon + form). The ConcurrencyLimiter is only ever
  // acquired around individual leaf fetches (inside cachedJson call sites),
  // never around this whole per-species task — wrapping the outer task in
  // the same limiter would deadlock once `max` tasks are concurrently
  // holding an outer slot while each waits on an inner slot from the same
  // limiter that's already fully checked out.
  let done = 0;
  await Promise.all(
    targets.map(async (ref) => {
      const species = await limiter.run(() => cachedJson<PokeApiSpecies>("pokeapi-species", ref.name, ref.url));
      const displayName = englishName(species.names, species.name);
      const isBreedable = !species.egg_groups.some((g) => g.name === "no-eggs");

      const varieties: FetchedVariety[] = [];
      let formIndex = 1;
      for (const variety of species.varieties) {
        const detail = await fetchVarietyDetail(limiter, variety, displayName, variety.is_default ? 0 : formIndex);
        if (detail) {
          varieties.push(detail);
          if (!variety.is_default) formIndex++;
        }
      }
      varieties.sort((a, b) => a.formId - b.formId);

      out.push({
        pokemonId: species.id,
        name: species.name,
        displayName,
        generationNumber: generationNumberFromName(species.generation.name),
        genderRate: species.gender_rate,
        isLegendary: species.is_legendary,
        isMythical: species.is_mythical,
        isBaby: species.is_baby,
        isBreedable,
        color: species.color.name,
        shape: species.shape?.name ?? null,
        growthRate: species.growth_rate.name,
        eggGroups: species.egg_groups.map((g) => g.name),
        captureRate: species.capture_rate,
        baseHappiness: species.base_happiness,
        evolutionChainUrl: species.evolution_chain.url,
        varieties,
      });

      done++;
      if (done % 100 === 0) console.log(`  fetched ${done}/${targets.length} species`);
    })
  );

  out.sort((a, b) => a.pokemonId - b.pokemonId);
  return out;
}

export async function runFetchPokeapi(): Promise<FetchedSpecies[]> {
  console.log(`fetchPokeapi: fetching species metadata from PokéAPI...`);
  const species = await fetchAllSpecies();
  await writeOutJson("species.json", species);
  console.log(`fetchPokeapi: wrote ${species.length} species to out/species.json`);
  return species;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFetchPokeapi().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
