/**
 * Scrapes each species' Bulbapedia "Game locations" section for per-game
 * availability. This single table turns out to be a more complete source
 * than originally planned (§4.1 sketched PokéAPI-for-wild +
 * Bulbapedia-for-static/gift/breeding): Bulbapedia's table already covers
 * wild AND static AND gift/trade AND breed-only-via-transfer in one place,
 * including for SV/PLA, where PokéAPI's own encounter data is known
 * incomplete (verified directly — PokéAPI's `/pokemon/{id}/encounters`
 * simply has no Scarlet/Violet entries for most species yet). So this
 * scraper is the sole availability source; fetchPokeapi.ts only supplies
 * metadata and sprites.
 *
 * Bulbapedia's own template structure (verified against live pages) is:
 *   {{Availability/Gen|gen=ROMAN}}
 *   {{Availability/Entry1|v=Red|area=...}}            <- obtainable, base form
 *   {{Availability/Entry2/None|v=Diamond|v2=Pearl}}    <- NOT obtainable here
 *   ...
 *   {{Availability/Footer}}
 *   ====In side games====   (and ====In events====)    <- intentionally excluded:
 *       side games aren't mainline shiny-hunting targets, and event
 *       distributions are one-time, non-repeatable code redemptions you
 *       can't grind shiny odds against.
 * The `/None` suffix means "not obtainable by any means in this specific
 * version" (confirmed against Bulbasaur, which is /None in Diamond/Pearl/
 * Platinum but has a separate plain "Pal Park" entry — i.e. you can't catch
 * it there directly, only transfer it in). Plain Entry1/Entry2 rows mean
 * it's obtainable somehow (wild, gift, static, Pal Park...) — and since the
 * shiny RNG check fires identically regardless of how a Pokémon is
 * obtained, every available (species, game) pair is modeled as the same
 * baseline Method::Wild row; only named boost mechanics (Masuda, Outbreak,
 * SOS, ...) get their own additional rows, added later in
 * deriveShinyMethods.ts.
 *
 * For species with regional forms (Alolan/Galarian/Hisuian/Paldean), a
 * single row's `area=` text can cover multiple forms with inline
 * `'''X Form'''` annotations (see resolveAnnotation/resolveFormIds below) —
 * verified against Vulpix, whose Brilliant Diamond row reads "Trade
 * (Kantonian Form) / Unobtainable (Alolan Form)" in one cell, and against
 * Paldean Tauros, whose 3 breeds share the "Paldean" adjective and are only
 * disambiguated by a breed qualifier in parens: "Paldean Form (Combat
 * Breed)", or "Paldean Form (Combat and Blaze Breeds)" for a single
 * location shared by two breeds.
 *
 * Colosseum/XD need one more piece of per-entry context: Bulbapedia tags
 * genuine Shadow Pokémon entries inline with `{{color2|{{shadow
 * color}}|Shadow Pokémon|(Shadow)}}` in the `area=` text (verified against
 * Sableye's and Makuhita's pages). This matters because the two games have
 * *opposite* Shiny rules for the mechanic — confirmed directly against
 * Bulbapedia's own "Shiny Pokémon" article: in Colosseum, only genuine
 * Shadow Pokémon can be Shiny (non-Shadow gifts like the player's starter
 * Espeon/Umbreon are explicitly called out there as Shiny-locked); in XD
 * it's the exact inverse — the game "recalculat[es] the Pokémon's
 * personality value" to prevent any Shadow Pokémon from being Shiny, while
 * its non-Shadow Pokémon (initial Eevee, in-game trades, Poké Spot
 * encounters) can be. So an entry only counts as real availability if it
 * matches the genuinely-Shiny-rollable category for that specific game —
 * see the `isShadowPokemon` check in parseAvailability below.
 *
 * One more per-entry signal: whether the entry represents a genuine *wild*
 * encounter, as opposed to a one-time NPC gift, a static "(Only one)"
 * encounter, a trade, an evolution-only path, or a hatch-only path. This
 * matters because several Method rows (chain_radar/Pokéradar, chain_fishing,
 * dex_nav, sos, catch_combo, outbreak, brilliant_pokemon — see
 * deriveShinyMethods.ts's WILD_ONLY_METHODS) require a *repeatable* wild
 * encounter to chain/grind against; the baseline Method::Wild row still
 * applies regardless (the shiny roll itself fires identically no matter how
 * the Pokémon was obtained). Verified directly against live wikitext rather
 * than assumed: Bulbasaur's X/Y entry reads "Received from Professor
 * Sycamore" with an `area=` link to Bulbapedia's "List of in-game event
 * Pokémon" catalog — not a Route/fishing encounter — yet was incorrectly
 * shown as Chain-Fishing-huntable before this check existed. See
 * `isWildSegment` below for the exact signal.
 */
