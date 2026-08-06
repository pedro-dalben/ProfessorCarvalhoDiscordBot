# Runbook de Operações — Professor Carvalho

## Ciclo de vida dos serviços

### Iniciar

```bash
# Todos os serviços
docker compose -f deploy/compose.yaml up -d

# Apenas infraestrutura (para manutenção do banco)
docker compose -f deploy/compose.yaml up -d postgres redis

# Apenas aplicação (infra já rodando)
docker compose -f deploy/compose.yaml up -d bot-api worker
```

### Parar

```bash
# Todos os serviços (graceful, respeita SHUTDOWN_TIMEOUT_MS)
docker compose -f deploy/compose.yaml stop

# Parada imediata
docker compose -f deploy/compose.yaml kill

# Apenas um serviço
docker compose -f deploy/compose.yaml stop worker
```

### Reiniciar

```bash
# Reiniciar com nova imagem
docker compose -f deploy/compose.yaml up -d --force-recreate

# Reiniciar sem rebuild
docker compose -f deploy/compose.yaml restart bot-api worker

# Reiniciar apenas worker (safe — filas persistem no Redis)
docker compose -f deploy/compose.yaml restart worker
```

### Status

```bash
docker compose -f deploy/compose.yaml ps
```

Todos os containers devem exibir `healthy` na coluna STATUS.

## Health checks

### Liveness

```bash
curl -s http://localhost:3080/health/live
# Esperado: {"status":"ok"}

# Via Docker
docker compose -f deploy/compose.yaml exec bot-api node -e "fetch('http://localhost:3000/health/live').then(r=>r.json()).then(console.log)"
```

### Readiness

```bash
curl -s http://localhost:3080/health/ready | python3 -m json.tool
# Esperado:
# {
#   "status": "ready",
#   "checks": {
#     "database": "ok",
#     "redis": "ok"
#   }
# }

# Se 503: verifique postgres e redis
docker compose -f deploy/compose.yaml ps postgres redis
```

### Heartbeat do worker

O worker escreve heartbeat no Redis a cada 15s (TTL 60s). Se o worker parar,
o heartbeat expira em 60s.

```bash
# Verificar heartbeats ativos
docker compose -f deploy/compose.yaml exec redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning KEYS "professor-carvalho:heartbeat:worker:*"
```

## Visualização de logs

```bash
# Todos os serviços (tail)
docker compose -f deploy/compose.yaml logs -f

# Últimas 300 linhas de um serviço
docker compose -f deploy/compose.yaml logs --tail 300 bot-api

# Filtrar por palavra-chave
docker compose -f deploy/compose.yaml logs bot-api 2>&1 | grep -i "erro\|falha\|warn"

# Logs do Nginx (endpoint CSA)
sudo journalctl -u nginx -f

# Logs com timestamp
docker compose -f deploy/compose.yaml logs --timestamps bot-api

# Últimas 2 horas
docker compose -f deploy/compose.yaml logs --since 2h bot-api
```

### Níveis de log

```env
LOG_LEVEL=info   # Padrão produção
LOG_LEVEL=debug  # Para troubleshooting (verbose)
LOG_LEVEL=warn   # Apenas alertas e erros
```

Ajuste no `.env` e reinicie:

```bash
vim .env  # Altere LOG_LEVEL
docker compose -f deploy/compose.yaml restart bot-api worker
```

## Inspeção de filas BullMQ

### Status das filas

```bash
# Acessar Redis
docker compose -f deploy/compose.yaml exec redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning

# Listar chaves das filas
KEYS professor-carvalho:bull:*

# Contagem de jobs em cada fila
LLEN professor-carvalho:bull:spawn-alerts:wait
LLEN professor-carvalho:bull:spawn-delivery:wait
LLEN professor-carvalho:bull:maintenance:wait
```

### Filas ativas

| Fila                | Propósito                                | Workers               |
| ------------------- | ---------------------------------------- | --------------------- |
| `spawn-alerts`      | Processamento de eventos CSA             | 4 workers simultâneos |
| `spawn-delivery`    | Entrega de alertas no Discord            | 2 workers simultâneos |
| `maintenance`       | Limpeza de dados expirados               | Worker dedicado       |
| `usage-aggregation` | Agregação de uso de comandos (reservado) | —                     |

### Métricas das filas (via /metrics)

