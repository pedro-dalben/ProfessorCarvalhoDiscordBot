# Integração de dados de spawn (BigMonCraft → Professor Carvalho) — guia completo

Este documento explica **como os dados de spawn do `/spawn <pokémon>` chegam até o
Professor Carvalho**: de onde vêm, como foram integrados e **como atualizá-los**
quando o Cobblemon, o datapack do modpack ou o mod **Legendary Monuments** mudarem.

> Sem nenhum dado privado aqui: nenhum IP, token ou chave aparece. Os servidores são
> referidos pelos papéis que cumprem.

---

## 1. Visão geral: dois servidores

A integração envolve **dois servidores**, cada um com um papel:

| Servidor | Papel |
| -------- | ----- |
| **Servidor Minecraft** (BigMonCraft) | Onde o modpack roda. **Fonte de todos os dados de spawn**: mods e datapacks instalados definem onde cada Pokémon nasce. Nada do bot roda aqui. |
| **VPS do bot** (Professor Carvalho) | Onde o `bot-api` (Discord + Fastify), o `worker` (BullMQ), PostgreSQL, Redis e Nginx rodam. Recebe o snapshot de spawns, serve o `/spawn` e publica o bot no Discord. |

```
┌──────────────────────────┐        transferência do snapshot (tar.gz)
│  Servidor Minecraft      │ ──────────────────────────────▶ ┌──────────────────────────┐
│  (mods + datapacks)      │      (manual, sob demanda)      │  VPS do bot              │
│  Cobblemon / LM / etc.   │                                  │  bot-api (Discord)       │
└──────────────────────────┘                                  │  /spawn responde         │
                                                              └──────────────────────────┘
```

O fluxo não é contínuo: os dados de spawn são **congelados em um arquivo JSON
(snapshot)** no servidor Minecraft, transferidos para a VPS, importados para o
repositório e publicados em um deploy. Atualizar = repetir esse processo quando
algo mudar no modpack.

---

## 2. De onde vêm os dados do `/spawn`

Três fontes, todas extraídas de arquivos do modpack instalado no **servidor Minecraft**:

### 2.1. Base do Cobblemon (jar do mod)

O mod Cobblemon entrega, dentro do próprio jar, os arquivos de spawn de todo o dex:

```
data/cobblemon/spawn_pool_world/<numero>_<pokemon>.json
```

Exemplo do conteúdo (resumido):

```json
{
  "spawns": [
    {
      "pokemon": "charizard",
      "bucket": "ultra-rare",
      "level": "36-53",
      "condition": {
        "biomes": ["#cobblemon:is_hills", "#cobblemon:is_volcanic"],
        "canSeeSky": true
      }
    }
  ]
}
```

### 2.2. Datapack do modpack (zip)

O modpack aplica um datapack com **espécies customizadas e spawns especiais**
(lendários, míticos, paradoxos) em:

```
data/special_spawns/spawn_pool_world/{legendary,mithical,paradox,ultra_beast}/...
```

O datapack **sobrescreve** arquivos de mesmo caminho da base do Cobblemon e adiciona
entradas próprias — por isso ele é importado **por cima** da base.

### 2.3. Mod Legendary Monuments (jar)

O mod **Cobblemon: Legendary Monuments** assume o spawn de **61 lendários/míticos**
(zacian, lugia, mew, arceus, calyrex, kyurem...). No datapack, esses Pokémon vêm com
`excludedMods: ["legendarymonuments"]` — ou seja, o spawn padrão é desativado e o
mod passa a gerar o Pokémon em um **monumento próprio** (estrutura gerada no mundo):

| Pokémon | Monumento (estrutura do mod) |
| ------- | ---------------------------- |
| Lugia | `lugia_temple` — Templo de Lugia |
| Ho-Oh | `traditional_village/ecruteak` — Vila Ecruteak |
| Mew | `final_island` — Ilha Final |
| Arceus | `hall_of_origin` — Salão da Origem |
| Azelf / Mesprit / Uxie | `lake_valor` / `lake_verity` / `lake_acuity` — Lago Valor / Veracidade / Agudeza |
| Zacian / Zamazenta | `throneroom_of_knightly_heroes` — Sala do Trono dos Heróis |
| Reshiram / Zekrom | `dragonspiraltower` — Torre Espiral do Dragão |
| Kyurem | `kyuremcave` — Caverna de Kyurem |
| Calyrex | `crown_shrine` — Santuário da Coroa |
| Regigigas | `snowpoint_temple` — Templo de Snowpoint |
| ... | (mais 20+ monumentos) |

