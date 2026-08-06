# Arquitetura — Professor Carvalho

## Visão geral

Professor Carvalho é o assistente oficial do servidor **BigMonCraft** (rede BigBangCraft)
no Discord. MVP v0.1.0, stack Node.js 24 + TypeScript, monorepo pnpm com 2 aplicações
e 10 pacotes. Todo o runtime executa no **VPS do proxy Velocity**, não no servidor
Minecraft (vide ADR 0001).

```mermaid
graph TD
    subgraph "VPS do Proxy (Velocity)"
        Nginx[Nginx - proxy reverso]
        BotAPI[bot-api - Fastify :3000]
        Worker[worker - BullMQ consumers]
        PG[(PostgreSQL 17)]
        Redis[(Redis 7)]
    end

    subgraph "Servidor Minecraft (BigMonCraft)"
        CSA[Cobblemon Spawn Alerts 1.13.2 - Fabric]
    end

    subgraph "Externo"
        DiscordAPI[Discord API - Gateway + HTTP]
        PokeAPI[PokéAPI v2]
    end

    CSA -->|POST /v1/integrations/csa/:token| Nginx
    Nginx -->|CIDR allowlist| BotAPI
    BotAPI -->|BullMQ jobs| Redis
    Worker -->|consome jobs| Redis
    Worker -->|REST HTTP| DiscordAPI
    Worker -->|persistência| PG
    BotAPI -->|interações slash| DiscordAPI
    BotAPI -->|consultas cache-aware| PokeAPI
    BotAPI -->|dados| PG
    BotAPI -->|cache| Redis
```

## Serviços

| Serviço           | Tecnologia               | Papel                                                                          |
| ----------------- | ------------------------ | ------------------------------------------------------------------------------ |
| **bot-api**       | Fastify + discord.js     | API HTTP health/metrics/CSA, gateway Discord, comandos slash, autocomplete     |
| **worker**        | BullMQ Workers (3 filas) | Processamento assíncrono de alertas CSA, entrega Discord, limpeza de dados     |
| **PostgreSQL 17** | Drizzle ORM              | Dados de guildas, fontes de integração, eventos, spawns, uso de comandos       |
| **Redis 7**       | ioredis + BullMQ         | Filas de jobs, cache Pokémon (2 níveis), dedup de alertas, heartbeat de worker |
| **Nginx**         | nginx                    | Proxy reverso, CIDR allowlist para o endpoint CSA, limites de corpo/timeout    |

### Pacotes internos

| Pacote                          | Descrição                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `@bigbangcraft/config`          | Schema Zod de todas as variáveis de ambiente, validação condicional, redação                                     |
| `@bigbangcraft/domain`          | Tipos compartilhados, erros (`ProfessorError`), utilitários (`sha256Hex`, `stableStringify`, `safeTokenCompare`) |
| `@bigbangcraft/database`        | Cliente Drizzle, schema (5 tabelas), repositórios e migrations                                                   |
| `@bigbangcraft/queue`           | Conexão Redis, criação de filas BullMQ, tipos de payload de jobs                                                 |
| `@bigbangcraft/observability`   | Logger pino estruturado, métricas Prometheus, gerenciador de shutdown                                            |
| `@bigbangcraft/pokemon-data`    | Cliente PokéAPI com cache 2 níveis, autocomplete tolerante a erros                                               |
| `@bigbangcraft/cobblemon-data`  | Importador de snapshot de spawns Cobblemon e store em memória                                                    |
| `@bigbangcraft/csa-integration` | Validação de payload CSA, parser de marcador `PC_CSA_V1`, dedup, allowlist CIDR                                  |
| `@bigbangcraft/discord-ui`      | Definições de comandos slash, builders de embed                                                                  |
| `@bigbangcraft/testing`         | Helpers de teste                                                                                                 |

## Fluxo de comandos Discord

```mermaid
sequenceDiagram
    participant User as Jogador Discord
    participant Discord as Discord Gateway
    participant Bot as bot-api
    participant Cache as Redis (cache)
    participant API as PokéAPI
    participant PG as PostgreSQL

    User->>Discord: /dex pikachu
    Discord->>Bot: Interaction (slash command)
    Bot->>Bot: Autocomplete ranker (em memória)
    Bot->>Cache: GET pokemon:find:pikachu (memória → Redis)
    alt Cache hit (fresh)
        Cache-->>Bot: Dados cacheados
    else Cache hit (stale)
        Cache-->>Bot: Dados stale
        Bot->>API: GET /pokemon/pikachu (background refresh)
        API-->>Bot: Dados atualizados
        Bot->>Cache: SET (refresh)
    else Cache miss
        Bot->>API: GET /pokemon/pikachu
        alt Sucesso
            API-->>Bot: Dados do Pokémon
            Bot->>Cache: SET (fresh)
        else Erro + stale disponível
            API--xBot: Timeout/erro
            Bot->>Cache: GET (fallback para stale)
            Cache-->>Bot: Dados stale (graceful degradation)
        end
    end
    Bot-->>Discord: Embed da Pokédex
    Discord-->>User: Resposta no canal
```

## Fluxo de integração CSA

