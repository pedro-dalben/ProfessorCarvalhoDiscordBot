# Auditoria do JAR: Cobblemon Spawn Alerts 1.13.2 (Fabric)

**Data da auditoria**: 2026-08-05 (revalidada em 2026-08-05, branch `fix/csa-1.13.2-integration`)
**Método**: inspeção read-only com `sha256sum`, `unzip -l`, `unzip -p`, `javap -c -p -constants` em diretório temporário (`/tmp/opencode/csa-audit/`). Nenhum arquivo foi extraído no diretório de produção do Minecraft.

**JAR de produção (esperado)**: `/home/brainiac/bigbangcraft/bigmoncraft/mods/cobblemon_spawn_alerts-fabric-1.13.2.jar` — **não acessível a partir desta máquina de desenvolvimento** (proxy VPS separado). A auditoria foi feita sobre a cópia local:

```text
/home/pedro/.var/app/com.modrinth.ModrinthApp/data/ModrinthApp/profiles/BigMonCraft - Cobblemon Pack/mods/cobblemon_spawn_alerts-fabric-1.13.2.jar
```

## 1. SHA-256

Cópia local: `35bd1cd3491922199c83fceff270949d38b88732b297e5a3a22d596031304010` (confirmado).

> **Ação obrigatória antes de qualquer instalação em produção**: recalcular o hash do JAR de produção
> (`sha256sum /home/brainiac/bigbangcraft/bigmoncraft/mods/cobblemon_spawn_alerts-fabric-1.13.2.jar`)
> e comparar com o valor acima. Se divergir, a auditoria deve ser refeita.

## 2. Identificação (fabric.mod.json)

| Campo            | Valor                                           |
| ---------------- | ----------------------------------------------- |
| Mod ID           | `cobblemon_spawn_alerts`                        |
| Versão           | `1.13.2`                                        |
| Minecraft        | `1.21.1`                                        |
| Cobblemon        | `>=1.7.0`                                       |
| Ember's Text API | `>=2.5.0` (dependência obrigatória no servidor) |
| Autor            | Stasis, the Shattered                           |
| Licença          | MIT                                             |
| Tamanho          | 2.966.173 bytes                                 |

Dependências embutidas (shaded no JAR): Jackson (annotations/core/databind), `com.n1netails:n1netails-discord-webhook-client` 0.3.0, Architectury, Ember's Text API.

## 3. Diretório de configuração (confirmado no bytecode)

`AbstractConfigManager.<clinit>` resolve `FabricLoader.getConfigDir()` + `cobblemon-spawn-alerts`:

```text
config/cobblemon-spawn-alerts/
```

**Arquivos comuns (servidor)**, carregados por `CommonConfigManager`:

- `server.json`
- `server_message_templates.json`
- `rarities.json`
- `webhooks.json`

## 4. Comando de reload (confirmado no bytecode)

`CommandRegistry.registerCommonCommands`: literal `csa-common` → subcomando `reload`.

```text
/csa-common reload
```

- **Permissão**: in-game requer nível 3 (`hasPermissionLevel(3)`); console do servidor sempre permitido.
- **O que recarrega**: `CommonConfigManager.loadConfig()` — `server.json`, `server_message_templates.json`, `rarities.json` e `webhooks.json`. **Configs do cliente NÃO são recarregadas por este comando.**
- **Reinício**: não é necessário para alterações nesses 4 arquivos.
- **Sucesso**: `[CSA] Common configs reloaded!` (broadcast).
- **Falha**: `[CSA] Common configs reload failed.`
- **Sem permissão (in-game)**: `You do not have permission to use this command!`

> Atenção: documentações anteriores citavam `/cobblemonspawnalerts reload` — **não existe**. O comando verificado é `/csa-common reload`.

## 5. Comportamento HTTP do webhook (confirmado no bytecode)

Fonte: `com.n1netails.n1netails.discord.service.WebhookService.send()` (shaded no JAR) + `compat.DiscordWebhookService`.

