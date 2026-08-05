import { describe, it, expect } from "vitest";
import {
  roundToRegion,
  formatRegionPt,
  stripCoordinates,
  isCoordinatePolicy,
} from "../src/coordinates.js";

describe("roundToRegion", () => {
  it("rounds positive coordinates to grid", () => {
    const region = roundToRegion(1234, -567, 500);
    expect(region.xMin).toBe(1000);
    expect(region.xMax).toBe(1499);
    expect(region.zMin).toBe(-1000);
    expect(region.zMax).toBe(-501);
  });

  it("rounds coordinates at grid boundary", () => {
    const region = roundToRegion(0, 0, 500);
    expect(region.xMin).toBe(0);
    expect(region.xMax).toBe(499);
    expect(region.zMin).toBe(0);
    expect(region.zMax).toBe(499);
  });

  it("throws on non-finite values", () => {
    expect(() => roundToRegion(Number.POSITIVE_INFINITY, 0, 500)).toThrow();
    expect(() => roundToRegion(0, 0, -1)).toThrow();
  });
});

describe("formatRegionPt", () => {
  it("formats Brazilian Portuguese region", () => {
    const result = formatRegionPt({ xMin: 1000, xMax: 1499, zMin: -500, zMax: -1 });
    expect(result).toContain("X 1000");
    expect(result).toContain("Z -500");
  });
});

describe("stripCoordinates", () => {
  it("removes coordinate field", () => {
    const event = { species: "pikachu", coordinates: { x: 1, y: 2, z: 3 } };
    const stripped = stripCoordinates(event);
    expect(stripped.species).toBe("pikachu");
    expect(stripped.coordinates).toBeUndefined();
  });
});

describe("isCoordinatePolicy", () => {
  it("validates known policies", () => {
    expect(isCoordinatePolicy("hidden")).toBe(true);
    expect(isCoordinatePolicy("region")).toBe(true);
    expect(isCoordinatePolicy("exact_admin_only")).toBe(true);
    expect(isCoordinatePolicy("invalid")).toBe(false);
  });
});
