import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getSyncStatus } from "@/lib/tauri";

/**
 * Every collection/hunt-dependent view needs to know whether Turso sync is
 * configured before trusting an empty result — the underlying Rust commands
 * reject with "Sync not configured..." when it isn't, and a bare useQuery
 * destructuring only `data` would otherwise render as if there's simply no
 * data, with no explanation. Centralized here so every view checks the same
 * way (see SyncRequiredNotice).
 */
export function useSyncStatus() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.syncStatus,
    queryFn: getSyncStatus,
  });

  return { isConfigured: data?.mode === "embedded_replica", isLoading, status: data };
}
