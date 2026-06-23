import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

/**
 * Shown in place of collection/hunt-dependent content when Turso sync isn't
 * configured — see useSyncStatus.ts for why this needs to exist at all
 * (without it, every dependent view just renders as if there's no data).
 */
export function SyncRequiredNotice({
  fullPage = false,
}: {
  fullPage?: boolean;
}) {
  const message = (
    <p className="text-sm text-muted-foreground text-center max-w-xs">
      Sync isn't configured yet —{" "}
      <Link
        to="/settings"
        className="underline underline-offset-2 hover:text-foreground"
      >
        set up Turso sync in Settings
      </Link>{" "}
      to track your collection.
    </p>
  );

  if (!fullPage) return message;
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      {message}
    </div>
  );
}

/**
 * Wraps a whole view that has nothing useful to show until sync is
 * configured — callers still own their own `useSyncStatus()` call (needed
 * regardless, to gate their own collection/hunt queries' `enabled` option),
 * and just pass the result down here instead of repeating the same
 * loading/unconfigured early-return in every route.
 */
export function RequireSync({
  isConfigured,
  isLoading,
  fullPage = true,
  children,
}: {
  isConfigured: boolean;
  isLoading: boolean;
  fullPage?: boolean;
  children: ReactNode;
}) {
  if (isLoading) return null;
  if (!isConfigured) return <SyncRequiredNotice fullPage={fullPage} />;
  return <>{children}</>;
}
