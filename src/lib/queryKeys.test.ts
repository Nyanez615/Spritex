import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { invalidateCollectionAggregates, queryKeys } from "./queryKeys";

describe("queryKeys", () => {
  it("builds pokemonDetail as a stable tuple", () => {
    expect(queryKeys.pokemonDetail(1, 0)).toEqual(["pokemon-detail", 1, 0]);
  });

  it("builds methodsForPokemon as a stable tuple", () => {
    expect(queryKeys.methodsForPokemon(25, 1)).toEqual(["methods-for-pokemon", 25, 1]);
  });

  it("builds collectionEntry as a stable tuple", () => {
    expect(queryKeys.collectionEntry(490, 0)).toEqual(["collection-entry", 490, 0]);
  });

  it("builds livingDexStats keyed by groupBy", () => {
    expect(queryKeys.livingDexStats("generation")).toEqual(["living-dex-stats", "generation"]);
    expect(queryKeys.livingDexStats("type")).toEqual(["living-dex-stats", "type"]);
  });

  it("exposes static keys for activeHunts, allCollectionEntries, and syncStatus", () => {
    expect(queryKeys.activeHunts).toEqual(["active-hunts"]);
    expect(queryKeys.allCollectionEntries).toEqual(["all-collection-entries"]);
    expect(queryKeys.syncStatus).toEqual(["sync-status"]);
  });
});

describe("invalidateCollectionAggregates", () => {
  it("invalidates activeHunts, every living-dex-stats variant, and allCollectionEntries", () => {
    const invalidateQueries = vi.fn();
    const queryClient = { invalidateQueries } as unknown as QueryClient;

    invalidateCollectionAggregates(queryClient);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.activeHunts });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.allCollectionEntries });
    expect(invalidateQueries).toHaveBeenCalledWith({ predicate: expect.any(Function) });

    // The predicate must match any living-dex-stats query key regardless of groupBy.
    const predicateCall = invalidateQueries.mock.calls.find((call) => "predicate" in call[0]);
    const predicate = predicateCall![0].predicate as (q: { queryKey: unknown[] }) => boolean;
    expect(predicate({ queryKey: ["living-dex-stats", "generation"] })).toBe(true);
    expect(predicate({ queryKey: ["living-dex-stats", "type"] })).toBe(true);
    expect(predicate({ queryKey: ["active-hunts"] })).toBe(false);
  });
});
