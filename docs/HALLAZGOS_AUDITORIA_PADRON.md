# HALLAZGOS DE AUDITORÍA DEL PADRÓN Y DE LA APLICACIÓN
**Fecha de la auditoría:** 21/10/2026 · **Alcance:** padrón real de 614 registros y código del cliente y del servidor.
**Regla de este documento:** solo cifras agregadas. No contiene DNI, nombres, teléfonos ni direcciones de pacientes.

## 0. Cómo se obtuvieron las cifras (reproducible)
| Cifra | Herramienta | Comando (desde la raíz del proyecto) |
|---|---|---|
| Perfil del padrón: campos, vacíos, formatos, distribuciones | `tools/perfil_padron.js` | `node tools/perfil_padron.js client/js/data/sampleDataset.js` |
| Auditoría de consistencia: semáforo, DNI repetidos, ids, coordenadas | `tools/auditar_padron.js` | `node tools/auditar_padron.js client/js/data/sampleDataset.js` |
| Efecto de la corrección del semáforo | `tools/verificar_semaforo.js` | `node tools/verificar_semaforo.js client/js/data/sampleDataset.js` |
| Pruebas automáticas (datos inventados) | `server/tests/*.js` | `node server/tests/testSemaforo.js` (y las demás) |

Fecha de referencia de las cifras: **21/10/2026**. El padrón fue generado el 20/10/2026, por lo que algunas cifras cambian con el paso de los días.

## 1. Descripción del padrón
- **Registros:** 614 · **personas únicas por DNI:** 550 · **campos distintos:** 63.
- **Campos por registro:** 62 campos en 349 registros, 59 en 137 registros HOSIX y 63 en 128 registros duplicados (por el campo `nota_duplicado_padron`).
- **Fuentes:** PADRON_DNT 477 · HOSIX 137.
- **Sexo:** F 401 · M 213.
- **Financiador:** SIS 591 · PARTICULAR 22 · SIN REGISTRO 1.
- **Distrito:** Huarmey 582 · otros 32 (Lima 9, Huaraz 6, Huaura 3, Santa 3, otros 11).
- **Estado de control guardado:** Controlado 230 · No Controlado 214 · Captación Pendiente (HOSIX) 137 · Sin Datos de Control 27 · Fallecido 6.
- **Diagnóstico principal (`conditions[0]`):** I10 358 · E119 171 · I10X 68 · otros 17.
- **Citas:** 471 registros con 1 cita y 143 sin cita (137 HOSIX y 6 fallecidos).

## 2. Calidad de datos (porcentaje de vacíos y formatos)
| Campo | Vacío | Observación |
|---|---|---|
| `telefono` | 88 (14.3 %) | los 526 restantes tienen 9 dígitos y empiezan con 9 |
| `fecha_nacimiento` | 19 (3.1 %) | formato yyyy-mm-dd |
| `edad` | 3 (0.5 %) | 4 edades no concuerdan con la fecha de nacimiento (±1 año) |
| `direccion` | 0 | 12 en mayúsculas, texto libre sin formato |
| `direccion_dnt` | 176 (28.7 %) | segunda dirección de la fuente DNT |
| `direccion_hosix` | 235 (38.3 %) | segunda dirección de la fuente HOSIX |
| `sector_padron` | 259 (42.2 %) | 6 valores distintos, con variantes (VICTORIA / LA VICTORIA) |
| `tratamiento_hta` | 290 (47.2 %) | 124 textos distintos de texto libre |
| `tratamiento_dm` | 398 (64.8 %) | 131 textos distintos de texto libre |
| `observacion` | 350 (57.0 %) | mezcla texto y números |
| `fecha_limite` | 143 (23.3 %) | texto en lugar de fecha en 143 registros |

- **DNI:** 609 con 8 dígitos, 2 con 7 dígitos y 3 no numéricos.
- **Teléfonos compartidos:** 174 registros comparten teléfono con otro.
- **Registros sin ningún teléfono:** la primera versión del perfil informó 17 por un error del script (confundía `fila_excel` con un teléfono). La cifra correcta de teléfonos vacíos es 88.
- **Coordenadas:** los 614 tienen latitud y longitud; ningún par de coordenadas se repite.
- **Distrito vs mapa:** de 32 registros con distrito distinto de Huarmey, 28 tienen coordenadas dentro de la caja de Huarmey. Es una incoherencia probable por ubicación por defecto del geocodificador (no confirmado). Hay además 3 registros de Huarmey con coordenadas fuera de la caja.
- **Código `I10X`:** 68 registros. No parece un CIE-10 válido; requiere validación clínica.

## 3. H1: el semáforo guardado envejece (CORREGIDO)
**Descripción.** El semáforo, los días restantes y la fecha límite están guardados en el padrón y no se recalculaban al abrir la aplicación. La pantalla mostraba el estado del día de generación del archivo.

