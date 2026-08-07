import { z } from "zod";

const boolFromString = z
  .enum(["true", "false"])
  .default(() => "false" as const)
  .transform((value) => value === "true");

const positiveInt = z.coerce.number().int().positive();

export const CSA_MODES = ["relay", "direct", "disabled"] as const;
export type CsaIntegrationMode = (typeof CSA_MODES)[number];

export const BBSA_MODES = ["relay", "disabled"] as const;
export type BbsaIntegrationMode = (typeof BBSA_MODES)[number];

export const REGISTRATION_MODES = ["guild", "global"] as const;
export type CommandRegistrationMode = (typeof REGISTRATION_MODES)[number];

const snowflake = z.string().regex(/^\d{17,20}$/, "formato de snowflake do Discord inválido");

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  TZ: z.string().default("America/Sao_Paulo"),
  APP_NAME: z.string().default("Professor Carvalho"),
  APP_VERSION: z.string().default("0.1.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  HOST: z.string().default("0.0.0.0"),
  PORT: positiveInt.default(3000),
  TRUSTED_PROXY_ADDRESSES: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(/[,\s]+/).filter(Boolean) : undefined)),
  SHUTDOWN_TIMEOUT_MS: positiveInt.default(15000),

  DISCORD_TOKEN: z.string().min(1).optional(),
  DISCORD_CLIENT_ID: snowflake.optional(),
  DISCORD_COMMAND_REGISTRATION_MODE: z.enum(REGISTRATION_MODES).default("guild"),
  DISCORD_DEV_GUILD_ID: snowflake.optional(),
  DISCORD_ALLOWED_GUILD_IDS: z
    .string()
    .optional()
    .default(() => ""),
  DISCORD_SPAWN_ALERT_CHANNEL_ID: snowflake.optional(),
  DISCORD_PRIVATE_SPAWN_ALERT_CHANNEL_ID: snowflake.optional(),
  DISCORD_SHINY_ALERT_ROLE_ID: snowflake.optional(),
  DISCORD_LEGENDARY_ALERT_ROLE_ID: snowflake.optional(),
  DISCORD_PROFESSOR_AVATAR_URL: z.url().optional(),
  DISCORD_DEFAULT_EPHEMERAL_ERRORS: boolFromString.default(() => true),

  BIGMONCRAFT_SERVER_ID: z.string().default("bigmoncraft"),
  BIGMONCRAFT_SERVER_NAME: z.string().default("BigMonCraft"),
  BIGMONCRAFT_SERVER_ADDRESS: z.string().default("bigmoncraft.bigbangcraft.com.br"),
  BIGMONCRAFT_SITE_URL: z.url().optional(),
  BIGMONCRAFT_MODPACK_URL: z.url().optional(),
  BIGMONCRAFT_MODPACK_VERSION: z.string().optional(),

  POSTGRES_DB: z.string().default("professor_carvalho"),
  POSTGRES_USER: z.string().default("professor_carvalho"),
  POSTGRES_PASSWORD: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: positiveInt.default(5),
  DATABASE_CONNECTION_TIMEOUT_MS: positiveInt.default(5000),
  DATABASE_STATEMENT_TIMEOUT_MS: positiveInt.default(10000),

  REDIS_PASSWORD: z.string().optional(),
  REDIS_URL: z.string().min(1),
  REDIS_KEY_PREFIX: z.string().default("professor-carvalho:"),
  QUEUE_DEFAULT_ATTEMPTS: positiveInt.default(5),
  QUEUE_DEFAULT_BACKOFF_MS: positiveInt.default(2000),
  QUEUE_JOB_TIMEOUT_MS: positiveInt.default(15000),

  POKEAPI_BASE_URL: z.url().default("https://pokeapi.co/api/v2"),
  POKEAPI_REQUEST_TIMEOUT_MS: positiveInt.default(5000),
  POKEAPI_USER_AGENT: z.string().default("ProfessorCarvalho/0.1.0 BigMonCraft"),
  POKEMON_CACHE_TTL_SECONDS: positiveInt.default(86400),
  POKEMON_CACHE_STALE_TTL_SECONDS: positiveInt.default(604800),
  POKEMON_NEGATIVE_CACHE_TTL_SECONDS: positiveInt.default(600),
  COBBLEMON_SNAPSHOT_PATH: z.string().optional(),
  COBBLEMON_SNAPSHOT_REQUIRED: boolFromString.default(() => false),

  CSA_INTEGRATION_MODE: z.enum(CSA_MODES).default("disabled"),
  CSA_SOURCE_TOKEN: z.string().min(32).optional(),
  CSA_ALLOWED_CIDRS: z
    .string()
    .optional()
    .default(() => ""),
  CSA_BODY_LIMIT_BYTES: positiveInt.default(65536),
  CSA_DEDUP_WINDOW_SECONDS: positiveInt.default(90),
  CSA_DEDUP_FAIL_OPEN: boolFromString.default(() => true),
  CSA_RATE_LIMIT_MAX: positiveInt.default(60),
  CSA_RATE_LIMIT_WINDOW_SECONDS: positiveInt.default(60),
  CSA_STORE_SANITIZED_PAYLOAD_DAYS: positiveInt.default(14),
  CSA_EXPECTED_SOURCE_VERSION: z.string().optional(),

  BBSA_INTEGRATION_MODE: z.enum(BBSA_MODES).default("disabled"),
  BBSA_SOURCE_TOKEN: z.string().min(32).optional(),
  BBSA_ALLOWED_CIDRS: z
    .string()
    .optional()
    .default(() => ""),
  BBSA_EXPECTED_VERSION: z.string().default("1.14.0"),
  BBSA_BODY_LIMIT_BYTES: positiveInt.default(65536),
  BBSA_RATE_LIMIT_MAX: positiveInt.default(120),
  BBSA_RATE_LIMIT_WINDOW_SECONDS: positiveInt.default(60),
  BBSA_RECREATE_DELETED_MESSAGE: boolFromString.default(() => true),
  BBSA_SHOW_ORIGIN: boolFromString.default(() => false),
  BBSA_SHOW_ALERT_REASONS: boolFromString.default(() => true),
  BBSA_STORE_HISTORY_DAYS: positiveInt.default(30),

  SPAWN_COORDINATE_POLICY: z.enum(["hidden", "region", "exact_admin_only"]).default("hidden"),
  SPAWN_REGION_GRID_SIZE: positiveInt.default(500),
  SPAWN_SHOW_NEAREST_PLAYER: boolFromString.default(() => false),
  SPAWN_STORE_EXACT_COORDINATES: boolFromString.default(() => false),

  HTTP_RATE_LIMIT_MAX: positiveInt.default(60),
  HTTP_RATE_LIMIT_WINDOW_SECONDS: positiveInt.default(60),
  DISCORD_COMMAND_COOLDOWN_SECONDS: positiveInt.default(3),
  DISCORD_EXPENSIVE_COMMAND_COOLDOWN_SECONDS: positiveInt.default(10),

  METRICS_ENABLED: boolFromString.default(() => true),
  METRICS_BEARER_TOKEN: z.string().min(1).optional(),
  METRICS_PUBLIC_ACCESS: boolFromString.default(() => false),
  METRICS_INCLUDE_DEFAULT_METRICS: boolFromString.default(() => true),

  GATEWAY_INGRESS_ENABLED: boolFromString.default(() => false),
  GATEWAY_SHARED_SECRET: z.string().min(32).optional(),
  GATEWAY_ALLOWED_CLOCK_SKEW_SECONDS: positiveInt.default(60),
  GATEWAY_ALLOWED_CIDRS: z
    .string()
    .optional()
    .default(() => ""),
  GATEWAY_BODY_LIMIT_BYTES: positiveInt.default(262144),
  GATEWAY_PROTOCOL_VERSION: z.string().default("1"),
  GATEWAY_EVENT_RETENTION_DAYS: positiveInt.default(30),
  GATEWAY_REQUEST_REPLAY_TTL_SECONDS: positiveInt.default(130),

  IDENTITY_LINKING_ENABLED: boolFromString.default(() => false),
  IDENTITY_LINK_CODE_PEPPER: z.string().min(32).optional(),
  IDENTITY_LINK_CODE_TTL_SECONDS: positiveInt.default(600),
  IDENTITY_LINK_CODE_MAX_ATTEMPTS: positiveInt.default(5),
  IDENTITY_LINK_COMMAND_COOLDOWN_SECONDS: positiveInt.default(60),
  IDENTITY_PROFILE_STALE_SECONDS: positiveInt.default(600),
  IDENTITY_PROFILE_VISIBILITY: z.literal("self").default("self"),
});