```
# Jobs waiting
professor_spawn_alerts_waiting_total
professor_spawn_delivery_waiting_total

# Jobs completed
professor_spawn_alerts_completed_total
professor_spawn_delivery_completed_total

# Jobs failed
professor_spawn_alerts_failed_total
professor_spawn_delivery_failed_total
```

## Tratamento de jobs com falha

### Jobs com dead letter

Jobs que falham após 5 tentativas (com backoff exponencial de 2s) permanecem
no Redis por 7 dias (`removeOnFail: { age: 7 * 86400 }`).

```bash
# Listar jobs falhos no Redis
docker compose -f deploy/compose.yaml exec redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning KEYS "professor-carvalho:bull:spawn-alerts:failed:*"

# Inspecionar um job falho específico
docker compose -f deploy/compose.yaml exec redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning HGETALL "professor-carvalho:bull:spawn-alerts:failed:<job-id>"
```

### Causas comuns de falha

| Erro                            | Causa                           | Ação                                                 |
| ------------------------------- | ------------------------------- | ---------------------------------------------------- |
| `DISCORD_TOKEN` não configurado | Worker não autentica            | Verifique `.env`                                     |
| Rate limit Discord (429)        | Muitos alertas em curto período | Aumente `DISCORD_EXPENSIVE_COMMAND_COOLDOWN_SECONDS` |
| Timeout de conexão PostgreSQL   | Banco sobrecarregado ou offline | Verifique `docker compose ps postgres`               |
| Erro de parsing CSA             | Payload malformado do CSA       | Verifique `webhooks.json` do servidor Minecraft      |

### Reenfileiramento manual

Se precisar reprocessar um job falho:

```bash
# Acessar o Redis
docker compose -f deploy/compose.yaml exec redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning

# Mover da fila de failed para waiting (exemplo)
RPOPLPUSH professor-carvalho:bull:spawn-alerts:failed professor-carvalho:bull:spawn-alerts:wait
```

## Backup do banco de dados

### Backup completo (pg_dump)

```bash
# Backup com timestamp
docker compose -f deploy/compose.yaml exec -T postgres pg_dump \
  -U professor_carvalho \
  -d professor_carvalho \
  --no-owner --no-acl \
  -F c \
  > /opt/backups/professor-carvalho-$(date +%Y%m%d-%H%M%S).dump

# Comprimir
gzip /opt/backups/professor-carvalho-*.dump
```

### Backup apenas de schema

```bash
docker compose -f deploy/compose.yaml exec -T postgres pg_dump \
  -U professor_carvalho \
  -d professor_carvalho \
  --schema-only --no-owner --no-acl \
  > /opt/backups/professor-carvalho-schema-$(date +%Y%m%d).sql
```

### Automação (cron diário)

```bash
# Adicionar ao crontab do root
# 0 3 * * * /opt/professor-carvalho/scripts/backup-db.sh

# Exemplo de script:
cat > /opt/professor-carvalho/scripts/backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

docker compose -f /opt/professor-carvalho/deploy/compose.yaml exec -T postgres \
  pg_dump -U professor_carvalho -d professor_carvalho \
  --no-owner --no-acl -F c \
  > "$BACKUP_DIR/professor-carvalho-$TIMESTAMP.dump"

gzip "$BACKUP_DIR/professor-carvalho-$TIMESTAMP.dump"

# Remover backups antigos (>30 dias)
find "$BACKUP_DIR" -name "professor-carvalho-*.dump.gz" -mtime +$RETENTION_DAYS -delete
EOF

chmod +x /opt/professor-carvalho/scripts/backup-db.sh
```

### Restauração

```bash
# Descompactar se necessário
gunzip /opt/backups/professor-carvalho-20260101-030000.dump.gz

# Restaurar
docker compose -f deploy/compose.yaml exec -T postgres pg_restore \
  -U professor_carvalho \
  -d professor_carvalho \
  --clean --if-exists --no-owner --no-acl \
  -1 \
  < /opt/backups/professor-carvalho-20260101-030000.dump
```

**A flag `--clean` remove e recria todas as tabelas.** Use com cautela.

### Restauração apenas de dados específicos

```bash
# Restaurar apenas tabelas de eventos
docker compose -f deploy/compose.yaml exec -T postgres pg_restore \
  -U professor_carvalho \
  -d professor_carvalho \
  --data-only \
  -t spawn_events \
  -t integration_events \
  < /opt/backups/professor-carvalho-20260101-030000.dump
```

