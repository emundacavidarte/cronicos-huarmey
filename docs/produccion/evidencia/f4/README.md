# Evidencia de la Fase 4 — correcciones

Solo datos inventados (DNI `96…`) y la semilla de 20 pacientes simulados. El servidor de prueba usa una carpeta temporal. Las claves se leen del entorno (`ADMIN_PASSWORD`, `AUTH_SECRET`).

| Archivo | Qué comprueba | Salida |
|---|---|---|
| `srv.sh` | Levanta o detiene un servidor de prueba en producción | — |
| `01_acciones_navegador.js` | Con la CSP estricta (`script-src 'self'`), 32 acciones reales de la interfaz con su efecto, en escritorio y móvil, sin violaciones de la CSP ni errores de página | `out_01_acciones_navegador.txt` |
| `../f2/04_csp_navegador.js` | Lo que alcanza un script inyectado: el manejador en línea queda bloqueado | `out_02_csp_navegador.txt` |
| `03_cliente_navegador.js` | C-02, C-03, C-04, C-07, C-08, C-10, C-12, C-13, C-14, «Sin documento» y el cierre por inactividad | `out_03_cliente_navegador.txt` |
| (curl, ver el informe) | Tamaño de los estáticos con y sin gzip, 304 y recorrido de rutas (S-08) | `out_04_gzip_estaticos.txt` |
| `05_pwa.js` | Instalabilidad de la PWA y tamaño real de los íconos | `out_05_pwa.txt` |

Las pruebas automáticas equivalentes corren con `npm test`: `server/tests/testCorreccionesF4.js` y `server/tests/testPersistenciaF4.js` (y el paso F2-17 de `testSeguridadF2.js` para la CSP).

## Cómo repetir

```bash
cd docs/produccion/evidencia/f4
export ADMIN_PASSWORD="Prueba-F4-$(openssl rand -hex 6)" AUTH_SECRET="$(openssl rand -hex 32)" PORT=3251
./srv.sh start
BASE=http://127.0.0.1:3251 node 03_cliente_navegador.js
./srv.sh stop
```

Los scripts de navegador usan el Chromium de Playwright. Sin `DATA_DIR` el servidor carga la semilla.
