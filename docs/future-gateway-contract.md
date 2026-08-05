# Contrato do Gateway Fabric — Professor Carvalho

> **Status**: Planejado (não implementado no MVP v0.1.0).
> Este documento define o contrato de comunicação entre um mod Fabric no servidor
> Minecraft e o Professor Carvalho.

## Visão geral

O Gateway Fabric substitui a integração CSA (Modo A) por um canal de comunicação
nativo, autenticado criptograficamente, com spool local para resiliência.
O mod expõe eventos do servidor Minecraft (spawns, capturas, batalhas, etc.)
via HTTP para o proxy.

## Endpoint

```
POST /v1/events
```

### URL base

```
http://<IP_WIREGUARD_DO_PROXY>/v1/events
```

O endpoint só é exposto na interface WireGuard do proxy (Nginx com `listen` no IP
privado), mesma configuração do endpoint CSA atual.

### Ativação no proxy

```env
GATEWAY_INGRESS_ENABLED=true
GATEWAY_SHARED_SECRET=<segredo-compartilhado-32-chars>
GATEWAY_ALLOWED_CLOCK_SKEW_SECONDS=60
GATEWAY_ALLOWED_CIDRS=<IP_WIREGUARD_DO_SERVIDOR>/32
```

## Cabeçalhos obrigatórios

Toda requisição ao Gateway deve incluir estes cabeçalhos:

| Cabeçalho               | Tipo                 | Descrição                                      |
| ----------------------- | -------------------- | ---------------------------------------------- |
| `Content-Type`          | `application/json`   | Obrigatório                                    |
| `X-Professor-Server`    | `string`             | Identificador do servidor (ex.: `bigmoncraft`) |
| `X-Professor-Timestamp` | `integer` (epoch ms) | Timestamp da geração do evento                 |
| `X-Professor-Event-Id`  | `string` (UUIDv7)    | Identificador único do evento                  |
| `X-Professor-Signature` | `string` (hex)       | HMAC-SHA256 da requisição                      |

### Exemplo

```http
POST /v1/events HTTP/1.1
Host: 10.100.0.1
Content-Type: application/json
X-Professor-Server: bigmoncraft
X-Professor-Timestamp: 1754409600000
X-Professor-Event-Id: 0191e8a0-7b2f-7000-9c3a-1f2e3d4c5b6a
X-Professor-Signature: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2

{
  "type": "spawn.detected",
  "version": "v1",
  "payload": { ... }
}
```

## Autenticação: HMAC-SHA256

### Algoritmo

```
X-Professor-Signature = HMAC-SHA256(GATEWAY_SHARED_SECRET, canonicalString)
```

A string canônica é a concatenação de:

```
canonicalString =
  "POST\n" +
  "/v1/events\n" +
  X-Professor-Server + "\n" +
  X-Professor-Timestamp + "\n" +
  X-Professor-Event-Id + "\n" +
  SHA256(requestBody)
```

Onde `X-Professor-Timestamp` é string do epoch em milissegundos e `requestBody`
é o corpo da requisição como string UTF-8.

### Exemplo de string canônica

```
POST
/v1/events
bigmoncraft
1754409600000
0191e8a0-7b2f-7000-9c3a-1f2e3d4c5b6a
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

### Verificação no proxy

```typescript
const canonicalString = [
  "POST",
  "/v1/events",
  headers["x-professor-server"],
  headers["x-professor-timestamp"],
  headers["x-professor-event-id"],
  sha256Hex(body),
].join("\n");

const expectedSignature = createHmac("sha256", GATEWAY_SHARED_SECRET)
  .update(canonicalString)
  .digest("hex");

