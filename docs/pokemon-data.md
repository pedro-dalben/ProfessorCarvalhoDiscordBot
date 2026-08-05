# Dados Pokémon — Professor Carvalho

## Fontes de dados

O Professor Carvalho utiliza duas fontes independentes de dados Pokémon:

| Fonte                  | Tipo               | Abrangência                   | Atualização             | Formato                   |
| ---------------------- | ------------------ | ----------------------------- | ----------------------- | ------------------------- |
| **PokéAPI**            | API HTTP pública   | Todos os Pokémon (1025+)      | Mantida pela comunidade | REST JSON                 |
| **Snapshot Cobblemon** | Arquivo JSON local | Apenas Pokémon do BigMonCraft | Manual (administrador)  | `bigmoncraft-spawns.json` |

### Por que duas fontes?

- **PokéAPI**: dados canônicos de Pokédex (stats, tipos, evoluções, descrições).
  Não contém informações específicas do servidor BigMonCraft.
- **Snapshot Cobblemon**: condições de spawn reais no servidor (biomas, horários,
  clima, raridade). Extraído dos arquivos de configuração do modpack Cobblemon.

## PokéAPI

### Endpoints utilizados

| Endpoint                      | Uso                                                        | Comando      |
| ----------------------------- | ---------------------------------------------------------- | ------------ |
| `GET /pokemon-species/{name}` | Resolver espécie (nomes em pt-BR, lendário/mítico)         | `/dex`       |
| `GET /pokemon/{name}`         | Stats, tipos, habilidades, altura/peso                     | `/dex`       |
| `GET /evolution-chain/{id}`   | Cadeia de evolução                                         | `/dex`       |
| `GET /type/{name}`            | Efetividade de tipos (fraquezas, resistências, imunidades) | `/fraquezas` |

### Timeout e retry

```env
POKEAPI_REQUEST_TIMEOUT_MS=5000   # 5 segundos por requisição
```

Política de retry: **1 tentativa adicional** apenas para erros retryable
(status 429, 500, 502, 503, 504). Timeouts, erros de rede e falhas de validação
Zod também disparam retry.

### User-Agent

```env
POKEAPI_USER_AGENT=ProfessorCarvalho/0.1.0 BigMonCraft
```

A PokéAPI exige User-Agent identificável. O formato segue a recomendação oficial:
`<Aplicação>/<Versão> <Projeto>`.

### Rate limit da PokéAPI

A PokéAPI é um serviço gratuito com rate limit não documentado oficialmente.
O cache de 2 níveis reduz drasticamente as chamadas à API:

- Cache L1 (memória) absorve a maioria das consultas repetidas
- Cache L2 (Redis) cobre 24h de fresh + 7d de stale
- Apenas cache misses completas chegam à PokéAPI

## Arquitetura de cache

```
┌──────────────────────────────────────────────────┐
│  Consulta (/dex pikachu)                          │
│        │                                          │
│        ▼                                          │
│  ┌─────────────────────┐                          │
│  │ L1: Memória (LRU)    │ 512 entradas            │
│  │ TTL = freshTTL / 24  │ ~30s min TTL            │
│  └──────┬──────────────┘                          │
│         │ miss                                    │
│         ▼                                         │
│  ┌─────────────────────┐                          │
│  │ L2: Redis            │ TTL fresh: 24h          │
│  │                      │ TTL stale: 7d           │
│  │ Chave: pkm-v1:find:X │ Negative cache: 10min   │
│  └──────┬──────────────┘                          │
│         │ miss                                    │
│         ▼                                         │
│  ┌─────────────────────┐                          │
│  │ PokéAPI              │                          │
│  │ GET /pokemon/pikachu │                          │
│  └──────┬──────────────┘                          │
│         │ sucesso                                  │
│         ▼                                         │
│  ┌─────────────────────┐                          │
│  │ Popula L2 → Popula L1                          │
│  │ Retorna dados        │                          │
│  └─────────────────────┘                          │
└──────────────────────────────────────────────────┘
```

### Estados do cache

| Estado             | Condição                                             | Comportamento                                       |
| ------------------ | ---------------------------------------------------- | --------------------------------------------------- |
| **Fresh hit (L1)** | Dados em memória, TTL não expirado                   | Retorna imediatamente                               |
| **Fresh hit (L2)** | Dados no Redis, TTL não expirado                     | Retorna + preenche L1                               |
| **Stale hit (L2)** | Dados no Redis, fresh TTL expirado, stale TTL válido | Retorna stale + background refresh da PokéAPI       |
| **Stale fallback** | PokéAPI falhou, dados stale disponíveis              | Retorna stale (graceful degradation)                |
| **Miss**           | Nenhum cache disponível                              | Consulta PokéAPI, popula cache se sucesso           |
| **Negative cache** | PokéAPI retornou 404                                 | Cache de 10 min (ambos níveis) para não repetir 404 |

### Background refresh (stale-while-revalidate)

Quando um cache hit é stale (entre 24h e 7d), o sistema:

