import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ChevronsUpDown, CircleCheck, Crosshair, Layers, Sparkles } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FilterBar, type FilterGroup } from "@/components/FilterBar";
import { useCollectionLookup } from "@/hooks/useCollectionLookup";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { parseJsonArray, type PokemonAbility } from "@/lib/format";
import { COLOR_ORDER, STAT_LABELS, TYPE_COLORS, TYPE_ORDER, humanize } from "@/lib/labels";
import {
  DEFAULT_SORT_DIRECTION,
  filterPokemon,
  GENERAL_SORT_KEYS,
  hasActivePokedexFilters,
  SORT_LABELS,
  sortPokemonList,
  STAT_SORT_KEYS,
  validatePokedexSearch,
  type GenderBucket,
  type PokedexSearch,
  type Rarity,
  type SortKey,
} from "@/lib/pokedexFilter";
import { STAT_KEYS } from "@/lib/statCalc";
import { cn } from "@/lib/utils";
import { getPokemonList, type CollectionEntry, type Pokemon } from "@/lib/tauri";

const CARD_WIDTH = 128; // px — fits the existing h-16 w-16 (64px) sprite + p-4 padding
const GAP = 16; // px — matches the existing gap-4

export const Route = createFileRoute("/")({
  component: PokedexGrid,
  validateSearch: validatePokedexSearch,
});

