import { describe, expect, it } from "vitest";
import type { Pokemon } from "./tauri";
import {
  filterPokemon,
  hasActivePokedexFilters,
  sortPokemonList,
  validatePokedexSearch,
  type PokedexSearch,
} from "./pokedexFilter";

const BASE: Pokemon = {
  id: 1,
  name: "bulbasaur",
  display_name: "Bulbasaur",
  form_id: 0,
  form_name: null,
  generation: 1,
  sprite_url: "",
  shiny_sprite_url: "",
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
};

const IVYSAUR: Pokemon = {
  ...BASE,
  id: 2,
  name: "ivysaur",
  display_name: "Ivysaur",
  generation: 1,
  color: "green",
  capture_rate: 45,
  stat_total: 1071,
  ev_yield_special_attack: 0,
  ev_yield_special_defense: 1,
};

const CHARMANDER: Pokemon = {
  ...BASE,
  id: 4,
  name: "charmander",
  display_name: "Charmander",
  generation: 1,
  types: '["fire"]',
  color: "red",
  is_baby: false,
  is_final_evolution: false,
  capture_rate: 45,
  stat_total: 909,
  ev_yield_special_attack: 0,
  ev_yield_speed: 1,
};

const ARTICUNO: Pokemon = {
  ...BASE,
  id: 144,
  name: "articuno",
  display_name: "Articuno",
  generation: 1,
  types: '["ice","flying"]',
  color: "blue",
  is_legendary: true,
  capture_rate: 3,
  stat_total: 1071,
  ev_yield_special_attack: 0,
  ev_yield_speed: 0,
};

const ALL = [BASE, IVYSAUR, CHARMANDER, ARTICUNO];

function search(patch: Partial<PokedexSearch>): Required<PokedexSearch> {
  return { ...(validatePokedexSearch({}) as Required<PokedexSearch>), ...patch };
}

describe("filterPokemon", () => {
  it("returns every species when no filter is active", () => {
    expect(filterPokemon(ALL, search({}))).toEqual(ALL);
  });

  it("filters by type", () => {
    const result = filterPokemon(ALL, search({ types: ["fire"] }));
    expect(result.map((p) => p.id)).toEqual([4]);
  });

  it("filters by rarity (legendary)", () => {
    const result = filterPokemon(ALL, search({ rarity: ["legendary"] }));
    expect(result.map((p) => p.id)).toEqual([144]);
  });

  it("filters by name search, case-insensitively", () => {
    const result = filterPokemon(ALL, search({ q: "CHAR" }));
    expect(result.map((p) => p.id)).toEqual([4]);
  });

  it("filters by EV-yield stat", () => {
    const result = filterPokemon(ALL, search({ evYieldStats: ["speed"] }));
    expect(result.map((p) => p.id)).toEqual([4]);
  });

  it("combines multiple active filters with AND semantics", () => {
    const result = filterPokemon(ALL, search({ colors: ["green"], rarity: ["legendary"] }));
    expect(result).toEqual([]);
  });
});

describe("sortPokemonList", () => {
  it("dex ascending preserves input order", () => {
    const result = sortPokemonList(ALL, "dex", "asc");
    expect(result.map((p) => p.id)).toEqual([1, 2, 4, 144]);
  });

  it("dex descending reverses input order", () => {
    const result = sortPokemonList(ALL, "dex", "desc");
    expect(result.map((p) => p.id)).toEqual([144, 4, 2, 1]);
  });

  it("sorts by a numeric stat ascending/descending", () => {
    expect(sortPokemonList(ALL, "stat_total", "asc").map((p) => p.id)).toEqual([4, 1, 2, 144]);
    expect(sortPokemonList(ALL, "stat_total", "desc").map((p) => p.id)).toEqual([2, 144, 1, 4]);
  });

  it("sorts by name alphabetically", () => {
    expect(sortPokemonList(ALL, "name", "asc").map((p) => p.display_name)).toEqual([
      "Articuno", "Bulbasaur", "Charmander", "Ivysaur",
    ]);
  });

  it("does not mutate the input array", () => {
    const copy = [...ALL];
    sortPokemonList(ALL, "stat_total", "desc");
    expect(ALL).toEqual(copy);
  });
});

describe("hasActivePokedexFilters", () => {
  it("is false for an all-default search", () => {
    expect(hasActivePokedexFilters(search({}))).toBe(false);
  });

  it("is true when any single filter is set", () => {
    expect(hasActivePokedexFilters(search({ types: ["fire"] }))).toBe(true);
    expect(hasActivePokedexFilters(search({ final: true }))).toBe(true);
    expect(hasActivePokedexFilters(search({ q: "char" }))).toBe(true);
  });
});
