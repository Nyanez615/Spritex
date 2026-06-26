/**
 * Human-readable display labels for the Game/Method wire enums. Order here
 * mirrors models.rs's declaration order, used anywhere a stable game/method
 * picker needs to iterate every variant (e.g. /table, /games/$gameId).
 */
import type { Game } from "./bindings/Game";
import type { Method } from "./bindings/Method";
import type { ShinyMethod } from "./bindings/ShinyMethod";
import type { StatKey } from "./statCalc";

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

/**
 * Generation per game, for the colored "Gen N" badge wherever a game is
 * mentioned (game logos are deliberately not used — confirmed no open-
 * licensed source exists; see the project's CLAUDE.md). Mainline games map
 * 1:1 to their own generation; `go` has none (a live-service game spanning
 * every generation's roster, not tied to one) and renders no badge.
 *
 * The Ranger-series/Dream World/Dream Radar spin-offs are NOT a simple
 * "current mainline generation at release" mapping — every value below is
 * confirmed directly against each game's own Bulbapedia infobox ("Part of:
 * Generation X spin-off Pokémon games"), not assumed from this app's own
 * Game enum declaration order (which groups `ranger` near gen4_hgss
 * positionally — verified that grouping is misleading: Pokémon Ranger
 * (2006) predates Diamond/Pearl's own release that same year, so
 * Bulbapedia's infobox classifies it Generation III, not IV). Colosseum/XD
 * confirmed Generation III the same way. Shadows of Almia and Guardian
 * Signs are both confirmed Generation IV. Dream World is confirmed
 * Generation V — it opened September 18, 2010, the same day as Black/
 * White's Japan release, not before it as a naive release-date guess might
 * suggest.
 */
export const GAME_GENERATIONS: Record<Game, number | null> = {
  gen1_vc: 1,
  gen2_vc: 2,
  gen3_rs: 3,
  gen3_e: 3,
  gen3_frlg: 3,
  colosseum: 3,
  xd: 3,
  gen4_dp: 4,
  gen4_pt: 4,
  gen4_hgss: 4,
  ranger: 3,
  ranger_soa: 4,
  dream_world: 5,
  dream_radar: 5,
  ranger_gs: 4,
  gen5_bw: 5,
  gen5_b2_w2: 5,
  gen6_xy: 6,
  gen6_oras: 6,
  gen7_sm: 7,
  gen7_usum: 7,
  lgpe: 7,
  swsh: 8,
  bdsp: 8,
  pla: 8,
  sv: 9,
  legends_za: 9,
  go: null,
};

/**
 * Distinct color per generation for the "Gen N" badge — a styling
 * convention, not a cited game-mechanic fact, same rationale as
 * TYPE_COLORS. Deliberately a different palette (D3's "category10", a
 * standard distinct-categorical set) rather than reusing TYPE_COLORS' hex
 * values — generation and type are unrelated axes that can appear side by
 * side on the same row (e.g. MethodRow), so they shouldn't visually imply
 * a connection that doesn't exist.
 */
export const GENERATION_COLORS: Record<number, string> = {
  1: "#1F77B4",
  2: "#FF7F0E",
  3: "#2CA02C",
  4: "#D62728",
  5: "#9467BD",
  6: "#8C564B",
  7: "#E377C2",
  8: "#7F7F7F",
  9: "#BCBD22",
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
 * Acquisition-method labels for a non-wild baseline "wild" row — "gift" also
 * covers Bulbapedia's "(Only one)" static encounters (confirmed empirically:
 * no textual signal distinguishes an NPC gift from a fixed static encounter
 * on Bulbapedia — see scrapeBulbapedia.ts's AcquisitionMethod). Falls back to
 * the old generic label if acquisition_method is somehow missing (shouldn't
 * happen for a non-wild row, but the column is nullable).
 */
const ACQUISITION_METHOD_LABELS: Record<string, string> = {
  gift: "Gift / Static Encounter",
  trade: "Trade",
  evolution: "Evolution",
  hatch: "Hatch-Only",
};

/**
 * Display label for a shiny_methods row's method, distinguishing the baseline
 * "wild" method's actual acquisition path — `is_wild_encounter` is false for
 * gift/static/trade/evolution/hatch-only availability (the shiny roll still
 * fires the same way, but calling it "Wild Encounter" is misleading when the
 * species was never actually obtainable in the wild there). Previously every
 * non-wild reason collapsed into one generic "Gift / Static Encounter" label
 * — confirmed a real bug (Venusaur, reachable only by evolving Ivysaur, was
 * never actually gifted) — now distinguished via acquisition_method. Every
 * other method already implies its own specific acquisition path, so only
 * the baseline method needs this distinction.
 */
export function methodLabel(method: Pick<ShinyMethod, "method" | "is_wild_encounter" | "acquisition_method">): string {
  if (method.method === "wild" && !method.is_wild_encounter) {
    return ACQUISITION_METHOD_LABELS[method.acquisition_method ?? ""] ?? "Gift / Static Encounter";
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

/** Display labels for the 6 stat keys — shared by the detail page's stat bars/EV-yield display and the Pokédex grid's EV-yield sort/filter UI. */
export const STAT_LABELS: Record<StatKey, string> = {
  hp: "HP",
  attack: "Attack",
  defense: "Defense",
  special_attack: "Sp. Atk",
  special_defense: "Sp. Def",
  speed: "Speed",
};

/** "special-attack" -> "Special Attack" — for slug-shaped fields with no strong canonical order worth hardcoding (egg groups, body shapes, growth rates, abilities). */
export const humanize = (slug: string): string =>
  slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
