# Snapshot de spawns do BigMonCraft — guia de regeneração (pt-BR)

O comando `/spawn <pokémon>` responde com base em um **snapshot JSON** de
spawns do Cobblemon gerado fora do runtime e embutido na imagem do `bot-api`.

## De onde vêm os dados

Duas fontes, mescladas (o datapack sobrescreve os caminhos iguais):

1. **Base do Cobblemon** — `data/cobblemon/spawn_pool_world/*.json` extraído do
   jar do mod instalado no servidor Minecraft (ex.: `Cobblemon-fabric-1.7.3+1.21.1.jar`).
   Cobre o dex inteiro e equivale aos dados documentados no wiki do Cobblemon.
2. **Datapack do modpack** — `ATM x MSD [v3.7.0].zip` em
   `/home/brainiac/bigbangcraft/bigmoncraft/datapacks/` (espécies customizadas +
   spawns especiais de lendários/míticos/paradox em `data/special_spawns/spawn_pool_world/`).

## Procedimento de regeneração

No host Minecraft (`brainiac`), preparar o staging (leitura, sem alterar o servidor):

```bash
rm -rf /tmp/spawnpool && mkdir -p /tmp/spawnpool && cd /tmp/spawnpool
unzip -q "<caminho>/Cobblemon-fabric-<versao>+<mc>.jar" "data/cobblemon/spawn_pool_world/*.json"
unzip -q "<caminho>/ATM x MSD [vX.Y.Z].zip" \
  "data/*/spawn_pool_world/*.json" "data/*/spawn_pool_world/*/*.json" "data/*/spawn_pool_world/*/*/*.json" 2>/dev/null || true
tar czf /tmp/spawnpool-staging.tar.gz data
```

Transferir para a proxy (via máquina local ou direto) e importar:

```bash
# na proxy
tar xzf spawnpool-staging.tar.gz -C /tmp/spawnpool
cd /home/ubuntu/ProfessorCarvalhoDiscordBot
pnpm data:import-cobblemon --source /tmp/spawnpool \
  --output data/generated/bigmoncraft-spawn-snapshot.json \
  --server-id bigmoncraft \
  --cobblemon-version 1.7.3 \
  --modpack-version "ATM x MSD v3.7.0" \
  --force
```

Validar integridade antes de publicar:

```bash
node -e 'const {SnapshotStore}=require("./packages/cobblemon-data/dist/index.js");
(async()=>{const s=new SnapshotStore();await s.loadFromFile("data/generated/bigmoncraft-spawn-snapshot.json");
console.log("OK, entradas:",s.current.entryCount)})()'
```

Publicar:

```bash
sudo docker compose -p professor-carvalho \
  --project-directory /home/ubuntu/ProfessorCarvalhoDiscordBot \
  -f deploy/compose.yaml -f deploy/compose.vps.yaml \
  build bot-api
sudo docker compose -p professor-carvalho \
  --project-directory /home/ubuntu/ProfessorCarvalhoDiscordBot \
  -f deploy/compose.yaml -f deploy/compose.vps.yaml \
  up -d bot-api
```

O snapshot fica em `data/generated/` (gitignored) e entra na imagem via
`COPY data/ /app/data/`. Variáveis de ambiente relevantes:

```dotenv
COBBLEMON_SNAPSHOT_PATH=/app/data/generated/bigmoncraft-spawn-snapshot.json
COBBLEMON_SNAPSHOT_REQUIRED=true
```

Com `COBBLEMON_SNAPSHOT_REQUIRED=true`, se o snapshot faltar o `bot-api`
encerra no boot (falha ruidosa, sem `/spawn` quebrado silencioso).

## Detalhes do importador

- Consome qualquer arquivo `data/<ns>/spawn_pool_world/**/*.json` (subpastas inclusas).
- Arquivos com `enabled: false` são ignorados; entradas herd sem `pokemon` são puladas.
- Aceita `timeRange`/`moonPhase`/`weather` como string ou array (formato real do Cobblemon 1.7.3,
  ex.: `"moonPhase": "1,2,3"`).
- Identificadores como `"rayquaza min_perfect_ivs=3"` (condição no nome, usada pelo
  datapack ATM x MSD) são normalizados para a espécie pura (`rayquaza`); formas
  separadas por espaço (`articuno galarian`) viram `pokemon + form`.
- O hash de integridade (`contentSha256`) é **canônico** (chaves ordenadas) — não
  depende da ordem de serialização.
- Regenerar sempre que o datapack ou o Cobblemon atualizar no servidor.

## Verificação funcional

Após o deploy, conferir nos logs do bot-api:

```text
Snapshot de spawns carregado.
```

E testar no Discord: `/spawn charizard`, `/spawn gyarados`, `/spawn rayquaza`.
Espécies sem spawn natural (ex.: eventos) retornam "não encontrado" — correto.
