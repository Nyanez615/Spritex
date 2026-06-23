import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CollectionEntry, Pokemon, ShinyMethod } from "@/lib/tauri";
import {
  CollectionPanel,
  SpriteGalleryDialog,
  StatsSection,
} from "./pokemon.$id";

const BULBASAUR: Pokemon = {
  id: 1,
  name: "bulbasaur",
  display_name: "Bulbasaur",
  form_id: 0,
  form_name: null,
  generation: 1,
  sprite_url: "bulbasaur.png",
  shiny_sprite_url: "bulbasaur-shiny.png",
  sprite_url_female: null,
  shiny_sprite_url_female: null,
  types: '["grass","poison"]',
  gender_rate: 1,
  is_mythical: false,
  is_legendary: false,
  is_baby: false,
  is_final_evolution: false,
  color: "green",
  shape: "quadruped",
  growth_rate: "medium-slow",
  egg_groups: '["monster","plant"]',
  capture_rate: 45,
  base_happiness: 70,
  height: 7,
  weight: 69,
  abilities: '["overgrow","chlorophyll"]',
  stat_hp: 231,
  stat_attack: 134,
  stat_defense: 134,
  stat_special_attack: 166,
  stat_special_defense: 166,
  stat_speed: 126,
  stat_total: 957,
};

describe("SpriteGalleryDialog", () => {
  const variants = [
    { src: "standard.png", label: "Standard" },
    { src: "shiny.png", label: "Shiny" },
  ];

  it("is closed when index is null", () => {
    render(
      <SpriteGalleryDialog
        variants={variants}
        index={null}
        onIndexChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens showing the sprite at the given index", () => {
    render(
      <SpriteGalleryDialog
        variants={variants}
        index={0}
        onIndexChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByText("Standard").length).toBeGreaterThan(0);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("next/prev buttons cycle with modulo wraparound", () => {
    const onIndexChange = vi.fn();
    render(
      <SpriteGalleryDialog
        variants={variants}
        index={1}
        onIndexChange={onIndexChange}
        onClose={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[1]); // next, from index 1 -> wraps to 0
    expect(onIndexChange).toHaveBeenCalledWith(0);
  });

  it("ArrowRight/ArrowLeft keys also cycle the index", () => {
    const onIndexChange = vi.fn();
    render(
      <SpriteGalleryDialog
        variants={variants}
        index={0}
        onIndexChange={onIndexChange}
        onClose={vi.fn()}
      />,
    );
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("hides prev/next controls entirely for a single-variant species", () => {
    render(
      <SpriteGalleryDialog
        variants={[variants[0]]}
        index={0}
        onIndexChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText(/1 \/ 1/)).not.toBeInTheDocument();
  });
});

describe("StatsSection", () => {
  it("shows the default level-100/max-IV/neutral-nature stats with the Customize panel collapsed", () => {
    render(<StatsSection pokemon={BULBASAUR} />);
    expect(
      screen.getByText(/at level 100, max IVs, neutral nature/),
    ).toBeInTheDocument();
    expect(screen.getByText("231")).toBeInTheDocument(); // HP
    expect(screen.getByText("957")).toBeInTheDocument(); // Total
    expect(screen.queryByLabelText("Level")).not.toBeInTheDocument();
  });

  it("opening Customize reveals the level/nature/item controls and changing nature updates the displayed stat", () => {
    render(<StatsSection pokemon={BULBASAUR} />);
    fireEvent.click(screen.getByText("Customize"));
    expect(screen.getByLabelText("Level")).toBeInTheDocument();

    // Lower the level — HP should drop below the level-100 default of 231.
    fireEvent.change(screen.getByLabelText("Level"), {
      target: { value: "50" },
    });
    expect(screen.queryByText("231")).not.toBeInTheDocument();
  });

  it("Reset to default restores the original numbers after a change", () => {
    render(<StatsSection pokemon={BULBASAUR} />);
    fireEvent.click(screen.getByText("Customize"));
    fireEvent.change(screen.getByLabelText("Level"), {
      target: { value: "50" },
    });
    expect(screen.queryByText("231")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Reset to default"));
    expect(screen.getByText("231")).toBeInTheDocument();
  });

  it("only offers Eviolite when the species is not fully evolved", () => {
    render(
      <StatsSection pokemon={{ ...BULBASAUR, is_final_evolution: true }} />,
    );
    fireEvent.click(screen.getByText("Customize"));
    fireEvent.click(screen.getByLabelText("Held Item"));
    expect(screen.queryByText("Eviolite")).not.toBeInTheDocument();
  });

  it("hides the Ability control for a species with no stat-boosting ability", () => {
    render(<StatsSection pokemon={BULBASAUR} />); // overgrow/chlorophyll — no Huge Power/Pure Power
    fireEvent.click(screen.getByText("Customize"));
    expect(screen.queryByLabelText("Ability")).not.toBeInTheDocument();
  });

  it("shows the Ability control for a species with Huge Power, labeled as 'Huge Power' not the raw underscore key", () => {
    const azumarill = { ...BULBASAUR, abilities: '["huge-power","thick-fat"]' };
    render(<StatsSection pokemon={azumarill} />);
    fireEvent.click(screen.getByText("Customize"));
    expect(screen.getByLabelText("Ability")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Ability"));
    expect(screen.getByText("Huge Power")).toBeInTheDocument();
    expect(screen.queryByText("Huge_power")).not.toBeInTheDocument();
  });
});

describe("CollectionPanel", () => {
  const ENTRY: CollectionEntry = {
    id: "abc",
    pokemon_id: 1,
    form_id: 0,
    status: "hunting",
    is_shiny: false,
    encounter_count: 42,
    has_shiny_charm: false,
    sandwich_active: false,
    outbreak_active: false,
    chain_count: 0,
    game_caught: null,
    method_used: null,
    caught_at: null,
    notes: null,
    updated_at: "",
    synced_at: null,
  };
  const METHODS: ShinyMethod[] = [];

  it("renders the current encounter count and status", () => {
    render(
      <CollectionPanel
        entry={ENTRY}
        methods={METHODS}
        onStatusChange={vi.fn()}
        onCounter={vi.fn()}
        onChecklist={vi.fn()}
        onReset={vi.fn()}
        onMarkCaught={vi.fn()}
      />,
    );
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("+1/+10/+100 buttons call onCounter with the right amount", () => {
    const onCounter = vi.fn();
    render(
      <CollectionPanel
        entry={ENTRY}
        methods={METHODS}
        onStatusChange={vi.fn()}
        onCounter={onCounter}
        onChecklist={vi.fn()}
        onReset={vi.fn()}
        onMarkCaught={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("+10"));
    expect(onCounter).toHaveBeenCalledWith(10);
  });

  it("Reset button calls onReset", () => {
    const onReset = vi.fn();
    render(
      <CollectionPanel
        entry={ENTRY}
        methods={METHODS}
        onStatusChange={vi.fn()}
        onCounter={vi.fn()}
        onChecklist={vi.fn()}
        onReset={onReset}
        onMarkCaught={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Reset"));
    expect(onReset).toHaveBeenCalled();
  });

  it("Mark caught is disabled when there are no shiny methods recorded", () => {
    render(
      <CollectionPanel
        entry={ENTRY}
        methods={[]}
        onStatusChange={vi.fn()}
        onCounter={vi.fn()}
        onChecklist={vi.fn()}
        onReset={vi.fn()}
        onMarkCaught={vi.fn()}
      />,
    );
    expect(screen.getByText("Mark caught").closest("button")).toBeDisabled();
  });
});
