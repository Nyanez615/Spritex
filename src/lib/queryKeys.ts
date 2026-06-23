import type { QueryClient } from "@tanstack/react-query";
import type { DexGroupBy } from "./bindings/DexGroupBy";
import type { PokedexFilters } from "./bindings/PokedexFilters";

/**
 * Shared query-key builders so the collection/hunt mutations spread across
 * /pokemon/$id, /hunt, /quick-counter, and /dex invalidate the exact same
 * keys their sibling views read from — a typo'd literal key here would
 * silently leave another view stale.
 */
export const queryKeys = {
  pokemonList: (filters: PokedexFilters) => ["pokemon-list", filters] as const,
  pokemonDetail: (pokemonId: number, formId: number) => ["pokemon-detail", pokemonId, formId] as const,
  methodsForPokemon: (pokemonId: number, formId: number) =>
    ["methods-for-pokemon", pokemonId, formId] as const,
  collectionEntry: (pokemonId: number, formId: number) => ["collection-entry", pokemonId, formId] as const,
  activeHunts: ["active-hunts"] as const,
  livingDexStats: (groupBy: DexGroupBy) => ["living-dex-stats", groupBy] as const,
  allCollectionEntries: ["all-collection-entries"] as const,
  syncStatus: ["sync-status"] as const,
};

/** Every mutation that touches the `collection` table affects all three of these aggregate views. */
export function invalidateCollectionAggregates(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.activeHunts });
  queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "living-dex-stats" });
  queryClient.invalidateQueries({ queryKey: queryKeys.allCollectionEntries });
}
