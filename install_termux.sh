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

echo "[4/4] Permessi esecuzione..."
chmod +x run_termux.sh

echo "Installazione completata con successo!"
echo "Ora puoi eseguire: ./run_termux.sh"
