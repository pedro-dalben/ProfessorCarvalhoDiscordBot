# BigBangSpawnAlerts — Protocolo de Integração V2

## Visão geral

O Professor Carvalho atua como **relay privado** para alertas do mod BigBangSpawnAlerts 1.14.0.

O mod envia payloads formato Discord Webhook para o Professor Carvalho, que:
1. Valida, autentica e normaliza
2. Persiste o ciclo de vida completo
3. Cria e edita mensagens no Discord conforme transições de estado

Arquitetura:

```
BigBangSpawnAlerts (Minecraft)
    │ HTTP POST/PATCH (WireGuard)
    ▼
ProfessorCarvalho bot-api (Fastify)
    ├── validação + autenticação
    ├── PostgreSQL (spawn_events + spawn_lifecycle_history)
    └── BullMQ (bbsa-alerts → bbsa-delivery → bbsa-edits)
          │
          ▼
ProfessorCarvalho worker
    │
    ▼
Discord REST API (PATCH /channels/:id/messages/:mid)
```

## Rotas

### `POST /v1/integrations/bigbang-spawn-alerts/:sourceToken`

Alerta inicial (SPAWNED). O mod adiciona `?wait=true` automaticamente.

**Resposta**: `{ "id": "spawnAlertId" }` (200 OK)

Confirmação = evento validado + persistido + aceito para processamento. Não espera a entrega no Discord.

### `PATCH /v1/integrations/bigbang-spawn-alerts/:sourceToken/messages/:relayMessageId`

Atualizações de ciclo (IN_BATTLE, CAPTURED, DEFEATED, DESPAWNED, etc.)

**Resposta**: 204 No Content

**Erros**:
- 401: token inválido
- 403: CIDR bloqueado / fonte desabilitada
- 404: `SPAWN_ALERT_NOT_FOUND` — POST anterior?
- 409: `SPAWN_ALERT_ID_MISMATCH` / `INVALID_LIFECYCLE_TRANSITION`

## Marcador PC_BBSA_V2

Formato: linha única com campos separados por `|`

```
PC_BBSA_V2|spawn_alert_id=UUID|status_key=SPAWNED|status=Disponível|species=pikachu|pokemon=Pikachu|form=|level=50|shiny=|rarity=LEGENDARY|spawn_origin=NATURAL|world=Overworld|world_key=minecraft:overworld|dimension_key=minecraft:overworld|biome=minecraft:plains|x=1500|y=64|z=-800|location_visibility=EXACT|player=N/A|spawn_time=2026-08-06T20:30:00Z|elapsed_time=5s|alert_reasons=SHINY,LEGENDARY|matched_rule_ids=shiny-global,legendary-minerar
```

### Campos disponíveis

| Campo | Tipo | Descrição |
|---|---|---|
| `spawn_alert_id` | UUID | Identificador único do alerta (gerado pelo mod) |
| `status_key` | Enum | Status machine-readable: SPAWNED, IN_BATTLE, CAPTURED, DEFEATED, DESPAWNED, REMOVED, UNKNOWN |
| `status` | Texto | Status em PT-BR para fallback |
| `species` | String | Species key |
| `pokemon` | String | Nome traduzido |
| `form` | String | Forma (omitida se default) |
| `level` | Int | Nível |
| `shiny` | String | "shiny" ou vazio |
| `rarity` | String | Bucket: LEGENDARY, MYTHICAL, ULTRA_RARE, etc |
| `spawn_origin` | Enum | NATURAL, COMMAND, SCRIPTED, EVENT, BREEDING, PLAYER_SENT_OUT, UNKNOWN |
| `world` | String | Nome público do mundo |
| `world_key` | String | Chave da dimensão |
| `dimension_key` | String | Chave da dimensão |
| `biome` | String | Chave do bioma |
| `x`, `y`, `z` | Int | Coordenadas (N/A ou ≈ prefix para ocultas) |
| `location_visibility` | Enum | EXACT, REGION, BIOME, WORLD_ONLY, HIDDEN |
| `player` | String | Jogador envolvido (N/A se nenhum) |
| `spawn_time` | ISO-8601 | Timestamp do spawn |
| `elapsed_time` | String | Duração formatada desde spawn |
| `resolved_time` | String | Duração até estado terminal |
| `alert_reasons` | CSV | Motivos: SHINY, LEGENDARY, etc |
| `matched_rule_ids` | CSV | IDs das regras que dispararam |

### Nota sobre `status_key`

O campo `status_key` é preferível. O parser aceita fallback via texto PT-BR do campo `status`:
- `Disponível` → SPAWNED
- `Em batalha` → IN_BATTLE
- `Capturado` → CAPTURED
- `Derrotado` → DEFEATED
- `Desapareceu` → DESPAWNED
- `Removido` → REMOVED

## Máquina de estados (bot)

Transições permitidas:

```
SPAWNED    → IN_BATTLE, CAPTURED, DEFEATED, DESPAWNED, REMOVED, UNKNOWN
IN_BATTLE  → CAPTURED, DEFEATED, DESPAWNED, REMOVED, SPAWNED, UNKNOWN
CAPTURED   → (terminal)
DEFEATED   → (terminal)
DESPAWNED  → (terminal)
REMOVED    → (terminal)
UNKNOWN    → qualquer estado
```

Estados finais são imutáveis. Estados repetidos são idempotentes (204 sem criar histórico).

## Política de localização

Visibilidade final = mais restritiva entre mod e bot:

| Mod envia | Bot policy | Resultado |
|---|---|---|
| EXACT | region | REGION |
| REGION | hidden | HIDDEN |
| EXACT | exact_admin_only | EXACT |
| WORLD_ONLY | region | WORLD_ONLY |

## Idempotência

- **POST**: `serverId + spawnAlertId` (unique constraint no DB)
- **PATCH**: `spawnAlertId + status + occurredAt + payloadHash` no histórico
- **Edição Discord**: revision-based — job com revision desatualizada é ignorado

## Corrida PATCH-antes-do-POST

O worker carrega o registro mais recente do DB antes de criar/editar. Se o PATCH chegar antes do processamento do POST inicial, o worker cria a mensagem já no estado mais recente.

## Fallback — mensagem apagada

Se a edição retornar 404 (mensagem apagada no Discord):
1. Config `BBSA_RECREATE_DELETED_MESSAGE=true` (padrão): recria mensagem sem menções
2. `false`: registra erro, não recria

## Compatibilidade CSA V1

A rota CSA legada `POST /v1/integrations/csa/:token` e o marcador `PC_CSA_V1` continuam funcionando inalterados.

A ativação de ambas as integrações simultaneamente não causa conflito, pois usam tabelas e queues separadas. Para migração, configure o mod para apontar para a nova rota e mantenha a CSA legada como fallback.
