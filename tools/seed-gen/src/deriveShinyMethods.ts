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
 *   obtained (wild encounter, gift, static, Pal Park...). Every row for a
 *   (form, game) pair — including this baseline one — carries an
 *   `is_wild_encounter` flag (from scrapeBulbapedia.ts's `isWild`) so the
 *   frontend can label a gift/static-only acquisition correctly instead of
 *   always saying "Wild Encounter." Confirmed this was a real, previously-
 *   unguarded bug: Turtwig's gift-only games showed the literal "Wild
 *   Encounter" label even though it was never obtainable in the wild there —
 *   `isWild` was already computed during scraping but discarded before this
 *   fix, never reaching `shiny_methods`.
 * - "masuda" applies only if the game has breeding (NO_BREEDING_GAMES) and
 *   the species itself can lay eggs (isBreedable, from PokéAPI's egg
 *   groups — "no-eggs" excluded).
 * - chain_radar/chain_fishing/dex_nav/sos/catch_combo/outbreak/
 *   brilliant_pokemon (WILD_ONLY_METHODS, below) are game-level mechanics
 *   that require a *repeatable, chainable wild encounter* to chain/grind
 *   against — they qualify only for (form, game) pairs scrapeBulbapedia.ts's
 *   own area= text marks as chainable (chainableByForm, stricter than plain
 *   wildness — see NON_CHAINABLE_MARKERS in scrapeBulbapedia.ts). Gift/
 *   static/trade/evolution/hatch-only availability does NOT count, even
 *   though the baseline "wild" method above still applies to it (the shiny
 *   roll fires identically regardless of how the Pokémon was obtained).
 *   Confirmed two real, previously-unguarded bugs this way: Bulbasaur's X/Y
 *   "Received from Professor Sycamore" gift was incorrectly shown as
 *   Chain-Fishing-huntable before any gating existed; Ivysaur's X/Y entry
 *   (text-mentioned Friend Safari, not a Route encounter) and Turtwig's BDSP
 *   Grand Underground entry (a distinct "symbol encounter" mechanic per
 *   Bulbapedia, not the tall-grass encounters Pokéradar requires) were both
 *   incorrectly granting Chain Fishing/Chain Radar before NON_CHAINABLE_MARKERS
 *   existed — genuinely wild, but not chainable.
 * - "dynamax_adventure" (SwSh) and "friend_safari" (Gen6 X/Y) are gated by
 *   their own scraped rosters (scrapeDynamaxAdventure.ts/
 *   scrapeFriendSafari.ts) — both are restricted-roster mechanics, unlike
 *   the game-level ones above. Roster membership itself is also NOT
 *   chainable for WILD_ONLY_METHODS purposes (a Dynamax Adventure den or
 *   Friend Safari zone isn't a normal wild Route encounter you can
 *   Pokéradar-chain or fish in) — see the availableByForm-population loops
 *   below, which deliberately never add to chainableByForm or wildLabelByForm.
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
import type { FetchedCosmeticForm, FetchedSpecies } from "./fetchPokeapi.js";
import type { EvolutionChainNode, EvolutionEdge } from "./fetchEvolutionChains.js";
import { CONCURRENT_UNDISAMBIGUATED_SPECIES, type AcquisitionMethod, type AvailabilityOutput } from "./scrapeBulbapedia.js";
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
  sprite_crop_x: number;
  sprite_crop_y: number;
  sprite_crop_width: number;
  sprite_crop_height: number;
  sprite_crop_x_female: number;
  sprite_crop_y_female: number;
  sprite_crop_width_female: number;
  sprite_crop_height_female: number;
  types: string;
  gender_rate: number;
  has_gender_differences: boolean;
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
  hatch_steps: number;
  flavor_text: string | null;
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
  base_experience: number;
  ev_yield_hp: number;
  ev_yield_attack: number;
  ev_yield_defense: number;
  ev_yield_special_attack: number;
  ev_yield_special_defense: number;
  ev_yield_speed: number;
  has_mega_evolution: boolean;
  has_gigantamax: boolean;
}

