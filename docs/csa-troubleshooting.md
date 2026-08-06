# Troubleshooting — Integração CSA 1.13.2

## Diagnóstico rápido

```bash
pnpm integrations:csa:doctor
pnpm integrations:csa:test-fixture -- --fixture shiny
curl --fail http://127.0.0.1:3080/health/ready
```

## Tabela de sintomas

| Sintoma                                 | Causa provável                                | Ação                                                                                                |
| --------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Nenhum alerta no Discord                | `sendWebhook: false`                          | `server.json` → `true`; `/csa-common reload`                                                        |
| 401 no relay                            | Token errado/ausente                          | Conferir `CSA_SOURCE_TOKEN` (`.env` e `webhooks.json`); `pnpm integrations:csa:setup`               |
| 403 no relay                            | IP fora do CIDR                               | `CSA_ALLOWED_CIDRS`; Nginx `allow/deny`; WireGuard                                                  |
| 400 no relay                            | Marcador ausente/ilegível                     | `webhookContent.content` deve conter o template PC_CSA_V1 do 1.13.2; conferir valores desconhecidos |
| 415 no relay                            | Content-Type errado                           | CSA sempre envia JSON; suspeitar de proxy intermediário                                             |
| 503 no relay                            | PostgreSQL indisponível                       | `health/ready`; logs do bot-api; volume `pgdata`                                                    |
| Alerta duplicado                        | Redis fora do ar (fail-open)                  | `redis-cli ping`; métrica `professor_csa_event_duplicate_total`                                     |
| Alerta perdido sem erro                 | Falha de dedup silenciosa                     | Janela curta? Coordenadas idênticas em spawns diferentes dentro da janela                           |
| Job `process-csa-alert` falha           | `normalized_payload` ausente (evento antigo)  | Reenfileirar ou aceitar perda; conferir `integration_events.status`                                 |
| Job `deliver-discord-spawn-alert` falha | Discord indisponível / token inválido         | BullMQ re-tenta (5×, backoff); conferir `DISCORD_TOKEN`; `spawn_events.last_delivery_error`         |
| Mensagem duplicada após retry           | Timeout incerto do Discord (limite conhecido) | Documentado: efetivamente-uma-vez sob retries normais                                               |
| Coordenadas no embed público            | Política errada                               | `SPAWN_COORDINATE_POLICY` deve ser `hidden` ou `region`; nunca `exact_admin_only` sem canal privado |
| `@everyone` mencionado                  | Config errada                                 | Menções vêm apenas de `DISCORD_SHINY_ALERT_ROLE_ID`/`DISCORD_LEGENDARY_ALERT_ROLE_ID`; `parse: []`  |
| `/csa-common reload` falha              | JSON inválido em config                       | Validar JSON; restaurar backup com timestamp; recarregar                                            |
| Sem permissão no comando                | Nível < 3 (in-game)                           | Usar console do servidor                                                                            |
| `Common configs reload failed.`         | Arquivo corrompido                            | `docs/csa-production-installation.md` §10 (rollback)                                                |

## Comandos úteis

```bash
# Logs
docker compose -f deploy/compose.yaml logs -f bot-api
docker compose -f deploy/compose.yaml logs -f worker

# Filas (contadores)
curl -s http://127.0.0.1:3080/metrics | grep -E "^professor_(csa|spawn|queue)"

# Banco
docker compose -f deploy/compose.yaml exec postgres psql -U professor_carvalho \
  -c "SELECT status, count(*) FROM integration_events GROUP BY status;" \
  -c "SELECT id, species, level, shiny, delivery_status, last_delivery_error FROM spawn_events ORDER BY created_at DESC LIMIT 10;"

# Redis (chaves de dedup e heartbeat)
redis-cli -a "$REDIS_PASSWORD" --no-auth-warning KEYS 'professor-carvalho:dedup:*'
redis-cli -a "$REDIS_PASSWORD" --no-auth-warning KEYS 'professor-carvalho:heartbeat:worker:*'
```

## Falha de infraestrutura

| Componente fora do ar | Impacto                                                        | Recuperação                                           |
| --------------------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| Proxy (bot-api)       | CSA loga erro HTTP; alerta perdido; broadcast in-game continua | `docker compose up -d`; alerta seguinte volta a fluir |
| Nginx                 | Idem (CSA vê falha de conexão)                                 | `nginx -t && systemctl reload nginx`                  |
| Redis                 | Dedup fail-open: duplicatas temporárias                        | Redis volta; dedup retoma                             |
| PostgreSQL            | 503 no ingress; CSA loga status não-2xx                        | Postgres volta; sem fila pendente                     |
| Discord               | Evento persiste; BullMQ re-tenta                               | Mensagens atrasadas chegam quando Discord volta       |

## Limitações documentadas

- CSA sem retry: alerta perdido se o relay estiver indisponível no momento do spawn.
- Exatamente-uma-vez não é garantível com REST do Discord (caso de timeout incerto).
- `rarity` do marcador é valor único (lendário+mítico simultâneos aparecem como "Legendary").
- UUID do Pokémon não está disponível para o webhook (dedup é por fingerprint).