export type EnvShape = z.input<typeof envSchema>;
export type AppConfig = z.output<typeof envSchema>;

export class ConfigValidationError extends Error {
  public readonly variableNames: string[];

  constructor(variableNames: string[], issues: string[]) {
    super(
      `Configuração de ambiente inválida. Variáveis com problema: ${variableNames.join(", ")}.\n${issues.join("\n")}`,
    );
    this.name = "ConfigValidationError";
    this.variableNames = variableNames;
  }
}

export function describeConditionalRequirements(): string[] {
  return [
    "CSA_SOURCE_TOKEN é obrigatória quando CSA_INTEGRATION_MODE=relay",
    "BBSA_SOURCE_TOKEN é obrigatória quando BBSA_INTEGRATION_MODE=relay",
    "DISCORD_DEV_GUILD_ID é obrigatória quando DISCORD_COMMAND_REGISTRATION_MODE=guild",
    "DISCORD_PRIVATE_SPAWN_ALERT_CHANNEL_ID é obrigatória quando SPAWN_COORDINATE_POLICY=exact_admin_only",
    "METRICS_BEARER_TOKEN é obrigatória quando METRICS_PUBLIC_ACCESS=true",
    "GATEWAY_SHARED_SECRET é obrigatória quando GATEWAY_INGRESS_ENABLED=true",
    "GATEWAY_ALLOWED_CIDRS é obrigatória em produção quando GATEWAY_INGRESS_ENABLED=true",
    "IDENTITY_LINK_CODE_PEPPER é obrigatória quando IDENTITY_LINKING_ENABLED=true",
  ];
}

