import { SlashCommandBuilder } from "discord.js";
import { PT_BR } from "../messages/pt-BR.js";

export const dexCommand = new SlashCommandBuilder()
  .setName(PT_BR.commands.dex.name)
  .setDescription(PT_BR.commands.dex.description)
  .addStringOption((option) =>
    option
      .setName("pokemon")
      .setDescription(PT_BR.commands.dex.optionPokemonName)
      .setAutocomplete(true)
      .setRequired(true),
  );

export const fraquezasCommand = new SlashCommandBuilder()
  .setName(PT_BR.commands.fraquezas.name)
  .setDescription(PT_BR.commands.fraquezas.description)
  .addStringOption((option) =>
    option
      .setName("pokemon")
      .setDescription(PT_BR.commands.fraquezas.optionPokemonName)
      .setAutocomplete(true)
      .setRequired(true),
  );

export const spawnCommand = new SlashCommandBuilder()
  .setName(PT_BR.commands.spawn.name)
  .setDescription(PT_BR.commands.spawn.description)
  .addStringOption((option) =>
    option
      .setName("pokemon")
      .setDescription(PT_BR.commands.spawn.optionPokemonName)
      .setAutocomplete(true)
      .setRequired(true),
  );

export const ajudaCommand = new SlashCommandBuilder()
  .setName(PT_BR.commands.ajuda.name)
  .setDescription(PT_BR.commands.ajuda.description);

export const statusCommand = new SlashCommandBuilder()
  .setName(PT_BR.commands.status.name)
  .setDescription(PT_BR.commands.status.description);

export const ALL_SLASH_COMMANDS = [
  dexCommand,
  fraquezasCommand,
  spawnCommand,
  ajudaCommand,
  statusCommand,
];
