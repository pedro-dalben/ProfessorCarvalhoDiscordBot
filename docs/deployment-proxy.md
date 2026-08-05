# Guia de Deploy e Proxy — Professor Carvalho

## Requisitos do VPS

| Recurso        | Mínimo           | Recomendado      |
| -------------- | ---------------- | ---------------- |
| CPU            | 2 vCPUs          | 4 vCPUs          |
| RAM            | 2 GB             | 4 GB             |
| Disco          | 20 GB SSD        | 40 GB SSD        |
| SO             | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS |
| Docker         | 27+              | 28+              |
| Docker Compose | 2.30+            | 2.32+            |
| WireGuard      | Kernel 5.4+      | Kernel 6.8+      |

### Portas

| Porta | Interface              | Serviço                             |
| ----- | ---------------------- | ----------------------------------- |
| 80    | WireGuard (IP privado) | Nginx — endpoint CSA                |
| 5432  | Nenhuma (interno)      | PostgreSQL — bridge Docker          |
| 6379  | Nenhuma (interno)      | Redis — bridge Docker               |
| 3080  | 127.0.0.1              | bot-api — mapeado para 3000 interno |

**Nenhuma porta é exposta publicamente.** PostgreSQL e Redis são acessíveis apenas
via rede interna do Docker Compose (`internal` bridge).

## Docker Compose — Produção

### Estrutura dos containers

```
┌─────────────────────────────────────────────────┐
│  Docker Compose (deploy/compose.yaml)            │
│                                                   │
│  ┌──────────┐  ┌────────┐  ┌────────┐  ┌──────┐ │
│  │ postgres │  │ redis  │  │bot-api │  │worker│ │
│  │  :5432   │  │ :6379  │  │ :3000  │  │  —   │ │
│  │  (int)   │  │ (int)  │  │→3080:lo│  │      │ │
│  └──────────┘  └────────┘  └────────┘  └──────┘ │
│         │            │          │          │     │
│         └────────────┴──────────┴──────────┘     │
│                       │                           │
│              network: internal (bridge)            │
└─────────────────────────────────────────────────┘
```

### Deploy inicial

```bash
# 1. Clone o repositório
git clone <repo-url> /opt/professor-carvalho
cd /opt/professor-carvalho

# 2. Configure o ambiente
cp .env.example .env
chmod 600 .env
vim .env  # preencha todas as variáveis

# 3. Gere o índice de autocomplete
pnpm install --frozen-lockfile
pnpm data:generate-pokemon-index

# 4. Construa as imagens
docker compose -f deploy/compose.yaml build

# 5. Inicie o banco e Redis primeiro
docker compose -f deploy/compose.yaml up -d postgres redis

# 6. Aguarde health checks
docker compose -f deploy/compose.yaml ps

# 7. Execute migrations
docker compose -f deploy/compose.yaml run --rm bot-api node apps/bot-api/dist/migrate.js

# 8. Inicie tudo
docker compose -f deploy/compose.yaml up -d

# 9. Verifique logs
docker compose -f deploy/compose.yaml logs -f
```

### Atualização

```bash
git pull
pnpm install --frozen-lockfile
docker compose -f deploy/compose.yaml build
docker compose -f deploy/compose.yaml up -d --remove-orphans
docker compose -f deploy/compose.yaml logs -f bot-api worker
```

## Segurança do arquivo de ambiente

### Proteção do .env

```bash
chmod 600 .env
chown root:root .env
```

### O que NÃO fazer

- **Nunca** commitar `.env` no repositório
- **Nunca** compartilhar `.env` por canais não criptografados (Discord, email)
- **Nunca** usar `docker compose config` em ambiente compartilhado (exibe variáveis)
- **Nunca** expor o endpoint `/metrics` publicamente sem `METRICS_BEARER_TOKEN`

### Variáveis redatadas em logs

As seguintes variáveis são automaticamente redatadas de qualquer log:

`DISCORD_TOKEN`, `DATABASE_URL`, `REDIS_URL`, `CSA_SOURCE_TOKEN`, `METRICS_BEARER_TOKEN`,
`DISCORD_WEBHOOK_URL`, `GATEWAY_SHARED_SECRET`

### Rotação de .env

Se houver suspeita de comprometimento:

```bash
# 1. Gere novos segredos
pnpm secrets:generate

# 2. Substitua os tokens no .env

# 3. Recrie os containers com o novo .env
docker compose -f deploy/compose.yaml up -d --force-recreate
```

## Configuração WireGuard

### No servidor Minecraft (peer)

```ini
[Interface]
PrivateKey = <chave-privada-minecraft>
Address = 10.100.0.2/24

[Peer]
PublicKey = <chave-publica-proxy>
Endpoint = <ip-publico-proxy>:51820
AllowedIPs = 10.100.0.1/32
PersistentKeepalive = 25
```

