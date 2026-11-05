# Evidencia de la Fase 3 — lógica clínica y auditoría del cliente

Solo datos inventados (DNI `96…`) y la semilla de 20 pacientes simulados. Todos los servidores de prueba usan una carpeta temporal y **nunca `server/db/`**. Las claves salen del entorno o se generan al azar en cada corrida, y las salidas no las contienen (se reemplazan por `***`).

| Archivo | Qué comprueba | Salida |
|---|---|---|
| `C1_motor_clinico_sondas.js` | Sondas del motor clínico sin servidor (`semaforo.js`, `heartsEngine.js`, `padronCalculadora.js`, `indicadoresConvenio.js`, `whatsappNotifier.js`, `hosixParser.js`). Cada caso declara su base y sale como `OK`, `DISCREPA` o `PREGUNTA` (criterio clínico) | `out_C1_motor_clinico_lima.txt` y `out_C1_motor_clinico_utc.txt` |
| `C2_fallecido_extremo_a_extremo.js` | Un paciente con `estado_paciente="Fallecido"` (lo que envía la interfaz) sigue contando como desertor (K3-02) | `out_C2_fallecido_extremo_a_extremo.txt` |
| `C3_registro_clinico_navegador.js` | El Registro Clínico real: qué estado de control y qué próxima cita guarda, y qué fecha dice el aviso de WhatsApp (K3-01, K3-03, K3-04, T3-04) | `out_C3_registro_clinico_navegador.txt` |
| `C4_fechas_lima_navegador.js` | El panel «en vivo» con el navegador en hora de Lima: una cita de hoy sale «Vencida hace 1 día» (T3-01) | `out_C4_fechas_lima_navegador.txt` |
| `A1_sumideros_estatico.txt` | Inventario estático de los 62 sumideros de HTML con archivo:línea y veredicto, `acciones.js`, quién escribe cada dato y los hallazgos C3-xx | — |
| `A2_sumideros_navegador.js` | Reproducción en Chromium de cada sumidero con datos hostiles por la vía real del servidor, en memoria y con un Excel y un CSV hostiles | `out_A2_sumideros_navegador.txt` |
| `A3_salida_datos_y_almacenamiento.js` | Hosts externos contactados, `localStorage`, `sessionStorage`, IndexedDB, caché y lo que queda tras «Cerrar sesión» | `out_A3_salida_datos_y_almacenamiento.txt`, `out_A3_tras_cerrar_sesion.png` |
| `B0_comun.js`, `B0_ui.js`, `B0_ejecutar.sh` | Utilidades y lanzador de los scripts B (servidor nuevo en el puerto 3262, claves al azar) | — |
| `B1_precarga_http.js` | Matriz rol × red × documento por HTTP, oráculo de existencia, tiempos, tokens inválidos y escrituras fuera del alcance | `out_B1_precarga_http.txt` |
| `B2_precarga_navegador.js` | La precarga por documento en el Registro Clínico real, por rol, red y establecimiento | `out_B2_precarga_navegador.txt`, `B2_*.png` |
| `B3_antes_despues.js` | Guardar una atención **sin tocar nada** y comparar al paciente en el servidor antes y después (valores por defecto, P3-01 a P3-10) | `out_B3_antes_despues.txt`, `B3_valores_por_defecto.txt` |

## Cómo repetir

Los scripts `C2`, `C3`, `C4` y `A2`, `A3` necesitan un servidor de prueba (el de la Fase 4):

```bash
cd docs/produccion/evidencia/f4
export ADMIN_PASSWORD="Prueba-F3-$(openssl rand -hex 6)" AUTH_SECRET="$(openssl rand -hex 32)" PORT=3263
./srv.sh start
cd ../f3
BASE=http://127.0.0.1:3263 node C2_fallecido_extremo_a_extremo.js
BASE=http://127.0.0.1:3263 node C3_registro_clinico_navegador.js
BASE=http://127.0.0.1:3263 node C4_fechas_lima_navegador.js
cd ../f4 && ./srv.sh stop
```

Las sondas `C1` no usan servidor. Se corren en las dos zonas horarias para ver qué cambia:

```bash
cd docs/produccion/evidencia/f3
TZ=America/Lima node C1_motor_clinico_sondas.js
TZ=UTC node C1_motor_clinico_sondas.js
```

Los scripts `B1`, `B2` y `B3` los lanza `B0_ejecutar.sh`, que levanta su propio servidor y escribe las salidas aquí:

```bash
cd docs/produccion/evidencia/f3
WORK="$(mktemp -d)" ./B0_ejecutar.sh B1_precarga_http.js B2_precarga_navegador.js B3_antes_despues.js
```

`A2` y `A3` se corren a mano con `BASE=http://127.0.0.1:<puerto> ADMIN_PASSWORD=<clave> node A2_sumideros_navegador.js` (ver el encabezado de cada uno).

**Lo que depende de la hora:** las sondas de fechas (`C1` sección A, `C4`) se ven distintas en UTC y en Lima, y la propuesta de próxima cita (`C3`) cambia después de las 19:00 en Lima.
