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
import { fetchMegaStoneMap } from "./megaStones.js";

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
  has_gender_differences: boolean;
  is_legendary: boolean;
  is_mythical: boolean;
  is_baby: boolean;
  generation: PokeApiNamedResource;
  egg_groups: PokeApiNamedResource[];
  /** In cycles — 1 cycle = 255 steps (Bulbapedia convention). */
  hatch_counter: number;
  names: PokeApiLocalizedName[];
  varieties: Array<{ is_default: boolean; pokemon: PokeApiNamedResource }>;
  color: PokeApiNamedResource;
  shape: PokeApiNamedResource | null;
  growth_rate: PokeApiNamedResource;
  capture_rate: number;
  base_happiness: number;
  evolution_chain: { url: string };
  flavor_text_entries: Array<{ flavor_text: string; language: PokeApiNamedResource; version: PokeApiNamedResource }>;
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
  base_experience: number | null;
  types: Array<{ slot: number; type: PokeApiNamedResource }>;
  sprites: PokeApiSprites;
  forms: PokeApiNamedResource[];
  stats: Array<{ base_stat: number; effort: number; stat: PokeApiNamedResource }>;
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
  /** Raw PokéAPI pokemon-resource name this variety was fetched from (e.g. "meowth-alola") — lets fetchEvolutionChains.ts resolve evolution_details' base_form/evolved_form references back to a (pokemonId, formId) pair. */
  apiPokemonName: string;
  types: string[];
  spriteUrl: string;
  shinySpriteUrl: string;
  /** Gender-difference sprites — null for the ~90% of species with no visual gender difference. */
  spriteUrlFemale: string | null;
  shinySpriteUrlFemale: string | null;
  height: number;
  weight: number;
  abilities: Array<{ name: string; isHidden: boolean }>;
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
  /** PokéAPI's `base_experience` — null for a handful of entries with no battle data. */
  baseExperience: number;
  /** EV yield per stat — PokéAPI's `stats[].effort`, raw (not the level-100 statAt100 transform above). */
  evYieldHp: number;
  evYieldAttack: number;
  evYieldDefense: number;
  evYieldSpecialAttack: number;
  evYieldSpecialDefense: number;
  evYieldSpeed: number;
}

export type CosmeticFormKind = "mega" | "mega_x" | "mega_y" | "gmax";

/**
 * Mega Evolution / Gigantamax — cosmetic battle forms, not distinct dex
 * entries (same reasoning that already excludes them from `varieties`):
 * Mega reverts after battle and Gigantamax doesn't change a species'
 * shininess, so neither needs its own shiny-method rows. Captured purely
 * for sprite display + (mega only) the required held item.
 */
export interface FetchedCosmeticForm {
  pokemonId: number;
  /** Which varieties[].formId this attaches to — always 0; no released game pairs Mega/Gmax with a regional form. */
  baseFormId: number;
  kind: CosmeticFormKind;
  displayName: string;
  spriteUrl: string;
  shinySpriteUrl: string;
  /** PokéAPI item slug, e.g. "venusaurite" — null for Gigantamax (no held item). */
  megaStoneItem: string | null;
  /**
   * Mega/Gmax forms can have genuinely different types/stats/abilities than
   * the base form (e.g. Mega Charizard X is Fire/Dragon, not Fire/Flying;
   * Mega Venusaur has a single fixed ability, Thick Fat) — these were
   * already being fetched into fetchVarietyDetail's `shared` object but
   * discarded before this field set existed.
   */
  types: string[];
  height: number;
  weight: number;
  abilities: Array<{ name: string; isHidden: boolean }>;
  statHp: number;
  statAttack: number;
  statDefense: number;
  statSpecialAttack: number;
  statSpecialDefense: number;
  statSpeed: number;
  statTotal: number;
  baseExperience: number;
  evYieldHp: number;
  evYieldAttack: number;
  evYieldDefense: number;
  evYieldSpecialAttack: number;
  evYieldSpecialDefense: number;
  evYieldSpeed: number;
}

