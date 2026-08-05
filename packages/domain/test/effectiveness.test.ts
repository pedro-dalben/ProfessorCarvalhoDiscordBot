import { describe, it, expect } from "vitest";
import { calculateEffectiveness, groupByMultiplier } from "../src/effectiveness.js";

describe("calculateEffectiveness", () => {
  it("calculates single-type weaknesses correctly (Fire)", () => {
    const result = calculateEffectiveness(["fire"]);
    const grouped = groupByMultiplier(result);
    expect(grouped.multipliers[2]).toContain("water");
    expect(grouped.multipliers[2]).toContain("ground");
    expect(grouped.multipliers[2]).toContain("rock");
    expect(grouped.multipliers[0.5]).toContain("fire");
    expect(grouped.multipliers[0.5]).toContain("grass");
    expect(grouped.multipliers[0.5]).toContain("ice");
    expect(grouped.multipliers[0.5]).toContain("bug");
    expect(grouped.multipliers[0.5]).toContain("steel");
  });

  it("calculates dual-type effectiveness (Charizard: Fire/Flying)", () => {
    const result = calculateEffectiveness(["fire", "flying"]);
    const grouped = groupByMultiplier(result);
    expect(grouped.multipliers[4]).toContain("rock");
    expect(grouped.multipliers[2]).toContain("water");
    expect(grouped.multipliers[2]).toContain("electric");
    expect(grouped.multipliers[0]).toContain("ground");
  });

  it("handles immunity correctly (Normal vs Ghost)", () => {
    const result = calculateEffectiveness(["ghost"]);
    const grouped = groupByMultiplier(result);
    expect(grouped.multipliers[0]).toContain("normal");
    expect(grouped.multipliers[0]).toContain("fighting");
  });

  it("handles dual-type 0.25x correctly (Steel/Rock → Grass/Water = 0.5×0.5)", () => {
    const result = calculateEffectiveness(["steel", "rock"]);
    const grouped = groupByMultiplier(result);
    expect(grouped.multipliers[4]).toContain("fighting");
    expect(grouped.multipliers[4]).toContain("ground");
    expect(grouped.multipliers[1]).toContain("grass");
  });
});
