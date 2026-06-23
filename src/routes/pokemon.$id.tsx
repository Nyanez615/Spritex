import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GenerationBadge } from "@/components/GenerationBadge";
import {
  RequireSync,
  SyncRequiredNotice,
} from "@/components/SyncRequiredNotice";
import { usePokemonLookup } from "@/hooks/usePokemonLookup";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { cn } from "@/lib/utils";
import {
  errorMessage,
  formatGenderRate,
  formatOdds,
  parseJsonArray,
  type PokemonAbility,
} from "@/lib/format";
import {
  GAME_LABELS,
  POKEMON_COLOR_HEX,
  TYPE_COLORS,
  humanize,
  methodLabel,
} from "@/lib/labels";
import { invalidateCollectionAggregates, queryKeys } from "@/lib/queryKeys";
import {
  computeAllStats,
  DEFAULT_SIMULATOR_INPUTS,
  isDefaultSimulatorInputs,
  NATURE_MODIFIERS,
  NATURES,
  STAT_KEYS,
  type Nature,
  type SimulatorInputs,
  type StatKey,
  type StatModifierAbility,
  type StatModifierItem,
} from "@/lib/statCalc";
import {
  getCollectionEntry,
  getCosmeticForms,
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
  type CosmeticForm,
  type Pokemon,
  type ShinyMethod,
} from "@/lib/tauri";

export const Route = createFileRoute("/pokemon/$id")({
  component: PokemonDetail,
  validateSearch: (search: Record<string, unknown>): { form: number } => ({
    form: Number(search.form ?? 0) || 0,
  }),
});

export const STATUS_LABELS: Record<CollectionStatus, string> = {
  not_started: "Not started",
  hunting: "Hunting",
  caught: "Caught",
};
export const ALL_STATUSES: CollectionStatus[] = [
  "not_started",
  "hunting",
  "caught",
];
const FALLBACK_ERROR =
  "Couldn't load this Pokémon — it may not exist in the static database.";

/** Prev/next detail-page nav arrow — disabled (no Link) at either end of the ordered list. */
function PokemonNavButton({
  target,
  icon: Icon,
}: {
  target: Pokemon | undefined;
  icon: typeof ChevronLeft;
}) {
  if (!target) {
    return (
      <Button variant="ghost" size="icon-sm" disabled>
        <Icon className="size-4" />
      </Button>
    );
  }
  return (
    <Button asChild variant="ghost" size="icon-sm">
      <Link
        to="/pokemon/$id"
        params={{ id: String(target.id) }}
        search={{ form: target.form_id }}
      >
        <Icon className="size-4" />
      </Link>
    </Button>
  );
}

function PokemonDetail() {
  // Keyed on the route's own params so every piece of local state below
  // (gallery index, stat-simulator inputs) resets when navigating from one
  // Pokémon's detail page to another — TanStack Router reuses this
  // component instance across param changes, the same way React Router
  // does, so without a key change React would otherwise carry over state
  // (e.g. a held-item choice) onto an unrelated species.
  const { id } = Route.useParams();
  const { form } = Route.useSearch();
  return <PokemonDetailContent key={`${id}-${form}`} id={id} form={form} />;
}

