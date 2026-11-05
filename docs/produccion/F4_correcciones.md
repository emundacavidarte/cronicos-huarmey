# Fase 4 — Correcciones

**Fecha:** 05/11/2026 · **Rama:** `claude/pensive-cray-3lwodm` · **Base:** `f38fa1f` (cierre de la Fase 2) · **Entorno:** Node 22.23.4, Chromium con Playwright · **Datos:** inventados y la semilla de 20 pacientes simulados; nada se ejecutó sobre `server/db/`.

**Instrucción de Edward:** «Corrige todo». Se corrigió lo que había quedado abierto al cerrar la Fase 2: la CSP con scripts en línea, el cifrado en reposo y los pendientes del cliente. También se corrigieron los hallazgos de la Fase 1 que seguían abiertos: cliente, persistencia e instalación.

Donde hacía falta una decisión de Edward, se aplicó la opción **más segura y reversible**; queda marcada en la sección 5 para que la confirme o la cambie.

Regla de evidencia: cada corrección tiene una prueba que falla antes y pasa después (`npm test`) o una verificación en Chromium contra el servidor real. Lo que solo se verificó leyendo el código se dice.

## 1. Resultado

- **`npm test`: 283 correctas, 0 con falla** (21 suites). Al cerrar la Fase 2 eran 263. Las suites nuevas son `testCorreccionesF4.js` (10) y `testPersistenciaF4.js` (9). Antes de corregir fallaban 6 de 8 y 8 de 8 de sus casos (medido antes de agregar las pruebas de gzip, de `STORE_KEY` y de restauración).
- **Chromium** con el servidor corregido:
  - 32 de 32 acciones de la interfaz funcionan con la CSP estricta.
  - 19 de 19 comprobaciones de los hallazgos del cliente.
  - 0 violaciones de la CSP, 0 errores de página y 0 errores de instalabilidad de la PWA.
- **Seguridad del cliente:**
  - La CSP ya no permite scripts en línea (`script-src 'self'`).
  - Un manejador `onerror` inyectado **queda bloqueado** (antes se ejecutaba: F2-17 cerrado del todo).
- **De los 38 hallazgos de la Fase 1:** 31 corregidos, 2 en parte, 1 aceptado (L-09) y 4 pendientes:
  - En parte: S-09 (hay respaldo diario en el disco, falta la copia fuera del servidor) y L-06 (la bitácora ya no se vacía, falta definir su retención).
  - Pendientes: L-05, L-07, L-08 y L-10, que son de capacidad o de plataforma (sección 4).
- **Hallazgos nuevos:** 3 errores encontrados y corregidos al trabajar (sección 3).

## 2. Qué se corrigió

### 2.1 Seguridad del cliente (cierra F2-17)

| Antes | Después | Evidencia |
|---|---|---|
| 69 manejadores en línea (`onclick`/`onchange`): 48 en `index.html` y 21 en el HTML que arman `main.js` y `mapManager.js`. Algunos metían `p.id` y `p.dni` dentro de JavaScript | `data-accion` y `data-cambio`, con un solo listener delegado en captura (`client/js/ui/acciones.js`) y una **lista cerrada** de acciones. Los argumentos van escapados en atributos | Prueba estática en `testSeguridadF2.js`: detecta 67 en el código anterior y 0 ahora. 32 de 32 acciones en Chromium |
| `script-src 'self' 'unsafe-inline'` | `script-src 'self'` | `out_02_csp_navegador.txt`: `script-src-attr → inline` bloqueado |
| Un `<script>` en línea borraba en cada carga la caché del service worker (causa de C-02) | Quitado | C-02 abajo |

### 2.2 Cliente (hallazgos de la Fase 1 y pendientes de la Fase 2)

