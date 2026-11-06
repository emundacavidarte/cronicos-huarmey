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
| `D2_cliente_despues.js` | **Después de la Fase 4b:** K3-03 (la fecha del WhatsApp es la de la cita; sin cita o fallecido no hay enlace), C3-06, T3-05, HOSIX `observados` y C3-05 | `out_D2_cliente_despues.txt` |
| `D3_registro_clinico_despues.js` | **Después de la Fase 4b:** el Registro Clínico real (P3-01 a P3-14, K3-01, K3-04, T3-04, T3-05) contra el servidor real, con el navegador en UTC y en hora de Lima y el reloj fijado a las 23:30 de Lima. Levanta su propio servidor (puerto 3275). Sale con código 0 si todo pasa | `out_D3_registro_clinico_antes.txt` (corrido contra el commit base `2d7f98f`) y `out_D3_registro_clinico_despues.txt` |
| `E_correr_despues.sh` | Regenera las salidas `*_despues.txt` de `C2`, `C3`, `C4`, `D2`, `A2`, `A3` y `D3` con el árbol actual (un servidor nuevo por script) | — |
| `out_*_despues.txt` | Las mismas corridas de `C1`, `C2`, `C3`, `C4`, `A2` y `A3` **después** de corregir; las `out_*` sin sufijo son el «antes» y no se tocan | — |
| `out_testClienteF3_antes.txt`, `out_testClienteF3_despues.txt` | La suite `testClienteF3.js` contra el código sin corregir (39 de 49 casos fallaban) y corregido | — |
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

**Después de la Fase 4b:** `./E_correr_despues.sh` regenera todo (tarda unos 20 minutos por los navegadores).

**Lo que depende de la hora:** las sondas de fechas (`C1` sección A, `C4`) se ven distintas en UTC y en Lima, y la propuesta de próxima cita (`C3`) cambia después de las 19:00 en Lima.
