import type { Pokemon } from "./tauri";

/**
 * Client-side stat simulator for the detail page's "Customize" panel. No
 * schema or seed-gen change needed: the stored level-100/31-IV/0-EV/neutral-
 * nature defaults are algebraically invertible back to the raw PokéAPI base
 * stat (fetchPokeapi.ts's statAt100(): HP = 2*base+141, others = 2*base+36 —
 * both trivially solvable for base), so this whole module just reverses
 * that once per stat, then re-applies the standard Generation 3+ formula
 * with whatever level/IV/EV/nature/item/ability the user picks.
 */

export const STAT_KEYS = ["hp", "attack", "defense", "special_attack", "special_defense", "speed"] as const;
export type StatKey = (typeof STAT_KEYS)[number];
/** HP is never nature- or item/ability-affected in any generation — excluded from the boost/lower/multiplier types so misuse is a compile error. */
export type BoostableStatKey = Exclude<StatKey, "hp">;

export function baseStatFromStored(stored: number, isHp: boolean): number {
  return isHp ? (stored - 141) / 2 : (stored - 36) / 2;
}

function computeStat(base: number, level: number, iv: number, ev: number, natureMultiplier: number, isHp: boolean): number {
  const core = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100);
  if (isHp) return core + level + 10;
  return Math.floor((core + 5) * natureMultiplier);
}

export type Nature =
  | "hardy" | "lonely" | "brave" | "adamant" | "naughty"
  | "bold" | "docile" | "relaxed" | "impish" | "lax"
  | "timid" | "hasty" | "serious" | "jolly" | "naive"
  | "modest" | "mild" | "quiet" | "bashful" | "rash"
  | "calm" | "gentle" | "sassy" | "careful" | "quirky";

/** Standard 5x5 nature grid order — Attack/Defense/Speed/Sp.Atk/Sp.Def boosting rows, neutral diagonal. */
export const NATURES: Nature[] = [
  "hardy", "lonely", "brave", "adamant", "naughty",
  "bold", "docile", "relaxed", "impish", "lax",
  "timid", "hasty", "serious", "jolly", "naive",
  "modest", "mild", "quiet", "bashful", "rash",
  "calm", "gentle", "sassy", "careful", "quirky",
];

export const NATURE_MODIFIERS: Record<Nature, { boost: BoostableStatKey | null; lower: BoostableStatKey | null }> = {
  hardy: { boost: null, lower: null },
  lonely: { boost: "attack", lower: "defense" },
  brave: { boost: "attack", lower: "speed" },
  adamant: { boost: "attack", lower: "special_attack" },
  naughty: { boost: "attack", lower: "special_defense" },
  bold: { boost: "defense", lower: "attack" },
  docile: { boost: null, lower: null },
  relaxed: { boost: "defense", lower: "speed" },
  impish: { boost: "defense", lower: "special_attack" },
  lax: { boost: "defense", lower: "special_defense" },
  timid: { boost: "speed", lower: "attack" },
  hasty: { boost: "speed", lower: "defense" },
  serious: { boost: null, lower: null },
  jolly: { boost: "speed", lower: "special_attack" },
  naive: { boost: "speed", lower: "special_defense" },
  modest: { boost: "special_attack", lower: "attack" },
  mild: { boost: "special_attack", lower: "defense" },
  quiet: { boost: "special_attack", lower: "speed" },
  bashful: { boost: null, lower: null },
  rash: { boost: "special_attack", lower: "special_defense" },
  calm: { boost: "special_defense", lower: "attack" },
  gentle: { boost: "special_defense", lower: "defense" },
  sassy: { boost: "special_defense", lower: "speed" },
  careful: { boost: "special_defense", lower: "special_attack" },
  quirky: { boost: null, lower: null },
};

function natureMultiplier(stat: BoostableStatKey, nature: Nature): number {
  const mods = NATURE_MODIFIERS[nature];
  if (mods.boost === stat) return 1.1;
  if (mods.lower === stat) return 0.9;
  return 1;
}