if (!safeTokenCompare(expectedSignature, headers["x-professor-signature"])) {
  // 401
}
```

## Validação de clock-skew

Para prevenir ataques de replay com timestamps antigos, o proxy rejeita requisições
cujo `X-Professor-Timestamp` difira do relógio do servidor em mais que
`GATEWAY_ALLOWED_CLOCK_SKEW_SECONDS` (padrão: 60s).

```
| now() - X-Professor-Timestamp | > GATEWAY_ALLOWED_CLOCK_SKEW_SECONDS * 1000 → 400
```

**O relógio do servidor Minecraft e do VPS do proxy devem estar sincronizados**
(preferencialmente via NTP).

## Proteção de replay

O `X-Professor-Event-Id` (UUIDv7) é armazenado em Redis com TTL de
`GATEWAY_ALLOWED_CLOCK_SKEW_SECONDS * 2 + 10` segundos. Requisições com o
mesmo `Event-Id` dentro dessa janela são rejeitadas como replay.

```
1. Verificar se X-Professor-Event-Id já existe no Redis
2. Se existir → 409 Conflict (replay detectado)
3. Se não existir → SETNX com TTL
```

O UUIDv7 (ordenado por timestamp) facilita a depuração e indexação de eventos.

## Envelope do evento

### Schema

```json
{
  "type": "string (event namespace)",
  "version": "string (schema version)",
  "payload": { "...": "type-dependent" }
}
```

### Campo `type`

Segue a convenção `<domain>.<action>`. Exemplos planejados:

| Type                 | Descrição                       |
| -------------------- | ------------------------------- |
| `spawn.detected`     | Um Pokémon apareceu no mundo    |
| `spawn.despawned`    | Um Pokémon desapareceu          |
| `capture.success`    | Um jogador capturou um Pokémon  |
| `capture.failed`     | Tentativa de captura falhou     |
| `battle.start`       | Batalha iniciada                |
| `battle.end`         | Batalha finalizada              |
| `evolution.complete` | Pokémon evoluiu                 |
| `trade.completed`    | Troca entre jogadores concluída |
| `boss.defeated`      | Boss derrotado                  |
| `server.online`      | Servidor ficou online           |
| `server.offline`     | Servidor ficou offline          |
| `player.join`        | Jogador entrou                  |
| `player.leave`       | Jogador saiu                    |

### Campo `version`

Versão do schema do payload. Permite evolução do formato sem quebrar consumidores
antigos. Exemplo: `"v1"`.

### Payload: `spawn.detected` (v1)

```json
{
  "type": "spawn.detected",
  "version": "v1",
  "payload": {
    "pokemon": {
      "species": "pikachu",
      "form": null,
      "dexNumber": 25,
      "level": 35,
      "shiny": false,
      "ability": "static",
      "nature": "timid",
      "gender": "male",
      "ivs": {
        "hp": 31,
        "attack": 15,
        "defense": 28,
        "specialAttack": 31,
        "specialDefense": 22,
        "speed": 31
      },
      "heldItem": null
    },
    "location": {
      "dimension": "minecraft:overworld",
      "biome": "minecraft:plains",
      "x": 1450.5,
      "y": 64.0,
      "z": -320.0
    },
    "context": {
      "bucket": "ULTRA_RARE",
      "source": "natural",
      "nearestPlayer": "Brainiac"
    }
  }
}
```

## Spool local (requisito do mod)

Quando o proxy está indisponível (timeout, erro de rede, WireGuard down), o mod
deve gravar os eventos em disco e retentá-los posteriormente.

### Requisitos do spool

- Sempre gravar em disco **antes** de tentar enviar via HTTP
- Após confirmação HTTP 200, remover do disco
- Retry com backoff exponencial (1s, 2s, 4s, 8s, 16s, 32s, 64s)
- Máximo de eventos armazenados em disco configurável (ex.: 10.000)
- Formato em disco: um arquivo JSON por evento, nomeado `<event-id>.json`
- Ordem de processamento: FIFO (baseado no UUIDv7 do timestamp)

### Fluxo

```
1. Evento de jogo ocorre (thread principal)
2. Mod serializa para JSON
3. Mod grava em disco (spool/)
4. Mod despacha HTTP assíncrono (fora da thread principal)
5. Se 200: remove arquivo do disco
6. Se falha: arquivo permanece, retry no próximo ciclo
```

### Não bloquear a thread principal

Toda operação de I/O (disco e HTTP) deve ser executada **fora da thread principal
do Minecraft**. Timeouts de rede não devem causar lag no servidor.

## Migração do CSA para o Gateway

O Gateway Fabric é o substituto planejado para o Modo A (relay CSA).
A migração consiste em:

1. Instalar o mod Fabric do Gateway (em desenvolvimento pela BigBangCraft)
2. Configurar `GATEWAY_SHARED_SECRET` em ambos os lados
3. Ativar `GATEWAY_INGRESS_ENABLED=true` no proxy
4. Desativar `CSA_INTEGRATION_MODE` no proxy (`disabled`)
5. Remover o CSA do modpack do servidor Minecraft
6. Os comandos Discord (`/dex`, `/spawn`, etc.) continuam funcionando sem alterações

## Diferenças entre CSA e Gateway

| Aspecto           | CSA (atual)                       | Gateway Fabric (futuro)                 |
| ----------------- | --------------------------------- | --------------------------------------- |
| Autenticação      | Token no path da URL              | HMAC-SHA256 via cabeçalho               |
| Replay protection | Nenhuma (apenas dedup de spawn)   | UUIDv7 + Redis nonce store              |
| Tipos de evento   | Apenas spawn                      | Spawn, captura, batalha, evolução, etc. |
| Resiliência       | Sem retry (perda de alerta)       | Spool em disco com retry                |
| Dependência       | Mod de terceiros (Stasis)         | Mod próprio (BigBangCraft)              |
| Schema            | Fixo (CSA webhook format)         | Versionado por tipo de evento           |
| Manutenção        | Dependente de atualizações do CSA | Controle total da equipe                |
