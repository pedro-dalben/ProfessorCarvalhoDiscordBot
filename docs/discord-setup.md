# Configuração do Bot no Discord — Professor Carvalho

## Pré-requisitos

- Conta Discord com acesso ao [Discord Developer Portal](https://discord.com/developers/applications)
- Permissão de administrador no servidor (guild) de desenvolvimento
- Permissão de administrador no servidor de produção (para registro global)

## Criando a aplicação Discord

1. Acesse https://discord.com/developers/applications
2. Clique **New Application**
3. Nome: `Professor Carvalho`
4. Aceite os termos e clique **Create**

## Criando o bot

1. No menu lateral, vá em **Bot**
2. Clique **Add Bot** e confirme
3. Desative **Public Bot** (se quiser restringir a servidores específicos)
4. Desative **Requires OAuth2 Code Grant** (não utilizado)

## Obtendo o Client ID

1. No menu lateral, vá em **OAuth2 → General**
2. Copie o **CLIENT ID** (número de 17-20 dígitos)
3. Configure no `.env`:
   ```env
   DISCORD_CLIENT_ID=123456789012345678
   ```

## Gerando e armazenando o Token

1. No menu lateral, vá em **Bot**
2. Clique **Reset Token** e confirme
3. Copie o token exibido (só é mostrado uma vez)
4. Configure no `.env`:
   ```env
   DISCORD_TOKEN=seu-token-aqui
   ```
5. Proteja o arquivo:
   ```bash
   chmod 600 .env
   ```

**Nunca compartilhe o token, nem commitado no repositório, nem em mensagens do Discord.**

## Intents (Gateway)

O Professor Carvalho requer apenas as intents **não privilegiadas** do Discord:

| Intent                    | Necessária? | Motivo                                  |
| ------------------------- | ----------- | --------------------------------------- |
| GUILDS                    | Sim         | Resolver guilds, comandos slash, canais |
| GUILD_MEMBERS             | Não         | Não utiliza                             |
| GUILD_MODERATION          | Não         | Não utiliza                             |
| GUILD_EMOJIS_AND_STICKERS | Não         | Não utiliza                             |
| GUILD_INTEGRATIONS        | Não         | Não utiliza                             |
| GUILD_WEBHOOKS            | Não         | Não utiliza                             |
| GUILD_INVITES             | Não         | Não utiliza                             |
| GUILD_VOICE_STATES        | Não         | Não utiliza                             |
| GUILD_PRESENCES           | Não         | Não utiliza                             |
| GUILD_MESSAGES            | Não         | Não utiliza mensagens de texto          |
| GUILD_MESSAGE_REACTIONS   | Não         | Não utiliza                             |
| GUILD_MESSAGE_TYPING      | Não         | Não utiliza                             |
| DIRECT_MESSAGES           | Não         | Não utiliza                             |
| DIRECT_MESSAGE_REACTIONS  | Não         | Não utiliza                             |
| DIRECT_MESSAGE_TYPING     | Não         | Não utiliza                             |
| MESSAGE_CONTENT           | Não         | Não lê conteúdo de mensagens            |

No Developer Portal, vá em **Bot → Privileged Gateway Intents** e **desative todas**.

## Permissões do Bot

As permissões necessárias são concedidas via URL de instalação (OAuth2).

| Permissão                | Valor        | Motivo                                        |
| ------------------------ | ------------ | --------------------------------------------- |
| View Channels            | `1024`       | Ver canais onde o bot atua                    |
| Send Messages            | `2048`       | Enviar respostas de comandos e alertas        |
| Embed Links              | `16384`      | Enviar embeds formatados da Pokédex e alertas |
| Use Application Commands | `2147483648` | Registrar e responder comandos slash          |
| Read Message History     | `65536`      | Necessário para contexto de canal             |

**Total**: `2147496960`

**NÃO** conceda permissões de:

- Administrator (`8`)
- Mention Everyone (`131072`)
- Manage Messages (`8192`)
- Kick/Ban Members

## URL de instalação

Monte a URL no Developer Portal em **OAuth2 → URL Generator**:

1. **Scopes**:
   - `applications.commands`
   - `bot`

2. **Bot Permissions**: selecione as 5 permissões da tabela acima

3. URL gerada (exemplo):

   ```
   https://discord.com/api/oauth2/authorize?client_id=SEU_CLIENT_ID&permissions=2147496960&scope=bot%20applications.commands
   ```

4. Acesse a URL no navegador e selecione o servidor de destino

## Registro de comandos

### Modo guild (desenvolvimento)

Para testes locais, registre os comandos apenas no servidor de desenvolvimento:

```env
DISCORD_COMMAND_REGISTRATION_MODE=guild
DISCORD_DEV_GUILD_ID=123456789012345678
```

Execute:

```bash
pnpm discord:register
```

Os comandos ficam disponíveis **instantaneamente** na guild de desenvolvimento.

### Modo global (produção)

Para disponibilizar os comandos em todos os servidores onde o bot está instalado:

```env
DISCORD_COMMAND_REGISTRATION_MODE=global
```

Execute:

```bash
pnpm discord:register
```

**Atenção**: o registro global pode levar até **1 hora** para propagar para todos os
servidores. Durante esse período, comandos podem não aparecer em algumas guildas.

### Limpeza de comandos

Para remover todos os comandos registrados:

```bash
pnpm discord:clear
```

## Canais e cargos

### Canal de alertas de spawn

```env
DISCORD_SPAWN_ALERT_CHANNEL_ID=123456789012345678
```

ID do canal onde os alertas de spawn (shiny, lendário, etc.) serão postados.

### Canal privado de alertas (opcional)

```env
DISCORD_PRIVATE_SPAWN_ALERT_CHANNEL_ID=123456789012345678
```

Canal para alertas com coordenadas exatas (apenas quando `SPAWN_COORDINATE_POLICY=exact_admin_only`).

### Cargos mencionados em alertas

```env
DISCORD_SHINY_ALERT_ROLE_ID=123456789012345678
DISCORD_LEGENDARY_ALERT_ROLE_ID=123456789012345678
```

IDs de cargos que serão mencionados em alertas de shiny e lendário, respectivamente.
O bot **nunca** usa `@everyone` ou `@here`.

### Guilds permitidas

```env
DISCORD_ALLOWED_GUILD_IDS=123456789012345678,876543210987654321
```

Lista de guilds onde o bot responde comandos. Se vazia, responde em todas onde está
instalado.

## Configurações adicionais

### Avatar do bot

```env
DISCORD_PROFESSOR_AVATAR_URL=https://exemplo.com/avatar.png
```

URL pública da imagem de avatar do Professor Carvalho nos alertas.

### Erros efêmeros

```env
DISCORD_DEFAULT_EPHEMERAL_ERRORS=true
```

Quando `true`, respostas de erro de comandos slash são efêmeras (visíveis apenas
para o usuário que executou o comando).

### Cooldown de comandos

```env
DISCORD_COMMAND_COOLDOWN_SECONDS=3
DISCORD_EXPENSIVE_COMMAND_COOLDOWN_SECONDS=10
```

Intervalo mínimo entre execuções do mesmo comando (3s para comandos leves,
10s para comandos que consultam a PokéAPI).

## Rotação de token

Se o token do bot for comprometido:

1. No Developer Portal, vá em **Bot → Token → Reset Token**
2. Copie o novo token
3. Atualize `DISCORD_TOKEN` no `.env` do proxy:
   ```bash
   vim .env
   # Altere DISCORD_TOKEN
   ```
4. Reinicie os serviços:
   ```bash
   docker compose -f deploy/compose.yaml restart bot-api worker
   ```
5. Verifique os logs para confirmar a conexão:
   ```bash
   docker compose -f deploy/compose.yaml logs bot-api | grep "pronto"
   ```

## Verificação pós-configuração

Após configurar tudo, execute os seguintes checks:

```bash
# 1. Health do bot-api
curl http://localhost:3080/health/live

# 2. Comandos registrados na guild de dev
curl -H "Authorization: Bot $DISCORD_TOKEN" \
     "https://discord.com/api/v10/applications/$DISCORD_CLIENT_ID/guilds/$DISCORD_DEV_GUILD_ID/commands"

# 3. Teste um comando no Discord
# Execute /status-professor no servidor de desenvolvimento
```
