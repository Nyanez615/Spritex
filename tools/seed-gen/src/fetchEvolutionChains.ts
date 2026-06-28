/**
 * Derives is_final_evolution per species, AND a richer per-(pokemonId,formId)
 * evolution-chain membership table, by walking PokéAPI's evolution-chain
 * tree once per unique chain URL. Dedupes by chain URL first — most chains
 * are shared by 2-3 species (e.g. Bulbasaur/Ivysaur/Venusaur all point at the
 * same chain), so this fetches far fewer than one request per species.
 *
 * The chain tree's nodes are per-*species*, not per-*form* — regional-form
 * disambiguation lives entirely in each edge's optional evolution_details[]
 * base_form/evolved_form sub-fields. Verified live against two real
 * regional-form-diverging chains (Meowth: Kantonian/Alolan -> Persian,
 * Galarian -> Perrserker; Yamask: Kantonian -> Cofagrigus, Galarian ->
 * Runerigus) that PokéAPI always nests these as flat sibling children at the
 * correct tree depth — never a misleadingly nested deeper level — so a plain
 * depth-tracking recursive walk is correct, AS LONG AS both endpoints of
 * every edge are recorded (not just the child), since a regional form's own
 * stage-0 membership (e.g. Galarian Meowth) is only ever discoverable via the
 * base_form field of its outgoing edge, never from a tree node's bare species
 * name.
 */
import { cachedJson, ConcurrencyLimiter, readOutJson, writeOutJson } from "./httpCache.js";
import type { FetchedSpecies } from "./fetchPokeapi.js";

interface PokeApiChainNode {
  species: { name: string; url: string };
  evolves_to: PokeApiChainNode[];
  /** Describes the edge INTO this node — base_form/evolved_form disambiguate which variety of the parent/child species this specific entry applies to; absent on every entry for a non-regional-form chain. */
  evolution_details: Array<{ base_form?: { name: string }; evolved_form?: { name: string } }>;
}

interface PokeApiEvolutionChain {
  chain: PokeApiChainNode;
}

export interface EvolutionChainNode {
  chainId: number;
  pokemonId: number;
  formId: number;
  stage: number;
}

/**
 * One real "evolves into" relationship — the piece EvolutionChainNode's flat
 * stage-only membership can't express: two members can share a stage either
 * because they're PARALLEL (Rattata→Raticate and Alolan Rattata→Alolan
 * Raticate, two unrelated lines that happen to be the same depth) or because
 * one BRANCHES into several (Gloom→Vileplume and Gloom→Bellossom). Without
 * edges, the frontend's evolution-line chip row can't tell these apart and
 * a flat "all of stage N, then all of stage N+1" rendering reads as if every
 * stage-N member could lead to every stage-N+1 member — confirmed user-
 * reported confusion (Rattata's row read as if it could evolve into Alolan
 * Raticate). Built from the SAME per-detail loop EvolutionChainNode already
 * uses, so it's the same one source of truth, not a parallel computation
 * that could drift from it.
 */
export interface EvolutionEdge {
  chainId: number;
  fromPokemonId: number;
  fromFormId: number;
  toPokemonId: number;
  toFormId: number;
  /**
   * The specific cosmetic_forms `kind` the FROM individual must currently be
   * displaying for this edge to be this precise — null means "no specific
   * cosmetic form required" (true for the overwhelming majority of edges).
   * Burmy (#412) is the only confirmed case: its cloak is purely cosmetic
   * (no stat/type difference — confirmed Bug-type regardless, so it's
   * correctly NOT a tracked `pokemon` variety the way Wormadam's resulting
   * cloaks ARE), but Bulbapedia is explicit that the cloak deterministically
   * locks in which Wormadam cloak results: "When evolving into Wormadam,
   * its form determines the form of Wormadam it evolves into, which is
   * permanent" — a real, confirmed fact, unlike e.g. Gloom->Vileplume/
   * Bellossom's genuine player choice. See EVOLUTION_FROM_COSMETIC_KIND.
   * Purely a frontend labeling hint (e.g. show "Sandy Burmy" instead of
   * generic "Burmy" in the lane leading to Sandy Wormadam) — every edge here
   * is already a real, independently-reachable outcome regardless of this
   * field, so it never gates/filters anything.
   */
  fromCosmeticKind: string | null;
}

