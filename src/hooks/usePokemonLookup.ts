import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getPokemonList, type Pokemon } from "@/lib/tauri";

const NO_FILTERS = { search: null, generation: null, legendary_or_mythical_only: null };

/**
 * shiny_methods/collection rows only carry pokemon_id/form_id — every view
 * that needs to render a name/sprite alongside one of those rows (table,
 * games browse, hunt dashboard, quick counter) joins against this lookup
 * in JS rather than duplicating the fetch-and-Map-build per view.
 *
 * Also exposes the same list as `ordered` (the Rust query's own `(id,
 * form_id)` order, a Map loses that) — the detail page's next/prev
 * navigation reuses it rather than fetching/sorting the list separately.
 */
export function usePokemonLookup() {
  const { data: pokemonList } = useQuery({
    queryKey: queryKeys.pokemonList(NO_FILTERS),
    queryFn: () => getPokemonList(NO_FILTERS),
  });

  return useMemo(() => {
    const byKey = new Map<string, Pokemon>();
    for (const p of pokemonList ?? []) {
      byKey.set(`${p.id}-${p.form_id}`, p);
    }
    return { byKey, ordered: pokemonList ?? [] };
  }, [pokemonList]);
}
