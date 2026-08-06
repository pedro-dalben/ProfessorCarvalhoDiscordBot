# BigBang ID

`/vincular` gera um código CARVALHO de uso único, armazenado somente como HMAC
com pepper. No Minecraft, o jogador executa `/professor vincular <código>`.
O bot grava a identidade em uma transação PostgreSQL com unicidade ativa por
Discord e UUID Minecraft. `/desvincular` exige confirmação e mantém o histórico.

`/perfil` mostra somente a própria ficha e omite módulos indisponíveis. UUIDs,
IDs Discord, códigos e segredos não aparecem na resposta.
