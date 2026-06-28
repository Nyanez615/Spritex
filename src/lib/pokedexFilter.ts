/**
 * Pokédex grid filter/sort state + the pure filter/sort functions that
 * apply it — shared between the grid itself (src/routes/index.tsx) and the
 * detail page's next/prev navigation (src/routes/pokemon.$id.tsx), so a
 * species clicked from a filtered/sorted grid view navigates next/prev
 * through that same context instead of always walking the full dex order.
 */
import { parseJsonArray, type PokemonAbility } from "./format";
import type { StatKey } from "./statCalc";
import type { Pokemon } from "./tauri";

export type Rarity = "legendary" | "mythical" | "baby";
export type GenderBucket = "genderless" | "male-only" | "female-only" | "mixed";

// Object.keys() returns plain string[] — spreading it into an `as const`
// array wouldn't narrow back to literal types, so the sortable keys are
// declared as a literal tuple first and SORT_ACCESSORS is built to exactly
// match it (Record<> below forces every key to be present, so adding a new
// SortKey without an accessor is a compile error, not a silent runtime gap).
const EXTRA_SORT_KEYS = [
  "name", "generation", "height", "weight", "capture_rate", "base_happiness",
  "stat_hp", "stat_attack", "stat_defense", "stat_special_attack", "stat_special_defense",
  "stat_speed", "stat_total", "base_experience", "ev_total",
  "ev_yield_hp", "ev_yield_attack", "ev_yield_defense", "ev_yield_special_attack",
  "ev_yield_special_defense", "ev_yield_speed",
] as const;
export type SortKey = "dex" | (typeof EXTRA_SORT_KEYS)[number];
export const SORT_KEYS: readonly SortKey[] = ["dex", ...EXTRA_SORT_KEYS];

/** Which dropdown a SortKey belongs to in index.tsx's split sort UI — kept in sync with SORT_KEYS by a vitest assertion in pokedexFilter.test.ts. */
export const GENERAL_SORT_KEYS: readonly SortKey[] = [
  "dex", "name", "generation", "height", "weight", "capture_rate", "base_happiness",
];
export const STAT_SORT_KEYS: readonly SortKey[] = [
  "stat_total", "stat_hp", "stat_attack", "stat_defense", "stat_special_attack",
  "stat_special_defense", "stat_speed",
  "ev_total", "ev_yield_hp", "ev_yield_attack", "ev_yield_defense",
  "ev_yield_special_attack", "ev_yield_special_defense", "ev_yield_speed",
  "base_experience",
];

export function evYieldFor(p: Pokemon, key: StatKey): number {
  switch (key) {
    case "hp": return p.ev_yield_hp;
    case "attack": return p.ev_yield_attack;
    case "defense": return p.ev_yield_defense;
    case "special_attack": return p.ev_yield_special_attack;
    case "special_defense": return p.ev_yield_special_defense;
    case "speed": return p.ev_yield_speed;
  }
}

const SORT_ACCESSORS: Record<Exclude<SortKey, "dex">, (p: Pokemon) => number | string> = {
  name: (p) => p.display_name,
  generation: (p) => p.generation,
  height: (p) => p.height,
  weight: (p) => p.weight,
  capture_rate: (p) => p.capture_rate,
  base_happiness: (p) => p.base_happiness,
  stat_hp: (p) => p.stat_hp,
  stat_attack: (p) => p.stat_attack,
  stat_defense: (p) => p.stat_defense,
  stat_special_attack: (p) => p.stat_special_attack,
  stat_special_defense: (p) => p.stat_special_defense,
  stat_speed: (p) => p.stat_speed,
  stat_total: (p) => p.stat_total,
  base_experience: (p) => p.base_experience,
  ev_total: (p) =>
    p.ev_yield_hp + p.ev_yield_attack + p.ev_yield_defense +
    p.ev_yield_special_attack + p.ev_yield_special_defense + p.ev_yield_speed,
  ev_yield_hp: (p) => p.ev_yield_hp,
  ev_yield_attack: (p) => p.ev_yield_attack,
  ev_yield_defense: (p) => p.ev_yield_defense,
  ev_yield_special_attack: (p) => p.ev_yield_special_attack,
  ev_yield_special_defense: (p) => p.ev_yield_special_defense,
  ev_yield_speed: (p) => p.ev_yield_speed,
};
export const SORT_LABELS: Record<SortKey, string> = {
  dex: "Dex Number",
  name: "Name",
  generation: "Generation",
  height: "Height",
  weight: "Weight",
  capture_rate: "Capture Rate",
  base_happiness: "Base Happiness",
  stat_hp: "HP (Lv. 100)",
  stat_attack: "Attack (Lv. 100)",
  stat_defense: "Defense (Lv. 100)",
  stat_special_attack: "Sp. Atk (Lv. 100)",
  stat_special_defense: "Sp. Def (Lv. 100)",
  stat_speed: "Speed (Lv. 100)",
  stat_total: "Total Stats (Lv. 100)",
  base_experience: "EXP Yield",
  ev_total: "EV Yield (Total)",
  ev_yield_hp: "EV Yield: HP",
  ev_yield_attack: "EV Yield: Attack",
  ev_yield_defense: "EV Yield: Defense",
  ev_yield_special_attack: "EV Yield: Sp. Atk",
  ev_yield_special_defense: "EV Yield: Sp. Def",
  ev_yield_speed: "EV Yield: Speed",
};

