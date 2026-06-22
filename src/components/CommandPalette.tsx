import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { NAV_ITEMS } from "@/lib/nav";
import { searchPokemon } from "@/lib/tauri";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const { data: results } = useQuery({
    queryKey: ["search-pokemon", search],
    queryFn: () => searchPokemon(search),
    enabled: search.trim().length > 0,
  });

  const runAndClose = (fn: () => void) => {
    fn();
    setOpen(false);
    setSearch("");
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search Pokémon or jump to a view…" value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {results && results.length > 0 && (
          <CommandGroup heading="Pokémon">
            {results.map((p) => (
              <CommandItem
                key={`${p.id}-${p.form_id}`}
                value={`pokemon-${p.id}-${p.form_id}`}
                onSelect={() =>
                  runAndClose(() =>
                    navigate({
                      to: "/pokemon/$id",
                      params: { id: String(p.id) },
                      search: { form: p.form_id },
                    }),
                  )
                }
              >
                <img src={p.sprite_url} alt="" className="size-5" />
                {p.display_name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Navigate">
          {NAV_ITEMS.map(({ to, label, icon: Icon, ...rest }) => (
            <CommandItem key={to} value={`nav-${label}`} onSelect={() => runAndClose(() => navigate({ to, ...rest }))}>
              <Icon className="size-4 text-muted-foreground" />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
