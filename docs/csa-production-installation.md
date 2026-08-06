# Instalação de produção — Integração CSA 1.13.2 (Professor Carvalho)

Guia manual passo a passo. **Nenhum passo deste documento deve ser automatizado
sem autorização explícita.** Use placeholders (`<...>`) para endereços e segredos.

## Visão geral

```text
Servidor Minecraft (BigMonCraft)          VPS do Proxy
┌─────────────────────────────┐           ┌──────────────────────────────┐
│ CSA 1.13.2                  │  WireGuard │ Nginx (WireGuard IP)          │
│ config/cobblemon-spawn-alerts│──────────→│  → 127.0.0.1:3080 (bot-api)   │
│ webhooks.json (token)       │  HTTP POST │  → PostgreSQL + Redis (Docker)│
└─────────────────────────────┘           │  → Worker → Discord            │
                                          └──────────────────────────────┘
```

## 1. Pré-requisitos

- Acesso SSH ao VPS do proxy e ao servidor Minecraft.
- WireGuard funcionando entre os dois hosts.
- Docker + Docker Compose no VPS.
- Token gerado: `pnpm secrets:generate` (campo `CSA_SOURCE_TOKEN`).

## 2. Proxy VPS — `.env`

```env
CSA_INTEGRATION_MODE=relay
CSA_SOURCE_TOKEN=<TOKEN_32+_CARACTERES>
CSA_ALLOWED_CIDRS=<IP_WIREGUARD_DO_SERVIDOR>/32
CSA_EXPECTED_SOURCE_VERSION=1.13.2
CSA_BODY_LIMIT_BYTES=65536
CSA_DEDUP_WINDOW_SECONDS=90
CSA_DEDUP_FAIL_OPEN=true
CSA_RATE_LIMIT_MAX=60
CSA_RATE_LIMIT_WINDOW_SECONDS=60
DISCORD_TOKEN=<TOKEN_DO_BOT>
DISCORD_SPAWN_ALERT_CHANNEL_ID=<ID_CANAL_PUBLICO>
DISCORD_SHINY_ALERT_ROLE_ID=<ID_ROLE_SHINY>
DISCORD_LEGENDARY_ALERT_ROLE_ID=<ID_ROLE_LENDARIO>
SPAWN_COORDINATE_POLICY=hidden
SPAWN_SHOW_NEAREST_PLAYER=false
POSTGRES_PASSWORD=<SENHA_POSTGRES>
REDIS_PASSWORD=<SENHA_REDIS>
```

Permissões: `chmod 600 .env`. O token **não** vai para o PostgreSQL (apenas hash SHA-256).

## 3. PostgreSQL — fonte de integração

```bash
docker compose --project-directory . -f deploy/compose.yaml up -d postgres redis
docker compose -f deploy/compose.yaml exec bot-api node packages/database/dist/migrate.js
pnpm integrations:csa:setup
```

Saída esperada (sem segredos): `sourceId`, `sourceKey`, `integrationType: csa`,
`versão esperada: 1.13.2`, `habilitada: sim`, `tokenHash: armazenado (sha256)`.

## 4. Nginx (VPS)

Copie `deploy/nginx/professor-carvalho.conf.example` e substitua:

- `WIREGUARD_PROXY_IP` → IP WireGuard do proxy (ex.: `10.66.0.1`);
- `MINECRAFT_WIREGUARD_CIDR` → CIDR do servidor (ex.: `10.66.0.2/32`).

```bash
sudo cp deploy/nginx/professor-carvalho.conf.example /etc/nginx/sites-available/professor-carvalho
sudo ln -s /etc/nginx/sites-available/professor-carvalho /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Valide sem expor o token no histórico do shell:

```bash
# URL em variável protegida ou arquivo temporário com permissão 600
URL=$(cat /tmp/csa-url.txt)   # contém a URL completa tokenizada
curl --fail -sS -X POST -H "Content-Type: application/json" \
  --data @packages/csa-integration/fixtures/1.13.2/rare-spawn.json "$URL"
```

Esperado: `204` (ou `200`).

## 5. WireGuard

- O servidor Minecraft alcança `<IP_WIREGUARD_DO_PROXY>:80`.
- O proxy aceita apenas o IP/CIDR do servidor no `location /v1/integrations/csa/`.
- Nenhum serviço do Docker é publicado na interface pública (compose publica
  apenas `127.0.0.1:3080`).

## 6. Docker (compose)

```bash
docker compose --project-directory . -f deploy/compose.yaml up -d --build
curl --fail http://127.0.0.1:3080/health/live
curl --fail http://127.0.0.1:3080/health/ready
```

## 7. Minecraft — configuração do CSA

Diretório real (confirmado no JAR): `config/cobblemon-spawn-alerts/`.

```bash
cd /home/brainiac/bigbangcraft/bigmoncraft
sha256sum mods/cobblemon_spawn_alerts-fabric-1.13.2.jar   # conferir com docs/csa-audit.md
cd config/cobblemon-spawn-alerts
cp server.json "server.json.bak.$(date +%Y%m%d-%H%M%S)"
cp webhooks.json "webhooks.json.bak.$(date +%Y%m%d-%H%M%S)"
cp /caminho/do/repo/deploy/csa/1.13.2/server.json.example server.json
cp /caminho/do/repo/deploy/csa/1.13.2/webhooks.relay.json.example webhooks.json
```

Edite `webhooks.json`:

```json
"webhookURL": "http://<IP_WIREGUARD_DO_PROXY>/v1/integrations/csa/<CSA_SOURCE_TOKEN>"
```

Permissões:

```bash
chmod 600 webhooks.json
```

## 8. Reload

```text
/csa-common reload
```

- Console: sempre permitido. In-game: nível 3.
- Sucesso: `[CSA] Common configs reloaded!`
- Falha: `[CSA] Common configs reload failed.` — restaure o backup e recarregue.

## 9. Validação

1. `pnpm integrations:csa:doctor` (no VPS) — tudo OK/AVISO aceitável.
2. `pnpm integrations:csa:test-fixture -- --fixture shiny` — 204.
3. Teste controlado no servidor (Pikachu) — `docs/csa-testing.md`.
4. Conferir: `integration_events` processado, `spawn_events` criado, mensagem no Discord.

## 10. Rollback

```bash
cp config/cobblemon-spawn-alerts/server.json.bak.<ts> config/cobblemon-spawn-alerts/server.json
cp config/cobblemon-spawn-alerts/webhooks.json.bak.<ts> config/cobblemon-spawn-alerts/webhooks.json
/csa-common reload
```

No proxy: `CSA_INTEGRATION_MODE=disabled` + `docker compose up -d bot-api`.

## Checklist de segurança

- [ ] `sha256sum` do JAR de produção confere com `docs/csa-audit.md`.
- [ ] Token com ≥ 32 caracteres; nunca em commit; só em `.env` (600) e `webhooks.json` (600).
- [ ] Nginx: bind apenas no IP WireGuard; CIDR do servidor; `access_log off` na rota.
- [ ] PostgreSQL/Redis não expostos publicamente.
- [ ] `SPAWN_COORDINATE_POLICY=hidden` e `SPAWN_SHOW_NEAREST_PLAYER=false`.
- [ ] Métricas/health apenas localhost (além do bearer token do /metrics).
- [ ] `pnpm integrations:csa:doctor` sem segredos na saída.