| ID | Corrección | Evidencia |
|---|---|---|
| C-02 | La caché ya no se borra (43 → 43 entradas). Sin internet, la página abre desde la caché (HTTP 200) y avisa «Sin conexión a internet… se reintentará al volver la conexión». No descarta la sesión. **No guarda datos de pacientes en el equipo** (0 respuestas de `/api` en caché) | Chromium (03) |
| C-03 | El tablero del DIRECTOR muestra los totales de su red (22 = servidor 22). Lo que necesita datos de cada paciente dice «no disponible», no 0 | Chromium (03) |
| C-04 | Al salir se limpian el tablero y los indicadores (`—`, 0 filas) | Chromium (03) |
| C-05 | Las fechas imposibles (31/02/1960, 2026-02-30) y los números con texto («12abc», «150<img>») se rechazan | `testCorreccionesF4.js` |
| C-06 | La edad es la cumplida, también con la zona horaria de Lima. Antes la importación restaba años, y `calcularEdad` corría el nacimiento un día | `testCorreccionesF4.js` (con `TZ=America/Lima`) |
| C-07 | Al importar, avisa cuántos pacientes no se pudieron ubicar en el mapa y quiénes son | Chromium (03) |
| C-08 | Antes de cargar avisa qué documentos ya están en el padrón y se actualizarán; si se cancela, no se envía nada | Chromium (03) y `testCorreccionesF4.js` |
| C-08 | **Además:** los diagnósticos se acumulan en el servidor, y Registro Clínico ya envía la dislipidemia | Ver hallazgo nuevo F4-02 |
| C-09 | El exportador escribe el sexo como «Femenino»/«Masculino» y no exporta «0» meses de medicación. El importador acepta cualquier establecimiento del catálogo con su código (por ejemplo, P. S. Culebras) | `testCorreccionesF4.js`: la semilla exportada se reimporta sin errores |
| C-09 (consentimiento) | **No se tocó a propósito:** el consentimiento sigue obligatorio al importar (requisito A12; hay una prueba existente que lo exige). Si el paciente aún no lo tiene, la cuadrícula lo pide al reimportar | `testPadronExcel.js` |
| C-10 | En un móvil de 390 px: encabezado en dos filas (cabe en 390), buscador visible (x 10-380), «Cerrar sesión» dentro de la pantalla y panel de pacientes de 8 a 382 | Chromium (03) |
| C-12 | Los avisos muestran el nombre tal cual (antes `&amp;` y `&#39;`) | Chromium (03) |
| C-13 | El DIRECTOR no ve «Exportar Padrón Excel» | Chromium (03) |
| C-14 | Vista inicial con todos los pacientes ubicados (20 de 20; antes 3); se puede ampliar con los dedos (sin `user-scalable=no`); aviso «Su sesión venció» al recargar; avisos y controles del mapa por encima de la barra inferior; botones de cierre visibles | Chromium (03) |
| C-11 = S-08 | Ver 2.3 | — |
| F2 | El carné de extranjería y el pasaporte conservan sus letras | `testCorreccionesF4.js` |
| F2 | **Documento obligatorio (decisión de Edward, 05/11/2026):** no se registran pacientes sin documento. Se quitó «Sin documento» de la lista, del formulario de Registro Clínico y de la plantilla. La cuadrícula marca esa fila y deshabilita «Cargar», y el servidor rechaza toda fila sin número de documento, aunque traiga id. Antes todos esos pacientes compartían el id `pac-00001741-` | `testCorreccionesF4.js` y Chromium (03) |
| F2 | «No registrado» en vez de mostrar SIS cuando no hay seguro | Lectura |
| F2 | Mensaje de la pre-cita cuando el servidor responde 404 | Lectura |
| F2 | El comentario de la pre-cita ya no lleva nombre ni DNI | Lectura |
| F2 | Cierre de sesión tras 30 minutos sin uso (`INACTIVIDAD_MINUTOS` en `config.js`) | Chromium (03, con reloj simulado) |
| F1 (observación) | El CSV de pre-citas marca `NO_GUARDADA_EN_SERVIDOR` las que no llegaron al servidor | Lectura |
| PWA | Íconos reales de 192 y 512 px (antes un PNG de 390×320 declarado con los dos tamaños) | `out_05_pwa.txt`: 0 errores de instalabilidad |

### 2.3 Servidor, persistencia e instalación

