import { describe, expect, it } from "vitest";
import {
  COLOR_ORDER,
  GAME_LABELS,
  GAME_ORDER,
  METHOD_LABELS,
  POKEMON_COLOR_HEX,
  TYPE_COLORS,
  TYPE_ORDER,
  humanize,
} from "./labels";

describe("humanize", () => {
  it("title-cases a single-word slug", () => {
    expect(humanize("fire")).toBe("Fire");
  });

  it("title-cases each hyphenated word", () => {
    expect(humanize("special-attack")).toBe("Special Attack");
  });

  it("handles multi-hyphen slugs", () => {
    expect(humanize("quick-attack-plus")).toBe("Quick Attack Plus");
  });
});

describe("GAME_ORDER / GAME_LABELS completeness", () => {
  // GAME_LABELS is typed Record<Game, string> — TS already enforces every
  // union member has an entry. What's NOT type-enforced is GAME_ORDER (a
  // separately hand-maintained array) staying in sync with it — exactly the
  // kind of drift this round's 20->28 Game expansion could have introduced.
  it("has no duplicate entries", () => {
    expect(new Set(GAME_ORDER).size).toBe(GAME_ORDER.length);
  });

  it("has exactly as many entries as GAME_LABELS has keys", () => {
    expect(GAME_ORDER.length).toBe(Object.keys(GAME_LABELS).length);
  });

  it("every entry resolves to a non-empty label", () => {
    for (const game of GAME_ORDER) {
      expect(GAME_LABELS[game]).toBeTruthy();
    }
  });
});

describe("METHOD_LABELS completeness", () => {
  it("has a label for all 19 Method variants", () => {
    expect(Object.keys(METHOD_LABELS).length).toBe(19);
  });

  it("every label is non-empty", () => {
    for (const label of Object.values(METHOD_LABELS)) {
      expect(label).toBeTruthy();
    }
  });
});

describe("TYPE_ORDER / TYPE_COLORS coverage", () => {
  it("every type in TYPE_ORDER has a TYPE_COLORS hex value", () => {
    for (const type of TYPE_ORDER) {
      expect(TYPE_COLORS[type]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("has exactly 18 types (no more, no fewer)", () => {
    expect(TYPE_ORDER.length).toBe(18);
  });
});

describe("COLOR_ORDER / POKEMON_COLOR_HEX coverage", () => {
  it("every color in COLOR_ORDER has a POKEMON_COLOR_HEX swatch", () => {
    for (const color of COLOR_ORDER) {
      expect(POKEMON_COLOR_HEX[color]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("has exactly 10 colors (PokéAPI's fixed Pokédex color set)", () => {
    expect(COLOR_ORDER.length).toBe(10);
  });
});
