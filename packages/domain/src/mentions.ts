export interface AllowedMentionsConfig {
  parse: never[];
  roles?: string[];
}

const SNOWFLAKE_PATTERN = /^\d{17,20}$/;

export function isDiscordSnowflake(value: string): boolean {
  return SNOWFLAKE_PATTERN.test(value);
}

export function buildAllowedMentions(roleIds: readonly string[] = []): AllowedMentionsConfig {
  const roles = roleIds.filter(isDiscordSnowflake);
  if (roles.length === 0) {
    return { parse: [] };
  }
  return { parse: [], roles };
}
