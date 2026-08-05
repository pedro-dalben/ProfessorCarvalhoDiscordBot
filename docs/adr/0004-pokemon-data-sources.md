# ADR 0004: Fontes de Dados Pokémon

**Status**: Aceito
**Data**: 2026-08-05

## Decisão

- **PokéAPI REST v2** como fonte primária de metadados (espécies, tipos, evoluções, stats)
- **Snapshots locais** (arquivos JSON) para dados de spawn específicos do BigMonCraft
- **Índice de autocomplete** gerado localmente a partir da PokéAPI (commitado no repositório)
- **Cache em dois níveis**: Redis (persistente, TTL) + memória (curto prazo, LRU)

## Política de cache

| Dado                 | TTL fresco | TTL stale | Fallback             |
| -------------------- | ---------- | --------- | -------------------- |
| Metadados de espécie | 24h        | 7 dias    | Retorna dado stale   |
| Efetividade de tipos | 7 dias     | 14 dias   | Calculado localmente |
| Evoluções            | 24h        | 7 dias    | Retorna dado stale   |
| Cache negativo       | 10min      | —         | —                    |

## Estratégia de fallback

- Se a PokéAPI estiver indisponível: servir dados do cache stale
- Se não houver cache: exibir mensagem "Pokédex externa indisponível"
- Dados de spawn sem snapshot: "Equipe precisa atualizar a base de pesquisas"
- Nunca apresentar dados genéricos de spawn como se fossem do BigMonCraft
