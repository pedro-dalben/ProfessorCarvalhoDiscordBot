# ADR 0002: Discord Gateway — Slash Commands e Intents Mínimos

**Status**: Aceito
**Data**: 2026-08-05

## Decisão

- Usar **apenas slash commands** (`discord.js` 14), sem comandos por prefixo
- Solicitar **apenas** `GatewayIntentBits.Guilds`
- **Não solicitar**: `MessageContent`, `GuildMembers`, `GuildPresences`
- Registro de comandos com dois modos: `guild` (desenvolvimento) e `global` (produção)
- Todas as respostas usam `allowedMentions: { parse: [] }`

## Justificativa

- Slash commands são a interface moderna do Discord, com autocomplete nativo
- Intents mínimos reduzem a superfície de privacidade e o escopo de permissão
- `MessageContent` não é necessário: o MVP não escuta mensagens de texto
- `GuildMembers` e `GuildPresences` não são necessários para comandos slash
- Menos intents = processo de verificação do bot mais simples
