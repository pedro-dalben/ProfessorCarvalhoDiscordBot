# Gateway do Professor Carvalho

As rotas `/v1/gateway/events`, `/identity/link`, `/profiles` e `/heartbeat`
aceitam somente requisições HMAC v1 do servidor Fabric. `requestId` muda a cada
tentativa; `eventId` permanece estável. PostgreSQL garante idempotência por
evento e Redis bloqueia replay dentro da janela configurada.

O gateway Minecraft é outbound-only. CSA continua independente e não recebe
eventos de spawn deste MVP.