**Evidencia (cifras al 21/10/2026):**
- Con la fecha de generación (20/10) coinciden 608 de 614 registros. Con la fecha de hoy coinciden 602.
- `dias_restantes` guardado está desfasado exactamente +1 día en los 471 registros con cita.
- Hoy, 6 registros guardados como verde deberían ser amarillos.

**Causa adicional.** Había tres cálculos distintos: el cliente (`Math.round`, hora local), `/api/patients/geo` (`Math.ceil` sobre `Date.now()`) y `/api/alerts/summary` (daba prioridad al valor guardado). Una fecha `yyyy-mm-dd` se leía como UTC, lo que produce un desfase de un día en Perú.

**Corrección aplicada.**
- Archivo nuevo `client/js/clinical/semaforo.js`: única fuente de verdad, con fechas locales.
- El servidor (`/patients/geo`, `/alerts/summary`) y el cliente (`main.js`, al cargar los datos) usan la misma función.
- El valor original se conserva en `semaforo_guardado` para trazabilidad.
- Se agregó `server/tests/testSemaforo.js` (10 pruebas). Las pruebas previas (`testErrorA` 7, `testErrorB` 9 y `testHttp` 8) siguen pasando.

## 4. H2: fallecidos contados como desertores (CORREGIDO)
**Descripción.** Los 6 pacientes fallecidos no tienen cita y el padrón los guarda como semáforo rojo (deserción). Por eso el rojo guardado suma 243: 237 con cita vencida más 6 fallecidos.

**Efecto.** El número de pacientes que requieren citación prioritaria estaba sobrestimado en 6 (2.5 %). Los fallecidos entraban además en los indicadores del panel.

**Corrección aplicada.**
- Nuevo estado `black` (fallecido), fuera del rojo y de los indicadores del panel.
- `/alerts/summary` informa `fallecidos` y `personas_unicas_dni`.
- El mapa muestra un pin propio para fallecidos y para registros sin cita.

**Resultado sobre el padrón real (21/10/2026):**

| Estado | Guardado | Recalculado |
|---|---|---|
| Verde | 143 | 137 |
| Amarillo | 91 | 97 |
| Rojo | 243 | 237 |
| Morado (HOSIX) | 137 | 137 |
| Negro (fallecido) | 0 | 6 |
| **Registros que cambian de color** | | **12** |

## 5. H3: DNI duplicados en el padrón (CORREGIDO el 21/10/2026, con 10 casos por revisar)
- **64 DNI aparecen dos veces:** 128 registros, todos de PADRON_DNT. Cada par tiene `id` distinto y el mismo nombre.
- **Incoherencia entre pares:** en 39 de los 64 pares, el semáforo es distinto entre las dos filas.
- **Indicadores inflados:** los totales cuentan 614 registros, pero hay 550 personas.
- **Búsqueda por DNI:** los índices por DNI del servidor y del cliente conservan una sola fila por DNI, de modo que la búsqueda por DNI y `Patient/:id` solo localizan una de las dos (por lectura del código, no probado en ejecución).
- **Hallazgo adicional (atenciones):** cada fila traía en `observations` embebido las dos atenciones de la persona, pero en la lista de nivel superior de `store.json` repetía dos veces la suya y omitía la de la otra fila (128 copias exactas, 64 atenciones ocultas). Como la API prefiere la lista de nivel superior, una de las dos atenciones de cada persona no se veía.
- **Corrección aplicada con `tools/consolidar_dni.js`:** 64 pares unidos en 64 personas (614 → 550 registros; 550 coincide con las personas únicas). Ningún par se descartó por identidad distinta.
  - **Atenciones:** 477 atenciones distintas antes y 477 después (0 perdidas). Se eliminaron las 128 copias exactas y se conservaron las 2 atenciones de cada persona. En 4 personas ambas tienen la misma fecha con valores distintos y se conservan las dos.
  - **Registro vigente:** el del control más reciente, por mes del control (no por fecha, porque el padrón imputó el día 15 y hay controles de octubre fechados en agosto). En 64 de 64 decidió el mes.
  - **Citas:** se conserva la cita del registro vigente. Se descartaron 62 citas de las otras filas; en 27 personas la descartada era posterior a la conservada. Quedan guardadas en `fusion_dni.citas_descartadas`.
  - **Diagnósticos:** se sumaron los de ambas filas (afecta a 3 personas).
  - **Trazabilidad:** cada registro unido lleva `fusion_dni` (filas de origen, ids anteriores, diferencias y citas descartadas).
