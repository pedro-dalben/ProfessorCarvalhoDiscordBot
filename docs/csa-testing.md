# Testes da integração CSA 1.13.2

## 1. Testes automatizados (dev/CI)

```bash
pnpm test:unit          # testes unitários (marcador, payload, dedup, allowlist, embeds)
pnpm test:integration   # e2e com PostgreSQL + Redis reais (Testcontainers)
pnpm test:coverage      # cobertura dos pacotes centrais (csa-integration, domain)
```

O teste e2e cobre o fluxo:

```text
fixture CSA 1.13.2 → Fastify ingress → token → CIDR → PC_CSA_V1 →
normalização → dedup atômico → integration_events → worker →
spawn_events → adaptador Discord (mockado)
```

Asserções principais: espécie/nível/bioma reais no payload do Discord; shiny e
legendary corretos; coordenadas e jogador ausentes por padrão; menções seguras;
entrada duplicada gera uma única entrega; nenhum valor de demonstração
(`Pokémon detectado`, `level 50`, `Savanna` como placeholder).

## 2. Fixtures sanitizadas

`packages/csa-integration/fixtures/1.13.2/`:

| Fixture                        | Cenário                                     |
| ------------------------------ | ------------------------------------------- |
| `rare-spawn.json`              | Gyarados Ultra Rare comum                   |
| `shiny-spawn.json`             | shiny                                       |
| `legendary-spawn.json`         | lendário                                    |
| `mythical-spawn.json`          | mítico                                      |
| `ultra-beast-spawn.json`       | Ultra Beast                                 |
| `paradox-spawn.json`           | Paradox                                     |
| `shiny-legendary-spawn.json`   | shiny + lendário                            |
| `missing-optional-fields.json` | campos opcionais ausentes                   |
| `unknown-placeholders.json`    | valores desconhecidos (deve falhar com 400) |
| `malformed-payload.json`       | payload inválido (deve falhar com 400)      |

Sem nomes/coordenadas/tokens/URLs reais.

## 3. Envio de fixture sem o servidor Minecraft

```bash
pnpm integrations:csa:test-fixture -- --fixture shiny      # localhost:3080
pnpm integrations:csa:test-fixture -- --fixture legendary
pnpm integrations:csa:test-fixture -- --fixture rare
pnpm integrations:csa:test-fixture -- --fixture shiny --url http://127.0.0.1:3080
# Produção exige autorização explícita:
pnpm integrations:csa:test-fixture -- --fixture shiny --allow-production
```

Comportamento: recusa URLs de produção sem `--allow-production`; token mascarado
na saída; imprime status HTTP e request ID; não exige o servidor Minecraft.

## 4. Guia de teste controlado no servidor (manual, com autorização)

> Nunca automatizar. Use um Pokémon comum (Pikachu). Não teste com lendários.

1. **Backup** dos arquivos CSA:
   ```bash
   cd config/cobblemon-spawn-alerts
   cp server.json "server.json.bak.$(date +%Y%m%d-%H%M%S)"
   cp webhooks.json "webhooks.json.bak.$(date +%Y%m%d-%H%M%S)"
   ```
2. **Proxy saudável**: `curl --fail http://127.0.0.1:3080/health/ready` → 200.
3. **Worker saudável**: `pnpm integrations:csa:doctor` (heartbeat recente, filas OK).
4. **WireGuard OK**: no servidor Minecraft, `curl -s -o /dev/null -w "%{http_code}" http://<IP_WIREGUARD_DO_PROXY>/health/live` → 200.
5. **Habilite alertas de spawn-command temporariamente** em `server.json`:
   ```json
   "enableSpawnCommandAlerts": true
   ```
6. **Reload**: `/csa-common reload` (console do servidor) → `[CSA] Common configs reloaded!`
7. **Spawn de teste**: `/pokespawn pikachu`
   > O comportamento do `/pokespawn` depende das permissões do Cobblemon e da
   > opção `enableSpawnCommandAlerts`; se o comando não existir, consulte a
   > permissão do mod no servidor.
8. **Log do CSA**: procurar erro de webhook ou sucesso silencioso.
9. **Log do proxy**: `docker compose -f deploy/compose.yaml logs bot-api | grep CSA` — evento recebido, `204`.
10. **BullMQ**: `pnpm integrations:csa:doctor` — filas com contadores coerentes; ou `/metrics`.
11. **PostgreSQL**:
    ```sql
    SELECT status, count(*) FROM integration_events GROUP BY status;
    SELECT species, dex_number, level, shiny, biome, delivery_status FROM spawn_events;
    ```
12. **Discord**: alerta no canal público com **Pikachu** (nome real), nível real, sem coordenadas.
13. **Conferir campos**: Pokémon, número da Pokédex, nível, raridade, bioma correspondem ao spawn.
14. **Desative** `enableSpawnCommandAlerts` (volta para `false`).
15. **Reload**: `/csa-common reload`.
16. **Falhou?** Restaure os backups (passo 1) e recarregue.

## 5. Critérios de aceite do teste controlado

- [ ] 204 (ou 200) no relay para o evento real do JAR.
- [ ] `integration_events` com status `processed`.
- [ ] `spawn_events` com os dados do Pikachu (espécie, nível, bioma).
- [ ] Mensagem no Discord com dados reais; sem coordenadas; sem jogador.
- [ ] Menções corretas (nenhuma para Pikachu comum).
- [ ] Nenhum valor de demonstração no payload.
