# Integração CSA — Professor Carvalho

## Resumo da auditoria do JAR

O JAR `cobblemon_spawn_alerts-fabric-1.13.2.jar` foi auditado por bytecode em
2026-08-05 (relatório completo em `docs/csa-audit.md`; referência operacional
em `docs/cobblemon-spawn-alerts-1.13.2.md`).

| Aspecto                            | Resultado                                                        |
| ---------------------------------- | ---------------------------------------------------------------- |
| Compatibilidade com Modo A (relay) | Compatível — POST JSON para qualquer URL                         |
| Threading                          | `CompletableFuture.runAsync()` — nunca bloqueia thread principal |
| Timeouts HTTP                      | Nenhum no CSA (Java padrão: infinito)                            |
| Retry                              | Nenhum — falha apenas logada                                     |
| Autenticação                       | Nenhuma nativa — token no path + CIDR como mitigação             |
| Sucesso HTTP                       | **204** ou **200** (o relay responde 204)                        |

**Veredito**: Modo A (relay interno) é compatível e recomendado.

## Arquitetura (Modo A)

```
Servidor Minecraft (CSA 1.13.2)
    │  POST JSON (rede WireGuard, HTTP)
    ▼
VPS do Proxy (Nginx → bot-api:3080)
    │  1. CIDR allowlist (só IP do Minecraft na WireGuard)
    │  2. Token no path, comparação em tempo constante
    │  3. Content-Type + limite de corpo (64 KiB)
    │  4. Validação Zod do payload
    │  5. Parse obrigatório do marcador PC_CSA_V1
    │  6. Normalização (antes do dedup)
    │  7. Dedup atômico (Redis SET NX, janela 90 s, fail-open)
    │  8. Persistência: integration_events (+ normalized_payload)
    │  9. Enfileiramento (BullMQ: spawn-alerts)
    ▼
Worker: spawn_events (idempotente) → BullMQ spawn-delivery
    ▼
Worker: claim atômico → embed real → Discord
```

## Fluxo do relay (o que cada requisição faz)

1. Modo `relay`? Não → 404.
2. Token válido (tempo constante)? Não → 401 (sem revelar se a fonte existe).
3. IP dentro de `CSA_ALLOWED_CIDRS`? Não → 403.
4. `Content-Type: application/json`? Não → 415.
5. Body dentro do limite e válido no schema Zod? Não → 400.
6. Marcador `PC_CSA_V1` presente e interpretável com confiança alta? Não → 400.
7. Fonte de integração habilitada? Não → 403.
8. Dedup: segundo evento idêntico na janela → 204 sem persistir.
9. Persistir `integration_events` + evento normalizado; enfileirar; tocar
   `last_seen_at`; métricas; responder **204 No Content**.

## Configuração no servidor Minecraft

Diretório (confirmado no JAR): `config/cobblemon-spawn-alerts/`.

1. Backup: `cp server.json "server.json.bak.$(date +%Y%m%d-%H%M%S)"` (idem `webhooks.json`).
2. Copie os templates de `deploy/csa/1.13.2/`:
   - `server.json.example` → `server.json`
   - `webhooks.relay.json.example` → `webhooks.json`
3. Substitua `COLE_A_URL_DO_RELAY_AQUI` por
   `http://<IP_WIREGUARD_DO_PROXY>/v1/integrations/csa/<CSA_SOURCE_TOKEN>`.
4. Permissões: `chmod 600 webhooks.json`.
5. **Reload** (comando confirmado no JAR — não é `/cobblemonspawnalerts`):
   ```
   /csa-common reload
   ```
   - Console: sempre permitido; in-game: nível 3.
   - Sucesso: `[CSA] Common configs reloaded!` — recarrega `server.json`,
     `server_message_templates.json`, `rarities.json` e `webhooks.json`.
   - Reinício do servidor: **não é necessário**.

## Configuração no proxy (.env)

