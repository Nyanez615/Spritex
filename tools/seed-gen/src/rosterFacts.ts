/**
 * Small, fully-researched roster facts for games whose availability isn't
 * captured by Bulbapedia's per-species "Game locations" template system
 * (unlike Colosseum/XD/Legends: Z-A, which turned out to use the exact same
 * Availability/EntryN templates as mainline games — see gameMap.ts's
 * BULBAPEDIA_LABEL_TO_GAMES comment). Each roster here is a handful of named
 * species, fully enumerated against Bulbapedia's own articles this round,
 * not scraped — the same "hardcoded once, no scraping needed" precedent
 * oddsFormulas.ts already uses for universal game-level mechanics. Species
 * names are resolved against species.json by deriveShinyMethods.ts, the
 * same way scrapeShinyLocks.ts's lock list is — never hardcoded dex numbers,
 * which would risk silently mismatching if misremembered.
 */

/**
 * Manaphy's egg is distributed via all three Pokémon Ranger games and
 * hatches in a connected Gen4 cartridge. Bulbapedia's own "List of
 * unobtainable Shiny Pokémon" table shows an explicit checkmark (obtainable,
 * not locked) for Manaphy across Ranger/Shadows of Almia/Guardian Signs —
 * its shininess rolls at hatch time in whichever Gen4 game ultimately
 * hatches the egg, not fixed at distribution. This overturns the secondhand
 * assumption that the egg is shiny-locked.
 */
export const RANGER_MANAPHY_SPECIES_NAMES = ["manaphy"];

/**
 * Pokémon Dream Radar's full obtainable roster, per Bulbapedia's dedicated
 * article: 15 regular species caught directly via the app; the Incarnate
 * trio's "Eureka Extension" feature for Tornadus/Thundurus/Landorus (modeled
 * against their base form only — this pipeline doesn't track Therian Forme
 * as a separate variety at all, since fetchPokeapi.ts's REGIONAL_ADJECTIVES
 * check only recognizes the four real regional-form adjectives and treats
 * Therian as a cosmetic-only variant); and 8 cross-save bonus legendaries
 * gated behind connecting an actual Gen4/HeartGold/SoulSilver cartridge — a
 * real but conditional path, included since the project was explicitly
 * told to be exhaustive about one-way transfer mechanisms ("HOME is the
 * objective"). Confirmed absent from Bulbapedia's shiny-lock tracking page
 * entirely — this pipeline's existing convention (resolveLockedGames in
 * deriveShinyMethods.ts) already treats absence from that list as "not
 * locked," so the full roster is modeled as genuinely shiny-huntable.
 */
export const DREAM_RADAR_ROSTER_SPECIES_NAMES = [
  "swablu", "drifloon", "riolu", "munna", "sigilyph", "igglybuff", "shuckle",
  "staryu", "porygon", "ralts", "bronzor", "togepi", "smoochum", "spiritomb", "rotom",
  "tornadus", "thundurus", "landorus",
  "beldum", "slowpoke", "hoothoot", "dialga", "palkia", "giratina", "ho-oh", "lugia",
];
