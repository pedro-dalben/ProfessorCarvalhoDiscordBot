import { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Redis } from "ioredis";
import type { AppConfig } from "@bigbangcraft/config";
import { isAllowed, parseCidrList } from "@bigbangcraft/csa-integration";
import type { AppLogger } from "@bigbangcraft/observability";
import type { DatabaseClient } from "@bigbangcraft/database";
import {
  consumeIdentityLinkCode,
  findActiveIdentity,
  upsertGatewayServer,
  storeGameEvent,
  processSessionStarted,
  processProfileSnapshot,
  processCaptureEvent,
  processEvolutionEvent,
} from "@bigbangcraft/database";
import { gatewayEvents, identityLinkAudit, playerProfileSnapshots } from "@bigbangcraft/database";
import { eq } from "drizzle-orm";
import { hashLinkCode, isValidLinkCode, normalizeLinkCode } from "../../identity/crypto.js";
import {
  bodySha256,
  canonicalRequest,
  GATEWAY_HEADERS,
  safeSignatureCompare,
  signRequest,
} from "../../gateway/protocol.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

type RecordValue = Record<string, unknown>;
type GatewayDeps = { config: AppConfig; logger: AppLogger; db: DatabaseClient; redis: Redis };

export function registerGatewayRoutes(app: FastifyInstance, deps: GatewayDeps): void {
  const options = {
    bodyLimit: deps.config.GATEWAY_BODY_LIMIT_BYTES,
    preParsing: captureRawBody,
  };
  app.post("/v1/gateway/events", options, (request, reply) => handleEvents(request, reply, deps));
  app.post("/v1/gateway/identity/link", options, (request, reply) =>
    handleLink(request, reply, deps),
  );
  app.post("/v1/gateway/profiles", options, (request, reply) =>
    handleProfile(request, reply, deps),
  );
  app.post("/v1/gateway/heartbeat", options, (request, reply) =>
    handleHeartbeat(request, reply, deps),
  );
}

async function captureRawBody(
  _request: FastifyRequest,
  _reply: FastifyReply,
  payload: NodeJS.ReadableStream,
): Promise<Readable> {
  const chunks: Buffer[] = [];
  for await (const chunk of payload)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks);
  _request.rawBody = raw;
  return Readable.from(raw);
}

interface GatewayAuth {
  body: RecordValue;
  bodyHash: string;
  requestId: string;
  serverId: string;
  gatewayVersion: string;
}

async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: GatewayDeps,
): Promise<GatewayAuth | null> {
  const { config, logger, redis } = deps;
  if (!config.GATEWAY_INGRESS_ENABLED) {
    reply
      .status(404)
      .send({ success: false, code: "GATEWAY_DISABLED", message: "Gateway desabilitado." });
    return null;
  }
  if (!(request.headers["content-type"] ?? "").toLowerCase().includes("application/json")) {
    reply.status(415).send({
      success: false,
      code: "GATEWAY_INVALID_CONTENT_TYPE",
      message: "Content-Type deve ser application/json.",
    });
    return null;
  }
  const serverId = header(request, GATEWAY_HEADERS.server);
  const timestamp = header(request, GATEWAY_HEADERS.timestamp);
  const requestId = header(request, GATEWAY_HEADERS.requestId);
  const gatewayVersion = header(request, GATEWAY_HEADERS.version);
  const receivedSignature = header(request, GATEWAY_HEADERS.signature);
  const rawBody = request.rawBody;
  if (!serverId || !timestamp || !requestId || !gatewayVersion || !receivedSignature || !rawBody) {
    return authError(
      reply,
      "GATEWAY_MISSING_HEADERS",
      "A requisição não contém os cabeçalhos obrigatórios.",
    );
  }
  if (!isUuid(requestId))
    return authError(
      reply,
      "GATEWAY_INVALID_REQUEST_ID",
      "O identificador da requisição é inválido.",
    );
  const timestampMs = Number(timestamp);
  if (
    !Number.isSafeInteger(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > config.GATEWAY_ALLOWED_CLOCK_SKEW_SECONDS * 1000
  ) {
    return authError(
      reply,
      "GATEWAY_TIMESTAMP_OUT_OF_RANGE",
      "O horário da requisição está fora da janela permitida.",
    );
  }
  if (gatewayVersion !== config.GATEWAY_PROTOCOL_VERSION) {
    return authError(
      reply,
      "GATEWAY_UNSUPPORTED_VERSION",
      "A versão do protocolo não é suportada.",
    );
  }
  const cidrs = parseCidrList(config.GATEWAY_ALLOWED_CIDRS);
  if (cidrs.length > 0 && (!request.ip || !isAllowed(request.ip, cidrs))) {
    logger.warn(
      { remoteIp: request.ip ?? "unknown", serverId },
      "Gateway recusado por origem não autorizada.",
    );
    return authError(
      reply,
      "GATEWAY_INVALID_SOURCE",
      "A origem da requisição não é autorizada.",
      403,
    );
  }
  const hash = bodySha256(rawBody);
  const canonical = canonicalRequest({
    method: request.method,
    path: request.url.split("?")[0] ?? request.url,
    serverId,
    timestamp,
    requestId,
    gatewayVersion,
    bodyHash: hash,
  });
  const expectedSignature = signRequest(config.GATEWAY_SHARED_SECRET ?? "", canonical);
  if (!safeSignatureCompare(expectedSignature, receivedSignature)) {
    return authError(
      reply,
      "GATEWAY_INVALID_SIGNATURE",
      "A assinatura da requisição é inválida.",
      401,
    );
  }
  const replayKey = `${config.REDIS_KEY_PREFIX}gateway:request:${requestId}`;
  const accepted = await redis.set(
    replayKey,
    "1",
    "EX",
    config.GATEWAY_REQUEST_REPLAY_TTL_SECONDS,
    "NX",
  );
  if (accepted !== "OK")
    return authError(reply, "GATEWAY_REPLAY", "A requisição já foi processada.", 409);
  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return authError(reply, "GATEWAY_INVALID_JSON", "O corpo da requisição não é um JSON válido.");
  }
  if (!isRecord(body))
    return authError(reply, "GATEWAY_INVALID_SCHEMA", "O corpo da requisição é inválido.");
  return { body, bodyHash: hash, requestId, serverId, gatewayVersion };
}

