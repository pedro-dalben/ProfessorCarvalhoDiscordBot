# Auditoria do JAR: Cobblemon Spawn Alerts 1.13.2 (Fabric)

**Data da auditoria**: 2026-08-05
**Auditor**: Professor Carvalho MVP — fase 1
**Local do JAR**: `/home/pedro/.var/app/com.modrinth.ModrinthApp/data/ModrinthApp/profiles/BigMonCraft - Cobblemon Pack/mods/cobblemon_spawn_alerts-fabric-1.13.2.jar` (cópia local — o JAR em produção está em `/home/brainiac/bigbangcraft/bigmoncraft/mods/cobblemon_spawn_alerts-fabric-1.13.2.jar`)
**Validação**: Binário inspecionado com `unzip -l`, `unzip -p`, `javap -c -p -constants`, `sha256sum`, e comparação com documentação oficial em https://stainlessstasis.github.io/CSA-Docs/.

## 1. Identificação do artefato

| Campo       | Valor                                                              |
| ----------- | ------------------------------------------------------------------ |
| Arquivo     | `cobblemon_spawn_alerts-fabric-1.13.2.jar`                         |
| SHA-256     | `35bd1cd3491922199c83fceff270949d38b88732b297e5a3a22d596031304010` |
| Mod ID      | `cobblemon_spawn_alerts`                                           |
| Versão      | `1.13.2`                                                           |
| Minecraft   | `1.21.1` (Fabric)                                                  |
| Cobblemon   | `>=1.7.0` (servidor BigMonCraft: 1.7.3)                            |
| Autor       | Stasis, the Shattered                                              |
| Licença     | MIT                                                                |
| CurseForge  | Project ID 1295053, File ID 7722424                                |
| Repositório | https://github.com/StainlessStasis/CobblemonSpawnAlerts            |
| Tamanho     | 2.966.173 bytes                                                    |

## 2. Dependências embutidas

- Jackson (com.fasterxml.jackson.core): annotations, core, databind
- `com.n1netails:n1netails-discord-webhook-client` (versão 0.3.0)
- Architectury (injeção common/dev)
- Ember's Text API `>=2.5.0`

## 3. Comportamento HTTP (webhook)

**Fonte**: `com.n1netails.n1netails.discord.service.WebhookService.send()`

| Característica | Valor confirmado                                                                             |
| -------------- | -------------------------------------------------------------------------------------------- |
| Método HTTP    | `POST`                                                                                       |
| Destino        | `new URL(webhookURL)` — **qualquer URL HTTP/HTTPS aceita**, sem validação de domínio Discord |
| Content-Type   | `application/json`                                                                           |
| Timeouts       | **Nenhum configurado** (depende do SO; Java padrão: infinito)                                |
| Tentativas     | **Nenhuma** — falha é apenas logada                                                          |
| Cabeçalhos     | Apenas `Content-Type`; sem `User-Agent`, sem `Authorization`                                 |
| Corpo          | Serialização Jackson do `WebhookMessage` (content, username, avatar_url, tts, embeds)        |
| Sucesso        | HTTP **200** ou **204**                                                                      |
| Resposta       | Corpo da resposta **ignorado** completamente                                                 |

**Conclusão**: **Modo Relay (Modo A) é compatível.** O CSA aceita enviar POST para qualquer URL, incluindo um endpoint interno via WireGuard.

## 4. Threading

**Fonte**: `io.github.stainlessstasis.compat.DiscordWebhookService.sendWebhook()`

O envio do webhook é despachado via `CompletableFuture.runAsync()`, que utiliza o **ForkJoinPool comum**. **Nunca bloqueia a thread principal do Minecraft.**

Erros são capturados e logados via SLF4J; nunca causam crash.

## 5. Fluxo de alerta (servidor)

1. Cobblemon dispara `POKEMON_ENTITY_SPAWN`
2. `CobblemonSpawnAlerts.initServer` → `FabricPlatformHelper.onPokemonSpawned(entity, bucket)`
3. Agendamento com **0,5s de delay** (Cobblemon ScheduledTask)
4. Tarefa agendada:
   - Envia `PokemonDataPacket` para jogadores próximos (tracking)
   - `AlertUtils.shouldGlobalAlert(entity, bucket)` avalia `ServerConfig`
   - Se for alerta global: adiciona UUID ao conjunto `globallyAlerted` (dedup servidor)
   - Se `sendWebhook: true`: `DiscordWebhookService.sendWebhook(alertData, null)`
   - Broadcast `AlertDataPacket` para todos os jogadores online

## 6. Seleção de alertas globais (ServerConfig)

| Campo                      | Valor padrão (vem do mod) | Comportamento                                           |
| -------------------------- | ------------------------- | ------------------------------------------------------- |
| `enableSpawnCommandAlerts` | `false`                   | `/pokespawn` não gera alertas por padrão                |
| `alertShinies`             | `true`                    | Alerta shinies                                          |
| `broadcastShiny`           | `true`                    | Broadcast do status shiny                               |
| `alertLegendaries`         | `true`                    | Alerta lendários                                        |
| `alertMythicals`           | `true`                    | Alerta míticos                                          |
| `alertUltraBeasts`         | `true`                    | Alerta Ultra Beasts                                     |
| `alertParadox`             | `true`                    | Alerta Paradox                                          |
| `alertStarters`            | `false`                   | Iniciais não alertados por padrão                       |
| `alertHiddenAbility`       | `false`                   | Hidden Ability não alertada por padrão                  |
| `bucketsToAlert`           | `["ULTRA_RARE"]`          | Apenas bucket ULTRA_RARE                                |
| `sendWebhook`              | `false`                   | Webhook desabilitado por padrão (ativar no BigMonCraft) |

