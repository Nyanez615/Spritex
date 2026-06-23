import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createQueryClientWrapper } from "@/test/queryClient";
import { NAV_ITEMS } from "@/lib/nav";
import { CommandPalette } from "./CommandPalette";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("@/lib/tauri", () => ({ searchPokemon: vi.fn().mockResolvedValue([]) }));

function renderPalette() {
  return render(<CommandPalette />, { wrapper: createQueryClientWrapper() });
}

describe("CommandPalette", () => {
  it("opens via Cmd+K and renders every nav item without throwing — regression test for the real crash this session fixed (CommandDialog never wrapped its children in cmdk's <Command> context provider, so CommandInput/CommandItem threw on undefined.subscribe())", () => {
    renderPalette();

    expect(screen.queryByPlaceholderText(/search pokémon/i)).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    expect(screen.getByPlaceholderText(/search pokémon or jump to a view/i)).toBeInTheDocument();
    expect(screen.getByText("Navigate")).toBeInTheDocument();
    for (const item of NAV_ITEMS) {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    }
  });

  it("toggles closed on a second Cmd+K", () => {
    renderPalette();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByPlaceholderText(/search pokémon or jump to a view/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.queryByPlaceholderText(/search pokémon or jump to a view/i)).not.toBeInTheDocument();
  });

  it("also responds to Ctrl+K (non-Mac)", () => {
    renderPalette();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByPlaceholderText(/search pokémon or jump to a view/i)).toBeInTheDocument();
  });
});
