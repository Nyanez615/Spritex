/**
 * Derives is_final_evolution per species by walking PokéAPI's evolution-chain
 * tree. Dedupes by chain URL first — most chains are shared by 2-3 species
 * (e.g. Bulbasaur/Ivysaur/Venusaur all point at the same chain), so this
 * fetches far fewer than one request per species.
 */
import { cachedJson, ConcurrencyLimiter, readOutJson, writeOutJson } from "./httpCache.js";
import type { FetchedSpecies } from "./fetchPokeapi.js";

interface PokeApiChainNode {
  species: { name: string; url: string };
  evolves_to: PokeApiChainNode[];
}

interface PokeApiEvolutionChain {
  chain: PokeApiChainNode;
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

export async function runFetchEvolutionChains(): Promise<number[]> {
  const species = await readOutJson<FetchedSpecies[]>("species.json");
  const chainUrls = new Set(species.map((s) => s.evolutionChainUrl));
  console.log(`fetchEvolutionChains: ${chainUrls.size} unique chains for ${species.length} species`);

  const limiter = new ConcurrencyLimiter(8);
  const finalEvolutionIds = new Set<number>();
  let done = 0;
  await Promise.all(
    Array.from(chainUrls).map(async (url) => {
      const chain = await limiter.run(() => cachedJson<PokeApiEvolutionChain>("pokeapi-evolution-chain", chainIdFromUrl(url), url));
      collectFinalEvolutions(chain.chain, finalEvolutionIds);
      done++;
      if (done % 100 === 0) console.log(`  fetched ${done}/${chainUrls.size} chains`);
    }),
  );

  const result = Array.from(finalEvolutionIds).sort((a, b) => a - b);
  await writeOutJson("final-evolutions.json", result);
  console.log(`fetchEvolutionChains: ${result.length} species are final evolutions, wrote out/final-evolutions.json`);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFetchEvolutionChains().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