```env
CSA_INTEGRATION_MODE=relay
CSA_SOURCE_TOKEN=<token com no mínimo 32 caracteres>
CSA_ALLOWED_CIDRS=<IP_WIREGUARD_DO_SERVIDOR>/32
CSA_BODY_LIMIT_BYTES=65536
CSA_DEDUP_WINDOW_SECONDS=90
CSA_DEDUP_FAIL_OPEN=true
CSA_RATE_LIMIT_MAX=60
CSA_RATE_LIMIT_WINDOW_SECONDS=60
CSA_STORE_SANITIZED_PAYLOAD_DAYS=14
CSA_EXPECTED_SOURCE_VERSION=1.13.2
```

Crie a fonte no banco (idempotente): `pnpm integrations:csa:setup`.

## Marcador PC_CSA_V1 (confirmado para 1.13.2)

```text
PC_CSA_V1|dex={dex_unformatted}|lvl={level_unformatted}|x={x}|y={y}|z={z}|biome={biome_unformatted}|bucket={bucket_unformatted}|shiny={shiny_unformatted}|rarity={legendary_unformatted}|ha={hidden_ability_unformatted}|name={name}|player={nearest_player_unformatted}|ts={timestamp}
```

Semântica verificada no JAR:

- `shiny=` → `"Shiny "` (com espaço) ou vazio.
- `rarity=` → **valor único**: `Legendary` | `Mythical` | `Ultra Beast` | `Paradox` | vazio
  (prioridade legendary > mythical > ultrabeast > paradox). Os aliases
  `{mythical_unformatted}`, `{ultrabeast_unformatted}`, `{paradox_unformatted}`
  produzem o mesmo valor — por isso há um único campo `rarity`.
- `ha=` → `"Hidden Ability "` ou vazio.
- `ts=` → epoch em **milissegundos**.
- Placeholder desconhecido é **removido** (vira vazio) pelo CSA, não `"N/A"`.
- `N/A` aparece em casos pontuais (bucket NONE, coordenada inválida, nature/ability desconhecidos).
- O parser: tolera `N/A` e campos ausentes; rejeita níveis/coordenadas absurdas;
  normaliza Unicode; remove markup; **nunca trata texto desconhecido como true**
  (confiança baixa → rejeição em modo relay).

## Modo B — Webhook Discord direto (fallback)

`webhookURL` com webhook Discord comum (template `webhooks.discord-direct.json.example`).

### Limitações do Modo B

- Sem deduplicação, sem persistência, sem normalização, sem privacidade de coordenadas.
- CSA aceita qualquer URL (sem validação de domínio) — risco de vazamento do token do webhook nos logs.

## Considerações de segurança

| Camada            | Mecanismo                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Rede              | WireGuard — tráfego CSA → relay apenas na rede privada                                    |
| Autenticação      | Token aleatório (mín. 32 chars) no path, `safeTokenCompare` (tempo constante)             |
| Autorização de IP | Nginx `allow <CIDR>` + `deny all`; bot-api revalida com `CSA_ALLOWED_CIDRS`               |
| Proxy trust       | `trustProxy` restrito (loopback/CIDR explícitos) — XFF forjado não burla                  |
| Rate limiting     | Global + específico da rota CSA (`CSA_RATE_LIMIT_MAX`)                                    |
| Validação         | Zod com limites; marcador obrigatório; parse defensivo                                    |
| Privacidade       | Coordenadas exatas nunca no Discord público; jogador mais próximo oculto por padrão       |
| Sanitização       | `avatar_url` e URLs de webhook redatadas antes de persistir                               |
| Logs              | URL tokenizada redatada pelo serializer do logger; `access_log off` na rota               |
| Armazenamento     | Apenas hash SHA-256 do token no PostgreSQL; token em `.env` e `webhooks.json` (chmod 600) |

## Política de falhas

