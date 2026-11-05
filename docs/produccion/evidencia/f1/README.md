# Evidencia de la Fase 1 — diagnóstico en vivo

Todo está hecho con **datos inventados** (semilla de 20 pacientes simulados del repositorio y clones con DNI ficticios) y con servidores de prueba cuyo `DATA_DIR` es una carpeta temporal. Nada se ejecutó sobre `server/db/store.json`. No hay claves escritas en los scripts: se leen del entorno.

| Carpeta | Qué contiene | Cómo se usa |
|---|---|---|
| `servidor/` | 4 scripts de API (autenticación, roles, red, Bundle, lote, límites, token falsificado) | `ADMIN_PASSWORD=… BASE=http://localhost:3230 node servidor/01_api_general.js` contra un servidor **nuevo**; después 02 y 03 (esperar 60 s entre el 01 y el 03). El 04 necesita un servidor de prueba arrancado con los valores de `.env.example`. |
| `cliente/` | Scripts Playwright (`tNN_*.js`), controles (`ctrl_*.js`) y salidas de texto (`out_*.txt`, con los identificadores de la semilla enmascarados) | `ADMIN_PASSWORD=… AUTH_SECRET=… cliente/srv.sh start`, luego `ADMIN_PASSWORD=… CLAVE_PRUEBA=… node cliente/t01_02.js` (y los demás). Sin capturas ni libros `.xlsx`: se regeneran con `gen_excel*.js` y los propios scripts. |
| `carga/` | Generador de carga (`tools/bench.js`), pruebas `t1`–`t4`, apagado (`killtest.js`), login (`loginburst.js`), crecimiento (`growth.js`) y los resultados medidos (`results.jsonl`, `t*_log.txt`) | `ADMIN_PASSWORD=… AUTH_SECRET=… carga/tools/t1.sh …` (ver la cabecera de cada script). Generador y servidor corren en la misma máquina por loopback. |

Variables: `ADMIN_PASSWORD` (la del servidor de prueba), `AUTH_SECRET` (32+ caracteres aleatorios), `CLAVE_PRUEBA` (10+ caracteres, para los usuarios de prueba que se crean). Los scripts de carga y de cliente esperan los puertos 3210 y 3220.
