# Contrato do Gateway Fabric — Professor Carvalho

## Estado

O protocolo v1 está aprovado para a implementação do BigBang ID e do Gateway.
CSA permanece independente e este contrato não implementa alertas de spawn.

## Contrato canônico

O contrato compartilhado está em `docs/contracts/gateway-v1.json`. Ele contém
um corpo UTF-8 com `José`, o SHA-256 esperado e a assinatura HMAC-SHA256 com
uma chave exclusivamente de teste. Os testes TypeScript devem consumi-lo sem
reformatar o corpo; os testes Java usam a cópia idêntica no repositório do mod.

As requisições usam `POST /v1/gateway/{events,identity/link,profiles,heartbeat}`
e os cabeçalhos `X-Professor-Server`, `X-Professor-Timestamp`,
`X-Professor-Request-Id`, `X-Professor-Gateway-Version` e
`X-Professor-Signature`. A string canônica é:

```text
METHOD
PATH
SERVER_ID
TIMESTAMP
REQUEST_ID
GATEWAY_VERSION
SHA256_BODY
```

`requestId` é único por tentativa e fica em Redis durante a janela de replay.
`eventId` permanece estável durante retries e é único no PostgreSQL. O mesmo
evento e corpo recebe sucesso idempotente; o mesmo ID com hash diferente recebe
`409 EVENT_ID_CONFLICT`.

Link codes não entram no spool e não são registrados. Eles são protegidos na
API com `HMAC-SHA256(IDENTITY_LINK_CODE_PEPPER, código normalizado)`. A API
sempre responde códigos estáveis e mensagens em português.
