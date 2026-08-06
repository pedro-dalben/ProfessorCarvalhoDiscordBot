# Cobblemon Spawn Alerts 1.13.2 — Referência operacional (pt-BR)

Referência completa e verificada (bytecode do JAR) para o mod
**Cobblemon Spawn Alerts 1.13.2** usado no servidor BigMonCraft.

## 1. O que o mod faz

O **Cobblemon Spawn Alerts (CSA)** é um mod servidor/cliente do Cobblemon que
notifica jogadores (e, opcionalmente, um webhook Discord) quando Pokémon
relevantes aparecem: shiny, lendários, míticos, Ultra Beasts, Paradox, starters
e buckets raros. No BigMonCraft ele é usado em **Modo Relay (Modo A)** para
enviar alertas ao Professor Carvalho, que deduplica, normaliza, persiste e
publica no Discord.

## 2. Versões suportadas

| Item             | Valor                                      |
| ---------------- | ------------------------------------------ |
| Mod              | `cobblemon_spawn_alerts-fabric-1.13.2.jar` |
| Mod ID           | `cobblemon_spawn_alerts`                   |
| Minecraft        | **1.21.1** (Fabric)                        |
| Cobblemon        | **>= 1.7.0** (BigMonCraft: 1.7.3)          |
| Ember's Text API | **>= 2.5.0** (obrigatório no servidor)     |
| Fabric Loader    | qualquer versão compatível com MC 1.21.1   |

## 3. SHA-256

```text
35bd1cd3491922199c83fceff270949d38b88732b297e5a3a22d596031304010
```

Conferir sempre com `sha256sum` no arquivo de produção antes de qualquer
mudança. Este valor refere-se à cópia local auditada; a cópia de produção deve
produzir o mesmo hash (verificar no VPS).

## 4. Dependências

- **No servidor**: Fabric API, Cobblemon >= 1.7.0, Ember's Text API >= 2.5.0.
- **Embutidas no JAR** (não é preciso instalar): Jackson, cliente
  `n1netails-discord-webhook-client` 0.3.0, Architectury.

## 5. Ciclo de vida do evento

1. `CobblemonEvents.POKEMON_ENTITY_SPAWN` é disparado.
2. O CSA calcula o bucket pelo `SpawnPool` do Cobblemon e agenda a análise com **0,5 s** de atraso.
3. `AlertHandler.alert()`:
   - ignora UUIDs já alertados (conjunto em memória);
   - decide alerta global por `shouldGlobalAlert` (ver seção 6);
   - se global e `sendWebhook=true`: envia o webhook (assíncrono);
   - broadcast para os jogadores online.
4. **Despawn** (capturado/derrotado/morreu): apenas chat com `{despawned}`. **Não há webhook de despawn.**

## 6. Lógica de seleção de alerta

Alerta global quando **qualquer** condição verdadeira (OR):

| Condição                  | Config                                      |
| ------------------------- | ------------------------------------------- |
| Shiny                     | `alertShinies`                              |
| Lendário                  | `alertLegendaries`                          |
| Mítico                    | `alertMythicals`                            |
| Ultra Beast               | `alertUltraBeasts`                          |
| Paradox (label `paradox`) | `alertParadox`                              |
| Starter                   | `alertStarters`                             |
| Hidden Ability            | `alertHiddenAbility`                        |
| Bucket na lista           | `bucketsToAlert` (default `["ULTRA_RARE"]`) |

## 7. `server.json` — todos os campos

| Campo                      | Tipo     | Padrão           | Descrição                                                       |
| -------------------------- | -------- | ---------------- | --------------------------------------------------------------- |
| `configVersion`            | string   | `"1.13.2"`       | Versão do esquema.                                              |
| `comment`                  | string[] | —                | Comentários (ignorados).                                        |
| `enableSpawnCommandAlerts` | bool     | `false`          | Se `/pokespawn` gera alertas.                                   |
| `alertShinies`             | bool     | `true`           | Alerta shiny.                                                   |
| `broadcastShiny`           | bool     | `true`           | Mostra o status shiny no broadcast.                             |
| `alertLegendaries`         | bool     | `true`           | Alerta lendários.                                               |
| `alertMythicals`           | bool     | `true`           | Alerta míticos.                                                 |
| `alertUltraBeasts`         | bool     | `true`           | Alerta Ultra Beasts.                                            |
| `alertParadox`             | bool     | `true`           | Alerta Paradox.                                                 |
| `alertStarters`            | bool     | `false`          | Alerta iniciais.                                                |
| `alertHiddenAbility`       | bool     | `false`          | Alerta Hidden Ability.                                          |
| `bucketsToAlert`           | enum[]   | `["ULTRA_RARE"]` | Buckets alertados (`COMMON`, `UNCOMMON`, `RARE`, `ULTRA_RARE`). |
| `broadcastBucket`          | bool     | `true`           | Mostra bucket no broadcast.                                     |
| `broadcastIVs`             | bool     | `true`           | Mostra IVs no broadcast.                                        |
| `broadcastEVs`             | bool     | `true`           | Mostra EVs no broadcast.                                        |
| `broadcastNature`          | bool     | `true`           | Mostra nature.                                                  |
| `broadcastAbility`         | bool     | `true`           | Mostra ability.                                                 |
| `sendWebhook`              | bool     | `false`          | Habilita o envio de webhook para alertas globais.               |