| ID | Corrección | Evidencia |
|---|---|---|
| L-04 | El guardado diferido espera como máximo 2 s desde la primera escritura pendiente. Antes, en una ráfaga continua, no se guardaba nada | `testPersistenciaF4.js` |
| S-14 | Un solo formato compacto, también en el guardado del apagado | `testPersistenciaF4.js` |
| — | Transacciones todo o nada: si algo falla a mitad de un lote, se vuelve al estado anterior | `testPersistenciaF4.js` |
| S-09 (local) | Antes del primer guardado de cada día se copia el `store.json` vigente en `DATA_DIR/respaldos/respaldo-AAAA-MM-DD.json`, con permisos 600. Se conservan los últimos `RESPALDOS_DIARIOS` (14 por defecto) | `testPersistenciaF4.js` |
| S-09 (restauración) | **Prueba de restauración**, con y sin cifrado: con el servidor detenido, copiar el respaldo sobre `store.json` deja los datos como estaban antes del error | `testPersistenciaF4.js` |
| F2-18 | **Cifrado en reposo OPCIONAL** con `STORE_KEY` (32 bytes, AES-256-GCM) para `store.json`, `.bak` y los respaldos. Ver el detalle debajo de la tabla | `testPersistenciaF4.js` (5 casos) |
| S-15 | Las pruebas usan una carpeta temporal: `npm test` ya no crea `server/db/store.json` | Verificado después de `npm test` |
| S-08 = C-11 | Los estáticos de texto salen con gzip, con ETag y 304, comprimidos una sola vez y guardados en memoria. Ver las cifras debajo de la tabla | `out_04_gzip_estaticos.txt` y `testCorreccionesF4.js` |
| S-10 | La raíz ya no declara dependencias propias. `npm install` y `npm run build` instalan el servidor con `npm ci` y su lockfile; `npm ci` en la raíz ya funciona. Node 22 fijado (`.node-version`, `engines`) | Instalación probada en una carpeta limpia |
| L-11 | Se quitaron de los comentarios y del arranque las cifras de capacidad sin sustento («1,000+ usuarios», «>10,000 pacientes») | Lectura |
| — | README actualizado: build, Node 22, `DATA_DIR`, respaldos, `STORE_KEY` y `CORS_ORIGINS` | — |

**Cifrado en reposo (F2-18):**
- Sin la clave, o con otra, el servidor no arranca: da un mensaje claro y **no toca** el archivo.
- Un archivo sin cifrar se lee y queda cifrado en el siguiente guardado.
- Una clave mal formada detiene el arranque con una sola línea.

**Gzip de estáticos (S-08):**

| Archivo | Antes | Con gzip |
|---|---|---|
| `georisDataBundle.js` | 3 031 785 B | 676 074 B |
| `huarmeyCadastreBundle.js` | 2 154 815 B | 270 226 B |
| `xlsx.full.min.js` | 944 491 B | 332 846 B |

## 3. Hallazgos nuevos encontrados al corregir

| ID | Sev. | Hallazgo | Estado |
|---|---|---|---|
| F4-01 | Baja | Cambiar el mapa base lanzaba una excepción (`catastroUrbano.bringToFront is not a function`) y dejaba capas detrás del mapa nuevo | Corregido (R en Chromium) |
| F4-02 | **Alta** | Guardar una atención en Registro Clínico **borraba la dislipidemia** (E78) de los diagnósticos. El formulario no la enviaba y el servidor reemplazaba la lista. Es la misma pérdida que C-08 («se perdió E78.2») | Corregido: el formulario la envía y el servidor acumula los diagnósticos (`testCorreccionesF4.js`) |
| F4-03 | Media | El sexo exportado (`M`/`F`) no pasaba la validación del propio importador (otra causa de C-09) | Corregido |

## 4. Lo que NO se hizo, y por qué

| Tema | Por qué | Dónde |
|---|---|---|
| **Validación clínica** de semáforo, HEARTS, indicadores del convenio y edad | Necesita a la licenciada de crónicos. Las correcciones de aquí son técnicas | Fase 3 (parte clínica) |
| Auditoría sistemática del cliente (todos los sumideros de HTML) | Se corrigieron los conocidos. La CSP estricta ya impide que un HTML inyectado ejecute código, pero falta la revisión completa | Fase 3 |
| Tooltip del mapa con un diagnóstico guardado con HTML | El servidor ya no deja guardarlo y la CSP lo bloquearía. La corrección se verificó solo por lectura | — |
| L-05 (guardado síncrono de todo el archivo), L-07 (memoria con mucha concurrencia), L-08 (`/api/cronicos` sin caché ni paginación) | Con la decisión de Edward (como máximo 5 usuarios a la vez) son de prioridad baja. Son el camino de la escalada a más de 2 000 usuarios | Fase 5 (ruta de migración) |
| S-09 fuera del servidor | Los respaldos diarios quedan en el mismo disco. Copiarlos cifrados a otro lugar requiere elegir dónde (y quién paga) | Fase 5/6 |
| L-10 y número de proxies en Render | Solo se puede comprobar en Render | Fase 6/7 |
| `render.yaml`, GitHub Actions, Dependabot, escaneo de secretos, `LICENSE` | Son entregables de infraestructura, no correcciones de hallazgos | Fase 6 |
| Retención de la bitácora (anillo de 5 000 eventos) | Depende de la decisión de retención (Ley 29733) | Fase 5 |
| L-09 (100 inicios de sesión simultáneos ≈ 1 s) | Aceptado: inherente a scrypt y sin efecto con ≤ 5 usuarios | — |

