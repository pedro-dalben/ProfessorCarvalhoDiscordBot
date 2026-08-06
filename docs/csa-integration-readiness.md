# Prontidão da integração CSA (1.13.2) — Classificação por componente

Data: 2026-08-05 · Branch: `fix/csa-1.13.2-integration`

Classificação: **IMPLEMENTED** · **PARTIAL** · **BROKEN** · **MISSING** · **NOT_VALIDATED**

## Arquitetura alvo

```text
Cobblemon
    ↓ (POKEMON_ENTITY_SPAWN)
Cobblemon Spawn Alerts 1.13.2
    ↓ POST application/json (WireGuard)
Nginx no proxy VPS
    ↓ POST /v1/integrations/csa/:sourceToken
Fastify (validação)
    ↓
PostgreSQL (integration_event + spawn_event)
    ↓
BullMQ (spawn-alerts → spawn-delivery)
    ↓
Worker
    ↓
Discord (canal público / privado)
```

## Classificação por componente

| #   | Componente                                    | Status                     | Evidência / Observação                                                                                                                                    |
| --- | --------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | CSA 1.13.2 (JAR)                              | **IMPLEMENTED**            | JAR auditado via bytecode (ver `docs/csa-audit.md`). SHA-256 confirmado na cópia local; produção pendente de conferência.                                 |
| 2   | WireGuard (MC → proxy)                        | **NOT_VALIDATED**          | Fora deste repositório; instruções em `docs/csa-production-installation.md`.                                                                              |
| 3   | Nginx no proxy                                | **IMPLEMENTED** (template) | `deploy/nginx/professor-carvalho.conf.example` atualizado (CIDR, 64k, timeouts, sem access log). Aplicação real pendente.                                 |
| 4   | Rota `POST /v1/integrations/csa/:sourceToken` | **IMPLEMENTED**            | `apps/bot-api/src/api/routes/csa.ts`: token (comparação constante), CIDR, Content-Type, Zod, marcador obrigatório, 204.                                   |
| 5   | Fastify (proxy trust)                         | **IMPLEMENTED**            | `trustProxy` restrito a `TRUSTED_PROXY_ADDRESSES` (loopback/CIDR explícitos) — nunca `true`.                                                              |
| 6   | Schema CSA (payload)                          | **IMPLEMENTED**            | `packages/csa-integration/src/payload.ts` com o shape Jackson do JAR (`avatar_url`, `image:{url}`, etc.).                                                 |
| 7   | Marcador PC_CSA_V1                            | **IMPLEMENTED**            | `marker.ts` com semântica exata do JAR (strings booleanas, rarity única, timestamp em ms).                                                                |
| 8   | Normalização antes do dedup                   | **IMPLEMENTED**            | `normalize.ts` (marker → evento) antes de `dedup.acquire()`.                                                                                              |
| 9   | Dedup atômico                                 | **IMPLEMENTED**            | `SpawnDedupService.acquire()` — SET NX + TTL; fingerprint com coordenadas arredondadas; política fail-open documentada e testada.                         |
| 10  | Integration source (ciclo de vida)            | **IMPLEMENTED**            | `ensureIntegrationSource` idempotente (ON CONFLICT DO NOTHING), tipo `csa`, versão esperada, hash do token, `last_seen_at`, rejeição quando desabilitado. |
| 11  | `integration_events` (estados)                | **IMPLEMENTED**            | `received` → `processing` → `processed` / `failed` (falha definitiva só após retries).                                                                    |
| 12  | `spawn_events` (normalizado)                  | **IMPLEMENTED**            | Colunas completas + unique em `integration_event_id` (migração `0001_csa_delivery`).                                                                      |
| 13  | BullMQ filas                                  | **IMPLEMENTED**            | `spawn-alerts` (3 attempts) → `spawn-delivery` (5 attempts, backoff exponencial).                                                                         |
| 14  | Worker (persistência)                         | **IMPLEMENTED**            | `apps/worker/src/handlers.ts` — carrega `normalized_payload` do banco; idempotente.                                                                       |
| 15  | Entrega Discord com dados reais               | **IMPLEMENTED**            | Embed construído do `spawn_events`; sem placeholders de demonstração.                                                                                     |
| 16  | Idempotência de entrega                       | **IMPLEMENTED**            | Claim atômico (`delivery_status`), `discord_message_id`, `delivered_at`, `delivery_attempts`, `last_delivery_error`.                                      |
| 17  | Privacidade de coordenadas                    | **IMPLEMENTED**            | `hidden` (padrão) / `region` / `exact_admin_only` (canal privado). Jogador mais próximo oculto por padrão.                                                |
| 18  | Menções de roles                              | **IMPLEMENTED**            | Shiny → role shiny; lendário/mítico/UB/paradox → role lendária; `parse: []`; allowlist de IDs.                                                            |
| 19  | Rate limits                                   | **IMPLEMENTED**            | Global + específico da rota CSA.                                                                                                                          |
| 20  | Métricas CSA                                  | **IMPLEMENTED**            | `professor_csa_*` completas (recebidos, rejeitados, duplicados, parse, fila, último evento).                                                              |
| 21  | Comando setup                                 | **IMPLEMENTED**            | `pnpm integrations:csa:setup` (idempotente, recusa token fraco, sem segredos).                                                                            |
| 22  | Comando doctor                                | **IMPLEMENTED**            | `pnpm integrations:csa:doctor` (OK/AVISO/ERRO/NÃO VALIDADO, pt-BR, sem segredos).                                                                         |
| 23  | Comando test-fixture                          | **IMPLEMENTED**            | `pnpm integrations:csa:test-fixture` (localhost default, recusa produção sem `--allow-production`, token mascarado).                                      |
| 24  | Fixtures 1.13.2                               | **IMPLEMENTED**            | `packages/csa-integration/fixtures/1.13.2/` (10 fixtures sanitizadas).                                                                                    |
| 25  | Testes e2e (Testcontainers)                   | **IMPLEMENTED**            | `apps/bot-api/test/csa-end-to-end.int.test.ts` — PostgreSQL+Redis reais; Discord mockado.                                                                 |
| 26  | Templates CSA (deploy)                        | **IMPLEMENTED**            | `deploy/csa/1.13.2/` (server, relay, direct, README).                                                                                                     |
| 27  | Configuração real no servidor MC              | **NOT_VALIDATED**          | Requer acesso ao servidor; guia manual em `docs/csa-production-installation.md` e `docs/csa-testing.md`.                                                  |
| 28  | Reload real no servidor                       | **NOT_VALIDATED**          | Comando confirmado (`/csa-common reload`); execução real pendente de autorização.                                                                         |
| 29  | Entrega real no Discord                       | **NOT_VALIDATED**          | Requer token de produção e teste controlado autorizado.                                                                                                   |

## Resumo

- **IMPLEMENTED**: 25 componentes.
- **NOT_VALIDATED**: 4 componentes que dependem do ambiente de produção
  (servidor Minecraft, VPS, Discord real) — cobertos pelos guias manuais.

## Bloqueadores para staging

1. Conferir SHA-256 do JAR de produção.
2. Autorizar instalação manual (backups + reload) no servidor Minecraft.
3. Teste controlado real (Pikachu via `/pokespawn`) com alerta no Discord.
