#!/usr/bin/env bash
# Evidencia Fase 4b — regenera las salidas «después» (sufijo _despues) con el árbol actual. Un servidor nuevo, con carpeta temporal y claves al azar, por script. Uso: ./E_correr_despues.sh
set -u
RAIZ="$(cd "$(dirname "$0")/../../../.." && pwd)"
F3="$RAIZ/docs/produccion/evidencia/f3"; F4="$RAIZ/docs/produccion/evidencia/f4"
PORT=3281
correr() {  # correr <script> <archivo de salida o -> [env extra...]
  local script="$1" salida="$2"; shift 2
  export ADMIN_PASSWORD="Prueba-F4b-$(openssl rand -hex 6)" AUTH_SECRET="$(openssl rand -hex 32)" PORT=$PORT
  ( cd "$F4" && ./srv.sh start >/dev/null )
  echo "== $script (puerto $PORT)"
  if [ "$salida" = "-" ]; then
    ( cd "$F3" && env "$@" BASE="http://127.0.0.1:$PORT" timeout 900 node "$script" ) 2>&1 | sed -e "s#$ADMIN_PASSWORD#***#g" -e "s#$AUTH_SECRET#***#g" | tail -n 6
  else
    ( cd "$F3" && env "$@" BASE="http://127.0.0.1:$PORT" timeout 900 node "$script" ) 2>&1 | sed -e "s#$ADMIN_PASSWORD#***#g" -e "s#$AUTH_SECRET#***#g" > "$F3/$salida"
    tail -n 3 "$F3/$salida"
  fi
  ( cd "$F4" && ./srv.sh stop >/dev/null )
}
correr C2_fallecido_extremo_a_extremo.js out_C2_fallecido_extremo_a_extremo_despues.txt
correr C3_registro_clinico_navegador.js out_C3_registro_clinico_navegador_despues.txt
correr C4_fechas_lima_navegador.js out_C4_fechas_lima_navegador_despues.txt
correr D2_cliente_despues.js -   # D2 ya escribe out_D2_cliente_despues.txt
correr A2_sumideros_navegador.js - SALIDA_SUFIJO=_despues
correr A3_salida_datos_y_almacenamiento.js - SALIDA_SUFIJO=_despues
echo "== D3 (servidor propio)"
( cd "$F3" && timeout 1500 node D3_registro_clinico_despues.js > /dev/null 2>&1; echo "D3 exit=$?" )
tail -n 4 "$F3/out_D3_registro_clinico_despues.txt"
echo FIN
