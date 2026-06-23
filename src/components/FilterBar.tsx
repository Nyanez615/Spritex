import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterGroup {
  key: string;
  label: string;
  items: string[];
  active: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  /** Optional per-item color swatch (e.g. type colors) — every other group omits this. */
  itemColor?: (item: string) => string | undefined;
}

interface FilterBarProps {
  groups: FilterGroup[];
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

/**
 * Collapsible filter bar. Renders a fixed toolbar row (leading + group toggle
 * buttons + trailing) with a chip expansion panel that slides in below when
 * a group button is clicked. Only one group open at a time.
 *
 * Ported from ROMulus's FilterBar.tsx with one adaptation: `flex-wrap` on the
 * toolbar row, since this app's Pokédex view uses far more groups at once
 * than ROMulus ever needed, so the button row has to wrap on narrower windows
 * instead of overflowing.
 */
export function FilterBar({ groups, leading, trailing }: FilterBarProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const openGroup = groups.find((g) => g.key === openKey) ?? null;

  function toggle(key: string) {
    setOpenKey((prev) => (prev === key ? null : key));
  }

  return (
    <div className="border-b border-border/50">
      {/* Toolbar row */}
      <div className="px-6 py-2 flex flex-wrap items-center gap-3">
        {leading}

        {groups.map((g) => {
          const isOpen = openKey === g.key;
          const hasActive = g.active.length > 0;
          return (
            <button
              key={g.key}
              onClick={() => toggle(g.key)}
              className={cn(
                "flex items-center gap-1 h-7 px-2.5 rounded text-xs border transition-colors shrink-0",
                isOpen || hasActive
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "bg-muted border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {g.label}
              {hasActive && (
                <span className="ml-0.5 bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                  {g.active.length}
                </span>
              )}
              <ChevronDown
                className={cn(
                  "w-3 h-3 transition-transform shrink-0",
                  isOpen && "rotate-180",
                )}
              />
            </button>
          );
        })}

        {trailing && <div className="ml-auto">{trailing}</div>}
      </div>

      {/* Chip expansion panel */}
      {openGroup && (
        <div className="px-6 pb-3 flex flex-wrap gap-1.5">
          {openGroup.items.map((item) => {
            const color = openGroup.itemColor?.(item);
            return (
              <button
                key={item}
                onClick={() => openGroup.onToggle(item)}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border transition-colors",
                  openGroup.active.includes(item)
                    ? "bg-primary/20 border-primary/60 text-primary"
                    : "bg-muted border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {color && (
                  <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                )}
                {item}
              </button>
            );
          })}
          {openGroup.active.length > 0 && (
            <button
              onClick={openGroup.onClear}
              className="px-2 py-0.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
