import { describe, expect, it } from "vitest";
import {
  baseStatFromStored,
  computeAllStats,
  DEFAULT_SIMULATOR_INPUTS,
  isDefaultSimulatorInputs,
  type SimulatorInputs,
} from "./statCalc";

// Bulbasaur's real stored level-100/31-IV/0-EV/neutral-nature values
// (matches tools/seed-gen/test/correctness.test.ts's own Bulbasaur assertion).
const BULBASAUR = {
  stat_hp: 231,
  stat_attack: 134,
  stat_defense: 134,
  stat_special_attack: 166,
  stat_special_defense: 166,
  stat_speed: 126,
};

describe("baseStatFromStored", () => {
  it("reverses the HP formula (2*base+141)", () => {
    expect(baseStatFromStored(231, true)).toBe(45);
  });

  it("reverses the non-HP formula (2*base+36)", () => {
    expect(baseStatFromStored(134, false)).toBe(49);
  });
});

describe("computeAllStats", () => {
  it("reproduces the exact stored values at default inputs (the regression check for 'default view unchanged')", () => {
    const result = computeAllStats(BULBASAUR, DEFAULT_SIMULATOR_INPUTS);
    expect(result.hp).toBe(231);
    expect(result.attack).toBe(134);
    expect(result.defense).toBe(134);
    expect(result.special_attack).toBe(166);
    expect(result.special_defense).toBe(166);
    expect(result.speed).toBe(126);
    expect(result.total).toBe(957);
  });

  it("HP is unaffected by nature", () => {
    const adamant = computeAllStats(BULBASAUR, { ...DEFAULT_SIMULATOR_INPUTS, nature: "adamant" });
    expect(adamant.hp).toBe(231);
  });

  it("a boosting nature raises its stat by 10% (Adamant: +Attack)", () => {
    const adamant = computeAllStats(BULBASAUR, { ...DEFAULT_SIMULATOR_INPUTS, nature: "adamant" });
    const neutral = computeAllStats(BULBASAUR, DEFAULT_SIMULATOR_INPUTS);
    expect(adamant.attack).toBeGreaterThan(neutral.attack);
  });

  it("a lowering nature reduces its stat by 10% (Adamant: -Sp. Atk)", () => {
    const adamant = computeAllStats(BULBASAUR, { ...DEFAULT_SIMULATOR_INPUTS, nature: "adamant" });
    const neutral = computeAllStats(BULBASAUR, DEFAULT_SIMULATOR_INPUTS);
    expect(adamant.special_attack).toBeLessThan(neutral.special_attack);
  });

  it("lower level produces a lower stat at the same IV/EV/nature", () => {
    const lv50 = computeAllStats(BULBASAUR, { ...DEFAULT_SIMULATOR_INPUTS, level: 50 });
    const lv100 = computeAllStats(BULBASAUR, DEFAULT_SIMULATOR_INPUTS);
    expect(lv50.hp).toBeLessThan(lv100.hp);
    expect(lv50.attack).toBeLessThan(lv100.attack);
  });

  it("0 IV produces a lower stat than 31 IV, all else equal", () => {
    const zeroIv: SimulatorInputs = {
      ...DEFAULT_SIMULATOR_INPUTS,
      ivs: { hp: 0, attack: 0, defense: 0, special_attack: 0, special_defense: 0, speed: 0 },
    };
    const result = computeAllStats(BULBASAUR, zeroIv);
    const max = computeAllStats(BULBASAUR, DEFAULT_SIMULATOR_INPUTS);
    expect(result.attack).toBeLessThan(max.attack);
  });

  it("252 EV raises a stat above the 0-EV baseline", () => {
    const maxEvAttack: SimulatorInputs = {
      ...DEFAULT_SIMULATOR_INPUTS,
      evs: { hp: 0, attack: 252, defense: 0, special_attack: 0, special_defense: 0, speed: 0 },
    };
    const result = computeAllStats(BULBASAUR, maxEvAttack);
    const baseline = computeAllStats(BULBASAUR, DEFAULT_SIMULATOR_INPUTS);
    expect(result.attack).toBeGreaterThan(baseline.attack);
  });

  it("Choice Band applies a flat 1.5x to Attack only", () => {
    const withItem = computeAllStats(BULBASAUR, { ...DEFAULT_SIMULATOR_INPUTS, item: "choice_band" });
    const baseline = computeAllStats(BULBASAUR, DEFAULT_SIMULATOR_INPUTS);
    expect(withItem.attack).toBe(Math.floor(baseline.attack * 1.5));
    expect(withItem.defense).toBe(baseline.defense);
    expect(withItem.special_attack).toBe(baseline.special_attack);
  });

  it("Eviolite applies a flat 1.5x to Defense and Sp. Def", () => {
    const withItem = computeAllStats(BULBASAUR, { ...DEFAULT_SIMULATOR_INPUTS, item: "eviolite" });
    const baseline = computeAllStats(BULBASAUR, DEFAULT_SIMULATOR_INPUTS);
    expect(withItem.defense).toBe(Math.floor(baseline.defense * 1.5));
    expect(withItem.special_defense).toBe(Math.floor(baseline.special_defense * 1.5));
    expect(withItem.attack).toBe(baseline.attack);
  });

  it("Huge Power / Pure Power apply a flat 2x to Attack only", () => {
    const baseline = computeAllStats(BULBASAUR, DEFAULT_SIMULATOR_INPUTS);
    for (const ability of ["huge_power", "pure_power"] as const) {
      const withAbility = computeAllStats(BULBASAUR, { ...DEFAULT_SIMULATOR_INPUTS, ability });
      expect(withAbility.attack).toBe(Math.floor(baseline.attack * 2));
      expect(withAbility.defense).toBe(baseline.defense);
    }
  });
});

describe("isDefaultSimulatorInputs", () => {
  it("is true for the literal default object", () => {
    expect(isDefaultSimulatorInputs(DEFAULT_SIMULATOR_INPUTS)).toBe(true);
  });

  it("is true for a structurally-identical but distinct object (deep, not reference, equality)", () => {
    const clone: SimulatorInputs = JSON.parse(JSON.stringify(DEFAULT_SIMULATOR_INPUTS));
    expect(isDefaultSimulatorInputs(clone)).toBe(true);
  });

  it("is false once any single field differs", () => {
    expect(isDefaultSimulatorInputs({ ...DEFAULT_SIMULATOR_INPUTS, level: 50 })).toBe(false);
    expect(isDefaultSimulatorInputs({ ...DEFAULT_SIMULATOR_INPUTS, nature: "adamant" })).toBe(false);
    expect(
      isDefaultSimulatorInputs({
        ...DEFAULT_SIMULATOR_INPUTS,
        evs: { ...DEFAULT_SIMULATOR_INPUTS.evs, attack: 252 },
      }),
    ).toBe(false);
  });
});
