import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CollectionEntry, CosmeticForm, EvolutionChainEdge, EvolutionChainMember, Pokemon, ShinyMethod } from "@/lib/tauri";
import {
  applyCosmeticForm,
  buildEvolutionLanes,
  buildSpriteVariants,
  CollectionPanel,
  ProfileSection,
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
  abilities: '[{"name":"overgrow","isHidden":false},{"name":"chlorophyll","isHidden":true}]',
  stat_hp: 231,
  stat_attack: 134,
  stat_defense: 134,
  stat_special_attack: 166,
  stat_special_defense: 166,
  stat_speed: 126,
  stat_total: 957,
  base_experience: 64,
  ev_yield_hp: 0,
  ev_yield_attack: 0,
  ev_yield_defense: 0,
  ev_yield_special_attack: 1,
  ev_yield_special_defense: 0,
  ev_yield_speed: 0,
  has_mega_evolution: false,
  has_gigantamax: false,
  has_gender_differences: false,
  hatch_steps: 5120,
  flavor_text: null,
};

describe("buildSpriteVariants", () => {
  it("includes a Shiny tile when shiny_sprite_url is populated", () => {
    const variants = buildSpriteVariants(BULBASAUR, []);
    expect(variants.map((v) => v.label)).toEqual(["Standard", "Shiny"]);
  });

  it("omits the Shiny tile entirely when shiny_sprite_url is empty — regression test for a real bug: Partner Pikachu/Eevee can never be Shiny in the real games, so PokéAPI has no shiny artwork for them at all, but the gallery used to render a blank/broken tile labeled \"Shiny\" anyway", () => {
    const partnerPikachu: Pokemon = { ...BULBASAUR, display_name: "Partner Pikachu", shiny_sprite_url: "" };
    const variants = buildSpriteVariants(partnerPikachu, []);
    expect(variants.map((v) => v.label)).toEqual(["Standard"]);
  });

  it("omits a cosmetic form's Shiny tile the same way, while keeping its standard tile", () => {
    const cosmeticForm: CosmeticForm = {
      id: 1,
      pokemon_id: 1,
      form_id: 0,
      kind: "mega",
      display_name: "Mega Bulbasaur",
      sprite_url: "mega.png",
      shiny_sprite_url: "",
      mega_stone_item: "bulbasaurite",
      types: '["grass","poison"]',
      height: 7,
      weight: 69,
      abilities: "[]",
      stat_hp: 1,
      stat_attack: 1,
      stat_defense: 1,
      stat_special_attack: 1,
      stat_special_defense: 1,
      stat_speed: 1,
      stat_total: 6,
      base_experience: 0,
      ev_yield_hp: 0,
      ev_yield_attack: 0,
      ev_yield_defense: 0,
      ev_yield_special_attack: 0,
      ev_yield_special_defense: 0,
      ev_yield_speed: 0,
    };
    const variants = buildSpriteVariants(BULBASAUR, [cosmeticForm]);
    expect(variants.map((v) => v.label)).toEqual(["Standard", "Shiny", "Mega Bulbasaur"]);
  });
});