- **Pendiente de revisión humana:** 10 de las 64 personas tienen un control sin mes («SIN FECHA»), por lo que su fecha es imputada y la elección del vigente es de confianza media. Además, hay 1 par con el mismo número base de documento, pero nombre y sexo distintos y uno con sufijo `-HC`; no se unió y requiere revisión de digitación.
- **Persistencia:** el Excel de origen sigue con las filas repetidas. Si el padrón se vuelve a generar desde el Excel, los duplicados regresan; la corrección definitiva es en la fuente.

## 6. Otros hallazgos del código (por lectura; sin corregir)
Estado: **NC** = no corregido · **NV** = no verificado en ejecución.

| N.° | Hallazgo | Estado |
|---|---|---|
| F1 | Los conectores HOSIX, Galenos y Pakamuros asignan `I10` (hipertensión) cuando el diagnóstico viene vacío, inventando un diagnóstico | NC |
| F2 | El diagnóstico se clasifica con «empieza con I = hipertensión, si no = diabetes»; cualquier otro código queda como diabetes | NC |
| F3 | Se usa la fecha de la última atención como fecha de cita cuando no hay cita programada, lo que genera citas vencidas falsas | NC |
| F4 | `upsertPatient` puede cambiar el `id` de un paciente existente y dejar huérfanas sus citas y observaciones | **CORREGIDO** 21/10/2026 (ver sección 10) |
| F5 | La ingesta no es idempotente: reenviar un registro duplica citas y observaciones (ids con UUID) | **CORREGIDO** 21/10/2026 (ver sección 10) |
| F6 | `runTransaction` no revierte: si falla el registro 1500, los 1499 anteriores quedan guardados | NC |
| F7 | Un `store.json` corrupto se reemplaza por una base vacía en el siguiente guardado | NC |
| F8 | No hay cierre ordenado (SIGINT/SIGTERM): se pierden los cambios del debounce de 250 ms | NC |
| F9 | El análisis de CSV desalinea columnas con campos vacíos y no maneja codificación Windows-1252 | NC, NV |
| F10 | La ingesta CSV reemplaza todo el padrón en pantalla y no se envía al servidor | NC |
| F11 | El geocodificador coincide por subcadena («CENTRO», «NUEVA», «AIJA») y asigna coordenadas con `Math.random()`; cambian en cada carga | NC |
| F12 | El mensaje de WhatsApp dice «Sin fecha», omite la diabetes en pacientes con HTA y DM y no excluye fallecidos | NC |
| F13 | Si la API falla, la interfaz sigue con datos locales sin avisar al usuario | NC |
| F14 | `PATIENT_DEFAULTS` inventa financiador SIS y sexo «O»; `fhirAdapter` usa la fecha fija 2026-10-01 en exámenes | NC |
| F15 | El motor clínico solo reconoce I10 y E11; E10x, N18x e I15x quedan sin evaluar | NC |
| F16 | Pacientes sin datos de control se muestran como «No Controlado» | NC |
| F17 | Rutas duplicadas por montar el mismo router en `/api` y `/fhir` (p. ej. `/fhir/fhir/Bundle`) | NC |
| F18 | El comodín de la aplicación devuelve `index.html` con estado 200 para archivos inexistentes, y el Service Worker lo guarda | NC |
| F19 | El `ETag` reinicia su versión al reiniciar el servidor; puede responder 304 con datos distintos | NC |
| F20 | `heartsEngine` reordena la lista de observaciones del paciente y lanza error con una fecha de cita inválida | NC |

## 7. Hallazgos de seguridad (reportados al final, sin corregir)
| N.° | Hallazgo | Gravedad |
|---|---|---|
| S1 | `sampleDataset.js` con el padrón completo se sirve como archivo estático sin autenticación y el Service Worker lo guarda en el dispositivo | Crítica |
| S2 | El rol se toma del encabezado `x-clinical-role`; con `AUTH_ENFORCE=true` basta enviar `ADMIN` para saltarse el control. Por defecto no hay restricción | Crítica |
| S3 | Webhooks, `POST /Bundle` y `pre-cita` permiten crear o sobrescribir pacientes sin autenticación; el log de auditoría es legible por cualquiera | Crítica |
| S4 | Posible XSS: la ficha, el tooltip del mapa y las notificaciones insertan nombre, dirección y observación sin escapar | Alta |
| S5 | La exportación CSV de pre-citas no escapa fórmulas (`=`, `+`, `-`, `@`) | Media |
| S6 | CORS abierto por defecto, sin Content-Security-Policy | Media |
| S7 | Los errores devuelven `err.message` al cliente | Baja |
| S8 | `/patients/geo` y `/patients` entregan DNI, teléfono y dirección completos; el enlace de WhatsApp envía nombre y diagnóstico | Media |
| S9 | El limitador por IP no considera `trust proxy`; los límites de 10 MB sin autenticación agravan el riesgo | Media |
| S10 | `store.json` y `sampleDataset.js` (datos reales) están en una carpeta sincronizada con OneDrive; Ley N.° 29733 | Alta |

