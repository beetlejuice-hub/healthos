import { describe, expect, it } from "vitest";
import { buckets, lowerBound, rolling, valueAt, type Point } from "./series";

const pts: Point[] = [[0, 60], [5, 62], [10, 140], [15, 61], [30, 58]];

describe("buckets — one per pixel column", () => {
  it("keeps the spike a mean would hide", () => {
    const [b] = buckets(pts, 0, 20, 1);
    expect(b).toMatchObject({ min: 60, max: 140, n: 4 });
    expect(b!.mean).toBeCloseTo(80.75, 9);
  });

  it("marks empty stretches as gaps", () => {
    const b = buckets(pts, 0, 40, 4);
    expect(b[2]).toBeNull();
    expect(b[3]).toMatchObject({ min: 58, max: 58 });
  });

  it("starts at the right point without scanning from the beginning", () => {
    expect(lowerBound(pts, 11)).toBe(3);
    expect(buckets(pts, 12, 20, 1)[0]).toMatchObject({ min: 61, max: 61, n: 1 });
  });
});

describe("valueAt and rolling", () => {
  it("reads the last value at or before a time", () => {
    expect(valueAt(pts, 12)).toEqual([10, 140]);
    expect(valueAt(pts, -1)).toBeNull();
  });

  it("averages the trailing k points", () => {
    expect(rolling([[0, 2], [1, 4], [2, 6], [3, 8]], 2).map((p) => p[1])).toEqual([2, 3, 5, 7]);
  });
});