async function handleEvents(request: FastifyRequest, reply: FastifyReply, deps: GatewayDeps) {
  const auth = await authenticate(request, reply, deps);
  if (!auth) return;
  const event = parseEnvelope(auth.body);
  if (!event || event.serverId !== auth.serverId) {
    return reply.status(400).send({
      success: false,
      code: "GATEWAY_INVALID_SCHEMA",
      message: "O envelope do evento é inválido.",
    });
  }
  const existing = await deps.db
    .select()
    .from(gatewayEvents)
    .where(eq(gatewayEvents.eventId, event.eventId))
    .limit(1);
  if (existing[0]) {
    if (existing[0].bodyHash !== auth.bodyHash) {
      return reply.status(409).send({
        accepted: false,
        code: "EVENT_ID_CONFLICT",
        message: "O identificador do evento já possui outro conteúdo.",
      });
    }
    return reply.send({ accepted: true, eventId: event.eventId, duplicate: true });
  }
  try {
    await deps.db.insert(gatewayEvents).values({
      eventId: event.eventId,
      requestId: auth.requestId,
      serverId: auth.serverId,
      eventType: event.eventType,
      schemaVersion: event.schemaVersion,
      bodyHash: auth.bodyHash,
      status: "received",
      payload: event.payload,
      occurredAt: new Date(event.occurredAt),
      receivedAt: new Date(),
    });
  } catch (error) {
    if ((error as { code?: string }).code !== "23505") throw error;
    return reply.send({ accepted: true, eventId: event.eventId, duplicate: true });
  }
  void processGatewayEventForJourney(deps, event).catch((err) => {
    deps.logger.error({ err, eventId: event.eventId }, "Falha ao criar GameEvent da jornada.");
  });
  return reply.send({ accepted: true, eventId: event.eventId, duplicate: false });
}

