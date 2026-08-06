import { and, desc, eq, isNull } from "drizzle-orm";
import type { DatabaseClient } from "./client.js";
import {
  gatewayServers,
  identityLinkAudit,
  identityLinkCodes,
  identityLinks,
  playerProfileSnapshots,
} from "./schema.js";

export const IDENTITY_STATUSES = ["active", "inactive", "blocked"] as const;
export type IdentityStatus = (typeof IDENTITY_STATUSES)[number];

export async function findActiveIdentity(
  db: DatabaseClient,
  params: { discordUserId?: string; minecraftUuid?: string; serverId: string },
) {
  const filters = [eq(identityLinks.serverId, params.serverId), eq(identityLinks.status, "active")];
  if (params.discordUserId) filters.push(eq(identityLinks.discordUserId, params.discordUserId));
  if (params.minecraftUuid) filters.push(eq(identityLinks.minecraftUuid, params.minecraftUuid));
  const rows = await db
    .select()
    .from(identityLinks)
    .where(and(...filters))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLatestProfileSnapshot(
  db: DatabaseClient,
  linkId: string,
  serverId: string,
) {
  const rows = await db
    .select()
    .from(playerProfileSnapshots)
    .where(
      and(eq(playerProfileSnapshots.linkId, linkId), eq(playerProfileSnapshots.serverId, serverId)),
    )
    .orderBy(desc(playerProfileSnapshots.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function invalidateLinkCodes(
  db: DatabaseClient,
  discordUserId: string,
): Promise<void> {
  await db
    .update(identityLinkCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(eq(identityLinkCodes.discordUserId, discordUserId), isNull(identityLinkCodes.consumedAt)),
    );
}

export async function createIdentityLinkCode(
  db: DatabaseClient,
  params: {
    codeHash: string;
    discordUserId: string;
    guildId: string;
    expiresAt: Date;
    maximumAttempts: number;
    serverId: string;
  },
): Promise<typeof identityLinkCodes.$inferSelect> {
  return db.transaction(async (tx) => {
    await tx
      .update(identityLinkCodes)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(identityLinkCodes.discordUserId, params.discordUserId),
          isNull(identityLinkCodes.consumedAt),
        ),
      );
    const rows = await tx
      .insert(identityLinkCodes)
      .values({
        codeHash: params.codeHash,
        discordUserId: params.discordUserId,
        guildId: params.guildId,
        expiresAt: params.expiresAt,
        maximumAttempts: params.maximumAttempts,
        createdAt: new Date(),
      })
      .returning();
    const code = rows[0];
    if (!code) throw new Error("Falha ao criar código de vinculação.");
    await tx.insert(identityLinkAudit).values({
      action: "code.created",
      discordUserId: params.discordUserId,
      serverId: params.serverId,
      actorType: "discord",
      actorId: params.discordUserId,
      metadata: { expiresAt: params.expiresAt.toISOString() },
      createdAt: new Date(),
    });
    return code;
  });
}

export type LinkFailureCode =
  | "IDENTITY_INVALID_CODE"
  | "IDENTITY_CODE_EXPIRED"
  | "IDENTITY_CODE_CONSUMED"
  | "IDENTITY_TOO_MANY_ATTEMPTS"
  | "IDENTITY_DISCORD_ALREADY_LINKED"
  | "IDENTITY_MINECRAFT_ALREADY_LINKED";

export type ConsumeLinkResult =
  | { success: true; linkId: string; discordUserId: string; guildId: string }
  | { success: false; code: LinkFailureCode };

export async function consumeIdentityLinkCode(
  db: DatabaseClient,
  params: {
    codeHash: string;
    minecraftUuid: string;
    minecraftName: string;
    serverId: string;
    now?: Date;
  },
): Promise<ConsumeLinkResult> {
  const now = params.now ?? new Date();
  try {
    return await db.transaction(async (tx): Promise<ConsumeLinkResult> => {
      const rows = await tx
        .select()
        .from(identityLinkCodes)
        .where(eq(identityLinkCodes.codeHash, params.codeHash))
        .for("update");
      const code = rows[0];
      if (!code) return { success: false, code: "IDENTITY_INVALID_CODE" };
      if (code.consumedAt) return { success: false, code: "IDENTITY_CODE_CONSUMED" };
      if (code.expiresAt <= now) {
        await tx
          .update(identityLinkCodes)
          .set({ consumedAt: now })
          .where(eq(identityLinkCodes.id, code.id));
        await tx.insert(identityLinkAudit).values({
          action: "code.expired",
          discordUserId: code.discordUserId,
          minecraftUuid: params.minecraftUuid,
          serverId: params.serverId,
          actorType: "minecraft",
          reason: "expired",
          createdAt: now,
        });
        return { success: false, code: "IDENTITY_CODE_EXPIRED" };
      }
      if (code.attemptCount >= code.maximumAttempts) {
        await tx
          .update(identityLinkCodes)
          .set({ consumedAt: now })
          .where(eq(identityLinkCodes.id, code.id));
        return { success: false, code: "IDENTITY_TOO_MANY_ATTEMPTS" };
      }

      const discordLink = await tx
        .select()
        .from(identityLinks)
        .where(
          and(
            eq(identityLinks.discordUserId, code.discordUserId),
            eq(identityLinks.status, "active"),
          ),
        )
        .limit(1);
      if (discordLink[0]) {
        await tx
          .update(identityLinkCodes)
          .set({ consumedAt: now })
          .where(eq(identityLinkCodes.id, code.id));
        await tx.insert(identityLinkAudit).values({
          action: "link.conflict",
          linkId: discordLink[0].id,
          discordUserId: code.discordUserId,
          minecraftUuid: params.minecraftUuid,
          serverId: params.serverId,
          actorType: "minecraft",
          reason: "discord_already_linked",
          createdAt: now,
        });
        return { success: false, code: "IDENTITY_DISCORD_ALREADY_LINKED" };
      }
      const minecraftLink = await tx
        .select()
        .from(identityLinks)
        .where(
          and(
            eq(identityLinks.minecraftUuid, params.minecraftUuid),
            eq(identityLinks.status, "active"),
          ),
        )
        .limit(1);
      if (minecraftLink[0]) {
        await tx
          .update(identityLinkCodes)
          .set({ consumedAt: now })
          .where(eq(identityLinkCodes.id, code.id));
        await tx.insert(identityLinkAudit).values({
          action: "link.conflict",
          discordUserId: code.discordUserId,
          minecraftUuid: params.minecraftUuid,
          serverId: params.serverId,
          actorType: "minecraft",
          reason: "minecraft_already_linked",
          createdAt: now,
        });
        return { success: false, code: "IDENTITY_MINECRAFT_ALREADY_LINKED" };
      }

      const created = await tx
        .insert(identityLinks)
        .values({
          discordUserId: code.discordUserId,
          guildId: code.guildId,
          minecraftUuid: params.minecraftUuid,
          minecraftName: params.minecraftName,
          serverId: params.serverId,
          status: "active",
          linkedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: identityLinks.id });
      const link = created[0];
      if (!link) throw new Error("Falha ao criar vinculação.");

      await tx
        .update(identityLinkCodes)
        .set({ consumedAt: now })
        .where(eq(identityLinkCodes.id, code.id));
      await tx
        .update(identityLinkCodes)
        .set({ consumedAt: now })
        .where(
          and(
            eq(identityLinkCodes.discordUserId, code.discordUserId),
            isNull(identityLinkCodes.consumedAt),
          ),
        );
      await tx.insert(identityLinkAudit).values({
        action: "link.completed",
        linkId: link.id,
        discordUserId: code.discordUserId,
        minecraftUuid: params.minecraftUuid,
        serverId: params.serverId,
        actorType: "minecraft",
        createdAt: now,
      });
      return {
        success: true,
        linkId: link.id,
        discordUserId: code.discordUserId,
        guildId: code.guildId,
      };
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return { success: false, code: "IDENTITY_MINECRAFT_ALREADY_LINKED" };
    }
    throw error;
  }
}

export async function unlinkIdentity(
  db: DatabaseClient,
  params: { discordUserId: string; serverId: string; actorId: string },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(identityLinks)
      .where(
        and(
          eq(identityLinks.discordUserId, params.discordUserId),
          eq(identityLinks.serverId, params.serverId),
          eq(identityLinks.status, "active"),
        ),
      )
      .for("update");
    const link = rows[0];
    if (!link) return false;
    const now = new Date();
    await tx
      .update(identityLinks)
      .set({ status: "inactive", unlinkedAt: now, unlinkedBy: params.actorId, updatedAt: now })
      .where(eq(identityLinks.id, link.id));
    await tx
      .update(identityLinkCodes)
      .set({ consumedAt: now })
      .where(
        and(
          eq(identityLinkCodes.discordUserId, params.discordUserId),
          isNull(identityLinkCodes.consumedAt),
        ),
      );
    await tx.insert(identityLinkAudit).values({
      action: "link.unlinked",
      linkId: link.id,
      discordUserId: params.discordUserId,
      minecraftUuid: link.minecraftUuid,
      serverId: params.serverId,
      actorType: "discord",
      actorId: params.actorId,
      createdAt: now,
    });
    return true;
  });
}

export async function upsertGatewayServer(
  db: DatabaseClient,
  data: {
    serverId: string;
    displayName: string;
    protocolVersion: string;
    statusPayload: unknown;
    gatewayVersion?: string;
    minecraftVersion?: string;
    fabricVersion?: string;
    cobblemonVersion?: string;
    bigbangessentialsVersion?: string;
  },
) {
  const now = new Date();
  const rows = await db
    .insert(gatewayServers)
    .values({
      serverId: data.serverId,
      displayName: data.displayName,
      enabled: true,
      protocolVersion: data.protocolVersion,
      lastHeartbeatAt: now,
      gatewayVersion: data.gatewayVersion,
      minecraftVersion: data.minecraftVersion,
      fabricVersion: data.fabricVersion,
      cobblemonVersion: data.cobblemonVersion,
      bigbangessentialsVersion: data.bigbangessentialsVersion,
      statusPayload: data.statusPayload,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: gatewayServers.serverId,
      set: {
        lastHeartbeatAt: now,
        protocolVersion: data.protocolVersion,
        gatewayVersion: data.gatewayVersion,
        minecraftVersion: data.minecraftVersion,
        fabricVersion: data.fabricVersion,
        cobblemonVersion: data.cobblemonVersion,
        bigbangessentialsVersion: data.bigbangessentialsVersion,
        statusPayload: data.statusPayload,
        updatedAt: now,
      },
    })
    .returning();
  return rows[0] ?? null;
}

export async function findGatewayServer(db: DatabaseClient, serverId: string) {
  const rows = await db
    .select()
    .from(gatewayServers)
    .where(eq(gatewayServers.serverId, serverId))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertAudit(
  db: DatabaseClient,
  data: typeof identityLinkAudit.$inferInsert,
): Promise<void> {
  await db.insert(identityLinkAudit).values(data);
}