function PokemonDetailContent({ id, form }: { id: string; form: number }) {
  const pokemonId = Number(id);
  const formId = form;
  const queryClient = useQueryClient();
  const { ordered: orderedPokemon } = usePokemonLookup();
  const { prevPokemon, nextPokemon } = useMemo(() => {
    const currentIndex = orderedPokemon.findIndex((p) => p.id === pokemonId && p.form_id === formId);
    return {
      prevPokemon: currentIndex > 0 ? orderedPokemon[currentIndex - 1] : undefined,
      nextPokemon:
        currentIndex !== -1 && currentIndex < orderedPokemon.length - 1
          ? orderedPokemon[currentIndex + 1]
          : undefined,
    };
  }, [orderedPokemon, pokemonId, formId]);

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

  const { data: cosmeticForms } = useQuery({
    queryKey: queryKeys.cosmeticForms(pokemonId, formId),
    queryFn: () => getCosmeticForms(pokemonId, formId),
  });

  const { isConfigured: isSyncConfigured, isLoading: syncLoading } =
    useSyncStatus();

  const { data: entry } = useQuery({
    queryKey: queryKeys.collectionEntry(pokemonId, formId),
    queryFn: () => getCollectionEntry(pokemonId, formId),
    enabled: isSyncConfigured,
  });

  const onMutationSuccess = (data: CollectionEntry) => {
    queryClient.setQueryData(
      queryKeys.collectionEntry(pokemonId, formId),
      data,
    );
    invalidateCollectionAggregates(queryClient);
  };

  const statusMutation = useMutation({
    mutationFn: (status: CollectionStatus) =>
      updateStatus(pokemonId, formId, status),
    onSuccess: onMutationSuccess,
  });
  const counterMutation = useMutation({
    mutationFn: (amount: 1 | 10 | 100) =>
      incrementCounter(pokemonId, formId, amount),
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
    mutationFn: ({
      method,
      isShiny,
    }: {
      method: ShinyMethod;
      isShiny: boolean;
    }) => markCaught(pokemonId, formId, isShiny, method.game, method.method),
    onSuccess: onMutationSuccess,
  });

  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);

  if (isLoading) {
    return <CenteredMessage text="Loading…" />;
  }
  if (error || !pokemon) {
    return <CenteredMessage text={errorMessage(error) ?? FALLBACK_ERROR} />;
  }

  const types = parseJsonArray(pokemon.types);
  const hasGenderSprites = Boolean(
    pokemon.sprite_url_female || pokemon.shiny_sprite_url_female,
  );
  const spriteVariants: SpriteVariant[] = [
    { src: pokemon.sprite_url, label: hasGenderSprites ? "Male" : "Standard" },
    {
      src: pokemon.shiny_sprite_url,
      label: hasGenderSprites ? "Shiny Male" : "Shiny",
    },
    ...(pokemon.sprite_url_female
      ? [{ src: pokemon.sprite_url_female, label: "Female" }]
      : []),
    ...(pokemon.shiny_sprite_url_female
      ? [{ src: pokemon.shiny_sprite_url_female, label: "Shiny Female" }]
      : []),
    ...(cosmeticForms ?? []).flatMap((f) => [
      { src: f.sprite_url, label: f.display_name },
      { src: f.shiny_sprite_url, label: `Shiny ${f.display_name}` },
    ]),
  ];

  return (
    <div className="flex flex-col h-full w-full">
      <div className="h-14 flex items-center gap-3 px-6 border-b border-border">
        <Button asChild variant="ghost" size="icon-sm">
          <Link to="/">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <PokemonNavButton target={prevPokemon} icon={ChevronLeft} />
        <PokemonNavButton target={nextPokemon} icon={ChevronRight} />
        <h1 className="text-base font-semibold text-foreground">
          {pokemon.display_name}
        </h1>
        {pokemon.form_name && (
          <Badge variant="outline">{pokemon.form_name}</Badge>
        )}
        <span className="text-sm text-muted-foreground">
          #{String(pokemon.id).padStart(4, "0")}
        </span>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex gap-6">
          <div className="flex gap-4 flex-wrap">
            {spriteVariants.map((variant, i) => (
              <SpriteBlock
                key={variant.label}
                src={variant.src}
                label={variant.label}
                onClick={() => setGalleryIndex(i)}
              />
            ))}
          </div>
          <div className="flex flex-col gap-2 justify-center">
            <div className="flex gap-1.5 flex-wrap">
              {pokemon.is_legendary && (
                <Badge variant="outline">Legendary</Badge>
              )}
              {pokemon.is_mythical && <Badge variant="outline">Mythical</Badge>}
              {pokemon.is_baby && <Badge variant="outline">Baby</Badge>}
              <Badge variant="outline">
                {pokemon.is_final_evolution
                  ? "Final Evolution"
                  : "Not Fully Evolved"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Generation {pokemon.generation}
            </p>
          </div>
        </div>

        <Separator />

        <ProfileSection pokemon={pokemon} types={types} cosmeticForms={cosmeticForms ?? []} />

        <Separator />

        <StatsSection pokemon={pokemon} />

        {!syncLoading && (
          <>
            <Separator />
            <RequireSync
              isConfigured={isSyncConfigured}
              isLoading={false}
              fullPage={false}
            >
              {entry ? (
                <CollectionPanel
                  entry={entry}
                  methods={methods ?? []}
                  onStatusChange={(s) => statusMutation.mutate(s)}
                  onCounter={(amount) => counterMutation.mutate(amount)}
                  onChecklist={(field, value) =>
                    checklistMutation.mutate({ field, value })
                  }
                  onReset={() => resetMutation.mutate()}
                  onMarkCaught={(method, isShiny) =>
                    caughtMutation.mutate({ method, isShiny })
                  }
                />
              ) : (
                <SyncRequiredNotice />
              )}
            </RequireSync>
          </>
        )}

        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">
            Shiny Methods
          </h2>
          {methods && methods.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No shiny methods recorded — every game this species appears in is
              shiny-locked there, or availability isn't confirmed yet (source
              pending).
            </p>
          )}
          <div className="space-y-2">
            {methods?.map((m) => (
              <MethodRow key={m.id} method={m} />
            ))}
          </div>
        </div>
      </div>
      <SpriteGalleryDialog
        variants={spriteVariants}
        index={galleryIndex}
        onIndexChange={setGalleryIndex}
        onClose={() => setGalleryIndex(null)}
      />
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

