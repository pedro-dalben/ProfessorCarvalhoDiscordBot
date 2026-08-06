# Runbook

1. Aplique `pnpm db:migrate` em uma base de teste.
2. Confirme Redis, `GATEWAY_ALLOWED_CIDRS` e os dois segredos.
3. Verifique `/status-professor` e o heartbeat antes de testar `/vincular`.
4. Em falha, preserve a fila e examine somente `eventId`, `requestId`, status e código interno.

Não habilite ingress, Nginx ou comandos de produção neste MVP.
