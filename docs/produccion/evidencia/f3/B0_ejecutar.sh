#!/usr/bin/env bash
# Evidencia Fase 3 — corre cada script indicado contra un servidor NUEVO en el puerto 3262 (producción, carpeta de datos temporal,
# semilla de 20 pacientes simulados). Genera ADMIN_PASSWORD, AUTH_SECRET y CLAVE_USUARIOS al azar en cada corrida: no se escriben en archivos
# y se reemplazan por *** en las salidas. Uso: WORK=<carpeta temporal> ./B0_ejecutar.sh B1_precarga_http.js [B2_precarga_navegador.js ...]
set -uo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../../../.." && pwd)"
PORT="${PORT:-3262}"
WORK="${WORK:?Defina WORK (carpeta temporal fuera del repositorio)}"
mkdir -p "$WORK"
for script in "$@"; do
  nombre="$(basename "$script" .js)"
  export ADMIN_PASSWORD="Prueba-F3-$(openssl rand -hex 8)" AUTH_SECRET="$(openssl rand -hex 32)" CLAVE_USUARIOS="Usr-F3-$(openssl rand -hex 8)"
  DATA="$WORK/datos-$nombre"; rm -rf "$DATA"; mkdir -p "$DATA"
  env DATA_DIR="$DATA" PORT="$PORT" NODE_ENV=production ADMIN_USER=admin node "$RAIZ/server/server.js" > "$WORK/srv-$nombre.log" 2>&1 &
  PID=$!
  for i in $(seq 1 60); do curl -s "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break; sleep 0.2; done
  echo "== $nombre · servidor :$PORT pid $PID · semilla: $(find "$DATA" -maxdepth 1 -name store.json | wc -l) store.json" >&2
  ( cd "$AQUI" && BASE="http://127.0.0.1:$PORT" EVIDENCIA="$AQUI" node "$script" ) 2>&1 \
    | sed -e "s#$ADMIN_PASSWORD#***#g" -e "s#$AUTH_SECRET#***#g" -e "s#$CLAVE_USUARIOS#***#g" > "$AQUI/out_$nombre.txt"
  kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null
  sed -e "s#$ADMIN_PASSWORD#***#g" -e "s#$AUTH_SECRET#***#g" "$WORK/srv-$nombre.log" | tail -5 >&2
done
echo "servidor detenido" >&2
