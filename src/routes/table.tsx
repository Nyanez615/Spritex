import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink } from "lucide-react";
import { GenerationBadge } from "@/components/GenerationBadge";
import { RecommendedBadge } from "@/components/RecommendedBadge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePokemonLookup } from "@/hooks/usePokemonLookup";
import { formatOdds } from "@/lib/format";
import { GAME_LABELS, GAME_ORDER, methodLabel } from "@/lib/labels";
import { getMethodsForGame, type Game, type ShinyMethod } from "@/lib/tauri";

export const Route = createFileRoute("/table")({
  component: MethodsTable,
});

type MethodTableRow = ShinyMethod & {
  pokemonName: string;
  spriteUrl: string;
  formName: string | null;
};

function MethodsTable() {
  const navigate = useNavigate();
  const [game, setGame] = useState<Game>("sv");
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "odds_optimized", desc: false }]);

  const { byKey: pokemonById } = usePokemonLookup();

  const { data: methods, isLoading } = useQuery({
    queryKey: ["methods-for-game", game],
    queryFn: () => getMethodsForGame(game),
  });

  const rows = useMemo<MethodTableRow[]>(() => {
    return (methods ?? []).map((m) => {
      const p = pokemonById.get(`${m.pokemon_id}-${m.form_id}`);
      return {
        ...m,
        pokemonName: p?.display_name ?? `#${m.pokemon_id}`,
        spriteUrl: p?.sprite_url ?? "",
        formName: p?.form_name ?? null,
      };
    });
  }, [methods, pokemonById]);

  const columns = useMemo<ColumnDef<MethodTableRow>[]>(
    () => [
      {
        accessorKey: "pokemonName",
        header: "Pokémon",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {row.original.spriteUrl && <img src={row.original.spriteUrl} alt="" className="size-6" />}
            <span className="font-medium text-foreground">{row.original.pokemonName}</span>
            {row.original.formName && (
              <Badge variant="outline" className="text-[10px]">
                {row.original.formName}
              </Badge>
            )}
          </div>
        ),
      },
      {
        accessorKey: "method",
        header: "Method",
        cell: ({ row }) => methodLabel(row.original),
      },
      {
        accessorKey: "odds_optimized",
        header: "Best odds",
        cell: ({ getValue }) => <span className="font-semibold text-foreground">{formatOdds(getValue<number>())}</span>,
      },
      {
        accessorKey: "odds_base",
        header: "Base",
        cell: ({ getValue }) => formatOdds(getValue<number>()),
      },
      {
        accessorKey: "odds_charm",
        header: "Charm",
        cell: ({ getValue }) => formatOdds(getValue<number>()),
      },
      {
        accessorKey: "is_best_method",
        header: "Recommended",
        enableSorting: false,
        cell: ({ getValue }) => (getValue<boolean>() ? <RecommendedBadge /> : null),
      },
      {
        accessorKey: "requires_transfer",
        header: "Transfer",
        enableSorting: false,
        cell: ({ getValue }) => (getValue<boolean>() ? <Badge variant="outline">Required</Badge> : null),
      },
      {
        id: "citation",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <a
            href={row.original.citation_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-4" />
          </a>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) =>
      row.original.pokemonName.toLowerCase().includes(String(filterValue).toLowerCase()),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="flex flex-col h-full w-full">
      <div className="h-14 flex items-center px-6 border-b border-border">
        <h1 className="text-base font-semibold text-foreground">Table</h1>
      </div>
      <div className="border-b border-border/50 px-6 py-2 flex items-center gap-3">
        <Select value={game} onValueChange={(v) => setGame(v as Game)}>
          <SelectTrigger size="sm">
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
        <div className="h-4 w-px bg-border" />
        <Input
          placeholder="Filter by name…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-xs"
        />
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} rows</span>
      </div>
      <div className="flex-1 overflow-auto p-6">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No shiny methods recorded for {GAME_LABELS[game]} yet.
          </p>
        )}
        {rows.length > 0 && (
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={header.column.getCanSort() ? "cursor-pointer select-none" : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() &&
                          (header.column.getIsSorted() === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : header.column.getIsSorted() === "desc" ? (
                            <ArrowDown className="size-3" />
                          ) : (
                            <ArrowUpDown className="size-3 opacity-30" />
                          ))}
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() =>
                    navigate({
                      to: "/pokemon/$id",
                      params: { id: String(row.original.pokemon_id) },
                      search: { form: row.original.form_id },
                    })
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
