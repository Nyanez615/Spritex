import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createQueryClientWrapper } from "@/test/queryClient";
import { useCollectionLookup } from "./useCollectionLookup";

const getAllCollectionEntries = vi.fn();
vi.mock("@/lib/tauri", () => ({ getAllCollectionEntries: (...args: unknown[]) => getAllCollectionEntries(...args) }));

const useSyncStatusMock = vi.fn();
vi.mock("@/hooks/useSyncStatus", () => ({ useSyncStatus: () => useSyncStatusMock() }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useCollectionLookup", () => {
  it("builds a Map keyed by pokemon_id-form_id when sync is configured", async () => {
    useSyncStatusMock.mockReturnValue({ isConfigured: true, isLoading: false });
    getAllCollectionEntries.mockResolvedValue([
      { pokemon_id: 1, form_id: 0, status: "caught" },
      { pokemon_id: 25, form_id: 0, status: "hunting" },
    ]);

    const { result } = renderHook(() => useCollectionLookup(), { wrapper: createQueryClientWrapper() });

    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.get("1-0")).toMatchObject({ status: "caught" });
    expect(result.current.get("25-0")).toMatchObject({ status: "hunting" });
  });

  it("never calls getAllCollectionEntries when sync isn't configured (avoids a doomed request)", () => {
    useSyncStatusMock.mockReturnValue({ isConfigured: false, isLoading: false });
    getAllCollectionEntries.mockResolvedValue([]);

    const { result } = renderHook(() => useCollectionLookup(), { wrapper: createQueryClientWrapper() });

    expect(getAllCollectionEntries).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });
});