| Característica     | Valor confirmado                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------- |
| Método HTTP        | `POST` (`HttpURLConnection.setRequestMethod("POST")`)                                        |
| Destino            | `new URL(webhookURL)` — **qualquer URL HTTP/HTTPS**, sem validação de domínio                |
| Content-Type       | `application/json` (multipart apenas se houver arquivos — nunca no CSA)                      |
| Cabeçalhos         | Apenas `Content-Type`; sem `User-Agent`, sem `Authorization`                                 |
| Corpo              | Jackson do `WebhookMessage`: `content`, `username`, `avatar_url`, `tts`, `embeds`            |
| Códigos de sucesso | **204** ou **200** (verificados nessa ordem)                                                 |
| Corpo da resposta  | **Ignorado** completamente                                                                   |
| Timeouts           | **Nenhum** (`setConnectTimeout`/`setReadTimeout` ausentes — Java padrão: infinito)           |
| Retries            | **Nenhum** — falha é apenas logada via SLF4J                                                 |
| Falha              | `DiscordWebhookException`/`DiscordWebhookDeliveryException` capturada e logada; nenhum crash |

**Conclusão**: o relay deve responder **204 No Content** (preferido) ou **200**. Corpos grandes são desnecessários.

## 6. Threading

`DiscordWebhookService.sendWebhook()` → `CompletableFuture.runAsync(...)` (ForkJoinPool comum). **Nunca bloqueia a thread principal do Minecraft.** Erros são capturados e logados; não causam crash.

## 7. Fluxo do alerta (servidor)

1. Cobblemon dispara `CobblemonEvents.POKEMON_ENTITY_SPAWN` (assinatura em `CobblemonSpawnAlerts.initServer`, prioridade NORMAL).
2. `FabricPlatformHelper.onPokemonSpawned(entity, bucket)` agenda `ScheduledTask` com **0,5 s** de delay.
3. A tarefa cria `AlertDataPacket` e chama `AlertHandler.alert(packet)`:
   - dedup por UUID no conjunto `alreadyAlerted` (HashSet);
   - se `shouldGlobalAlert(entity, bucket)` e `sendWebhook` (config da espécie/global): `DiscordWebhookService.sendWebhook(...)`;
   - broadcast `AlertDataPacket` para todos os jogadores online.
4. **Despawn**: `POKEMON_CAPTURED` / `BATTLE_FAINTED` → `alertDespawned` → **apenas chat** (mensagem com `{despawned}`). **Não existe webhook de despawn.**

## 8. Seleção de alertas globais (`AlertUtils.shouldGlobalAlert`)

Cadeia OR confirmada no bytecode:

| Condição                          | Flag do `server.json`                       |
| --------------------------------- | ------------------------------------------- |
| `pokemon.isShiny()`               | `alertShinies`                              |
| `pokemon.isLegendary()`           | `alertLegendaries`                          |
| `pokemon.isMythical()`            | `alertMythicals`                            |
| `pokemon.isUltraBeast()`          | `alertUltraBeasts`                          |
| `hasLabels(["paradox"])`          | `alertParadox`                              |
| `isStarter(dex)`                  | `alertStarters`                             |
| `hasHiddenAbility(form, ability)` | `alertHiddenAbility`                        |
| bucket ∈ `bucketsToAlert`         | `bucketsToAlert` (default `["ULTRA_RARE"]`) |

Defaults (`ServerConfig.createDefault()`): `enableSpawnCommandAlerts=false`, `alertShinies=true`, `broadcastShiny=true`, `alertLegendaries=true`, `alertMythicals=true`, `alertUltraBeasts=true`, `alertParadox=true`, `alertStarters=false`, `alertHiddenAbility=false`, `bucketsToAlert=[ULTRA_RARE]`, `broadcastBucket=true`, `broadcastIVs=true`, `broadcastEVs=true`, `broadcastNature=true`, `broadcastAbility=true`, `sendWebhook=false`.

**Buckets** (`RarityUtil.Bucket`): `COMMON`, `UNCOMMON`, `RARE`, `ULTRA_RARE`, `NONE`. O bucket vem do `SpawnPool` do Cobblemon (nome do `SpawnBucket`), com fallback `NONE`.

## 9. Dados do spawn

`PokemonSpawnData` (rede): `pokemonName`, `pokemonUUID`, `position` (Vector3f — floats), `dexId` (int), `nearestPlayerName`, `biomeKey`, `dimensionKey`, `bucket`.

