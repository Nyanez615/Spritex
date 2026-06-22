import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";

export const Route = createFileRoute("/timeline")({
  component: Timeline,
});

function Timeline() {
  return (
    <div className="flex flex-col h-full w-full">
      <div className="h-14 flex items-center px-6 border-b border-border">
        <h1 className="text-base font-semibold text-foreground">Timeline</h1>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-2">
          <CalendarDays className="size-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Coming later</p>
          <p className="text-sm text-muted-foreground">
            A calendar of time-limited rotations — GO Community Days, SV Mass Outbreaks, PLA
            Mass Outbreaks — needs its own read model and data source, which hasn't been built
            yet (Phase D in the architecture plan). This view is a placeholder, not a feature
            with stubbed-out fake data.
          </p>
        </div>
      </div>
    </div>
  );
}