## Troubleshooting do Redis

### Teste de conectividade

```bash
docker compose -f deploy/compose.yaml exec redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning PING
# Esperado: PONG
```

### Uso de memória

```bash
docker compose -f deploy/compose.yaml exec redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning INFO memory | grep used_memory_human
# Esperado: abaixo de 128 MB (maxmemory configurado)
```

### Limpeza de cache (flush seletivo)

```bash
# Limpar cache Pokémon (prefixo: professor-carvalho:pkm-v1:)
docker compose -f deploy/compose.yaml exec redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning \
  EVAL "for i,k in ipairs(redis.call('keys', 'professor-carvalho:pkm-v1:*')) do redis.call('del', k) end" 0

# Limpar dedup keys
docker compose -f deploy/compose.yaml exec redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning \
  EVAL "for i,k in ipairs(redis.call('keys', 'professor-carvalho:dedup:*')) do redis.call('del', k) end" 0

# ATENÇÃO: flush completo
# docker compose exec redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning FLUSHDB
```

### Redis não inicia

```bash
# Verificar logs
docker compose -f deploy/compose.yaml logs redis

# Verificar permissões do volume
ls -la /var/lib/docker/volumes/professorcarvalho_redisdata/_data/

# Reiniciar Redis
docker compose -f deploy/compose.yaml restart redis
```

## Reconexão do Discord

### Bot desconectado

```bash
# Verificar status da conexão
curl -s http://localhost:3080/metrics | grep professor_discord_ready

# Se 0: bot não está conectado. Reinicie:
docker compose -f deploy/compose.yaml restart bot-api

# Verificar logs
docker compose -f deploy/compose.yaml logs bot-api | grep -i "discord\|login\|ready"
```

### Erros comuns de conexão

| Sintoma                 | Causa                                       | Solução                                             |
| ----------------------- | ------------------------------------------- | --------------------------------------------------- |
| `DisallowedIntents`     | Intents privilegiadas habilitadas no portal | Desative todas no Developer Portal                  |
| `Invalid Token`         | Token expirado ou inválido                  | Gere novo token no Developer Portal                 |
| `429 Too Many Requests` | Rate limit da gateway Discord               | Aguarde; a gateway Discord gerencia automaticamente |
| `ECONNRESET`            | Rede instável                               | O bot reconecta automaticamente                     |

## Comportamento durante outage da PokéAPI

Quando a PokéAPI está indisponível:

1. **Comando `/dex`**:
   - Se houver cache stale → retorna dados stale (podem estar desatualizados)
   - Se não houver cache → responde com erro "fonte externa indisponível"

2. **Comando `/fraquezas`**:
   - Mesmo comportamento (cache de tipos tem TTL de 7 dias)

3. **Autocomplete**:
   - Continua funcionando (índice carregado em memória)

4. **Alertas CSA**:
   - Não são afetados (não dependem da PokéAPI)

5. **Métricas**:
   - `pokemon_cache_hit_total{stale}` aumenta
   - `pokemon_cache_miss_total{any}` aumenta

**Nenhuma ação manual é necessária.** O sistema se recupera automaticamente
quando a PokéAPI volta.

### Forçar refresh de cache

Se a PokéAPI ficou offline prolongadamente e voltou com dados novos:

```bash
# Limpar todo o cache Pokémon (próximas consultas vão refazer fetch)
docker compose -f deploy/compose.yaml exec redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning \
  EVAL "for i,k in ipairs(redis.call('keys', 'professor-carvalho:pkm-v1:*')) do redis.call('del', k) end" 0
```

## Atualização de snapshot de spawns

O snapshot (`bigmoncraft-spawns.json`) é gerado **manualmente** no host do servidor
Minecraft e transferido para o VPS do proxy.

### Geração (no host Minecraft)

```bash
# Fora do escopo do bot — use ferramenta de extração do Cobblemon
# Exemplo: extrai dados de spawn_pool_world/ para JSON
```

### Transferência e importação

```bash
# 1. Copiar snapshot para o VPS
scp bigmoncraft-spawns.json user@proxy:/opt/professor-carvalho/data/generated/

# 2. Verificar integridade
sha256sum /opt/professor-carvalho/data/generated/bigmoncraft-spawns.json

# 3. Importar
docker compose -f deploy/compose.yaml exec bot-api \
  node apps/bot-api/dist/import-cobblemon.js \
  --source /app/data/generated/bigmoncraft-spawns.json \
  --force

# 4. Reiniciar bot-api para recarregar snapshot
docker compose -f deploy/compose.yaml restart bot-api

# 5. Verificar
docker compose -f deploy/compose.yaml logs bot-api | grep -i "snapshot"
```