O mapa completo **espécie → monumento** vive no código do bot, em
`packages/cobblemon-data/src/labels.ts` (constante `LEGENDARY_MONUMENT_PT`).

---

## 3. Como os dados foram adicionados (pipeline)

```
[Servidor Minecraft]                    [VPS do bot]
jar + zip + jar  ──▶  staging/  ──▶  tar.gz  ──▶  importador  ──▶  snapshot.json  ──▶  build bot-api  ──▶  deploy
(Cobblemon/DT/LM)    (arquivos de   (transferência)   (pnpm data:import-cobblemon)   (data/generated/)   (docker compose)
                      spawn puros)
```

1. **Extração (servidor Minecraft):** descompactam-se apenas os arquivos de spawn
   (`spawn_pool_world/**/*.json`) do jar do Cobblemon e do datapack para uma pasta de
   staging. O servidor não é alterado — é leitura apenas.
2. **Transferência:** a pasta vai para a VPS do bot (tar.gz).
3. **Importação (VPS):** o importador normaliza tudo para o formato único
   `NormalizedSpawnEntry` (peso, nível, biomas, clima, fases da lua, presets, condições
   extras, mods requeridos/excluídos, origem) e gera `data/generated/bigmoncraft-spawn-snapshot.json`
   com hash de integridade canônico (`contentSha256`).
4. **Build/deploy:** o snapshot entra na imagem Docker do `bot-api` e o `/spawn`
   responde em memória (sem banco de dados envolvido na consulta).

### Normalizações feitas pelo importador

- `timeRange` / `moonPhase` / `weather` como string **ou** array (formato real do mod).
- Identificadores com condição no nome (ex.: `rayquaza min_perfect_ivs=3`) → espécie pura.
- Formas separadas por espaço (`articuno galarian`) → `pokemon + form`.
- Arquivos `enabled: false` ignorados; entradas sem `pokemon` puladas.
- Hash canônico com chaves ordenadas (não depende da ordem de serialização).

### Tradução para pt-BR

O snapshot guarda os valores **brutos** do jogo (`#cobblemon:is_ocean`,
`cobblemon:ruins/sol_henge_ruins`, `minecraft:monument`, `lugia_temple`...). A
tradução acontece **na hora de renderizar o embed**, em `labels.ts`:

- `humanizeBiomePt` — ~60 tags de bioma (ex.: `#cobblemon:is_ocean` → "Oceano").
- `humanizeStructurePt` / `humanizeBlockPt` — estruturas e blocos exigidos
  (`minecraft:monument` → "Monumento oceânico", `#minecraft:iron_ores` → "Minérios de ferro").
- `humanizeRarityPt` / `humanizePositionPt` / `humanizePresetPt` — raridade, onde
  aparece ("na pesca", "no chão") e presets ("em cavernas", "selvagem").
- `legendaryMonumentPt` — monumento do Legendary Monuments por espécie.

Entradas quase idênticas (mesmas condições, biomas diferentes) são **agrupadas** em
um único campo, com os biomas mesclados, para o embed não ficar repetitivo.

---

## 4. Como atualizar os dados

Regra geral: **sempre que o modpack do servidor Minecraft mudar (update de mod,
datapack novo), o snapshot precisa ser regenerado e o bot redeployado.**

### 4.1. Update do Cobblemon (ou qualquer mod com spawns)

1. No **servidor Minecraft**, extrair a base nova:

```bash
rm -rf /tmp/spawnpool && mkdir -p /tmp/spawnpool && cd /tmp/spawnpool
unzip -q "<caminho>/Cobblemon-fabric-<nova-versao>+<mc>.jar" "data/cobblemon/spawn_pool_world/*.json"
```

2. Empacotar e transferir para a **VPS do bot**:

```bash
tar czf /tmp/spawnpool-staging.tar.gz data
# scp/transferir o tar.gz para a VPS do bot
```

3. Na VPS, importar:

```bash
tar xzf spawnpool-staging.tar.gz -C /tmp/spawnpool
cd <repositorio-do-bot>
pnpm data:import-cobblemon --source /tmp/spawnpool \
  --output data/generated/bigmoncraft-spawn-snapshot.json \
  --server-id bigmoncraft \
  --cobblemon-version <nova-versao> \
  --force
```

### 4.2. Update do datapack do modpack

Idêntico ao Cobblemon, mas **extraindo o datapack por cima da base do Cobblemon**
(o datapack sobrescreve caminhos iguais — é o que garante spawns customizados):

