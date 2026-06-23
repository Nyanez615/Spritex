/**
 * Mirrors src-tauri/src/models.rs's Game/Method enums exactly (snake_case
 * strings = Rust's as_str()/FromStr wire format for SQLite TEXT storage).
 * If models.rs ever adds/renames a variant, update both sides together.
 */
export const GAMES = [
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
] as const;
export type Game = (typeof GAMES)[number];

export const METHODS = [
  "wild",
  "soft_reset",
  "breeding",
  "masuda",
  "chain_radar",
  "chain_fishing",
  "sos",
  "horde",
  "dex_nav",
  "dex_research",
  "outbreak",
  "dynamax_adventure",
  "catch_combo",
  "wormhole",
  "event",
  "go_wild",
  "go_community_day",
  "friend_safari",
  "brilliant_pokemon",
] as const;
export type Method = (typeof METHODS)[number];

/**
 * Bulbapedia's `v=`/`v2=` version labels (as they literally appear in
 * Availability/EntryN templates), mapped to our Game bucket(s). Most map to
 * exactly one Game; "Pal Park" is the one genuine fan-out (it was available
 * identically from Diamond, Pearl, and Platinum, including in HeartGold and
 * SoulSilver's own Pal Park). Labels for games outside our Game enum (Mega
 * Dimension, Café ReMix, etc.) are deliberately absent -> lookups return
 * undefined -> skipped, not guessed.
 *
 * Colosseum/XD/Legends: Z-A were initially assumed to need dedicated roster
 * scrapers, but verified directly (fetched Pikachu's and Espeon's raw
 * wikitext, and Furfrou's for Z-A) that Bulbapedia already tracks all three
 * via this exact same Availability/EntryN template system ordinary mainline
 * games use — genuine availability is the plain `Entry1`/`Entry2` form (e.g.
 * Espeon's `{{Availability/Entry1|v=Colosseum|area=...First Pokémon}}`),
 * while non-genuine/cameo mentions use the `/None` suffix (e.g. Pikachu's
 * Colosseum entry, which only appears as a Bonus Disc cameo) — already
 * correctly excluded by parseAvailability's `name.endsWith("/None")` check
 * in scrapeBulbapedia.ts. So these three just need a label mapping here, no
 * separate roster module.
 */
export const BULBAPEDIA_LABEL_TO_GAMES: Record<string, Game[]> = {
  Red: ["gen1_vc"],
  Blue: ["gen1_vc"],
  Yellow: ["gen1_vc"],
  Gold: ["gen2_vc"],
  Silver: ["gen2_vc"],
  Crystal: ["gen2_vc"],
  Ruby: ["gen3_rs"],
  Sapphire: ["gen3_rs"],
  Emerald: ["gen3_e"],
  FireRed: ["gen3_frlg"],
  LeafGreen: ["gen3_frlg"],
  Colosseum: ["colosseum"],
  XD: ["xd"],
  // "Pal Park" deliberately excluded: Bulbapedia models it as if it were its
  // own version, but it's a one-way transfer of an *already-caught* Pokémon
  // — no new shiny roll happens there. Treating it as availability would
  // falsely claim a species is shiny-huntable in Diamond/Pearl/Platinum
  // when it can only ever be carried in from an older game. (Modeling that
  // properly belongs in requires_transfer/transfer_chain per the plan's
  // §1 Transfer Path Reference — not built yet; this just avoids the wrong
  // alternative of fabricating native availability.)
  Diamond: ["gen4_dp"],
  Pearl: ["gen4_dp"],
  Platinum: ["gen4_pt"],
  HeartGold: ["gen4_hgss"],
  SoulSilver: ["gen4_hgss"],
  Black: ["gen5_bw"],
  White: ["gen5_bw"],
  "Black 2": ["gen5_b2_w2"],
  "White 2": ["gen5_b2_w2"],
  X: ["gen6_xy"],
  Y: ["gen6_xy"],
  "Omega Ruby": ["gen6_oras"],
  "Alpha Sapphire": ["gen6_oras"],
  Sun: ["gen7_sm"],
  Moon: ["gen7_sm"],
  "Ultra Sun": ["gen7_usum"],
  "Ultra Moon": ["gen7_usum"],
  "Let's Go Pikachu": ["lgpe"],
  "Let's Go Eevee": ["lgpe"],
  Sword: ["swsh"],
  Shield: ["swsh"],
  "Expansion Pass": ["swsh"],
  "The Isle of Armor": ["swsh"],
  "The Crown Tundra": ["swsh"],
  "Brilliant Diamond": ["bdsp"],
  "Shining Pearl": ["bdsp"],
  "Legends: Arceus": ["pla"],
  Scarlet: ["sv"],
  Violet: ["sv"],
  "The Hidden Treasure of Area Zero": ["sv"],
  "The Teal Mask": ["sv"],
  "The Indigo Disk": ["sv"],
  "Legends: Z-A": ["legends_za"],
};

/**
 * Games with no in-game breeding/Day Care — Masuda Method cannot apply.
 * Colosseum/XD: GameCube games, no Day Care of their own (breeding requires
 * trading to a linked GBA cartridge). Ranger/Ranger: Shadows of Almia/
 * Ranger: Guardian Signs/Dream World/Dream Radar: handheld-peripheral or
 * distribution-app mechanics, not full games with a Day Care. Legends: Z-A:
 * confirmed directly via Bulbapedia's own page — "Abilities, breeding, and
 * Eggs are not featured in this game."
 */
export const NO_BREEDING_GAMES: ReadonlySet<Game> = new Set([
  "lgpe",
  "pla",
  "colosseum",
  "xd",
  "ranger",
  "ranger_soa",
  "ranger_gs",
  "dream_world",
  "dream_radar",
  "legends_za",
]);

/** Games where the Shiny Charm item exists (introduced in Black 2/White 2). */
export const CHARM_AVAILABLE_GAMES: ReadonlySet<Game> = new Set([
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
]);

/**
 * Extra personality-value rolls the Shiny Charm grants — +2 everywhere except
 * PLA and Legends: Z-A, both of which grant +3 (PLA verified against
 * Bulbapedia's "Shiny Pokémon" article, Generation IX section: the
 * Charm+Research Perfect combo's roll count only reconciles to the cited
 * odds at +3, not +2; Z-A's searched Charm-boosted rate of ~1/1024 from a
 * 1/4096 base only reconciles at 4 total rolls, i.e. +3 over the 1 base
 * roll, matching the same Legends-series exception rather than the
 * standard +2).
 */
export function charmRollBonus(game: Game): number {
  return game === "pla" || game === "legends_za" ? 3 : 2;
}

/** Per-era base shiny-roll denominator (Gen6 halved it from 8192 to 4096). */
export function eraBaseDenominator(game: Game): number {
  const gen6Plus: ReadonlySet<Game> = new Set([
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
  ]);
  return gen6Plus.has(game) ? 4096 : 8192;
}
