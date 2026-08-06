import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export interface ProfessorMetrics {
  registry: Registry;
  discordReady: Gauge<string>;
  discordCommandTotal: Counter<string>;
  discordCommandDuration: Histogram<string>;
  discordCommandErrorTotal: Counter<string>;
  httpRequestTotal: Counter<string>;
  httpRequestDuration: Histogram<string>;
  csaEventReceivedTotal: Counter<string>;
  csaEventRejectedTotal: Counter<string>;
  csaEventDuplicateTotal: Counter<string>;
  csaParseFailureTotal: Counter<string>;
  csaQueueFailureTotal: Counter<string>;
  csaLastEventTimestamp: Gauge<string>;
  spawnAlertDeliveredTotal: Counter<string>;
  spawnAlertFailedTotal: Counter<string>;
  queueWaiting: Gauge<string>;
  queueActive: Gauge<string>;
  queueFailed: Gauge<string>;
  pokemonCacheHitTotal: Counter<string>;
  pokemonCacheMissTotal: Counter<string>;
  pokeapiRequestTotal: Counter<string>;
  pokeapiErrorTotal: Counter<string>;
  workerHeartbeatTimestamp: Gauge<string>;
  cobblemonSnapshotLoaded: Gauge<string>;
  cobblemonSnapshotAgeSeconds: Gauge<string>;
}

export function createMetrics(options: {
  includeDefaultMetrics?: boolean;
  registry?: Registry;
}): ProfessorMetrics {
  const registry = options.registry ?? new Registry();
  if (options.includeDefaultMetrics !== false) {
    collectDefaultMetrics({ register: registry });
  }

  const commandLabels = ["command", "status"] as const;

  return {
    registry,
    discordReady: new Gauge({
      name: "professor_discord_ready",
      help: "1 quando o bot está conectado ao Discord",
      registers: [registry],
    }),
    discordCommandTotal: new Counter({
      name: "professor_discord_command_total",
      help: "Total de comandos executados",
      labelNames: commandLabels,
      registers: [registry],
    }),
    discordCommandDuration: new Histogram({
      name: "professor_discord_command_duration_seconds",
      help: "Duração dos comandos em segundos",
      labelNames: ["command"],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry],
    }),
    discordCommandErrorTotal: new Counter({
      name: "professor_discord_command_error_total",
      help: "Total de erros em comandos",
      labelNames: commandLabels,
      registers: [registry],
    }),
    httpRequestTotal: new Counter({
      name: "professor_http_request_total",
      help: "Total de requisições HTTP recebidas",
      labelNames: ["method", "route", "status"],
      registers: [registry],
    }),
    httpRequestDuration: new Histogram({
      name: "professor_http_request_duration_seconds",
      help: "Duração das requisições HTTP em segundos",
      labelNames: ["method", "route"],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [registry],
    }),
    csaEventReceivedTotal: new Counter({
      name: "professor_csa_event_received_total",
      help: "Eventos CSA recebidos",
      labelNames: ["server"],
      registers: [registry],
    }),
    csaEventRejectedTotal: new Counter({
      name: "professor_csa_event_rejected_total",
      help: "Eventos CSA rejeitados",
      labelNames: ["reason"],
      registers: [registry],
    }),
    csaEventDuplicateTotal: new Counter({
      name: "professor_csa_event_duplicate_total",
      help: "Eventos CSA duplicados suprimidos",
      labelNames: ["server"],
      registers: [registry],
    }),
    csaParseFailureTotal: new Counter({
      name: "professor_csa_parse_failure_total",
      help: "Eventos CSA rejeitados por falha de parsing do marcador PC_CSA_V1",
      registers: [registry],
    }),
    csaQueueFailureTotal: new Counter({
      name: "professor_csa_queue_failure_total",
      help: "Eventos CSA que não puderam ser enfileirados ou persistidos",
      registers: [registry],
    }),
    csaLastEventTimestamp: new Gauge({
      name: "professor_csa_last_event_timestamp",
      help: "Timestamp do último evento CSA aceito",
      registers: [registry],
    }),
    spawnAlertDeliveredTotal: new Counter({
      name: "professor_spawn_alert_delivered_total",
      help: "Alertas de spawn entregues no Discord",
      labelNames: ["tier", "server"],
      registers: [registry],
    }),
    spawnAlertFailedTotal: new Counter({
      name: "professor_spawn_alert_failed_total",
      help: "Falhas na entrega de alertas de spawn",
      labelNames: ["tier", "reason"],
      registers: [registry],
    }),
    queueWaiting: new Gauge({
      name: "professor_queue_waiting",
      help: "Jobs aguardando processamento",
      labelNames: ["queue"],
      registers: [registry],
    }),
    queueActive: new Gauge({
      name: "professor_queue_active",
      help: "Jobs em processamento",
      labelNames: ["queue"],
      registers: [registry],
    }),
    queueFailed: new Gauge({
      name: "professor_queue_failed",
      help: "Jobs com falha",
      labelNames: ["queue"],
      registers: [registry],
    }),
    pokemonCacheHitTotal: new Counter({
      name: "professor_pokemon_cache_hit_total",
      help: "Consultas atendidas pelo cache",
      labelNames: ["cache"],
      registers: [registry],
    }),
    pokemonCacheMissTotal: new Counter({
      name: "professor_pokemon_cache_miss_total",
      help: "Consultas não atendidas pelo cache",
      labelNames: ["cache"],
      registers: [registry],
    }),
    pokeapiRequestTotal: new Counter({
      name: "professor_pokeapi_request_total",
      help: "Requisições enviadas à PokéAPI",
      labelNames: ["status"],
      registers: [registry],
    }),
    pokeapiErrorTotal: new Counter({
      name: "professor_pokeapi_error_total",
      help: "Erros de comunicação com a PokéAPI",
      labelNames: ["kind"],
      registers: [registry],
    }),
    workerHeartbeatTimestamp: new Gauge({
      name: "professor_worker_heartbeat_timestamp",
      help: "Timestamp do último heartbeat do worker",
      labelNames: ["worker"],
      registers: [registry],
    }),
    cobblemonSnapshotLoaded: new Gauge({
      name: "professor_cobblemon_snapshot_loaded",
      help: "1 quando o snapshot de spawns está carregado",
      registers: [registry],
    }),
    cobblemonSnapshotAgeSeconds: new Gauge({
      name: "professor_cobblemon_snapshot_age_seconds",
      help: "Idade do snapshot de spawns em segundos",
      registers: [registry],
    }),
  };
}