function speciesIdFromUrl(url: string): number {
  const match = url.match(/\/pokemon-species\/(\d+)\//);
  if (!match) throw new Error(`couldn't parse a species id out of evolution-chain species url: ${url}`);
  return Number(match[1]);
}

function chainIdFromUrl(url: string): string {
  const match = url.match(/\/evolution-chain\/(\d+)\//);
  if (!match) throw new Error(`couldn't parse a chain id out of evolution-chain url: ${url}`);
  return match[1];
}

/** A species with zero further evolutions is final — including species with no evolution line at all (a single-node chain). */
function collectFinalEvolutions(node: PokeApiChainNode, out: Set<number>): void {
  if (node.evolves_to.length === 0) {
    out.add(speciesIdFromUrl(node.species.url));
  }
  for (const child of node.evolves_to) {
    collectFinalEvolutions(child, out);
  }
}

type FormKey = { pokemonId: number; formId: number };

function buildNameIndex(species: FetchedSpecies[]): Map<string, FormKey> {
  const index = new Map<string, FormKey>();
  for (const s of species) {
    for (const v of s.varieties) {
      index.set(v.apiPokemonName, { pokemonId: s.pokemonId, formId: v.formId });
    }
    // The chain tree's node.species.name is always the bare PokéAPI SPECIES
    // slug, which differs from the default variety's own pokemon-resource
    // name for forme-changing species (e.g. species "aegislash"'s default
    // variety is named "aegislash-shield", "deoxys"'s is "deoxys-normal") —
    // confirmed live for 37 such species. Index the bare species name too,
    // pointing at the default (formId 0) variety, so node.species.name
    // lookups (and the evolved_form-absent fallback, which also reads
    // child.species.name) always resolve regardless of which namespace
    // PokéAPI happens to use for a given species' default variety. A no-op
    // overwrite for the common case where the two names already coincide.
    index.set(s.name, { pokemonId: s.pokemonId, formId: 0 });
  }
  return index;
}

function upsert(out: Map<string, EvolutionChainNode>, chainId: number, key: FormKey | undefined, stage: number): void {
  if (!key) return;
  const mapKey = `${chainId}:${key.pokemonId}:${key.formId}`;
  const existing = out.get(mapKey);
  if (!existing || stage < existing.stage) {
    out.set(mapKey, { chainId, pokemonId: key.pokemonId, formId: key.formId, stage });
  }
}

/** Every tracked variety of key's species — falls back to [key] itself if the species has no variety list (shouldn't happen, defensive only). */
function varietiesOf(key: FormKey, speciesById: Map<number, FetchedSpecies>): FormKey[] {
  const species = speciesById.get(key.pokemonId);
  if (!species || species.varieties.length === 0) return [key];
  return species.varieties.map((v) => ({ pokemonId: species.pokemonId, formId: v.formId }));
}

function formNameOf(key: FormKey, speciesById: Map<number, FetchedSpecies>): string | null {
  return speciesById.get(key.pokemonId)?.varieties.find((v) => v.formId === key.formId)?.formName ?? null;
}

function apiNameOf(key: FormKey, speciesById: Map<number, FetchedSpecies>): string | null {
  return speciesById.get(key.pokemonId)?.varieties.find((v) => v.formId === key.formId)?.apiPokemonName ?? null;
}

/**
 * Maps an evolved variety's apiPokemonName to the specific cosmetic_forms
 * `kind` its FROM individual must currently be displaying — see
 * EvolutionEdge.fromCosmeticKind's own doc comment for the full reasoning.
 * Wormadam's Plant Cloak (the default/bare variety) deliberately has no
 * entry here — Plant isn't a tracked cosmetic_forms kind at all (it's just
 * Burmy's bare, undecorated default sprite), so there's nothing to look up;
 * its edge correctly keeps fromCosmeticKind: null, same as Mothim's (a real
 * fact too: any Burmy cloak can become Mothim, only gender matters there).
 */
const EVOLUTION_FROM_COSMETIC_KIND: Record<string, string> = {
  "wormadam-sandy": "sandy",
  "wormadam-trash": "trash",
};

/**
 * Varieties that share a chain_id (and, for Partner Pikachu/Eevee, an
 * undisambiguated PokéAPI evolution_details entry) with their species'
 * normally-evolving siblings, but confirmed via Bulbapedia to have no real
 * "evolves into"/"evolves from" relationship at all — without this, the
 * ambiguous-fan-out logic below wires them into edges that don't exist in
 * the actual games:
 * - Partner Pikachu/Eevee ("Starter"): Bulbapedia's "Partner Pokémon"
 *   article — "they prefer ... to be out of their Poké Ball and have no
 *   interest in evolving"; they're also gift-only, never obtained by
 *   evolving a Pichu/pre-evolution. Confirmed live: without this exclusion,
 *   Partner Pikachu wrongly got both a Pichu->Partner Pikachu edge and
 *   Partner Pikachu->Raichu/Alolan Raichu edges, and Partner Eevee wrongly
 *   got edges to all 8 Eeveelutions.
 * - Bloodmoon Ursaluna ("Bloodmoon"): Bulbapedia's "Ursaluna" article —
 *   "unlike regular Ursaluna, it is not known to evolve into or from any
 *   other Pokémon" (it's a fixed individual found directly in Kitakami, not
 *   obtained by evolving any Ursaring). Confirmed live: without this
 *   exclusion, Ursaring wrongly got an edge to Bloodmoon Ursaluna alongside
 *   its real edge to regular Ursaluna.
 * - Eternal Floette ("Eternal"): does not evolve from Flabébé or into
 *   Florges — confirmed live that PokéAPI's evolution_details for this
 *   chain never references "floette-eternal" at all (neither base_form nor
 *   evolved_form on either edge), so without this exclusion the existing
 *   ambiguous-fan-out logic would wrongly wire it into both edges once it
 *   becomes a tracked variety (GROUP_A_FORM_NAMES' "eternal" entry).
 */
const EVOLUTION_EDGE_EXCLUDED_FORM_NAMES = new Set(["Starter", "Bloodmoon", "Eternal"]);

function isExcludedFromEvolutionEdges(key: FormKey, speciesById: Map<number, FetchedSpecies>): boolean {
  const formName = formNameOf(key, speciesById);
  return formName !== null && EVOLUTION_EDGE_EXCLUDED_FORM_NAMES.has(formName);
}

/**
 * Manual base_form overrides for the rare case where Bulbapedia documents a
 * real ability-gated evolution outcome that PokéAPI's own evolution_details
 * never encodes at all (confirmed live: every Rockruff->Lycanroc detail
 * sets only `evolved_form`, keyed by time_of_day — none of the 3 ever sets
 * `base_form`, so the generic disambiguation-aware fan-out above has
 * nothing to disambiguate from). Bulbapedia's own Rockruff article: Rockruff
 * with Keen Eye/Vital Spirit/Steadfast evolve into Midday or Midnight
 * Lycanroc; only the separate Own Tempo Rockruff evolves into Dusk Lycanroc.
 * Keyed by the evolved variety's apiPokemonName, since that's the one
 * unambiguous fact PokéAPI's `evolved_form` field already gives us per
 * detail. The same precedent rosterFacts.ts already sets for real facts
 * PokéAPI's structured data can't express — small, explicit, cited, not a
 * generalized mechanism, since this is currently the only known case.
 */
const EVOLUTION_BASE_FORM_OVERRIDES: Record<string, string> = {
  "lycanroc-dusk": "rockruff-own-tempo",
};

/**
 * Records one real evolves-into relationship per evolution_details entry —
 * the same per-detail loop that already feeds `upsert` above, so this can
 * never drift from EvolutionChainNode's own stage data.
 *
 * `fromAmbiguous`/`toAmbiguous` mean "this side's base_form/evolved_form is
 * absent AND no OTHER detail for the same parent/child disambiguates that
 * side either" — i.e. genuinely nobody specifies which variety, not just
 * "this one entry happens not to." Confirmed critical via Rattata: its
 * Kantonian-path detail has base_form=null too, but a SECOND detail
 * explicitly covers the Alolan path — so the first detail's silence means
 * "the leftover default (Kantonian) only," not "every Rattata variety." An
 * earlier version of this function treated EVERY null base_form/evolved_form
 * as "fan out to every variety" and produced a wrong cross-connection
 * (Rattata AND Alolan Rattata both wired to BOTH Raticate forms) — caught by
 * checking the derived edges against this exact case before shipping.
 *
 * When BOTH sides are genuinely ambiguous with more than one option each
 * (confirmed real: Pumpkaboo→Gourgeist, one shared undisambiguated detail,
 * 4 sizes on each side), don't guess a cartesian product — pair same-named
 * varieties (formName "Small" -> "Small") instead, which PokéAPI's
 * consistent per-species variety ordering makes correct without assuming
 * index correspondence directly. A from-variety with no same-named
 * counterpart gets no edge rather than a guessed one.
 */
function recordEdge(
  edges: EvolutionEdge[],
  chainId: number,
  fromKey: FormKey | undefined,
  toKey: FormKey | undefined,
  fromAmbiguous: boolean,
  toAmbiguous: boolean,
  speciesById: Map<number, FetchedSpecies>,
): void {
  if (!fromKey || !toKey) return;
  const fromOptions = (fromAmbiguous ? varietiesOf(fromKey, speciesById) : [fromKey]).filter(
    (k) => !isExcludedFromEvolutionEdges(k, speciesById),
  );
  const toOptions = (toAmbiguous ? varietiesOf(toKey, speciesById) : [toKey]).filter(
    (k) => !isExcludedFromEvolutionEdges(k, speciesById),
  );

  if (fromOptions.length > 1 && toOptions.length > 1) {
    for (const from of fromOptions) {
      const fromName = formNameOf(from, speciesById);
      const to = toOptions.find((t) => formNameOf(t, speciesById) === fromName);
      if (to) {
        const toApiName = apiNameOf(to, speciesById);
        edges.push({
          chainId, fromPokemonId: from.pokemonId, fromFormId: from.formId, toPokemonId: to.pokemonId, toFormId: to.formId,
          fromCosmeticKind: (toApiName && EVOLUTION_FROM_COSMETIC_KIND[toApiName]) ?? null,
        });
      }
    }
    return;
  }
  for (const from of fromOptions) {
    for (const to of toOptions) {
      const toApiName = apiNameOf(to, speciesById);
      edges.push({
        chainId, fromPokemonId: from.pokemonId, fromFormId: from.formId, toPokemonId: to.pokemonId, toFormId: to.formId,
        fromCosmeticKind: (toApiName && EVOLUTION_FROM_COSMETIC_KIND[toApiName]) ?? null,
      });
    }
  }
}

/**
 * Records both endpoints of every edge (see file header), AND seeds every
 * other tracked variety of the current node's own species at this same
 * depth. The second part generalizes what was originally a root-only
 * special case (Tauros: a chain root with zero evolution edges at all,
 * whose 3 Paldean breeds were invisible to the edge-driven walk) — but
 * Wormadam's Sandy/Trash Cloak, Gourgeist's Small/Large/Super, and
 * Meowstic/Basculegion/Oinkologne's Female all hit the exact same gap
 * *mid-chain*, not just at the root (their evolution edge in/out doesn't
 * disambiguate by form at all, so the edge-driven walk alone only ever
 * discovers the bare/default variety) — confirmed empirically by the
 * pokemon/evolution_chains row-count mismatch this produced before this
 * fix. Doing it per-node, not just for the root, subsumes the original
 * special case entirely.
 */
function walkChain(
  node: PokeApiChainNode,
  depth: number,
  chainId: number,
  nameIndex: Map<string, FormKey>,
  speciesById: Map<number, FetchedSpecies>,
  out: Map<string, EvolutionChainNode>,
  edges: EvolutionEdge[],
  unmatched: { count: number },
): void {
  const bareKey = nameIndex.get(node.species.name);
  if (!bareKey) unmatched.count++;
  upsert(out, chainId, bareKey, depth);
  const species = bareKey && speciesById.get(bareKey.pokemonId);
  if (species) {
    for (const v of species.varieties) {
      upsert(out, chainId, { pokemonId: species.pokemonId, formId: v.formId }, depth);
    }
  }

  // Whether ANY child's edge disambiguates the parent side at all (across
  // every child, not just the one currently being processed) — Meowth's
  // Galarian->Perrserker edge specifies base_form, so Persian's own
  // undisambiguated detail means "the leftover default (Kantonian) only,"
  // not "every Meowth variety." Computed once per node, used by every child.
  // A detail covered by EVOLUTION_BASE_FORM_OVERRIDES counts as disambiguated
  // too, the same as if PokéAPI's own base_form had been set (Rockruff's
  // Dusk-Lycanroc detail disambiguates the parent just as much as a real
  // base_form would — see the override's own comment for why PokéAPI never
  // sets one here).
  const anyFromDisambiguated = node.evolves_to.some((child) =>
    child.evolution_details.some((d) => d.base_form || (d.evolved_form && EVOLUTION_BASE_FORM_OVERRIDES[d.evolved_form.name])),
  );

  for (const child of node.evolves_to) {
    const childBareKey = nameIndex.get(child.species.name);
    const anyToDisambiguated = child.evolution_details.some((d) => d.evolved_form);
    for (const detail of child.evolution_details) {
      const overrideBaseFormName = detail.evolved_form && EVOLUTION_BASE_FORM_OVERRIDES[detail.evolved_form.name];
      const fromKey = detail.base_form
        ? nameIndex.get(detail.base_form.name)
        : overrideBaseFormName
          ? nameIndex.get(overrideBaseFormName)
          : bareKey;
      const toKey = detail.evolved_form ? nameIndex.get(detail.evolved_form.name) : childBareKey;
      if (detail.base_form && !fromKey) unmatched.count++;
      if (overrideBaseFormName && !fromKey) unmatched.count++;
      if (detail.evolved_form && !toKey) unmatched.count++;
      upsert(out, chainId, fromKey, depth);
      upsert(out, chainId, toKey, depth + 1);
      const fromAmbiguous = !detail.base_form && !overrideBaseFormName && !anyFromDisambiguated;
      const toAmbiguous = !detail.evolved_form && !anyToDisambiguated;
      recordEdge(edges, chainId, fromKey, toKey, fromAmbiguous, toAmbiguous, speciesById);
    }
    walkChain(child, depth + 1, chainId, nameIndex, speciesById, out, edges, unmatched);
  }
}

export async function runFetchEvolutionChains(): Promise<number[]> {
  const species = await readOutJson<FetchedSpecies[]>("species.json");
  const nameIndex = buildNameIndex(species);
  const speciesById = new Map(species.map((s) => [s.pokemonId, s]));
  const chainUrls = new Set(species.map((s) => s.evolutionChainUrl));
  console.log(`fetchEvolutionChains: ${chainUrls.size} unique chains for ${species.length} species`);

  const limiter = new ConcurrencyLimiter(8);
  const finalEvolutionIds = new Set<number>();
  const chainNodes = new Map<string, EvolutionChainNode>();
  const allEdges: EvolutionEdge[] = [];
  const unmatched = { count: 0 };
  let done = 0;
  await Promise.all(
    Array.from(chainUrls).map(async (url) => {
      const chain = await limiter.run(() => cachedJson<PokeApiEvolutionChain>("pokeapi-evolution-chain", chainIdFromUrl(url), url));
      collectFinalEvolutions(chain.chain, finalEvolutionIds);
      const chainId = Number(chainIdFromUrl(url));
      walkChain(chain.chain, 0, chainId, nameIndex, speciesById, chainNodes, allEdges, unmatched);
      done++;
      if (done % 100 === 0) console.log(`  fetched ${done}/${chainUrls.size} chains`);
    }),
  );
  if (unmatched.count > 0) {
    console.log(`  fetchEvolutionChains: ${unmatched.count} evolution-chain species/base_form/evolved_form references didn't match a tracked variety (skipped, not guessed)`);
  }

  const result = Array.from(finalEvolutionIds).sort((a, b) => a - b);
  await writeOutJson("final-evolutions.json", result);
  console.log(`fetchEvolutionChains: ${result.length} species are final evolutions, wrote out/final-evolutions.json`);

  const nodes = Array.from(chainNodes.values()).sort((a, b) => a.chainId - b.chainId || a.pokemonId - b.pokemonId || a.formId - b.formId);
  await writeOutJson("evolution-chain-nodes.json", nodes);
  console.log(`fetchEvolutionChains: ${nodes.length} evolution-chain nodes, wrote out/evolution-chain-nodes.json`);

  // Dedup defensively (each chain is only walked once, but a single
  // evolution_details entry's fan-out could in principle repeat an edge
  // already produced by a different detail on the same call).
  const dedupedEdges = new Map<string, EvolutionEdge>();
  for (const edge of allEdges) {
    const key = `${edge.chainId}:${edge.fromPokemonId}:${edge.fromFormId}:${edge.toPokemonId}:${edge.toFormId}`;
    dedupedEdges.set(key, edge);
  }
  const edges = Array.from(dedupedEdges.values()).sort(
    (a, b) => a.chainId - b.chainId || a.fromPokemonId - b.fromPokemonId || a.fromFormId - b.fromFormId,
  );
  await writeOutJson("evolution-chain-edges.json", edges);
  console.log(`fetchEvolutionChains: ${edges.length} evolution-chain edges, wrote out/evolution-chain-edges.json`);

  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFetchEvolutionChains().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
