#!/usr/bin/env bash
# Evidencia Fase 2 — ADMIN_RESET=true olvidado en el entorno revierte en cada reinicio la clave que el ADMIN cambió y cierra sus sesiones.
# Uso: ./03_admin_reset.sh   (usa claves aleatorias de prueba y una carpeta temporal; no toca server/db)
set -euo pipefail
cd "$(dirname "$0")"
export PORT=3242 DATA_DIR="$(mktemp -d)" AUTH_SECRET="$(openssl rand -hex 32)" ADMIN_PASSWORD="Reset-F2-$(openssl rand -hex 6)"
export EXTRA_ENV="ADMIN_RESET=true"
B=http://127.0.0.1:$PORT
login() { curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d "{\"username\":\"admin\",\"password\":\"$1\"}" $B/api/auth/login; }
token() { curl -s -H 'Content-Type: application/json' -d "{\"username\":\"admin\",\"password\":\"$1\"}" $B/api/auth/login | node -pe 'JSON.parse(require("fs").readFileSync(0)).token'; }
./srv.sh start >/dev/null
NUEVA="Cambiada-F2-$(openssl rand -hex 6)"
T=$(token "$ADMIN_PASSWORD")
echo "1) el ADMIN cambia su clave por la interfaz → $(curl -s -o /dev/null -w '%{http_code}' -X PATCH -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d "{\"password\":\"$NUEVA\"}" $B/api/users/admin)"
T2=$(token "$NUEVA"); echo "   login con la clave nueva → $(login "$NUEVA")"
./srv.sh stop >/dev/null; ./srv.sh start >/dev/null
echo "2) reinicio con ADMIN_RESET=true aún en el entorno:"
echo "   login con la clave nueva → $(login "$NUEVA") | con la clave del entorno → $(login "$ADMIN_PASSWORD")"
echo "   token emitido antes del reinicio → $(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $T2" $B/api/auth/me)"
grep -h "ADMIN_RESET\|restablecida" /tmp/f2srv-$PORT.log | sed 's/^/   registro: /'
./srv.sh stop >/dev/null
