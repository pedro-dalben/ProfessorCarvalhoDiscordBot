#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
IMPORTER_VERSION="1.0.0"
DEFAULT_SOURCE="/opt/bigmoncraft"
DEFAULT_OUTPUT="./bigmoncraft-spawns-$(date +%Y%m%d-%H%M%S).json"
FORCE=false
SOURCE=""
OUTPUT=""
SERVER_ID="bigmoncraft"
COBBLEMON_VERSION=""
MODPACK_VERSION=""

usage() {
  cat << EOF
Uso: $SCRIPT_NAME [OPÇÕES]

Exporta dados de spawn do BigMonCraft para um snapshot JSON compatível
com o Professor Carvalho.

OPÇÕES:
  --source DIR           Diretório raiz do servidor Minecraft (padrão: $DEFAULT_SOURCE)
  --output FILE          Arquivo de saída do snapshot (padrão: ./bigmoncraft-spawns-YYYYMMDD-HHMMSS.json)
  --server-id ID         Identificador do servidor (padrão: $SERVER_ID)
  --cobblemon-version V  Versão do Cobblemon instalada (ex: 1.7.3)
  --modpack-version V    Versão do modpack (ex: 1.0.0)
  --force                Sobrescrever arquivo de saída se já existir
  -h, --help             Mostrar esta ajuda

EXEMPLO:
  $SCRIPT_NAME --source /opt/bigmoncraft --output ./snapshots/bigmoncraft-2026-08-05.json --force

SEGURANÇA:
  Este script NUNCA modifica os arquivos do servidor Minecraft.
  Ele apenas lê e gera um arquivo de saída separado.

  Após a geração, transfira o snapshot para o VPS do proxy via:
    scp snapshot.json usuario@proxy:/opt/professor-carvalho/data/bigmoncraft-spawns.json

  Sempre verifique o SHA-256 antes e depois da transferência:
    sha256sum snapshot.json
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source) SOURCE="$2"; shift 2 ;;
    --output) OUTPUT="$2"; shift 2 ;;
    --server-id) SERVER_ID="$2"; shift 2 ;;
    --cobblemon-version) COBBLEMON_VERSION="$2"; shift 2 ;;
    --modpack-version) MODPACK_VERSION="$2"; shift 2 ;;
    --force) FORCE=true; shift ;;
    -h|--help) usage ;;
    *) echo "Erro: argumento desconhecido: $1"; usage ;;
  esac
done

SOURCE="${SOURCE:-$DEFAULT_SOURCE}"
OUTPUT="${OUTPUT:-./bigmoncraft-spawns-$(date +%Y%m%d-%H%M%S).json}"

if [[ ! -d "$SOURCE" ]]; then
  echo "ERRO: Diretório de origem não encontrado: $SOURCE"
  echo "Certifique-se de que o servidor Minecraft está instalado neste caminho."
  exit 1
fi

if [[ -z "$SOURCE" || "$SOURCE" == "/" ]]; then
  echo "ERRO: O diretório de origem não pode ser vazio ou raiz."
  exit 1
fi

if [[ -f "$OUTPUT" && "$FORCE" != "true" ]]; then
  echo "ERRO: O arquivo de saída já existe: $OUTPUT"
  echo "Use --force para sobrescrever."
  exit 1
fi

echo "=== Exportação de dados de spawn do BigMonCraft ==="
echo "  Origem:   $SOURCE"
echo "  Destino:  $OUTPUT"
echo "  Servidor: $SERVER_ID"
echo "  Versão do importer: $IMPORTER_VERSION"
echo ""

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

SPAWN_FILES=()
while IFS= read -r -d '' file; do
  SPAWN_FILES+=("$file")
done < <(find "$SOURCE" -path "*/data/*/spawn_pool_world/*.json" -type f -print0 2>/dev/null || true)

if [[ ${#SPAWN_FILES[@]} -eq 0 ]]; then
  echo "ERRO: Nenhum arquivo de spawn pool encontrado em $SOURCE"
  echo "Verifique se o servidor contém dados do Cobblemon em data/<namespace>/spawn_pool_world/"
  exit 1
fi

echo "Encontrados ${#SPAWN_FILES[@]} arquivos de spawn pool."

STAGING_DIR="$TEMP_DIR/data"
for file in "${SPAWN_FILES[@]}"; do
  relative="${file#$SOURCE/}"
  dest="$STAGING_DIR/$relative"
  mkdir -p "$(dirname "$dest")"
  cp "$file" "$dest"
done

echo "Diretórios incluídos:"
find "$STAGING_DIR/data" -mindepth 1 -maxdepth 1 -type d | while read -r dir; do
  count="$(find "$dir" -name '*.json' | wc -l)"
  echo "  $(basename "$dir") ($count arquivos)"
done

echo ""
echo "Execute o importer no proxy para finalizar:"
echo "  pnpm data:import-cobblemon -- --source $STAGING_DIR --output $OUTPUT --server-id $SERVER_ID ${COBBLEMON_VERSION:+--cobblemon-version $COBBLEMON_VERSION} ${MODPACK_VERSION:+--modpack-version $MODPACK_VERSION} ${FORCE:+--force}"
echo ""

echo "SHA-256 do diretório de staging:"
find "$STAGING_DIR" -type f -name '*.json' -exec sha256sum {} \; | sort | sha256sum | awk '{print $1}'
