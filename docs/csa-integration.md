# Integração CSA — Professor Carvalho

## Resumo da auditoria do JAR

O JAR `cobblemon_spawn_alerts-fabric-1.13.2.jar` foi auditado em 2026-08-05
(relatório completo em `docs/csa-audit.md`).

| Aspecto                            | Resultado                                                            |
| ---------------------------------- | -------------------------------------------------------------------- |
| Compatibilidade com Modo A (relay) | Compatível — aceita POST JSON para qualquer URL                      |
| Threading                          | `CompletableFuture.runAsync()` — nunca bloqueia thread principal     |
| Timeouts HTTP                      | Nenhum configurado no CSA (Java padrão: infinito)                    |
| Retry                              | Nenhum — falha é apenas logada                                       |
| Autenticação                       | Nenhuma nativa — token no path como mitigação                        |
| TLS                                | CSA não exige HTTPS — WireGuard provê criptografia da camada de rede |

**Veredito**: Modo A (relay interno) é compatível e recomendado.

## Modo A — Relay interno (recomendado)

### Arquitetura

```
Servidor Minecraft (CSA 1.13.2)
    │
    │ POST JSON (rede WireGuard, HTTP)
    ▼
VPS do Proxy (Nginx:80 → bot-api:3080)
    │
    │ 1. CIDR allowlist (só IP do Minecraft na WireGuard)
    │ 2. Token no path (/v1/integrations/csa/:sourceToken)
    │ 3. Validação Zod do payload
    │ 4. Parse do marcador PC_CSA_V1
    │ 5. Dedup (Redis SETNX, janela 90s)
    │ 6. Persistência (PostgreSQL)
    │ 7. Enfileiramento (BullMQ → Redis)
    │
    ▼
worker → Discord (REST API)
```

### Configuração no servidor Minecraft

1. **Copie os arquivos de exemplo** do diretório `deploy/csa/`:

   ```bash
   cp deploy/csa/server.json.example config/cobblemon-spawn-alerts/server.json
   cp deploy/csa/webhooks.json.example config/cobblemon-spawn-alerts/webhooks.json
   ```

2. **Edite `server.json`** (campos relevantes):

   ```json
   {
     "sendWebhook": true,
     "alertShinies": true,
     "alertLegendaries": true,
     "alertMythicals": true,
     "alertUltraBeasts": true,
     "alertParadox": true,
     "alertStarters": false,
     "bucketsToAlert": ["ULTRA_RARE"]
   }
   ```

3. **Edite `webhooks.json`** — substitua a URL:

   ```json
   {
     "webhookURL": "http://<IP_WIREGUARD_DO_PROXY>/v1/integrations/csa/<CSA_SOURCE_TOKEN>",
     "webhookContent": { ... }
   }
   ```

   O template `webhookContent` já inclui o marcador `PC_CSA_V1` no campo `content`.
   O embed é usado como fallback visual caso o processamento do marcador falhe.

4. **Recarregue o CSA**:
   ```
   /cobblemonspawnalerts reload
   ```

### Configuração no proxy (.env)

```env
CSA_INTEGRATION_MODE=relay
CSA_SOURCE_TOKEN=<token com no mínimo 32 caracteres>
CSA_ALLOWED_CIDRS=<IP_WIREGUARD_DO_SERVIDOR>/32
CSA_BODY_LIMIT_BYTES=65536
CSA_DEDUP_WINDOW_SECONDS=90
CSA_STORE_SANITIZED_PAYLOAD_DAYS=14
CSA_EXPECTED_SOURCE_VERSION=1.13.2
```

### Marcador PC_CSA_V1

O campo `content` do webhook contém um marcador machine-readable que o relay processa:

```
PC_CSA_V1|dex={dex_unformatted}|lvl={level_unformatted}|x={x}|y={y}|z={z}|biome={biome_unformatted}|bucket={bucket_unformatted}|shiny={shiny_unformatted}|leg={legendary_unformatted}|myth={mythical_unformatted}|ub={ultrabeast_unformatted}|par={paradox_unformatted}|ha={hidden_ability_unformatted}|name={name}|player={nearest_player_unformatted}|ts={timestamp}
```

Placeholders desconhecidos são substituídos por `"N/A"` pelo CSA. O parser do relay
tolera campos faltantes e valores `N/A`.

## Modo B — Webhook Discord direto (fallback)

Se o Modo A não puder ser utilizado (ex.: WireGuard indisponível), configure o CSA
para enviar diretamente para um webhook do Discord:

1. Edite `webhooks.json`:
   ```json
   {
     "webhookURL": "https://discord.com/api/webhooks/<ID>/<TOKEN>"
   }
   ```

### Limitações do Modo B

- Professor Carvalho não consegue deduplicar alertas (o Discord recebe duplicatas do CSA)
- Sem persistência no PostgreSQL (sem histórico de spawns para consultas futuras)
- Sem enriquecimento (o embed é gerado pelo CSA, não pelo Professor Carvalho)
- Sem sanitização de payload (webhook URL do Discord fica exposta nos logs do CSA)

### Configuração no proxy

```env
CSA_INTEGRATION_MODE=direct
```

No modo `direct`, o bot não processa o endpoint de relay. Apenas o Discord recebe
os webhooks diretamente do CSA.

## Considerações de segurança

