import { describe, it, expect } from "vitest";
import {
  parseMarkerFromContent,
  buildMarkerTemplate,
  CSA_MARKER,
  parseMarkerLine,
} from "../src/marker.js";

describe("marker parsing (semântica confirmada no JAR 1.13.2)", () => {
  it("builds template apenas com placeholders confirmados", () => {
    const template = buildMarkerTemplate();
    expect(template).toContain(CSA_MARKER);
    expect(template).toContain("{dex_unformatted}");
    expect(template).toContain("{level_unformatted}");
    expect(template).toContain("{x}");
    expect(template).toContain("{y}");
    expect(template).toContain("{z}");
    expect(template).toContain("{biome_unformatted}");
    expect(template).toContain("{bucket_unformatted}");
    expect(template).toContain("{shiny_unformatted}");
    expect(template).toContain("{legendary_unformatted}");
    expect(template).toContain("{hidden_ability_unformatted}");
    expect(template).toContain("{name}");
    expect(template).toContain("{nearest_player_unformatted}");
    expect(template).toContain("{timestamp}");
    expect(template).not.toContain("{mythical_unformatted}");
    expect(template).not.toContain("{ultrabeast_unformatted}");
    expect(template).not.toContain("{paradox_unformatted}");
  });

  it("parses marker from content with noise around it", () => {
    const content =
      "Some noise before\n" +
      "PC_CSA_V1|dex=25|lvl=50|x=1234|y=64|z=-567|biome=Savanna|bucket=Ultra Rare|shiny= |rarity= |ha= |name=Pikachu|player=Steve|ts=1754400000000\n" +
      "Some noise after";
    const result = parseMarkerFromContent(content);

    expect(result).not.toBeNull();
    expect(result!.confidence).toBe("high");
    expect(result!.event.dexNumber).toBe(25);
    expect(result!.event.level).toBe(50);
    expect(result!.event.displayName).toBe("Pikachu");
    expect(result!.event.biome).toBe("Savanna");
    expect(result!.event.bucket).toBe("Ultra Rare");
  });

  it("returns null for content without marker", () => {
    const result = parseMarkerFromContent("No marker here");
    expect(result).toBeNull();
  });

  it("shiny false quando string vazia", () => {
    const content =
      "PC_CSA_V1|dex=25|lvl=50|x=1|y=1|z=1|biome=Forest|bucket=Common|shiny=|rarity=|ha=|name=Pikachu|player=|ts=1754400000000";
    const result = parseMarkerLine(content);
    expect(result!.event.shiny).toBe(false);
    expect(result!.confidence).toBe("high");
  });

  it("shiny true apenas com a string exata 'Shiny' (trailing space removido)", () => {
    const content =
      "PC_CSA_V1|dex=25|lvl=50|x=1|y=1|z=1|biome=Forest|bucket=Common|shiny=Shiny |rarity=|ha=|name=Pikachu|player=|ts=1754400000000";
    const result = parseMarkerLine(content);
    expect(result!.event.shiny).toBe(true);
  });

  it("shiny N/A tratado como false", () => {
    const content =
      "PC_CSA_V1|dex=25|lvl=50|x=1|y=1|z=1|biome=Forest|bucket=Common|shiny=N/A|rarity=N/A|ha=N/A|name=Pikachu|player=|ts=1754400000000";
    const result = parseMarkerLine(content);
    expect(result!.event.shiny).toBe(false);
    expect(result!.event.legendary).toBe(false);
  });

  it("texto desconhecido em shiny NÃO vira true (confiança baixa)", () => {
    const content =
      "PC_CSA_V1|dex=25|lvl=50|x=1|y=1|z=1|biome=Forest|bucket=Common|shiny=yes|rarity=|ha=|name=Pikachu|player=|ts=1754400000000";
    const result = parseMarkerLine(content);
    expect(result!.event.shiny).toBeUndefined();
    expect(result!.confidence).toBe("low");
  });

  it("rarity Legendary define legendary=true", () => {
    const content =
      "PC_CSA_V1|dex=144|lvl=70|x=1|y=1|z=1|biome=Tundra|bucket=Ultra Rare|shiny=|rarity=Legendary|ha=|name=Articuno|player=|ts=1754400000000";
    const result = parseMarkerLine(content);
    expect(result!.event.legendary).toBe(true);
    expect(result!.event.mythical).toBe(false);
    expect(result!.event.ultraBeast).toBe(false);
    expect(result!.event.paradox).toBe(false);
  });

  it("rarity Mythical define mythical=true", () => {
    const content =
      "PC_CSA_V1|dex=151|lvl=60|x=1|y=1|z=1|biome=Jungle|bucket=Ultra Rare|shiny=|rarity=Mythical|ha=|name=Mew|player=|ts=1754400000000";
    const result = parseMarkerLine(content);
    expect(result!.event.mythical).toBe(true);
    expect(result!.event.legendary).toBe(false);
  });

  it("rarity 'Ultra Beast' define ultraBeast=true", () => {
    const content =
      "PC_CSA_V1|dex=795|lvl=65|x=1|y=1|z=1|biome=Swamp|bucket=Ultra Rare|shiny=|rarity=Ultra Beast|ha=|name=Pheromosa|player=|ts=1754400000000";
    const result = parseMarkerLine(content);
    expect(result!.event.ultraBeast).toBe(true);
  });

  it("rarity Paradox define paradox=true", () => {
    const content =
      "PC_CSA_V1|dex=984|lvl=58|x=1|y=1|z=1|biome=Badlands|bucket=Ultra Rare|shiny=|rarity=Paradox|ha=|name=Great Tusk|player=|ts=1754400000000";
    const result = parseMarkerLine(content);
    expect(result!.event.paradox).toBe(true);
  });

  it("rarity vazio define todos os flags como false", () => {
    const content =
      "PC_CSA_V1|dex=25|lvl=50|x=1|y=1|z=1|biome=Forest|bucket=Common|shiny=|rarity=|ha=|name=Pikachu|player=|ts=1754400000000";
    const result = parseMarkerLine(content);
    expect(result!.event.legendary).toBe(false);
    expect(result!.event.mythical).toBe(false);
    expect(result!.event.ultraBeast).toBe(false);
    expect(result!.event.paradox).toBe(false);
  });

  it("rarity desconhecido NÃO vira flag (confiança baixa)", () => {
    const content =
      "PC_CSA_V1|dex=6|lvl=36|x=1|y=1|z=1|biome=Volcano|bucket=Ultra Rare|shiny=|rarity=SomethingUnknown|ha=|name=Charizard|player=|ts=1754400000000";
    const result = parseMarkerLine(content);
    expect(result!.event.legendary).toBeUndefined();
    expect(result!.confidence).toBe("low");
  });

  it("hidden ability true apenas com 'Hidden Ability'", () => {
    const content =
      "PC_CSA_V1|dex=6|lvl=36|x=1|y=1|z=1|biome=Volcano|bucket=Ultra Rare|shiny=|rarity=|ha=Hidden Ability |name=Charizard|player=|ts=1754400000000";
    const result = parseMarkerLine(content);
    expect(result!.event.hiddenAbility).toBe(true);
  });

  it("timestamp em milissegundos (JAR usa System.currentTimeMillis)", () => {
    const content =
      "PC_CSA_V1|dex=25|lvl=50|x=1|y=1|z=1|biome=Forest|bucket=Common|shiny=|rarity=|ha=|name=Pikachu|player=|ts=1754400000000";
    const result = parseMarkerLine(content);
    expect(result!.event.receivedAt).toBe(new Date(1754400000000).toISOString());
  });

  it("timestamp em segundos também é tolerado", () => {
    const content =
      "PC_CSA_V1|dex=25|lvl=50|x=1|y=1|z=1|biome=Forest|bucket=Common|shiny=|rarity=|ha=|name=Pikachu|player=|ts=1700000000";
    const result = parseMarkerLine(content);
    expect(result!.event.receivedAt).toBe(new Date(1700000000000).toISOString());
  });

  it("nível absurdo é rejeitado (confiança baixa)", () => {
    const content =
      "PC_CSA_V1|dex=25|lvl=9999|x=1|y=1|z=1|biome=Forest|bucket=Common|shiny=|rarity=|ha=|name=Pikachu|player=|ts=1754400000000";
    const result = parseMarkerLine(content);
    expect(result!.event.level).toBeUndefined();
    expect(result!.confidence).toBe("low");
  });

  it("coordenada absurda é rejeitada", () => {
    const content =
      "PC_CSA_V1|dex=25|lvl=50|x=999999999|y=1|z=1|biome=Forest|bucket=Common|shiny=|rarity=|ha=|name=Pikachu|player=|ts=1754400000000";
    const result = parseMarkerLine(content);
    expect(result!.event.coordinates?.x).toBeUndefined();
    expect(result!.confidence).toBe("low");
  });

  it("coordenadas N/A são toleradas", () => {
    const content =
      "PC_CSA_V1|dex=25|lvl=50|x=N/A|y=N/A|z=N/A|biome=Forest|bucket=Common|shiny=|rarity=|ha=|name=Pikachu|player=|ts=1754400000000";
    const result = parseMarkerLine(content);
    expect(result!.event.coordinates).toBeUndefined();
  });

  it("remove markup Discord dos valores", () => {
    const content =
      "PC_CSA_V1|dex=25|lvl=50|x=1|y=1|z=1|biome=**Forest**|bucket=Common|shiny=|rarity=|ha=|name=~~Pikachu~~|player=|ts=1754400000000";
    const result = parseMarkerLine(content);
    expect(result!.event.biome).toBe("Forest");
    expect(result!.event.displayName).toBe("Pikachu");
  });

  it("normaliza Unicode (NFKC)", () => {
    const content =
      "PC_CSA_V1|dex=25|lvl=50|x=1|y=1|z=1|biome=Forest|bucket=Common|shiny=|rarity=|ha=|name=\uFF30ikachu|player=|ts=1754400000000";
    const result = parseMarkerLine(content);
    expect(result!.event.displayName).toBe("Pikachu");
  });

  it("limita tamanho de strings", () => {
    const hugeName = "A".repeat(500);
    const content = `PC_CSA_V1|dex=25|lvl=50|x=1|y=1|z=1|biome=Forest|bucket=Common|shiny=|rarity=|ha=|name=${hugeName}|player=|ts=1754400000000`;
    const result = parseMarkerLine(content);
    expect(result!.event.displayName?.length).toBeLessThanOrEqual(256);
  });

  it("rejeita linha maior que o limite", () => {
    const huge = "A".repeat(5000);
    const result = parseMarkerLine(`PC_CSA_V1|dex=${huge}`);
    expect(result).toBeNull();
  });
});