export type SortDir = "asc" | "desc";
/** dex/name/generation read naturally ascending; every numeric stat-like field reads naturally descending (best first). Independent of this, the direction toggle can always override it. */
export const DEFAULT_SORT_DIRECTION: Record<SortKey, SortDir> = {
  dex: "asc",
  name: "asc",
  generation: "asc",
  height: "desc",
  weight: "desc",
  capture_rate: "desc",
  base_happiness: "desc",
  stat_hp: "desc",
  stat_attack: "desc",
  stat_defense: "desc",
  stat_special_attack: "desc",
  stat_special_defense: "desc",
  stat_speed: "desc",
  stat_total: "desc",
  base_experience: "desc",
  ev_total: "desc",
  ev_yield_hp: "desc",
  ev_yield_attack: "desc",
  ev_yield_defense: "desc",
  ev_yield_special_attack: "desc",
  ev_yield_special_defense: "desc",
  ev_yield_speed: "desc",
};

export function genderBucket(rate: number): GenderBucket {
  if (rate === -1) return "genderless";
  if (rate === 0) return "male-only";
  if (rate === 8) return "female-only";
  return "mixed";
}

// Every field optional at the type level so <Link to="/"> never has to repeat
// every filter's default — validatePokedexSearch below still fills in concrete
// runtime defaults; callers recover concrete types via destructuring
// defaults at the point of use.
export type PokedexSearch = Partial<{
  q: string;
  types: string[];
  colors: string[];
  gens: number[];
  rarity: Rarity[];
  gender: GenderBucket[];
  eggGroups: string[];
  shapes: string[];
  growthRates: string[];
  abilities: string[];
  forms: string[];
  evYieldStats: StatKey[];
  final: boolean;
  hasMega: boolean;
  hasGmax: boolean;
  sort: SortKey;
  sortDir: SortDir;
}>;

export const arrayOf = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export function validatePokedexSearch(search: Record<string, unknown>): PokedexSearch {
  const sort: SortKey = (SORT_KEYS as readonly string[]).includes(search.sort as string)
    ? (search.sort as SortKey)
    : "dex";
  return {
    q: typeof search.q === "string" ? search.q : "",
    types: arrayOf<string>(search.types),
    colors: arrayOf<string>(search.colors),
    gens: arrayOf<number>(search.gens).map(Number),
    rarity: arrayOf<Rarity>(search.rarity),
    gender: arrayOf<GenderBucket>(search.gender),
    eggGroups: arrayOf<string>(search.eggGroups),
    shapes: arrayOf<string>(search.shapes),
    growthRates: arrayOf<string>(search.growthRates),
    abilities: arrayOf<string>(search.abilities),
    forms: arrayOf<string>(search.forms),
    evYieldStats: arrayOf<StatKey>(search.evYieldStats),
    final: search.final === true,
    hasMega: search.hasMega === true,
    hasGmax: search.hasGmax === true,
    sort,
    sortDir: search.sortDir === "asc" || search.sortDir === "desc" ? search.sortDir : DEFAULT_SORT_DIRECTION[sort],
  };
}

/** True if `search` has any active filter (not counting sort, which doesn't narrow the result set). */
export function hasActivePokedexFilters(search: Required<PokedexSearch>): boolean {
  return (
    search.q.length > 0 ||
    search.types.length > 0 ||
    search.colors.length > 0 ||
    search.gens.length > 0 ||
    search.rarity.length > 0 ||
    search.gender.length > 0 ||
    search.eggGroups.length > 0 ||
    search.shapes.length > 0 ||
    search.growthRates.length > 0 ||
    search.abilities.length > 0 ||
    search.forms.length > 0 ||
    search.evYieldStats.length > 0 ||
    search.final ||
    search.hasMega ||
    search.hasGmax
  );
}

