# Segurança — Professor Carvalho

## Modelo de ameaças

### Atores

| Ator                           | Capacidade                                | Superfície de ataque                                            |
| ------------------------------ | ----------------------------------------- | --------------------------------------------------------------- |
| Jogador comum do BigMonCraft   | Executa comandos slash no Discord         | Comandos slash, autocomplete, rate limiting                     |
| Operador do servidor Minecraft | Acesso ao filesystem, rede WireGuard      | Endpoint CSA, arquivos de configuração do CSA                   |
| Atacante externo               | Scan de portas, tentativas de força bruta | Nginx (apenas exposto na WireGuard), bot-api (apenas 127.0.0.1) |
| Atacante com acesso ao VPS     | Acesso shell, leitura de disco            | `.env`, volumes Docker, segredos em memória                     |

### Trust boundaries

```
┌──────────────────────────────────────────────────────┐
│  Internet pública                                     │
│                                                        │
│  ┌─────────────────────────────┐                      │
│  │ Discord API (confiável)      │ ← TLS, autenticado   │
│  └─────────────────────────────┘                      │
│  ┌─────────────────────────────┐                      │
│  │ PokéAPI (não confiável)      │ ← TLS, sem auth      │
│  └─────────────────────────────┘                      │
│                                                        │
│  ─ ─ ─ WireGuard (trust boundary) ─ ─ ─               │
│                                                        │
│  ┌─────────────────────────────┐                      │
│  │ Servidor Minecraft           │ ← rede privada       │
│  │  └─ CSA (POST JSON para Nginx)                     │
│  └─────────────────────────────┘                      │
│                                                        │
│  ─ ─ ─ Docker bridge (trust boundary) ─ ─ ─            │
│                                                        │
│  ┌──────────┐  ┌────────┐  ┌──────────┐  ┌────────┐  │
│  │ postgres │  │ redis  │  │ bot-api  │  │ worker │  │
│  └──────────┘  └────────┘  └──────────┘  └────────┘  │
└──────────────────────────────────────────────────────┘
```

### Ameaças mapeadas

| Ameaça                              | Impacto                           | Probabilidade | Mitigação                                                            |
| ----------------------------------- | --------------------------------- | ------------- | -------------------------------------------------------------------- |
| Vazamento do token Discord          | Total (controle do bot)           | Baixa         | `.env` com `chmod 600`, nunca commitado, redatado de logs            |
| Vazamento do `CSA_SOURCE_TOKEN`     | Médio (spoof de alertas)          | Baixa         | Token no path, WireGuard + CIDR como camadas adicionais              |
| Spoof de alertas CSA                | Baixo (alertas falsos no Discord) | Muito baixa   | Requer acesso à WireGuard + CIDR + token; logs registram origem      |
| Sniffing de tráfego CSA             | Médio (coordenadas expostas)      | Muito baixa   | WireGuard criptografa na camada de rede                              |
| Acesso não autorizado ao Redis      | Alto (cache, filas, dedup)        | Baixa         | Redis apenas na bridge Docker interna, com senha                     |
| Acesso não autorizado ao PostgreSQL | Alto (todos os dados)             | Baixa         | PostgreSQL apenas na bridge Docker interna, com senha                |
| PokéAPI comprometida                | Baixo (dados falsos de Pokémon)   | Muito baixa   | Cache stale como fallback; validação Zod de todas as respostas       |
| Negação de serviço no endpoint CSA  | Médio (perda de alertas)          | Baixa         | Rate limiting (Fastify), CIDR allowlist, limite de corpo             |
| Exposição de coordenadas no Discord | Médio (privacidade dos jogadores) | Média         | Política `hidden` por padrão; `region` agrupa em grids de 500 blocos |
| Vazamento de logs                   | Médio (dados operacionais)        | Média         | Redação automática de tokens e URLs de webhook                       |

## Gerenciamento de segredos

### Lista de segredos

