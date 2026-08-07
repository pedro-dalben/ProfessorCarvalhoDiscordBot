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

export const linkCommand = new SlashCommandBuilder()
  .setName(PT_BR.identity.link.name)
  .setDescription(PT_BR.identity.link.description);

export const profileCommand = new SlashCommandBuilder()
  .setName(PT_BR.identity.profile.name)
  .setDescription(PT_BR.identity.profile.description);

export const unlinkCommand = new SlashCommandBuilder()
  .setName(PT_BR.identity.unlink.name)
  .setDescription(PT_BR.identity.unlink.description);

export const diarioCommand = new SlashCommandBuilder()
  .setName(PT_BR.commands.diario.name)
  .setDescription(PT_BR.commands.diario.description)
  .addStringOption((option) =>
    option
      .setName("tipo")
      .setDescription(PT_BR.commands.diario.optionTipo)
      .addChoices(
        { name: PT_BR.commands.diario.optionTipos.todos, value: "todos" },
        { name: PT_BR.commands.diario.optionTipos.capturas, value: "capturas" },
        { name: PT_BR.commands.diario.optionTipos.shinies, value: "shinies" },
        { name: PT_BR.commands.diario.optionTipos.lendarios, value: "lendarios" },
        { name: PT_BR.commands.diario.optionTipos.evolucoes, value: "evolucoes" },
      )
      .setRequired(false),
  );

export const estatisticasCommand = new SlashCommandBuilder()
  .setName(PT_BR.commands.estatisticas.name)
  .setDescription(PT_BR.commands.estatisticas.description);

export const ALL_SLASH_COMMANDS = [
  dexCommand,
  fraquezasCommand,
  spawnCommand,
  ajudaCommand,
  statusCommand,
  linkCommand,
  profileCommand,
  unlinkCommand,
  diarioCommand,
  estatisticasCommand,
];