async function processGatewayEventForJourney(
  deps: GatewayDeps,
  event: { eventId: string; eventType: string; schemaVersion: string; serverId: string; occurredAt: string; payload: unknown },
): Promise<void> {
  const journeyTypes = [
    "player.session.started",
    "player.session.ended",
    "pokemon.capture.completed",
    "pokemon.evolution.completed",
  ];
  if (!journeyTypes.includes(event.eventType)) return;

  const p = isRecord(event.payload) ? event.payload : {};
  const player = isRecord(p.player) ? p.player : {};
  const mcUuid =
    (typeof p.minecraftUuid === "string" ? p.minecraftUuid : undefined) ??
    (typeof player.minecraftUuid === "string" ? player.minecraftUuid : undefined);

  if (!mcUuid || !isUuid(mcUuid)) return;

  const result = await storeGameEvent({ db: deps.db }, {
    eventId: event.eventId,
    eventType: event.eventType,
    schemaVersion: event.schemaVersion,
    serverId: event.serverId,
    source: "gateway",
    sourceEventId: event.eventId,
    minecraftUuid: mcUuid,
    occurredAt: new Date(event.occurredAt),
    payload: p,
  });

  if (!result.dbId || result.duplicate) return;
  const linkId = result.identityLinkId ?? undefined;

  switch (event.eventType) {
    case "player.session.started":
      await processSessionStarted({ db: deps.db }, mcUuid, linkId);
      break;
    case "pokemon.capture.completed":
      await processCaptureEvent({ db: deps.db }, result.dbId, mcUuid, linkId, deps.config.BIGMONCRAFT_SERVER_ID, p);
      break;
    case "pokemon.evolution.completed":
      await processEvolutionEvent({ db: deps.db }, result.dbId, mcUuid, linkId, p);
      break;
    default:
      break;
  }
}

async function handleLink(request: FastifyRequest, reply: FastifyReply, deps: GatewayDeps) {
  const auth = await authenticate(request, reply, deps);
  if (!auth) return;
  const body = auth.body;
  const code = typeof body.code === "string" ? normalizeLinkCode(body.code) : "";
  const minecraftUuid = typeof body.minecraftUuid === "string" ? body.minecraftUuid : "";
  const minecraftName = typeof body.minecraftName === "string" ? body.minecraftName.trim() : "";
  if (
    !isValidLinkCode(code) ||
    !isUuid(minecraftUuid) ||
    minecraftName.length < 1 ||
    minecraftName.length > 16 ||
    body.serverId !== auth.serverId
  ) {
    return reply.status(400).send({
      success: false,
      code: "IDENTITY_INVALID_REQUEST",
      message: "Os dados de vinculação são inválidos.",
    });
  }
  const attemptKey = `${deps.config.REDIS_KEY_PREFIX}identity:attempt:${auth.serverId}:${minecraftUuid}`;
  const attempts = await deps.redis.incr(attemptKey);
  if (attempts === 1)
    await deps.redis.expire(attemptKey, deps.config.IDENTITY_LINK_CODE_TTL_SECONDS);
  if (attempts > deps.config.IDENTITY_LINK_CODE_MAX_ATTEMPTS) {
    return reply.status(429).send(linkFailure("IDENTITY_TOO_MANY_ATTEMPTS"));
  }
  const result = await consumeIdentityLinkCode(deps.db, {
    codeHash: hashLinkCode(code, deps.config.IDENTITY_LINK_CODE_PEPPER ?? ""),
    minecraftUuid,
    minecraftName,
    serverId: auth.serverId,
  });
  if (!result.success) return reply.status(409).send(linkFailure(result.code));
  await deps.redis.del(attemptKey);
  return reply.send({
    success: true,
    code: "IDENTITY_LINKED",
    message: "Conta vinculada com sucesso.",
    linkId: result.linkId,
  });
}