**UUID do Pokémon**: disponível nos dados de rede, mas **NÃO há placeholder de webhook** para ele (enum `Tag` não possui `uuid`).

## 10. Placeholders confirmados (enum `Tag` + `DynamicReplacements`)

Tags: `{dex}`, `{level}`, `{bucket}`/`{rarity}`, `{shiny}`, `{hidden_ability}`/`{HA}`, `{legendary}` (aliases: `{mythical}`, `{ultrabeast}`, `{paradox}`), `{ivs}`, `{evs}`, `{nature}`, `{ability}`, `{gender}`, `{coords}`/`{coordinates}`, `{x}`, `{y}`, `{z}`, `{biome}`, `{nearest_player}`/`{player}`, `{name}`, `{name_lower}`, `{name_upper}`, `{timestamp}`, `{despawned}` (chat).

Variantes `_unformatted` e `_hover` são aplicadas pela mesma tag (o sufixo é removido em `Tag.fromString`).

**Semânticas críticas descobertas na auditoria (diferem da documentação anterior):**

1. **Booleanos não são `true`/`false`.** `{shiny_unformatted}` gera `"Shiny "` (com espaço) quando shiny e `""` quando não. `{legendary_unformatted}` gera **um único valor** entre `"Legendary"`, `"Mythical"`, `"Ultra Beast"`, `"Paradox"` ou `""` — a cadeia if/else do JAR retorna apenas o **primeiro** flag verdadeiro na ordem legendary > mythical > ultrabeast > paradox (via `RarityUtil.isLegendary` etc. por dex, ou `PokemonRarityData` no modo unformatted). Os aliases `{mythical_unformatted}` etc. produzem o MESMO valor único.
2. **`{timestamp}` = epoch em MILISSEGUNDOS** (`System.currentTimeMillis()`), não segundos.
3. **`{x}`/`{y}`/`{z}` são inteiros** — o float é truncado via `(int) f2i`; coordenada inválida vira `"N/A"`.
4. **Placeholder desconhecido é REMOVIDO** (vira string vazia) por `cleanupDynamicReplacements` — não vira `"N/A"`.
5. `"N/A"` aparece em casos específicos: nature/ability desconhecidos, bucket `NONE`, coordenada inválida, template ausente.
6. `{name}` usa o nome traduzido pelo Cobblemon (idioma do servidor); `{biome_unformatted}` usa o último segmento da biome key embelezado (ex.: `minecraft:savanna` → `Savanna`).
7. `{nearest_player_unformatted}` pode vir `null` → `"null"` (formatação `%s`).
8. Os valores de bucket unformatted são localizados pelas chaves de idioma do CSA (`common`, `uncommon`, `rare`, `ultra_rare`, `bucket_none`) — o JAR embute apenas `en_us.json`.

## 11. Limites

O CSA **não impõe** limites de tamanho de mensagem/embed; aplicam-se os limites da API do Discord (content 2000, embed 4096, fields 25×1024, etc.). O relay deve impor seus próprios limites defensivos.

## 12. Segurança (limitações conhecidas)

- URL arbitrária aceita (qualquer host, sem validação de domínio) — **mitigação**: WireGuard + CIDR allowlist + token no path.
- Sem autenticação nativa (sem headers de auth) — **mitigação**: token de 32+ bytes no path, comparação em tempo constante.
- Sem timeouts — **mitigação**: Nginx com timeouts curtos.
- Sem retry — alerta perdido se o relay estiver indisponível; broadcast in-game continua.
- Sem TLS próprio — HTTP em texto puro; **mitigação**: tráfego apenas na WireGuard (criptografia de rede).
- Webhook de despawn não existe.
- UUID do Pokémon não é exposto ao template de webhook (dedup só por fingerprint).

## 13. Veredito

**Modo A (relay interno) é compatível e recomendado.** O CSA 1.13.2 aceita POST JSON para qualquer URL, responde a 204/200 e processa de forma assíncrona. O Modo B (webhook Discord direto) é documentado como fallback.

**Riscos aceitos**: sem retry no CSA, sem timeouts no lado CSA, sem autenticação nativa (mitigado), despawn sem webhook, UUID indisponível para dedup.