interface SpriteVariant {
  src: string;
  label: string;
}

function SpriteBlock({
  src,
  label,
  onClick,
}: {
  src: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 group"
    >
      <div className="rounded-lg border border-border bg-muted/30 p-3 transition-colors group-hover:border-primary/50">
        <img src={src} alt={label} className="h-20 w-20" />
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </button>
  );
}

/** Click any sprite to open this — a shared lightbox cycling through every variant present for the species (2 for most, 4 when gender-difference sprites exist). */
export function SpriteGalleryDialog({
  variants,
  index,
  onIndexChange,
  onClose,
}: {
  variants: SpriteVariant[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const open = index !== null;
  const current = index !== null ? variants[index] : null;

  useEffect(() => {
    if (!open || variants.length < 2) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft")
        onIndexChange(((index ?? 0) - 1 + variants.length) % variants.length);
      if (e.key === "ArrowRight")
        onIndexChange(((index ?? 0) + 1) % variants.length);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, index, variants.length, onIndexChange]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{current?.label}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center gap-3">
          {variants.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                onIndexChange(
                  ((index ?? 0) - 1 + variants.length) % variants.length,
                )
              }
            >
              <ChevronLeft className="size-5" />
            </Button>
          )}
          {current && (
            <img src={current.src} alt={current.label} className="h-48 w-48" />
          )}
          {variants.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                onIndexChange(((index ?? 0) + 1) % variants.length)
              }
            >
              <ChevronRight className="size-5" />
            </Button>
          )}
        </div>
        {variants.length > 1 && (
          <p className="text-center text-xs text-muted-foreground">
            {(index ?? 0) + 1} / {variants.length}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TypeBadge({ type }: { type: string }) {
  const color = TYPE_COLORS[type];
  return (
    <Badge
      variant="outline"
      className="capitalize"
      style={
        color
          ? { borderColor: `${color}80`, color, backgroundColor: `${color}1a` }
          : undefined
      }
    >
      {type}
    </Badge>
  );
}

function ProfileField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground mt-0.5">{children}</div>
    </div>
  );
}

/** Compact "+1 HP, +2 Speed"-style summary — only the nonzero EV yield stats. */
function formatEvYield(pokemon: Pokemon): string {
  const yields: Array<[StatKey, number]> = [
    ["hp", pokemon.ev_yield_hp],
    ["attack", pokemon.ev_yield_attack],
    ["defense", pokemon.ev_yield_defense],
    ["special_attack", pokemon.ev_yield_special_attack],
    ["special_defense", pokemon.ev_yield_special_defense],
    ["speed", pokemon.ev_yield_speed],
  ];
  const nonzero = yields.filter(([, value]) => value > 0);
  if (nonzero.length === 0) return "—";
  return nonzero.map(([key, value]) => `+${value} ${STAT_LABELS[key]}`).join(", ");
}

/** Bulbapedia-style male(blue)/female(pink) ratio bar, reusing the same hex values as the Color profile field's swatches. */
function GenderRatioBar({ rate }: { rate: number }) {
  if (rate === -1 || rate === 0 || rate === 8) {
    return <span className="text-sm">{formatGenderRate(rate)}</span>;
  }
  const femalePct = (rate / 8) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full overflow-hidden flex max-w-32">
        <div style={{ width: `${100 - femalePct}%`, backgroundColor: POKEMON_COLOR_HEX.blue }} />
        <div style={{ width: `${femalePct}%`, backgroundColor: POKEMON_COLOR_HEX.pink }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        {Math.round(100 - femalePct)}% / {Math.round(femalePct)}%
      </span>
    </div>
  );
}

