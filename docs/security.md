# Segurança da integração

Ative `GATEWAY_INGRESS_ENABLED` somente com segredo de pelo menos 32 bytes,
CIDR WireGuard explícito em produção e pepper de código separado. O Fastify
confia apenas nos proxies configurados; `X-Forwarded-For` não substitui a
allowlist. Assinaturas, corpos e códigos nunca entram nos logs.
