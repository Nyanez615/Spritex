import { Fragment, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Maximize2,
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
import { RecommendedBadge } from "@/components/RecommendedBadge";
import { ShapeIcon } from "@/components/ShapeIcon";
import {
  RequireSync,
  SyncRequiredNotice,
} from "@/components/SyncRequiredNotice";
import { usePokemonLookup } from "@/hooks/usePokemonLookup";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import {
  DEFAULT_SORT_DIRECTION,
  filterPokemon,
  sortPokemonList,
  validatePokedexSearch,
  type PokedexSearch,
} from "@/lib/pokedexFilter";
import { cn } from "@/lib/utils";
import {
  errorMessage,
  formatGenderRate,
  formatOdds,
  parseJsonArray,
  spriteCropTransform,
  type PokemonAbility,
  type SpriteCrop,
} from "@/lib/format";
import {
  GAME_LABELS,
  POKEMON_COLOR_HEX,
  STAT_LABELS,
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
  getEvolutionChain,
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
  type EvolutionChainEdge,
  type EvolutionChainMember,
  type Pokemon,
  type ShinyMethod,
} from "@/lib/tauri";

export const Route = createFileRoute("/pokemon/$id")({
  component: PokemonDetail,
  // Spreads validatePokedexSearch's result so a card clicked from a
  // filtered/sorted grid view carries that context here for next/prev
  // navigation (see PokemonDetailContent) — every field stays optional at
  // the type level (matching PokedexSearch's own Partial<> shape) so every
  // other Link to this route (hunt, table, command palette, quick-counter)
  // can keep passing just `{ form }`; PokemonDetailContent fills concrete
  // defaults the same way index.tsx's PokedexGrid does.
  validateSearch: (search: Record<string, unknown>): { form: number } & PokedexSearch => ({
    form: Number(search.form ?? 0) || 0,
    ...validatePokedexSearch(search),
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

/**
 * Prev/next detail-page nav arrow — disabled (no Link) at either end of the
 * ordered list. Carries `searchContext` forward on the Link so repeated
 * next/prev clicks keep walking the same filtered/sorted order rather than
 * losing it after the first hop.
 */
function PokemonNavButton({
  target,
  icon: Icon,
  searchContext,
}: {
  target: Pokemon | undefined;
  icon: typeof ChevronLeft;
  searchContext: Required<PokedexSearch>;
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
        search={{ ...searchContext, form: target.form_id }}
      >
        <Icon className="size-4" />
      </Link>
    </Button>
  );
}

/**
 * True if a Left/Right/Escape keydown should be ignored for this page's own
 * navigation (prev/next species, or Escape back to the dex) — while the
 * sprite gallery is open (it already binds Left/Right itself to cycle
 * sprites, and Escape to close, see SpriteGalleryDialog below), while focus
 * is on a form field (the stat simulator's level input, a Select trigger),
 * or while focus is trapped inside any OTHER dialog (e.g. "Mark as
 * caught," which Radix already closes on Escape on its own) — so none of
 * these get hijacked into a page jump on top of their own native behavior.
 */
export function shouldSkipPageKeyNav(activeElement: Element | null, galleryOpen: boolean): boolean {
  if (galleryOpen) return true;
  if (!(activeElement instanceof HTMLElement)) return false;
  const tag = activeElement.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || activeElement.isContentEditable) return true;
  return Boolean(activeElement.closest('[role="dialog"]'));
}

function evolutionMemberKey(pokemonId: number, formId: number): string {
  return `${pokemonId}:${formId}`;
}

/**
 * Splits a chain family into one row ("lane") per real root-to-leaf
 * evolution path, instead of grouping by stage alone — stage can't tell two
 * parallel same-depth lines (Rattata→Raticate vs. Alolan Rattata→Alolan
 * Raticate) apart from a single member branching into several
 * (Gloom→Vileplume, Gloom→Bellossom), which read as one misleading chain
 * when flattened into a single row (confirmed user-reported confusion —
 * Rattata's row looked like it could lead to Alolan Raticate). Built from
 * `edges`, the real "evolves into" relationships — `members`' own `stage`
 * field is unused here, the edge graph alone determines lanes.
 *
 * A branch produces one lane per leaf, each lane repeating the shared
 * prefix (Oddish→Gloom→Vileplume and Oddish→Gloom→Bellossom as two
 * separate rows) rather than visually deduplicating it — more rows, but
 * every row reads as an unambiguous, complete, real evolution path on its
 * own, which is the property that was missing before. A member with no
 * edges at all (Tauros's breeds, no evolution whatsoever) gets its own
 * 1-chip lane, same as today.
 */
export function buildEvolutionLanes(
  members: EvolutionChainMember[],
  edges: EvolutionChainEdge[],
): EvolutionChainMember[][] {
  const memberByKey = new Map(
    members.map((m) => [evolutionMemberKey(m.pokemon.id, m.pokemon.form_id), m]),
  );
  const childKeysOf = new Map<string, string[]>();
  const hasIncomingEdge = new Set<string>();
  for (const edge of edges) {
    const fromKey = evolutionMemberKey(edge.from_pokemon_id, edge.from_form_id);
    const toKey = evolutionMemberKey(edge.to_pokemon_id, edge.to_form_id);
    if (!childKeysOf.has(fromKey)) childKeysOf.set(fromKey, []);
    childKeysOf.get(fromKey)!.push(toKey);
    hasIncomingEdge.add(toKey);
  }

  const lanes: EvolutionChainMember[][] = [];
  const visited = new Set<string>();

  function walk(key: string, pathSoFar: EvolutionChainMember[]): void {
    visited.add(key);
    const member = memberByKey.get(key);
    if (!member) return; // edge referenced a member outside this chain — shouldn't happen, skip defensively
    const path = [...pathSoFar, member];
    const childKeys = childKeysOf.get(key) ?? [];
    if (childKeys.length === 0) {
      lanes.push(path);
      return;
    }
    for (const childKey of childKeys) walk(childKey, path);
  }

  for (const member of members) {
    const key = evolutionMemberKey(member.pokemon.id, member.pokemon.form_id);
    if (!hasIncomingEdge.has(key)) walk(key, []);
  }
  // Defensive only — every member should be reachable from a root above via
  // the loop just run; if an edge somehow failed to resolve, don't silently
  // drop the member from the chip row entirely.
  for (const member of members) {
    const key = evolutionMemberKey(member.pokemon.id, member.pokemon.form_id);
    if (!visited.has(key)) lanes.push([member]);
  }

  return lanes;
}

/**
 * The specific cosmetic_forms `kind` the edge from (fromPokemonId,
 * fromFormId) to (toPokemonId, toFormId) requires the from-member to
 * currently be displaying — null when no such edge exists, or when it
 * exists but has no cosmetic-kind requirement (the overwhelming majority).
 * A pure lookup, extracted for direct testing rather than left inline in
 * EvolutionLineNav's render loop, matching this file's own established
 * pattern (buildEvolutionLanes, applyCosmeticForm, shouldSkipPageKeyNav).
 */
export function fromCosmeticKindFor(
  fromPokemonId: number,
  fromFormId: number,
  toPokemonId: number,
  toFormId: number,
  edges: EvolutionChainEdge[],
): string | null {
  const edge = edges.find(
    (e) =>
      e.from_pokemon_id === fromPokemonId &&
      e.from_form_id === fromFormId &&
      e.to_pokemon_id === toPokemonId &&
      e.to_form_id === toFormId,
  );
  return edge?.from_cosmetic_kind ?? null;
}

/**
 * The real sprite for (pokemonId, formId)'s own `kind` cosmetic form (e.g.
 * Sandy Burmy's actual cloak sprite), if it's present in `cosmeticForms` —
 * undefined otherwise, so the caller can fall back to the member's plain
 * sprite_url. Only ever has an entry to find when `cosmeticForms` happens to
 * be the SAME species currently being viewed (the page's own
 * getCosmeticForms query result, keyed to the current pokemonId/formId) —
 * a real, accepted scope limit: viewing the evolution line from a
 * DIFFERENT chain member's own page (e.g. from Sandy Wormadam's page
 * instead of Burmy's) doesn't have Burmy's own cosmetic_forms loaded, so
 * that lane's icon falls back to the plain sprite there. Fixing that fully
 * would need get_evolution_chain to bundle cosmetic_forms for every member,
 * not just the one being viewed — a larger backend change than this lookup.
 */
export function cosmeticSpriteFor(
  pokemonId: number,
  formId: number,
  kind: string | null,
  cosmeticForms: CosmeticForm[],
): string | undefined {
  if (!kind) return undefined;
  return cosmeticForms.find((f) => f.pokemon_id === pokemonId && f.form_id === formId && f.kind === kind)?.sprite_url;
}

/** The matching cosmetic form's own measured crop — the sibling lookup to cosmeticSpriteFor above. Without this, a cosmetic-form override's sprite would render through the BASE member's crop fractions, which describe a different image. */
export function cosmeticCropFor(
  pokemonId: number,
  formId: number,
  kind: string | null,
  cosmeticForms: CosmeticForm[],
): SpriteCrop | undefined {
  if (!kind) return undefined;
  const form = cosmeticForms.find((f) => f.pokemon_id === pokemonId && f.form_id === formId && f.kind === kind);
  if (!form) return undefined;
  return { x: form.sprite_crop_x, y: form.sprite_crop_y, width: form.sprite_crop_width, height: form.sprite_crop_height };
}

function EvolutionChip({
  pokemon,
  isCurrent,
  searchContext,
  cosmeticKindLabel,
  spriteUrlOverride,
  cropOverride,
}: {
  pokemon: Pokemon;
  isCurrent: boolean;
  searchContext: Required<PokedexSearch>;
  /** A specific cosmetic form (e.g. "Sandy") this lane's step requires this member to currently be displaying — see EvolutionChainEdge.from_cosmetic_kind's own doc comment. Appended to the label so e.g. Burmy reads "Burmy (Sandy)" in the lane leading to Sandy Wormadam specifically, instead of looking identical across all 4 of Burmy's lanes. */
  cosmeticKindLabel?: string;
  /** The matching cosmetic form's OWN sprite (e.g. Sandy Burmy's real cloak sprite), when available — so the chip's icon visually matches its label instead of always showing the base member's sprite regardless of which lane it's in. Falls back to pokemon.sprite_url when not available (e.g. viewing the chain from a different member's page, which doesn't have this member's own cosmetic_forms loaded — see the call site's own comment). */
  spriteUrlOverride?: string;
  /** spriteUrlOverride's own measured crop fractions — falls back to pokemon's own crop when there's no override, same pairing logic as spriteUrlOverride/pokemon.sprite_url above. */
  cropOverride?: SpriteCrop;
}) {
  const label = cosmeticKindLabel ? `${pokemon.display_name} (${cosmeticKindLabel})` : pokemon.display_name;
  const spriteUrl = spriteUrlOverride ?? pokemon.sprite_url;
  const crop: SpriteCrop = cropOverride ?? {
    x: pokemon.sprite_crop_x,
    y: pokemon.sprite_crop_y,
    width: pokemon.sprite_crop_width,
    height: pokemon.sprite_crop_height,
  };
  // Every sprite is rendered at the same on-screen size regardless of how
  // much transparent padding its own source image happens to have — without
  // this, a tightly-cropped sprite (Burmy) reads as a much bigger Pokémon
  // than a heavily-padded one (Wormadam, Mothim) even at an identical <img>
  // box size. Same mechanism SpriteBlock already uses for the gallery.
  const icon = (
    <div className="size-6 overflow-hidden shrink-0">
      <img src={spriteUrl} alt={label} className="size-6" style={{ transform: spriteCropTransform(crop) }} />
    </div>
  );
  if (isCurrent) {
    return (
      <Badge
        variant="outline"
        className="flex h-auto items-center gap-1.5 overflow-visible px-2 py-1 text-sm font-normal"
      >
        {icon}
        {label}
      </Badge>
    );
  }
  return (
    <Button asChild variant="outline" size="sm" className="h-auto gap-1.5 py-1">
      <Link
        to="/pokemon/$id"
        params={{ id: String(pokemon.id) }}
        search={{ ...searchContext, form: pokemon.form_id }}
        className="flex items-center gap-1.5"
      >
        {icon}
        {label}
      </Link>
    </Button>
  );
}

/**
 * Renders every species/form sharing the current Pokémon's evolution
 * chain_id — the whole family, not just what's directly reachable from the
 * current form (e.g. Galarian Meowth's chain also surfaces Kantonian/Alolan
 * Meowth and Persian, not only its own Perrserker evolution), since the
 * goal is quick navigation between related forms, not a strict
 * evolutionary path. Hidden entirely when the chain has nothing but the
 * current species (no evolution line at all) — see the call site.
 */
export function EvolutionLineNav({
  chain,
  edges,
  current,
  searchContext,
  cosmeticForms,
}: {
  chain: EvolutionChainMember[];
  edges: EvolutionChainEdge[];
  current: Pokemon;
  searchContext: Required<PokedexSearch>;
  /** The current page's own cosmetic_forms (already fetched for the sprite gallery) — reused here so e.g. Sandy Burmy's chip can show its real cloak sprite when Burmy IS the page being viewed. See cosmeticSpriteFor's own doc comment for the scope limit when it isn't. */
  cosmeticForms: CosmeticForm[];
}) {
  const lanes = useMemo(() => buildEvolutionLanes(chain, edges), [chain, edges]);
  // Every lane shares one grid, each stage in its own column (member,
  // chevron, member, chevron, ...) — column N sizes to the widest chip
  // any lane places there, so e.g. Raticate/Alolan Raticate (column 3)
  // start at the same x position regardless of Rattata/Alolan Rattata's
  // (column 1) differing widths, rather than each lane's flex row sizing
  // independently. Lanes shorter than the longest one (a branch's shared
  // prefix vs. its longer continuation) simply leave their row's trailing
  // columns empty — explicit gridRow/gridColumn placement below, not
  // relying on auto-flow, so a short lane never bleeds into the next row.
  const maxLaneLength = Math.max(...lanes.map((lane) => lane.length));
  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground mb-3">
        Evolution Line
      </h2>
      <div
        className="grid gap-x-2 gap-y-2 overflow-x-auto"
        style={{ gridTemplateColumns: `repeat(${maxLaneLength * 2 - 1}, max-content)` }}
      >
        {lanes.flatMap((lane, laneIndex) =>
          lane.map((member, memberIndex) => {
            // laneIndex-prefixed: a member can appear in more than one lane
            // (Eevee's many-to-many fan-out puts Vaporeon in both the Eevee
            // lane and the Partner Eevee lane), so the bare member key alone
            // isn't unique here the way it is for the per-lane container key
            // above.
            const key = `${laneIndex}-${evolutionMemberKey(member.pokemon.id, member.pokemon.form_id)}`;
            // The cosmetic-kind qualifier (if any) lives on the EDGE leading
            // OUT of this member within this specific lane — e.g. Burmy's
            // chip in the lane ending at Sandy Wormadam reads "Burmy
            // (Sandy)", while the same Burmy node in the Mothim lane stays
            // plain "Burmy" (that edge has no cosmetic-kind requirement).
            const nextMember = lane[memberIndex + 1];
            const fromCosmeticKind = nextMember
              ? fromCosmeticKindFor(member.pokemon.id, member.pokemon.form_id, nextMember.pokemon.id, nextMember.pokemon.form_id, edges)
              : null;
            return (
              <Fragment key={key}>
                {memberIndex > 0 && (
                  <div
                    className="flex items-center"
                    style={{ gridRow: laneIndex + 1, gridColumn: memberIndex * 2 }}
                  >
                    <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                  </div>
                )}
                <div style={{ gridRow: laneIndex + 1, gridColumn: memberIndex * 2 + 1 }}>
                  <EvolutionChip
                    pokemon={member.pokemon}
                    isCurrent={
                      member.pokemon.id === current.id &&
                      member.pokemon.form_id === current.form_id
                    }
                    searchContext={searchContext}
                    cosmeticKindLabel={fromCosmeticKind ? humanize(fromCosmeticKind) : undefined}
                    spriteUrlOverride={cosmeticSpriteFor(member.pokemon.id, member.pokemon.form_id, fromCosmeticKind, cosmeticForms)}
                    cropOverride={cosmeticCropFor(member.pokemon.id, member.pokemon.form_id, fromCosmeticKind, cosmeticForms)}
                  />
                </div>
              </Fragment>
            );
          }),
        )}
      </div>
    </div>
  );
}

/**
 * Mega/Gigantamax forms can have genuinely different types/stats/abilities
 * than the base form (e.g. Mega Charizard X is Fire/Dragon, not Fire/Flying)
 * — overrides only those fields, leaving everything else (id, sprites,
 * gender_rate, rarity flags, color/shape/breeding/capture-rate fields) on the
 * base Pokémon, since none of that changes for a cosmetic battle form. A pure
 * function (not inlined in the component) so it's directly unit-testable —
 * the real Tauri backend this page depends on isn't reachable from a browser
 * preview, so this is the only path to automated coverage of the view-switch.
 */
export function applyCosmeticForm(pokemon: Pokemon, form: CosmeticForm | null): Pokemon {
  if (!form) return pokemon;
  return {
    ...pokemon,
    types: form.types,
    height: form.height,
    weight: form.weight,
    abilities: form.abilities,
    stat_hp: form.stat_hp,
    stat_attack: form.stat_attack,
    stat_defense: form.stat_defense,
    stat_special_attack: form.stat_special_attack,
    stat_special_defense: form.stat_special_defense,
    stat_speed: form.stat_speed,
    stat_total: form.stat_total,
    base_experience: form.base_experience,
    ev_yield_hp: form.ev_yield_hp,
    ev_yield_attack: form.ev_yield_attack,
    ev_yield_defense: form.ev_yield_defense,
    ev_yield_special_attack: form.ev_yield_special_attack,
    ev_yield_special_defense: form.ev_yield_special_defense,
    ev_yield_speed: form.ev_yield_speed,
  };
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
  const navigate = useNavigate();
  // Arrived via a grid card click: rawSearchContext carries the grid's
  // active filters/sort, so next/prev walks that same context. Arrived with
  // no context (direct URL, command palette, hunt, quick-counter): every
  // field below defaults to "no filters, dex order," reproducing the full
  // natural list — same destructuring-with-defaults pattern as index.tsx's
  // PokedexGrid, since PokedexSearch's fields are optional at the type level.
  const rawSearchContext = Route.useSearch();
  // Memoized on rawSearchContext (stable when the route's search params
  // haven't changed) rather than rebuilt as a fresh object literal every
  // render — a fresh reference every render would defeat contextOrderedPokemon's
  // own memoization below, forcing a full filter+sort pass on every re-render
  // (e.g. every keystroke in the stat simulator) instead of only when the
  // actual filter/sort context changes.
  const searchContext: Required<PokedexSearch> = useMemo(() => {
    const ctxSort = rawSearchContext.sort ?? "dex";
    return {
      q: rawSearchContext.q ?? "",
      types: rawSearchContext.types ?? [],
      colors: rawSearchContext.colors ?? [],
      gens: rawSearchContext.gens ?? [],
      rarity: rawSearchContext.rarity ?? [],
      gender: rawSearchContext.gender ?? [],
      eggGroups: rawSearchContext.eggGroups ?? [],
      shapes: rawSearchContext.shapes ?? [],
      growthRates: rawSearchContext.growthRates ?? [],
      abilities: rawSearchContext.abilities ?? [],
      forms: rawSearchContext.forms ?? [],
      evYieldStats: rawSearchContext.evYieldStats ?? [],
      final: rawSearchContext.final ?? false,
      hasMega: rawSearchContext.hasMega ?? false,
      hasGmax: rawSearchContext.hasGmax ?? false,
      sort: ctxSort,
      sortDir: rawSearchContext.sortDir ?? DEFAULT_SORT_DIRECTION[ctxSort],
    };
  }, [rawSearchContext]);
  const { ordered: allPokemon } = usePokemonLookup();
  const contextOrderedPokemon = useMemo(
    () => sortPokemonList(filterPokemon(allPokemon, searchContext), searchContext.sort, searchContext.sortDir),
    [allPokemon, searchContext],
  );
  const { prevPokemon, nextPokemon } = useMemo(() => {
    const currentIndex = contextOrderedPokemon.findIndex((p) => p.id === pokemonId && p.form_id === formId);
    return {
      prevPokemon: currentIndex > 0 ? contextOrderedPokemon[currentIndex - 1] : undefined,
      nextPokemon:
        currentIndex !== -1 && currentIndex < contextOrderedPokemon.length - 1
          ? contextOrderedPokemon[currentIndex + 1]
          : undefined,
    };
  }, [contextOrderedPokemon, pokemonId, formId]);

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

  const { data: evolutionChain } = useQuery({
    queryKey: queryKeys.evolutionChain(pokemonId, formId),
    queryFn: () => getEvolutionChain(pokemonId, formId),
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

  // Always holds a real index (the currently tracked/selected sprite) — distinct
  // from galleryOpen, which solely controls whether the fullscreen dialog is
  // showing. Defaults to 0 (the standard sprite) so the selected-thumbnail ring
  // reflects what's actually displayed in Profile/Stats from first render.
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  // Left/Right jump to the prev/next species, mirroring the header chevron
  // buttons; Escape goes back to the dex, mirroring the header's back-arrow
  // button (navigate({ to: "/" }), matching that Link exactly — no search
  // params, same as today's back-arrow behavior).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (shouldSkipPageKeyNav(document.activeElement, galleryOpen)) return;
      if (e.key === "ArrowLeft" && prevPokemon) {
        navigate({ to: "/pokemon/$id", params: { id: String(prevPokemon.id) }, search: { ...searchContext, form: prevPokemon.form_id } });
      }
      if (e.key === "ArrowRight" && nextPokemon) {
        navigate({ to: "/pokemon/$id", params: { id: String(nextPokemon.id) }, search: { ...searchContext, form: nextPokemon.form_id } });
      }
      if (e.key === "Escape") {
        navigate({ to: "/" });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [galleryOpen, prevPokemon, nextPokemon, searchContext, navigate]);
  // Set when the tracked sprite is a Mega/Gmax cosmetic form — drives
  // displayPokemon below, which overrides only the fields that genuinely
  // differ for that form (types/stats/abilities/etc.), so the Profile/Stats
  // sections switch to show it without navigating anywhere. Null for every
  // standard/shiny/gendered sprite, including back to standard.
  const [selectedCosmeticForm, setSelectedCosmeticForm] = useState<CosmeticForm | null>(null);

  if (isLoading) {
    return <CenteredMessage text="Loading…" />;
  }
  if (error || !pokemon) {
    return <CenteredMessage text={errorMessage(error) ?? FALLBACK_ERROR} />;
  }

  const spriteVariants = buildSpriteVariants(pokemon, cosmeticForms);
  function trackVariant(i: number) {
    setGalleryIndex(i);
    setSelectedCosmeticForm(spriteVariants[i]?.cosmeticForm ?? null);
  }
  // Standard (male/female/shiny) and cosmetic-form (Mega/Gmax) sprites
  // render as two separately-wrapping rows rather than one shared flex-wrap
  // — otherwise a species with many cosmetic forms (e.g. Venusaur's Mega +
  // Gmax) pulls some of them up onto the standard row purely because there
  // happened to be horizontal space left, an arbitrary split that has
  // nothing to do with the two groups' actual distinction. Indices into
  // `spriteVariants` are preserved (not re-numbered per group) since
  // `trackVariant`/`galleryIndex`/the gallery dialog all key off the one
  // flat array.
  const indexedVariants = spriteVariants.map((variant, i) => ({ variant, i }));
  const standardVariants = indexedVariants.filter(({ variant }) => variant.cosmeticForm === null);
  const cosmeticVariants = indexedVariants.filter(({ variant }) => variant.cosmeticForm !== null);
  const displayPokemon = applyCosmeticForm(pokemon, selectedCosmeticForm);
  const types = parseJsonArray(displayPokemon.types);

  return (
    <div className="flex flex-col h-full w-full">
      <div className="h-14 flex items-center gap-3 px-6 border-b border-border">
        <Button asChild variant="ghost" size="icon-sm">
          <Link to="/">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <PokemonNavButton target={prevPokemon} icon={ChevronLeft} searchContext={searchContext} />
        <PokemonNavButton target={nextPokemon} icon={ChevronRight} searchContext={searchContext} />
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
        {/* items-start (not the flex default, stretch) keeps the Legendary/
            Generation column pinned near the top, next to the sprite
            gallery's first row — without it, that column's own
            `justify-center` instead centers it against the gallery's full,
            potentially very tall, stretched height (a species with many
            cosmetic-only sprites wraps into many rows), landing it
            somewhere in the middle of the gallery rather than at the top. */}
        <div className="flex gap-6 items-start">
          {/* max-w caps how wide the sprite grid can grow before wrapping —
              without it, a species with many cosmetic-only sprites (Unown's
              27 letters, Alcremie's 62 cream/sweet combinations) has nothing
              constraining its flex-wrap row's width, so it balloons out to
              fit everything in as few rows as possible, pushing the
              Legendary/Generation column far to the right instead of
              keeping it at a consistent position next to a normal-width
              gallery. */}
          <div className="flex flex-col gap-2 max-w-2xl">
            <div className="flex gap-4 flex-wrap">
              {standardVariants.map(({ variant, i }) => (
                <SpriteBlock
                  key={variant.label}
                  src={variant.src}
                  label={variant.label}
                  crop={variant.crop}
                  selected={i === galleryIndex}
                  onClick={() => trackVariant(i)}
                />
              ))}
            </div>
            {cosmeticVariants.length > 0 && (
              <div className="flex gap-4 flex-wrap">
                {cosmeticVariants.map(({ variant, i }) => (
                  <SpriteBlock
                    key={variant.label}
                    src={variant.src}
                    label={variant.label}
                    crop={variant.crop}
                    selected={i === galleryIndex}
                    onClick={() => trackVariant(i)}
                  />
                ))}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setGalleryOpen(true)}
            >
              <Maximize2 className="size-3.5" /> Expand sprites
            </Button>
          </div>
          <div className="flex flex-col gap-2 justify-center shrink-0">
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
            {selectedCosmeticForm && (
              <p className="text-sm text-muted-foreground">
                Showing: {selectedCosmeticForm.display_name}
              </p>
            )}
          </div>
        </div>

        {pokemon.flavor_text && (
          <p className="text-sm italic text-muted-foreground">
            {pokemon.flavor_text}
          </p>
        )}

        {evolutionChain && evolutionChain.members.length > 1 && (
          <>
            <Separator />
            <EvolutionLineNav
              chain={evolutionChain.members}
              edges={evolutionChain.edges}
              current={pokemon}
              searchContext={searchContext}
              cosmeticForms={cosmeticForms ?? []}
            />
          </>
        )}

        <Separator />

        <ProfileSection pokemon={displayPokemon} types={types} cosmeticForms={cosmeticForms ?? []} />

        <Separator />

        <StatsSection pokemon={displayPokemon} />

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
        index={galleryOpen ? galleryIndex : null}
        onIndexChange={trackVariant}
        onClose={() => setGalleryOpen(false)}
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
  /** The Mega/Gmax cosmetic form this sprite belongs to, if any — null for every standard/shiny/gendered sprite. Drives displayPokemon's view-switch when selected. */
  cosmeticForm: CosmeticForm | null;
  /** src's own real, measured non-transparent content region (from pokemon.sprite_crop_x/y/width/height, or a cosmetic form's own sprite_crop_x/y/width/height) — usually near-no-op for standard/shiny/gendered sprites, which are typically tightly-cropped official artwork, but always genuinely measured, not assumed. See spriteCropTransform's doc comment for why this is needed at all. */
  crop: SpriteCrop;
}

/**
 * Every sprite tile the gallery should show — omits a Shiny entry entirely
 * (standard or per-cosmetic-form) whenever its `shiny_sprite_url` is empty,
 * rather than rendering a blank/broken image. Empty exactly for species
 * that can never be Shiny in the real games (e.g. Partner Pikachu/Eevee —
 * PokéAPI has no shiny artwork for them at all, since none exists, not a
 * missing-data gap).
 */
export function buildSpriteVariants(
  pokemon: Pokemon,
  cosmeticForms: CosmeticForm[] | undefined,
): SpriteVariant[] {
  const hasGenderSprites = Boolean(pokemon.sprite_url_female || pokemon.shiny_sprite_url_female);
  // Computed from the species' own measured crop, not hardcoded to
  // FULL_CANVAS_CROP — bestSprite() (tools/seed-gen/src/fetchPokeapi.ts)
  // usually resolves sprite_url to tightly-cropped official artwork, which
  // measures out near-full-canvas anyway (a safe no-op), but nothing
  // guarantees that forever; computing it for real means any future
  // species/variety that ever falls through to a padded basic sprite gets
  // the same fix automatically, the same reasoning cosmetic_forms sprites
  // already get it for.
  const crop = { x: pokemon.sprite_crop_x, y: pokemon.sprite_crop_y, width: pokemon.sprite_crop_width, height: pokemon.sprite_crop_height };
  const cropFemale = { x: pokemon.sprite_crop_x_female, y: pokemon.sprite_crop_y_female, width: pokemon.sprite_crop_width_female, height: pokemon.sprite_crop_height_female };
  return [
    { src: pokemon.sprite_url, label: hasGenderSprites ? "Male" : "Standard", cosmeticForm: null, crop },
    ...(pokemon.shiny_sprite_url
      ? [{ src: pokemon.shiny_sprite_url, label: hasGenderSprites ? "Shiny Male" : "Shiny", cosmeticForm: null, crop }]
      : []),
    ...(pokemon.sprite_url_female
      ? [{ src: pokemon.sprite_url_female, label: "Female", cosmeticForm: null, crop: cropFemale }]
      : []),
    ...(pokemon.shiny_sprite_url_female
      ? [{ src: pokemon.shiny_sprite_url_female, label: "Shiny Female", cosmeticForm: null, crop: cropFemale }]
      : []),
    // A form with no sprite art at all (e.g. PokéAPI's "sinistcha-masterpiece"
    // form, confirmed live: front_default/front_shiny/back_default are all
    // null) gets sprite_url:"" — skipped entirely rather than rendering a
    // broken `<img src="">` tile, the same reasoning the existing
    // shiny-specific skip below already applies to an empty shiny_sprite_url.
    ...(cosmeticForms ?? []).filter((f) => f.sprite_url).flatMap((f) => {
      const crop = { x: f.sprite_crop_x, y: f.sprite_crop_y, width: f.sprite_crop_width, height: f.sprite_crop_height };
      return [
        { src: f.sprite_url, label: f.display_name, cosmeticForm: f, crop },
        ...(f.shiny_sprite_url ? [{ src: f.shiny_sprite_url, label: `Shiny ${f.display_name}`, cosmeticForm: f, crop }] : []),
      ];
    }),
  ];
}

function SpriteBlock({
  src,
  label,
  crop,
  selected,
  onClick,
}: {
  src: string;
  label: string;
  crop: SpriteCrop;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 group"
    >
      <div
        className={cn(
          "rounded-lg border bg-muted/30 p-4 transition-colors",
          selected
            ? "border-primary ring-2 ring-primary/40"
            : "border-border group-hover:border-primary/50",
        )}
      >
        <div className="h-28 w-28 overflow-hidden">
          <img
            src={src}
            alt={label}
            className="h-28 w-28"
            style={{ transform: spriteCropTransform(crop) }}
          />
        </div>
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
            <div className="h-48 w-48 overflow-hidden">
              <img
                src={current.src}
                alt={current.label}
                className="h-48 w-48"
                style={{ transform: spriteCropTransform(current.crop) }}
              />
            </div>
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

/** Short abbreviations for the compact EV-yield pill grid — STAT_LABELS' full words ("Attack") don't fit a small pill. */
const STAT_SHORT_LABELS: Record<StatKey, string> = {
  hp: "HP",
  attack: "Atk",
  defense: "Def",
  special_attack: "Sp.Atk",
  special_defense: "Sp.Def",
  speed: "Speed",
};

/** A styling convention, not a cited game-mechanic fact, same rationale as TYPE_COLORS/GENERATION_COLORS — picked to not collide with either of those palettes. */
const STAT_COLORS: Record<StatKey, string> = {
  hp: "#4CAF50",
  attack: "#FFC107",
  defense: "#FF9800",
  special_attack: "#29B6F6",
  special_defense: "#7E57C2",
  speed: "#EC407A",
};

function evYieldByStat(pokemon: Pokemon): Array<[StatKey, number]> {
  return [
    ["hp", pokemon.ev_yield_hp],
    ["attack", pokemon.ev_yield_attack],
    ["defense", pokemon.ev_yield_defense],
    ["special_attack", pokemon.ev_yield_special_attack],
    ["special_defense", pokemon.ev_yield_special_defense],
    ["speed", pokemon.ev_yield_speed],
  ];
}

/** Total EV points a single defeated wild/trainer Pokémon of this species grants — capped at 3 per the games' own rules, shown here as a sanity total, not the player's 510 EV cap. */
function evYieldTotal(pokemon: Pokemon): number {
  return evYieldByStat(pokemon).reduce((sum, [, value]) => sum + value, 0);
}

/** Colored stat-pill grid + total, matching the reference layout the user provided — replaces a plain "+1 Sp. Atk"-style text summary. */
function EvYieldPills({ pokemon }: { pokemon: Pokemon }) {
  const total = evYieldTotal(pokemon);
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1.5">Total: {total}</p>
      <div className="grid grid-cols-6 gap-1.5 max-w-xs">
        {evYieldByStat(pokemon).map(([key, value]) => (
          <div
            key={key}
            className="flex flex-col items-center justify-center rounded-md py-1.5 text-black"
            style={{ backgroundColor: STAT_COLORS[key] }}
          >
            <span className="text-sm font-bold leading-tight">{value}</span>
            <span className="text-[10px] leading-tight">{STAT_SHORT_LABELS[key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
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

export function ProfileSection({
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
          {pokemon.shape ? (
            <span className="flex items-center gap-1.5">
              <ShapeIcon shape={pokemon.shape} className="text-muted-foreground shrink-0" />
              {humanize(pokemon.shape)}
            </span>
          ) : (
            "—"
          )}
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
          <span className="flex items-center gap-1.5">
            <GenderRatioBar rate={pokemon.gender_rate} />
            {pokemon.has_gender_differences && (
              <span className="text-xs text-muted-foreground">(visual differences)</span>
            )}
          </span>
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
        <ProfileField label="Hatch Time">
          {/* hatch_steps is a real PokéAPI value even for No-Eggs species (the
              game's own data table doesn't omit it), but showing a step count
              directly contradicts the "No Eggs" field just above it. */}
          {eggGroups.includes("no-eggs") ? (
            "—"
          ) : (
            <>
              {pokemon.hatch_steps} steps ({pokemon.hatch_steps / 255} cycles)
            </>
          )}
        </ProfileField>

        {/* Battle */}
        <ProfileField label="Abilities">
          {abilities.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
              {abilities.map((a, i) => (
                <span key={a.name} className="inline-flex items-center gap-1">
                  <span className={a.isHidden ? "italic text-primary" : undefined}>
                    {humanize(a.name)}
                    {i < abilities.length - 1 ? "," : ""}
                  </span>
                  {a.isHidden && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                      HA
                    </Badge>
                  )}
                </span>
              ))}
            </div>
          ) : (
            "—"
          )}
        </ProfileField>
        <ProfileField label="EXP Yield">{pokemon.base_experience}</ProfileField>
        <ProfileField label="EV Yield">
          <EvYieldPills pokemon={pokemon} />
        </ProfileField>
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
            {method.is_best_method && <RecommendedBadge />}
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
