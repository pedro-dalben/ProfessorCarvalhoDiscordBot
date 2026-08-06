export const JOB_NAMES = {
  PROCESS_CSA_ALERT: "process-csa-alert",
  DELIVER_DISCORD_SPAWN_ALERT: "deliver-discord-spawn-alert",
  CLEANUP_EXPIRED_EVENTS: "cleanup-expired-events",
  AGGREGATE_COMMAND_USAGE: "aggregate-command-usage",
  REFRESH_WORKER_HEARTBEAT: "refresh-worker-heartbeat",
} as const;

export const QUEUE_NAMES = {
  SPAWN_ALERTS: "spawn-alerts",
  SPAWN_DELIVERY: "spawn-delivery",
  MAINTENANCE: "maintenance",
  USAGE_AGGREGATION: "usage-aggregation",
} as const;

export interface DefaultJobOptions {
  attempts: number;
  backoff: { type: "exponential"; delay: number };
  removeOnComplete: { age: number } | boolean | number;
  removeOnFail: { age: number };
}

export function buildDefaultJobOptions(): DefaultJobOptions {
  const attempts = Number.parseInt(process.env.QUEUE_DEFAULT_ATTEMPTS ?? "5", 10);
  const backoffMs = Number.parseInt(process.env.QUEUE_DEFAULT_BACKOFF_MS ?? "2000", 10);
  // timeoutMs reserved for future job options configuration
  void Number.parseInt(process.env.QUEUE_JOB_TIMEOUT_MS ?? "15000", 10);

  return {
    attempts: Number.isFinite(attempts) ? attempts : 5,
    backoff: { type: "exponential", delay: backoffMs || 2000 },
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 7 * 86400 },
  };
}

export interface ProcessCsaAlertPayload {
  eventId: string;
  sourceId: string;
  sourceVersion: string;
  serverId: string;
}

export interface DeliverDiscordSpawnAlertPayload {
  spawnEventId: string;
  channelId: string;
  roleIds: string[];
  coordinatePolicy: "hidden" | "region" | "exact_admin_only";
  regionGridSize: number;
  serverAddress: string;
}

export interface CleanupExpiredEventsPayload {
  retainDays: number;
}
