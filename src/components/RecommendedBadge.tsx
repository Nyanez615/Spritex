import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The "Recommended" method per species/form is picked by a fixed mechanic
 * priority (GO Community Day > BDSP Radar > SwSh Dynamax Adventure > PLA/SV
 * Mass Outbreak > Gen 6 Chain/DexNav > Gen 7 SOS > Gen 5 Masuda > fallback to
 * lowest odds), not by literal lowest odds_optimized — it favors mechanics
 * that are practically faster to grind even when their per-encounter odds
 * number isn't the smallest fraction shown. See oddsFormulas.ts's
 * BEST_METHOD_PRIORITY.
 */
export function RecommendedBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge>Recommended</Badge>
      </TooltipTrigger>
      <TooltipContent>
        Picked by practical efficiency (grindable mechanics like Mass
        Outbreak/Dynamax Adventure rank above slower ones), not always the
        single best odds shown below.
      </TooltipContent>
    </Tooltip>
  );
}
