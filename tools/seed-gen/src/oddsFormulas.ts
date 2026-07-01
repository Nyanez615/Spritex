/**
 * Universal (game, method) shiny-odds mechanics table. Per the architecture
 * plan (§4.1): these are game-level mechanics, identical for every species
 * that qualifies for the method, so unlike pokemon/shiny_methods *rows* this
 * table is legitimately hardcoded once here rather than scraped per-species.
 *
 * Source of truth: Bulbapedia's "Shiny Pokémon" article
 * (https://bulbapedia.bulbagarden.net/wiki/Shiny_Pokémon), specifically its
 * per-generation "Methods of increasing Shiny rates" sections, plus the
 * dedicated `DexNav`, `Dynamax Adventure`, and `Friend Safari` articles.
 * These supersede the original architecture plan's "Shiny Odds Reference"
 * table, which was a reasonable secondhand approximation but measurably
 * wrong in several places once checked against Bulbapedia's own datamined
 * figures (SV Outbreak, Gen7 SOS, Gen6 chain fishing, Gen4/BDSP Pokéradar —
 * see each row's comment for the specific correction).
 *
 * Roll-count model, confirmed consistent against every cited table: total
 * odds = eraBaseDenominator(game) / total personality-value "rolls" checked
 * (1 base + each stackable bonus's own roll count). Shiny Charm is always
 * +2 rolls except in PLA, which is +3 — see `charmRollBonus` in gameMap.ts.
 * Noted inline wherever a mechanic *isn't* roll-based (Pokéradar-style
 * chaining uses its own non-linear curve; Dynamax Adventures replaces the
 * base rate outright rather than adding rolls) and the cited figure is used
 * directly instead.
 *
 * Deliberately NOT modeled (would require fabricating a number no source
 * gives, or per-species manual judgment the project forbids):
 * - Gen3 Emerald fixed-seed soft-reset RNG abuse: only applies to specific
 *   static encounters with an abusable seed, which is a per-species fact,
 *   not a generic game mechanic — confirmed no structured Bulbapedia source
 *   enumerates which encounters qualify.
 */
import { eraBaseDenominator, charmRollBonus, CHARM_AVAILABLE_GAMES, NO_BREEDING_GAMES, type Game, type Method } from "./gameMap.js";

export interface OddsRow {
  game: Game;
  method: Method;
  oddsBase: number;
  oddsCharm: number;
  oddsOptimized: number;
  boostRequirements: string[];
  notes?: string;
}

const ALL_GAMES_EXCEPT_GEN1_AND_GO: Game[] = [
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
];

function rollsToOdds(denom: number, rolls: number): number {
  return Math.round(denom / rolls);
}

function wildRow(game: Game): OddsRow {
  const denom = eraBaseDenominator(game);
  const hasCharm = CHARM_AVAILABLE_GAMES.has(game);
  return {
    game,
    method: "wild",
    oddsBase: rollsToOdds(denom, 1),
    oddsCharm: hasCharm ? rollsToOdds(denom, 1 + charmRollBonus(game)) : rollsToOdds(denom, 1),
    oddsOptimized: hasCharm ? rollsToOdds(denom, 1 + charmRollBonus(game)) : rollsToOdds(denom, 1),
    boostRequirements: hasCharm ? ["Shiny Charm"] : [],
  };
}

function masudaRow(game: Game): OddsRow {
  const denom = eraBaseDenominator(game);
  const hasCharm = CHARM_AVAILABLE_GAMES.has(game);
  // Masuda Method bonus rolls increased between Gen4 (+4) and Gen5+ (+5).
  const bonus = game === "gen4_dp" || game === "gen4_pt" || game === "gen4_hgss" ? 4 : 5;
  return {
    game,
    method: "masuda",
    oddsBase: rollsToOdds(denom, 1 + bonus),
    oddsCharm: hasCharm ? rollsToOdds(denom, 1 + bonus + charmRollBonus(game)) : rollsToOdds(denom, 1 + bonus),
    oddsOptimized: hasCharm ? rollsToOdds(denom, 1 + bonus + charmRollBonus(game)) : rollsToOdds(denom, 1 + bonus),
    boostRequirements: hasCharm
      ? ["Different-language parent (Masuda Method)", "Shiny Charm"]
      : ["Different-language parent (Masuda Method)"],
  };
}

