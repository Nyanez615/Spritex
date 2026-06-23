import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { RequireSync } from "@/components/SyncRequiredNotice";
import { usePokemonLookup } from "@/hooks/usePokemonLookup";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { formatOdds } from "@/lib/format";
import { GAME_LABELS, methodLabel } from "@/lib/labels";
import { invalidateCollectionAggregates, queryKeys } from "@/lib/queryKeys";
import {
  getActiveHunts,
  getBestMethod,
  incrementCounter,
  resetHunt,
  toggleChecklist,
  type ChecklistField,
  type CollectionEntry,
} from "@/lib/tauri";

export const Route = createFileRoute("/hunt")({
  component: HuntDashboard,
});

function HuntDashboard() {
  const queryClient = useQueryClient();
  const pokemonById = usePokemonLookup();
  const { isConfigured: isSyncConfigured, isLoading: syncLoading } =
    useSyncStatus();

  const { data: hunts, isLoading } = useQuery({
    queryKey: queryKeys.activeHunts,
    queryFn: () => getActiveHunts(),
    enabled: isSyncConfigured,
  });

  const bestMethodQueries = useQueries({
    queries: useMemo(
      () =>
        (hunts ?? []).map((h) => ({
          queryKey: ["best-method", h.pokemon_id, h.form_id],
          queryFn: () => getBestMethod(h.pokemon_id, h.form_id),
        })),
      [hunts],
    ),
  });

  const onMutationSuccess = (data: CollectionEntry) => {
    queryClient.setQueryData(
      queryKeys.collectionEntry(data.pokemon_id, data.form_id),
      data,
    );
    invalidateCollectionAggregates(queryClient);
  };

  const counterMutation = useMutation({
    mutationFn: ({
      pokemonId,
      formId,
      amount,
    }: {
      pokemonId: number;
      formId: number;
      amount: 1 | 10 | 100;
    }) => incrementCounter(pokemonId, formId, amount),
    onSuccess: onMutationSuccess,
  });
  const checklistMutation = useMutation({
    mutationFn: ({
      pokemonId,
      formId,
      field,
      value,
    }: {
      pokemonId: number;
      formId: number;
      field: ChecklistField;
      value: boolean;
    }) => toggleChecklist(pokemonId, formId, field, value),
    onSuccess: onMutationSuccess,
  });
  const resetMutation = useMutation({
    mutationFn: ({
      pokemonId,
      formId,
    }: {
      pokemonId: number;
      formId: number;
    }) => resetHunt(pokemonId, formId),
    onSuccess: onMutationSuccess,
  });

  return (
    <RequireSync isConfigured={isSyncConfigured} isLoading={syncLoading}>
      <div className="flex flex-col h-full w-full">
        <div className="h-14 flex items-center px-6 border-b border-border">
          <h1 className="text-base font-semibold text-foreground">Hunt</h1>
          <span className="ml-auto text-xs text-muted-foreground">
            {hunts?.length ?? 0} active
          </span>
        </div>
        <div className="flex-1 overflow-auto p-6">
          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {!isLoading && (hunts?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">
              No active hunts — mark a Pokémon as "Hunting" from its detail page
              to start tracking it here.
            </p>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {hunts?.map((entry, i) => {
              const p = pokemonById.get(`${entry.pokemon_id}-${entry.form_id}`);
              const best = bestMethodQueries[i]?.data;
              return (
                <Card key={entry.id}>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      {p?.sprite_url && (
                        <img src={p.sprite_url} alt="" className="size-10" />
                      )}
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/pokemon/$id"
                          params={{ id: String(entry.pokemon_id) }}
                          search={{ form: entry.form_id }}
                          className="font-medium text-foreground hover:underline"
                        >
                          {p?.display_name ?? `#${entry.pokemon_id}`}
                        </Link>
                        {best && (
                          <p className="text-xs text-muted-foreground">
                            Best: {GAME_LABELS[best.game]} ·{" "}
                            {methodLabel(best)} ·{" "}
                            {formatOdds(
                              entry.has_shiny_charm
                                ? best.odds_charm
                                : best.odds_base,
                            )}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          resetMutation.mutate({
                            pokemonId: entry.pokemon_id,
                            formId: entry.form_id,
                          })
                        }
                      >
                        <RotateCcw className="size-3.5" /> Reset
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Encounters
                      </span>
                      <span className="text-lg font-semibold text-foreground tabular-nums">
                        {entry.encounter_count}
                      </span>
                      <div className="ml-auto flex items-center gap-1.5">
                        {([1, 10, 100] as const).map((amount) => (
                          <Button
                            key={amount}
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              counterMutation.mutate({
                                pokemonId: entry.pokemon_id,
                                formId: entry.form_id,
                                amount,
                              })
                            }
                          >
                            +{amount}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap">
                      {(
                        [
                          ["has_shiny_charm", "Shiny Charm"],
                          ["sandwich_active", "Sandwich"],
                          ["outbreak_active", "Outbreak"],
                        ] as const
                      ).map(([field, label]) => (
                        <label
                          key={field}
                          className="flex items-center gap-1.5 text-sm text-muted-foreground"
                        >
                          <Switch
                            size="sm"
                            checked={entry[field]}
                            onCheckedChange={(value) =>
                              checklistMutation.mutate({
                                pokemonId: entry.pokemon_id,
                                formId: entry.form_id,
                                field: field as ChecklistField,
                                value,
                              })
                            }
                          />
                          {label}
                        </label>
                      ))}
                      {entry.chain_count > 0 && (
                        <Badge variant="outline">
                          Chain ×{entry.chain_count}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </RequireSync>
  );
}
