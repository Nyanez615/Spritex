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

    await waitFor(() => expect(result.current.byKey.size).toBe(2));

    expect(result.current.byKey.get("1-0")).toMatchObject({ display_name: "Bulbasaur" });
    expect(result.current.byKey.get("1-1")).toMatchObject({ display_name: "Some Form" });
  });

  it("returns an empty Map before the query resolves", () => {
    const { result } = renderHook(() => usePokemonLookup(), { wrapper: createQueryClientWrapper() });
    expect(result.current.byKey.size).toBe(0);
  });

  it("also exposes the list in its original (id, form_id) order via `ordered`", async () => {
    const { result } = renderHook(() => usePokemonLookup(), { wrapper: createQueryClientWrapper() });

    await waitFor(() => expect(result.current.ordered.length).toBe(2));

    expect(result.current.ordered.map((p) => p.display_name)).toEqual(["Bulbasaur", "Some Form"]);
  });
});
