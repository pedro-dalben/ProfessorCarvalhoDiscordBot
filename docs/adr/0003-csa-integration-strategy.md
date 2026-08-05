# ADR 0003: Estratégia de Integração CSA — Modo Relay

**Status**: Aceito
**Data**: 2026-08-05

## Decisão

**Modo A (Relay Interno)** como estratégia principal, com **Modo B (Webhook Discord Direto)** documentado como fallback.

## Justificativa

A auditoria do JAR CSA 1.13.2 confirmou que:

- O webhook aceita POST JSON para **qualquer URL** (sem restrição a discord.com)
- Resposta esperada: HTTP 200 ou 204
- Envio assíncrono (CompletableFuture), não bloqueia o servidor Minecraft
- Sem autenticação nativa → mitigado por WireGuard + token no path + CIDR allowlist

## Arquitetura do Modo A

```
CSA (Minecraft) → WireGuard → Nginx (proxy) → bot-api (Fastify)
    → validação (token + CIDR) → persistência (PostgreSQL)
    → enfileiramento (BullMQ) → worker → Discord (entrega do alerta)
```

## Componentes de segurança

- Token de 32+ bytes aleatórios (base64url) no path da URL
- Comparação constante-tempo (`timingSafeEqual`)
- Allowlist de IPs de origem via CIDR (WireGuard)
- Body limit estrito (64 KiB)
- Fingerprint SHA-256 para deduplicação
- Nginx com `access_log off` na rota tokenizada

## Fallback (Modo B)

Se o relay for inviável, CSA envia diretamente para um webhook Discord. Limitação: sem persistência, sem dedup, sem enriquecimento.
