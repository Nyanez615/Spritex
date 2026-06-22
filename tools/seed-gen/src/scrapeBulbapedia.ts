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
 */
import type { FetchedSpecies, FetchedVariety } from "./fetchPokeapi.js";
import { BULBAPEDIA_LABEL_TO_GAMES, type Game } from "./gameMap.js";
import { ConcurrencyLimiter, readOutJson, writeOutJson } from "./httpCache.js";
import { fetchNamedSection, pageUrl } from "./mediawikiClient.js";
import { findTemplateCalls, parseTemplateCall } from "./wikitext.js";

export interface AvailabilityFact {
  pokemonId: number;
  formId: number;
  game: Game;
}

export interface AvailabilityOutput {
  citations: Record<number, string>;
  availability: AvailabilityFact[];
}

/**
 * Resolves one `'''...'''`-bolded form annotation (e.g. "Galarian Form",
 * "Kantonian Form", or Tauros's "Paldean Form (Combat Breed)"/"Paldean Form
 * (Combat and Blaze Breeds)") to the variety/varieties it refers to.
 *
 * Most species have at most one variety per region adjective, so matching
 * the adjective alone is enough. Paldean Tauros is the one species (so far)
 * where three varieties share the same adjective ("Paldean") and are
 * disambiguated only by a breed qualifier in parens — handled by checking
 * which candidate's displayName (e.g. "Paldean Tauros (Combat Breed)")
 * mentions a breed word also present in the annotation's parenthetical.
 */
function resolveAnnotation(boldText: string, varieties: FetchedVariety[]): number[] {
  const adjective = boldText.match(/^([A-Za-z]+) Form/)?.[1];
  if (!adjective) return [0]; // not a region-form annotation at all — treat as the base form

  const candidates = varieties.filter((v) => v.formName?.toLowerCase() === adjective.toLowerCase());
  if (candidates.length === 0) return [0]; // e.g. "Kantonian"/"Johtonian" — origin label for the untracked base form
  if (candidates.length === 1) return [candidates[0].formId];

  const breedMatches = candidates.filter((v) => {
    const breedWord = v.displayName.match(/\(([^)]+)\)/)?.[1]?.split(" ")[0];
    return breedWord && boldText.includes(breedWord);
  });
  // Can't disambiguate which of the shared-adjective varieties this refers
  // to (e.g. a generic "Paldean Form" with no breed parenthetical) — apply
  // to all of them rather than guessing one.
  return breedMatches.length > 0 ? breedMatches.map((v) => v.formId) : candidates.map((v) => v.formId);
}

function resolveFormIds(areaText: string, varieties: FetchedVariety[]): number[] {
  if (varieties.length <= 1) return [varieties[0]?.formId ?? 0];

  const segments = areaText.split(/<br\s*\/?>/i);
  const annotatedFormIds: number[] = [];
  let sawAnnotation = false;
  let sawUnannotatedContent = false;

  for (const segment of segments) {
    // matchAll, not match: a segment can carry more than one bold form
    // annotation without a <br> between them (no real example yet, but
    // nothing in the wikitext convention rules it out) — match() alone
    // would silently process only the first and drop the rest.
    const matches = [...segment.matchAll(/'''([^']+)'''/g)];
    if (matches.length > 0) {
      sawAnnotation = true;
      for (const match of matches) annotatedFormIds.push(...resolveAnnotation(match[1], varieties));
    } else if (segment.trim().length > 0) {
      sawUnannotatedContent = true;
    }
  }

  if (!sawAnnotation) return varieties.map((v) => v.formId);
  if (sawUnannotatedContent) annotatedFormIds.push(0);
  return [...new Set(annotatedFormIds)];
}

export function parseAvailability(wikitext: string, varieties: FetchedVariety[]): Array<{ game: Game; formId: number }> {
  const mainSection = wikitext.split("{{Availability/Footer}}")[0];
  const calls = findTemplateCalls(mainSection, "Availability/Entry");
  const results: Array<{ game: Game; formId: number }> = [];

  for (const call of calls) {
    const { name, params } = parseTemplateCall(call);
    if (name.endsWith("/None")) continue; // not obtainable in this version, by any means

    const versionLabels = [params.v, params.v2].filter((v): v is string => Boolean(v));
    const formIds = resolveFormIds(params.area ?? "", varieties);

    for (const label of versionLabels) {
      const games = BULBAPEDIA_LABEL_TO_GAMES[label];
      if (!games) continue; // game outside our 20-value enum (Colosseum, Legends: Z-A, etc.) — skip, don't guess
      for (const game of games) {
        for (const formId of formIds) results.push({ game, formId });
      }
    }
  }

  return results;
}

async function scrapeOneSpecies(species: FetchedSpecies): Promise<{ facts: AvailabilityFact[]; citation?: string }> {
  const section = await fetchNamedSection(`${species.displayName} (Pokémon)`, "Game locations");
  if (!section) return { facts: [] };

  const hits = parseAvailability(section.wikitext, species.varieties);
  const seen = new Set<string>();
  const facts: AvailabilityFact[] = [];
  for (const hit of hits) {
    const key = `${hit.formId}:${hit.game}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({ pokemonId: species.pokemonId, formId: hit.formId, game: hit.game });
  }
  return { facts, citation: pageUrl(section.canonicalTitle) };
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
      if (done % 100 === 0) console.log(`  scraped ${done}/${species.length} species`);
    })
  );

  console.log(`scrapeBulbapedia: ${species.length - missingPages}/${species.length} pages resolved, ${availability.length} availability facts`);
  if (missingPages > 0) console.log(`  ${missingPages} species had no resolvable "${"Game locations"}" page/section — left with no availability (source pending)`);

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
