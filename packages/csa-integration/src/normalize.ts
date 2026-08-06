import type { SpawnAlertEvent } from "@bigbangcraft/domain";
import { parseMarkerFromContent } from "./marker.js";
import type { CsaWebhookPayload } from "./payload.js";

export interface NormalizeOptions {
  sourceVersion: string;
  serverId: string;
  /** Quando true, o evento é rejeitado se o conteúdo não contiver o marcador PC_CSA_V1. */
  requireMarker?: boolean;
}

export type NormalizeResult =
  | { ok: true; event: SpawnAlertEvent }
  | { ok: false; code: "CSA_MARKER_MISSING" | "CSA_MARKER_UNPARSEABLE"; message: string };

/**
 * Normaliza um payload CSA 1.13.2 em um SpawnAlertEvent.
 *
 * Ordem garantida: validação do payload -> parsing do marcador PC_CSA_V1 ->
 * normalização (Unicode NFKC, remoção de markup Discord, limites) -> evento.
 *
 * Em modo relay (requireMarker), payload sem marcador é rejeitado.
 * Caso contrário, um fallback com confiança baixa é produzido a partir do
 * primeiro embed (usado apenas no modo direto/Discord nativo).
 */
export function normalizeCsaEvent(
  payload: CsaWebhookPayload,
  options: NormalizeOptions,
): NormalizeResult {
  const marker = parseMarkerFromContent(payload.content);

  if (marker && marker.confidence === "high") {
    return { ok: true, event: buildEvent(payload, options, marker.event) };
  }

  if (marker) {
    return {
      ok: false,
      code: "CSA_MARKER_UNPARSEABLE",
      message: "O marcador PC_CSA_V1 foi detectado, mas não pôde ser interpretado com segurança.",
    };
  }

  if (options.requireMarker) {
    return {
      ok: false,
      code: "CSA_MARKER_MISSING",
      message: "A notificação não contém o marcador PC_CSA_V1 esperado do CSA 1.13.2.",
    };
  }

  const now = new Date().toISOString();
  let description = "";
  if (Array.isArray(payload.embeds) && payload.embeds[0]?.description) {
    description = payload.embeds[0].description;
  } else if (typeof payload.content === "string") {
    description = payload.content;
  }

  return {
    ok: true,
    event: {
      source: "csa",
      sourceVersion: options.sourceVersion,
      serverId: options.serverId,
      receivedAt: now,
      displayName: extractField(description, "Pokémon"),
      level: parseIntFrom(description, "Level"),
      biome: extractField(description, "Bioma"),
      parsedConfidence: "low",
      rawMessage: payload.content ?? description,
    },
  };
}

function buildEvent(
  payload: CsaWebhookPayload,
  options: NormalizeOptions,
  markerEvent: Partial<SpawnAlertEvent>,
): SpawnAlertEvent {
  const now = new Date().toISOString();
  return {
    source: "csa",
    sourceVersion: options.sourceVersion,
    serverId: options.serverId,
    receivedAt: markerEvent.receivedAt ?? now,
    species: markerEvent.species,
    displayName: markerEvent.displayName,
    dexNumber: markerEvent.dexNumber,
    level: markerEvent.level,
    shiny: markerEvent.shiny,
    legendary: markerEvent.legendary,
    mythical: markerEvent.mythical,
    ultraBeast: markerEvent.ultraBeast,
    paradox: markerEvent.paradox,
    hiddenAbility: markerEvent.hiddenAbility,
    rarity: markerEvent.rarity,
    bucket: markerEvent.bucket,
    biome: markerEvent.biome,
    coordinates: markerEvent.coordinates,
    nearestPlayer: markerEvent.nearestPlayer,
    parsedConfidence: "high",
    rawMessage: payload.content,
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
