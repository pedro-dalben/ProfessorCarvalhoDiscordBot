import { InteractionType, type Interaction } from "discord.js";
import type { AppLogger } from "@bigbangcraft/observability";
import type { PokemonProvider, AutocompleteRanker } from "@bigbangcraft/pokemon-data";
import {
  handleDexCommand,
  handleFraquezasCommand,
  handleSpawnCommand,
  handleAjudaCommand,
  handleStatusCommand,
  handlePokemonAutocomplete,
} from "@bigbangcraft/discord-ui";
import type { SpawnSnapshot } from "@bigbangcraft/cobblemon-data";

export interface InteractionDeps {
  logger: AppLogger;
  provider: PokemonProvider;
  ranker: AutocompleteRanker;
  snapshotIsLoaded: boolean;
  currentSnapshot: SpawnSnapshot | null;
  snapshotAgeSeconds: number | null;
  appVersion: string;
  serverAddress: string;
  siteUrl?: string;
  databaseReachable: boolean;
  redisReachable: boolean;
  workerHeartbeatAgeSeconds: number | null;
  pokemonCacheEntries: number;
  csaMode: string;
  queueSummary: Array<{ queue: string; waiting: number; active: number; failed: number }>;
}

export function createInteractionHandler(
  deps: InteractionDeps,
): (interaction: Interaction) => Promise<void> {
  return async (interaction: Interaction): Promise<void> => {
    if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
      await handlePokemonAutocomplete(interaction, deps.ranker);
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const commandInteraction = interaction;
    const commandName = commandInteraction.commandName;

    try {
      switch (commandName) {
        case "dex":
          await commandInteraction.deferReply();
          await handleDexCommand(commandInteraction, deps.provider);
          break;
        case "fraquezas":
          await commandInteraction.deferReply();
          await handleFraquezasCommand(commandInteraction, deps.provider);
          break;
        case "spawn":
          await commandInteraction.deferReply();
          await handleSpawnCommand(commandInteraction, {
            getSnapshot: () => deps.currentSnapshot,
          });
          break;
        case "ajuda":
          await commandInteraction.deferReply();
          await handleAjudaCommand(commandInteraction, {
            serverAddress: deps.serverAddress,
            siteUrl: deps.siteUrl,
            snapshotDate: deps.currentSnapshot
              ? new Date(deps.currentSnapshot.generatedAt)
              : undefined,
          });
          break;
        case "status-professor":
          await commandInteraction.deferReply();
          await handleStatusCommand(commandInteraction, {
            discordReady: true,
            databaseReachable: deps.databaseReachable,
            redisReachable: deps.redisReachable,
            workerHeartbeatAgeSeconds: deps.workerHeartbeatAgeSeconds,
            pokemonCacheEntries: deps.pokemonCacheEntries,
            spawnSnapshotLoaded: deps.snapshotIsLoaded,
            spawnSnapshotGeneratedAt: deps.currentSnapshot?.generatedAt ?? null,
            spawnSnapshotAgeSeconds: deps.snapshotAgeSeconds,
            spawnSnapshotEntryCount: deps.currentSnapshot?.entryCount ?? null,
            csaMode: deps.csaMode,
            queueSummary: deps.queueSummary,
            appVersion: deps.appVersion,
          });
          break;
        default:
          break;
      }
    } catch (error) {
      deps.logger.error({ err: error, command: commandName }, "Erro ao processar comando.");
    }
  };
}