export interface FetchedSpecies {
  pokemonId: number;
  name: string;
  displayName: string;
  generationNumber: number;
  genderRate: number;
  hasGenderDifferences: boolean;
  isLegendary: boolean;
  isMythical: boolean;
  isBaby: boolean;
  isBreedable: boolean;
  /** Steps to hatch from an egg — PokéAPI's raw hatch_counter (cycles) * 255. */
  hatchSteps: number;
  color: string;
  /**
   * Null for a handful of legacy species PokéAPI never assigned a shape to.
   * Text only, deliberately not an icon — verified during implementation
   * that neither PokéAPI nor a CC0 source has shape-silhouette icon sprites
   * (the `/pokemon-shape/{id}` endpoint exposes only names, no sprite field;
   * checked live). Real footprint/shape icons exist on Bulbagarden Archives
   * (e.g. "F0252gen2.png"), but those are extracted in-game UI assets with
   * no confirmed open license — same "fair use" risk class already
   * confirmed for game box art/logos (see the Game-badge IP discussion),
   * not PokéAPI's CC0 sprite repo. Don't add icon sprites for shape or
   * footprint without first finding (and citing) an actually CC0/openly-
   * licensed source — none is known to exist as of this writing.
   */
  shape: string | null;
  growthRate: string;
  eggGroups: string[];
  captureRate: number;
  baseHappiness: number;
  evolutionChainUrl: string;
  /** Latest English Pokédex description across every game PokéAPI has indexed — null only if no English entry exists at all. */
  flavorText: string | null;
  varieties: FetchedVariety[];
}

/**
 * PokéAPI's flavor_text_entries spans every game version PokéAPI has indexed,
 * confirmed live to be in chronological array order — so the last English
 * entry is always the most recently released game's text, no version-to-
 * generation mapping needed. Strips the \n/\f line-wrap characters PokéAPI
 * embeds for in-game text-box formatting.
 */