| Falha                   | Comportamento                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Proxy indisponível      | CSA não re-tenta; alerta perdido (broadcast in-game continua)                                                              |
| Nginx indisponível      | CSA loga falha HTTP; nenhum crash no Minecraft                                                                             |
| Redis indisponível      | Dedup **fail-open** (padrão): evento aceito sem dedup para não perder alerta; configurável com `CSA_DEDUP_FAIL_OPEN=false` |
| PostgreSQL indisponível | 503 — o evento não é aceito sem persistência durável                                                                       |
| Discord indisponível    | Evento permanece persistido; BullMQ re-tenta com backoff exponencial (5 tentativas)                                        |
| Payload malformado      | 400 + métrica `parse_failure`                                                                                              |
| Token inválido          | 401 sem revelar existência da fonte                                                                                        |
| IP inválido             | 403 sem processar                                                                                                          |

## Deduplicação

- Fingerprint semântico: serverId, dex, espécie normalizada, nível, shiny,
  legendary/mythical/ultraBeast/paradox, bucket, biome, coordenadas arredondadas
  (grade de 32 blocos) e janela temporal (90 s).
- Aquisição atômica `SET NX EX` — jamais `isDuplicate()` + `markDuplicate()`.
- Dois Pokémon diferentes no mesmo bucket não são suprimidos; mesma espécie em
  regiões distantes não é suprimida; eventos idênticos fora da janela são aceitos.

## Entrega no Discord

- O worker carrega o `spawn_events` persistido (nunca re-parsa o payload do job).
- Embed com dados reais: Pokémon, número da Pokédex, nível, raridade, bioma,
  região aproximada (se `region`). Footer: `BigMonCraft • Radar do Professor Carvalho`.
- Idempotência: claim atômico (`delivery_status`), `discord_message_id`,
  `delivered_at`, `delivery_attempts`, `last_delivery_error`.
- Menções: role shiny apenas para shiny; role lendária apenas para
  lendário/mítico/Ultra Beast/Paradox; `parse: []`; allowlist de IDs.
- Política de coordenadas: `hidden` (padrão) | `region` | `exact_admin_only`
  (canal privado configurado).

## Procedimento de teste

1. `pnpm integrations:csa:doctor`
2. `pnpm integrations:csa:test-fixture -- --fixture shiny` (e `legendary`, `rare`)
3. Teste controlado no servidor (Pikachu) — ver `docs/csa-testing.md`.
4. E2E automatizado: `pnpm test:integration`.

## Rollback

```bash
# No servidor Minecraft
cp config/cobblemon-spawn-alerts/server.json.bak.<ts> config/cobblemon-spawn-alerts/server.json
cp config/cobblemon-spawn-alerts/webhooks.json.bak.<ts> config/cobblemon-spawn-alerts/webhooks.json
/csa-common reload
```

Para desabilitar o relay no proxy: `CSA_INTEGRATION_MODE=disabled` (endpoint → 404).

## Troubleshooting

| Sintoma                | Causa provável               | Ação                                                              |
| ---------------------- | ---------------------------- | ----------------------------------------------------------------- |
| CSA não envia webhooks | `sendWebhook: false`         | Conferir `server.json` e recarregar                               |
| 401 no proxy           | Token errado                 | `pnpm integrations:csa:doctor`; conferir `.env` e `webhooks.json` |
| 403 no proxy           | IP fora do CIDR              | Conferir `CSA_ALLOWED_CIDRS` e bind do Nginx                      |
| 400 no proxy           | Marcador ausente/ilegível    | Conferir `webhookContent.content` (template do 1.13.2)            |
| Alerta duplicado       | Redis fora do ar (fail-open) | Restaurar Redis; `professor_csa_event_duplicate_total`            |
| Alerta não chega       | Canal/worker/token Discord   | `pnpm integrations:csa:doctor`; filas em `/metrics`               |
| Timeout no log do CSA  | Relay lento/indisponível     | WireGuard, Nginx, `health/ready`                                  |

## Migração para o Gateway Fabric

O Modo A (relay via CSA) é o MVP. O plano futuro (`docs/future-gateway-contract.md`)
substitui o CSA pelo Gateway Fabric (HMAC, replay protection, tipos expandidos,
spool local). A migração: instalar o mod Gateway, ativar `GATEWAY_INGRESS_ENABLED`,
desabilitar `CSA_INTEGRATION_MODE`, remover o CSA.