| Segredo                 | Tamanho mínimo      | Local                    | Rotacionável?                   |
| ----------------------- | ------------------- | ------------------------ | ------------------------------- |
| `DISCORD_TOKEN`         | ~72 chars (Discord) | `.env`                   | Sim, via Developer Portal       |
| `POSTGRES_PASSWORD`     | 16+ chars           | `.env`                   | Sim, reinicialização necessária |
| `REDIS_PASSWORD`        | 16+ chars           | `.env`                   | Sim, reinicialização necessária |
| `CSA_SOURCE_TOKEN`      | 32+ chars           | `.env` + `webhooks.json` | Sim, ambos os lados             |
| `METRICS_BEARER_TOKEN`  | 32+ chars           | `.env`                   | Sim                             |
| `GATEWAY_SHARED_SECRET` | 32+ chars           | `.env` (futuro)          | Sim                             |

### Geração

```bash
pnpm secrets:generate
```

Este comando gera tokens aleatórios criptograficamente seguros para todas as
variáveis de segredo necessárias.

### Armazenamento

- Todos os segredos residem **exclusivamente** no `.env` no VPS do proxy
- O `.env` tem permissões `600` (apenas root lê)
- Nenhum segredo é armazenado em:
  - Código fonte
  - Arquivos de configuração commitados
  - Variáveis de ambiente do sistema
  - Secrets managers externos (MVP não requer)

## Premissas do WireGuard

1. **A rede WireGuard é confiável**: apenas o VPS do proxy e o servidor Minecraft
   são peers. Nenhum outro dispositivo tem acesso à subnet `10.100.0.0/24`.

2. **As chaves privadas WireGuard são protegidas**: cada peer armazena sua chave
   privada em `/etc/wireguard/` com permissões restritas (`600`).

3. **O tráfego na WireGuard é autenticado e criptografado**: WireGuard usa
   ChaCha20-Poly1305. Ataques de replay são mitigados pelo protocolo.

4. **Se o WireGuard for comprometido**, um atacante pode:
   - Enviar alertas falsos para o endpoint CSA (se também tiver o token)
   - Fazer scan da porta 80 no proxy (apenas Nginx exposto)
   - **Não pode** acessar PostgreSQL, Redis, ou o bot-api diretamente

## Risco do token no path

O endpoint CSA usa autenticação via token no path da URL:

```
POST /v1/integrations/csa/<CSA_SOURCE_TOKEN>
```

### Riscos

- Tokens em URLs aparecem em logs de proxy (mitigado: `access_log off` no Nginx)
- Tokens em URLs podem vazar em referrer headers (mitigado: CSA não faz navegação)
- Tokens em URLs são visíveis em ferramentas de debugging de rede (mitigado: WireGuard)

### Por que token no path e não header?

O CSA 1.13.2 não suporta cabeçalhos HTTP customizados. A URL é o único campo
configurável no `webhooks.json` que aceita valores arbitrários.

### Comparação em tempo constante

O relay compara o token com `safeTokenCompare` (timing-safe equal). Além disso,
a comparação **não revela** se a fonte de integração existe: token inválido →
401 idêntico em ambos os casos.

### Armazenamento

O PostgreSQL guarda apenas o **hash SHA-256** do token (`integration_sources.token_hash`).
O token em texto puro existe somente em `.env` (proxy) e `webhooks.json`
(servidor Minecraft), ambos com permissão `600`.

### Migração futura

O Gateway Fabric (`docs/future-gateway-contract.md`) substituirá o token no path
por HMAC-SHA256 via cabeçalho `X-Professor-Signature`.

## Proxy trust e X-Forwarded-For

- `trustProxy` do Fastify **nunca** é `true`. Apenas `TRUSTED_PROXY_ADDRESSES`
  (loopback e/ou endereços/CIDRs explícitos) são confiados.
- O Nginx envia `X-Forwarded-For: $remote_addr` (o par TCP real), **nunca**
  `$proxy_add_x_forwarded_for` — assim um cabeçalho XFF forjado pelo cliente
  não atravessa o proxy.