### No VPS do proxy (peer)

```ini
[Interface]
PrivateKey = <chave-privada-proxy>
Address = 10.100.0.1/24
ListenPort = 51820

[Peer]
PublicKey = <chave-publica-minecraft>
AllowedIPs = 10.100.0.2/32
```

### Verificação

```bash
# Em ambos os lados
sudo wg show

# Teste de conectividade (do servidor Minecraft)
ping 10.100.0.1

# Teste de conectividade (do proxy)
ping 10.100.0.2
```

**Toda comunicação CSA → relay usa apenas IPs da rede WireGuard (`10.100.0.x`).**

## Configuração Nginx

Copie o arquivo de exemplo:

```bash
sudo cp deploy/nginx/professor-carvalho.conf.example /etc/nginx/sites-available/professor-carvalho
sudo ln -s /etc/nginx/sites-available/professor-carvalho /etc/nginx/sites-enabled/
```

Edite o arquivo com os IPs corretos:

```nginx
server {
    listen <IP_WIREGUARD_DO_PROXY>:80;
    server_name _;

    deny all;

    location /v1/integrations/csa/ {
        allow <IP_WIREGUARD_DO_SERVIDOR>/32;
        deny all;

        client_max_body_size 64k;
        client_body_timeout 10s;
        proxy_read_timeout 15s;
        proxy_connect_timeout 5s;
        proxy_pass http://127.0.0.1:3080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        access_log off;
    }
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Timeouts do proxy

| Timeout                 | Valor | Motivo                                           |
| ----------------------- | ----- | ------------------------------------------------ |
| `client_body_timeout`   | 10s   | CSA não deve demorar para enviar corpo de 64 KB  |
| `proxy_read_timeout`    | 15s   | bot-api processa rápido (dedup + enfileiramento) |
| `proxy_connect_timeout` | 5s    | Se bot-api não responder em 5s, algo está errado |

## Migração do banco de dados

```bash
# Gerar migrations (se schema foi alterado)
pnpm db:generate

# Aplicar migrations
docker compose -f deploy/compose.yaml run --rm bot-api node apps/bot-api/dist/migrate.js

# Verificar schema (drift check)
pnpm db:check
```

### Snapshot inicial de dados

```bash
# Gerar o snapshot no host Minecraft
# (fora do escopo do bot — feito manualmente no servidor)

# Copiar para o VPS
scp bigmoncraft-spawns.json user@proxy:/opt/professor-carvalho/data/generated/

# Importar
pnpm data:import-cobblemon -- --source <dir> --output data/generated/bigmoncraft-spawns.json --force
```

## Registro de comandos

```bash
# Desenvolvimento (guild específica, instantâneo)
DISCORD_COMMAND_REGISTRATION_MODE=guild pnpm discord:register

# Produção (global, pode levar até 1h para propagar)
DISCORD_COMMAND_REGISTRATION_MODE=global pnpm discord:register
```

## Configuração CSA no servidor Minecraft

Consulte `deploy/csa/README.md` e `docs/csa-integration.md` para o procedimento completo.

Resumo:

1. Copie `deploy/csa/server.json.example` → `config/cobblemon-spawn-alerts/server.json`
2. Copie `deploy/csa/webhooks.json.example` → `config/cobblemon-spawn-alerts/webhooks.json`
3. Substitua a URL do webhook pelo endpoint do relay
4. Execute `/cobblemonspawnalerts reload` no servidor

## Monitoramento

### Health checks

```bash
# Liveness (container)
curl http://localhost:3080/health/live

# Readiness (dependências)
curl http://localhost:3080/health/ready
# Retorna: {"status":"ready","checks":{"database":"ok","redis":"ok"}} → 200
#          {"status":"not-ready","checks":{"database":"unavailable",...}} → 503
```

### Métricas Prometheus

```bash
# Se METRICS_ENABLED=true
curl -H "Authorization: Bearer <METRICS_BEARER_TOKEN>" http://localhost:3080/metrics
```

### Logs

```bash
# Todos os serviços
docker compose -f deploy/compose.yaml logs -f

# Apenas bot-api (últimas 100 linhas)
docker compose -f deploy/compose.yaml logs --tail 100 bot-api

# Apenas worker
docker compose -f deploy/compose.yaml logs worker
```

### Docker health checks

```bash
docker compose -f deploy/compose.yaml ps
# Todos devem exibir "healthy" na coluna STATUS
```

### Validação de integridade do snapshot

O snapshot é verificado automaticamente na inicialização. Para validação manual:

```bash
# A integridade é verificada via SHA-256 no carregamento
# Logs indicam:
# "Snapshot de spawns carregado." → sucesso
# "Falha ao carregar snapshot de spawns." → arquivo corrompido ou ausente
```
