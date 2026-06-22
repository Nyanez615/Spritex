import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { errorMessage, formatGenderRate, formatOdds, parseJsonArray } from "@/lib/format";
import { GAME_LABELS, METHOD_LABELS } from "@/lib/labels";
import { invalidateCollectionAggregates, queryKeys } from "@/lib/queryKeys";
import {
  getCollectionEntry,
  getMethodsForPokemon,
  getPokemonDetail,
  incrementCounter,
  markCaught,
  resetHunt,
  toggleChecklist,
  updateStatus,
  type ChecklistField,
  type CollectionEntry,
  type CollectionStatus,
  type ShinyMethod,
} from "@/lib/tauri";

export const Route = createFileRoute("/pokemon/$id")({
  component: PokemonDetail,
  validateSearch: (search: Record<string, unknown>): { form: number } => ({
    form: Number(search.form ?? 0) || 0,
  }),
});

const STATUS_LABELS: Record<CollectionStatus, string> = {
  not_started: "Not started",
  hunting: "Hunting",
  caught: "Caught",
};
const ALL_STATUSES: CollectionStatus[] = ["not_started", "hunting", "caught"];
const FALLBACK_ERROR = "Couldn't load this Pokémon — it may not exist in the static database.";

function PokemonDetail() {
  const { id } = Route.useParams();
  const { form } = Route.useSearch();
  const pokemonId = Number(id);
  const formId = form;
  const queryClient = useQueryClient();

  const {
    data: pokemon,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.pokemonDetail(pokemonId, formId),
    queryFn: () => getPokemonDetail(pokemonId, formId),
  });

  const { data: methods } = useQuery({
    queryKey: queryKeys.methodsForPokemon(pokemonId, formId),
    queryFn: () => getMethodsForPokemon(pokemonId, formId),
  });

  const { data: entry } = useQuery({
    queryKey: queryKeys.collectionEntry(pokemonId, formId),
    queryFn: () => getCollectionEntry(pokemonId, formId),
  });

  const onMutationSuccess = (data: CollectionEntry) => {
    queryClient.setQueryData(queryKeys.collectionEntry(pokemonId, formId), data);
    invalidateCollectionAggregates(queryClient);
  };

  const statusMutation = useMutation({
    mutationFn: (status: CollectionStatus) => updateStatus(pokemonId, formId, status),
    onSuccess: onMutationSuccess,
  });
  const counterMutation = useMutation({
    mutationFn: (amount: 1 | 10 | 100) => incrementCounter(pokemonId, formId, amount),
    onSuccess: onMutationSuccess,
  });
  const checklistMutation = useMutation({
    mutationFn: ({ field, value }: { field: ChecklistField; value: boolean }) =>
      toggleChecklist(pokemonId, formId, field, value),
    onSuccess: onMutationSuccess,
  });
  const resetMutation = useMutation({
    mutationFn: () => resetHunt(pokemonId, formId),
    onSuccess: onMutationSuccess,
  });
  const caughtMutation = useMutation({
    mutationFn: ({ method, isShiny }: { method: ShinyMethod; isShiny: boolean }) =>
      markCaught(pokemonId, formId, isShiny, method.game, method.method),
    onSuccess: onMutationSuccess,
  });

  if (isLoading) {
    return <CenteredMessage text="Loading…" />;
  }
  if (error || !pokemon) {
    return <CenteredMessage text={errorMessage(error) ?? FALLBACK_ERROR} />;
  }

  const types = parseJsonArray(pokemon.types);

  return (
    <div className="flex flex-col h-full w-full">
      <div className="h-14 flex items-center gap-3 px-6 border-b border-border">
        <Button asChild variant="ghost" size="icon-sm">
          <Link to="/">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <h1 className="text-base font-semibold text-foreground">{pokemon.display_name}</h1>
        {pokemon.form_name && <Badge variant="outline">{pokemon.form_name}</Badge>}
        <span className="text-sm text-muted-foreground">#{String(pokemon.id).padStart(4, "0")}</span>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex gap-6">
          <div className="flex gap-4">
            <SpriteBlock src={pokemon.sprite_url} label="Standard" />
            <SpriteBlock src={pokemon.shiny_sprite_url} label="Shiny" />
          </div>
          <div className="flex flex-col gap-2 justify-center">
            <div className="flex gap-1.5 flex-wrap">
              {types.map((t) => (
                <Badge key={t} variant="secondary" className="capitalize">
                  {t}
                </Badge>
              ))}
              {pokemon.is_legendary && <Badge variant="outline">Legendary</Badge>}
              {pokemon.is_mythical && <Badge variant="outline">Mythical</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">Generation {pokemon.generation}</p>
            <p className="text-sm text-muted-foreground">{formatGenderRate(pokemon.gender_rate)}</p>
          </div>
        </div>

        <Separator />

        {entry && (
          <CollectionPanel
            entry={entry}
            methods={methods ?? []}
            onStatusChange={(s) => statusMutation.mutate(s)}
            onCounter={(amount) => counterMutation.mutate(amount)}
            onChecklist={(field, value) => checklistMutation.mutate({ field, value })}
            onReset={() => resetMutation.mutate()}
            onMarkCaught={(method, isShiny) => caughtMutation.mutate({ method, isShiny })}
          />
        )}

        <Separator />

        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Shiny methods</h2>
          {methods && methods.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No shiny methods recorded — every game this species appears in is shiny-locked
              there, or availability isn't confirmed yet (source pending).
            </p>
          )}
          <div className="space-y-2">
            {methods?.map((m) => (
              <MethodRow key={m.id} method={m} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CenteredMessage({ text }: { text: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function SpriteBlock({ src, label }: { src: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <img src={src} alt={label} className="h-20 w-20" />
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function MethodRow({ method }: { method: ShinyMethod }) {
  const boosts = parseJsonArray(method.boost_requirements);
  return (
    <Card className={method.is_best_method ? "ring-2 ring-primary/40" : undefined}>
      <CardContent className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{GAME_LABELS[method.game]}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-sm text-muted-foreground">{METHOD_LABELS[method.method]}</span>
            {method.is_best_method && <Badge>Best</Badge>}
            {method.requires_transfer && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline">Requires transfer</Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {method.transfer_chain ??
                    "Moves up via modded-3DS homebrew transfer tools, not a live Nintendo service."}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {boosts.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">Boosts: {boosts.join(", ")}</p>
          )}
          {method.notes && <p className="mt-1 text-xs text-muted-foreground">{method.notes}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-foreground">{formatOdds(method.odds_optimized)}</p>
          <p className="text-xs text-muted-foreground">
            base {formatOdds(method.odds_base)} · charm {formatOdds(method.odds_charm)}
          </p>
        </div>
        <a
          href={method.citation_url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="size-4" />
        </a>
      </CardContent>
    </Card>
  );
}

function CollectionPanel({
  entry,
  methods,
  onStatusChange,
  onCounter,
  onChecklist,
  onReset,
  onMarkCaught,
}: {
  entry: CollectionEntry;
  methods: ShinyMethod[];
  onStatusChange: (status: CollectionStatus) => void;
  onCounter: (amount: 1 | 10 | 100) => void;
  onChecklist: (field: ChecklistField, value: boolean) => void;
  onReset: () => void;
  onMarkCaught: (method: ShinyMethod, isShiny: boolean) => void;
}) {
  const [caughtDialogOpen, setCaughtDialogOpen] = useState(false);
  const [selectedMethodId, setSelectedMethodId] = useState<string>("");
  const [isShiny, setIsShiny] = useState(true);

  const selectedMethod = methods.find((m) => String(m.id) === selectedMethodId);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status</span>
          <Select value={entry.status} onValueChange={(v) => onStatusChange(v as CollectionStatus)}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Encounters</span>
          <span className="text-sm font-semibold text-foreground">{entry.encounter_count}</span>
          <Button size="sm" variant="outline" onClick={() => onCounter(1)}>
            +1
          </Button>
          <Button size="sm" variant="outline" onClick={() => onCounter(10)}>
            +10
          </Button>
          <Button size="sm" variant="outline" onClick={() => onCounter(100)}>
            +100
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <ChecklistToggle
            label="Shiny Charm"
            checked={entry.has_shiny_charm}
            onChange={(v) => onChecklist("has_shiny_charm", v)}
          />
          <ChecklistToggle
            label="Sandwich"
            checked={entry.sandwich_active}
            onChange={(v) => onChecklist("sandwich_active", v)}
          />
          <ChecklistToggle
            label="Outbreak"
            checked={entry.outbreak_active}
            onChange={(v) => onChecklist("outbreak_active", v)}
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {entry.status === "caught" && (
            <Badge variant={entry.is_shiny ? "default" : "secondary"}>
              {entry.is_shiny ? "Shiny caught" : "Caught"}
            </Badge>
          )}
          <Button size="sm" variant="ghost" onClick={onReset}>
            <RotateCcw className="size-3.5" /> Reset
          </Button>
          <Dialog open={caughtDialogOpen} onOpenChange={setCaughtDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={methods.length === 0}>
                Mark caught
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Mark as caught</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <span className="text-sm text-muted-foreground">Method used</span>
                  <Select value={selectedMethodId} onValueChange={setSelectedMethodId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a method…" />
                    </SelectTrigger>
                    <SelectContent>
                      {methods.map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {GAME_LABELS[m.game]} — {METHOD_LABELS[m.method]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={isShiny} onCheckedChange={setIsShiny} />
                  <span className="text-sm text-foreground">It's shiny</span>
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={!selectedMethod}
                  onClick={() => {
                    if (!selectedMethod) return;
                    onMarkCaught(selectedMethod, isShiny);
                    setCaughtDialogOpen(false);
                  }}
                >
                  Confirm
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}

function ChecklistToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Switch checked={checked} onCheckedChange={onChange} size="sm" />
      {label}
    </label>
  );
}