1. Retorna os dados stale **imediatamente** ao usuário
2. Dispara uma requisição à PokéAPI em background
3. Se a PokéAPI responder, atualiza ambos os níveis de cache
4. Se a PokéAPI falhar, os dados stale permanecem

Isso garante que o usuário nunca espera por uma requisição lenta à PokéAPI quando
há dados em cache.

## Índice de autocomplete

### Geração

O índice é gerado no build:

```bash
pnpm data:generate-pokemon-index
```

Este comando compila uma lista completa de nomes de Pokémon (com variantes de forma
e traduções pt-BR) em um arquivo JSON usado pelo `AutocompleteRanker`.

### Algoritmo de ranking

O `AutocompleteRanker` usa busca tolerante a erros de digitação:

- **Correspondência exata de prefixo** (ex.: "pik" → "Pikachu"): maior score
- **Correspondência de substring** (ex.: "kachu" → "Pikachu"): score médio
- **Correspondência fuzzy** (ex.: "pikachu" com erros de digitação): score reduzido
- **Nomes em português** quando disponíveis (species.names com language=pt)
- **Variantes de forma** (ex.: "rotom-wash", "deoxys-attack"): incluídas

### Carregamento

O índice é carregado em memória na inicialização do `bot-api`. Se o arquivo
não for encontrado, o bot não inicia e exibe:

```
Índice de autocomplete não encontrado. Execute pnpm data:generate-pokemon-index.
```

### Arquivo de índice

```env
AUTOCOMPLETE_INDEX_PATH=./data/generated/pokemon-index.json
```

## Estratégia de fallback quando PokéAPI está down

A prioridade é sempre retornar dados ao usuário, mesmo que desatualizados:

```
1. Cache L1 (memória, fresh)     → retorno imediato
2. Cache L2 (Redis, fresh)       → retorno imediato
3. Cache L2 (Redis, stale)       → retorno imediato + background refresh
4. Cache L2 (Redis, qualquer)    → retorno (fallback de último recurso)
5. Erro: "fonte externa indisponível"
```

**Nenhuma ação manual é necessária.** O sistema se recupera automaticamente
quando a PokéAPI volta. Dados stale são identificados com métricas de cache hit
com label `stale`.

## Snapshot de spawns Cobblemon

### Formato do snapshot

Arquivo JSON com schema versionado:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-05T12:00:00Z",
  "importerVersion": "1.0.0",
  "cobblemonVersion": "1.7.3",
  "modpackVersion": "1.0.0",
  "serverId": "bigmoncraft",
  "sourcePaths": [
    "data/bigmoncraft/spawn_pool_world/plains.json",
    "data/bigmoncraft/spawn_pool_world/forest.json"
  ],
  "entryCount": 847,
  "contentSha256": "abc123...",
  "entries": [
    {
      "id": "pikachu",
      "namespace": "bigmoncraft",
      "pokemon": "pikachu",
      "form": null,
      "aspects": [],
      "type": "pokemon",
      "bucket": "ULTRA_RARE",
      "weight": 1.0,
      "level": { "minimum": 28, "maximum": 45 },
      "presets": ["natural"],
      "conditions": {
        "biomes": ["minecraft:plains", "minecraft:sunflower_plains"],
        "timeRanges": ["minecraft:day"],
        "weathers": ["minecraft:clear"],
        "moonPhases": []
      },
      "anticonditions": {
        "biomes": [],
        "timeRanges": [],
        "weathers": ["minecraft:thunder"],
        "moonPhases": []
      },
      "requiredMods": [],
      "excludedMods": [],
      "source": {
        "file": "data/bigmoncraft/spawn_pool_world/plains.json",
        "sha256": "def456..."
      }
    }
  ]
}
```

### Integridade

O snapshot inclui `contentSha256` que é verificado no carregamento. Se a
verificação falhar, o snapshot é rejeitado e o bot inicia sem dados de spawn
(a menos que `COBBLEMON_SNAPSHOT_REQUIRED=true`).

### Validação manual de integridade

```bash
# O código valida automaticamente. Resultado visível nos logs:
# "Snapshot de spawns carregado." → integridade OK
# "Falha ao carregar snapshot de spawns." → corrompido
```

## Fluxo de importação manual

### Geração do snapshot

O snapshot é gerado no host do servidor Minecraft executando o importador
Cobblemon contra o diretório `data/` do modpack. Os arquivos `spawn_pool_world/*.json`
são lidos, validados e normalizados.

### Comando de importação

```bash
pnpm data:import-cobblemon -- \
  --source /caminho/para/data/cobblemon/ \
  --output data/generated/bigmoncraft-spawns.json \
  --force
```

### Transferência para o VPS

```bash
scp bigmoncraft-spawns.json user@proxy:/opt/professor-carvalho/data/generated/
```

### Recarregamento

O `bot-api` carrega o snapshot apenas na inicialização. Após atualizar o arquivo:

```bash
docker compose -f deploy/compose.yaml restart bot-api
```

### Snapshot ausente

Se `COBBLEMON_SNAPSHOT_REQUIRED=false` (padrão), o bot inicia sem snapshot.
O comando `/spawn` retornará "snapshot de spawns não disponível" quando
consultado.