import type { FetchedSpecies, FetchedVariety } from "./fetchPokeapi.js";
import { BULBAPEDIA_LABEL_TO_GAMES, type Game } from "./gameMap.js";
import { ConcurrencyLimiter, readOutJson, writeOutJson } from "./httpCache.js";
import { fetchNamedSection, pageUrl } from "./mediawikiClient.js";
import { findTemplateCalls, parseTemplateCall } from "./wikitext.js";

/**
 * The specific non-wild reason a "wild"-method row's availability comes
 * from — "gift" also covers Bulbapedia's "(Only one)" static encounters
 * (confirmed empirically: both route through the identical
 * `[[List of in-game event Pokémon...|Only one]]` catalog-link template,
 * with no textual signal distinguishing an NPC gift from a fixed static
 * encounter — verified directly against Bulbasaur's Sycamore-lab gift vs.
 * the Sinnoh lake trio's lake encounters, both phrased identically aside
 * from the preceding location/NPC-name text, which isn't a reliable
 * person-vs-place signal to regex against). Only meaningful when
 * `isWild` is false.
 */
export type AcquisitionMethod = "gift" | "trade" | "evolution" | "hatch";

export interface AvailabilityFact {
  pokemonId: number;
  formId: number;
  game: Game;
  /** True unless the area= text signals a gift/static/trade/evolution/hatch-only path — see isWildSegment. */
  isWild: boolean;
  /**
   * True unless the area= text signals a wild-but-non-chainable path (Friend
   * Safari mentioned as plain text, Grand Underground Hideaways) — see
   * isChainableSegment. Always false when isWild is false (non-wild implies
   * non-chainable); the reverse isn't true — isWild can be true while this
   * is false.
   */
  isChainable: boolean;
  /** The specific non-wild reason — see AcquisitionMethod. Undefined when isWild is true. */
  acquisitionMethod?: AcquisitionMethod;
}

export interface AvailabilityOutput {
  citations: Record<number, string>;
  availability: AvailabilityFact[];
}

/**
 * Bulbapedia's own colloquial size words for Pumpkaboo/Gourgeist don't match
 * PokéAPI's form_name-derived labels ("Average") this pipeline tracks —
 * confirmed live on Pumpkaboo's actual Game-locations wikitext ("Medium/
 * Small Varieties", "Large/Jumbo Varieties"). A small, explicit, cited
 * synonym table — the same kind of hand-maintained classification rule
 * REGIONAL_ADJECTIVES/GROUP_A_FORM_NAMES already are, not "data."
 */
const ANNOTATION_NAME_SYNONYMS: Record<string, string> = {
  medium: "average",
  jumbo: "super",
};

/**
 * Resolves one `'''...'''`-bolded form annotation to the variety/varieties
 * it refers to. Confirmed live against real wikitext that the trailing
 * qualifier word varies by species — "Form"/"Forms" (most regional forms,
 * Lycanroc's "Midday/Midnight Forms"), "Cloak"/"Cloaks" (Wormadam), "Size"/
 * "Sizes"/"Variety"/"Varieties" (Pumpkaboo/Gourgeist), "Flower"/"Flowers"
 * (Floette's "Blue/Red/Yellow Flowers"/"Eternal Flower") — and that some
 * annotations have no qualifier word at all (Indeedee/Basculegion/Meowstic/
 * Oinkologne's bare "Male"/"Female"). An optional trailing parenthetical
 * (Tauros's breed qualifier) is stripped before extracting the qualifier
 * word, but kept available (via the original `boldText`) for the
 * breed-disambiguation fallback below.
 *
 * Slash-separated combined names (Lycanroc's "Midday/Midnight Forms") are
 * resolved to multiple formIds from one annotation, OR-merged the same way
 * every other multi-source signal in this file already is. Any individual
 * name that doesn't match a tracked variety's formName — most commonly the
 * species' own default/base variety, which this pipeline never assigns an
 * explicit formName to by design (e.g. "Midday" for Lycanroc, "Kantonian"/
 * "Johtonian" origin labels, Pumpkaboo's "Average" colloquially spelled
 * "Medium") — safely defaults to the base form (formId 0) rather than being
 * dropped, the same safe-default convention this project's regional-form
 * fix already established.
 */
