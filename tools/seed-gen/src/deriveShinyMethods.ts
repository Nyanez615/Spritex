/**
 * Rules engine: joins species metadata + Bulbapedia availability + the
 * shiny-lock exclusion list + the hardcoded odds table into the final
 * `pokemon` and `shiny_methods` rows that build-static-db.ts writes to
 * resources/static.db. No per-row judgment calls here — every row is a
 * mechanical consequence of the inputs, which is what keeps this whole
 * pipeline "derived, not hand-authored."
 *
 * Method-assignment rules per available (species, form, game) pair,
 * deliberately conservative (see oddsFormulas.ts's header for what's
 * skipped and why):
 * - "wild" always applies — it's the no-special-boost baseline, and the
 *   shiny RNG check fires the same way regardless of *how* the Pokémon was
 *   obtained (wild encounter, gift, static, Pal Park...).
 * - "masuda" applies only if the game has breeding (NO_BREEDING_GAMES) and
 *   the species itself can lay eggs (isBreedable, from PokéAPI's egg
 *   groups — "no-eggs" excluded).
 * - chain_radar/chain_fishing/dex_nav/sos/catch_combo/outbreak/
 *   brilliant_pokemon (WILD_ONLY_METHODS, below) are game-level mechanics
 *   that require a *repeatable wild encounter* to chain/grind against — they
 *   qualify only for (form, game) pairs scrapeBulbapedia.ts's own area= text
 *   marks as a genuine wild encounter (wildAvailableByForm). Gift/static/
 *   trade/evolution/hatch-only availability does NOT count, even though the
 *   baseline "wild" method above still applies to it (the shiny roll fires
 *   identically regardless of how the Pokémon was obtained). Confirmed this
 *   was a real, previously-unguarded bug: Bulbasaur's X/Y "Received from
 *   Professor Sycamore" gift was incorrectly shown as Chain-Fishing-huntable
 *   before wildAvailableByForm existed.
 * - "dynamax_adventure" (SwSh) and "friend_safari" (Gen6 X/Y) are gated by
 *   their own scraped rosters (scrapeDynamaxAdventure.ts/
 *   scrapeFriendSafari.ts) — both are restricted-roster mechanics, unlike
 *   the game-level ones above. Roster membership itself is also NOT wild for
 *   WILD_ONLY_METHODS purposes (a Dynamax Adventure den or Friend Safari
 *   zone isn't a normal wild Route encounter you can Pokéradar-chain or
 *   fish in) — see the availableByForm-population loops below, which
 *   deliberately never add to wildAvailableByForm.
 * - Ranger/Ranger: Shadows of Almia/Ranger: Guardian Signs (Manaphy's egg)
 *   and Dream Radar (its full catchable roster) get availability only via
 *   rosterFacts.ts's small hardcoded species lists (resolveRosterKeys,
 *   below) — neither game has a Bulbapedia "Game locations" version label
 *   the way Colosseum/XD/Legends: Z-A turned out to, so the generic scraper
 *   never produces availability for them on its own.
 * - go_wild/go_community_day are never emitted — GO is deferred entirely
 *   (see scrapeBulbapedia.ts's header).
 */
import { readOutJson, writeOutJson } from "./httpCache.js";
import type { FetchedSpecies } from "./fetchPokeapi.js";
import type { AvailabilityOutput } from "./scrapeBulbapedia.js";
import type { ShinyLockFact } from "./scrapeShinyLocks.js";
import type { DynamaxAdventureFact } from "./scrapeDynamaxAdventure.js";
import type { FriendSafariFact } from "./scrapeFriendSafari.js";
import { RANGER_MANAPHY_SPECIES_NAMES, DREAM_RADAR_ROSTER_SPECIES_NAMES } from "./rosterFacts.js";
import { buildOddsTable, pickBestMethodIndex, type OddsRow } from "./oddsFormulas.js";
import { NO_BREEDING_GAMES, type Game, type Method } from "./gameMap.js";