async function handleProfile(request: FastifyRequest, reply: FastifyReply, deps: GatewayDeps) {
  const auth = await authenticate(request, reply, deps);
  if (!auth) return;
  const event = parseEnvelope(auth.body);
  const player =
    event && isRecord(event.payload) && isRecord(event.payload.player)
      ? event.payload.player
      : null;
  const minecraftUuid =
    player && typeof player.minecraftUuid === "string" ? player.minecraftUuid : "";
  if (
    !event ||
    !player ||
    event.eventType !== "player.profile.snapshot" ||
    event.serverId !== auth.serverId ||
    !isUuid(minecraftUuid)
  ) {
    return reply.status(400).send({
      accepted: false,
      code: "GATEWAY_INVALID_SCHEMA",
      message: "O snapshot de perfil é inválido.",
    });
  }
  const existing = await deps.db
    .select()
    .from(gatewayEvents)
    .where(eq(gatewayEvents.eventId, event.eventId))
    .limit(1);
  if (existing[0]) {
    if (existing[0].bodyHash !== auth.bodyHash)
      return reply.status(409).send({
        accepted: false,
        code: "EVENT_ID_CONFLICT",
        message: "O identificador do evento já possui outro conteúdo.",
      });
    return reply.send({ accepted: true, eventId: event.eventId, duplicate: true });
  }
  const link = await findActiveIdentity(deps.db, { minecraftUuid, serverId: auth.serverId });
  if (!link)
    return reply.send({
      accepted: false,
      code: "IDENTITY_NOT_LINKED",
      message: "A conta Minecraft não possui uma vinculação ativa.",
    });
  const sanitized = sanitizeProfile(event.payload);
  await deps.db.transaction(async (tx) => {
    await tx.insert(gatewayEvents).values({
      eventId: event.eventId,
      requestId: auth.requestId,
      serverId: auth.serverId,
      eventType: event.eventType,
      schemaVersion: event.schemaVersion,
      bodyHash: auth.bodyHash,
      status: "processed",
      payload: sanitized,
      occurredAt: new Date(event.occurredAt),
      receivedAt: new Date(),
      processedAt: new Date(),
    });
    await tx
      .insert(playerProfileSnapshots)
      .values({
        linkId: link.id,
        minecraftUuid,
        minecraftName:
          typeof player.minecraftName === "string" ? player.minecraftName : link.minecraftName,
        serverId: auth.serverId,
        snapshotVersion: event.schemaVersion,
        snapshot: sanitized,
        capturedAt: new Date(event.occurredAt),
        receivedAt: new Date(),
        gatewayVersion: auth.gatewayVersion,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [playerProfileSnapshots.linkId, playerProfileSnapshots.serverId],
        set: {
          snapshot: sanitized,
          minecraftName:
            typeof player.minecraftName === "string" ? player.minecraftName : link.minecraftName,
          snapshotVersion: event.schemaVersion,
          capturedAt: new Date(event.occurredAt),
          receivedAt: new Date(),
          gatewayVersion: auth.gatewayVersion,
          updatedAt: new Date(),
        },
      });
    await tx.insert(identityLinkAudit).values({
      action: "profile.received",
      linkId: link.id,
      discordUserId: link.discordUserId,
      minecraftUuid,
      serverId: auth.serverId,
      actorType: "gateway",
      actorId: auth.serverId,
      metadata: { eventId: event.eventId },
      createdAt: new Date(),
    });
  });
  void (async () => {
    try {
      const result = await storeGameEvent({ db: deps.db }, {
        eventId: event.eventId,
        eventType: "player.profile.snapshot",
        schemaVersion: event.schemaVersion,
        serverId: auth.serverId,
        source: "gateway",
        sourceEventId: event.eventId,
        minecraftUuid,
        occurredAt: new Date(event.occurredAt),
        payload: sanitized,
      });
      if (result.dbId && !result.duplicate) {
        await processProfileSnapshot({ db: deps.db }, result.dbId, minecraftUuid, link.id, sanitized);
      }
    } catch (err) {
      deps.logger.error({ err, eventId: event.eventId }, "Falha ao processar snapshot da jornada.");
    }
  })();
  return reply.send({ accepted: true, eventId: event.eventId, duplicate: false });
}

async function handleHeartbeat(request: FastifyRequest, reply: FastifyReply, deps: GatewayDeps) {
  const auth = await authenticate(request, reply, deps);
  if (!auth) return;
  await upsertGatewayServer(deps.db, {
    serverId: auth.serverId,
    displayName:
      auth.serverId === deps.config.BIGMONCRAFT_SERVER_ID
        ? deps.config.BIGMONCRAFT_SERVER_NAME
        : auth.serverId,
    protocolVersion: auth.gatewayVersion,
    statusPayload: sanitizeHeartbeat(auth.body),
    gatewayVersion: stringValue(auth.body.gatewayVersion),
    minecraftVersion: stringValue(auth.body.minecraftVersion),
    fabricVersion: stringValue(auth.body.fabricLoaderVersion),
    cobblemonVersion: stringValue(auth.body.cobblemonVersion),
    bigbangessentialsVersion: stringValue(auth.body.bigBangEssentialsVersion),
  });
  return reply.send({ accepted: true, code: "OK", message: "Heartbeat recebido." });
}

function parseEnvelope(value: unknown): {
  eventId: string;
  eventType: string;
  schemaVersion: string;
  serverId: string;
  occurredAt: string;
  payload: unknown;
} | null {
  if (
    !isRecord(value) ||
    typeof value.eventId !== "string" ||
    !isUuid(value.eventId) ||
    typeof value.eventType !== "string" ||
    typeof value.schemaVersion !== "string" ||
    typeof value.serverId !== "string" ||
    typeof value.occurredAt !== "string" ||
    !Number.isFinite(Date.parse(value.occurredAt)) ||
    value.payload === null ||
    value.payload === undefined
  )
    return null;
  return {
    eventId: value.eventId,
    eventType: value.eventType,
    schemaVersion: value.schemaVersion,
    serverId: value.serverId,
    occurredAt: value.occurredAt,
    payload: value.payload,
  };
}

