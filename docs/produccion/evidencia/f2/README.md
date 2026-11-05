# Evidencia de la Fase 2 — seguridad y privacidad del servidor

Todo con datos inventados (DNI `95…`, `96…`, `97…` y la semilla `pac-sim-…` de 20 pacientes simulados). Ningún script toca `server/db/`: el servidor de prueba usa una carpeta temporal (`DATA_DIR`). Ningún script lleva claves escritas: `ADMIN_PASSWORD` y `AUTH_SECRET` se leen del entorno.

| Archivo | Qué hace | Salidas |
|---|---|---|
| `srv.sh` | Levanta o detiene un servidor de prueba en producción con carpeta temporal | — |
| `01_explotacion.js` | 16 hipótesis contra la API (H-01 a H-16): escritura cruzada de red, oráculo de existencia, ETag, cuerpo grande sin sesión, claves heredadas, validación, errores, asignación masiva, sector, establecimiento, prototipos, bitácora, permisos de archivo, CORS, CSP, límite de tasa | `out_01_antes.txt`, `out_01_despues.txt` |
| `02_bitacora_borrado.js` | Un actor sin sesión intenta vaciar la bitácora con inicios de sesión fallidos | `out_02_antes.txt`, `out_02_despues.txt` |
| `03_admin_reset.sh` | `ADMIN_RESET=true` olvidado en el entorno y un reinicio | `out_03_antes.txt`, `out_03_despues.txt` |
| `04_csp_navegador.js` | En Chromium: qué alcanza a hacer un script inyectado con la CSP del servidor | `out_04_antes.txt`, `out_04_despues.txt` |
| `05_humo_cliente.js` | En Chromium, con el cliente real: login, importación Excel, Registro Clínico, violaciones de CSP y el XSS del diagnóstico (C-01) en la ficha | `out_05_humo_cliente.txt` (solo después) |

«Antes» = código de `c512a44` (cierre de la Fase 1). «Después» = código con las correcciones de la Fase 2.
`out_01_antes.txt` se generó con la versión del script que solo probaba `/fhir/auth/login` en H-16; la versión actual agrega la línea de `/api/auth/login` (en el código corregido `/fhir/auth/login` ya no existe).

## Cómo repetir

```bash
cd docs/produccion/evidencia/f2
export ADMIN_PASSWORD="Prueba-F2-$(openssl rand -hex 6)" AUTH_SECRET="$(openssl rand -hex 32)" PORT=3240 DATA_DIR=$(mktemp -d)
./srv.sh start
BASE=http://127.0.0.1:3240 node 01_explotacion.js
./srv.sh stop
```

- `02`: servidor nuevo; `node 02_bitacora_borrado.js 5100 /fhir/auth/login` (antes) o `300 /api/auth/login` (después).
- `03`: `./03_admin_reset.sh` (levanta y detiene su propio servidor en el puerto 3242).
- `04` y `05`: servidor nuevo sin `DATA_DIR` (carga la semilla) y `BASE=… node 04_csp_navegador.js` / `node 05_humo_cliente.js`. Usan el Chromium de Playwright.

La prueba automática equivalente, que corre con `npm test`, es `server/tests/testSeguridadF2.js` (37 comprobaciones).
