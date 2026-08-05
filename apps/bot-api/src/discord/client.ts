import { Client, GatewayIntentBits, Events, type Interaction } from "discord.js";
import type { AppLogger } from "@bigbangcraft/observability";

export function createDiscordClient(logger: AppLogger): Client {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    allowedMentions: { parse: [] },
  });

  client.once(Events.ClientReady, (readyClient) => {
    logger.info({ username: readyClient.user?.tag }, "Professor Carvalho conectado ao Discord.");
  });

  client.on(Events.Error, (error) => {
    logger.error({ err: error }, "Erro na conexão com o Discord.");
  });

  client.on(Events.Warn, (warning) => {
    logger.warn({ warning }, "Aviso do Discord.");
  });

  return client;
}

export function destroyDiscordClient(client: Client): void {
  if (client.isReady()) {
    void client.destroy();
  }
}

export function attachInteractionHandler(
  client: Client,
  handler: (interaction: Interaction) => Promise<void>,
): void {
  client.on(Events.InteractionCreate, (interaction) => {
    void (async () => {
      try {
        await handler(interaction);
      } catch (error) {
        const logger = (client as unknown as { logger?: AppLogger }).logger;
        logger?.error({ err: error }, "Erro não tratado em handler de interação.");
      }
    })();
  });
}