export function parseEnv(raw: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const variableNames = new Set<string>();
    const issues: string[] = [];
    for (const issue of parsed.error.issues) {
      variableNames.add(String(issue.path[0] ?? "desconhecida"));
      issues.push(`${issue.path.join(".")}: ${issue.message}`);
    }
    throw new ConfigValidationError([...variableNames], issues);
  }
  const config = parsed.data;
  applyConditionalRules(config);
  return config;
}

function applyConditionalRules(config: AppConfig): void {
  const missing: string[] = [];
  if (config.CSA_INTEGRATION_MODE === "relay" && !config.CSA_SOURCE_TOKEN) {
    missing.push("CSA_SOURCE_TOKEN (obrigatória com CSA_INTEGRATION_MODE=relay)");
  }
  if (config.BBSA_INTEGRATION_MODE === "relay" && !config.BBSA_SOURCE_TOKEN) {
    missing.push("BBSA_SOURCE_TOKEN (obrigatória com BBSA_INTEGRATION_MODE=relay)");
  }
  if (config.DISCORD_COMMAND_REGISTRATION_MODE === "guild" && !config.DISCORD_DEV_GUILD_ID) {
    missing.push("DISCORD_DEV_GUILD_ID (obrigatória com DISCORD_COMMAND_REGISTRATION_MODE=guild)");
  }
  if (config.SPAWN_COORDINATE_POLICY === "exact_admin_only") {
    if (!config.DISCORD_PRIVATE_SPAWN_ALERT_CHANNEL_ID) {
      missing.push(
        "DISCORD_PRIVATE_SPAWN_ALERT_CHANNEL_ID (obrigatória com SPAWN_COORDINATE_POLICY=exact_admin_only)",
      );
    }
    if (config.SPAWN_STORE_EXACT_COORDINATES) {
      missing.push(
        "SPAWN_STORE_EXACT_COORDINATES não pode ser true quando SPAWN_COORDINATE_POLICY=exact_admin_only sem revisão manual",
      );
    }
  }
  if (config.METRICS_PUBLIC_ACCESS && !config.METRICS_BEARER_TOKEN) {
    missing.push("METRICS_BEARER_TOKEN (obrigatória com METRICS_PUBLIC_ACCESS=true)");
  }
  if (config.GATEWAY_INGRESS_ENABLED && !config.GATEWAY_SHARED_SECRET) {
    missing.push("GATEWAY_SHARED_SECRET (obrigatória com GATEWAY_INGRESS_ENABLED=true)");
  }
  if (
    config.GATEWAY_INGRESS_ENABLED &&
    config.NODE_ENV === "production" &&
    !config.GATEWAY_ALLOWED_CIDRS
  ) {
    missing.push(
      "GATEWAY_ALLOWED_CIDRS (obrigatória em produção com GATEWAY_INGRESS_ENABLED=true)",
    );
  }
  if (config.IDENTITY_LINKING_ENABLED && !config.IDENTITY_LINK_CODE_PEPPER) {
    missing.push("IDENTITY_LINK_CODE_PEPPER (obrigatória com IDENTITY_LINKING_ENABLED=true)");
  }
  if (missing.length > 0) {
    throw new ConfigValidationError(
      missing.map((entry) => entry.split(" ")[0] ?? entry),
      missing,
    );
  }
}

export const REDACTED_PATHS = [
  "DISCORD_TOKEN",
  "DATABASE_URL",
  "REDIS_URL",
  "CSA_SOURCE_TOKEN",
  "BBSA_SOURCE_TOKEN",
  "ADMIN_API_TOKEN",
  "METRICS_BEARER_TOKEN",
  "DISCORD_WEBHOOK_URL",
  "GATEWAY_SHARED_SECRET",
];
