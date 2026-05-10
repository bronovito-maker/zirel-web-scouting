#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

echo "=== Installazione Zirel su Termux ==="

echo "[1/4] Aggiornamento dei pacchetti di sistema..."
pkg update -y
pkg upgrade -y

echo "[2/4] Installazione di Node.js e Termux:API..."
pkg install -y nodejs termux-api jq git

echo "[3/4] Installazione delle dipendenze del progetto..."
# Entriamo nella directory in cui si trova lo script
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

if [ ! -f "package.json" ]; then
    echo "Errore: package.json non trovato in $PROJECT_DIR"
    exit 1
fi

npm install

echo "[4/5] Permessi esecuzione..."
chmod +x run_termux.sh

echo "[5/5] Installazione Widget (Scorciatoie Termux)..."
SHORTCUTS_DIR="$HOME/.shortcuts"
mkdir -p "$SHORTCUTS_DIR"
if [ -d "termux_shortcuts" ]; then
    cp termux_shortcuts/* "$SHORTCUTS_DIR/"
    chmod +x "$SHORTCUTS_DIR"/zirel-*
    echo "Scorciatoie copiate in $SHORTCUTS_DIR"
fi

echo "Installazione completata con successo!"
echo "Ora puoi lanciare l'app direttamente dalla tua home usando i widget Termux:"
echo "- zirel-run (per cercare)"
echo "- zirel-update (per aggiornare)"
