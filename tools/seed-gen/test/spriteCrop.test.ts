/**
 * Synthetic, network-free unit tests for computeAlphaBbox — the pure
 * pixel-scanning function spriteCrop.ts's cachedSpriteCrop builds on.
 * correctness.test.ts separately spot-checks the END-TO-END pipeline output
 * against real, hand-measured PokéAPI sprites (Unown B, Arceus Fire, Mega
 * Charizard X), but that only ever exercises whatever shapes those specific
 * live sprites happen to have. These tests construct exact, known pixel
 * patterns so edge cases (a single hot pixel, a fully-transparent image, an
 * asymmetric non-square canvas) are deterministically covered regardless of
 * what any live sprite looks like.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAlphaBbox, FULL_CANVAS_CROP } from "../src/spriteCrop.js";

/** Builds a width x height RGBA buffer where alpha is 255 at every (x,y) in `opaquePixels`, 0 elsewhere. */
function buildRgba(width: number, height: number, opaquePixels: Array<[number, number]>): { width: number; height: number; data: Buffer } {
  const data = Buffer.alloc(width * height * 4);
  for (const [x, y] of opaquePixels) {
    data[(y * width + x) * 4 + 3] = 255;
  }
  return { width, height, data };
}

test("a single opaque pixel produces a 1x1-pixel-wide crop at its exact position", () => {
  const png = buildRgba(10, 10, [[3, 4]]);
  const crop = computeAlphaBbox(png);
  assert.equal(crop.x, 3 / 10);
  assert.equal(crop.y, 4 / 10);
  assert.equal(crop.width, 1 / 10);
  assert.equal(crop.height, 1 / 10);
});

test("a fully opaque canvas produces the full-canvas crop", () => {
  const opaque: Array<[number, number]> = [];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) opaque.push([x, y]);
  const png = buildRgba(4, 4, opaque);
  assert.deepEqual(computeAlphaBbox(png), FULL_CANVAS_CROP);
});

test("a fully transparent canvas falls back to the full-canvas crop rather than a degenerate/negative-size box", () => {
  const png = buildRgba(8, 8, []);
  assert.deepEqual(computeAlphaBbox(png), FULL_CANVAS_CROP);
});

test("a rectangular opaque region produces the exact bounding box, inclusive of both edges", () => {
  // Opaque from (2,1) to (5,3) inclusive -> width 4, height 3, on a 10x6 canvas.
  const opaque: Array<[number, number]> = [];
  for (let y = 1; y <= 3; y++) for (let x = 2; x <= 5; x++) opaque.push([x, y]);
  const png = buildRgba(10, 6, opaque);
  const crop = computeAlphaBbox(png);
  assert.equal(crop.x, 2 / 10);
  assert.equal(crop.y, 1 / 6);
  assert.equal(crop.width, 4 / 10);
  assert.equal(crop.height, 3 / 6);
});

test("a non-square canvas is handled correctly — width and height fractions are independent of each other", () => {
  const png = buildRgba(200, 50, [[100, 25]]);
  const crop = computeAlphaBbox(png);
  assert.equal(crop.x, 100 / 200);
  assert.equal(crop.y, 25 / 50);
  assert.equal(crop.width, 1 / 200);
  assert.equal(crop.height, 1 / 50);
});

test("partially-transparent pixels (alpha between 1 and 254, e.g. anti-aliased edges) still count as content", () => {
  const width = 10;
  const height = 10;
  const data = Buffer.alloc(width * height * 4);
  data[(5 * width + 5) * 4 + 3] = 1; // barely-visible anti-aliased edge pixel
  const crop = computeAlphaBbox({ width, height, data });
  assert.equal(crop.x, 5 / 10);
  assert.equal(crop.y, 5 / 10);
});