function sanitizeProfile(value: unknown): RecordValue {
  const source = isRecord(value) ? value : {};
  const player = isRecord(source.player) ? source.player : {};
  const progression = isRecord(source.progression) ? source.progression : {};
  const economy = isRecord(source.economy) ? source.economy : {};
  const cobblemon = isRecord(source.cobblemon) ? source.cobblemon : {};
  const modules = isRecord(source.modules) ? source.modules : {};
  return {
    player: {
      minecraftUuid: stringValue(player.minecraftUuid),
      minecraftName: stringValue(player.minecraftName),
      online: typeof player.online === "boolean" ? player.online : false,
    },
    progression: {
      rank: stringValue(progression.rank),
      playtimeSeconds: integerValue(progression.playtimeSeconds),
      jobs: Array.isArray(progression.jobs) ? progression.jobs.filter(isSafeJob) : [],
    },
    economy: { coins: sanitizeCoins(economy.coins), gems: sanitizeGems(economy.gems) },
    cobblemon: {
      available: cobblemon.available === true,
      party: Array.isArray(cobblemon.party) ? cobblemon.party.filter(isSafePartyMember) : [],
      pokedex: sanitizePokedex(cobblemon.pokedex),
    },
    modules: Object.fromEntries(
      Object.entries(modules).filter(
        ([key, value]) => /^[A-Za-z]+$/.test(key) && typeof value === "string",
      ),
    ),
    gateway: isRecord(source.gateway)
      ? {
          modVersion: stringValue(source.gateway.modVersion),
          protocolVersion: stringValue(source.gateway.protocolVersion),
        }
      : {},
  };
}

function sanitizeHeartbeat(value: RecordValue): RecordValue {
  const allowed = [
    "gatewayVersion",
    "protocolVersion",
    "minecraftVersion",
    "fabricLoaderVersion",
    "cobblemonVersion",
    "bigBangEssentialsVersion",
    "onlinePlayers",
    "linkedPlayersOnline",
    "spoolPending",
    "deadLetterCount",
    "uptimeSeconds",
    "modules",
  ];
  return Object.fromEntries(allowed.filter((key) => key in value).map((key) => [key, value[key]]));
}

function sanitizeCoins(value: unknown): RecordValue {
  const source = isRecord(value) ? value : {};
  return {
    available: source.available === true,
    amount: typeof source.amount === "string" ? source.amount : undefined,
    formatted: typeof source.formatted === "string" ? source.formatted : undefined,
  };
}
function sanitizeGems(value: unknown): RecordValue {
  const source = isRecord(value) ? value : {};
  return {
    available: source.available === true,
    amount: integerValue(source.amount),
    formatted: typeof source.formatted === "string" ? source.formatted : undefined,
  };
}
function sanitizePokedex(value: unknown): RecordValue {
  const source = isRecord(value) ? value : {};
  return {
    available: source.available === true,
    seen: integerValue(source.seen),
    caught: integerValue(source.caught),
    total: integerValue(source.total),
  };
}
function isSafeJob(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.displayName === "string" &&
    Number.isInteger(value.level) &&
    Number.isInteger(value.experience)
  );
}
function isSafePartyMember(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.species === "string" &&
    (value.form === null || typeof value.form === "string") &&
    typeof value.displayName === "string" &&
    Number.isInteger(value.level) &&
    typeof value.shiny === "boolean"
  );
}
function integerValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
function authError(reply: FastifyReply, code: string, message: string, status = 401): null {
  reply.status(status).send({ success: false, code, message });
  return null;
}
function linkFailure(code: string): RecordValue {
  const messages: Record<string, string> = {
    IDENTITY_INVALID_CODE: "Esse código de vinculação é inválido.",
    IDENTITY_CODE_EXPIRED: "Esse código expirou. Gere um novo código usando /vincular no Discord.",
    IDENTITY_CODE_CONSUMED: "Esse código já foi utilizado.",
    IDENTITY_TOO_MANY_ATTEMPTS: "Esse código excedeu o limite de tentativas.",
    IDENTITY_DISCORD_ALREADY_LINKED: "Sua conta do Discord já possui uma vinculação ativa.",
    IDENTITY_MINECRAFT_ALREADY_LINKED:
      "Esta conta Minecraft já está vinculada a outro usuário do Discord.",
  };
  return {
    success: false,
    code,
    message: messages[code] ?? "Não foi possível concluir a vinculação.",
  };
}