function PokedexGrid() {
  const navigate = Route.useNavigate();
  const rawSearch = Route.useSearch();
  const {
    q = "", types = [], colors = [], gens = [], rarity = [], gender = [],
    eggGroups = [], shapes = [], growthRates = [], abilities = [], forms = [], evYieldStats = [],
    final = false, hasMega = false, hasGmax = false, sort = "dex", sortDir = DEFAULT_SORT_DIRECTION[sort],
  } = rawSearch;
  // Memoized (not a fresh object literal every render) so `filtered` below —
  // which depends on this object's reference — only recomputes when a field
  // actually changes, not on every unrelated re-render (gallery index, stat
  // simulator inputs elsewhere in the tree, etc.).
  const search: Required<PokedexSearch> = useMemo(
    () => ({
      q, types, colors, gens, rarity, gender, eggGroups, shapes, growthRates, abilities, forms,
      evYieldStats, final, hasMega, hasGmax, sort, sortDir,
    }),
    [
      q, types, colors, gens, rarity, gender, eggGroups, shapes, growthRates, abilities, forms,
      evYieldStats, final, hasMega, hasGmax, sort, sortDir,
    ],
  );

  const { data: pokemon, isLoading, error } = useQuery({
    queryKey: ["pokemon-list", {}],
    queryFn: () => getPokemonList({ search: null, generation: null, legendary_or_mythical_only: null }),
  });
  const collectionByKey = useCollectionLookup();

  function updateSearch(patch: Partial<PokedexSearch>) {
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  }
  function toggleInArray<T>(key: keyof PokedexSearch, current: T[], value: T) {
    updateSearch({
      [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    } as Partial<PokedexSearch>);
  }

  // Every form of every species, independent of active filters — the forms
  // preview always shows the full picture regardless of what's currently filtered.
  const formsBySpecies = useMemo(() => {
    const map = new Map<number, Pokemon[]>();
    for (const p of pokemon ?? []) {
      if (!map.has(p.id)) map.set(p.id, []);
      map.get(p.id)!.push(p);
    }
    for (const forms of map.values()) forms.sort((a, b) => a.form_id - b.form_id);
    return map;
  }, [pokemon]);

  const generationOptions = useMemo(
    () => Array.from(new Set((pokemon ?? []).map((p) => p.generation))).sort((a, b) => a - b),
    [pokemon],
  );
  const eggGroupOptions = useMemo(
    () => Array.from(new Set((pokemon ?? []).flatMap((p) => parseJsonArray(p.egg_groups)))).sort(),
    [pokemon],
  );
  const shapeOptions = useMemo(
    () => Array.from(new Set((pokemon ?? []).map((p) => p.shape).filter((s): s is string => s !== null))).sort(),
    [pokemon],
  );
  const growthRateOptions = useMemo(
    () => Array.from(new Set((pokemon ?? []).map((p) => p.growth_rate))).sort(),
    [pokemon],
  );
  const abilityOptions = useMemo(
    () =>
      Array.from(
        new Set((pokemon ?? []).flatMap((p) => parseJsonArray<PokemonAbility>(p.abilities).map((a) => a.name))),
      ).sort(),
    [pokemon],
  );
  const formOptions = useMemo(
    () => Array.from(new Set((pokemon ?? []).map((p) => p.form_name).filter((f): f is string => f !== null))).sort(),
    [pokemon],
  );

  const filtered = useMemo(() => filterPokemon(pokemon ?? [], search), [pokemon, search]);

  // Collapse to one card per species — rows are already ordered id,form_id,
  // so this naturally prefers form_id 0 whenever it passes the filters above,
  // falling back to whichever form *did* pass when the base form didn't.
  const visibleCards = useMemo(() => {
    const seen = new Set<number>();
    return filtered.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [filtered]);

  const sortedCards = useMemo(() => {
    return sortPokemonList(visibleCards, sort, sortDir);
  }, [visibleCards, sort, sortDir]);

  // Virtualized, fixed-size grid: column count is computed from the measured
  // container width so cards never stretch/shrink to fill a row.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    if (!scrollRef.current) return;
    const observer = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width));
    observer.observe(scrollRef.current);
    return () => observer.disconnect();
  }, []);
  const columnsPerRow = Math.max(1, Math.floor((containerWidth + GAP) / (CARD_WIDTH + GAP)));
  const rows = useMemo(() => {
    const chunks: Pokemon[][] = [];
    for (let i = 0; i < sortedCards.length; i += columnsPerRow) chunks.push(sortedCards.slice(i, i + columnsPerRow));
    return chunks;
  }, [sortedCards, columnsPerRow]);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    // Just an initial guess — measureElement (below) corrects it per-row once
    // rendered, so rows with a 2-line-wrapped name grow only as much as they
    // need instead of every row paying for the tallest possible name.
    estimateSize: () => CARD_WIDTH + GAP,
    overscan: 4,
  });

  // Scroll-position restore: filters/sort already round-trip through the URL
  // (search params), but the virtualizer's own scroll offset doesn't — a
  // fresh mount always starts at 0. Persist per exact filter/sort
  // combination (not just the route) so returning to the same view restores
  // where the user was, while a genuinely different filter combination
  // starts fresh rather than landing at a stale unrelated offset. Tracks
  // *which keys* have been restored this mount (not a single boolean) so
  // switching filters away and back within one session still restores —
  // a plain "restore once per mount" flag would only ever fire for the
  // first filter combination seen.
  const scrollKey = `pokedex-scroll:${JSON.stringify(search)}`;
  const restoredKeys = useRef(new Set<string>());
  useEffect(() => {
    if (restoredKeys.current.has(scrollKey) || rows.length === 0) return;
    restoredKeys.current.add(scrollKey);
    const saved = sessionStorage.getItem(scrollKey);
    if (saved) virtualizer.scrollToOffset(Number(saved), { align: "start" });
  }, [scrollKey, rows.length, virtualizer]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let timeout: ReturnType<typeof setTimeout>;
    const save = () => sessionStorage.setItem(scrollKey, String(el.scrollTop));
    const onScroll = () => {
      clearTimeout(timeout);
      timeout = setTimeout(save, 150);
    };
    el.addEventListener("scroll", onScroll);
    return () => {
      el.removeEventListener("scroll", onScroll);
      clearTimeout(timeout);
      save(); // flush the last position instead of dropping it on filter change/unmount
    };
  }, [scrollKey]);

  const hasActiveFilters = hasActivePokedexFilters(search);

  function clearAllFilters() {
    updateSearch({
      q: "", types: [], colors: [], gens: [], rarity: [], gender: [],
      eggGroups: [], shapes: [], growthRates: [], abilities: [], forms: [], evYieldStats: [],
      final: false, hasMega: false, hasGmax: false,
    });
  }

  return (
    <div className="flex flex-col h-full w-full">
      <div className="h-14 flex items-center px-6 border-b border-border">
        <h1 className="text-base font-semibold text-foreground">Pokédex</h1>
      </div>

      <PokedexFilterBar
        search={search}
        updateSearch={updateSearch}
        toggleInArray={toggleInArray}
        options={{ generationOptions, eggGroupOptions, shapeOptions, growthRateOptions, abilityOptions, formOptions }}
        hasActiveFilters={hasActiveFilters}
        clearAllFilters={clearAllFilters}
        resultCount={sortedCards.length}
        totalCount={formsBySpecies.size}
      />

      <div ref={scrollRef} className="flex-1 overflow-auto p-6">
        {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
        {error && <p className="text-destructive text-sm">{String(error)}</p>}
        {pokemon && pokemon.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No species yet — running in the browser preview (no Tauri backend), or the static
            database hasn't been seeded.
          </p>
        )}
        {pokemon && pokemon.length > 0 && sortedCards.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No Pokémon match the current filters.{" "}
            <button onClick={clearAllFilters} className="underline hover:text-foreground">
              Clear filters
            </button>
            .
          </p>
        )}
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="flex justify-center gap-4 pb-4"
            >
              {rows[virtualRow.index]?.map((p) => (
                <PokedexCard
                  key={p.id}
                  primary={p}
                  forms={formsBySpecies.get(p.id) ?? [p]}
                  collectionByKey={collectionByKey}
                  searchContext={search}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Reverses a humanized chip label (e.g. "Fire") back to its raw slug ("fire") for a known options list. */
export function rawFromHumanized<T extends string>(options: readonly T[], label: string): T {
  return options.find((o) => humanize(o) === label)!;
}

function PokedexFilterBar({
  search,
  updateSearch,
  toggleInArray,
  options,
  hasActiveFilters,
  clearAllFilters,
  resultCount,
  totalCount,
}: {
  search: Required<PokedexSearch>;
  updateSearch: (patch: Partial<PokedexSearch>) => void;
  toggleInArray: <T>(key: keyof PokedexSearch, current: T[], value: T) => void;
  options: {
    generationOptions: number[];
    eggGroupOptions: string[];
    shapeOptions: string[];
    growthRateOptions: string[];
    abilityOptions: string[];
    formOptions: string[];
  };
  hasActiveFilters: boolean;
  clearAllFilters: () => void;
  resultCount: number;
  totalCount: number;
}) {
  const {
    q, types, colors, gens, rarity, gender, eggGroups, shapes, growthRates, abilities, forms,
    evYieldStats, final, hasMega, hasGmax, sort, sortDir,
  } = search;
  const [abilitiesOpen, setAbilitiesOpen] = useState(false);
  const { isConfigured: isSyncConfigured, isLoading: syncLoading } = useSyncStatus();

  function setSort(newSort: SortKey) {
    updateSearch({ sort: newSort, sortDir: DEFAULT_SORT_DIRECTION[newSort] });
  }

  const typeGroup: FilterGroup = {
    key: "type",
    label: "Type",
    items: TYPE_ORDER.map(humanize),
    active: types.map(humanize),
    itemColor: (label) => TYPE_COLORS[rawFromHumanized(TYPE_ORDER, label)],
    onToggle: (label) => toggleInArray("types", types, rawFromHumanized(TYPE_ORDER, label)),
    onClear: () => updateSearch({ types: [] }),
  };
  const colorGroup: FilterGroup = {
    key: "color",
    label: "Color",
    items: COLOR_ORDER.map(humanize),
    active: colors.map(humanize),
    onToggle: (label) => toggleInArray("colors", colors, rawFromHumanized(COLOR_ORDER, label)),
    onClear: () => updateSearch({ colors: [] }),
  };
  const shapeGroup: FilterGroup = {
    key: "shape",
    label: "Shape",
    items: options.shapeOptions.map(humanize),
    active: shapes.map(humanize),
    onToggle: (label) => toggleInArray("shapes", shapes, rawFromHumanized(options.shapeOptions, label)),
    onClear: () => updateSearch({ shapes: [] }),
  };
  const generationGroup: FilterGroup = {
    key: "generation",
    label: "Generation",
    items: options.generationOptions.map((g) => `Gen ${g}`),
    active: gens.map((g) => `Gen ${g}`),
    onToggle: (label) => toggleInArray("gens", gens, Number(label.replace("Gen ", ""))),
    onClear: () => updateSearch({ gens: [] }),
  };
  const rarityGroup: FilterGroup = {
    key: "rarity",
    label: "Rarity",
    items: ["Legendary", "Mythical", "Baby"],
    active: rarity.map(humanize),
    onToggle: (label) => toggleInArray("rarity", rarity, label.toLowerCase() as Rarity),
    onClear: () => updateSearch({ rarity: [] }),
  };
  const GENDER_BUCKETS: GenderBucket[] = ["genderless", "male-only", "female-only", "mixed"];
  const genderGroup: FilterGroup = {
    key: "gender",
    label: "Gender",
    items: GENDER_BUCKETS.map(humanize),
    active: gender.map(humanize),
    onToggle: (label) => toggleInArray("gender", gender, rawFromHumanized(GENDER_BUCKETS, label)),
    onClear: () => updateSearch({ gender: [] }),
  };
  const eggGroupGroup: FilterGroup = {
    key: "eggGroup",
    label: "Egg Group",
    items: options.eggGroupOptions.map(humanize),
    active: eggGroups.map(humanize),
    onToggle: (label) => toggleInArray("eggGroups", eggGroups, rawFromHumanized(options.eggGroupOptions, label)),
    onClear: () => updateSearch({ eggGroups: [] }),
  };
  const growthRateGroup: FilterGroup = {
    key: "growthRate",
    label: "Growth Rate",
    items: options.growthRateOptions.map(humanize),
    active: growthRates.map(humanize),
    onToggle: (label) => toggleInArray("growthRates", growthRates, rawFromHumanized(options.growthRateOptions, label)),
    onClear: () => updateSearch({ growthRates: [] }),
  };
  const formGroup: FilterGroup = {
    key: "form",
    label: "Regional Variant",
    items: options.formOptions.map(humanize),
    active: forms.map(humanize),
    onToggle: (label) => toggleInArray("forms", forms, rawFromHumanized(options.formOptions, label)),
    onClear: () => updateSearch({ forms: [] }),
  };
  // Fixed 6-stat list, not derived from data like the groups above.
  const evYieldGroup: FilterGroup = {
    key: "evYield",
    label: "EV Yield",
    items: STAT_KEYS.map((k) => STAT_LABELS[k]),
    active: evYieldStats.map((k) => STAT_LABELS[k]),
    onToggle: (label) => {
      const key = STAT_KEYS.find((k) => STAT_LABELS[k] === label);
      if (key) toggleInArray("evYieldStats", evYieldStats, key);
    },
    onClear: () => updateSearch({ evYieldStats: [] }),
  };

  return (
    <div>
      <FilterBar
        groups={[]}
        leading={
          <>
            <RegionCaption>Search &amp; Sort</RegionCaption>
            <Input
              placeholder="Search by name…"
              value={q}
              onChange={(e) => updateSearch({ q: e.target.value })}
              className="max-w-xs"
            />
            <Select
              value={GENERAL_SORT_KEYS.includes(sort) ? sort : undefined}
              onValueChange={(v) => setSort(v as SortKey)}
            >
              <SelectTrigger size="sm">
                <SelectValue placeholder="Sort: General" />
              </SelectTrigger>
              <SelectContent>
                {GENERAL_SORT_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {SORT_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={STAT_SORT_KEYS.includes(sort) ? sort : undefined}
              onValueChange={(v) => setSort(v as SortKey)}
            >
              <SelectTrigger size="sm">
                <SelectValue placeholder="Sort: Stats & Yield" />
              </SelectTrigger>
              <SelectContent>
                {STAT_SORT_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {SORT_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => updateSearch({ sortDir: sortDir === "asc" ? "desc" : "asc" })}
                  className="flex items-center justify-center size-7 rounded text-muted-foreground border border-border bg-muted hover:text-foreground transition-colors shrink-0"
                >
                  {sortDir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{sortDir === "asc" ? "Ascending" : "Descending"}</TooltipContent>
            </Tooltip>
          </>
        }
        trailing={
          <div className="flex items-center gap-3">
            {!syncLoading && !isSyncConfigured && (
              <Link to="/settings" className="text-xs text-muted-foreground hover:text-foreground underline">
                Set up sync to track your collection
              </Link>
            )}
            {hasActiveFilters && (
              <button onClick={clearAllFilters} className="text-xs text-muted-foreground hover:text-foreground underline">
                Clear all
              </button>
            )}
            <span className="text-xs text-muted-foreground">
              {resultCount} of {totalCount} species
            </span>
          </div>
        }
      />
      <FilterBar
        groups={[typeGroup, colorGroup, shapeGroup]}
        leading={<RegionCaption>Appearance</RegionCaption>}
      />
      <FilterBar
        groups={[generationGroup, rarityGroup, genderGroup, eggGroupGroup, growthRateGroup, formGroup, evYieldGroup]}
        leading={<RegionCaption>Classification</RegionCaption>}
        trailing={
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch size="sm" checked={final} onCheckedChange={(v) => updateSearch({ final: v })} />
              Final evolution only
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch size="sm" checked={hasMega} onCheckedChange={(v) => updateSearch({ hasMega: v })} />
              Has Mega Evolution
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch size="sm" checked={hasGmax} onCheckedChange={(v) => updateSearch({ hasGmax: v })} />
              Has Gigantamax
            </label>
          </div>
        }
      />
      <FilterBar
        groups={[]}
        leading={
          <>
            <RegionCaption>Abilities</RegionCaption>
            <Popover open={abilitiesOpen} onOpenChange={setAbilitiesOpen}>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "flex items-center gap-1 h-7 px-2.5 rounded text-xs border transition-colors shrink-0",
                    abilities.length > 0
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-muted border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  Abilities
                  {abilities.length > 0 && (
                    <span className="ml-0.5 bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                      {abilities.length}
                    </span>
                  )}
                  <ChevronsUpDown className="size-3 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search abilities…" />
                  <CommandList>
                    <CommandEmpty>No abilities found.</CommandEmpty>
                    <CommandGroup>
                      {options.abilityOptions.map((a) => (
                        <CommandItem
                          key={a}
                          value={a}
                          data-checked={abilities.includes(a)}
                          onSelect={() => toggleInArray("abilities", abilities, a)}
                        >
                          {humanize(a)}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </>
        }
      />
    </div>
  );
}

function RegionCaption({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 shrink-0 w-24">{children}</span>
      <div className="h-4 w-px bg-border shrink-0" />
    </>
  );
}

function PokedexCard({
  primary,
  forms,
  collectionByKey,
  searchContext,
}: {
  primary: Pokemon;
  forms: Pokemon[];
  collectionByKey: Map<string, CollectionEntry>;
  searchContext: Required<PokedexSearch>;
}) {
  const hasMultipleForms = forms.length > 1;
  const entry = collectionByKey.get(`${primary.id}-${primary.form_id}`);
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  function openNow() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(true);
  }
  function closeSoon() {
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  }

  const cardClassName =
    "relative flex flex-col items-center gap-2 rounded-lg border border-border p-4 transition-colors hover:bg-muted";
  const cardStyle = { width: CARD_WIDTH };

  if (!hasMultipleForms) {
    return (
      <Link
        to="/pokemon/$id"
        params={{ id: String(primary.id) }}
        search={{ ...searchContext, form: primary.form_id }}
        className={cardClassName}
        style={cardStyle}
      >
        <PokedexCardInner pokemon={primary} entry={entry} />
      </Link>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          className={cn(cardClassName, "cursor-pointer")}
          style={cardStyle}
          onMouseEnter={openNow}
          onMouseLeave={closeSoon}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((o) => !o);
            }
          }}
        >
          <PokedexCardInner pokemon={primary} entry={entry} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Layers className="absolute bottom-1.5 right-1.5 size-3 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>{forms.length} forms</TooltipContent>
          </Tooltip>
        </div>
      </PopoverTrigger>
      <PopoverContent onMouseEnter={openNow} onMouseLeave={closeSoon} className="w-60">
        <p className="text-xs text-muted-foreground mb-1.5">{forms.length} forms</p>
        <div className="space-y-1">
          {forms.map((f) => (
            <Link
              key={f.form_id}
              to="/pokemon/$id"
              params={{ id: String(f.id) }}
              search={{ ...searchContext, form: f.form_id }}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2 rounded-md p-1.5 text-sm hover:bg-muted",
                f.form_id === primary.form_id && "bg-muted/60 ring-1 ring-primary/40",
              )}
            >
              <img src={f.sprite_url} alt="" className="size-8 object-contain shrink-0" />
              <span className="flex-1 truncate">{f.display_name}</span>
              <PokedexCardBadge entry={collectionByKey.get(`${f.id}-${f.form_id}`)} />
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PokedexCardInner({ pokemon, entry }: { pokemon: Pokemon; entry?: CollectionEntry }) {
  return (
    <>
      <TypeColorStrip pokemon={pokemon} />
      <span className="self-start text-[10px] font-mono text-muted-foreground">
        #{String(pokemon.id).padStart(4, "0")}
      </span>
      <img src={pokemon.sprite_url} alt={pokemon.display_name} className="h-16 w-16 object-contain" />
      <span className="text-sm font-medium text-foreground text-center line-clamp-2">{pokemon.display_name}</span>
      <PokedexCardBadge entry={entry} className="absolute top-2 right-2" />
    </>
  );
}

/** Thin color strip across the top of a card — solid for single-type species, split for dual-type. */
function TypeColorStrip({ pokemon }: { pokemon: Pokemon }) {
  const colors = parseJsonArray(pokemon.types)
    .map((t) => TYPE_COLORS[t])
    .filter((c): c is string => Boolean(c));
  if (colors.length === 0) return null;

  return (
    <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-lg overflow-hidden flex">
      {colors.length === 1 ? (
        <div className="w-full h-full" style={{ backgroundColor: colors[0] }} />
      ) : (
        colors.slice(0, 2).map((c, i) => <div key={i} className="flex-1 h-full" style={{ backgroundColor: c }} />)
      )}
    </div>
  );
}

function PokedexCardBadge({ entry, className }: { entry?: CollectionEntry; className?: string }) {
  if (!entry) return null;

  let icon: React.ReactNode;
  let label: string;
  if (entry.status === "caught" && entry.is_shiny) {
    icon = <Sparkles className={cn("size-3.5 text-amber-400", className)} />;
    label = "Shiny caught";
  } else if (entry.status === "caught") {
    icon = <CircleCheck className={cn("size-3.5 text-emerald-500", className)} />;
    label = "Caught";
  } else if (entry.status === "hunting") {
    icon = <Crosshair className={cn("size-3.5 text-muted-foreground", className)} />;
    label = "Hunting";
  } else {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{icon}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
