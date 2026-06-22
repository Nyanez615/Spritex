import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getPokemonList } from "@/lib/tauri";

export const Route = createFileRoute("/")({
  component: PokedexGrid,
});

function PokedexGrid() {
  const { data: pokemon, isLoading, error } = useQuery({
    queryKey: ["pokemon-list", {}],
    queryFn: () => getPokemonList({ search: null, generation: null, legendary_or_mythical_only: null }),
  });

  return (
    <div className="flex flex-col h-full w-full">
      <div className="h-14 flex items-center px-6 border-b border-border">
        <h1 className="text-base font-semibold text-foreground">Pokédex</h1>
      </div>
      <div className="flex-1 overflow-auto p-6">
        {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
        {error && <p className="text-destructive text-sm">{String(error)}</p>}
        {pokemon && pokemon.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No species yet — running in the browser preview (no Tauri backend), or the static
            database hasn't been seeded.
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
          {pokemon?.map((p) => (
            <Link
              key={`${p.id}-${p.form_id}`}
              to="/pokemon/$id"
              params={{ id: String(p.id) }}
              search={{ form: p.form_id }}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 transition-colors hover:bg-muted"
            >
              <img src={p.sprite_url} alt={p.display_name} className="h-16 w-16" />
              <span className="text-sm font-medium text-foreground">{p.display_name}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