function ProfileSection({
  pokemon,
  types,
  cosmeticForms,
}: {
  pokemon: Pokemon;
  types: string[];
  cosmeticForms: CosmeticForm[];
}) {
  const eggGroups = parseJsonArray(pokemon.egg_groups);
  const abilities = parseJsonArray<PokemonAbility>(pokemon.abilities);
  const colorHex = POKEMON_COLOR_HEX[pokemon.color];
  const megaStones = useMemo(
    () => [...new Set(cosmeticForms.map((f) => f.mega_stone_item).filter((s): s is string => s !== null))],
    [cosmeticForms],
  );

  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground mb-3">Profile</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-2xl">
        {/* Identity */}
        <ProfileField label="Types">
          <div className="flex gap-1.5 flex-wrap">
            {types.map((t) => (
              <TypeBadge key={t} type={t} />
            ))}
          </div>
        </ProfileField>
        <ProfileField label="Color">
          <span className="flex items-center gap-1.5">
            {colorHex && (
              <span
                className="size-3 rounded-full border border-border/50 shrink-0"
                style={{ backgroundColor: colorHex }}
              />
            )}
            {humanize(pokemon.color)}
          </span>
        </ProfileField>
        <ProfileField label="Shape">
          {pokemon.shape ? humanize(pokemon.shape) : "—"}
        </ProfileField>

        {/* Physical */}
        <ProfileField label="Height">
          {(pokemon.height / 10).toFixed(1)} m
        </ProfileField>
        <ProfileField label="Weight">
          {(pokemon.weight / 10).toFixed(1)} kg
        </ProfileField>

        {/* Breeding */}
        <ProfileField label="Gender">
          <GenderRatioBar rate={pokemon.gender_rate} />
        </ProfileField>
        <ProfileField label="Egg Groups">
          {eggGroups.length > 0 ? eggGroups.map(humanize).join(", ") : "—"}
        </ProfileField>
        <ProfileField label="Growth Rate">
          {humanize(pokemon.growth_rate)}
        </ProfileField>
        <ProfileField label="Capture Rate">{pokemon.capture_rate}</ProfileField>
        <ProfileField label="Base Happiness">
          {pokemon.base_happiness}
        </ProfileField>

        {/* Battle */}
        <ProfileField label="Abilities">
          {abilities.length > 0 ? (
            abilities.map((a, i) => (
              <span key={a.name}>
                {i > 0 && ", "}
                {humanize(a.name)}
                {a.isHidden && (
                  <span className="text-muted-foreground"> (Hidden)</span>
                )}
              </span>
            ))
          ) : (
            "—"
          )}
        </ProfileField>
        <ProfileField label="EXP Yield">{pokemon.base_experience}</ProfileField>
        <ProfileField label="EV Yield">{formatEvYield(pokemon)}</ProfileField>
        {megaStones.length > 0 && (
          <ProfileField label="Mega Stone">
            {megaStones.map(humanize).join(", ")}
          </ProfileField>
        )}
      </div>
    </div>
  );
}

// Conservative ceiling so bars are visually comparable across species without per-page rescaling.
const STAT_BAR_MAX = 700;
const STAT_LABELS: Record<StatKey, string> = {
  hp: "HP",
  attack: "Attack",
  defense: "Defense",
  special_attack: "Sp. Atk",
  special_defense: "Sp. Def",
  speed: "Speed",
};
const EV_TOTAL_CAP = 510;
/** Official blue (boosted) / red (lowered) for the selected nature's effect on a stat bar — undefined (neutral) otherwise. HP is never affected by nature. */
function natureStatColor(nature: Nature, key: StatKey): string | undefined {
  if (key === "hp") return undefined;
  const mod = NATURE_MODIFIERS[nature];
  if (mod.boost === key) return POKEMON_COLOR_HEX.blue;
  if (mod.lower === key) return POKEMON_COLOR_HEX.red;
  return undefined;
}
/** Ability-name keys as PokéAPI spells them (kebab-case) — must match abilities JSON, not the display label. */
const STAT_ABILITY_NAMES: Record<
  Exclude<StatModifierAbility, "none">,
  string