/**
 * Renders simple inline wikitext markup down to plain text — confirmed
 * necessary live against Raticate's Sun/Moon annotation, which silently
 * dropped Alolan Raticate's entire wild availability: the bold annotation
 * text was literally `{{rf|Alolan}} Form` and `[[Kanto]]nian Form` (not the
 * plain "Alolan Form"/"Kantonian Form" a reader sees rendered), so neither
 * ever matched a tracked variety's formName and both silently fell back to
 * formId 0. `{{Template|args}}` resolves to its LAST pipe-separated
 * argument (confirmed live: `{{rf|Alolan}}` -> "Alolan", `{{rf|Alolan|Alolan
 * Form}}` -> "Alolan Form" — the common Bulbapedia convention of an optional
 * trailing display-text override, the same one `[[Link|Display]]` already
 * uses). `[[Link]]` resolves to its target; `[[Link|Display]]` to its
 * display text.
 */
function renderWikitextToPlainText(text: string): string {
  let rendered = text;
  // Repeat to fixed-point rather than a single pass: `[^{}]+` only ever
  // matches the INNERMOST `{{...}}` (one with no nested braces), so a
  // template nested inside another (`{{outer|{{inner}}}}`) needs the inner
  // one resolved first, then the now-brace-free outer one resolved on the
  // next iteration. No confirmed real case of this nesting exists yet in
  // the cached corpus, but a single pass would silently leave residual
  // markup behind for one, repeating the exact Alolan Raticate failure mode
  // this function exists to fix. Bounded iteration count guards against a
  // pathological/malformed input that never reaches a fixed point.
  for (let i = 0; i < 5; i++) {
    const next = rendered
      .replace(/\{\{([^{}]+)\}\}/g, (_, inner: string) => {
        const parts = inner.split("|");
        return parts[parts.length - 1];
      })
      .replace(/\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g, (_, target: string, display?: string) => display ?? target);
    if (next === rendered) break;
    rendered = next;
  }
  return rendered;
}

function resolveAnnotation(
  boldText: string,
  varieties: FetchedVariety[],
): number[] {
  const rendered = renderWikitextToPlainText(boldText);
  const withoutParen = rendered.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const qualifierMatch = withoutParen.match(/^(.+?)\s+(?:Forms?|Cloaks?|Variet(?:y|ies)|Sizes?|Flowers?)$/i);
  const namesText = qualifierMatch ? qualifierMatch[1] : withoutParen;
  if (!namesText) return [0]; // not a recognizable annotation at all — treat as the base form
  // A bolded region/location sub-header — Bulbapedia's own per-region
  // breakdown convention for Legends: Arceus (and similar) location lists,
  // e.g. "'''[[Coronet Highlands]]:'''" — always ends with a colon once
  // rendered, confirmed structurally distinct from every real form
  // annotation (which never does). Regression test for a real bug found
  // auditing Hisuian Growlithe/Arcanine/Voltorb: the caller's matchAll
  // picks up EVERY bold span in a segment, including a region header
  // sharing a segment with a real "('''Hisuian Form''')" annotation —
  // without this check, the unmatched region name fell through to the
  // "unmatched -> form 0" fallback below, wrongly attributing that whole
  // segment's availability to the Kantonian/default form too, even though
  // the segment's own text explicitly scoped it to the Hisuian form only.
  if (namesText.endsWith(":")) return [];
  if (namesText.toLowerCase() === "all") return varieties.map((v) => v.formId); // "All Forms"/"All Sizes"

  const names = namesText.split("/").map((n) => {
    const normalized = n.trim().toLowerCase();
    return ANNOTATION_NAME_SYNONYMS[normalized] ?? normalized;
  });
  const formIds = new Set<number>();
  for (const name of names) {
    const candidates = varieties.filter((v) => v.formName?.toLowerCase() === name);
    if (candidates.length === 0) {
      formIds.add(0); // unmatched — almost always the species' own untracked default variety
    } else if (candidates.length === 1) {
      formIds.add(candidates[0].formId);
    } else {
      // Multiple varieties share this name (Paldean Tauros's 3 breeds all
      // have formName "Paldean") — disambiguate via a breed qualifier in
      // the original boldText's parenthetical, same as before.
      const breedMatches = candidates.filter((v) => {
        const breedWord = v.displayName.match(/\(([^)]+)\)/)?.[1]?.split(" ")[0];
        return breedWord && rendered.includes(breedWord);
      });
      const resolved = breedMatches.length > 0 ? breedMatches : candidates;
      for (const v of resolved) formIds.add(v.formId);
    }
  }
  return Array.from(formIds);
}

