import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createQueryClientWrapper } from "@/test/queryClient";
import { useSyncStatus } from "./useSyncStatus";

const getSyncStatus = vi.fn();
vi.mock("@/lib/tauri", () => ({ getSyncStatus: (...args: unknown[]) => getSyncStatus(...args) }));

describe("useSyncStatus", () => {
  it("reports isConfigured=true when the backend mode is embedded_replica", async () => {
    getSyncStatus.mockResolvedValue({ mode: "embedded_replica", is_online: true, last_synced_at: "2026-01-01" });

    const { result } = renderHook(() => useSyncStatus(), { wrapper: createQueryClientWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isConfigured).toBe(true);
    expect(result.current.status?.mode).toBe("embedded_replica");
  });

  it("reports isConfigured=false when the backend mode is unconfigured", async () => {
    getSyncStatus.mockResolvedValue({ mode: "unconfigured", is_online: false, last_synced_at: null });

    const { result } = renderHook(() => useSyncStatus(), { wrapper: createQueryClientWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isConfigured).toBe(false);
  });

  it("reports isConfigured=false (not yet true) while the query is still loading", () => {
    getSyncStatus.mockReturnValue(new Promise(() => {})); // never resolves within this test
    const { result } = renderHook(() => useSyncStatus(), { wrapper: createQueryClientWrapper() });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isConfigured).toBe(false);
  });
});
