import { describe, it, expect } from "vitest";
import { buildDeliveryPlan } from "../src/handlers.js";
import type { SpawnAlertEvent } from "@bigbangcraft/domain";
import type { AppConfig } from "@bigbangcraft/config";

function fakeConfig(overrides: Partial<AppConfig>): AppConfig {
  return {
    BIGMONCRAFT_SERVER_ID: "bigmoncraft",
    BIGMONCRAFT_SERVER_NAME: "BigMonCraft",
    BIGMONCRAFT_SERVER_ADDRESS: "bigmoncraft.bigbangcraft.com.br",
    SPAWN_COORDINATE_POLICY: "hidden",
    SPAWN_REGION_GRID_SIZE: 500,
    SPAWN_SHOW_NEAREST_PLAYER: false,
    DISCORD_SPAWN_ALERT_CHANNEL_ID: "111111111111111111",
    DISCORD_PRIVATE_SPAWN_ALERT_CHANNEL_ID: "222222222222222222",
    DISCORD_SHINY_ALERT_ROLE_ID: "333333333333333333",
    DISCORD_LEGENDARY_ALERT_ROLE_ID: "444444444444444444",
    DISCORD_TOKEN: "token",
    ...overrides,
  } as AppConfig;
}

const event: SpawnAlertEvent = {
  source: "csa",
  sourceVersion: "1.13.2",
  serverId: "bigmoncraft",
  receivedAt: new Date().toISOString(),
  dexNumber: 25,
  displayName: "Pikachu",
  level: 50,
  shiny: false,
  legendary: false,
  coordinates: { x: 100, y: 64, z: 200 },
};

describe("buildDeliveryPlan (privacidade e menções)", () => {
  it("hidden: canal público, sem coordenadas no plano", () => {
    const plan = buildDeliveryPlan(event, "spawn-1", fakeConfig({}));
    expect(plan).not.toBeNull();
    expect(plan!.channelId).toBe("111111111111111111");
    expect(plan!.coordinatePolicy).toBe("hidden");
  });

  it("hidden: sem menções para evento comum", () => {
    const plan = buildDeliveryPlan(event, "spawn-1", fakeConfig({}));
    expect(plan!.roleIds).toEqual([]);
  });

  it("shiny: apenas a role shiny é mencionada", () => {
    const plan = buildDeliveryPlan({ ...event, shiny: true }, "spawn-1", fakeConfig({}));
    expect(plan!.roleIds).toEqual(["333333333333333333"]);
  });

  it("legendary: apenas a role lendária é mencionada", () => {
    const plan = buildDeliveryPlan({ ...event, legendary: true }, "spawn-1", fakeConfig({}));
    expect(plan!.roleIds).toEqual(["444444444444444444"]);
  });

  it("mythical/ultraBeast/paradox: usam a role lendária", () => {
    for (const flag of [{ mythical: true }, { ultraBeast: true }, { paradox: true }] as const) {
      const plan = buildDeliveryPlan({ ...event, ...flag }, "spawn-1", fakeConfig({}));
      expect(plan!.roleIds).toEqual(["444444444444444444"]);
    }
  });

  it("shiny + legendary: ambas as roles, sem @everyone/@here", () => {
    const plan = buildDeliveryPlan(
      { ...event, shiny: true, legendary: true },
      "spawn-1",
      fakeConfig({}),
    );
    expect(plan!.roleIds).toEqual(["333333333333333333", "444444444444444444"]);
    expect(plan!.roleIds.join(" ")).not.toContain("everyone");
    expect(plan!.roleIds.join(" ")).not.toContain("here");
  });

  it("exact_admin_only: entrega no canal privado", () => {
    const plan = buildDeliveryPlan(
      event,
      "spawn-1",
      fakeConfig({ SPAWN_COORDINATE_POLICY: "exact_admin_only" }),
    );
    expect(plan).not.toBeNull();
    expect(plan!.channelId).toBe("222222222222222222");
    expect(plan!.coordinatePolicy).toBe("exact_admin_only");
  });

  it("exact_admin_only sem canal privado: nenhuma entrega", () => {
    const plan = buildDeliveryPlan(
      event,
      "spawn-1",
      fakeConfig({
        SPAWN_COORDINATE_POLICY: "exact_admin_only",
        DISCORD_PRIVATE_SPAWN_ALERT_CHANNEL_ID: undefined,
      }),
    );
    expect(plan).toBeNull();
  });

  it("sem canal público configurado: nenhuma entrega", () => {
    const plan = buildDeliveryPlan(
      event,
      "spawn-1",
      fakeConfig({ DISCORD_SPAWN_ALERT_CHANNEL_ID: undefined }),
    );
    expect(plan).toBeNull();
  });
});