```mermaid
sequenceDiagram
    participant MC as Servidor Minecraft
    participant CSA as Cobblemon Spawn Alerts
    participant WG as WireGuard
    participant Nginx as Nginx (proxy)
    participant API as bot-api (POST /v1/integrations/csa/:token)
    participant Redis as Redis (dedup + fila)
    participant Worker as worker (BullMQ)
    participant Discord as Discord API

    MC->>CSA: POKEMON_ENTITY_SPAWN (Cobblemon)
    CSA->>CSA: Avalia ServerConfig (bucket, shiny, legendary, etc.)
    CSA->>CSA: Delay 0.5s → ScheduledTask
    CSA->>CSA: Dedup UUID (globbyAlerted set)
    CSA->>WG: POST JSON (webhookURL configurada)
    WG->>Nginx: HTTP na rede WireGuard
    Nginx->>Nginx: CIDR allowlist + token no path
    Nginx->>API: proxy_pass :3080
    API->>API: Valida token (safeTokenCompare)
    API->>API: Parses marcador PC_CSA_V1
    API->>API: Valida payload (Zod)
    API->>Redis: setNx dedup key (janela 90s)
    Redis-->>API: Boolean (não duplicado)?
    alt Duplicado
        API-->>Nginx: 200 OK (ignora silenciosamente)
    else Novo evento
        API->>PG: INSERT integration_event
        API->>Redis: ADD job spawn-alerts
        API-->>Nginx: 200 OK
        Redis-->>Worker: process-csa-alert
        Worker->>PG: INSERT spawn_event (com política de coordenadas)
        Worker->>Redis: ADD job spawn-delivery
        Redis-->>Worker: deliver-discord-spawn-alert
        Worker->>Discord: POST /channels/:id/messages (embed)
        Discord-->>Worker: 200 OK
    end
```

## Fluxo de dados Pokémon

```mermaid
graph TD
    subgraph "Fontes"
        A[PokéAPI v2] -->|JSON schemas| B[PokeApiClient]
        C[Snapshot Cobblemon] -->|JSON importado| D[SnapshotStore]
    end

    subgraph "Cache 2 níveis"
        B -->|fallback| E[InMemoryTtlCache - LRU 512]
        B -->|cache persistente| F[Redis - TTL 24h fresh / 7d stale]
    end

    subgraph "Consumidores"
        E --> G[/dex - Pokédex]
        F --> G
        E --> H[/fraquezas - Type effectiveness]
        F --> H
        D --> I[/spawn - Condições de spawn]
        D --> J[AutocompleteRanker - índice de busca]
        J --> K[Autocomplete interativo]
    end
```

- **Cache L1 (memória)**: LRU com 512 entradas, TTL proporcional ao TTL do Redis / 24
- **Cache L2 (Redis)**: TTL fresh 24h (`POKEMON_CACHE_TTL_SECONDS`), TTL stale 7d (`POKEMON_CACHE_STALE_TTL_SECONDS`)
- **Negative caching**: 404 da PokéAPI é cacheados por 10 min (`POKEMON_NEGATIVE_CACHE_TTL_SECONDS`) em ambos os níveis

## Gateway Fabric (futuro)

O Gateway Fabric é uma funcionalidade planejada para substituir o Modo A (relay CSA)
por um endpoint próprio no servidor Minecraft via mod Fabric. Não está implementado
no MVP (v0.1.0).

```mermaid
graph TD
    subgraph "VPS do Proxy (Velocity)"
        GW[Gateway ingress - POST /v1/events] -->|HMAC-SHA256| API
        API[bot-api] --> Redis
        Worker[worker] --> Discord
    end

    subgraph "Servidor Minecraft"
        Mod[Fabric Mod - Professor Carvalho Gateway] -->|WireGuard| GW
    end

    Mod -->|spool local| Disk[(Disco - fallback)]
```

```mermaid
sequenceDiagram
    participant Mod as Fabric Mod
    participant Spool as Spool (disco local)
    participant Ingress as bot-api (POST /v1/events)
    participant Worker as worker

    Mod->>Mod: Evento de jogo (spawn, captura, batalha, etc.)
    Mod->>Mod: Assina HMAC-SHA256 (X-Professor-Signature)
    Mod->>Ingress: POST /v1/events (JSON envelope)
    alt Sucesso
        Ingress-->>Mod: 200 OK
    else Falha de rede / proxy indisponível
        Ingress--xMod: Timeout
        Mod->>Spool: Grava evento em disco
    end
    Spool-->>Mod: Retry em intervalo configurável
    Ingress->>Worker: Enfileira processamento
    Worker->>Discord: Entrega notificação
```

### Características do Gateway

- Endpoint: `POST /v1/events`
- Autenticação: HMAC-SHA256 via cabeçalho `X-Professor-Signature`
- Dedup: `X-Professor-Event-Id` (UUIDv7 do lado do servidor)
- Clock-skew: tolerância configurável via `X-Professor-Timestamp`
- Replay protection: armazenamento de nonces em Redis (TTL)
- Spool local no servidor Minecraft: armazena eventos em disco quando o proxy está indisponível
- Sem chamadas HTTP na thread principal do Minecraft: toda comunicação é assíncrona

O contrato detalhado do protocolo está em `docs/future-gateway-contract.md`.
