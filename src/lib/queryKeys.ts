import type { QueryClient } from "@tanstack/react-query";
import type { DexGroupBy } from "./bindings/DexGroupBy";

/**
 * Shared query-key builders so the collection/hunt mutations spread across
 * /pokemon/$id, /hunt, /quick-counter, and /dex invalidate the exact same
 * keys their sibling views read from — a typo'd literal key here would
 * silently leave another view stale.
 */
export const queryKeys = {
  pokemonDetail: (pokemonId: number, formId: number) => ["pokemon-detail", pokemonId, formId] as const,
  methodsForPokemon: (pokemonId: number, formId: number) =>
    ["methods-for-pokemon", pokemonId, formId] as const,
  collectionEntry: (pokemonId: number, formId: number) => ["collection-entry", pokemonId, formId] as const,
  activeHunts: ["active-hunts"] as const,
  livingDexStats: (groupBy: DexGroupBy) => ["living-dex-stats", groupBy] as const,
  syncStatus: ["sync-status"] as const,
};

/** Every mutation that touches the `collection` table affects both of these aggregate views. */
export function invalidateCollectionAggregates(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.activeHunts });
  queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "living-dex-stats" });
}
