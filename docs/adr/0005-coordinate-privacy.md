# ADR 0005: Privacidade de Coordenadas

**Status**: Aceito
**Data**: 2026-08-05

## Decisão

Política padrão: **`hidden`** (coordenadas nunca exibidas publicamente).

Três políticas suportadas:

- `hidden`: Coordenadas removidas de todas as notificações públicas
- `region`: Região aproximada com grade configurável (padrão 500 blocos)
- `exact_admin_only`: Coordenadas exatas apenas em canal privado administrativo

## Justificativa

- Preserva a experiência de exploração do servidor Cobblemon
- Evita que jogadores "snipem" Pokémon raros via coordenadas exatas
- Conformidade com práticas de privacidade em servidores multiplayer
- Canal administrativo separado para moderação quando necessário

## Implementação

- O worker **sempre** remove coordenadas exatas do payload público
- Arredondamento para região usa `Math.floor(coord / grid) * grid`
- Coordenadas nunca são armazenadas em campos de texto simples no banco
- Nomes de jogadores mais próximos ocultos por padrão (`SPAWN_SHOW_NEAREST_PLAYER=false`)
