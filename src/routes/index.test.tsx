import { describe, expect, it } from "vitest";
import { COLOR_ORDER, TYPE_ORDER } from "@/lib/labels";
import { DEFAULT_SORT_DIRECTION, genderBucket, SORT_KEYS, validatePokedexSearch } from "@/lib/pokedexFilter";
import { rawFromHumanized } from "./index";

describe("validatePokedexSearch", () => {
  it("fills in every default when given an empty search object", () => {
    const result = validatePokedexSearch({});
    expect(result).toEqual({
      q: "",
      types: [],
      colors: [],
      gens: [],
      rarity: [],
      gender: [],
      eggGroups: [],
      shapes: [],
      growthRates: [],
      abilities: [],
      forms: [],
      evYieldStats: [],
      final: false,
      hasMega: false,
      hasGmax: false,
      sort: "dex",
      sortDir: "asc",
    });
  });

  it("coerces non-array values for array fields to []", () => {
    const result = validatePokedexSearch({ types: "fire", gens: 4 });
    expect(result.types).toEqual([]);
    expect(result.gens).toEqual([]);
  });

  it("coerces gens entries to numbers", () => {
    const result = validatePokedexSearch({ gens: ["1", "2"] });
    expect(result.gens).toEqual([1, 2]);
  });

  it("falls back to dex sort for an unrecognized sort value", () => {
    const result = validatePokedexSearch({ sort: "not-a-real-key" });
    expect(result.sort).toBe("dex");
  });

  it("accepts a valid sort key", () => {
    const result = validatePokedexSearch({ sort: "stat_total" });
    expect(result.sort).toBe("stat_total");
  });

  it("defaults sortDir from the sort key's own default when sortDir is absent or invalid", () => {
    expect(validatePokedexSearch({ sort: "stat_total" }).sortDir).toBe("desc"); // stat-like fields default desc
    expect(validatePokedexSearch({ sort: "name" }).sortDir).toBe("asc"); // name defaults asc
    expect(validatePokedexSearch({ sort: "name", sortDir: "bogus" }).sortDir).toBe("asc");
  });

  it("respects an explicit valid sortDir, overriding the field's own default", () => {
    expect(validatePokedexSearch({ sort: "name", sortDir: "desc" }).sortDir).toBe("desc");
  });

  it("only treats literal true as final=true", () => {
    expect(validatePokedexSearch({ final: true }).final).toBe(true);
    expect(validatePokedexSearch({ final: "true" }).final).toBe(false);
  });
});

describe("DEFAULT_SORT_DIRECTION", () => {
  it("has an entry for every SortKey, with no gaps", () => {
    for (const key of SORT_KEYS) {
      expect(DEFAULT_SORT_DIRECTION[key]).toMatch(/^(asc|desc)$/);
    }
  });

  it("dex/name/generation default ascending; stat-like fields default descending", () => {
    expect(DEFAULT_SORT_DIRECTION.dex).toBe("asc");
    expect(DEFAULT_SORT_DIRECTION.name).toBe("asc");
    expect(DEFAULT_SORT_DIRECTION.generation).toBe("asc");
    expect(DEFAULT_SORT_DIRECTION.stat_total).toBe("desc");
    expect(DEFAULT_SORT_DIRECTION.height).toBe("desc");
  });
});

describe("genderBucket", () => {
  it("maps -1 to genderless, 0 to male-only, 8 to female-only, anything else to mixed", () => {
    expect(genderBucket(-1)).toBe("genderless");
    expect(genderBucket(0)).toBe("male-only");
    expect(genderBucket(8)).toBe("female-only");
    expect(genderBucket(4)).toBe("mixed");
    expect(genderBucket(1)).toBe("mixed");
  });
});

describe("rawFromHumanized", () => {
  it("reverses a humanized type label back to its raw slug", () => {
    expect(rawFromHumanized(TYPE_ORDER, "Fire")).toBe("fire");
    expect(rawFromHumanized(TYPE_ORDER, "Special Attack" as never)).toBeUndefined();
  });

  it("reverses a humanized color label back to its raw slug", () => {
    expect(rawFromHumanized(COLOR_ORDER, "Black")).toBe("black");
  });
});
