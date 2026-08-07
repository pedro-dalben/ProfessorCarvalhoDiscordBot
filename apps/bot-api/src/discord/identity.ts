import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
} from "discord.js";
import type { AppConfig } from "@bigbangcraft/config";
import {
  createIdentityLinkCode,
  findActiveIdentity,
  getLatestProfileSnapshot,
  unlinkIdentity,
  findJourneyStatsByLinkId,
  type DatabaseClient,
} from "@bigbangcraft/database";
import type { Redis } from "ioredis";
import { escapeMarkdown } from "@bigbangcraft/domain";
import { PT_BR } from "@bigbangcraft/discord-ui";
import { generateLinkCode, hashLinkCode } from "../identity/crypto.js";
import { replyError, replyEphemeral, replySuccess } from "@bigbangcraft/discord-ui";

export interface IdentityDeps {
  config: AppConfig;
  db: DatabaseClient;
  redis: Redis;
}

export async function handleLinkCommand(
  interaction: ChatInputCommandInteraction,
  deps: IdentityDeps,
): Promise<void> {
  if (!(await ensureEnabled(interaction, deps))) return;
  if (!isAllowedGuild(interaction.guildId, deps.config)) {
    await replyError(
      interaction,
      "Este comando só está disponível na guild configurada do BigMonCraft.",
    );
    return;
  }
  const userId = interaction.user.id;
  const serverId = deps.config.BIGMONCRAFT_SERVER_ID;
  if (await findActiveIdentity(deps.db, { discordUserId: userId, serverId })) {
    await replyError(
      interaction,
      "Sua conta do Discord já está vinculada. Use /desvincular antes de criar uma nova vinculação.",
    );
    return;
  }
  const cooldownKey = `${deps.config.REDIS_KEY_PREFIX}identity:link-cooldown:${userId}`;
  const allowed = await deps.redis.set(
    cooldownKey,
    "1",
    "EX",
    deps.config.IDENTITY_LINK_COMMAND_COOLDOWN_SECONDS,
    "NX",
  );
  if (allowed !== "OK") {
    await replyError(
      interaction,
      "Aguarde alguns segundos antes de gerar outro código de vinculação.",
    );
    return;
  }
  const code = generateLinkCode();
  await createIdentityLinkCode(deps.db, {
    codeHash: hashLinkCode(code, deps.config.IDENTITY_LINK_CODE_PEPPER ?? ""),
    discordUserId: userId,
    guildId: interaction.guildId ?? "",
    expiresAt: new Date(Date.now() + deps.config.IDENTITY_LINK_CODE_TTL_SECONDS * 1000),
    maximumAttempts: deps.config.IDENTITY_LINK_CODE_MAX_ATTEMPTS,
    serverId,
  });
  await replyEphemeral(interaction, {
    content: `👨‍🔬 Código de vinculação criado!\n\nEntre no ${deps.config.BIGMONCRAFT_SERVER_NAME} e execute:\n\n\`/professor vincular ${code}\`\n\nEste código expira em 10 minutos e só pode ser utilizado uma vez.\n\nNunca compartilhe este código com outro jogador.`,
  });
}

