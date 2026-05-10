#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$HOME/.lead_finder.env"

cd "$PROJECT_DIR"

if [[ ! -f package.json ]]; then
  echo "package.json non trovato in: $PROJECT_DIR"
  exit 1
fi

if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

# Funzione per richiedere input nativo su termux (se disponibile)
ask_input() {
  local title="$1"
  local default_val="$2"
  
  if command -v termux-dialog >/dev/null 2>&1; then
    local json
    json=$(termux-dialog text -t "$title" -i "$default_val")
    local val
    val=$(echo "$json" | jq -r '.text // empty')
    if [[ -n "$val" && "$val" != "null" ]]; then
      echo "$val"
      return
    fi
  fi
  
  # Fallback a terminale normale
  local ans
  read -p "$title [$default_val]: " ans
  echo "${ans:-$default_val}"
}

echo "=== Zirel Lead Engine (Termux Edition) ==="

if [[ -z "${GOOGLE_MAPS_API_KEY:-}" ]]; then
  echo "=> Configurazione Iniziale"
  MAPS_KEY_INPUT=$(ask_input "Inserisci GOOGLE_MAPS_API_KEY" "")
  if [[ -z "$MAPS_KEY_INPUT" ]]; then
    echo "Errore: GOOGLE_MAPS_API_KEY mancante. Ricerca impossibile."
    exit 1
  fi
  printf "GOOGLE_MAPS_API_KEY=%s\n" "$MAPS_KEY_INPUT" > "$CONFIG_FILE"
  chmod 600 "$CONFIG_FILE"
  export GOOGLE_MAPS_API_KEY="$MAPS_KEY_INPUT"
fi

CITY=$(ask_input "Città (es. Rimini)" "Rimini")
KEYWORD=$(ask_input "Keyword (es. B&B, dentista)" "B&B")
MAX_RESULTS=$(ask_input "Max risultati" "40")
MAPS_DEPTH=$(ask_input "Maps depth (fast/deep)" "deep")
AI_ENRICH=$(ask_input "AI enrich con Gemini? (y/n)" "y")
ZIREL_ONLY=$(ask_input "Modalità Zirel-only? (y/n)" "y")

if [[ "$AI_ENRICH" == "y" || "$AI_ENRICH" == "Y" ]]; then
  if [[ -z "${GEMINI_API_KEY:-}" ]]; then
    GEMINI_KEY_INPUT=$(ask_input "Inserisci GEMINI_API_KEY (opzionale)" "")
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

echo "Avvio ricerca in corso (su Termux)..."

CMD=(npm run dev -- --mode hybrid --city "$CITY" --keyword "$KEYWORD" --max-results "$MAX_RESULTS" --maps-depth "$MAPS_DEPTH")
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

# Passaggio dei parametri completi
"${CMD[@]}"

echo
echo "Completato. Puoi consultare i risultati nella cartella src/output/ o dist/output/."
