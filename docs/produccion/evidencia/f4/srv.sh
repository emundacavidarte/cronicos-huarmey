#!/usr/bin/env bash
# Evidencia Fase 4 — levanta un servidor de prueba en producción con DATA_DIR temporal (nunca server/db).
# Uso: ADMIN_PASSWORD=<clave de prueba> AUTH_SECRET=<32+ caracteres> PORT=3240 ./srv.sh start|stop
# Variables opcionales: DATA_DIR (si no, se crea una carpeta temporal), EXTRA_ENV (p. ej. "ADMIN_RESET=true").
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../../../.." && pwd)"
PORT="${PORT:-3240}"
PIDF="/tmp/f4srv-$PORT.pid"
case "${1:-}" in
  start)
    : "${ADMIN_PASSWORD:?Defina ADMIN_PASSWORD}"; : "${AUTH_SECRET:?Defina AUTH_SECRET}"
    DATA_DIR="${DATA_DIR:-$(mktemp -d)}"
    env ${EXTRA_ENV:-} DATA_DIR="$DATA_DIR" PORT="$PORT" NODE_ENV=production ADMIN_USER=admin \
      node "$RAIZ/server/server.js" > "/tmp/f4srv-$PORT.log" 2>&1 &
    echo $! > "$PIDF"
    for i in $(seq 1 50); do curl -s "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break; sleep 0.2; done
    echo "servidor en :$PORT pid $(cat "$PIDF") DATA_DIR=$DATA_DIR log=/tmp/f4srv-$PORT.log" ;;
  stop)
    [ -f "$PIDF" ] && kill "$(cat "$PIDF")" 2>/dev/null || true; rm -f "$PIDF"; sleep 0.5; echo detenido ;;
  *) echo "uso: $0 start|stop"; exit 2 ;;
esac
