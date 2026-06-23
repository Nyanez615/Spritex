import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { queryKeys } from "@/lib/queryKeys";
import { clearTursoCredentials, forceSync, setTursoCredentials, type SyncMode } from "@/lib/tauri";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

const SYNC_MODE_LABELS: Record<SyncMode, string> = {
  embedded_replica: "Connected (embedded replica)",
  unconfigured: "Not configured",
};

function Settings() {
  const queryClient = useQueryClient();
  const [dbUrl, setDbUrl] = useState("");
  const [authToken, setAuthToken] = useState("");

  const { isConfigured, status: syncStatus } = useSyncStatus();

  const invalidateSyncStatus = () => queryClient.invalidateQueries({ queryKey: queryKeys.syncStatus });

  const connectMutation = useMutation({
    mutationFn: () => setTursoCredentials(dbUrl, authToken),
    onSuccess: () => {
      setAuthToken("");
      invalidateSyncStatus();
    },
  });
  const clearMutation = useMutation({
    mutationFn: () => clearTursoCredentials(),
    onSuccess: invalidateSyncStatus,
  });
  const forceSyncMutation = useMutation({
    mutationFn: () => forceSync(),
    onSuccess: invalidateSyncStatus,
  });

  return (
    <div className="flex flex-col h-full w-full">
      <div className="h-14 flex items-center px-6 border-b border-border">
        <h1 className="text-base font-semibold text-foreground">Settings</h1>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto p-8 space-y-8">
          <section className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Sync</CardTitle>
                <CardDescription>
                  Hunt progress syncs across your own devices via a personal Turso (libSQL) free-tier
                  database — never a shared or paid backend.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={isConfigured ? "default" : "secondary"}>
                    {syncStatus ? SYNC_MODE_LABELS[syncStatus.mode] : "Loading…"}
                  </Badge>
                  {syncStatus?.last_synced_at && (
                    <span className="text-xs text-muted-foreground">
                      Last synced {syncStatus.last_synced_at}
                    </span>
                  )}
                </div>

                {!isConfigured && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="turso-url">Turso database URL</Label>
                      <Input
                        id="turso-url"
                        placeholder="libsql://your-db.turso.io"
                        value={dbUrl}
                        onChange={(e) => setDbUrl(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="turso-token">Auth token</Label>
                      <Input
                        id="turso-token"
                        type="password"
                        placeholder="eyJ…"
                        value={authToken}
                        onChange={(e) => setAuthToken(e.target.value)}
                      />
                    </div>
                    <Button
                      disabled={!dbUrl || !authToken || connectMutation.isPending}
                      onClick={() => connectMutation.mutate()}
                    >
                      Save &amp; connect
                    </Button>
                  </div>
                )}

                {isConfigured && (
                  <div className="flex gap-2">
                    <Button variant="outline" disabled={forceSyncMutation.isPending} onClick={() => forceSyncMutation.mutate()}>
                      Force sync now
                    </Button>
                    <Button variant="destructive" disabled={clearMutation.isPending} onClick={() => clearMutation.mutate()}>
                      Clear credentials
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <Separator />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Credits &amp; attribution</h2>
            <p className="text-sm text-muted-foreground">
              Species, type, and sprite data comes from{" "}
              <a
                href="https://pokeapi.co"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                PokéAPI
              </a>{" "}
              (sprites are CC0, public domain). Per-game availability, shiny-lock status, and
              odds citations are derived from{" "}
              <a
                href="https://bulbapedia.bulbagarden.net"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Bulbapedia
              </a>
              , used under its{" "}
              <a
                href="https://creativecommons.org/licenses/by-nc-sa/2.5/"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                CC-BY-NC-SA
              </a>{" "}
              license. No data in this app is ever hand-typed — everything is scraped and derived
              automatically (see <code className="text-xs">tools/seed-gen/</code>).
            </p>
            <p className="text-sm text-muted-foreground">
              Spritex is an unofficial, fan-made project. It is not affiliated with, endorsed by, or
              sponsored by Nintendo, Game Freak, Creatures Inc., or The Pokémon Company. Pokémon and
              Pokémon character names are trademarks of Nintendo/Game Freak/Creatures Inc.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
