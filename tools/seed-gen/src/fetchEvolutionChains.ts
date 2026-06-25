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

  for (const child of node.evolves_to) {
    const childBareKey = nameIndex.get(child.species.name);
    for (const detail of child.evolution_details) {
      const fromKey = detail.base_form ? nameIndex.get(detail.base_form.name) : bareKey;
      const toKey = detail.evolved_form ? nameIndex.get(detail.evolved_form.name) : childBareKey;
      if (detail.base_form && !fromKey) unmatched.count++;
      if (detail.evolved_form && !toKey) unmatched.count++;
      upsert(out, chainId, fromKey, depth);
      upsert(out, chainId, toKey, depth + 1);
    }
    walkChain(child, depth + 1, chainId, nameIndex, speciesById, out, unmatched);
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
  const unmatched = { count: 0 };
  let done = 0;
  await Promise.all(
    Array.from(chainUrls).map(async (url) => {
      const chain = await limiter.run(() => cachedJson<PokeApiEvolutionChain>("pokeapi-evolution-chain", chainIdFromUrl(url), url));
      collectFinalEvolutions(chain.chain, finalEvolutionIds);
      const chainId = Number(chainIdFromUrl(url));
      walkChain(chain.chain, 0, chainId, nameIndex, speciesById, chainNodes, unmatched);
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

  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFetchEvolutionChains().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
