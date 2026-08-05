import { Redis } from "ioredis";
import { Queue } from "bullmq";
import { QUEUE_NAMES, buildDefaultJobOptions } from "./jobs.js";

export interface QueueConnectionConfig {
  redisUrl: string;
  redisPassword?: string;
  keyPrefix: string;
}

export function createRedisClient(config: QueueConnectionConfig): Redis {
  const client = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  return client;
}

export interface QueueSet {
  spawnAlerts: Queue;
  spawnDelivery: Queue;
  maintenance: Queue;
  usageAggregation: Queue;
}

export function createQueues(redisClient: Redis, keyPrefix: string): QueueSet {
  const prefix = keyPrefix.endsWith(":") ? keyPrefix : `${keyPrefix}:`;
  const defaultJobOptions = buildDefaultJobOptions();

  return {
    spawnAlerts: new Queue(QUEUE_NAMES.SPAWN_ALERTS, {
      connection: redisClient,
      prefix,
      defaultJobOptions: { ...defaultJobOptions, attempts: 3 },
    }),
    spawnDelivery: new Queue(QUEUE_NAMES.SPAWN_DELIVERY, {
      connection: redisClient,
      prefix,
      defaultJobOptions: { ...defaultJobOptions, attempts: 5 },
    }),
    maintenance: new Queue(QUEUE_NAMES.MAINTENANCE, {
      connection: redisClient,
      prefix,
      defaultJobOptions,
    }),
    usageAggregation: new Queue(QUEUE_NAMES.USAGE_AGGREGATION, {
      connection: redisClient,
      prefix,
      defaultJobOptions,
    }),
  };
}

export async function getQueueMetrics(
  queues: QueueSet,
): Promise<Array<{ queue: string; waiting: number; active: number; failed: number }>> {
  const results: Array<{ queue: string; waiting: number; active: number; failed: number }> = [];
  const metrics = [
    { name: "spawn-alerts", queue: queues.spawnAlerts },
    { name: "spawn-delivery", queue: queues.spawnDelivery },
    { name: "maintenance", queue: queues.maintenance },
    { name: "usage-aggregation", queue: queues.usageAggregation },
  ];
  for (const entry of metrics) {
    const waiting = await entry.queue.getWaitingCount();
    const active = await entry.queue.getActiveCount();
    const failed = await entry.queue.getFailedCount();
    results.push({ queue: entry.name, waiting, active, failed });
  }
  return results;
}

export { Redis };