export interface CosmeticFormRow {
  pokemon_id: number;
  form_id: number;
  kind: string;
  display_name: string;
  sprite_url: string;
  shiny_sprite_url: string;
  sprite_crop_x: number;
  sprite_crop_y: number;
  sprite_crop_width: number;
  sprite_crop_height: number;
  mega_stone_item: string | null;
  types: string;
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
  base_experience: number;
  ev_yield_hp: number;
  ev_yield_attack: number;
  ev_yield_defense: number;
  ev_yield_special_attack: number;
  ev_yield_special_defense: number;
  ev_yield_speed: number;
}

export interface EvolutionChainRow {
  pokemon_id: number;
  form_id: number;
  chain_id: number;
  stage: number;
}

export interface EvolutionEdgeRow {
  chain_id: number;
  from_pokemon_id: number;
  from_form_id: number;
  to_pokemon_id: number;
  to_form_id: number;
  from_cosmetic_kind: string | null;
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
  /** True unless the underlying availability was gift/static/trade/evolution/hatch-only — see scrapeBulbapedia.ts's isWild. */
  is_wild_encounter: boolean;
  /** The specific non-wild reason — only meaningful when is_wild_encounter is false. See scrapeBulbapedia.ts's AcquisitionMethod. */
  acquisition_method: AcquisitionMethod | null;
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
    // An unannotated lock entry on a CONCURRENT_UNDISAMBIGUATED_SPECIES
    // (Urshifu, Oinkologne) locks every tracked variety, not just the
    // default — Bulbapedia's "List of unobtainable Shiny Pokémon" never
    // disambiguates these species' forms either, the same zero-
    // disambiguation fact already established in scrapeBulbapedia.ts for
    // availability. Confirmed as a real bug, not a hypothetical: without
    // this, Urshifu's SwSh/SV shiny lock silently applied to Single Strike
    // only, leaving Rapid Strike incorrectly shiny-obtainable.
    const varieties = !lock.formName && CONCURRENT_UNDISAMBIGUATED_SPECIES.has(candidate.name)
      ? candidate.varieties
      : lock.formName
        ? candidate.varieties.filter((v) => v.formName === lock.formName)
        : candidate.varieties.filter((v) => v.formId === 0);
    if (varieties.length === 0) {
      unmatched++;
      continue;
    }
    for (const variety of varieties) {
      const key = `${candidate.pokemonId}:${variety.formId}`;
      if (!locked.has(key)) locked.set(key, new Set());
      locked.get(key)!.add(lock.game);
    }
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
 * Mechanics that require a *repeatable, chainable wild encounter* to
 * chain/grind against — gated on isChainable (scrapeBulbapedia.ts's
 * NON_CHAINABLE_MARKERS-derived flag), not just plain availability or even
 * plain wildness (Friend-Safari-as-text and Grand Underground are genuinely
 * wild but not chainable — see scrapeBulbapedia.ts's header). See this
 * file's header comment for the full rationale.
 */
const WILD_ONLY_METHODS: ReadonlySet<Method> = new Set([
  "chain_radar", "chain_fishing", "dex_nav", "sos", "catch_combo", "outbreak", "brilliant_pokemon",
]);

function applicableMethods(
  game: Game,
  isBreedable: boolean,
  isInDaRoster: boolean,
  isInFriendSafariRoster: boolean,
  isChainable: boolean,
  oddsByGame: Map<Game, OddsRow[]>
): OddsRow[] {
  const rows = oddsByGame.get(game) ?? [];
  return rows.filter((row) => {
    if (row.method === "go_wild" || row.method === "go_community_day") return false;
    if (row.method === "masuda") return !NO_BREEDING_GAMES.has(game) && isBreedable;
    if (row.method === "dynamax_adventure") return isInDaRoster;
    if (row.method === "friend_safari") return isInFriendSafariRoster;
    if (WILD_ONLY_METHODS.has(row.method)) return isChainable;
    return true; // baseline "wild" method, and anything else genuinely ungated
  });
}

export async function runDeriveShinyMethods(): Promise<{ pokemon: PokemonRow[]; shinyMethods: ShinyMethodRow[]; cosmeticForms: CosmeticFormRow[]; evolutionChains: EvolutionChainRow[]; evolutionEdges: EvolutionEdgeRow[] }> {
  const species = await readOutJson<FetchedSpecies[]>("species.json");
  const { citations, availability } = await readOutJson<AvailabilityOutput>("availability.json");
  const locks = await readOutJson<ShinyLockFact[]>("shiny-locks.json");
  const daRosterFacts = await readOutJson<DynamaxAdventureFact[]>("dynamax-adventure.json");
  const friendSafariFacts = await readOutJson<FriendSafariFact[]>("friend-safari.json");
  const finalEvolutionIds = new Set(await readOutJson<number[]>("final-evolutions.json"));
  // Read here (not down by the cosmetic-forms pass-through below) so the
  // pokemon-row loop can compute has_mega_evolution/has_gigantamax per row.
  const cosmeticFormsRaw = await readOutJson<FetchedCosmeticForm[]>("cosmetic-forms-raw.json");

  const speciesByName = buildSpeciesNameIndex(species);
  const lockedByForm = resolveLockedGames(speciesByName, locks);
  const daRoster = new Set(daRosterFacts.map((f) => `${f.pokemonId}:${f.formId}`));
  const friendSafariRoster = new Set(friendSafariFacts.map((f) => f.pokemonId));

  const availableByForm = new Map<string, Set<Game>>();
  // Subset of availableByForm: only (form, game) pairs Bulbapedia's own
  // area= text marks as a genuine *chainable* wild encounter — feeds
  // WILD_ONLY_METHODS. Stricter than "wild" — Friend-Safari-as-text and
  // Grand Underground are wild but not chainable, see scrapeBulbapedia.ts.
  const chainableByForm = new Map<string, Set<Game>>();
  // Separate subset of availableByForm: (form, game) pairs that ARE a
  // roaming wild-style encounter at all (gift/static/trade/evolution/hatch
  // excluded) — independent of chainability. Feeds the persisted
  // is_wild_encounter column, which drives the frontend's acquisition-method
  // label (e.g. "Gift / Static Encounter" instead of "Wild Encounter").
  const wildLabelByForm = new Map<string, Set<Game>>();
  // Only meaningful where wildLabelByForm says non-wild — the specific
  // reason (gift/trade/evolution/hatch), feeding the persisted
  // acquisition_method column so the frontend can label e.g. Venusaur's
  // evolution-only X/Y row "Evolution (from Ivysaur)" instead of the
  // generic, misleading "Gift / Static Encounter" every non-wild row used
  // to get regardless of the real reason.
  const acquisitionMethodByForm = new Map<string, Map<Game, AcquisitionMethod>>();
  for (const fact of availability) {
    if (fact.game === "go") continue; // GO deferred entirely — see scrapeBulbapedia.ts header
    const key = `${fact.pokemonId}:${fact.formId}`;
    if (!availableByForm.has(key)) availableByForm.set(key, new Set());
    availableByForm.get(key)!.add(fact.game);
    if (fact.isWild) {
      if (!wildLabelByForm.has(key)) wildLabelByForm.set(key, new Set());
      wildLabelByForm.get(key)!.add(fact.game);
    } else if (fact.acquisitionMethod) {
      if (!acquisitionMethodByForm.has(key)) acquisitionMethodByForm.set(key, new Map());
      acquisitionMethodByForm.get(key)!.set(fact.game, fact.acquisitionMethod);
    }
    if (fact.isChainable) {
      if (!chainableByForm.has(key)) chainableByForm.set(key, new Set());
      chainableByForm.get(key)!.add(fact.game);
    }
  }
  // DA-roster/Friend-Safari-roster membership is itself a form of in-game
  // availability — some DA prizes (Solgaleo, Lunala, Necrozma, ...) aren't
  // natively wild/gift-available in SwSh at all per Bulbapedia's
  // Game-locations table, only catchable via the Crown Tundra den, so
  // "swsh"/"gen6_xy" must be added here rather than relying on them already
  // being present from the loop above. Deliberately never added to
  // chainableByForm — a den/Safari-zone catch isn't a normal wild Route
  // encounter you can Pokéradar-chain or fish in (absence there already
  // means non-chainable for WILD_ONLY_METHODS, no explicit marker needed).
  // Also deliberately never added to wildLabelByForm — a den/Safari catch
  // isn't a "Wild Encounter" in the labeling sense either; it gets its own
  // dedicated method label (dynamax_adventure/friend_safari), not the
  // baseline wild row, so is_wild_encounter is moot for these rows anyway.
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

  const megaFormKeys = new Set(
    cosmeticFormsRaw
      .filter((f) => f.kind === "mega" || f.kind === "mega_x" || f.kind === "mega_y")
      .map((f) => `${f.pokemonId}:${f.baseFormId}`),
  );
  const gmaxFormKeys = new Set(
    cosmeticFormsRaw.filter((f) => f.kind === "gmax").map((f) => `${f.pokemonId}:${f.baseFormId}`),
  );

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
        sprite_url: variety.spriteUrl,
        shiny_sprite_url: variety.shinySpriteUrl,
        sprite_url_female: variety.spriteUrlFemale,
        shiny_sprite_url_female: variety.shinySpriteUrlFemale,
        sprite_crop_x: variety.spriteCropX,
        sprite_crop_y: variety.spriteCropY,
        sprite_crop_width: variety.spriteCropWidth,
        sprite_crop_height: variety.spriteCropHeight,
        sprite_crop_x_female: variety.spriteCropXFemale,
        sprite_crop_y_female: variety.spriteCropYFemale,
        sprite_crop_width_female: variety.spriteCropWidthFemale,
        sprite_crop_height_female: variety.spriteCropHeightFemale,
        types: JSON.stringify(variety.types),
        // variety.genderRate is only ever set for Partner Pikachu/Eevee (see
        // PARTNER_FORM_OVERRIDES) — every other variety falls back to the
        // species-level value, since PokéAPI has no per-variety field at all.
        gender_rate: variety.genderRate ?? s.genderRate,
        has_gender_differences: s.hasGenderDifferences,
        is_mythical: s.isMythical,
        is_legendary: s.isLegendary,
        // Species-level facts — shared by every form/variety of this species.
        is_baby: s.isBaby,
        is_final_evolution: finalEvolutionIds.has(s.pokemonId),
        color: s.color,
        shape: s.shape,
        growth_rate: variety.growthRate ?? s.growthRate,
        egg_groups: JSON.stringify(s.eggGroups),
        capture_rate: s.captureRate,
        base_happiness: s.baseHappiness,
        hatch_steps: s.hatchSteps,
        flavor_text: s.flavorText,
        // Variety-level facts — these genuinely can differ by regional form.
        // generation lives here, not above with the species-level facts —
        // regional/alternate forms can postdate their base species by
        // multiple generations (Alolan Rattata: Gen 7, despite Kantonian
        // Rattata being Gen 1), confirmed a real, previously-conflated bug.
        generation: variety.generationNumber,
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
        base_experience: variety.baseExperience,
        ev_yield_hp: variety.evYieldHp,
        ev_yield_attack: variety.evYieldAttack,
        ev_yield_defense: variety.evYieldDefense,
        ev_yield_special_attack: variety.evYieldSpecialAttack,
        ev_yield_special_defense: variety.evYieldSpecialDefense,
        ev_yield_speed: variety.evYieldSpeed,
        has_mega_evolution: megaFormKeys.has(`${s.pokemonId}:${variety.formId}`),
        has_gigantamax: gmaxFormKeys.has(`${s.pokemonId}:${variety.formId}`),
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
      const chainableGames = chainableByForm.get(key) ?? new Set<Game>();
      const wildLabelGames = wildLabelByForm.get(key) ?? new Set<Game>();
      const acquisitionMethodGames = acquisitionMethodByForm.get(key) ?? new Map<Game, AcquisitionMethod>();

      const candidateRows: Array<{ game: Game; method: Method; odds: OddsRow; isWildEncounter: boolean; acquisitionMethod: AcquisitionMethod | null }> = [];
      for (const game of available) {
        if (locked.has(game)) continue;
        const isChainable = chainableGames.has(game);
        // is_wild_encounter only has meaning for the baseline "wild" method
        // row — it's the acquisition-path label (gift/static vs. genuinely
        // wild), orthogonal to breeding/roster methods like masuda/
        // dynamax_adventure/friend_safari, which already carry their own
        // distinct method label. Stamping the gift/wild signal onto those
        // rows too would let a future "WHERE is_wild_encounter" consumer
        // silently misread a masuda row's acquisition path.
        const isWildEncounter = wildLabelGames.has(game);
        const acquisitionMethod = acquisitionMethodGames.get(game) ?? null;
        for (const odds of applicableMethods(game, s.isBreedable, isInDaRoster, isInFriendSafariRoster, isChainable, oddsByGame)) {
          candidateRows.push({
            game,
            method: odds.method,
            odds,
            isWildEncounter: odds.method === "wild" ? isWildEncounter : true,
            acquisitionMethod: odds.method === "wild" ? acquisitionMethod : null,
          });
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
          is_wild_encounter: c.isWildEncounter,
          acquisition_method: c.acquisitionMethod,
          requires_transfer: false,
          transfer_chain: null,
          citation_url: citationUrl,
          notes: c.odds.notes ?? null,
        });
      });
    }
  }

  // Cosmetic forms (Mega/Gigantamax) need no availability/odds derivation —
  // they aren't independently huntable (Mega reverts after battle, Gmax
  // doesn't change shininess) — just a column-shape pass-through.
  const cosmeticForms: CosmeticFormRow[] = cosmeticFormsRaw.map((f) => ({
    pokemon_id: f.pokemonId,
    form_id: f.baseFormId,
    kind: f.kind,
    display_name: f.displayName,
    sprite_url: f.spriteUrl,
    shiny_sprite_url: f.shinySpriteUrl,
    sprite_crop_x: f.spriteCropX,
    sprite_crop_y: f.spriteCropY,
    sprite_crop_width: f.spriteCropWidth,
    sprite_crop_height: f.spriteCropHeight,
    mega_stone_item: f.megaStoneItem,
    types: JSON.stringify(f.types),
    height: f.height,
    weight: f.weight,
    abilities: JSON.stringify(f.abilities),
    stat_hp: f.statHp,
    stat_attack: f.statAttack,
    stat_defense: f.statDefense,
    stat_special_attack: f.statSpecialAttack,
    stat_special_defense: f.statSpecialDefense,
    stat_speed: f.statSpeed,
    stat_total: f.statTotal,
    base_experience: f.baseExperience,
    ev_yield_hp: f.evYieldHp,
    ev_yield_attack: f.evYieldAttack,
    ev_yield_defense: f.evYieldDefense,
    ev_yield_special_attack: f.evYieldSpecialAttack,
    ev_yield_special_defense: f.evYieldSpecialDefense,
    ev_yield_speed: f.evYieldSpeed,
  }));

  const evolutionChainNodes = await readOutJson<EvolutionChainNode[]>("evolution-chain-nodes.json");
  const evolutionChains: EvolutionChainRow[] = evolutionChainNodes.map((n) => ({
    pokemon_id: n.pokemonId,
    form_id: n.formId,
    chain_id: n.chainId,
    stage: n.stage,
  }));

  const evolutionChainEdges = await readOutJson<EvolutionEdge[]>("evolution-chain-edges.json");
  const evolutionEdges: EvolutionEdgeRow[] = evolutionChainEdges.map((e) => ({
    chain_id: e.chainId,
    from_pokemon_id: e.fromPokemonId,
    from_form_id: e.fromFormId,
    to_pokemon_id: e.toPokemonId,
    to_form_id: e.toFormId,
    from_cosmetic_kind: e.fromCosmeticKind,
  }));

  console.log(`deriveShinyMethods: ${pokemon.length} pokemon rows, ${shinyMethods.length} shiny_methods rows, ${cosmeticForms.length} cosmetic_forms rows, ${evolutionChains.length} evolution_chains rows, ${evolutionEdges.length} evolution_edges rows`);
  await writeOutJson("pokemon.json", pokemon);
  await writeOutJson("shiny-methods.json", shinyMethods);
  await writeOutJson("cosmetic-forms.json", cosmeticForms);
  await writeOutJson("evolution-chains.json", evolutionChains);
  await writeOutJson("evolution-edges.json", evolutionEdges);
  return { pokemon, shinyMethods, cosmeticForms, evolutionChains, evolutionEdges };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDeriveShinyMethods().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