export async function handleProfileCommand(
  interaction: ChatInputCommandInteraction,
  deps: IdentityDeps,
): Promise<void> {
  if (!(await ensureEnabled(interaction, deps))) return;
  const link = await findActiveIdentity(deps.db, {
    discordUserId: interaction.user.id,
    serverId: deps.config.BIGMONCRAFT_SERVER_ID,
  });
  if (!link) {
    await replyError(
      interaction,
      "Sua conta ainda não está vinculada. Use /vincular para gerar um código.",
    );
    return;
  }
  const snapshot = await getLatestProfileSnapshot(
    deps.db,
    link.id,
    deps.config.BIGMONCRAFT_SERVER_ID,
  );
  if (!snapshot) {
    await replyEphemeral(
      interaction,
      "Sua conta está vinculada, mas ainda não recebi sua ficha de treinador.\n\nEntre no BigMonCraft e use /professor sincronizar.",
    );
    return;
  }
  const data = isRecord(snapshot.snapshot) ? snapshot.snapshot : {};
  const journeyStats = await findJourneyStatsByLinkId(deps.db, link.id);
  const fields = profileFields(data, journeyStats);
  const stale =
    Date.now() - snapshot.capturedAt.getTime() > deps.config.IDENTITY_PROFILE_STALE_SECONDS * 1000;
  await replySuccess(interaction, {
    embeds: [
      {
        title: `👤 Ficha de Treinador — ${escapeMarkdown(snapshot.minecraftName)}`,
        color: stale ? 0xf1c40f : 0x2ecc71,
        fields,
        description: stale
          ? "⚠️ Esta ficha não é atualizada há algum tempo.\nEntre no BigMonCraft e use /professor sincronizar."
          : undefined,
        footer: { text: `${deps.config.BIGMONCRAFT_SERVER_NAME} • Professor Carvalho` },
        timestamp: snapshot.capturedAt.toISOString(),
      },
    ],
  });
}

export async function handleUnlinkCommand(
  interaction: ChatInputCommandInteraction,
  deps: IdentityDeps,
): Promise<void> {
  if (!(await ensureEnabled(interaction, deps))) return;
  const link = await findActiveIdentity(deps.db, {
    discordUserId: interaction.user.id,
    serverId: deps.config.BIGMONCRAFT_SERVER_ID,
  });
  if (!link) {
    await replyError(interaction, "Não encontrei uma vinculação ativa para sua conta.");
    return;
  }
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`professor:unlink:confirm:${interaction.user.id}:${Date.now() + 300_000}`)
      .setLabel(PT_BR.identity.unlink.confirm)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`professor:unlink:cancel:${interaction.user.id}:${Date.now() + 300_000}`)
      .setLabel(PT_BR.identity.unlink.cancel)
      .setStyle(ButtonStyle.Secondary),
  );
  const payload: InteractionReplyOptions = {
    content:
      "Tem certeza de que deseja remover sua vinculação? Esta confirmação expira em 5 minutos.",
    components: [row],
    allowedMentions: { parse: [] },
  };
  await replyEphemeral(interaction, payload);
}

export async function handleIdentityButton(
  interaction: ButtonInteraction,
  deps: IdentityDeps,
): Promise<void> {
  const [prefix, action, command, targetUserId, expiry] = interaction.customId.split(":");
  if (
    prefix !== "professor" ||
    action !== "unlink" ||
    command === undefined ||
    targetUserId !== interaction.user.id
  )
    return;
  if (!expiry || !Number.isSafeInteger(Number(expiry)) || Number(expiry) < Date.now()) {
    await interaction.update({
      content: "Esta confirmação expirou. Execute /desvincular novamente.",
      components: [],
      allowedMentions: { parse: [] },
    });
    return;
  }
  if (command === "cancel") {
    await interaction.update({
      content: "Desvinculação cancelada.",
      components: [],
      allowedMentions: { parse: [] },
    });
    return;
  }
  if (command !== "confirm") return;
  const changed = await unlinkIdentity(deps.db, {
    discordUserId: interaction.user.id,
    serverId: deps.config.BIGMONCRAFT_SERVER_ID,
    actorId: interaction.user.id,
  });
  await interaction.update({
    content: changed
      ? "✅ Sua conta foi desvinculada.\n\nO Professor Carvalho não sincronizará mais sua ficha até que você realize uma nova vinculação."
      : "Essa vinculação já não está ativa.",
    components: [],
    allowedMentions: { parse: [] },
  });
}

async function ensureEnabled(
  interaction: ChatInputCommandInteraction,
  deps: IdentityDeps,
): Promise<boolean> {
  if (deps.config.IDENTITY_LINKING_ENABLED) return true;
  await replyError(interaction, "A vinculação do BigMon ID está temporariamente desabilitada.");
  return false;
}

