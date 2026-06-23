/**
 * Human-readable display labels for the Game/Method wire enums. Order here
 * mirrors models.rs's declaration order, used anywhere a stable game/method
 * picker needs to iterate every variant (e.g. /table, /games/$gameId).
 */
import type { Game } from "./bindings/Game";
import type { Method } from "./bindings/Method";
import type { ShinyMethod } from "./bindings/ShinyMethod";

export const GAME_ORDER: Game[] = [
  "gen1_vc",
  "gen2_vc",
  "gen3_rs",
  "gen3_e",
  "gen3_frlg",
  "colosseum",
  "xd",
  "gen4_dp",
  "gen4_pt",
  "gen4_hgss",
  "ranger",
  "ranger_soa",
  "dream_world",
  "dream_radar",
  "ranger_gs",
  "gen5_bw",
  "gen5_b2_w2",
  "gen6_xy",
  "gen6_oras",
  "gen7_sm",
  "gen7_usum",
  "lgpe",
  "swsh",
  "bdsp",
  "pla",
  "sv",
  "legends_za",
  "go",
];

export const GAME_LABELS: Record<Game, string> = {
  gen1_vc: "Red/Blue/Yellow (Virtual Console)",
  gen2_vc: "Gold/Silver/Crystal (Virtual Console)",
  gen3_rs: "Ruby/Sapphire",
  gen3_e: "Emerald",
  gen3_frlg: "FireRed/LeafGreen",
  colosseum: "Pokémon Colosseum",
  xd: "Pokémon XD: Gale of Darkness",
  gen4_dp: "Diamond/Pearl",
  gen4_pt: "Platinum",
  gen4_hgss: "HeartGold/SoulSilver",
  ranger: "Pokémon Ranger",
  ranger_soa: "Pokémon Ranger: Shadows of Almia",
  dream_world: "Pokémon Dream World",
  dream_radar: "Pokémon Dream Radar",
  ranger_gs: "Pokémon Ranger: Guardian Signs",
  gen5_bw: "Black/White",
  gen5_b2_w2: "Black 2/White 2",
  gen6_xy: "X/Y",
  gen6_oras: "Omega Ruby/Alpha Sapphire",
  gen7_sm: "Sun/Moon",
  gen7_usum: "Ultra Sun/Ultra Moon",
  lgpe: "Let's Go, Pikachu!/Let's Go, Eevee!",
  swsh: "Sword/Shield",
  bdsp: "Brilliant Diamond/Shining Pearl",
  pla: "Legends: Arceus",
  sv: "Scarlet/Violet",
  legends_za: "Legends: Z-A",
  go: "GO",
};

export const METHOD_LABELS: Record<Method, string> = {
  wild: "Wild Encounter",
  soft_reset: "Soft Reset",
  breeding: "Breeding",
  masuda: "Masuda Method",
  chain_radar: "Chain / PokéRadar",
  chain_fishing: "Chain Fishing",
  sos: "SOS Battle",
  horde: "Horde Encounter",
  dex_nav: "DexNav",
  dex_research: "Pokédex Research Task",
  outbreak: "Mass Outbreak",
  dynamax_adventure: "Dynamax Adventure",
  catch_combo: "Catch Combo",
  wormhole: "Ultra Wormhole",
  event: "Special Event",
  go_wild: "Wild Encounter",
  go_community_day: "Community Day",
  friend_safari: "Friend Safari",
  brilliant_pokemon: "Brilliant Pokémon",
};

/**
 * Display label for a shiny_methods row's method, distinguishing the baseline
 * "wild" method's actual acquisition path — `is_wild_encounter` is false for
 * gift/static/trade/evolution/hatch-only availability (the shiny roll still
 * fires the same way, but calling it "Wild Encounter" is misleading when the
 * species was never actually obtainable in the wild there). Every other
 * method already implies its own specific acquisition path, so only the
 * baseline method needs this distinction.
 */
export function methodLabel(method: Pick<ShinyMethod, "method" | "is_wild_encounter">): string {
  if (method.method === "wild" && !method.is_wild_encounter) {
    return "Gift / Static Encounter";
  }
  return METHOD_LABELS[method.method];
}

/** Game-conventional type order (not alphabetical) — matches how every official type chart/dex presents them. */
export const TYPE_ORDER = [
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison",
  "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
] as const;

/** PokéAPI's 10 fixed Pokédex color categories. */
export const COLOR_ORDER = [
  "black", "blue", "brown", "gray", "green", "pink", "purple", "red", "white", "yellow",
] as const;

/**
 * Widely-replicated community-standard type-color palette (popularized via veekun's
 * datamined color set, used across pokemondb.net-style tools and countless independent
 * Pokédex projects) — a styling convention, not a Bulbapedia-cited game-mechanic fact,
 * so it doesn't need this project's usual data-citation rigor. Several of these are
 * light against this app's dark theme (Electric, Ice) — use as accent dots/low-opacity
 * tints, never as a full-saturation fill directly behind body text.
 */
export const TYPE_COLORS: Record<string, string> = {
  normal: "#A8A878",
  fire: "#F08030",
  water: "#6890F0",
  electric: "#F8D030",
  grass: "#78C850",
  ice: "#98D8D8",
  fighting: "#C03028",
  poison: "#A040A0",
  ground: "#E0C068",
  flying: "#A890F0",
  psychic: "#F85888",
  bug: "#A8B820",
  rock: "#B8A038",
  ghost: "#705898",
  dragon: "#7038F8",
  dark: "#705848",
  steel: "#B8B8D0",
  fairy: "#EE99AC",
};

/** A representative swatch per Pokédex color category, for the detail page's color field. */
export const POKEMON_COLOR_HEX: Record<string, string> = {
  black: "#2C2C2C",
  blue: "#3E69C7",
  brown: "#8B5A2B",
  gray: "#919191",
  green: "#4FA84F",
  pink: "#F4A8C0",
  purple: "#8E5BA8",
  red: "#D94B4B",
  white: "#E8E8E8",
  yellow: "#F2D43E",
};

/** "special-attack" -> "Special Attack" — for slug-shaped fields with no strong canonical order worth hardcoding (egg groups, body shapes, growth rates, abilities). */
export const humanize = (slug: string): string =>
  slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
