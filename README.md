# Professor Carvalho — Assistente do BigMonCraft

Bot Discord oficial do servidor **BigMonCraft** na rede **BigBangCraft**, integrado ao modpack Cobblemon.

**Versão**: 0.1.0 (MVP) · **Idioma**: português (pt-BR) · **Fuso**: America/Sao_Paulo

---

## Funcionalidades (MVP)

| Comando                | Descrição                                     |
| ---------------------- | --------------------------------------------- |
| `/dex <pokémon>`       | Consulta informações de um Pokémon na Pokédex |
| `/fraquezas <pokémon>` | Mostra fraquezas, resistências e imunidades   |
| `/spawn <pokémon>`     | Condições de spawn no BigMonCraft             |
| `/ajuda`               | Central de ajuda do Professor Carvalho        |
| `/status-professor`    | Estado dos serviços e base de pesquisa        |

- Autocomplete com busca tolerante a erros de digitação
- Notificações de spawn raro/shiny/lendário via Cobblemon Spawn Alerts
- Processamento assíncrono com BullMQ + Redis
- Cache de dados da PokéAPI com fallback stale
- Snapshot de spawns do BigMonCraft importado do servidor

## Arquitetura

```
┌─────────────────┐     ┌──────────────────────────────────┐
│ Minecraft (CSA) │────▶│ VPS Proxy (Professor Carvalho)    │
│ WireGuard       │     │                                  │
└─────────────────┘     │  bot-api ◀──▶ postgres           │
                        │    │         ▶ redis              │
                        │    ▼                             │
                        │  worker ◀──▶ BullMQ              │
                        │    │                             │
                        │    ▼                             │
                        │  Discord (alertas + comandos)    │
                        └──────────────────────────────────┘
```

## Pré-requisitos

- Node.js 24 LTS
- pnpm 11.20+
- Docker + Docker Compose
- PostgreSQL 17
- Redis 7

## Configuração local

```bash
cp .env.example .env
# Edite .env com suas credenciais
chmod 600 .env
```

### Desenvolvimento

```bash
# Infraestrutura (PostgreSQL + Redis)
docker compose -f deploy/compose.dev.yaml up -d

# Instalar dependências
pnpm install --frozen-lockfile

# Gerar índice de autocomplete
pnpm data:generate-pokemon-index

# Banco de dados
pnpm db:generate
pnpm db:migrate

# Executar (dev mode com hot reload)
pnpm dev
```

### Testes

```bash
pnpm test:unit         # Testes unitários
pnpm test:integration  # Testes de integração (requer Docker)
pnpm test:coverage     # Cobertura
```

### Lint e build

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
```

## Produção

```bash
# Docker Compose (todos os serviços)
docker compose -f deploy/compose.yaml up -d

# Registrar comandos no Discord (guild de desenvolvimento)
DISCORD_COMMAND_REGISTRATION_MODE=guild pnpm discord:register

# Importar snapshot de spawns
pnpm data:import-cobblemon -- --source <dir> --output data/generated/bigmoncraft-spawns.json --force
```

## Integração CSA

Modo **Relay (Modo A)** — o CSA envia para um endpoint interno via WireGuard.

Consulte `deploy/csa/1.13.2/README.md` e `docs/csa-integration.md` para configuração.

## Segurança

- Tokens e credenciais nunca são commitados
- URLs com token são redatadas dos logs
- Coordenadas exatas ocultas por padrão
- Menções `@everyone`/`@here` desabilitadas
- Containers executam como non-root
- PostgreSQL e Redis não expostos publicamente
- WireGuard + CIDR allowlist no ingress CSA

Consulte `docs/security.md` para detalhes.

## Documentação

| Documento                         | Conteúdo                      |
| --------------------------------- | ----------------------------- |
| `docs/architecture.md`            | Diagramas da arquitetura      |
| `docs/csa-audit.md`               | Auditoria do JAR CSA 1.13.2   |
| `docs/csa-integration.md`         | Integração CSA (Modo A/B)     |
| `docs/discord-setup.md`           | Criação do bot Discord        |
| `docs/deployment-proxy.md`        | Deploy no VPS                 |
| `docs/security.md`                | Modelo de ameaças e segurança |
| `docs/operations-runbook.md`      | Operações do dia a dia        |
| `docs/pokemon-data.md`            | Fontes de dados Pokémon       |
| `docs/future-gateway-contract.md` | Contrato do gateway Fabric    |
| `docs/adr/`                       | Decisões de arquitetura       |

## Limitações conhecidas

- O snapshot de spawns precisa ser gerado manualmente no host Minecraft e transferido
- A integração CSA em modo relay depende de rede WireGuard configurada
- O gateway Fabric para métricas em tempo real não está implementado (MVP)
- A Pokédex depende da disponibilidade da PokéAPI (com cache de fallback)

## Status do projeto

**MVP — pronto para validação local.**

## Licença

MIT