| Camada                 | Mecanismo                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| Rede                   | WireGuard — todo tráfego CSA → relay é criptografado na camada de rede                                   |
| Autenticação           | Token aleatório (mín. 32 chars) no path da URL, comparado com `safeTokenCompare` (timing-safe)           |
| Autorização de IP      | Nginx com `allow <CIDR_WIREGUARD>` e `deny all`; bot-api faz segunda verificação com `CSA_ALLOWED_CIDRS` |
| Rate limiting          | Fastify rate-limit no endpoint CSA (padrão: 60 req/min)                                                  |
| Validação de payload   | Zod schema com limites de tamanho (`content` ≤ 2000, `embeds` ≤ 10)                                      |
| Sanitização de payload | URLs de webhook Discord no campo `content` são redatadas antes de persistir                              |
| Limite de corpo        | 64 KB (`CSA_BODY_LIMIT_BYTES`)                                                                           |
| Proxy timeout          | Nginx: `client_body_timeout 10s`, `proxy_read_timeout 15s`, `proxy_connect_timeout 5s`                   |

## Procedimento de teste

1. **Ative `enableSpawnCommandAlerts` temporariamente** no `server.json`:
   ```json
   { "enableSpawnCommandAlerts": true }
   ```
2. Recarregue o CSA: `/cobblemonspawnalerts reload`
3. No servidor Minecraft, execute: `/pokespawn pikachu`
4. Verifique os logs do bot-api:
   ```bash
   docker compose -f deploy/compose.yaml logs bot-api | grep CSA
   ```
5. Verifique se o alerta apareceu no canal configurado (`DISCORD_SPAWN_ALERT_CHANNEL_ID`)
6. **Desative `enableSpawnCommandAlerts`** após o teste:
   ```json
   { "enableSpawnCommandAlerts": false }
   ```
7. Recarregue novamente

## Rollback

Para reverter para a configuração anterior:

```bash
# No servidor Minecraft
cp config/cobblemon-spawn-alerts/server.json.bak config/cobblemon-spawn-alerts/server.json
cp config/cobblemon-spawn-alerts/webhooks.json.bak config/cobblemon-spawn-alerts/webhooks.json
/cobblemonspawnalerts reload
```

Para desabilitar completamente o relay no proxy:

```env
CSA_INTEGRATION_MODE=disabled
```

O endpoint `/v1/integrations/csa/*` retornará 404 quando `disabled`.

## Troubleshooting

| Sintoma                       | Causa provável                                   | Ação                                                                |
| ----------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| CSA não envia webhooks        | `sendWebhook: false` no server.json              | Verifique `server.json` e recarregue                                |
| 401 no proxy                  | Token incorreto ou ausente                       | Confira `CSA_SOURCE_TOKEN` no `.env` e no `webhooks.json`           |
| 403 no proxy                  | IP do servidor fora do CIDR                      | Verifique `CSA_ALLOWED_CIDRS` e o bind do Nginx                     |
| 404 no proxy                  | `CSA_INTEGRATION_MODE` não é `relay`             | Confira `.env`                                                      |
| 415 no proxy                  | Content-Type não é `application/json`            | CSA sempre envia JSON; pode ser proxy intermediário                 |
| 400 no proxy                  | Payload não passa na validação Zod               | Verifique logs do bot-api; campos podem exceder limites             |
| Alerta duplicado no Discord   | Dedup não está funcionando                       | Verifique conectividade com Redis; janela de dedup pode estar curta |
| Alerta não aparece no Discord | `DISCORD_SPAWN_ALERT_CHANNEL_ID` não configurado | Confira `.env` e se o worker está rodando                           |
| CSA loga erro de timeout      | Proxy inacessível ou lento                       | Verifique WireGuard, Nginx, e se o bot-api está respondendo         |

## Risco conhecido: manutenção do CSA

O Cobblemon Spawn Alerts é mantido por terceiros (Stasis, the Shattered). Atualizações
do mod podem:

- Alterar o formato do webhook (quebrando o parser `PC_CSA_V1`\*)
- Alterar placeholders disponíveis
- Alterar o comportamento de threading/HTTP

\*O marcador `PC_CSA_V1` é robusto contra placeholders desconhecidos (CSA substitui por
`"N/A"`), mas uma mudança no formato base exigiria atualização do parser.

### Mitigação

- O `CSA_EXPECTED_SOURCE_VERSION` é registrado nos eventos para rastreabilidade
- O embed de fallback no `webhooks.json` garante que alguma notificação chegue ao Discord
- O Modo B (webhook direto) serve como contingência total

## Migração para o Gateway Fabric

O Modo A (relay via CSA) é uma solução de MVP. O plano futuro é substituí-lo pelo
**Gateway Fabric** (vide `docs/future-gateway-contract.md`), que oferece:

- **Autenticação criptográfica**: HMAC-SHA256 em vez de token no path
- **Replay protection**: `X-Professor-Event-Id` com nonce store
- **Tipos de evento expandidos**: spawn, captura, batalha, evolução, trade, etc.
- **Spool local**: resiliência quando o proxy está offline
- **Sem dependência de mod de terceiros**: controlado pela equipe BigBangCraft

A migração consistirá em:

1. Instalar o mod Fabric do Gateway no servidor Minecraft
2. Configurar o endpoint e secret compartilhado
3. Ativar `GATEWAY_INGRESS_ENABLED=true` no proxy
4. Desabilitar `CSA_INTEGRATION_MODE` (`disabled`)
5. Remover o CSA do servidor Minecraft