export function filterPokemon(pokemon: Pokemon[], search: Required<PokedexSearch>): Pokemon[] {
  const selectedTypes = new Set(search.types);
  const selectedColors = new Set(search.colors);
  const selectedGens = new Set(search.gens);
  const selectedRarity = new Set(search.rarity);
  const selectedGender = new Set(search.gender);
  const selectedEggGroups = new Set(search.eggGroups);
  const selectedShapes = new Set(search.shapes);
  const selectedGrowthRates = new Set(search.growthRates);
  const selectedAbilities = new Set(search.abilities);
  const selectedForms = new Set(search.forms);
  const selectedEvYieldStats = new Set(search.evYieldStats);
  const q = search.q;

  return pokemon.filter((p) => {
    if (q && !p.display_name.toLowerCase().includes(q.toLowerCase())) return false;
    if (selectedGens.size && !selectedGens.has(p.generation)) return false;
    if (selectedRarity.size) {
      const ok =
        (selectedRarity.has("legendary") && p.is_legendary) ||
        (selectedRarity.has("mythical") && p.is_mythical) ||
        (selectedRarity.has("baby") && p.is_baby);
      if (!ok) return false;
    }
    if (selectedGender.size && !selectedGender.has(genderBucket(p.gender_rate))) return false;
    if (selectedTypes.size && !parseJsonArray(p.types).some((t) => selectedTypes.has(t))) return false;
    if (selectedColors.size && !selectedColors.has(p.color)) return false;
    if (selectedEggGroups.size && !parseJsonArray(p.egg_groups).some((g) => selectedEggGroups.has(g))) return false;
    if (selectedShapes.size && (!p.shape || !selectedShapes.has(p.shape))) return false;
    if (selectedGrowthRates.size && !selectedGrowthRates.has(p.growth_rate)) return false;
    if (selectedAbilities.size && !parseJsonArray<PokemonAbility>(p.abilities).some((a) => selectedAbilities.has(a.name))) return false;
    if (selectedForms.size && (!p.form_name || !selectedForms.has(p.form_name))) return false;
    if (selectedEvYieldStats.size && !Array.from(selectedEvYieldStats).some((key) => evYieldFor(p, key) > 0)) return false;
    if (search.final && !p.is_final_evolution) return false;
    if (search.hasMega && !p.has_mega_evolution) return false;
    if (search.hasGmax && !p.has_gigantamax) return false;
    return true;
  });
}

/**
 * `filterPokemon`'s `gens` facet is deliberately strict per-form — since
 * round 7, each variety's `generation` is the one it was ITSELF introduced
 * in, not its base species' (Alolan Rattata is 7, not 1; Hisuian Typhlosion
 * is 8, not 2) — confirmed real and correct for the grid's own filtering,
 * where it answers "which species/forms exist in generation N." But the
 * detail page's next/prev sequence has a different job: once you've landed
 * on a species via a generation filter, you should still be able to step
 * through every one of its forms before moving to the next species, even
 * if a given form happens to have been introduced in a different
 * generation — confirmed live user-reported confusion (Typhlosion, Wooper):
 * filtering to Generation 2 and clicking next from Typhlosion skipped
 * straight past Hisuian Typhlosion (generation 8) to Totodile, even though
 * the grid's own card popover still shows Hisuian Typhlosion grouped with
 * Typhlosion regardless of the filter.
 *
 * Re-filters `allPokemon` against every facet EXCEPT `gens`, then keeps
 * only the species (`id`) that have at least one form passing the FULL
 * filter (gens included) — so a sibling is included exactly when its own
 * id would otherwise show up in the filtered sequence, and still correctly
 * excluded if it fails some OTHER active facet (color, type, ...) on its
 * own merits.
 */
export function withGenerationSiblings(allPokemon: Pokemon[], search: Required<PokedexSearch>): Pokemon[] {
  if (search.gens.length === 0) return filterPokemon(allPokemon, search);
  const filteredIgnoringGens = filterPokemon(allPokemon, { ...search, gens: [] });
  const idsPassingFully = new Set(filterPokemon(allPokemon, search).map((p) => p.id));
  return filteredIgnoringGens.filter((p) => idsPassingFully.has(p.id));
}

/** Assumes `list` is already in natural ascending (id, form_id) order when sort==="dex" — true for both index.tsx's query result and usePokemonLookup's `ordered`, which read from the same backend query. */
export function sortPokemonList(list: Pokemon[], sort: SortKey, sortDir: SortDir): Pokemon[] {
  const ascending = sortDir === "asc";
  if (sort === "dex") {
    return ascending ? list : [...list].reverse();
  }
  const accessor = SORT_ACCESSORS[sort];
  return [...list].sort((a, b) => {
    const av = accessor(a);
    const bv = accessor(b);
    if (typeof av === "string" || typeof bv === "string") {
      return ascending ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    }
    return ascending ? av - (bv as number) : (bv as number) - av;
  });
}
