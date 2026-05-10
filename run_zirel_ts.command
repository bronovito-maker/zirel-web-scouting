#!/bin/zsh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$HOME/.lead_finder.env"

cd "$PROJECT_DIR"

if [[ ! -f package.json ]]; then
  echo "package.json non trovato in: $PROJECT_DIR"
  read -r "?Premi INVIO per chiudere... "
  exit 1
fi

if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

if [[ -z "${GOOGLE_MAPS_API_KEY:-}" ]]; then
  read -r "?Inserisci GOOGLE_MAPS_API_KEY (salvata una sola volta): " MAPS_KEY_INPUT
  if [[ -z "$MAPS_KEY_INPUT" ]]; then
    echo "GOOGLE_MAPS_API_KEY mancante."
    read -r "?Premi INVIO per chiudere... "
    exit 1
  fi
  printf "GOOGLE_MAPS_API_KEY=%s\n" "$MAPS_KEY_INPUT" > "$CONFIG_FILE"
  chmod 600 "$CONFIG_FILE"
  export GOOGLE_MAPS_API_KEY="$MAPS_KEY_INPUT"
fi

echo "=== Zirel Lead Engine (TS) ==="
read -r "?Citta (es. Riccione): " CITY
read -r "?Keyword (es. B&B, estetista, dentista): " KEYWORD
read -r "?Max risultati (default: 40): " MAX_RESULTS
read -r "?Maps depth fast/deep (default: deep): " MAPS_DEPTH
read -r "?AI enrich con Gemini? (y/n, default: y): " AI_ENRICH
read -r "?Modalita Zirel-only (y/n, default: y): " ZIREL_ONLY

CITY="${CITY:-Riccione}"
KEYWORD="${KEYWORD:-B&B}"
MAX_RESULTS="${MAX_RESULTS:-40}"
MAPS_DEPTH="${MAPS_DEPTH:-deep}"
AI_ENRICH="${AI_ENRICH:-y}"
ZIREL_ONLY="${ZIREL_ONLY:-y}"

if [[ "$AI_ENRICH" == "y" || "$AI_ENRICH" == "Y" ]]; then
  if [[ -z "${GEMINI_API_KEY:-}" ]]; then
    read -r "?Inserisci GEMINI_API_KEY (salvata una sola volta, opzionale): " GEMINI_KEY_INPUT
    if [[ -n "$GEMINI_KEY_INPUT" ]]; then
      {
        grep -v '^GEMINI_API_KEY=' "$CONFIG_FILE" 2>/dev/null || true
        printf "GEMINI_API_KEY=%s\n" "$GEMINI_KEY_INPUT"
      } > "$CONFIG_FILE.tmp"
      mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
      chmod 600 "$CONFIG_FILE"
      export GEMINI_API_KEY="$GEMINI_KEY_INPUT"
    fi
  fi
fi

echo
echo "[1/3] Verifica TypeScript..."
npm run check

echo
echo "[2/3] Build..."
npm run build

echo
echo "[3/3] Run scouting..."
CMD=(node dist/cli.js --mode hybrid --city "$CITY" --keyword "$KEYWORD" --max-results "$MAX_RESULTS" --maps-depth "$MAPS_DEPTH")
if [[ "$ZIREL_ONLY" == "y" || "$ZIREL_ONLY" == "Y" ]]; then
  CMD+=(--zirel-only)
fi
if [[ "$AI_ENRICH" == "y" || "$AI_ENRICH" == "Y" ]]; then
  if [[ -n "${GEMINI_API_KEY:-}" ]]; then
    CMD+=(--ai-enrich --ai-model gemini-1.5-flash --ai-max 20)
  else
    echo "Gemini key assente: continuo senza AI enrich."
  fi
fi

"${CMD[@]}"

echo
echo "Completato."
read -r "?Premi INVIO per chiudere... "