function pickFlavorText(entries: PokeApiSpecies["flavor_text_entries"]): string | null {
  const english = entries.filter((e) => e.language.name === "en");
  if (english.length === 0) return null;
  return english[english.length - 1].flavor_text.replace(/[\n\f]/g, " ");
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

/** EV (effort value) yield per stat — raw PokéAPI `effort`, distinct from the level-100 statAt100 transform above. */
function extractEvYield(stats: PokeApiPokemon["stats"]): Pick<FetchedVariety, "evYieldHp" | "evYieldAttack" | "evYieldDefense" | "evYieldSpecialAttack" | "evYieldSpecialDefense" | "evYieldSpeed"> {
  const effort = (name: string) => stats.find((s) => s.stat.name === name)?.effort ?? 0;
  return {
    evYieldHp: effort("hp"),
    evYieldAttack: effort("attack"),
    evYieldDefense: effort("defense"),
    evYieldSpecialAttack: effort("special-attack"),
    evYieldSpecialDefense: effort("special-defense"),
    evYieldSpeed: effort("speed"),
  };
}

/** Determines a cosmetic form's kind from its PokéAPI form flags — undefined for any other battle-only cosmetic (Crowned Sword/Shield, Eternamax, Zen Mode, ...), which stays unmodeled, same as before this feature existed. */
function cosmeticFormKind(form: PokeApiForm): CosmeticFormKind | undefined {
  if (form.is_mega) {
    if (form.form_name === "mega-x") return "mega_x";
    if (form.form_name === "mega-y") return "mega_y";
    return "mega";
  }
  if (form.form_name === "gmax") return "gmax";
  return undefined;
}

async function fetchVarietyDetail(
  limiter: ConcurrencyLimiter,
  variety: { is_default: boolean; pokemon: PokeApiNamedResource },
  fallbackDisplayName: string,
  formIndex: number,
  speciesName: string,
  megaStoneMap: Map<string, string>,
): Promise<{ variety?: FetchedVariety; cosmeticForm?: FetchedCosmeticForm }> {
  const pokemon = await limiter.run(() => cachedJson<PokeApiPokemon>("pokeapi-pokemon", variety.pokemon.name, variety.pokemon.url));
  const shared = {
    types: pokemon.types.map((t) => t.type.name),
    spriteUrl: bestSprite(pokemon.sprites, false),
    shinySpriteUrl: bestSprite(pokemon.sprites, true),
    spriteUrlFemale: femaleSprite(pokemon.sprites, false),
    shinySpriteUrlFemale: femaleSprite(pokemon.sprites, true),
    height: pokemon.height,
    weight: pokemon.weight,
    abilities: pokemon.abilities.map((a) => ({ name: a.ability.name, isHidden: a.is_hidden })),
    ...extractStats(pokemon.stats),
    baseExperience: pokemon.base_experience ?? 0,
    ...extractEvYield(pokemon.stats),
  };

  if (!variety.is_default) {
    const formRef = pokemon.forms[0];
    if (!formRef) return {};
    const form = await limiter.run(() => cachedJson<PokeApiForm>("pokeapi-form", formRef.name, formRef.url));
    if (form.is_battle_only || form.is_mega) {
      const kind = cosmeticFormKind(form);
      if (!kind) return {}; // other battle-only cosmetic (Crowned, Eternamax, ...) — not modeled
      return {
        cosmeticForm: {
          pokemonId: 0, // filled in by the caller, which knows the species id
          baseFormId: 0,
          kind,
          displayName: englishName(form.names, pokemon.name),
          spriteUrl: bestSprite(pokemon.sprites, false),
          shinySpriteUrl: bestSprite(pokemon.sprites, true),
          megaStoneItem: kind === "gmax" ? null : megaStoneMap.get(`${speciesName}:${kind}`) ?? null,
          types: shared.types,
          height: shared.height,
          weight: shared.weight,
          abilities: shared.abilities,
          statHp: shared.statHp,
          statAttack: shared.statAttack,
          statDefense: shared.statDefense,
          statSpecialAttack: shared.statSpecialAttack,
          statSpecialDefense: shared.statSpecialDefense,
          statSpeed: shared.statSpeed,
          statTotal: shared.statTotal,
          baseExperience: shared.baseExperience,
          evYieldHp: shared.evYieldHp,
          evYieldAttack: shared.evYieldAttack,
          evYieldDefense: shared.evYieldDefense,
          evYieldSpecialAttack: shared.evYieldSpecialAttack,
          evYieldSpecialDefense: shared.evYieldSpecialDefense,
          evYieldSpeed: shared.evYieldSpeed,
        },
      };
    }
    const formDisplayName = englishName(form.names, pokemon.name);
    const adjective = REGIONAL_ADJECTIVES.find((prefix) => formDisplayName.startsWith(prefix));
    if (!adjective) return {}; // cosmetic-only variant (pattern/cap/season/etc.) — not modeled

    return {
      variety: {
        formId: formIndex,
        formName: adjective.trim(),
        displayName: formDisplayName,
        apiPokemonName: variety.pokemon.name,
        ...shared,
      },
    };
  }

  return {
    variety: {
      formId: 0,
      formName: null,
      displayName: fallbackDisplayName,
      apiPokemonName: variety.pokemon.name,
      ...shared,
    },
  };
}

export async function fetchAllSpecies(): Promise<{ species: FetchedSpecies[]; cosmeticForms: FetchedCosmeticForm[] }> {
  const list = await cachedJson<PokeApiSpeciesList>("pokeapi-species-list", "all", `${POKEAPI_BASE}/pokemon-species?limit=2000`);
  const limiter = new ConcurrencyLimiter(8);
  const megaStoneMap = await fetchMegaStoneMap();
  const out: FetchedSpecies[] = [];
  const cosmeticForms: FetchedCosmeticForm[] = [];

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
        const { variety: detail, cosmeticForm } = await fetchVarietyDetail(
          limiter, variety, displayName, variety.is_default ? 0 : formIndex, species.name, megaStoneMap,
        );
        if (detail) {
          varieties.push(detail);
          if (!variety.is_default) formIndex++;
        }
        if (cosmeticForm) {
          cosmeticForms.push({ ...cosmeticForm, pokemonId: species.id });
        }
      }
      varieties.sort((a, b) => a.formId - b.formId);

      out.push({
        pokemonId: species.id,
        name: species.name,
        displayName,
        generationNumber: generationNumberFromName(species.generation.name),
        genderRate: species.gender_rate,
        hasGenderDifferences: species.has_gender_differences,
        isLegendary: species.is_legendary,
        isMythical: species.is_mythical,
        isBaby: species.is_baby,
        isBreedable,
        hatchSteps: species.hatch_counter * 255,
        color: species.color.name,
        shape: species.shape?.name ?? null,
        growthRate: species.growth_rate.name,
        eggGroups: species.egg_groups.map((g) => g.name),
        captureRate: species.capture_rate,
        baseHappiness: species.base_happiness,
        evolutionChainUrl: species.evolution_chain.url,
        flavorText: pickFlavorText(species.flavor_text_entries),
        varieties,
      });

      done++;
      if (done % 100 === 0) console.log(`  fetched ${done}/${targets.length} species`);
    })
  );

  out.sort((a, b) => a.pokemonId - b.pokemonId);
  cosmeticForms.sort((a, b) => a.pokemonId - b.pokemonId);
  return { species: out, cosmeticForms };
}

export async function runFetchPokeapi(): Promise<FetchedSpecies[]> {
  console.log(`fetchPokeapi: fetching species metadata from PokéAPI...`);
  const { species, cosmeticForms } = await fetchAllSpecies();
  await writeOutJson("species.json", species);
  await writeOutJson("cosmetic-forms-raw.json", cosmeticForms);
  console.log(`fetchPokeapi: wrote ${species.length} species to out/species.json, ${cosmeticForms.length} cosmetic forms to out/cosmetic-forms-raw.json`);
  return species;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFetchPokeapi().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