> = {
  huge_power: "huge-power",
  pure_power: "pure-power",
};
/** Display labels for STAT_ABILITY_NAMES's keys — underscore-separated, so humanize() (hyphen-only) can't be reused here. */
const STAT_ABILITY_LABELS: Record<
  Exclude<StatModifierAbility, "none">,
  string
> = {
  huge_power: "Huge Power",
  pure_power: "Pure Power",
};

export function StatsSection({ pokemon }: { pokemon: Pokemon }) {
  const [showCustomize, setShowCustomize] = useState(false);
  const [sim, setSim] = useState<SimulatorInputs>(DEFAULT_SIMULATOR_INPUTS);

  const computed = useMemo(() => computeAllStats(pokemon, sim), [pokemon, sim]);
  const availableAbilities = useMemo(() => {
    const abilities = parseJsonArray<PokemonAbility>(pokemon.abilities).map((a) => a.name);
    return (
      Object.keys(STAT_ABILITY_NAMES) as Array<
        Exclude<StatModifierAbility, "none">
      >
    ).filter((key) => abilities.includes(STAT_ABILITY_NAMES[key]));
  }, [pokemon.abilities]);
  const evTotal = STAT_KEYS.reduce((sum, key) => sum + sim.evs[key], 0);

  function updateIv(key: StatKey, raw: number) {
    const value = Number.isFinite(raw)
      ? Math.max(0, Math.min(31, Math.round(raw)))
      : 0;
    setSim((prev) => ({ ...prev, ivs: { ...prev.ivs, [key]: value } }));
  }
  function updateEv(key: StatKey, raw: number) {
    const clamped = Number.isFinite(raw)
      ? Math.max(0, Math.min(252, Math.round(raw)))
      : 0;
    const othersTotal = evTotal - sim.evs[key];
    const value = Math.min(clamped, EV_TOTAL_CAP - othersTotal);
    setSim((prev) => ({ ...prev, evs: { ...prev.evs, [key]: value } }));
  }
  function updateLevel(raw: number) {
    const value = Number.isFinite(raw)
      ? Math.max(1, Math.min(100, Math.round(raw)))
      : 1;
    setSim((prev) => ({ ...prev, level: value }));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground">
          Base Stats{" "}
          <span className="text-xs font-normal text-muted-foreground">
            {isDefaultSimulatorInputs(sim)
              ? "(at level 100, max IVs, neutral nature)"
              : `(level ${sim.level}, ${humanize(sim.nature)} nature)`}
          </span>
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCustomize((v) => !v)}
        >
          {showCustomize ? "Hide customization" : "Customize"}
        </Button>
      </div>

      {showCustomize && (
        <div className="mb-4 max-w-md space-y-3 rounded-lg border border-border p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label
                htmlFor="sim-level"
                className="text-xs text-muted-foreground"
              >
                Level
              </Label>
              <Input
                id="sim-level"
                type="number"
                min={1}
                max={100}
                value={sim.level}
                onChange={(e) => updateLevel(e.target.valueAsNumber)}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="sim-nature"
                className="text-xs text-muted-foreground"
              >
                Nature
              </Label>
              <Select
                value={sim.nature}
                onValueChange={(v) =>
                  setSim((prev) => ({ ...prev, nature: v as Nature }))
                }
              >
                <SelectTrigger id="sim-nature" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NATURES.map((n) => (
                    <SelectItem key={n} value={n}>
                      {humanize(n)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="sim-item"
                className="text-xs text-muted-foreground"
              >
                Held Item
              </Label>
              <Select
                value={sim.item}
                onValueChange={(v) =>
                  setSim((prev) => ({ ...prev, item: v as StatModifierItem }))
                }
              >
                <SelectTrigger id="sim-item" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="choice_band">Choice Band</SelectItem>
                  <SelectItem value="choice_specs">Choice Specs</SelectItem>
                  <SelectItem value="choice_scarf">Choice Scarf</SelectItem>
                  {!pokemon.is_final_evolution && (
                    <SelectItem value="eviolite">Eviolite</SelectItem>
                  )}
                  <SelectItem value="assault_vest">Assault Vest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {availableAbilities.length > 0 && (
              <div className="space-y-1">
                <Label
                  htmlFor="sim-ability"
                  className="text-xs text-muted-foreground"
                >
                  Ability
                </Label>
                <Select
                  value={sim.ability}
                  onValueChange={(v) =>
                    setSim((prev) => ({
                      ...prev,
                      ability: v as StatModifierAbility,
                    }))
                  }
                >
                  <SelectTrigger id="sim-ability" size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {availableAbilities.map((key) => (
                      <SelectItem key={key} value={key}>
                        {STAT_ABILITY_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="grid grid-cols-[3.5rem_1fr_1fr] gap-2 text-xs text-muted-foreground">
              <span />
              <span>IV (0-31)</span>
              <span>EV (0-252)</span>
            </div>
            {STAT_KEYS.map((key) => (
              <div
                key={key}
                className="grid grid-cols-[3.5rem_1fr_1fr] items-center gap-2"
              >
                <span className="text-xs text-muted-foreground">
                  {STAT_LABELS[key]}
                </span>
                <Input
                  type="number"
                  min={0}
                  max={31}
                  value={sim.ivs[key]}
                  onChange={(e) => updateIv(key, e.target.valueAsNumber)}
                  className="h-7"
                />
                <Input
                  type="number"
                  min={0}
                  max={252}
                  value={sim.evs[key]}
                  onChange={(e) => updateEv(key, e.target.valueAsNumber)}
                  className="h-7"
                />
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-0.5">
              EV total: {evTotal} / {EV_TOTAL_CAP}
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSim(DEFAULT_SIMULATOR_INPUTS)}
          >
            Reset to default
          </Button>
        </div>
      )}

      <div className="space-y-1.5 max-w-md">
        {STAT_KEYS.map((key) => {
          const barColor = natureStatColor(sim.nature, key);
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-16 shrink-0">
                {STAT_LABELS[key]}
              </span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full", !barColor && "bg-primary")}
                  style={{
                    width: `${Math.min(100, (computed[key] / STAT_BAR_MAX) * 100)}%`,
                    backgroundColor: barColor,
                  }}
                />
              </div>
              <span className="text-xs text-foreground w-10 text-right tabular-nums">
                {computed[key]}
              </span>
            </div>
          );
        })}
        <div className="flex items-center gap-2 pt-1.5 mt-1 border-t border-border/50">
          <span className="text-xs font-medium text-foreground w-16 shrink-0">
            Total
          </span>
          <div className="flex-1" />
          <span className="text-xs font-medium text-foreground w-10 text-right tabular-nums">
            {computed.total}
          </span>
        </div>
      </div>
    </div>
  );
}

function MethodRow({ method }: { method: ShinyMethod }) {
  const boosts = parseJsonArray(method.boost_requirements);
  return (
    <Card
      className={method.is_best_method ? "ring-2 ring-primary/40" : undefined}
    >
      <CardContent className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <GenerationBadge game={method.game} />
            <span className="font-medium text-foreground">
              {GAME_LABELS[method.game]}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-sm text-muted-foreground">
              {methodLabel(method)}
            </span>
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
            <p className="mt-1 text-xs text-muted-foreground">
              Boosts: {boosts.join(", ")}
            </p>
          )}
          {method.notes && (
            <p className="mt-1 text-xs text-muted-foreground">{method.notes}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-foreground">
            {formatOdds(method.odds_optimized)}
          </p>
          <p className="text-xs text-muted-foreground">
            base {formatOdds(method.odds_base)} · charm{" "}
            {formatOdds(method.odds_charm)}
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

export function CollectionPanel({
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
          <Select
            value={entry.status}
            onValueChange={(v) => onStatusChange(v as CollectionStatus)}
          >
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
          <span className="text-sm font-semibold text-foreground">
            {entry.encounter_count}
          </span>
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
                  <span className="text-sm text-muted-foreground">
                    Method used
                  </span>
                  <Select
                    value={selectedMethodId}
                    onValueChange={setSelectedMethodId}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a method…" />
                    </SelectTrigger>
                    <SelectContent>
                      {methods.map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          <span className="flex items-center gap-1.5">
                            <GenerationBadge game={m.game} />
                            {GAME_LABELS[m.game]} — {methodLabel(m)}
                          </span>
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
