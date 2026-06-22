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
 * - chain_radar/chain_fishing/dex_nav/sos/catch_combo/brilliant_pokemon are
 *   game-level mechanics: any species wild-available in that game qualifies.
 * - "outbreak" (SV/PLA) likewise — Mass/Massive Mass Outbreaks pull from a
 *   wild encounter table, so outbreak eligibility tracks wild availability.
 * - "dynamax_adventure" (SwSh) and "friend_safari" (Gen6 X/Y) are gated by
 *   their own scraped rosters (scrapeDynamaxAdventure.ts/
 *   scrapeFriendSafari.ts) — both are restricted-roster mechanics, unlike
 *   the game-level ones above.
 * - go_wild/go_community_day are never emitted — GO is deferred entirely
 *   (see scrapeBulbapedia.ts's header).
 */
import { readOutJson, writeOutJson } from "./httpCache.js";
import type { FetchedSpecies } from "./fetchPokeapi.js";
import type { AvailabilityOutput } from "./scrapeBulbapedia.js";
import type { ShinyLockFact } from "./scrapeShinyLocks.js";
import type { DynamaxAdventureFact } from "./scrapeDynamaxAdventure.js";
import type { FriendSafariFact } from "./scrapeFriendSafari.js";
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
  types: string;
  gender_rate: number;
  is_mythical: boolean;
  is_legendary: boolean;
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

function resolveLockedGames(species: FetchedSpecies[], locks: ShinyLockFact[]): Map<string, Set<Game>> {
  const locked = new Map<string, Set<Game>>();
  const byName = new Map<string, FetchedSpecies>();
  for (const s of species) {
    byName.set(s.name, s);
    byName.set(normalizeName(s.displayName), s);
  }
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

function applicableMethods(
  game: Game,
  isBreedable: boolean,
  isInDaRoster: boolean,
  isInFriendSafariRoster: boolean,
  oddsByGame: Map<Game, OddsRow[]>
): OddsRow[] {
  const rows = oddsByGame.get(game) ?? [];
  return rows.filter((row) => {
    if (row.method === "go_wild" || row.method === "go_community_day") return false;
    if (row.method === "masuda") return !NO_BREEDING_GAMES.has(game) && isBreedable;
    if (row.method === "dynamax_adventure") return isInDaRoster;
    if (row.method === "friend_safari") return isInFriendSafariRoster;
    return true; // wild, chain_radar, chain_fishing, dex_nav, sos, catch_combo, outbreak, brilliant_pokemon
  });
}

export async function runDeriveShinyMethods(): Promise<{ pokemon: PokemonRow[]; shinyMethods: ShinyMethodRow[] }> {
  const species = await readOutJson<FetchedSpecies[]>("species.json");
  const { citations, availability } = await readOutJson<AvailabilityOutput>("availability.json");
  const locks = await readOutJson<ShinyLockFact[]>("shiny-locks.json");
  const daRosterFacts = await readOutJson<DynamaxAdventureFact[]>("dynamax-adventure.json");
  const friendSafariFacts = await readOutJson<FriendSafariFact[]>("friend-safari.json");

  const lockedByForm = resolveLockedGames(species, locks);
  const daRoster = new Set(daRosterFacts.map((f) => `${f.pokemonId}:${f.formId}`));
  const friendSafariRoster = new Set(friendSafariFacts.map((f) => f.pokemonId));

  const availableByForm = new Map<string, Set<Game>>();
  for (const fact of availability) {
    if (fact.game === "go") continue; // GO deferred entirely — see scrapeBulbapedia.ts header
    const key = `${fact.pokemonId}:${fact.formId}`;
    if (!availableByForm.has(key)) availableByForm.set(key, new Set());
    availableByForm.get(key)!.add(fact.game);
  }
  // DA-roster/Friend-Safari-roster membership is itself a form of in-game
  // availability — some DA prizes (Solgaleo, Lunala, Necrozma, ...) aren't
  // natively wild/gift-available in SwSh at all per Bulbapedia's
  // Game-locations table, only catchable via the Crown Tundra den, so
  // "swsh"/"gen6_xy" must be added here rather than relying on them already
  // being present from the loop above.
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
        types: JSON.stringify(variety.types),
        gender_rate: s.genderRate,
        is_mythical: s.isMythical,
        is_legendary: s.isLegendary,
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

      const candidateRows: Array<{ game: Game; method: Method; odds: OddsRow }> = [];
      for (const game of available) {
        if (locked.has(game)) continue;
        for (const odds of applicableMethods(game, s.isBreedable, isInDaRoster, isInFriendSafariRoster, oddsByGame)) {
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
