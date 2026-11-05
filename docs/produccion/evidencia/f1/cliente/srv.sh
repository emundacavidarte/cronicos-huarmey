#!/bin/bash
# Control del SERVIDOR DE PRUEBA (puerto 3210) por PID guardado. Nunca usa pkill/killall.
# Requiere en el entorno: ADMIN_PASSWORD y AUTH_SECRET (32+ caracteres). Opcional: REPO (raíz del repo), WORK_DIR.
set -e
REPO=${REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}
W=${WORK_DIR:-$(cd "$(dirname "$0")" && pwd)}
case "$1" in
 start)
  : "${ADMIN_PASSWORD:?defina ADMIN_PASSWORD}" "${AUTH_SECRET:?defina AUTH_SECRET}"
  mkdir -p "$W/data"; cd "$REPO"
  DATA_DIR=$W/data PORT=3210 NODE_ENV=development ADMIN_USER=admin nohup node server/server.js >> "$W/server.log" 2>&1 &
  echo $! > "$W/srv.pid"
  for i in $(seq 1 30); do sleep 0.4; curl -s -m 1 localhost:3210/health >/dev/null && echo "up pid $(cat "$W/srv.pid")" && exit 0; done; echo "no levanto"; exit 1;;
 stop)
  P=$(cat "$W/srv.pid"); kill "$P" 2>/dev/null || true; sleep 0.8; curl -s -m 1 localhost:3210/health >/dev/null && echo "sigue arriba" || echo down;;
 restore)
  cp "$W/store.seed.json" "$W/data/store.json"; rm -f "$W/data/store.json.bak"; echo restored;;
esac