## 8. Limitaciones de esta auditoría
- No se ejecutó la interfaz en un navegador; los hallazgos del cliente salen de leer el código.
- Quedaron sin revisión completa partes de `main.js`, `mapManager.js` y `fhirAdapter.js`, además de `schema.sql` y los estilos.
- El «criterio de desertor» (cita vencida) es el de la aplicación; no se validó contra la norma técnica vigente.

## 9. Cambios realizados en esta intervención
| Archivo | Cambio |
|---|---|
| `client/js/clinical/semaforo.js` | **Nuevo.** Cálculo único del semáforo |
| `server/routes/apiRoutes.js` | `/patients/geo` y `/alerts/summary` usan el cálculo único |
| `client/js/main.js` | Recalcula el semáforo al cargar y excluye fallecidos de los indicadores |
| `client/js/map/mapManager.js` | Pines para fallecidos y registros sin cita |
| `client/index.html`, `client/sw.js` | Carga y almacena en caché `semaforo.js` |
| `server/tests/testSemaforo.js` | **Nuevo.** 10 pruebas con datos inventados |
| `tools/perfil_padron.js`, `auditar_padron.js`, `verificar_semaforo.js` | **Nuevos.** Informes solo con cifras agregadas |
| `tools/consolidar_dni.js` | **Nuevo.** Une DNI repetidos (simulacro por defecto; `--aplicar --respaldo=<carpeta fuera de OneDrive>` escribe) |
| `server/db/store.json`, `client/js/data/sampleDataset.js` | Unificados: 614 → 550 registros. Respaldo previo en `respaldo_consolidacion_dni_20261021` (perfil de usuario, fuera de OneDrive; contiene datos reales) |

## 10. F4 y F5: id estable e ingesta idempotente (CORREGIDOS el 21/10/2026)
**Causa.** (F4) `upsertPatient` copiaba el `id` entrante sobre el paciente existente, pero las citas, atenciones, diagnósticos y medicación lo referencian por `patient_id`; al cambiar el `id` quedaban huérfanos. Los conectores envían `pac-<renipress>-<dni>`, que puede diferir del id con el que el paciente ya está en el padrón (por ejemplo, ids heredados del Excel). (F5) Los conectores HOSIX, Galenos y Pakamuros generan ids de cita y atención con `crypto.randomUUID()`, de modo que cada reenvío creaba un registro nuevo.

**Corrección aplicada (solo en `server/db/database.js`; los conectores no cambian):**
- `upsertPatient` nunca reemplaza el `id` de un paciente existente.
- Método nuevo `resolvePatientId(ref)`: traduce una referencia (`id` o `pac-<renipress>-<dni>`) al id vigente del paciente. Lo usan `upsertCondition`, `upsertAppointment`, `upsertObservation` y `upsertMedication`, así que ningún recurso nuevo queda huérfano.
- `upsertAppointment`: es la misma cita si coincide el `id` o si coinciden paciente, fecha y tipo (pre-cita o cita). Conserva el `id` original.
- `upsertObservation`: es la misma atención si coincide el `id` o si coinciden fecha y todos los valores informados. Dos atenciones con la misma fecha y valores distintos se conservan ambas (en el padrón hay 4 casos así).
- Se agregó `server/tests/testIdempotencia.js` (10 pruebas con datos inventados). Las pruebas previas siguen pasando: `testErrorA` 7, `testErrorB` 9, `testHttp` 8 y `testSemaforo` 10.

**Verificación sobre el padrón real (solo lectura):** 0 citas, 0 atenciones y 0 diagnósticos huérfanos antes del cambio. No se modificó `store.json`.

**Limitaciones.**
- No se probó con el servidor HTTP real y una carga de HOSIX o Galenos; las pruebas llaman directamente a los métodos de la base y reproducen la secuencia del webhook.
- Dos citas distintas del mismo paciente en la misma fecha y del mismo tipo se tratan como una sola.
- Un reenvío con los mismos valores pero que en el origen sí era una segunda atención el mismo día no se distingue de un duplicado.
- No cubre el caso de la fecha: `hosixConnector` usa la fecha de hoy como fecha de atención si el registro no trae una; ese reenvío se unifica solo dentro del mismo día.
- Los datos huérfanos o duplicados que ya existieran antes de este cambio no se limpian; en el padrón actual no hay ninguno.

**Sigue abierto (requiere decisión o datos fuera del código):** las filas repetidas del Excel de origen, las 27 citas descartadas posteriores y los 10 controles «SIN FECHA» (revisión clínica), y el par con sufijo `-HC` (revisión de digitación).

**Copia de seguridad previa a los cambios:** carpeta `respaldo_cronicos_20261021` en el perfil de usuario, fuera de OneDrive. Contiene datos reales; elimínela cuando ya no la necesite.