## 7. Dados disponíveis nos alertas

**Fonte**: `AlertDataPacket` → `PokemonSpawnData`, `PokemonStats`, `PokemonRarityData`, `PokemonTraits`

| Campo                | Fonte                                  | Observação                             |
| -------------------- | -------------------------------------- | -------------------------------------- |
| Nome da espécie      | `PokemonSpawnData.pokemonName`         | Traduzido pelo Cobblemon               |
| UUID                 | `PokemonSpawnData.pokemonUUID`         | Usado para dedup no servidor           |
| Posição (x, y, z)    | `PokemonSpawnData.position` (Vector3f) | Coordenadas float                      |
| Número da Dex        | `PokemonSpawnData.dexId`               | Inteiro                                |
| Jogador mais próximo | `PokemonSpawnData.nearestPlayerName`   | Nome do jogador                        |
| Bioma                | `PokemonSpawnData.biomeKey`            | BiomeKey Minecraft                     |
| Dimensão             | `PokemonSpawnData.dimensionKey`        | **Não tem placeholder de webhook**     |
| Bucket               | `PokemonSpawnData.bucket`              | Enum (ULTRA_RARE, RARE, etc.)          |
| Nível                | `PokemonStats.level`                   | Inteiro                                |
| IVs                  | `PokemonStats.ivs`                     | 6 valores (HP/Atk/Def/SpAtk/SpDef/Spd) |
| EVs                  | `PokemonStats.evYield`                 | 6 valores                              |
| Nature               | `PokemonTraits.natureID`               | String                                 |
| Ability              | `PokemonTraits.abilityID`              | String                                 |
| Gênero               | `PokemonTraits.genderID`               | String                                 |
| Forma                | `PokemonTraits.formID`                 | String                                 |
| Shiny                | `PokemonRarityData.isShiny`            | Booleano                               |
| Lendário             | `PokemonRarityData.isLegendary`        | Booleano                               |
| Mítico               | `PokemonRarityData.isMythical`         | Booleano                               |
| Ultra Beast          | `PokemonRarityData.isUltraBeast`       | Booleano                               |
| Paradox              | `PokemonRarityData.isParadox`          | Booleano                               |
| Starter              | `PokemonRarityData.isStarter`          | Booleano                               |

## 8. Placeholders dinâmicos confirmados

**Fonte**: `DynamicReplacements` + `ServerMessageTemplates`

Placeholders disponíveis no webhook (templates `{...}` no `webhooks.json`):

`{name}`, `{name_lower}`, `{name_upper}`, `{dex}`, `{level}`, `{ivs}`, `{evs}`, `{nature}`, `{ability}`, `{gender}`, `{coords}`, `{x}`, `{y}`, `{z}`, `{biome}`, `{nearest_player}`, `{shiny}`, `{legendary}`, `{mythical}`, `{ultrabeast}`, `{paradox}`, `{hidden_ability}`/`{HA}`, `{bucket}`/`{rarity}`, `{timestamp}`, `{despawned}`

Variantes: `{..._unformatted}` (sem markup, texto puro), `{..._hover}` (texto para tooltip).

**Placeholders desconhecidos são substituídos por `"N/A"`.**

## 9. Marcador PC_CSA_V1

Template machine-readable inserido no campo `content` do webhook para o Modo Relay:

```
PC_CSA_V1|dex={dex_unformatted}|lvl={level_unformatted}|x={x}|y={y}|z={z}|biome={biome_unformatted}|bucket={bucket_unformatted}|shiny={shiny_unformatted}|leg={legendary_unformatted}|myth={mythical_unformatted}|ub={ultrabeast_unformatted}|par={paradox_unformatted}|ha={hidden_ability_unformatted}|name={name}|player={nearest_player_unformatted}|ts={timestamp}
```

## 10. Segurança

- **URL arbitrária**: CSA não restringe para discord.com — qualquer endpoint HTTP/HTTPS é aceito
- **Sem TLS próprio**: Se a URL for HTTP (não HTTPS), o tráfego é em texto puro. **Mitigação**: WireGuard (rede privada)
- **Sem autenticação nativa**: CSA não envia cabeçalhos de autenticação. **Mitigação**: token no path + CIDR allowlist + IP privado
- **Sem timeouts**: Conexões podem ficar pendentes indefinidamente. **Mitigação**: Nginx com proxy_read_timeout curto
- **Sem retry**: Se o relay falhar, o alerta é perdido. **Mitigação**: broadcast in-game continua funcionando; documentado como limitação do Modo A

## 11. Verdict da auditoria

**Modo A (relay interno) é compatível e recomendado.** O CSA 1.13.2 aceita POST JSON para qualquer URL, responde a 200/204, e processa de forma assíncrona (não bloqueia o servidor Minecraft). O Modo B (webhook Discord direto) é documentado como fallback.

**Riscos aceitos**: sem retry no CSA (perda de alerta se relay estiver down), sem timeouts configuráveis no lado CSA, sem autenticação nativa (mitigado por WireGuard + token no path + CIDR).
