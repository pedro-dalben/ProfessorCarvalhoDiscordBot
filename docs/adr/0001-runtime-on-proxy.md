# ADR 0001: Execução do Professor Carvalho no VPS do Proxy

**Status**: Aceito
**Data**: 2026-08-05

## Contexto

O servidor Minecraft BigMonCraft tem recursos limitados. O bot Professor Carvalho precisa processar dados de Pokémon (PokéAPI, cache Redis, PostgreSQL, filas BullMQ, API HTTP) sem impactar o desempenho do servidor de jogo.

## Decisão

Todo o runtime do Professor Carvalho será executado no **VPS do proxy Velocity**, não no servidor Minecraft.

- `bot-api` e `worker` rodam como containers Docker no VPS do proxy
- PostgreSQL e Redis também rodam no proxy (containers dedicados)
- Apenas o mod CSA (Cobblemon Spawn Alerts) permanece no servidor Minecraft, comunicando-se com o proxy via WireGuard
- O servidor Minecraft **não executa nenhum componente do bot**

## Consequências

- O VPS do proxy precisa ter recursos suficientes para PostgreSQL, Redis e os dois processos Node.js
- A comunicação entre CSA e o relay é via rede privada WireGuard (baixa latência, segura)
- O snapshot de spawns precisa ser exportado manualmente do host Minecraft e copiado para o proxy
- O gateway Fabric futuro também enviará eventos para o proxy via HTTP