describe("SpriteGalleryDialog", () => {
  const variants = [
    { src: "standard.png", label: "Standard", cosmeticForm: null },
    { src: "shiny.png", label: "Shiny", cosmeticForm: null },
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
    const azumarill = { ...BULBASAUR, abilities: '[{"name":"huge-power","isHidden":false},{"name":"thick-fat","isHidden":true}]' };
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

describe("applyCosmeticForm", () => {
  const MEGA_VENUSAUR: CosmeticForm = {
    id: 1,
    pokemon_id: 3,
    form_id: 0,
    kind: "mega",
    display_name: "Mega Venusaur",
    sprite_url: "mega-venusaur.png",
    shiny_sprite_url: "mega-venusaur-shiny.png",
    mega_stone_item: "venusaurite",
    types: '["grass","poison"]',
    height: 24,
    weight: 1555,
    abilities: '[{"name":"thick-fat","isHidden":false}]',
    stat_hp: 231,
    stat_attack: 236,
    stat_defense: 282,
    stat_special_attack: 280,
    stat_special_defense: 276,
    stat_speed: 126,
    stat_total: 1431,
    base_experience: 64,
    ev_yield_hp: 0,
    ev_yield_attack: 0,
    ev_yield_defense: 0,
    ev_yield_special_attack: 1,
    ev_yield_special_defense: 0,
    ev_yield_speed: 0,
  };

  it("returns the base Pokémon unchanged when no cosmetic form is selected", () => {
    expect(applyCosmeticForm(BULBASAUR, null)).toBe(BULBASAUR);
  });

  it("overrides only the fields that genuinely differ for a Mega/Gmax form, leaving everything else from the base Pokémon", () => {
    const result = applyCosmeticForm(BULBASAUR, MEGA_VENUSAUR);
    expect(result.stat_attack).toBe(236);
    expect(result.stat_defense).toBe(282);
    expect(result.abilities).toBe('[{"name":"thick-fat","isHidden":false}]');
    // Unaffected — these never change for a cosmetic battle form.
    expect(result.id).toBe(BULBASAUR.id);
    expect(result.display_name).toBe(BULBASAUR.display_name);
    expect(result.color).toBe(BULBASAUR.color);
    expect(result.gender_rate).toBe(BULBASAUR.gender_rate);
    expect(result.is_legendary).toBe(BULBASAUR.is_legendary);
  });
});

describe("buildEvolutionLanes", () => {
  function member(id: number, formId: number, displayName: string, stage: number): EvolutionChainMember {
    return { pokemon: { ...BULBASAUR, id, form_id: formId, display_name: displayName }, stage };
  }
  function edge(fromId: number, fromForm: number, toId: number, toForm: number): EvolutionChainEdge {
    return { from_pokemon_id: fromId, from_form_id: fromForm, to_pokemon_id: toId, to_form_id: toForm };
  }
  function names(lane: EvolutionChainMember[]): string[] {
    return lane.map((m) => m.pokemon.display_name);
  }

  it("splits two parallel single-step lines into two separate lanes — regression test for the reported Rattata bug (a single flat row of Rattata/Alolan Rattata/Raticate/Alolan Raticate read as if Rattata could lead into Alolan Raticate)", () => {
    const chain = [
      member(19, 0, "Rattata", 0),
      member(19, 1, "Alolan Rattata", 0),
      member(20, 0, "Raticate", 1),
      member(20, 1, "Alolan Raticate", 1),
    ];
    const edges = [edge(19, 0, 20, 0), edge(19, 1, 20, 1)];
    const lanes = buildEvolutionLanes(chain, edges).map(names);
    expect(lanes).toHaveLength(2);
    expect(lanes).toContainEqual(["Rattata", "Raticate"]);
    expect(lanes).toContainEqual(["Alolan Rattata", "Alolan Raticate"]);
  });

  it("splits a branching evolution into one lane per leaf, each repeating the shared prefix — regression test for the user-flagged Oddish shape (Gloom branches into Vileplume and Bellossom)", () => {
    const chain = [
      member(43, 0, "Oddish", 0),
      member(44, 0, "Gloom", 1),
      member(45, 0, "Vileplume", 2),
      member(182, 0, "Bellossom", 2),
    ];
    const edges = [edge(43, 0, 44, 0), edge(44, 0, 45, 0), edge(44, 0, 182, 0)];
    const lanes = buildEvolutionLanes(chain, edges).map(names);
    expect(lanes).toHaveLength(2);
    expect(lanes).toContainEqual(["Oddish", "Gloom", "Vileplume"]);
    expect(lanes).toContainEqual(["Oddish", "Gloom", "Bellossom"]);
  });

  it("produces one lane per (root, leaf) pair for a genuine many-to-many relationship — Eevee and Partner Eevee can each evolve into every Eeveelution, a correct 2x2 fan-out, not a bug", () => {
    const chain = [
      member(133, 0, "Eevee", 0),
      member(133, 1, "Partner Eevee", 0),
      member(134, 0, "Vaporeon", 1),
      member(135, 0, "Jolteon", 1),
    ];
    const edges = [
      edge(133, 0, 134, 0),
      edge(133, 0, 135, 0),
      edge(133, 1, 134, 0),
      edge(133, 1, 135, 0),
    ];
    const lanes = buildEvolutionLanes(chain, edges).map(names);
    expect(lanes).toHaveLength(4);
    expect(lanes).toContainEqual(["Eevee", "Vaporeon"]);
    expect(lanes).toContainEqual(["Eevee", "Jolteon"]);
    expect(lanes).toContainEqual(["Partner Eevee", "Vaporeon"]);
    expect(lanes).toContainEqual(["Partner Eevee", "Jolteon"]);
  });

  it("keeps a fully linear chain as one single lane, not split per stage", () => {
    const chain = [
      member(1, 0, "Bulbasaur", 0),
      member(2, 0, "Ivysaur", 1),
      member(3, 0, "Venusaur", 2),
    ];
    const edges = [edge(1, 0, 2, 0), edge(2, 0, 3, 0)];
    const lanes = buildEvolutionLanes(chain, edges).map(names);
    expect(lanes).toEqual([["Bulbasaur", "Ivysaur", "Venusaur"]]);
  });

  it("gives a species with no evolution at all its own single-member lane", () => {
    const chain = [member(128, 0, "Tauros", 0)];
    const lanes = buildEvolutionLanes(chain, []).map(names);
    expect(lanes).toEqual([["Tauros"]]);
  });
});

describe("ProfileSection", () => {
  it("shows a real hatch-step count for a breedable species", () => {
    render(<ProfileSection pokemon={BULBASAUR} types={["grass", "poison"]} cosmeticForms={[]} />);
    expect(screen.getByText(/5120 steps/)).toBeInTheDocument();
  });

  it('shows "—" instead of a hatch-step count for a No-Eggs species — regression test for a real contradiction: Mew is in the "No Eggs" egg group but still has a real, nonzero PokéAPI hatch_counter (it\'s a vestigial value the game data table never omits, mechanically meaningless since you can never obtain a No-Eggs species\' egg), and the page previously showed both "Egg Groups: No Eggs" and a literal "Hatch Time: 30600 steps" directly contradicting it', () => {
    const mew: Pokemon = { ...BULBASAUR, egg_groups: '["no-eggs"]', hatch_steps: 30600 };
    render(<ProfileSection pokemon={mew} types={["psychic"]} cosmeticForms={[]} />);
    expect(screen.queryByText(/30600 steps/)).not.toBeInTheDocument();
    const hatchTimeLabel = screen.getByText("Hatch Time");
    expect(hatchTimeLabel.parentElement).toHaveTextContent("—");
  });
});
