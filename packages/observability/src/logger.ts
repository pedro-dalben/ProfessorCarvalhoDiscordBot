import pino, { type Logger } from "pino";

export const LOG_REDACT_PATHS = [
  "*.token",
  "*.sourceToken",
  "*.CSA_SOURCE_TOKEN",
  "*.DISCORD_TOKEN",
  "*.DISCORD_WEBHOOK_URL",
  "*.METRICS_BEARER_TOKEN",
  "*.GATEWAY_SHARED_SECRET",
  "*.authorization",
  "*.cookie",
  "*authorization*",
  "*cookie*",
  "headers.authorization",
  "headers.cookie",
  "headers['set-cookie']",
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers['set-cookie']",
  "payload.token",
  "config.databaseUrl",
  "config.redisUrl",
];

export function sanitizeTokenizedUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, "http://internal");
    const segments = url.pathname.split("/").filter(Boolean);
    const sanitized = segments.map((segment, index) => {
      if (segments[index - 1] === "csa" || segment.length >= 32) {
        return "<redacted>";
      }
      return segment;
    });
    return `${url.pathname ? "" : "/"}${sanitized.join("/")}${url.search ? "?<redacted>" : ""}`;
  } catch {
    return "<invalid-url>";
  }
}

export interface LoggerOptions {
  serviceName: string;
  environment: string;
  version: string;
  level: string;
}

export function createLogger(options: LoggerOptions): Logger {
  return pino({
    level: options.level,
    base: {
      service: options.serviceName,
      environment: options.environment,
      version: options.version,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: LOG_REDACT_PATHS,
      censor: "[REDACTED]",
    },
    serializers: {
      err: pino.stdSerializers.err,
      req(request: { method?: string; url?: string }): Record<string, unknown> {
        return {
          method: request.method,
          url: request.url ? sanitizeTokenizedUrl(request.url) : undefined,
        };
      },
    },
  });
}

export type AppLogger = Logger;
