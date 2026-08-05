import { describe, it, expect } from "vitest";
import { parseMarkerFromContent, buildMarkerTemplate } from "../src/marker.js";

describe("marker parsing", () => {
  it("builds valid template", () => {
    const template = buildMarkerTemplate();
    expect(template).toContain("PC_CSA_V1");
    expect(template).toContain("{dex_unformatted}");
    expect(template).toContain("{name}");
    expect(template).toContain("{timestamp}");
  });

  it("parses marker from content string", () => {
    const content =
      "Some noise before\nPC_CSA_V1|dex=25|lvl=50|x=1234|y=64|z=-567|biome=Savanna|bucket=ULTRA_RARE|shiny= |leg= |myth= |ub= |par= |ha= |name=Pikachu|player=Steve|ts=1700000000\nSome noise after";
    const result = parseMarkerFromContent(content);

    expect(result).not.toBeNull();
    expect(result!.confidence).toBe("high");
    expect(result!.event.dexNumber).toBe(25);
    expect(result!.event.level).toBe(50);
    expect(result!.event.displayName).toBe("Pikachu");
    expect(result!.event.biome).toBe("Savanna");
    expect(result!.event.bucket).toBe("ULTRA_RARE");
  });

  it("returns null for content without marker", () => {
    const result = parseMarkerFromContent("No marker here");
    expect(result).toBeNull();
  });

  it("parses shiny flag", () => {
    const content =
      "PC_CSA_V1|dex=25|lvl=50|x=1|y=1|z=1|biome=Forest|bucket=RARE|shiny=true|leg=false|myth= |ub= |par= |ha= |name=Pikachu|player=Steve|ts=1";
    const result = parseMarkerFromContent(content);
    expect(result!.event.shiny).toBe(true);
  });

  it("parses legendary flag", () => {
    const content =
      "PC_CSA_V1|dex=144|lvl=70|x=1|y=1|z=1|biome=Tundra|bucket=LEGENDARY|shiny= |leg=Legendary |myth= |ub= |par= |ha= |name=Articuno|player=Steve|ts=1";
    const result = parseMarkerFromContent(content);
    expect(result!.event.legendary).toBe(true);
  });
});