// Pre-Gen-4 games that HAVE in-game breeding (so aren't in NO_BREEDING_GAMES)
// but predate the Masuda Method — the different-language-parent shiny boost
// was introduced in Generation IV (Diamond/Pearl), confirmed via Bulbapedia's
// "Masuda Method" article. Breeding a shiny in Gen 2/3 is possible but only at
// the base rate, so no boosted `masuda` odds row should exist for these games.
// Found auditing #1-151 (round 26): every breedable species wrongly got
// masuda rows for gen2_vc/gen3_rs/gen3_e/gen3_frlg.
const PRE_MASUDA_GAMES: ReadonlySet<Game> = new Set(["gen2_vc", "gen3_rs", "gen3_e", "gen3_frlg"]);

export function buildOddsTable(): OddsRow[] {
  const rows: OddsRow[] = [];

  for (const game of ALL_GAMES_EXCEPT_GEN1_AND_GO) {
    rows.push(wildRow(game));
    if (!NO_BREEDING_GAMES.has(game) && !PRE_MASUDA_GAMES.has(game)) rows.push(masudaRow(game));
  }

  // Gen4 Pokéradar chaining (DP/Pt only — not HGSS, confirmed no radar there).
  // No charm in Gen4. Per Bulbapedia's "Shiny Pokémon" Gen4 section: a single
  // shaking patch caps at 41/8192 (~1/200) at chain 40+, but up to 4 patches
  // shake at once, so the realistic combined odds are ~1/50 — this was
  // previously modeled as 200 (the per-patch figure), not the practical
  // combined one.
  for (const game of ["gen4_dp", "gen4_pt"] as const) {
    rows.push({
      game,
      method: "chain_radar",
      oddsBase: eraBaseDenominator(game),
      oddsCharm: eraBaseDenominator(game),
      oddsOptimized: 50,
      boostRequirements: ["Pokéradar chain of 40, unbroken"],
      notes: "Up to 4 patches can shake at once at chain 40+, each independently ~1/200 — combined practical odds are ~1/50.",
    });
  }

  // Gen6 Pokéradar returns in X/Y specifically (ORAS replaced it with DexNav
  // — see the dedicated dex_nav row below). No charm interaction documented.
  rows.push({
    game: "gen6_xy",
    method: "chain_radar",
    oddsBase: eraBaseDenominator("gen6_xy"),
    oddsCharm: eraBaseDenominator("gen6_xy"),
    oddsOptimized: 100,
    boostRequirements: ["Pokéradar chain of 40, unbroken, with the upbeat chain-continuation music active"],
  });

  // Gen6 chain fishing (X/Y and ORAS) — Bulbapedia's article gives a precise
  // figure: +2 rolls per chained catch up to chain 20, capping at 41/4096
  // (~1/100). Previously modeled as an unsourced "~150" approximation.
  for (const game of ["gen6_xy", "gen6_oras"] as const) {
    const denom = eraBaseDenominator(game);
    rows.push({
      game,
      method: "chain_fishing",
      oddsBase: rollsToOdds(denom, 41),
      oddsCharm: rollsToOdds(denom, 41 + charmRollBonus(game)),
      oddsOptimized: rollsToOdds(denom, 41 + charmRollBonus(game)),
      boostRequirements: ["Chain of 20 consecutive Rod catches, unbroken", "Shiny Charm"],
    });
  }

  // ORAS DexNav hidden-Pokémon shiny-forcing. Precise target-value formula
  // from the dedicated DexNav article: at Search Level 901-999 the table
  // gives 1.59% (no Charm) / 2.69% (Charm) to force Shiny on the 100th
  // chained encounter, plus the residual normal Shiny chance on top.
  rows.push({
    game: "gen6_oras",
    method: "dex_nav",
    oddsBase: 62,
    oddsCharm: 36,
    oddsOptimized: 36,
    boostRequirements: ["Search Level 901+ for the species", "100-encounter hidden-Pokémon chain, unbroken", "Shiny Charm"],
    notes: "Forced-Shiny chance (2.69% at max search level/chain/Charm) plus the residual normal Shiny chance on top; see the DexNav article's \"Calculated rates\" table.",
  });

  // Gen7 SOS chaining (Sun/Moon and Ultra Sun/Ultra Moon). The article's own
  // SOS table gives chain-31+ rates directly: 1/315.54 (no Charm), 1/273.53
  // (Charm) — corrects a much rosier roll-count guess used previously
  // (1024/683) that underestimated how many rolls a max chain grants.
  for (const game of ["gen7_sm", "gen7_usum"] as const) {
    rows.push({
      game,
      method: "sos",
      oddsBase: 316,
      oddsCharm: 274,
      oddsOptimized: 274,
      boostRequirements: ["SOS chain of 31+, unbroken", "Shiny Charm"],
    });
  }

  // LGPE catch combo (no Masuda/breeding in LGPE at all).
  rows.push({
    game: "lgpe",
    method: "catch_combo",
    oddsBase: eraBaseDenominator("lgpe"),
    oddsCharm: rollsToOdds(eraBaseDenominator("lgpe"), 3),
    oddsOptimized: 341,
    boostRequirements: ["Catch combo of 31+, unbroken", "Shiny Charm"],
  });

  // SwSh Dynamax Adventures. Directly stated on the dedicated article: each
  // Pokémon encountered (rentable/encounterable roster *and* the den's
  // legendary/Ultra Beast prize) has a flat 1/300 chance to be Shiny, 1/100
  // with the Shiny Charm — not the standard roll system, and not a guess.
  rows.push({
    game: "swsh",
    method: "dynamax_adventure",
    oddsBase: 300,
    oddsCharm: 100,
    oddsOptimized: 100,
    boostRequirements: ["Caught via a Dynamax Adventure in the Crown Tundra", "Shiny Charm"],
    notes: "Flat per-encounter rate from its own check, not the standard roll system.",
  });

  // SwSh Brilliant Pokémon — base-game mechanic distinct from Dynamax
  // Adventures: the more a species' "Number Battled" count, the better its
  // chance to spawn as a Brilliant Pokémon, and Brilliant Pokémon get bonus
  // Shiny rolls. Applies to any wild-encounterable SwSh species, no roster
  // restriction. Max tier (Number Battled 500+) per the article's table.
  rows.push({
    game: "swsh",
    method: "brilliant_pokemon",
    oddsBase: 586,
    oddsCharm: 456,
    oddsOptimized: 456,
    boostRequirements: ["Number Battled 500+ for the species (wild battles, Max Raids, or Trainer battles)", "Shiny Charm"],
  });

  // BDSP Pokéradar chaining — a remake-specific curve, not the same as Gen4's
  // original. The article states the cap directly: 1/99 at chain 40+ (no
  // Charm figure given there); the Charm tier below extends that via the
  // standard +2-roll model, flagged as derived rather than directly cited.
  rows.push({
    game: "bdsp",
    method: "chain_radar",
    oddsBase: 99,
    oddsCharm: 94,
    oddsOptimized: 94,
    boostRequirements: ["Pokéradar chain of 40, unbroken", "Shiny Charm"],
    notes: "1/99 (no Charm) is Bulbapedia's directly-cited cap; 1/94 (with Charm) is derived by extending it with the standard +2-roll Charm model, not independently confirmed by name.",
  });

  // PLA Mass Outbreak + Pokédex Research. Per the article's own table, the
  // *regular* "Mass Outbreak" (not "Massive Mass Outbreak", which is a real
  // but strictly worse combo at 1/216) combined with Research "Perfect" (not
  // just Level 10) and Shiny Charm gives 1/128.49 — previously the number
  // was coincidentally close but boost_requirements named the wrong combo.
  // PLA's Shiny Charm grants +3 rolls here, not the usual +2 (see
  // charmRollBonus in gameMap.ts).
  rows.push({
    game: "pla",
    method: "outbreak",
    oddsBase: rollsToOdds(eraBaseDenominator("pla"), 1 + 25), // Mass Outbreak alone, no charm/research
    oddsCharm: rollsToOdds(eraBaseDenominator("pla"), 1 + 25 + charmRollBonus("pla")),
    oddsOptimized: 128, // + Research "Perfect" (+3 rolls over base research), full stack
    boostRequirements: ["Mass Outbreak", "Pokédex Research \"Perfect\" for the species", "Shiny Charm"],
  });

  // SV Mass Outbreak + Sparkling Power sandwich + Charm. The article's own
  // table gives 1/512.44 directly for Outbreak 60+/Sandwich Lv.3/Charm (8
  // rolls: base 1 + outbreak60 2 + sandwichLv3 3 + charm 2) — corrects the
  // previous 585 figure, which under-counted the sandwich's roll contribution
  // (assumed +2, the table shows +3).
  rows.push({
    game: "sv",
    method: "outbreak",
    oddsBase: rollsToOdds(4096, 3), // outbreak 60+ alone, no charm/sandwich
    oddsCharm: rollsToOdds(4096, 5), // + charm
    oddsOptimized: 512, // + Sparkling Power Lv.3 sandwich, full 8-roll stack
    boostRequirements: ["Mass Outbreak, 60+ cleared", "Sparkling Power Lv.3 sandwich", "Shiny Charm"],
  });

  // Gen6 X/Y Friend Safari — restricted to a curated ~189-species roster
  // (see scrapeFriendSafari.ts), +4 rolls, stacks with Charm. Always worse
  // odds than X/Y's chain_radar/chain_fishing (100) where both are
  // available, so this never needs a BEST_METHOD_PRIORITY entry — the
  // existing lowest-odds fallback already prefers the better option.
  rows.push({
    game: "gen6_xy",
    method: "friend_safari",
    oddsBase: 819,
    oddsCharm: 585,
    oddsOptimized: 585,
    boostRequirements: ["Encountered in a Friend Safari zone", "Shiny Charm"],
  });

  // Pokémon GO — flat, non-roll-based rates; defined here for completeness
  // but never emitted (see deriveShinyMethods.ts header for why GO is
  // deferred entirely in this pipeline run).
  rows.push({
    game: "go",
    method: "go_wild",
    oddsBase: 450,
    oddsCharm: 450,
    oddsOptimized: 450,
    boostRequirements: [],
    notes: "Species-dependent in reality; 450 is a commonly cited average baseline, not a per-species figure.",
  });
  rows.push({
    game: "go",
    method: "go_community_day",
    oddsBase: 25,
    oddsCharm: 25,
    oddsOptimized: 25,
    boostRequirements: ["Community Day event window"],
  });

  return rows;
}