- O CIDR allowlist é validado contra `request.ip` (par TCP após o trust chain),
  não contra cabeçalhos do cliente. Teste e2e cobre XFF forjado.
- Consequência: um atacante fora da WireGuard não consegue "fabricar" um IP
  permitido; no máximo consegue ser ignorado.

## Limitações do IP allowlist

A allowlist CIDR opera em duas camadas:

1. **Nginx**: `allow <CIDR>` / `deny all`
2. **bot-api**: `CSA_ALLOWED_CIDRS` com verificação em software

### Limitações

- IP spoofing na WireGuard: se um atacante comprometer um peer, pode forjar IPs.
  Mitigação: WireGuard autentica pacotes, spoofing requer quebra de criptografia.
- IPv6: o código suporta IPv6, mas a rede WireGuard usa IPv4.
- A allowlist é estática: mudanças de IP exigem atualização manual do `.env` e Nginx.

## Risco do webhook Discord

O Modo B (webhook Discord direto) expõe a URL do webhook no arquivo `webhooks.json`
do servidor Minecraft. Qualquer operador com acesso ao filesystem do servidor pode
ler essa URL e postar mensagens arbitrárias no canal do Discord.

### Mitigações

- Use o Modo A (relay) sempre que possível
- Se o Modo B for necessário, restrinja o acesso ao `webhooks.json` no servidor
- Considere um canal de webhook dedicado com permissões limitadas

## Política de falhas do relay

| Cenário                 | Comportamento                                                             | Motivo                                                             |
| ----------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Redis indisponível      | Dedup **fail-open** (`CSA_DEDUP_FAIL_OPEN=true`): evento aceito sem dedup | Evitar perder alertas legítimos; duplicatas ocasionais são aceitas |
| PostgreSQL indisponível | **503** — evento não aceito sem persistência durável                      | Nunca "aceitar e descartar"                                        |
| Payload malformado      | 400 + métrica `professor_csa_parse_failure_total`                         | Rejeição explícita                                                 |
| Token inválido          | 401 (sem revelar existência da fonte)                                     | Anti-enumeração                                                    |
| IP fora do CIDR         | 403, sem processar                                                        | Defesa em profundidade                                             |

Rate limiting: limite global (`HTTP_RATE_LIMIT_MAX`) + limite específico da rota
CSA (`CSA_RATE_LIMIT_MAX`, padrão 60/min). Corpo limitado a 64 KiB
(`CSA_BODY_LIMIT_BYTES`). Logs do relay sanitizam a URL (token redatado) e o
Nginx desliga o access log na rota tokenizada.

## Redação de logs

Os seguintes padrões são automaticamente redatados de todos os logs:

| Padrão                    | Exemplo                                   |
| ------------------------- | ----------------------------------------- |
| Tokens de ambiente        | `DISCORD_TOKEN`, `CSA_SOURCE_TOKEN`, etc. |
| URLs de webhook Discord   | `/webhooks/<ID>/<TOKEN>`                  |
| URLs de conexão com senha | `postgresql://user:****@host/db`          |

### Logs que NÃO são redatados

- Nomes de Pokémon, biomas, coordenadas (depende da política `SPAWN_COORDINATE_POLICY`)
- IDs do Discord (guildas, canais, cargos) — não são secretos
- Métricas e dados operacionais

### Coordenadas nos logs

Quando `SPAWN_COORDINATE_POLICY=hidden`, coordenadas **não são persistidas nem logadas**.
O worker remove coordenadas antes de inserir no banco e antes de enviar para o Discord.

## Privacidade de coordenadas

| Política           | Armazenamento            | Exibição Discord                        | Logs       |
| ------------------ | ------------------------ | --------------------------------------- | ---------- |
| `hidden` (padrão)  | Não                      | Não                                     | Não        |
| `region`           | Região (grid 500 blocos) | Região (ex.: "X: 1000-1500, Z: -500-0") | Região     |
| `exact_admin_only` | Não (por padrão)         | Apenas canal privado                    | Sanitizado |