## 8. `webhooks.json` — todos os campos

| Campo                                              | Tipo     | Descrição                                                        |
| -------------------------------------------------- | -------- | ---------------------------------------------------------------- |
| `configVersion`                                    | string   | `"1.13.2"`.                                                      |
| `comment`                                          | string[] | Comentários.                                                     |
| `webhookURL`                                       | string   | URL do webhook (qualquer HTTP/HTTPS — sem validação de domínio). |
| `webhookContent.content`                           | string   | Conteúdo da mensagem (marcador PC_CSA_V1 no Modo A).             |
| `webhookContent.username`                          | string   | Nome exibido no webhook.                                         |
| `webhookContent.avatarURL`                         | string   | URL do avatar.                                                   |
| `webhookContent.tts`                               | bool     | Leitura por voz (desabilitado).                                  |
| `webhookContent.embeds[]`                          | lista    | Embed(s) Discord.                                                |
| `embeds[].enabled`                                 | bool     | Liga/desliga o embed.                                            |
| `embeds[].title` / `description` / `url` / `color` | string   | Campos do embed (placeholders válidos).                          |
| `embeds[].imageURL` / `thumbnailURL`               | string   | Imagens.                                                         |
| `embeds[].timestamp`                               | bool     | Adiciona `timestamp` (ISO-8601, `Instant.now()`).                |
| `embeds[].author.{name,url,iconURL}`               | objeto   | Autor do embed.                                                  |
| `embeds[].fields[]`                                | lista    | `{name, value, inline}`.                                         |
| `embeds[].footer.{text,iconURL}`                   | objeto   | Rodapé.                                                          |

> O payload HTTP enviado usa a serialização Jackson do `WebhookMessage`
> (chaves snake_case: `avatar_url`, `icon_url`, `image: {url}`, `thumbnail: {url}`).

## 9. Placeholders confirmados

`{dex}`, `{level}`, `{bucket}` (alias `{rarity}`), `{shiny}`, `{hidden_ability}` (alias `{HA}`),
`{legendary}` (aliases `{mythical}`, `{ultrabeast}`, `{paradox}`), `{ivs}`, `{evs}`, `{nature}`,
`{ability}`, `{gender}`, `{coords}` (alias `{coordinates}`), `{x}`, `{y}`, `{z}`, `{biome}`,
`{nearest_player}` (alias `{player}`), `{name}`, `{name_lower}`, `{name_upper}`, `{timestamp}`,
`{despawned}` (apenas chat).

## 10. Variantes `_unformatted`

Todos os placeholders acima (exceto `{name}`/`{name_lower}`/`{name_upper}`/`{timestamp}`/`{despawned}`)
aceitam sufixos `_unformatted` (texto puro, sem markup) e `_hover` (tooltip).

**Valores exatos gerados (en_us, confirmados no JAR):**

| Placeholder                                 | Valor quando verdadeiro                                                                               | Quando falso/ausente |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------- |
| `{shiny_unformatted}`                       | `"Shiny "` (com espaço)                                                                               | `""`                 |
| `{legendary_unformatted}`                   | `"Legendary"` \| `"Mythical"` \| `"Ultra Beast"` \| `"Paradox"` (valor ÚNICO, prioridade nessa ordem) | `""`                 |
| `{hidden_ability_unformatted}`              | `"Hidden Ability "` (com espaço)                                                                      | `""`                 |
| `{bucket_unformatted}`                      | `"Common"` \| `"Uncommon"` \| `"Rare"` \| `"Ultra Rare"`                                              | `"N/A"`              |
| `{dex_unformatted}` / `{level_unformatted}` | número                                                                                                | —                    |
| `{x}`/`{y}`/`{z}`                           | inteiro truncado                                                                                      | `"N/A"`              |
| `{biome_unformatted}`                       | último segmento da biome key embelezado                                                               | —                    |
| `{nearest_player_unformatted}`              | nome do jogador                                                                                       | `"null"` possível    |

> Os aliases `{mythical_unformatted}`, `{ultrabeast_unformatted}`, `{paradox_unformatted}`
> retornam o MESMO valor único de `{legendary_unformatted}` (mesma tag interna).
> Por isso o marcador PC_CSA_V1 usa um único campo `rarity`.

## 11. Comportamento HTTP

POST JSON para `webhookURL`. Sem cabeçalhos adicionais. Serialização Jackson.
Sucesso: **200** ou **204** (204 verificado primeiro). Corpo da resposta ignorado.

## 12. Threading