export interface PokemonRow {
  id: number;
  name: string;
  display_name: string;
  form_id: number;
  form_name: string | null;
  generation: number;
  sprite_url: string;
  shiny_sprite_url: string;
  sprite_url_female: string | null;
  shiny_sprite_url_female: string | null;
  types: string;
  gender_rate: number;
  is_mythical: boolean;
  is_legendary: boolean;
  is_baby: boolean;
  is_final_evolution: boolean;
  color: string;
  shape: string | null;
  growth_rate: string;
  egg_groups: string;
  capture_rate: number;
  base_happiness: number;
  height: number;
  weight: number;
  abilities: string;
  stat_hp: number;
  stat_attack: number;
  stat_defense: number;
  stat_special_attack: number;
  stat_special_defense: number;
  stat_speed: number;
  stat_total: number;
}

export interface ShinyMethodRow {
  pokemon_id: number;
  form_id: number;
  game: Game;
  method: Method;
  odds_base: number;
  odds_charm: number;
  odds_optimized: number;
  boost_requirements: string;
  is_best_method: boolean;
  requires_transfer: boolean;
  transfer_chain: string | null;
  citation_url: string;
  notes: string | null;
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/['.’]/g, "");
}

/** Keyed by both the raw PokéAPI name and the normalized display name, so callers can look up either form. */
function buildSpeciesNameIndex(species: FetchedSpecies[]): Map<string, FetchedSpecies> {
  const byName = new Map<string, FetchedSpecies>();
  for (const s of species) {
    byName.set(s.name, s);
    byName.set(normalizeName(s.displayName), s);
  }
  return byName;
}

function resolveLockedGames(byName: Map<string, FetchedSpecies>, locks: ShinyLockFact[]): Map<string, Set<Game>> {
  const locked = new Map<string, Set<Game>>();
  let unmatched = 0;

  for (const lock of locks) {
    const candidate = byName.get(lock.pokemonName) ?? byName.get(normalizeName(lock.pokemonName));
    if (!candidate) {
      unmatched++;
      continue;
    }
    const variety = lock.formName
      ? candidate.varieties.find((v) => v.formName === lock.formName)
      : candidate.varieties.find((v) => v.formId === 0);
    if (!variety) {
      unmatched++;
      continue;
    }
    const key = `${candidate.pokemonId}:${variety.formId}`;
    if (!locked.has(key)) locked.set(key, new Set());
    locked.get(key)!.add(lock.game);
  }

  if (unmatched > 0) console.log(`  deriveShinyMethods: ${unmatched} shiny-lock entries didn't match a tracked species/form (skipped, not guessed)`);
  return locked;
}

/** Resolves rosterFacts.ts's hardcoded species-name lists to `pokemonId:0` keys (base form only — none of these rosters involve regional forms). */
function resolveRosterKeys(byName: Map<string, FetchedSpecies>, names: string[]): string[] {
  const keys: string[] = [];
  for (const name of names) {
    const candidate = byName.get(name) ?? byName.get(normalizeName(name));
    if (!candidate) {
      console.log(`  deriveShinyMethods: roster fact species "${name}" didn't match a tracked species (skipped, not guessed)`);
      continue;
    }
    keys.push(`${candidate.pokemonId}:0`);
  }
  return keys;
}

/**
 * Mechanics that require a *repeatable wild grass/water/cave encounter* to
 * chain/grind against — gated on isWildAvailable, not just plain
 * availability. See this file's header comment for the full rationale.
 */
const WILD_ONLY_METHODS: ReadonlySet<Method> = new Set([
  "chain_radar", "chain_fishing", "dex_nav", "sos", "catch_combo", "outbreak", "brilliant_pokemon",
]);

function applicableMethods(
  game: Game,
  isBreedable: boolean,
  isInDaRoster: boolean,
  isInFriendSafariRoster: boolean,
  isWildAvailable: boolean,
  oddsByGame: Map<Game, OddsRow[]>
): OddsRow[] {
  const rows = oddsByGame.get(game) ?? [];
  return rows.filter((row) => {
    if (row.method === "go_wild" || row.method === "go_community_day") return false;
    if (row.method === "masuda") return !NO_BREEDING_GAMES.has(game) && isBreedable;
    if (row.method === "dynamax_adventure") return isInDaRoster;
    if (row.method === "friend_safari") return isInFriendSafariRoster;
    if (WILD_ONLY_METHODS.has(row.method)) return isWildAvailable;
    return true; // baseline "wild" method, and anything else genuinely ungated
  });
}

export async function runDeriveShinyMethods(): Promise<{ pokemon: PokemonRow[]; shinyMethods: ShinyMethodRow[] }> {
  const species = await readOutJson<FetchedSpecies[]>("species.json");
  const { citations, availability } = await readOutJson<AvailabilityOutput>("availability.json");
  const locks = await readOutJson<ShinyLockFact[]>("shiny-locks.json");
  const daRosterFacts = await readOutJson<DynamaxAdventureFact[]>("dynamax-adventure.json");
  const friendSafariFacts = await readOutJson<FriendSafariFact[]>("friend-safari.json");
  const finalEvolutionIds = new Set(await readOutJson<number[]>("final-evolutions.json"));

  const speciesByName = buildSpeciesNameIndex(species);
  const lockedByForm = resolveLockedGames(speciesByName, locks);
  const daRoster = new Set(daRosterFacts.map((f) => `${f.pokemonId}:${f.formId}`));
  const friendSafariRoster = new Set(friendSafariFacts.map((f) => f.pokemonId));

  const availableByForm = new Map<string, Set<Game>>();
  // Subset of availableByForm: only (form, game) pairs Bulbapedia's own
  // area= text marks as a genuine wild encounter — see WILD_ONLY_METHODS.
  const wildAvailableByForm = new Map<string, Set<Game>>();
  for (const fact of availability) {
    if (fact.game === "go") continue; // GO deferred entirely — see scrapeBulbapedia.ts header
    const key = `${fact.pokemonId}:${fact.formId}`;
    if (!availableByForm.has(key)) availableByForm.set(key, new Set());
    availableByForm.get(key)!.add(fact.game);
    if (fact.isWild) {
      if (!wildAvailableByForm.has(key)) wildAvailableByForm.set(key, new Set());
      wildAvailableByForm.get(key)!.add(fact.game);
    }
  }
  // DA-roster/Friend-Safari-roster membership is itself a form of in-game
  // availability — some DA prizes (Solgaleo, Lunala, Necrozma, ...) aren't
  // natively wild/gift-available in SwSh at all per Bulbapedia's
  // Game-locations table, only catchable via the Crown Tundra den, so
  // "swsh"/"gen6_xy" must be added here rather than relying on them already
  // being present from the loop above. Deliberately never added to
  // wildAvailableByForm — a den/Safari-zone catch isn't a normal wild Route
  // encounter you can Pokéradar-chain or fish in (absence there already
  // means non-wild for WILD_ONLY_METHODS, no explicit marker needed).
  for (const fact of daRosterFacts) {
    const key = `${fact.pokemonId}:${fact.formId}`;
    if (!availableByForm.has(key)) availableByForm.set(key, new Set());
    availableByForm.get(key)!.add("swsh");
  }
  for (const fact of friendSafariFacts) {
    const key = `${fact.pokemonId}:0`; // Gen6 predates regional forms — always the base form
    if (!availableByForm.has(key)) availableByForm.set(key, new Set());
    availableByForm.get(key)!.add("gen6_xy");
  }
  // rosterFacts.ts's small hardcoded rosters (Manaphy's Ranger-trilogy egg,
  // Dream Radar's full catchable roster) — neither game has a Bulbapedia
  // "Game locations" version label, so they're never added by the loop
  // above; this is the only place either game ever gets availability.
  for (const key of resolveRosterKeys(speciesByName, RANGER_MANAPHY_SPECIES_NAMES)) {
    if (!availableByForm.has(key)) availableByForm.set(key, new Set());
    for (const game of ["ranger", "ranger_soa", "ranger_gs"] as const) availableByForm.get(key)!.add(game);
  }
  for (const key of resolveRosterKeys(speciesByName, DREAM_RADAR_ROSTER_SPECIES_NAMES)) {
    if (!availableByForm.has(key)) availableByForm.set(key, new Set());
    availableByForm.get(key)!.add("dream_radar");
  }

  const oddsByGame = new Map<Game, OddsRow[]>();
  for (const row of buildOddsTable()) {
    if (!oddsByGame.has(row.game)) oddsByGame.set(row.game, []);
    oddsByGame.get(row.game)!.push(row);
  }

  const pokemon: PokemonRow[] = [];
  const shinyMethods: ShinyMethodRow[] = [];

  for (const s of species) {
    for (const variety of s.varieties) {
      pokemon.push({
        id: s.pokemonId,
        name: s.name,
        display_name: variety.displayName,
        form_id: variety.formId,
        form_name: variety.formName,
        generation: s.generationNumber,
        sprite_url: variety.spriteUrl,
        shiny_sprite_url: variety.shinySpriteUrl,
        sprite_url_female: variety.spriteUrlFemale,
        shiny_sprite_url_female: variety.shinySpriteUrlFemale,
        types: JSON.stringify(variety.types),
        gender_rate: s.genderRate,
        is_mythical: s.isMythical,
        is_legendary: s.isLegendary,
        // Species-level facts — shared by every form/variety of this species.
        is_baby: s.isBaby,
        is_final_evolution: finalEvolutionIds.has(s.pokemonId),
        color: s.color,
        shape: s.shape,
        growth_rate: s.growthRate,
        egg_groups: JSON.stringify(s.eggGroups),
        capture_rate: s.captureRate,
        base_happiness: s.baseHappiness,
        // Variety-level facts — these genuinely can differ by regional form.
        height: variety.height,
        weight: variety.weight,
        abilities: JSON.stringify(variety.abilities),
        stat_hp: variety.statHp,
        stat_attack: variety.statAttack,
        stat_defense: variety.statDefense,
        stat_special_attack: variety.statSpecialAttack,
        stat_special_defense: variety.statSpecialDefense,
        stat_speed: variety.statSpeed,
        stat_total: variety.statTotal,
      });

      const key = `${s.pokemonId}:${variety.formId}`;
      const available = availableByForm.get(key);
      if (!available || available.size === 0) continue; // no confirmed availability — "source pending", no rows

      const locked = lockedByForm.get(key) ?? new Set<Game>();
      const citationUrl = citations[s.pokemonId] ?? "";
      const isInDaRoster = daRoster.has(key);
      // formId === 0 check is belt-and-suspenders: Friend Safari only ever
      // existed in Gen6 X/Y, which predates regional forms entirely, so no
      // roster species can have a non-base form today — but the roster set
      // itself is only keyed by pokemonId (see scrapeFriendSafari.ts), so
      // without this check a future regional form sharing that pokemonId
      // would silently inherit eligibility it was never recorded against.
      const isInFriendSafariRoster = variety.formId === 0 && friendSafariRoster.has(s.pokemonId);
      const wildAvailableGames = wildAvailableByForm.get(key) ?? new Set<Game>();

      const candidateRows: Array<{ game: Game; method: Method; odds: OddsRow }> = [];
      for (const game of available) {
        if (locked.has(game)) continue;
        const isWildAvailable = wildAvailableGames.has(game);
        for (const odds of applicableMethods(game, s.isBreedable, isInDaRoster, isInFriendSafariRoster, isWildAvailable, oddsByGame)) {
          candidateRows.push({ game, method: odds.method, odds });
        }
      }
      if (candidateRows.length === 0) continue;

      let bestIndex = pickBestMethodIndex(candidateRows.map((c) => ({ game: c.game, method: c.method })));
      if (bestIndex === -1) {
        bestIndex = candidateRows.reduce((bestI, c, i) => (c.odds.oddsOptimized < candidateRows[bestI].odds.oddsOptimized ? i : bestI), 0);
      }

      candidateRows.forEach((c, i) => {
        shinyMethods.push({
          pokemon_id: s.pokemonId,
          form_id: variety.formId,
          game: c.game,
          method: c.method,
          odds_base: c.odds.oddsBase,
          odds_charm: c.odds.oddsCharm,
          odds_optimized: c.odds.oddsOptimized,
          boost_requirements: JSON.stringify(c.odds.boostRequirements),
          is_best_method: i === bestIndex,
          requires_transfer: false,
          transfer_chain: null,
          citation_url: citationUrl,
          notes: c.odds.notes ?? null,
        });
      });
    }
  }

  console.log(`deriveShinyMethods: ${pokemon.length} pokemon rows, ${shinyMethods.length} shiny_methods rows`);
  await writeOutJson("pokemon.json", pokemon);
  await writeOutJson("shiny-methods.json", shinyMethods);
  return { pokemon, shinyMethods };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDeriveShinyMethods().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