### Snapshot ausente

Se `COBBLEMON_SNAPSHOT_REQUIRED=false` (padrão), o bot inicia sem snapshot.
Nesse caso, o comando `/spawn` retorna "snapshot de spawns não disponível".

## Teste de alerta CSA

```bash
# 0. Diagnóstico e fixture (sem o servidor Minecraft)
pnpm integrations:csa:doctor
pnpm integrations:csa:test-fixture -- --fixture shiny

# 1. Ativar spawn por comando temporariamente no server.json do Minecraft
#    "enableSpawnCommandAlerts": true

# 2. Recarregar CSA no servidor (comando confirmado no JAR 1.13.2)
# /csa-common reload

# 3. Disparar spawn no servidor Minecraft
# /pokespawn pikachu

# 4. Verificar logs do bot-api
docker compose -f deploy/compose.yaml logs bot-api --tail 20 | grep -i csa

# 5. Verificar se o alerta chegou ao Discord (canal configurado)

# 6. Desativar spawn por comando
#    "enableSpawnCommandAlerts": false
# /csa-common reload
```

## Rollback

### Rollback de deploy

```bash
# 1. Voltar para tag/commit anterior
git checkout <tag-ou-commit-anterior>

# 2. Reconstruir e redeploy
docker compose -f deploy/compose.yaml build
docker compose -f deploy/compose.yaml up -d --force-recreate

# 3. Verificar
docker compose -f deploy/compose.yaml logs bot-api | grep "pronto"
```

### Rollback de banco de dados

```bash
# Restaurar backup anterior
docker compose -f deploy/compose.yaml exec -T postgres pg_restore \
  -U professor_carvalho \
  -d professor_carvalho \
  --clean --if-exists --no-owner --no-acl \
  -1 \
  < /opt/backups/professor-carvalho-$(date -d '1 day ago' +%Y%m%d)*.dump
```

### Rollback de configuração CSA

```bash
# No servidor Minecraft
cp config/cobblemon-spawn-alerts/server.json.bak config/cobblemon-spawn-alerts/server.json
cp config/cobblemon-spawn-alerts/webhooks.json.bak config/cobblemon-spawn-alerts/webhooks.json
# /csa-common reload   (comando confirmado no JAR 1.13.2)
```

## Rotação de segredos

### Token do Discord

```bash
# 1. Regere no Developer Portal (Bot → Reset Token)
# 2. Atualizar .env
vim /opt/professor-carvalho/.env  # DISCORD_TOKEN=<novo>

# 3. Reiniciar
docker compose -f deploy/compose.yaml restart bot-api worker

# 4. Verificar
docker compose -f deploy/compose.yaml logs bot-api | grep "pronto"
```

### Senhas do PostgreSQL e Redis

```bash
# 1. Atualizar .env (POSTGRES_PASSWORD, REDIS_PASSWORD, DATABASE_URL, REDIS_URL)
vim /opt/professor-carvalho/.env

# 2. Remover volumes antigos (DADOS SERÃO PERDIDOS se não houver backup)
docker compose -f deploy/compose.yaml down -v

# 3. Recriar
docker compose -f deploy/compose.yaml up -d postgres redis
docker compose -f deploy/compose.yaml run --rm bot-api node apps/bot-api/dist/migrate.js
docker compose -f deploy/compose.yaml up -d
```

### Token CSA

```bash
# 1. Gerar novo token
pnpm secrets:generate

# 2. Atualizar .env (CSA_SOURCE_TOKEN)
vim /opt/professor-carvalho/.env

# 3. Atualizar webhooks.json no servidor Minecraft
# URL: http://<IP>/v1/integrations/csa/<NOVO_TOKEN>

# 4. Recarregar CSA (comando confirmado no JAR 1.13.2)
# /csa-common reload

# 5. Atualizar o hash da fonte (idempotente) e reiniciar o bot-api
pnpm integrations:csa:setup
docker compose -f deploy/compose.yaml restart bot-api
```

> Nota: o `integrations:csa:setup` roda repetidamente sem efeitos colaterais
> (atualiza `token_hash`, `expected_version` e metadados).