`CompletableFuture.runAsync` (ForkJoinPool comum). Não bloqueia a thread principal.

## 13. Timeouts

Nenhum configurado (infinito por padrão da JVM). Mitigar com Nginx
(`proxy_connect_timeout 3s; proxy_read_timeout 10s`).

## 14. Retry

Nenhum. Se o POST falhar, o alerta é perdido (logado no servidor). O broadcast
in-game não é afetado.

## 15. Códigos de sucesso

`204 No Content` (preferido) ou `200 OK`. Qualquer outro status gera
`DiscordWebhookDeliveryException` (apenas log).

## 16. Diretório de configuração

```text
config/cobblemon-spawn-alerts/
```

## 17. Comando de reload

```text
/csa-common reload
```

## 18. Permissões

- Console do servidor: sempre permitido.
- In-game: nível de permissão **3** (op nível 3).

## 19. Logging

SLF4J. Falhas de webhook: `Cannot send Discord webhook: <msg>\n<cause>` (erro).
Falhas de config: `Config failed to load properly while loading %s`.

## 20. Riscos de segurança

URL arbitrária; sem autenticação; sem TLS próprio; sem timeout; sem retry;
token do webhook em texto no `webhooks.json` (usar permissão 600);
UUID do Pokémon indisponível ao template; placeholder desconhecido removido (não vira N/A).

## 21. Configuração recomendada (BigMonCraft)

```json
{
  "configVersion": "1.13.2",
  "enableSpawnCommandAlerts": false,
  "alertShinies": true,
  "broadcastShiny": true,
  "alertLegendaries": true,
  "alertMythicals": true,
  "alertUltraBeasts": true,
  "alertParadox": true,
  "alertStarters": false,
  "alertHiddenAbility": true,
  "bucketsToAlert": ["ULTRA_RARE"],
  "broadcastBucket": true,
  "broadcastIVs": true,
  "broadcastEVs": true,
  "broadcastNature": true,
  "broadcastAbility": true,
  "sendWebhook": true
}
```

Templates prontos em `deploy/csa/1.13.2/`.

## 22. Integração com o relay

`webhookURL` aponta para `http://<IP_WIREGUARD_DO_PROXY>/v1/integrations/csa/<TOKEN>`
e `webhookContent.content` contém o marcador:

```text
PC_CSA_V1|dex={dex_unformatted}|lvl={level_unformatted}|x={x}|y={y}|z={z}|biome={biome_unformatted}|bucket={bucket_unformatted}|shiny={shiny_unformatted}|rarity={legendary_unformatted}|ha={hidden_ability_unformatted}|name={name}|player={nearest_player_unformatted}|ts={timestamp}
```

O relay valida o marcador (ver `docs/csa-integration.md`), normaliza, deduplica
atomicamente, persiste e entrega no Discord sem coordenadas exatas.

## 23. Fallback Discord direto

`webhookURL` com webhook Discord comum. Sem dedup, sem privacidade, sem persistência.
Usar apenas se o relay estiver indisponível de forma prolongada.

## 24. Procedimento de teste

1. `pnpm integrations:csa:doctor`
2. `pnpm integrations:csa:test-fixture -- --fixture shiny` (e `legendary`, `rare`)
3. Teste controlado no servidor (guia completo em `docs/csa-testing.md`).

## 25. Rollback

Restaurar backups com timestamp:

```bash
cp server.json.bak.$(date +%Y%m%d-%H%M%S) server.json
cp webhooks.json.bak.$(date +%Y%m%d-%H%M%S) webhooks.json
/csa-common reload
```

## 26. Troubleshooting

| Sintoma                        | Causa provável                  | Ação                                                   |
| ------------------------------ | ------------------------------- | ------------------------------------------------------ |
| Sem alerta no Discord          | `sendWebhook: false`            | Ativar e recarregar.                                   |
| HTTP não-2xx no log            | Relay fora do ar / token errado | `pnpm integrations:csa:doctor`; conferir CIDR e token. |
| Nenhum alerta global           | bucket fora de `bucketsToAlert` | Conferir `shouldGlobalAlert`.                          |
| `Common configs reload failed` | JSON inválido                   | Validar JSON; restaurar backup.                        |
| Jogador sem permissão          | Nível < 3                       | Usar console.                                          |

## 27. Limitações conhecidas

Sem retry; sem timeout; sem webhook de despawn; UUID fora do template; booleanos
não são `true/false`; `rarity` é valor único (perde combinações lendário+mítico);
coordenadas truncadas para inteiro; strings localizadas pelo idioma do servidor.

## 28. Avisos de upgrade

- **1.12.0+**: MiniMessage foi substituído pelo Ember's Text API — quebra configs antigas.
- **1.13.0+**: qualquer `{...}` no texto é tratado como placeholder — chaves diferentes de `{}` devem ser usadas para texto literal.
- Ao atualizar o JAR: conferir SHA-256, reler esta referência e revalidar o marcador.
