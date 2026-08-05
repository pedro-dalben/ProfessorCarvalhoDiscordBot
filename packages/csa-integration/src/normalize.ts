import type { SpawnAlertEvent } from "@bigbangcraft/domain";
import { parseMarkerFromContent } from "./marker.js";
import type { CsaWebhookPayload } from "./payload.js";

export interface NormalizeOptions {
  sourceVersion: string;
  serverId: string;
}

export function normalizeCsaEvent(
  payload: CsaWebhookPayload,
  options: NormalizeOptions,
): SpawnAlertEvent {
  const now = new Date().toISOString();
  const marker = parseMarkerFromContent(payload.content);

  if (marker && marker.confidence === "high") {
    return {
      source: "csa",
      sourceVersion: options.sourceVersion,
      serverId: options.serverId,
      receivedAt: marker.event.receivedAt ?? now,
      species: marker.event.species,
      displayName: marker.event.displayName,
      dexNumber: marker.event.dexNumber,
      level: marker.event.level,
      shiny: marker.event.shiny,
      legendary: marker.event.legendary,
      mythical: marker.event.mythical,
      ultraBeast: marker.event.ultraBeast,
      paradox: marker.event.paradox,
      hiddenAbility: marker.event.hiddenAbility,
      rarity: marker.event.rarity,
      bucket: marker.event.bucket,
      biome: marker.event.biome,
      coordinates: marker.event.coordinates,
      nearestPlayer: marker.event.nearestPlayer,
      parsedConfidence: "high",
      rawMessage: payload.content,
    };
  }

  let description = "";
  if (Array.isArray(payload.embeds) && payload.embeds[0]?.description) {
    description = payload.embeds[0].description;
  } else if (typeof payload.content === "string") {
    description = payload.content;
  }

  return {
    source: "csa",
    sourceVersion: options.sourceVersion,
    serverId: options.serverId,
    receivedAt: now,
    displayName: extractField(description, "Pokémon"),
    level: parseIntFrom(description, "Level"),
    biome: extractField(description, "Bioma"),
    parsedConfidence: "low",
    rawMessage: payload.content ?? description,
  };
}

function extractField(text: string, label: string): string | undefined {
  const regex = new RegExp(`\\*\\*${escapeRegex(label)}\\*\\*\\s*:?\\s*([^\\n]+)`);
  const match = regex.exec(text);
  return match ? match[1]?.trim() : undefined;
}

function parseIntFrom(text: string, label: string): number | undefined {
  const value = extractField(text, label);
  if (!value) return undefined;
  const num = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(num) ? num : undefined;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