```bash
unzip -q "<caminho>/Cobblemon-fabric-<versao>+<mc>.jar" "data/cobblemon/spawn_pool_world/*.json"
unzip -q "<caminho>/<datapack>.zip" \
  "data/*/spawn_pool_world/*.json" "data/*/spawn_pool_world/*/*.json" "data/*/spawn_pool_world/*/*/*.json" 2>/dev/null || true
tar czf /tmp/spawnpool-staging.tar.gz data
```

Depois: mesmo fluxo de importação da seção 4.1 (passos 2 e 3), ajustando
`--modpack-version`.

> Regra prática: qualquer mudança em `spawn_pool_world` (jar do Cobblemon, datapack
> ou outro mod que mexa em spawns) exige regenerar o snapshot.

### 4.3. Update do Legendary Monuments (monumentos)

O jar do mod tem duas coisas que podem mudar entre versões:

- **Quais Pokémon o mod assume** (novos lendários entram) → o datapack
  correspondente muda → basta regenerar o snapshot (4.1/4.2).
- **Nomes/IDs dos monumentos** → a constante `LEGENDARY_MONUMENT_PT` em
  `packages/cobblemon-data/src/labels.ts` precisa ser conferida e atualizada.

Para conferir os monumentos da versão nova do jar:

```bash
# no servidor Minecraft, extrair o jar novo
unzip -o -q <caminho>/legendarymonuments-fabric-<versao>.jar -d /tmp/lm

# 1) estruturas do mod (nomes dos NBTs):
ls /tmp/lm/data/legendarymonuments/structure/*.nbt

# 2) nomes de exibição (a tela de rastreamento do mod usa estes IDs):
grep -rEo "legendarymonuments:[a-z_]+" /tmp/lm/data/legendarymonuments/tags/worldgen/structure/*.json

# 3) relação estrutura → Pokémon (classe Java da tela de rastreamento):
#    com um decompilador/strings no class LegendaryTrackingScreen.class
```

Comparar com `LEGENDARY_MONUMENT_PT`: se um monumento novo aparecer ou o nome de
uma estrutura mudar, ajustar o mapa. O bot não lê o jar em runtime — o mapa é
**estático no código**, por isso a atualização é manual e pontual.

---

## 5. Publicar (qualquer atualização de dados)

Após gerar o snapshot novo no repositório da VPS:

```bash
cd <repositorio-do-bot>
sudo docker compose -p professor-carvalho \
  --project-directory <repositorio-do-bot> \
  -f deploy/compose.yaml -f deploy/compose.vps.yaml \
  build bot-api
sudo docker compose -p professor-carvalho \
  --project-directory <repositorio-do-bot> \
  -f deploy/compose.yaml -f deploy/compose.vps.yaml \
  up -d bot-api
```

> O snapshot fica em `data/generated/` (gitignored) e entra na imagem via `COPY`.
> Variáveis relevantes: `COBBLEMON_SNAPSHOT_PATH` (caminho do JSON) e
> `COBBLEMON_SNAPSHOT_REQUIRED=true` (o bot **não sobe** sem snapshot — falha
> ruidosa em vez de `/spawn` quebrado em silêncio).

---

## 6. Verificação funcional

1. Logs do `bot-api` devem conter:

```text
Snapshot de spawns carregado.
```

2. Testar no Discord:

- `/spawn charizard` → condições de spawn em pt-BR
- `/spawn kyogre` → dados do modpack (peso bônus, isca, biomas)
- `/spawn aegislash` → "Estruturas: Ruínas"
- `/spawn lugia` → "Monumento: Templo de Lugia"
- `/spawn Ho-Oh` → grafia com hífen resolve (match ignora hífen)

3. Saúde:

```bash
curl -s http://127.0.0.1:3080/health/live   # 200
curl -s http://127.0.0.1:3080/health/ready  # 200
```

---

## 7. Referências no repositório

| Arquivo | Papel |
| ------- | ----- |
| `packages/cobblemon-data/src/cli.ts` | CLI do importador (`pnpm data:import-cobblemon`) |
| `packages/cobblemon-data/src/importer.ts` | Lógica de extração/normalização dos arquivos de spawn |
| `packages/cobblemon-data/src/schema.ts` | Tipos do snapshot (`NormalizedSpawnEntry`, `SpawnSnapshot`) |
| `packages/cobblemon-data/src/labels.ts` | Traduções pt-BR + mapa `LEGENDARY_MONUMENT_PT` |
| `packages/cobblemon-data/src/store.ts` | Store em memória do snapshot (usada pelo `/spawn`) |
| `packages/discord-ui/src/commands/spawn.ts` | Comando `/spawn`, agrupamento e embed |
| `docs/spawn-snapshot-pt-BR.md` | Guia técnico de regeneração do snapshot |
| `docs/architecture.md` | Arquitetura dos dois servidores |
