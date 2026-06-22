import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { queryKeys } from "@/lib/queryKeys";
import { getLivingDexStats, type DexGroupBy } from "@/lib/tauri";

export const Route = createFileRoute("/dex")({
  component: LivingDex,
});

const GENERATION_LABELS: Record<string, string> = {
  "1": "Gen 1 — Kanto",
  "2": "Gen 2 — Johto",
  "3": "Gen 3 — Hoenn",
  "4": "Gen 4 — Sinnoh",
  "5": "Gen 5 — Unova",
  "6": "Gen 6 — Kalos",
  "7": "Gen 7 — Alola",
  "8": "Gen 8 — Galar/Hisui",
  "9": "Gen 9 — Paldea",
};

function LivingDex() {
  const [groupBy, setGroupBy] = useState<DexGroupBy>("generation");

  const { data: buckets, isLoading } = useQuery({
    queryKey: queryKeys.livingDexStats(groupBy),
    queryFn: () => getLivingDexStats(groupBy),
  });

  const totals =
    groupBy === "generation"
      ? (buckets ?? []).reduce((acc, b) => ({ caught: acc.caught + b.caught, total: acc.total + b.total }), {
          caught: 0,
          total: 0,
        })
      : null;

  return (
    <div className="flex flex-col h-full w-full">
      <div className="h-14 flex items-center px-6 border-b border-border gap-3">
        <h1 className="text-base font-semibold text-foreground">Living Dex</h1>
        <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as DexGroupBy)} className="ml-2">
          <TabsList>
            <TabsTrigger value="generation">By Generation</TabsTrigger>
            <TabsTrigger value="type">By Type</TabsTrigger>
          </TabsList>
        </Tabs>
        {totals && (
          <span className="ml-auto text-xs text-muted-foreground">
            {totals.caught} / {totals.total} shiny caught overall
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto p-6">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
          {buckets?.map((b) => {
            const pct = b.total > 0 ? Math.round((b.caught / b.total) * 100) : 0;
            return (
              <div key={b.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground capitalize">
                    {groupBy === "generation" ? GENERATION_LABELS[b.label] ?? `Gen ${b.label}` : b.label}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {b.caught}/{b.total}
                  </span>
                </div>
                <Progress value={pct} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