/**
 * An area= segment signals non-wild availability when it links to
 * Bulbapedia's event-Pokémon catalog (covers both one-time NPC gifts AND
 * "(Only one)" static encounters — both use the same catalog link per
 * Bulbapedia convention), is a starter-gift ("[[First partner Pokémon]]" —
 * confirmed the stable wikilink for every generation's starter trio, e.g.
 * Turtwig's DP/Pt entry: "[[First partner Pokémon]] from [[Professor
 * Rowan]]'s briefcase at [[Lake Verity]]" has no event-catalog link, so it
 * needs its own marker rather than relying on that one), an explicit trade
 * (wikilinked, or plain "Traded from" — confirmed: Chespin's X/Y entry reads
 * "Traded from [[Shauna]] in [[Vaniville Town]]..." with no [[Trade]] link),
 * an evolution-only path, or a hatch-only path. Chain mechanics (Pokéradar,
 * chain fishing, DexNav, SOS, catch combo, Mass Outbreak, Brilliant Pokémon)
 * require a *repeatable wild grass/water/cave encounter* to grind against —
 * none of these categories qualify, even though the baseline Method::Wild
 * row still applies to all of them. Verified against multiple real pages
 * (Bulbasaur, every generation's starter trio, a known-wild X/Y species, a
 * known static encounter, a known trade-only species, an evolution-only
 * species) — absence of all of these markers, with a real location/route
 * link present, defaults to wild.
 *
 * The `t=`/`t2=`/`color=` template params were checked directly against
 * Bulbapedia (including the template's own documentation page) and are NOT
 * a reliable signal — display/formatting only, intentionally not consulted
 * here.
 *
 * Honest gap: this is a best-effort textual heuristic verified against
 * several real examples, not an exhaustive parse of every phrasing
 * Bulbapedia uses across ~1080 species. A repeatable static encounter
 * phrased without a link to the event-Pokémon catalog would be
 * misclassified as wild (rare — most static encounters Bulbapedia tracks do
 * use that link). Don't add markers for cases not yet confirmed against a
 * real page.
 */
