import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createQueryClientWrapper } from "@/test/queryClient";
import { usePokemonLookup } from "./usePokemonLookup";

vi.mock("@/lib/tauri", () => ({
  getPokemonList: vi.fn().mockResolvedValue([
    { id: 1, form_id: 0, display_name: "Bulbasaur" },
    { id: 1, form_id: 1, display_name: "Some Form" },
  ]),
}));

describe("usePokemonLookup", () => {
  it("builds a Map keyed by id-form_id from the fetched list", async () => {
    const { result } = renderHook(() => usePokemonLookup(), { wrapper: createQueryClientWrapper() });

    await waitFor(() => expect(result.current.size).toBe(2));

    expect(result.current.get("1-0")).toMatchObject({ display_name: "Bulbasaur" });
    expect(result.current.get("1-1")).toMatchObject({ display_name: "Some Form" });
  });

  it("returns an empty Map before the query resolves", () => {
    const { result } = renderHook(() => usePokemonLookup(), { wrapper: createQueryClientWrapper() });
    expect(result.current.size).toBe(0);
  });
});
