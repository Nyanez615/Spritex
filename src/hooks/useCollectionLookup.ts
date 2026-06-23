import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getAllCollectionEntries, type CollectionEntry } from "@/lib/tauri";

/**
 * The Pokédex grid's per-card status badges need every collection row keyed
 * by pokemon_id+form_id without an N+1 fetch per card — mirrors
 * usePokemonLookup's fetch-once-then-Map-build pattern exactly.
 */
export function useCollectionLookup() {
  const { data: entries } = useQuery({
    queryKey: queryKeys.allCollectionEntries,
    queryFn: getAllCollectionEntries,
  });

  return useMemo(() => {
    const map = new Map<string, CollectionEntry>();
    for (const e of entries ?? []) {
      map.set(`${e.pokemon_id}-${e.form_id}`, e);
    }
    return map;
  }, [entries]);
}