`SPAWN_STORE_EXACT_COORDINATES=true` é bloqueado por validação condicional quando
`SPAWN_COORDINATE_POLICY=exact_admin_only`, exigindo revisão manual.

## Retenção de dados

| Dados                             | Retenção                       | Base                               |
| --------------------------------- | ------------------------------ | ---------------------------------- |
| Payload sanitizado de eventos CSA | 14 dias                        | `CSA_STORE_SANITIZED_PAYLOAD_DAYS` |
| Eventos de spawn                  | Indefinido (agregado)          | Tabela `spawn_events`              |
| Logs de uso de comandos           | Indefinido (agregado diário)   | Tabela `command_usage_daily`       |
| Heartbeats de worker              | Volátil (Redis TTL 60s)        | Redis                              |
| Cache Pokémon                     | 24h fresh / 7d stale           | Redis                              |
| Dedup keys                        | 100s (janela 90s + margem 10s) | Redis                              |

O worker executa limpeza periódica via job `cleanup-expired-events` na fila
`maintenance`. Eventos com `expires_at` anterior à data atual são removidos.

## Dependências

### Auditoria de segurança

```bash
pnpm security:audit
```

Execute antes de cada deploy em produção. Vulnerabilidades críticas ou altas devem
ser corrigidas antes do deploy.

### Atualização de dependências

```bash
pnpm update --latest
pnpm audit --prod
pnpm test
```

### Dependências críticas

| Dependência         | Risco                 | Nota                                               |
| ------------------- | --------------------- | -------------------------------------------------- |
| `discord.js`        | API do Discord        | Atualizações breaking são comuns em major versions |
| `fastify` + plugins | Superfície HTTP       | Helmet + rate-limit mitigam ataques comuns         |
| `bullmq`            | Processamento de jobs | Conexão Redis com senha                            |
| `drizzle-orm`       | Acesso ao banco       | Conexão PostgreSQL com senha                       |
| `zod`               | Validação de entrada  | Schemas estritos em todas as bordas                |
| `pino`              | Logging               | Redação automática de segredos                     |
| `ioredis`           | Conexão Redis         | Senha no Redis                                     |

## Resposta a incidentes

### Passos imediatos

1. **Contenção**:

   ```bash
   # Isolar o serviço comprometido
   docker compose -f deploy/compose.yaml stop bot-api worker
   ```

2. **Preservação de evidências**:

   ```bash
   # Salvar logs
   docker compose -f deploy/compose.yaml logs bot-api > /tmp/incident-bot-api-$(date +%s).log
   docker compose -f deploy/compose.yaml logs worker > /tmp/incident-worker-$(date +%s).log
   journalctl -u nginx --since "1 hour ago" > /tmp/incident-nginx-$(date +%s).log
   sudo wg show > /tmp/incident-wireguard-$(date +%s).log
   ```

3. **Diagnóstico**:
   - Verifique logs em busca de erros de autenticação (401/403)
   - Verifique métricas para picos anômalos
   - Verifique integridade do banco de dados

4. **Notificação**:
   - Avise a equipe BigBangCraft no canal administrativo
   - Se houver vazamento de token do Discord, regenere imediatamente

### Recuperação

1. Corrija a causa raiz
2. Rode `pnpm security:audit`
3. Se segredos foram comprometidos, rotacione-os
4. Restaure a partir de backup se necessário
5. Reinicie os serviços e monitore

### Rotação de segredos comprometidos

```bash
# 1. Gere novos segredos
pnpm secrets:generate

# 2. Atualize .env com os novos valores

# 3. Para DISCORD_TOKEN: regenere no Developer Portal primeiro

# 4. Para CSA_SOURCE_TOKEN: atualize também no webhooks.json do servidor

# 5. Recrie os containers
docker compose -f deploy/compose.yaml up -d --force-recreate
```
