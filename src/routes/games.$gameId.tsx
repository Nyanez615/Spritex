import { useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { GenerationBadge } from "@/components/GenerationBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePokemonLookup } from "@/hooks/usePokemonLookup";
import { formatOdds } from "@/lib/format";
import { GAME_LABELS, GAME_ORDER, methodLabel } from "@/lib/labels";
import { getMethodsForGame, type Game } from "@/lib/tauri";

export const Route = createFileRoute("/games/$gameId")({
  component: GameBrowseView,
});

function isGame(value: string): value is Game {
  return (GAME_ORDER as string[]).includes(value);
}

function GameBrowseView() {
  const { gameId } = Route.useParams();
  const navigate = useNavigate();
  const game: Game = isGame(gameId) ? gameId : "sv";

  const { byKey: pokemonById } = usePokemonLookup();
  const { data: methods, isLoading } = useQuery({
    queryKey: ["methods-for-game", game],
    queryFn: () => getMethodsForGame(game),
  });

  const sorted = useMemo(
    () => [...(methods ?? [])].sort((a, b) => a.odds_optimized - b.odds_optimized),
    [methods],
  );

  return (
    <div className="flex flex-col h-full w-full">
      <div className="h-14 flex items-center px-6 border-b border-border gap-3">
        <h1 className="text-base font-semibold text-foreground">Games</h1>
        <Select value={game} onValueChange={(v) => navigate({ to: "/games/$gameId", params: { gameId: v } })}>
          <SelectTrigger size="sm" className="ml-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GAME_ORDER.map((g) => (
              <SelectItem key={g} value={g}>
                <span className="flex items-center gap-1.5">
                  <GenerationBadge game={g} />
                  {GAME_LABELS[g]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">{sorted.length} huntable species</span>
      </div>
      <div className="flex-1 overflow-auto p-6">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && sorted.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No shiny methods recorded for {GAME_LABELS[game]} yet — either nothing in this game
            is shiny-locked-free, or availability isn't confirmed (source pending).
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sorted.map((m) => {
            const p = pokemonById.get(`${m.pokemon_id}-${m.form_id}`);
            return (
              <Card
                key={m.id}
                className="hover:bg-muted transition-colors cursor-pointer"
                onClick={() =>
                  navigate({
                    to: "/pokemon/$id",
                    params: { id: String(m.pokemon_id) },
                    search: { form: m.form_id },
                  })
                }
              >
                <CardContent className="flex items-center gap-3">
                  {p?.sprite_url && <img src={p.sprite_url} alt="" className="size-10 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-foreground truncate">
                        {p?.display_name ?? `#${m.pokemon_id}`}
                      </span>
                      {m.is_best_method && <Badge>Best</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{methodLabel(m)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-foreground">{formatOdds(m.odds_optimized)}</p>
                    {m.requires_transfer && (
                      <p className="text-[10px] text-muted-foreground">Transfer required</p>
                    )}
                  </div>
                  <a
                    href={m.citation_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
