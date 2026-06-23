import { describe, expect, it } from "vitest";
import { errorMessage, formatGenderRate, formatOdds, parseJsonArray } from "./format";

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