function isAllowedGuild(guildId: string | null, config: AppConfig): boolean {
  if (!guildId) return false;
  const configured = config.DISCORD_ALLOWED_GUILD_IDS.split(/[\s,]+/).filter(Boolean);
  return configured.includes(guildId) || config.DISCORD_DEV_GUILD_ID === guildId;
}

function profileFields(
  data: Record<string, unknown>,
  journeyStats: Awaited<ReturnType<typeof findJourneyStatsByLinkId>>,
): Array<{ name: string; value: string; inline?: boolean }> {
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  const progression = isRecord(data.progression) ? data.progression : {};
  const economy = isRecord(data.economy) ? data.economy : {};
  const coins = isRecord(economy.coins) ? economy.coins : {};
  const gems = isRecord(economy.gems) ? economy.gems : {};
  const cobblemon = isRecord(data.cobblemon) ? data.cobblemon : {};
  if (typeof progression.rank === "string")
    fields.push({ name: "🏅 Rank", value: escapeMarkdown(progression.rank), inline: true });
  if (coins.available === true && typeof coins.formatted === "string")
    fields.push({ name: "💰 Economia", value: escapeMarkdown(coins.formatted), inline: true });
  if (gems.available === true && typeof gems.formatted === "string")
    fields.push({ name: "💎 Gemas", value: escapeMarkdown(gems.formatted), inline: true });
  if (
    typeof progression.playtimeSeconds === "number" &&
    Number.isSafeInteger(progression.playtimeSeconds)
  )
    fields.push({
      name: "⏱ Tempo jogado",
      value: formatDuration(progression.playtimeSeconds),
      inline: true,
    });
  if (Array.isArray(progression.jobs) && progression.jobs.length > 0)
    fields.push({
      name: "📚 Profissões",
      value: progression.jobs
        .map((job) =>
          isRecord(job) && typeof job.displayName === "string" && typeof job.level === "number"
            ? `${escapeMarkdown(job.displayName)} — Nv. ${job.level}`
            : "",
        )
        .filter(Boolean)
        .join("\n"),
    });
  if (cobblemon.available === true && Array.isArray(cobblemon.party) && cobblemon.party.length > 0)
    fields.push({
      name: "🎒 Equipe atual",
      value: cobblemon.party
        .map((member) =>
          isRecord(member) &&
          typeof member.displayName === "string" &&
          typeof member.level === "number"
            ? `${escapeMarkdown(member.displayName)} — Nv. ${member.level}`
            : "",
        )
        .filter(Boolean)
        .join("\n"),
    });
  const pokedex = isRecord(cobblemon.pokedex) ? cobblemon.pokedex : {};
  if (
    pokedex.available === true &&
    typeof pokedex.caught === "number" &&
    typeof pokedex.total === "number"
  )
    fields.push({
      name: "📖 Pokédex",
      value: `${pokedex.caught.toLocaleString("pt-BR")} de ${pokedex.total.toLocaleString("pt-BR")} espécies capturadas`,
    });

  if (journeyStats && journeyStats.totalCaptures > 0) {
    const parts: string[] = [];
    parts.push(`${journeyStats.totalCaptures.toLocaleString("pt-BR")} capturas`);
    if (journeyStats.shinyCaptures > 0)
      parts.push(`${journeyStats.shinyCaptures} shinies`);
    if (journeyStats.legendaryCaptures > 0)
      parts.push(`${journeyStats.legendaryCaptures} lendários`);
    if (journeyStats.rareCaptures > 0)
      parts.push(`${journeyStats.rareCaptures} raros capturados`);
    fields.push({ name: "⚔️ Jornada", value: parts.join("\n") });
  }

  return fields.length > 0
    ? fields
    : [{ name: "Dados", value: "Ainda não há módulos de perfil disponíveis." }];
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}min`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
