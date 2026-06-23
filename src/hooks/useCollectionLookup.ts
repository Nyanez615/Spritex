import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { queryKeys } from "@/lib/queryKeys";
import { getAllCollectionEntries, type CollectionEntry } from "@/lib/tauri";

/**
 * The Pokédex grid's per-card status badges need every collection row keyed
 * by pokemon_id+form_id without an N+1 fetch per card — mirrors
 * usePokemonLookup's fetch-once-then-Map-build pattern exactly. Skips the
 * fetch entirely when sync isn't configured (it would just reject) rather
 * than firing a request already known to fail — badges simply don't show,
 * which is fine since the grid's core browse/filter function doesn't depend
 * on them.
 */
export function useCollectionLookup() {
  const { isConfigured } = useSyncStatus();
  const { data: entries } = useQuery({
    queryKey: queryKeys.allCollectionEntries,
    queryFn: getAllCollectionEntries,
    enabled: isConfigured,
  });

  return useMemo(() => {
    const map = new Map<string, CollectionEntry>();
    for (const e of entries ?? []) {
      map.set(`${e.pokemon_id}-${e.form_id}`, e);
    }
    return map;
  }, [entries]);
}