const NON_WILD_MARKERS: Array<{ regex: RegExp; category: AcquisitionMethod }> = [
  { regex: /\[\[List of in-game event Pokémon/i, category: "gift" }, // covers both "Received" gifts and "(Only one)" statics
  { regex: /\[\[First partner Pokémon\]\]/i, category: "gift" }, // starter-gift link, used identically across every generation
  { regex: /\[\[Trade|\[\[In-game trade(?:#[^|\]]*)?\|Trade\]\]|Traded from/i, category: "trade" }, // explicit trade link ([[Trade...]] or the differently-titled [[In-game trade|Trade]], confirmed: Raichu's Legends: Z-A entry, optionally with a #Section anchor before the pipe, confirmed: Mankey's Black 2/White 2 entry, "[[In-game trade#Black 2 and White 2|Trade]]"), or plain-text "Traded from" (confirmed: Chespin X/Y)
  { regex: /\[\[Evolution\|Evolve/i, category: "evolution" }, // evolution-only path
  { regex: /Evolve\s*\{\{p\|/i, category: "evolution" }, // alt evolution-link wikitext form
  { regex: /Hatch\s*\{\{pkmn\|Egg\}\}/i, category: "hatch" }, // breeding/hatch-only — non-wild for chain-mechanic purposes
  // "Breed {{p|OtherSpecies}}" — a pre-evolution obtainable in a given game
  // ONLY by breeding its own evolved form and hatching the egg (no wild
  // encounter exists at all). Missed entirely until the first-50-species
  // audit found it on ~295 cached pages (e.g. Caterpie/Weedle/Pidgey/
  // Rattata/Spearow/Sandshrew/Venonat/Vulpix/Zubat/Diglett all have at least
  // one game where their only listed source is this) — confirmed two
  // distinct wikitext forms for the same fact: the template
  // `{{pkmn|breeding|Breed}}` (255 occurrences) and the plain wikilink
  // `[[Pokémon breeding|Breed]]`/`[[Pokémon Breeding|Breed]]` (39
  // occurrences, case varies). Same "hatch" category as the pre-existing
  // generic Hatch-Egg marker — both mean "obtained by breeding," just
  // phrased differently by Bulbapedia depending on whether a *specific*
  // parent species is named.
  { regex: /\{\{pkmn\|breeding\|Breed\}\}/i, category: "hatch" },
  { regex: /\[\[Pokémon [Bb]reeding\|Breed\]\]/i, category: "hatch" },
];

/** The matched non-wild category, or undefined if the segment is wild. */
function nonWildCategory(segmentText: string): AcquisitionMethod | undefined {
  return NON_WILD_MARKERS.find((m) => m.regex.test(segmentText))?.category;
}

function isWildSegment(segmentText: string): boolean {
  return nonWildCategory(segmentText) === undefined;
}

/**
 * A bold-annotated segment whose only non-annotation text is one of these
 * exact markers means that SPECIFIC form has no real native source in this
 * entry's version, even though the cell as a whole is a plain (non-/None)
 * Availability/Entry call (because some OTHER bold-annotated form in the
 * same cell does have one). "Unobtainable" means explicitly impossible;
 * the rest are one-way, no-new-shiny-roll transfer mechanisms — the same
 * "no new roll happens there" principle gameMap.ts's BULBAPEDIA_LABEL_TO_GAMES
 * already applies to the dedicated "v=Pal Park" pseudo-version, just for
 * when the equivalent fact instead shows up INLINE in an otherwise-real
 * entry's area= text. Confirmed live: Raichu's SV entry reads "{{g|HOME}}
 * ('''Alolan Form''')" while a real Kantonian-Form Tera Raid segment shares
 * the same cell; Sandshrew/Sandslash/Vulpix/Ninetales/Diglett's Gen 7
 * entries read "[[Pokémon Bank]] ('''Kantonian Form''')" in the exact same
 * shape "Unobtainable" already needed special-casing for — found during the
 * first-50-species audit, the same root-cause class as that earlier fix.
 * "Poké Portal News" is the same category by a different name — confirmed
 * live it's always either its own dedicated `====In events====` subsection
 * (date-windowed Tera Raid spotlights, e.g. "October 3 to 12, 2025") or, when
 * mentioned inline like this, a reference to that same one-time, time-
 * limited event mechanism — not a repeatable native encounter, matching this
 * project's existing "event distributions ... can't grind shiny odds
 * against" exclusion already applied at the section level.
 *
 * A remainder can combine more than one of these with a comma (confirmed:
 * Raichu's Area Zero DLC entry reads "{{g|HOME}}, [[Poké Portal News]]" for
 * its Alolan Form segment) — checked per comma-separated part, not as one
 * exact whole-string match, so combinations are recognized too.
 */
const NO_NATIVE_AVAILABILITY_MARKERS = [
  /^unobtainable$/i,
  // Confirmed live a distinct, synonymous marker from "Unobtainable" — same
  // meaning, different word — on Floette's X/Y and USUM entries: "Unreleased
  // ('''Eternal Flower''')" (Eternal Flower wasn't legitimately obtainable
  // until Legends: Z-A, while the entry's OTHER bold-annotated forms are
  // real). Found auditing the Shellos/Gastrodon/Arceus "deferred" claims for
  // other missed cases, not the original first-50-species audit.
  /^unreleased$/i,
  /^\[\[Pokémon Bank\]\]$/i,
  /^\{\{g\|HOME\}\}$/i,
  /^\[\[Poké Transfer\]\]$/i,
  /^\[\[Pal Park\]\]$/i,
  /^\[\[#?Poké Portal News(\|[^[\]]*)?\]\]$/i,
];

/** True if every comma-separated part of the remainder is a recognized non-native-availability marker (or the remainder is empty/whitespace-only, which the existing single-marker check already covers via the caller's own logic). */
function isNoNativeAvailabilityRemainder(remainder: string): boolean {
  const parts = remainder.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
  return parts.length > 0 && parts.every((part) => NO_NATIVE_AVAILABILITY_MARKERS.some((re) => re.test(part)));
}

/**
 * Segments that ARE wild in the isWild sense (a real roaming encounter, not
 * a gift/trade/evolution/hatch) but aren't a *chainable* Route/cave
 * encounter — Pokéradar/chain-fishing/DexNav/SOS/Catch Combo/Mass Outbreak/
 * Brilliant Pokémon (deriveShinyMethods.ts's WILD_ONLY_METHODS) all require
 * grinding the same standard overworld grass/water/cave encounter table, not
 * a restricted-roster or alternate-mechanic location. Two confirmed cases,
 * each verified against a live Bulbapedia page rather than assumed:
 * - Friend Safari mentioned as plain area= text (distinct from the separate
 *   Friend-Safari-roster mechanism in deriveShinyMethods.ts, which never
 *   touches wildness at all): Ivysaur's X/Y entry is *only*
 *   "Friend Safari (Grass type Safari)" — no Route/fishing encounter — yet
 *   was incorrectly granting Chain Fishing/Chain Radar before this marker
 *   existed.
 * - Grand Underground (BDSP): per Bulbapedia's own Grand Underground article,
 *   Hideaway encounters are "unlike the main overworld... symbol
 *   encounters" — a distinct mechanic from the tall-grass encounters
 *   Bulbapedia's Poké Radar article says the Radar specifically requires
 *   ("in tall grass, while on foot"). Turtwig's BDSP entry OR-merges its
 *   starter-gift segment with a genuinely separate Grand Underground wild
 *   segment — correctly wild (the species really is repeatably catchable
 *   there), but incorrectly granted Chain Radar before this marker existed.
 * - Max Lair (Dynamax Adventure, SwSh's Crown Tundra): a den/rental-battle
 *   roster mechanic, not a tall-grass encounter — same reasoning as Friend
 *   Safari/Grand Underground above. Found during the first-50-species audit
 *   (Raichu/Sandslash's Expansion Pass entries): mentioned inline in area=
 *   text independently of the separate scrapeDynamaxAdventure.ts roster file
 *   (which already derives its own correct `dynamax_adventure` method row),
 *   so left unmarked this was incorrectly granting Brilliant Pokémon to a
 *   den-only path.
 */
const NON_CHAINABLE_MARKERS = [
  /Friend Safari/i,
  /Grand Underground/i,
  /\[\[Max Lair\]\] \(\[\[Dynamax Adventure\]\]\)/i,
];

/** Chainable implies wild — callers that already know a segment's wildness should pass it in rather than have this recompute isWildSegment. */
function isChainableSegment(segmentText: string, isWild = isWildSegment(segmentText)): boolean {
  return isWild && !NON_CHAINABLE_MARKERS.some((re) => re.test(segmentText));
}

/**
 * Wildness is about textual structure (multiple <br>-separated sources
 * listed in one area= cell), independent of whether the species has
 * multiple Pokédex forms — so this always splits on <br> and OR-merges,
 * even for single-form species. Verified necessary against a real example:
 * Bulbasaur's Legends: Z-A entry combines a non-wild gift segment ("Vert
 * District: ... Received from Mable during Side Mission 22") with a
 * genuinely wild segment ("Centrico Plaza: Wild Zone 20") in one cell,
 * despite Bulbasaur having only one tracked form — treating the whole cell
 * as a single non-split segment would have misclassified it as fully
 * non-wild and incorrectly suppressed its legitimate wild availability.
 */
function isWildArea(areaText: string): boolean {
  const segments = areaText
    .split(/<br\s*\/?>/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segments.length === 0) return isWildSegment(areaText); // defensive fallback, shouldn't occur in practice
  return segments.some(isWildSegment);
}

/**
 * The acquisition category when the WHOLE area is non-wild (every segment
 * non-wild) — meaningless when isWildArea is true. If segments disagree on
 * category (no confirmed real case yet — verify against real data, don't
 * assume), the first segment's category wins, document-order, the same
 * "first match wins" choice nonWildCategory already makes within one segment.
 */
function acquisitionMethodArea(areaText: string): AcquisitionMethod | undefined {
  const segments = areaText
    .split(/<br\s*\/?>/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segments.length === 0) return nonWildCategory(areaText);
  for (const segment of segments) {
    const category = nonWildCategory(segment);
    if (category) return category;
  }
  return undefined;
}

/** Same OR-merge as isWildArea, but for the (stricter) chainable predicate. */
function isChainableArea(areaText: string): boolean {
  const segments = areaText
    .split(/<br\s*\/?>/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segments.length === 0) return isChainableSegment(areaText);
  return segments.some((s) => isChainableSegment(s));
}

/**
 * Species confirmed to have zero Bulbapedia bold-annotation disambiguation
 * between their tracked forms ANYWHERE on their Game-locations page —
 * verified live for both (Urshifu: "area=[[Evolution|Evolve]] {{p|Kubfu}}",
 * one generic entry covering both styles; Oinkologne: zero bold annotations
 * found anywhere on the page). This is NOT the regional-form-introduced-
 * later bug already fixed (`!sawAnnotation` defaulting to formId 0 only) —
 * these species' forms are introduced *concurrently*, never one before the
 * other (both Urshifu styles exist in every game Urshifu exists in at all;
 * Oinkologne's gender split exists from its own release), so applying the
 * same availability to every tracked variety is correct here, not a guess.
 */
export const CONCURRENT_UNDISAMBIGUATED_SPECIES = new Set(["urshifu", "oinkologne"]);

function resolveFormIdsAndWildness(
  areaText: string,
  varieties: FetchedVariety[],
  speciesName: string,
): {
  formIds: number[];
  wildByFormId: Map<number, boolean>;
  chainableByFormId: Map<number, boolean>;
  acquisitionMethodByFormId: Map<number, AcquisitionMethod | undefined>;
} {
  if (varieties.length <= 1) {
    const formId = varieties[0]?.formId ?? 0;
    return {
      formIds: [formId],
      wildByFormId: new Map([[formId, isWildArea(areaText)]]),
      chainableByFormId: new Map([[formId, isChainableArea(areaText)]]),
      acquisitionMethodByFormId: new Map([[formId, acquisitionMethodArea(areaText)]]),
    };
  }

  const segments = areaText.split(/<br\s*\/?>/i);
  const annotatedFormIds: number[] = [];
  const wildByFormId = new Map<number, boolean>();
  const chainableByFormId = new Map<number, boolean>();
  const acquisitionMethodByFormId = new Map<number, AcquisitionMethod | undefined>();
  let sawAnnotation = false;
  let sawUnannotatedContent = false;
  let unannotatedWild = false;
  let unannotatedChainable = false;
  let unannotatedAcquisitionMethod: AcquisitionMethod | undefined;

  for (const segment of segments) {
    const segmentWild = isWildSegment(segment);
    const segmentChainable = isChainableSegment(segment, segmentWild);
    const segmentAcquisitionMethod = nonWildCategory(segment);
    // matchAll, not match: a segment can carry more than one bold form
    // annotation without a <br> between them (no real example yet, but
    // nothing in the wikitext convention rules it out) — match() alone
    // would silently process only the first and drop the rest.
    const matches = [...segment.matchAll(/'''([^']+)'''/g)];
    if (matches.length > 0) {
      sawAnnotation = true;
      // A bold-annotated segment whose only non-annotation text is one of
      // NO_NATIVE_AVAILABILITY_MARKERS means this SPECIFIC form has no real
      // in-game source in this entry's version, even though the cell as a
      // whole is a plain (non-/None) Availability/Entry call because a
      // DIFFERENT bold-annotated form in the same cell does have one — skip
      // the form entirely rather than letting its bold annotation register
      // it as available, but still count this as "saw a real annotation" so
      // the all-unannotated fallback below isn't mistakenly triggered.
      const remainder = segment
        .replace(/<small>.*?<\/small>/gi, "")
        .replace(/'''[^']+'''/g, "")
        .trim();
      if (isNoNativeAvailabilityRemainder(remainder)) continue;
      for (const match of matches) {
        for (const formId of resolveAnnotation(match[1], varieties)) {
          annotatedFormIds.push(formId);
          // OR-combine: a formId is wild if any segment naming it is wild —
          // same merge philosophy already used for form membership itself.
          wildByFormId.set(
            formId,
            (wildByFormId.get(formId) ?? false) || segmentWild,
          );
          chainableByFormId.set(
            formId,
            (chainableByFormId.get(formId) ?? false) || segmentChainable,
          );
          // First non-wild category wins if segments disagree — no confirmed
          // real case of disagreement yet, verify against real data rather
          // than assume; this keeps it deterministic in the meantime.
          if (!acquisitionMethodByFormId.get(formId)) {
            acquisitionMethodByFormId.set(formId, segmentAcquisitionMethod);
          }
        }
      }
    } else if (segment.trim().length > 0) {
      sawUnannotatedContent = true;
      // OR, not AND: wild if any unannotated segment is wild, same merge
      // philosophy as everywhere else here.
      unannotatedWild = unannotatedWild || segmentWild;
      unannotatedChainable = unannotatedChainable || segmentChainable;
      unannotatedAcquisitionMethod ??= segmentAcquisitionMethod;
    }
  }

  if (!sawAnnotation) {
    // An area cell with zero bold form annotations always describes exactly
    // one form, never "every variety of this species" — confirmed directly
    // against Bulbapedia's own convention (Rattata/Sandshrew/Meowth/Growlithe
    // wikitext: every pre-regional-form generation entry is unannotated and
    // describes the base/Kantonian form only; the instant a cell needs to
    // distinguish two forms, both get bolded). Defaulting to every variety
    // here previously gave regional forms availability in games that predate
    // them by multiple generations (e.g. Alolan Rattata showing up in
    // Diamond/Pearl). Same default as the `sawUnannotatedContent` partial
    // case below (formId 0), just for the all-unannotated case.
    const wild = isWildArea(areaText);
    const chainable = isChainableArea(areaText);
    const acquisitionMethod = acquisitionMethodArea(areaText);
    if (CONCURRENT_UNDISAMBIGUATED_SPECIES.has(speciesName)) {
      return {
        formIds: varieties.map((v) => v.formId),
        wildByFormId: new Map(varieties.map((v) => [v.formId, wild])),
        chainableByFormId: new Map(varieties.map((v) => [v.formId, chainable])),
        acquisitionMethodByFormId: new Map(varieties.map((v) => [v.formId, acquisitionMethod])),
      };
    }
    return {
      formIds: [0],
      wildByFormId: new Map([[0, wild]]),
      chainableByFormId: new Map([[0, chainable]]),
      acquisitionMethodByFormId: new Map([[0, acquisitionMethod]]),
    };
  }
  if (sawUnannotatedContent) {
    annotatedFormIds.push(0);
    wildByFormId.set(0, (wildByFormId.get(0) ?? false) || unannotatedWild);
    chainableByFormId.set(0, (chainableByFormId.get(0) ?? false) || unannotatedChainable);
    if (!acquisitionMethodByFormId.get(0)) {
      acquisitionMethodByFormId.set(0, unannotatedAcquisitionMethod);
    }
  }
  const formIds = [...new Set(annotatedFormIds)];
  return { formIds, wildByFormId, chainableByFormId, acquisitionMethodByFormId };
}

export function parseAvailability(
  wikitext: string,
  varieties: FetchedVariety[],
  speciesName: string,
): Array<{ game: Game; formId: number; isWild: boolean; isChainable: boolean; acquisitionMethod?: AcquisitionMethod }> {
  const mainSection = wikitext.split("{{Availability/Footer}}")[0];
  const calls = findTemplateCalls(mainSection, "Availability/Entry");
  const results: Array<{ game: Game; formId: number; isWild: boolean; isChainable: boolean; acquisitionMethod?: AcquisitionMethod }> = [];

  for (const call of calls) {
    const { name, params } = parseTemplateCall(call);
    if (name.endsWith("/None")) continue; // not obtainable in this version, by any means

    const isShadowPokemon = /shadow color/i.test(params.area ?? "");
    const versionLabels = [params.v, params.v2].filter((v): v is string =>
      Boolean(v),
    );
    const { formIds, wildByFormId, chainableByFormId, acquisitionMethodByFormId } = resolveFormIdsAndWildness(
      params.area ?? "",
      varieties,
      speciesName,
    );

    for (const label of versionLabels) {
      const games = BULBAPEDIA_LABEL_TO_GAMES[label];
      if (!games) continue; // game outside our Game enum (Mega Dimension, Café ReMix, etc.) — skip, don't guess
      for (const game of games) {
        // Colosseum/XD have opposite Shiny rules for Shadow Pokémon (see
        // this file's header) — only the genuinely-rollable category
        // counts as availability for each.
        if (game === "colosseum" && !isShadowPokemon) continue;
        if (game === "xd" && isShadowPokemon) continue;
        for (const formId of formIds) {
          results.push({
            game,
            formId,
            isWild: wildByFormId.get(formId) ?? true,
            isChainable: chainableByFormId.get(formId) ?? true,
            acquisitionMethod: acquisitionMethodByFormId.get(formId),
          });
        }
      }
    }
  }

  return results;
}

async function scrapeOneSpecies(
  species: FetchedSpecies,
): Promise<{ facts: AvailabilityFact[]; citation?: string }> {
  const section = await fetchNamedSection(
    `${species.displayName} (Pokémon)`,
    "Game locations",
  );
  if (!section) return { facts: [] };

  const hits = parseAvailability(section.wikitext, species.varieties, species.name);
  const byKey = new Map<string, AvailabilityFact>();
  for (const hit of hits) {
    const key = `${hit.formId}:${hit.game}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.isWild = existing.isWild || hit.isWild;
      existing.isChainable = existing.isChainable || hit.isChainable;
      existing.acquisitionMethod ??= hit.acquisitionMethod;
      continue;
    }
    byKey.set(key, {
      pokemonId: species.pokemonId,
      formId: hit.formId,
      game: hit.game,
      isWild: hit.isWild,
      isChainable: hit.isChainable,
      acquisitionMethod: hit.acquisitionMethod,
    });
  }
  return {
    facts: [...byKey.values()],
    citation: pageUrl(section.canonicalTitle),
  };
}

export async function runScrapeBulbapedia(): Promise<AvailabilityOutput> {
  const species = await readOutJson<FetchedSpecies[]>("species.json");
  const limiter = new ConcurrencyLimiter(6);
  const citations: Record<number, string> = {};
  const availability: AvailabilityFact[] = [];

  let done = 0;
  let missingPages = 0;
  await Promise.all(
    species.map(async (s) => {
      const { facts, citation } = await limiter.run(() => scrapeOneSpecies(s));
      if (citation) citations[s.pokemonId] = citation;
      else missingPages++;
      availability.push(...facts);
      done++;
      if (done % 100 === 0)
        console.log(`  scraped ${done}/${species.length} species`);
    }),
  );

  console.log(
    `scrapeBulbapedia: ${species.length - missingPages}/${species.length} pages resolved, ${availability.length} availability facts`,
  );
  if (missingPages > 0)
    console.log(
      `  ${missingPages} species had no resolvable "${"Game locations"}" page/section — left with no availability (source pending)`,
    );

  const output: AvailabilityOutput = { citations, availability };
  await writeOutJson("availability.json", output);
  return output;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runScrapeBulbapedia().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