/**
 * Deliberately small, named sets — scope locked to exactly what was
 * confirmed when this module was designed, not meant to grow casually.
 * Items: Choice Band/Specs/Scarf, Eviolite, Assault Vest — all flat,
 * unconditional 1.5x multipliers (Eviolite is only legal for species that
 * aren't fully evolved; gated by the caller via pokemon.is_final_evolution,
 * not here). Abilities: Huge Power/Pure Power — flat, unconditional 2x
 * Attack. Deliberately excludes conditional abilities (Guts, Hustle, Flower
 * Gift, etc.) since their effect depends on battle state, not just being
 * active — out of scope for a static stat display. Don't add to either set
 * without re-confirming scope; this isn't an oversight.
 */
export type StatModifierItem = "none" | "choice_band" | "choice_specs" | "choice_scarf" | "eviolite" | "assault_vest";
export type StatModifierAbility = "none" | "huge_power" | "pure_power";

export const ITEM_MULTIPLIERS: Record<StatModifierItem, Partial<Record<BoostableStatKey, number>>> = {
  none: {},
  choice_band: { attack: 1.5 },
  choice_specs: { special_attack: 1.5 },
  choice_scarf: { speed: 1.5 },
  eviolite: { defense: 1.5, special_defense: 1.5 },
  assault_vest: { special_defense: 1.5 },
};

export const ABILITY_MULTIPLIERS: Record<StatModifierAbility, Partial<Record<BoostableStatKey, number>>> = {
  none: {},
  huge_power: { attack: 2 },
  pure_power: { attack: 2 },
};

export interface SimulatorInputs {
  level: number;
  ivs: Record<StatKey, number>;
  evs: Record<StatKey, number>;
  nature: Nature;
  item: StatModifierItem;
  ability: StatModifierAbility;
}

/** Reproduces today's displayed stat-bar numbers exactly — the regression check that the default view hasn't changed. */
export const DEFAULT_SIMULATOR_INPUTS: SimulatorInputs = {
  level: 100,
  ivs: { hp: 31, attack: 31, defense: 31, special_attack: 31, special_defense: 31, speed: 31 },
  evs: { hp: 0, attack: 0, defense: 0, special_attack: 0, special_defense: 0, speed: 0 },
  nature: "hardy",
  item: "none",
  ability: "none",
};

/** Deep-equal, not reference-equal — a user can dial every field back to default values by hand, not just via the Reset button. */
export function isDefaultSimulatorInputs(sim: SimulatorInputs): boolean {
  return (
    sim.level === DEFAULT_SIMULATOR_INPUTS.level &&
    sim.nature === DEFAULT_SIMULATOR_INPUTS.nature &&
    sim.item === DEFAULT_SIMULATOR_INPUTS.item &&
    sim.ability === DEFAULT_SIMULATOR_INPUTS.ability &&
    STAT_KEYS.every(
      (key) => sim.ivs[key] === DEFAULT_SIMULATOR_INPUTS.ivs[key] && sim.evs[key] === DEFAULT_SIMULATOR_INPUTS.evs[key],
    )
  );
}

type StoredStats = Pick<Pokemon, "stat_hp" | "stat_attack" | "stat_defense" | "stat_special_attack" | "stat_special_defense" | "stat_speed">;

export function computeAllStats(pokemon: StoredStats, inputs: SimulatorInputs): Record<StatKey, number> & { total: number } {
  const storedByKey: Record<StatKey, number> = {
    hp: pokemon.stat_hp,
    attack: pokemon.stat_attack,
    defense: pokemon.stat_defense,
    special_attack: pokemon.stat_special_attack,
    special_defense: pokemon.stat_special_defense,
    speed: pokemon.stat_speed,
  };

  const stats: Partial<Record<StatKey, number>> = {};
  for (const key of STAT_KEYS) {
    const isHp = key === "hp";
    const base = baseStatFromStored(storedByKey[key], isHp);
    const nature = isHp ? 1 : natureMultiplier(key, inputs.nature);
    let stat = computeStat(base, inputs.level, inputs.ivs[key], inputs.evs[key], nature, isHp);
    if (!isHp) {
      const itemMult = ITEM_MULTIPLIERS[inputs.item][key] ?? 1;
      const abilityMult = ABILITY_MULTIPLIERS[inputs.ability][key] ?? 1;
      stat = Math.floor(stat * itemMult * abilityMult);
    }
    stats[key] = stat;
  }

  const complete = stats as Record<StatKey, number>;
  const total = STAT_KEYS.reduce((sum, key) => sum + complete[key], 0);
  return { ...complete, total };
}
