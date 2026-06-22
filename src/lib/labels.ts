/**
 * Human-readable display labels for the Game/Method wire enums. Order here
 * mirrors models.rs's declaration order, used anywhere a stable game/method
 * picker needs to iterate every variant (e.g. /table, /games/$gameId).
 */
import type { Game } from "./bindings/Game";
import type { Method } from "./bindings/Method";

export const GAME_ORDER: Game[] = [
  "gen1_vc",
  "gen2_vc",
  "gen3_rs",
  "gen3_e",
  "gen3_frlg",
  "gen4_dp",
  "gen4_pt",
  "gen4_hgss",
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
  "go",
];

export const GAME_LABELS: Record<Game, string> = {
  gen1_vc: "Red/Blue/Yellow (Virtual Console)",
  gen2_vc: "Gold/Silver/Crystal (Virtual Console)",
  gen3_rs: "Ruby/Sapphire",
  gen3_e: "Emerald",
  gen3_frlg: "FireRed/LeafGreen",
  gen4_dp: "Diamond/Pearl",
  gen4_pt: "Platinum",
  gen4_hgss: "HeartGold/SoulSilver",
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
