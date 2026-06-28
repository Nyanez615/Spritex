import { describe, expect, it } from "vitest";
import { errorMessage, formatGenderRate, formatOdds, FULL_CANVAS_CROP, parseJsonArray, spriteCropTransform } from "./format";

describe("parseJsonArray", () => {
  it("parses a JSON-encoded array", () => {
    expect(parseJsonArray('["grass","poison"]')).toEqual(["grass", "poison"]);
  });

  it("returns [] for an empty array", () => {
    expect(parseJsonArray("[]")).toEqual([]);
  });

  it("returns [] for malformed JSON", () => {
    expect(parseJsonArray("not json")).toEqual([]);
  });

  it("returns [] when the JSON parses to a non-array (e.g. an object)", () => {
    expect(parseJsonArray('{"a":1}')).toEqual([]);
  });
});

describe("formatOdds", () => {
  it("formats a denominator as 1/N with thousands separators", () => {
    expect(formatOdds(4096)).toBe("1/4,096");
  });

  it("formats small denominators without a separator", () => {
    expect(formatOdds(94)).toBe("1/94");
  });

  it("formats 1 as 1/1", () => {
    expect(formatOdds(1)).toBe("1/1");
  });
});

describe("formatGenderRate", () => {
  it("formats -1 as Genderless", () => {
    expect(formatGenderRate(-1)).toBe("Genderless");
  });

  it("formats 0 as Male only", () => {
    expect(formatGenderRate(0)).toBe("Male only");
  });

  it("formats 8 as Female only", () => {
    expect(formatGenderRate(8)).toBe("Female only");
  });

  it("formats a mixed rate as a percentage female", () => {
    expect(formatGenderRate(1)).toBe("13% female"); // 1/8 = 12.5%, rounds to 13
    expect(formatGenderRate(4)).toBe("50% female");
    expect(formatGenderRate(7)).toBe("88% female"); // 7/8 = 87.5%, rounds to 88
  });
});

describe("errorMessage", () => {
  it("extracts .message from a real Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("extracts .message from a plain object (HMR realm boundary case)", () => {
    expect(errorMessage({ message: "boom" })).toBe("boom");
  });

  it("returns null for null/undefined", () => {
    expect(errorMessage(null)).toBeNull();
    expect(errorMessage(undefined)).toBeNull();
  });

  it("returns null for a non-object", () => {
    expect(errorMessage("just a string")).toBeNull();
  });

  it("returns null for an object with no message property", () => {
    expect(errorMessage({ code: 500 })).toBeNull();
  });

  it("returns null when message isn't a string", () => {
    expect(errorMessage({ message: 42 })).toBeNull();
  });
});

/** Parses "translate(X%, Y%) scale(S)" back into numbers, so tests can assert on the actual geometry instead of an exact string. */
function parseTransform(transform: string): { tx: number; ty: number; scale: number } {
  const match = transform.match(/translate\(([-\d.]+)%, ([-\d.]+)%\) scale\(([-\d.]+)\)/);
  if (!match) throw new Error(`unparseable transform: ${transform}`);
  return { tx: Number(match[1]), ty: Number(match[2]), scale: Number(match[3]) };
}

describe("spriteCropTransform", () => {
  it("is a no-op (scale 1, no translation) for the full canvas", () => {
    const { tx, ty, scale } = parseTransform(spriteCropTransform(FULL_CANVAS_CROP));
    expect(scale).toBeCloseTo(1);
    expect(tx).toBeCloseTo(0);
    expect(ty).toBeCloseTo(0);
  });

  it("scales by 1/max(width,height) and centers an off-center crop", () => {
    // x=0.6,y=0.1,width=0.2,height=0.3 -> center (0.7, 0.25), scale 1/0.3
    const { tx, ty, scale } = parseTransform(
      spriteCropTransform({ x: 0.6, y: 0.1, width: 0.2, height: 0.3 }),
    );
    expect(scale).toBeCloseTo(1 / 0.3);
    expect(tx).toBeCloseTo((1 / 0.3) * (0.5 - 0.7) * 100);
    expect(ty).toBeCloseTo((1 / 0.3) * (0.5 - 0.25) * 100);
  });

  it("matches Unown B's real measured crop (centered content, ~3x zoom)", () => {
    // Measured directly from the real sprite: content fills only ~23%x33% of
    // its 96x96 canvas, but that content happens to sit centered.
    const { tx, ty, scale } = parseTransform(
      spriteCropTransform({ x: 0.385, y: 0.333, width: 0.229, height: 0.333 }),
    );
    expect(scale).toBeCloseTo(3.0, 1);
    expect(tx).toBeCloseTo(0, 0);
    expect(ty).toBeCloseTo(0, 0);
  });

  it("returns a no-op transform for a degenerate (zero-size) crop instead of dividing by zero", () => {
    expect(spriteCropTransform({ x: 0, y: 0, width: 0, height: 0 })).toBe("none");
  });
});
