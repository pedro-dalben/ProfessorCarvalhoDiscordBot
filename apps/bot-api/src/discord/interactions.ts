import { InteractionType, type Interaction } from "discord.js";
import type { AppLogger } from "@bigbangcraft/observability";
import { generateCorrelationCode } from "@bigbangcraft/domain";
import type { PokemonProvider, AutocompleteRanker } from "@bigbangcraft/pokemon-data";
import {
  handleDexCommand,
  handleFraquezasCommand,
  handleSpawnCommand,
  handleAjudaCommand,
  handleStatusCommand,
  handlePokemonAutocomplete,
} from "@bigbangcraft/discord-ui";
import type { StatusService } from "../main.js";
import {
  handleIdentityButton,
  handleLinkCommand,
  handleProfileCommand,
  handleUnlinkCommand,
  type IdentityDeps,
} from "./identity.js";

export interface InteractionDeps {
  logger: AppLogger;
  provider: PokemonProvider;
  ranker: AutocompleteRanker;
  statusService: StatusService;
  identity: IdentityDeps;
}

export function createInteractionHandler(
  deps: InteractionDeps,
): (interaction: Interaction) => Promise<void> {
  return async (interaction: Interaction): Promise<void> => {
    if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
      try {
        await handlePokemonAutocomplete(interaction, deps.ranker);
      } catch (error) {
        deps.logger.error({ err: error }, "Erro em autocomplete.");
      }
      return;
    }

    if (interaction.isButton()) {
      try {
        await handleIdentityButton(interaction, deps.identity);
      } catch (error) {
        deps.logger.error({ err: error }, "Erro ao processar confirmação de identidade.");
        if (!interaction.replied && !interaction.deferred)
          await interaction.reply({
            content: "Não consegui concluir essa operação.",
            flags: "Ephemeral",
            allowedMentions: { parse: [] },
          });
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const commandInteraction = interaction;
    const commandName = commandInteraction.commandName;

    let deferred = false;
    try {
      const needsDefer = [
        "dex",
        "fraquezas",
        "spawn",
        "ajuda",
        "status-professor",
        "perfil",
      ].includes(commandName);
      if (needsDefer) {
        await commandInteraction.deferReply();
        deferred = true;
      }

      switch (commandName) {
        case "dex":
          await handleDexCommand(commandInteraction, deps.provider);
          break;
        case "fraquezas":
          await handleFraquezasCommand(commandInteraction, deps.provider);
          break;
        case "spawn":
          await handleSpawnCommand(
            commandInteraction,
            {
              getSnapshot: () => deps.statusService.getSnapshot(),
            },
            deps.provider,
          );
          break;
        case "ajuda": {
          const snap = deps.statusService.getSnapshotStatus();
          await handleAjudaCommand(commandInteraction, {
            serverAddress: deps.statusService.getServerAddress(),
            siteUrl: deps.statusService.getSiteUrl(),
            snapshotDate: snap.generatedAt ? new Date(snap.generatedAt) : undefined,
          });
          break;
        }
        case "status-professor": {
          const queueSummary = await deps.statusService.getQueueSummary();
          const [dbReachable, redisReachable, heartbeatAge] = await Promise.all([
            deps.statusService.getDatabaseReachable(),
            deps.statusService.getRedisReachable(),
            deps.statusService.getWorkerHeartbeatAgeSeconds(),
          ]);
          const snap = deps.statusService.getSnapshotStatus();
          const gateway = await deps.statusService.getGatewayStatus();
          await handleStatusCommand(commandInteraction, {
            discordReady: deps.statusService.getDiscordReady(),
            databaseReachable: dbReachable,
            redisReachable: redisReachable,
            workerHeartbeatAgeSeconds: heartbeatAge,
            pokemonCacheEntries: deps.statusService.getPokemonCacheEntries(),
            spawnSnapshotLoaded: snap.loaded,
            spawnSnapshotGeneratedAt: snap.generatedAt,
            spawnSnapshotAgeSeconds: snap.ageSeconds,
            spawnSnapshotEntryCount: snap.entryCount,
            csaMode: deps.statusService.getCsaMode(),
            queueSummary,
            appVersion: deps.statusService.getAppVersion(),
            gateway,
          });
          break;
        }
        case "vincular":
          await handleLinkCommand(commandInteraction, deps.identity);
          break;
        case "perfil":
          await handleProfileCommand(commandInteraction, deps.identity);
          break;
        case "desvincular":
          await handleUnlinkCommand(commandInteraction, deps.identity);
          break;
        default:
          break;
      }
    } catch (error) {
      const correlationCode = generateCorrelationCode();
      deps.logger.error(
        { err: error, command: commandName, correlationCode },
        "Erro ao processar comando.",
      );
      try {
        if (deferred) {
          await commandInteraction.editReply({
            content: `Não consegui concluir essa consulta. Código de referência: ${correlationCode}`,
            allowedMentions: { parse: [] },
          });
        } else if (!commandInteraction.replied) {
          await commandInteraction.reply({
            content: `Não consegui concluir essa consulta. Código de referência: ${correlationCode}`,
            flags: "Ephemeral",
            allowedMentions: { parse: [] },
          });
        }
      } catch (replyError) {
        deps.logger.error(
          { err: replyError, correlationCode },
          "Falha ao enviar resposta de erro.",
        );
      }
    }
  };
}
