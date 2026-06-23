import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RequireSync } from "@/components/SyncRequiredNotice";
import { usePokemonLookup } from "@/hooks/usePokemonLookup";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { invalidateCollectionAggregates, queryKeys } from "@/lib/queryKeys";
import { getActiveHunts, incrementCounter } from "@/lib/tauri";

export const Route = createFileRoute("/quick-counter")({
  component: QuickCounter,
});

function QuickCounter() {
  const queryClient = useQueryClient();
  const pokemonById = usePokemonLookup();
  const [index, setIndex] = useState(0);
  const { isConfigured: isSyncConfigured, isLoading: syncLoading } =
    useSyncStatus();

  const { data: hunts, isLoading } = useQuery({
    queryKey: queryKeys.activeHunts,
    queryFn: () => getActiveHunts(),
    enabled: isSyncConfigured,
  });

  useEffect(() => {
    if (hunts && index >= hunts.length) setIndex(Math.max(0, hunts.length - 1));
  }, [hunts, index]);

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
    onSuccess: (data) => {
      queryClient.setQueryData(
        queryKeys.collectionEntry(data.pokemon_id, data.form_id),
        data,
      );
      invalidateCollectionAggregates(queryClient);
    },
  });

  const safeHunts = hunts ?? [];
  const entry = safeHunts[index];
  const p = entry
    ? pokemonById.get(`${entry.pokemon_id}-${entry.form_id}`)
    : undefined;

  return (
    <RequireSync isConfigured={isSyncConfigured} isLoading={syncLoading}>
      {isLoading ? (
        <CenteredMessage text="Loading…" />
      ) : !entry ? (
        <CenteredMessage text="No active hunts yet — mark a Pokémon as “Hunting” from its detail page." />
      ) : (
        <div className="flex flex-col h-full w-full">
          <div className="h-14 flex items-center justify-center px-6 border-b border-border">
            <h1 className="text-base font-semibold text-foreground">
              Quick Counter
            </h1>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon-lg"
                disabled={safeHunts.length < 2}
                onClick={() =>
                  setIndex((i) => (i - 1 + safeHunts.length) % safeHunts.length)
                }
              >
                <ChevronLeft className="size-6" />
              </Button>

              <div className="flex flex-col items-center gap-2 w-56">
                {p?.sprite_url && (
                  <img src={p.sprite_url} alt="" className="h-28 w-28" />
                )}
                <span className="text-lg font-semibold text-foreground">
                  {p?.display_name ?? `#${entry.pokemon_id}`}
                </span>
                <span className="text-5xl font-bold text-foreground tabular-nums">
                  {entry.encounter_count}
                </span>
                <span className="text-xs text-muted-foreground">
                  {index + 1} of {safeHunts.length}
                </span>
              </div>

              <Button
                variant="ghost"
                size="icon-lg"
                disabled={safeHunts.length < 2}
                onClick={() => setIndex((i) => (i + 1) % safeHunts.length)}
              >
                <ChevronRight className="size-6" />
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
              {([1, 10, 100] as const).map((amount) => (
                <Button
                  key={amount}
                  size="lg"
                  className="h-20 text-xl"
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
        </div>
      )}
    </RequireSync>
  );
}

function CenteredMessage({ text }: { text: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <p className="text-sm text-muted-foreground text-center max-w-xs">
        {text}
      </p>
    </div>
  );
}
