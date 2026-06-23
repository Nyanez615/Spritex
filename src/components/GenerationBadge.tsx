import { Badge } from "@/components/ui/badge";
import { GAME_GENERATIONS, GENERATION_COLORS } from "@/lib/labels";
import type { Game } from "@/lib/tauri";

/**
 * Colored "Gen N" text badge — no game logos/images, ever (confirmed no
 * open-licensed source exists for them; see CLAUDE.md). Renders nothing for
 * `go`, which has no single generation.
 */
export function GenerationBadge({ game }: { game: Game }) {
  const gen = GAME_GENERATIONS[game];
  if (gen === null) return null;
  const color = GENERATION_COLORS[gen];
  return (
    <Badge
      variant="outline"
      style={color ? { borderColor: color, color } : undefined}
    >
      Gen {gen}
    </Badge>
  );
}