/**
 * Best-method decision priority, highest first — matches the plan's §0
 * priority list exactly. Given the set of (game, method) pairs available
 * for a species, returns the index of the row that should get
 * is_best_method=true (lowest index = highest priority), or -1 if none of
 * the candidates match any tier (caller falls back to lowest current odds).
 */
const BEST_METHOD_PRIORITY: Array<{ game: Game; method: Method }> = [
  { game: "go", method: "go_community_day" },
  { game: "bdsp", method: "chain_radar" },
  { game: "swsh", method: "dynamax_adventure" },
  { game: "pla", method: "outbreak" },
  { game: "sv", method: "outbreak" },
  { game: "gen6_oras", method: "dex_nav" },
  { game: "gen6_xy", method: "chain_radar" },
  { game: "gen6_xy", method: "chain_fishing" },
  { game: "gen6_oras", method: "chain_fishing" },
  { game: "gen7_sm", method: "sos" },
  { game: "gen7_usum", method: "sos" },
  { game: "gen5_b2_w2", method: "masuda" },
  { game: "gen5_bw", method: "masuda" },
];

export function pickBestMethodIndex(candidates: Array<{ game: Game; method: Method }>): number {
  for (const tier of BEST_METHOD_PRIORITY) {
    const idx = candidates.findIndex((c) => c.game === tier.game && c.method === tier.method);
    if (idx !== -1) return idx;
  }
  return -1;
}