## 5. Decisiones tomadas por defecto (Edward puede cambiarlas)

1. **Sin internet:** solo un aviso claro; no se guardan datos de pacientes en el equipo. Trabajar sin red con datos exigiría almacenamiento cifrado en el dispositivo y más trabajo.
2. **Cifrado en reposo:** implementado pero **apagado**. Se activa definiendo `STORE_KEY` en Render. **Antes, decidir quién guarda la clave fuera del servidor**: si se pierde, el padrón cifrado no se puede leer. Los respaldos y el `.bak` quedan cifrados con la misma clave.
3. ~~Pacientes sin documento~~ — **decidido por Edward (05/11/2026): el documento es obligatorio.** Se registran solo con DNI, carné de extranjería o pasaporte; «Sin documento» se rechaza en la pantalla y en el servidor.
4. **Cierre por inactividad:** 30 minutos (`INACTIVIDAD_MINUTOS`).
5. **Diagnósticos:** se acumulan; una importación o una atención no borran un diagnóstico anterior. Dar de baja un diagnóstico no tiene todavía una acción en la interfaz (definirlo con la licenciada).
6. **Respaldos:** uno por día en el mismo disco, los últimos 14 (`RESPALDOS_DIARIOS`). Restaurar es copiar el archivo del día sobre `store.json` con el servidor detenido.

Siguen pendientes de Edward las decisiones de la Fase 2: rotar secretos si se usaron los del ejemplo, carnés y pasaportes por HOSIX, y cambio de clave por el propio usuario.

## 6. Cambios de comportamiento (avisar)

- **Interfaz:**
  - Al importar, aparece un aviso si hay documentos ya registrados y otro si hay pacientes sin ubicar.
  - El DIRECTOR ve totales de su red y «no disponible» donde antes veía 0.
- **Sesión:** se cierra tras 30 minutos sin uso. Sin internet, la pantalla de acceso lo dice y no borra la sesión.
- **Importación:** el carné de extranjería y el pasaporte guardan sus letras. El documento es obligatorio: una fila sin documento queda observada y no se carga.
- **Instalación en Render:**
  - Build `npm run build` (o `npm install`); start `npm start`; Node 22.
  - Con `DATA_DIR` aparece la carpeta `respaldos/`.

## 7. Evidencia

`docs/produccion/evidencia/f4/` (ver su `README.md`) y, en `npm test`, `server/tests/testCorreccionesF4.js`, `server/tests/testPersistenciaF4.js` y el paso F2-17 de `testSeguridadF2.js`.

## 8. Siguiente ventana

Con las correcciones hechas, el plan sigue con la **Fase 3 reducida a lo clínico y a la auditoría completa del cliente**, y después con las Fases 5 y 6 en lo que no se hizo aquí. Modelo sugerido para la Fase 3: **Opus 5.5**.

**Qué leer:**
1. `docs/produccion/PLAN.md`.
2. Este archivo, secciones 4 y 5.
3. `docs/GUIA_NORMA_HEARTS.md`.

**Qué hacer:**
- Revisar contra la norma `client/js/clinical/semaforo.js`, `heartsEngine.js`, `indicadoresConvenio.js` y `padronCalculadora.js`.
- Preparar las preguntas para la licenciada de crónicos (edad, semáforo, metas, alta y baja de diagnósticos).
- Hacer la auditoría sistemática de sumideros de HTML del cliente.
- Validar la precarga por DNI por rol, red y establecimiento.

**Plantilla:**
> Lee `docs/produccion/PLAN.md` y `docs/produccion/F4_correcciones.md`. Ejecuta la Fase 3 (lógica clínica y auditoría completa del cliente). Trabajo en la rama `claude/pensive-cray-3lwodm`. Al terminar: actualiza el estado en el plan, commit y push, y dime la siguiente ventana.
