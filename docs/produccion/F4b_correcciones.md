# Fase 4b — Correcciones de la Fase 3

**Fecha:** 06/11/2026 · **Rama:** `claude/pensive-cray-3lwodm` · **Base:** `c4dea19` (cierre de la Fase 3) · **Entorno:** Node 22.23.4, Chromium con Playwright · **Datos:** inventados y la semilla de 20 pacientes simulados; ningún servidor de prueba usó `server/db/`.

**Instrucción de Edward:** «corrige todo» (sobre los 37 hallazgos de `F3_cliente_clinica.md`). Se siguió el precedente de la Fase 4:
- Lo técnico se corrigió con **una prueba que falla antes y pasa después**.
- Donde faltaba la decisión de la licenciada se aplicó el valor **más seguro y reversible**, y se concentró en **un solo archivo**, `client/js/clinical/reglasClinicas.js`. Cada constante dice qué pregunta de la sección 7 del informe de la Fase 3 la decide: cambiar una respuesta es cambiar una constante.
- Todo lo que se decidió por defecto está en la sección 4 para que Edward o la licenciada lo confirmen o lo cambien.

Regla de evidencia: cada corrección dice dónde está y qué prueba la cubre. Lo que no se pudo hacer o no se verificó, se dice.

## 1. Resultado

- **`npm test`:** 26 suites, **493 correctas, 0 fallas** (la línea base de la Fase 3 era de 22 suites y 298; `server/db/` sigue sin `store.json`).
- **Pruebas nuevas** (todas con la regla «falla antes, pasa después»):

| Suite | Casos | Antes de corregir |
|---|---:|---|
| `testReglasClinicas.js` (reglas compartidas) | 19 | suite nueva |
| `testClinicoF3.js` (motor, ficha, WhatsApp, parser de HOSIX) | 98 | de 94 casos iniciales, **75 fallaban** |
| `testServidorF3.js` (servidor real) | 26 | de 25 casos iniciales, **17 fallaban** |
| `testClienteF3.js` (sumideros, sesión, WhatsApp, cuadrícula) | 52 | de 49 casos iniciales, **39 fallaban** |

- **Chromium contra el servidor real** (`evidencia/f3/`): 
  - `D3` (el Registro Clínico real, con el navegador en UTC y en hora de Lima): **177 comprobaciones OK, 0 falla**. Contra el commit base: 47 OK y 126 con falla de 173.
  - `D2` (WhatsApp, cuadrícula, falla cerrado, HOSIX): 26 correctas, 0 con falla.
  - `A2`: ningún campo llega a ser elemento inyectado (ni por la ruta real ni en memoria) y los botones hechos a mano con `btn-logout`, `login-overlay` o `map` no actúan. 0 violaciones de la CSP.
  - `A3`: al salir, la cuadrícula del padrón queda en 0 filas y cerrada, el clic cae en «Ingresar» y un segundo usuario no ve nada.
  - `C2`: el «Fallecido» de la interfaz sale negro y ya no suma como desertor. `C3`: HbA1c 11 % sin presión queda «No Controlado» con 30 días, y el WhatsApp dice `05/12/2026`, la fecha de la cita. `C4`: en hora de Lima una cita de hoy es «Cita hoy», amarillo.
  - Sonda `C1` (motor): de 2 OK y 28 DISCREPA a 25 OK y 5 DISCREPA. Las 5 restantes son de la propia sonda (espera los textos viejos: E5 y E6 ×3) y de una expresión copiada del formulario (I1). Quedan 17 PREGUNTA: son criterio clínico.
- **De los 37 hallazgos de la Fase 3:** 33 corregidos, 1 corregido en parte (C3-05, ver 3), 1 aceptado (P3-12), 1 bloqueado por dato (P3-11) y 1 bloqueado por red (C3-07). Además hay **decisiones clínicas por defecto** pendientes de la licenciada (sección 4) y **5 hallazgos nuevos** encontrados al corregir (sección 6).
- **No se tocó ningún dato real.** Los rótulos erróneos que ya estuvieran guardados se corrigen en el siguiente guardado del paciente; no hay migración.

## 2. Qué se corrigió

### 2.1 Reglas clínicas en un solo lugar (K3-07, T3-02)

`client/js/clinical/reglasClinicas.js` (cliente y servidor). Antes, el semáforo, el motor HEARTS, la ficha, el Registro Clínico y el servidor tenían cada uno su copia de la meta, del estado de control y de los diagnósticos, y una misma persona salía «controlada» en uno y «no controlada» en otro. Ahora todos usan el mismo módulo: `estadoControl`, `metaPA`, `perfilClinico`, `esFallecido`, `normalizarSexo`, `rotuloCie10`, `frecuenciaDias`, `citaExcedeIntervalo`, `vigenciaExamen` y fechas locales. Las reglas están congeladas (`Object.freeze`).

### 2.2 Errores clínicos (K3)

| ID | Corrección | Dónde |
|---|---|---|
| K3-01 | El estado de control sale de las **mediciones** (nunca de «no hay presión» ni de una etiqueta guardada): HbA1c 11 % sin presión → «No Controlado»; sin ninguna medición → «Sin Datos de Control en Padrón», nunca «Controlado». La pantalla y lo guardado dicen lo mismo. Lo mismo en el parser de HOSIX y en la cuadrícula | `reglasClinicas.js` `estadoControl`; `heartsEngine.js` 49-66; `registroClinicoModal.js` `recalcularEnVivo`, `construirPaciente`; `hosixParser.js` |
| K3-02 | El «Fallecido» por estado ya es fallecido: **el servidor** fija `fallecido` desde `estado_paciente` (si no viene explícito) y **el cliente** lo reconoce por bandera o por estado. Con el servidor real: el paciente sale negro, suma en fallecidos y ya no en desertores. No recibe WhatsApp | `validacion.js:129` `fijarFallecido`; `apiRoutes.js:107`; `semaforo.js:70`; `whatsappNotifier.js:63`; `main.js` |
| K3-03 | El aviso de WhatsApp dice la fecha de la **próxima cita real** (la mayor fecha ≥ hoy, en `dd/mm/aaaa`). Sin cita: aviso y **no** se abre WhatsApp. Sin fecha el notificador devuelve `null` (se acabó el «esta semana») | `main.js:2021-2065`; `whatsappNotifier.js:75, 103` |
| K3-04 | La regla de 30 / 90 días ya se **aplica**: el formulario propone la cita con `frecuenciaDias` (90 solo si está controlado **y** estable, con 3 controles en meta; si no, 30) y la recalcula mientras la persona no edite la fecha; avisa cuando la cita excede el intervalo («queda a N días; el máximo es 30/90») en el formulario, la ficha y el popup del mapa; el valor por omisión del servidor y de la ficha sale de la misma regla | `registroClinicoModal.js` `gestionarProximaCita` (~1289); `apiRoutes.js:220`; `main.js:1210, 1217`; `mapManager.js:839` |
| K3-05 | Con menos de 3 controles en meta ya no cuenta como «estable» para el intervalo de 90 días (la ficha sigue mostrando «Sí (Parcial)»; pregunta 8); la etiqueta guardada no manda sobre la cifra (PA 190/110 con «Controlado» → «No Controlado») | `heartsEngine.js` 49-66; `padronCalculadora.js` |
| K3-06 | **El rojo ya no marca como desertor a quien asistió:** una cita pasada con un control registrado en esa fecha o después pasa a gris «cita cumplida». El tablero ya no cuenta los grises como verdes (hallazgo nuevo, sección 6). El texto «al día en meta terapéutica» ahora dice «Próximo control dentro del plazo» | `semaforo.js:86`; `main.js` `renderDashboard`, 1483 |
| K3-07 | **Una sola meta de PA para el paciente** (ficha, motor y formulario): `metaPA`. Los indicadores del convenio siguen con 140/90 fijo, como los declara cada ficha | `reglasClinicas.js` `metaPA` |
| K3-08 | HTA = I10 a I15 y DM = E10 a E14 en todo el sistema (antes solo I10 y E11) | `perfilClinico`, `esHta`, `esDm` |
| K3-09 | Sin edad o sin sexo → TFGe «Sin dato» (no edad supuesta de 50 ni sexo masculino); «medicación hasta» sin meses → «Sin fecha de entrega»; «-», «No» y «Ninguno» ya no cuentan como diagnóstico; riesgo CV «Sin dato» en vez de «Bajo» cuando no se midió; «Qué le falta» mira la **fecha** de cada examen («HbA1c vencida», «HbA1c sin fecha»); «Estadio ERC» → «Categoría de TFGe» | `padronCalculadora.js` 69, 254, 286, 326; `registroClinicoModal.js` 1375 |
| K3-10 | El parser del CSV de HOSIX **no inventa** documento, historia, nombre ni diagnóstico; una fila sin documento válido no entra y se informa en `observados` (la pantalla avisa cuántas y por qué); el rótulo sale del código (N18 ya no es «Diabetes tipo 2»); ya no agenda la fecha de la última atención como cita | `hosixParser.js` 140-235; `main.js:2362-2371` |
| K3-11 | Solo documentación: la cabecera de `indicadoresConvenio.js` dice lo que el código hace («un control o un examen») y deja 4 `[PENDIENTE: …]` con su pregunta. No cambian los cálculos | `indicadoresConvenio.js` |

### 2.3 Errores técnicos del motor (T3)

| ID | Corrección | Dónde |
|---|---|---|
| T3-01 | Las fechas `AAAA-MM-DD` son **locales**: en hora de Lima una cita de hoy es amarilla («Cita hoy»), a +8 días verde, y ayer = 1 día de atraso. Comprobado también en Tokio y Auckland | `padronCalculadora.js` `evaluarCita` 199, medicación 286; `reglasClinicas.js` |
| T3-02 | `heartsEngine` delega el semáforo en `semaforo.js` y la meta en `metaPA`; la ficha, el motor y el servidor comparten reglas. `heartsEngine.js` ya tiene pruebas (94 casos de la suite) | `heartsEngine.js` 30-69 |
| T3-03 | No reordena `observations` y no lanza con una fecha inválida (devuelve gris) | `heartsEngine.js` 27-38 |
| T3-04 | La cita propuesta y la fecha del aviso usan la fecha de Lima, no UTC | `registroClinicoModal.js`; `main.js` |
| T3-05 | **Fallan cerrado:** sin `HeartsEngine` o sin geocodificador no se carga nada y se avisa (antes: verde / «Controlado» / coordenadas del hospital con `matched:true`). Un paciente sin ubicar queda «sin ubicar» | `padronGridModal.js:750-930`; `hosixParser.js` 25, 31; `registroClinicoModal.js` `ubicado` |
| T3-06 | La alerta «DNI no tiene 8 dígitos» valida según el tipo de documento (DNI 8 dígitos; carné de extranjería y pasaporte, 6 a 15 letras o dígitos) | `padronCalculadora.js` 299 |

### 2.4 Cliente: seguridad y sesión (C3)

| ID | Corrección | Dónde |
|---|---|---|
| C3-01 | `nota_duplicado_padron` se escapa; el servidor lo rechaza si trae `<` o `>`. **`clicEn`, `quitarElemento` y `cerrarModal` solo aceptan una lista cerrada de ids** (los que la página realmente usa). Con A2: 0 elementos inyectados y los botones hechos a mano con `btn-logout`, `login-overlay` o `map` ya no actúan | `main.js:1719`; `acciones.js:33-38`; `validacion.js:213` |
| C3-02 | Al cerrar sesión, vencer o por 30 minutos de inactividad se **cierran y vacían** la cuadrícula del padrón y el Registro Clínico (`reiniciar()`), y la pantalla de acceso queda por encima de todo (z-index 100000). Un segundo usuario ya no ve las filas del primero | `padronGridModal.js:271`; `registroClinicoModal.js:834`; `main.js:487` |
| C3-03, C3-04 | Los 8 valores sin escape (`edad`, `fecha_*`, `frecuencia_hearts`, pin de búsqueda) se escapan | `main.js:1141, 1231`; `mapManager.js:839, 1104` |
| C3-06 | Si el servidor rechaza el lote, **no** se agregan a memoria ni se dice «cargados»: se muestra el motivo y las filas quedan en la cuadrícula | `padronGridModal.js:750-930` |

### 2.5 Servidor y datos (P3)

| ID | Corrección | Dónde |
|---|---|---|
| P3-06 | **No se pierde una atención:** el id de cada control y cita sale de su **contenido** (fecha y valores) y se **fusiona** con lo ya guardado; guardar dos veces lo mismo no duplica. El caso de dos usuarios (B 111/71 y A 133/83 el mismo día) conserva las tres atenciones y las tres citas | `apiRoutes.js:695` `guardarUnion` |
| P3-09 | El rótulo del diagnóstico sale del código (E10 es tipo 1) y se **conserva la fecha de diagnóstico** original | `apiRoutes.js:731`; `registroClinicoModal.js:1461` |
| P3-13 | Un coordinador con establecimiento (o sector) ya no puede sacar a un paciente de su alcance: 403 | `scope.js:95, 157` |
| P3-01 | «PAS/PAD de hoy», HbA1c y glucosa empiezan **vacías** (el último control es una pista); solo se agrega una observación si la persona escribió un valor. Guardar sin tocar nada ya no copia el control anterior ni mueve el indicador HEARTS | `registroClinicoModal.js` `cargarDatosPacienteExistente` (~1033) |
| P3-02 | Se precarga el estado del paciente: un fallecido no vuelve a «Activo» | `registroClinicoModal.js:1136, 1424` |
| P3-03 | **Lo que falta no se guarda como dato:** sexo, seguro, diagnóstico confirmado, ECV, estatina, aspirina, meses, establecimiento y sector empiezan en blanco («Seleccione…») en un paciente nuevo y se precargan solo si están guardados; el cuerpo enviado lleva solo los campos con valor y, en un paciente existente, solo los que la persona cambió | `registroClinicoModal.js` `construirPaciente` |
| P3-04 | = K3-01 | — |
| P3-05 | Antes de decir «Paciente Nuevo» y antes de guardar se **recarga la lista** del servidor (`recargarPacientes`); no se sobrescribe a un paciente creado por un colega después del inicio de sesión | `main.js:983, 999`; `registroClinicoModal.js` 900-918, ~1579 |
| P3-07 | El sexo `M`/`F` (HOSIX, FHIR, semilla) se reconoce: TFGe de una mujer de 64 años con creatinina 1,0 → 63, no 84 | `registroClinicoModal.js:1067`; `reglasClinicas.js` |
| P3-08 | La cita ya guardada se precarga; solo se guarda una cita nueva si la fecha es distinta de la guardada | `registroClinicoModal.js` `gestionarProximaCita` |
| P3-10 | El sector y el establecimiento guardados no se pisan si la persona no los cambió | `registroClinicoModal.js` ~1440 |
| P3-14 | El selector ofrece los 13 establecimientos del catálogo (antes 4); Culebras ya no dispara «Falta EESS» | `registroClinicoModal.js:104, 133` |
| P3-15 | = T3-06 | — |

## 3. Lo que NO se corrigió, y por qué

| ID | Estado | Por qué |
|---|---|---|
| P3-11 | **Bloqueado por dato** | Un coordinador de otra red no puede registrar desde la interfaz porque el catálogo de establecimientos solo trae Pacífico Sur. No es un defecto de código: falta el catálogo (RENIPRESS) de las otras redes |
| P3-12 | **Aceptado** | Guardar revela que el documento existe en otra red (403). Es inherente a exigir un documento único. La prueba confirma que el 403 **no filtra ningún dato** del paciente ajeno; la mitigación existente son los cupos por usuario e IP (Fase 2). Auditar cada rechazo desplazaría los otros eventos de la bitácora (tope de 5 000) |
| C3-05 | **En parte** | Se **intentó** `Referrer-Policy: no-referrer`, pero se revirtió: el `Referer` de un mosaico solo lleva el **origen** de la aplicación (nunca ruta ni datos de pacientes) y proveedores como OpenStreetMap exigen un `Referer`, así que rompería el mapa. Lo que sí expone un mosaico es **la zona que se mira** (hasta ~38 m al acercar a un paciente): **decisión de Edward** (aceptar, limitar el zoom o servir mosaicos propios) |
| C3-07 | **Bloqueado por red** | SheetJS está en 0.20.1 y el proxy de esta sesión bloquea `cdn.sheetjs.com` (único origen oficial de la 0.20.2 o posterior; en npm quedó en 0.18.5). Paso manual abajo |
| K3-01 (definición), K3-04 a K3-09, K3-11 | **Valor por defecto** | Quedan con el valor de la sección 4 hasta que la licenciada responda las 19 preguntas |

**C3-07, paso manual.** Descargar `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js`, reemplazar `client/libs/xlsx.full.min.js`, subir el `?v=` en `index.html` y `sw.js` y correr `npm test` (`testPadronExcel`, `testExcelImportExportFix`). La CVE-2024-22363 la citó un subagente y **no se verificó** contra su ficha.

## 4. Decisiones por defecto (confirmar o cambiar)

**Reglas clínicas** (`reglasClinicas.js`; entre paréntesis, la pregunta de la licenciada, sección 7 de `F3_cliente_clinica.md`):
1. Meta de PA 140/90 para todos (P4).
2. Alto riesgo (DM, ERC, ECV o riesgo CV ≥ 10 %): **sistólica < 130 y diastólica < 90** (P5, P6). La guía interna decía 130/80; se alineó con la vía, que fija solo la sistólica. `[PENDIENTE: texto íntegro de la vía]`.
3. HbA1c < 7 % para todas las edades (P2, P7). Con HbA1c y glucemia a la vez se exigen **ambas** (más estricto que el «o» del PP 0018 2026). Glucemia 70–130.
4. «Controlado y estable» = las 3 últimas mediciones **cada una en meta** (P8). Solo así el intervalo es de 90 días; si no, 30.
5. El amarillo va de 0 a 7 días; el día de la cita es amarillo (P11).
6. Una cita a la que el paciente asistió pasa a **gris** «cita cumplida», no a rojo (P10).
7. Vigencia de los exámenes: 12 meses para todos. La vía pide HbA1c cada 6 (P17).
8. La diabetes tipo 1 (E10) entra al programa, E10 a E14 (P14).
9. Cortes de riesgo CV < 5 / 5–9 / 10–19 / ≥ 20 % y LDL < 70 (alto riesgo) o < 100 (P6): como los tenía el sistema.
10. Los estados «Cambió de residencia» y «Abandono» **no** salen del denominador de los indicadores (P16).

**Servidor:**
11. Las citas **reprogramadas no reemplazan** a la anterior: se conservan ambas, y la cita vigente es la más reciente. Corregir un valor del mismo día al reimportar el Excel deja dos controles (gana el último).
12. `estado_paciente = Activo` sin bandera explícita quita la marca de fallecido; con `fallecido:false` y estado «Fallecido» a la vez se guarda `false`, pero la lectura lo cuenta como fallecido.
13. Un coordinador de un establecimiento que guarda desde un formulario que no elige el suyo recibe 403. El webhook de HOSIX siempre asigna `Organización/00001741`, así que un coordinador de establecimiento recibe 403 al enviar por esa vía.
14. Un código CIE-10 desconocido conserva el rótulo ya guardado o, si no hay, queda con el propio código.

**Cliente y formulario:**
15. La «próxima cita» del aviso de WhatsApp es la **mayor** fecha ≥ hoy, igual que el semáforo; no se descartan citas canceladas. Orden de las comprobaciones: fallecido, consentimiento, cita.
16. **La cita propuesta en el formulario se guarda si la persona no la cambia**, aunque no haya medición, y el semáforo pasa a verde. Sin medición hoy la propuesta es de 30 días.
17. Un «Abandono» o «Cambió de residencia» guardado no vuelve a «Activo»; lo cambia la persona. La dirección «Huarmey» (relleno del servidor) ya no cuenta como dirección. Si se escribe la sistólica hay que escribir la diastólica.
18. Un paciente nuevo sin establecimiento ni sector recibe del **servidor** el hospital (`00001741`) y «Sector 01 - Centro Urbano».
19. Sin mediciones, la etiqueta «No Controlado» guardada se respeta y «Controlado» da «Sin Datos». `fecha_limite` sin cita es `null` (el servidor rechaza «Sin fecha»).
20. El parser de HOSIX valida el documento sin quitar separadores; sin tipo, un documento que no es de 8 dígitos se rotula «Carné de extranjería» (solo dígitos) o «Pasaporte» (con letras).

## 5. Cambios de comportamiento (avisar)

- **Guardar una atención:** los campos de «hoy» empiezan vacíos; sin sexo, seguro u otros datos que antes se rellenaban por omisión, queda en blanco y el sistema no los inventa. Los pacientes nuevos exigen elegir de nuevo lo que antes venía rellenado.
- **Estado de control:** puede ser «No Controlado» donde antes decía «Controlado» (HbA1c alta sin presión; DM con 135/85), y «Sin datos» donde antes decía «Controlado» sin mediciones.
- **Intervalo:** un paciente «Controlado» con menos de 3 controles en meta sale con 30 días, no 90.
- **Semáforo:** un paciente que asistió a su cita sale gris, no rojo; los fallecidos por estado salen negros.
- **WhatsApp:** sin próxima cita real no se envía; no se envía a fallecidos.
- **Importación de HOSIX:** las filas sin documento válido no se cargan y se avisa cuántas.
- **Sesión:** al salir se vacían la cuadrícula del padrón y el Registro Clínico.
- **Guía:** `docs/GUIA_NORMA_HEARTS.md` se alineó con la vía (ver su encabezado).

## 6. Hallazgos nuevos al corregir

| Hallazgo | Estado |
|---|---|
| `renderDashboard` contaba como **verdes** a los pacientes en gris (sin cita), y con K3-06 serían también los de «cita cumplida» | Corregido (`main.js`, prueba en `testClienteF3`) |
| El parser de HOSIX agendaba la fecha de la última atención como cita «booked» | Corregido |
| `alto_riesgo_cv` decía «No» para un diabético con riesgo numérico bajo, mientras la meta de PA usaba la de alto riesgo | Corregido (misma regla `esAltoRiesgo`) |
| Los cortes de LDL y de riesgo CV estaban escritos en `padronCalculadora.js` | Movidos a `REGLAS` |
| `sw.js` precacheaba `padronCalculadora` con `v4` y `index.html` cargaba `v6` | Corregido (versiones unificadas) |

**Queda abierto:** un botón inyectado aún podría invocar acciones de escritura de la lista (`confirmarPreCita`, `registrarConsentimiento`), pero ya no hay vía para inyectarlo (C3-01).

## 7. Evidencia

`docs/produccion/evidencia/f3/` (ver su `README.md`). Salidas «antes» y «después» de cada script, con sufijo `_despues`.

## 8. Siguiente ventana

**Fase 4c — Reglas clínicas**, cuando Edward traiga las respuestas de la licenciada a la sección 7 de `F3_cliente_clinica.md` y el texto íntegro de la vía HEARTS. Modelo sugerido: **Opus 5.5**.

**Qué leer:** `docs/produccion/PLAN.md` (sección «Arranque de ventana»), la sección 4 de este archivo y `client/js/clinical/reglasClinicas.js`.

**Qué hacer:**
1. Con las respuestas, cambiar las constantes de `REGLAS` y las pruebas que las citan (`testReglasClinicas.js`, `testClinicoF3.js`). No debería hacer falta tocar otro archivo.
2. Cotejar `docs/GUIA_NORMA_HEARTS.md` y `REGLAS` con el texto íntegro de la vía HEARTS (el diastólico de alto riesgo, la HbA1c del adulto mayor, la frecuencia de la HbA1c, la definición de «controlado»).
3. Resolver con Edward lo que sigue abierto: P3-11 (catálogo de otras redes), C3-05 (mosaicos) y C3-07 (SheetJS).
4. Si cambia la edad del programa (P1, P2), agregar el límite de edad a `reglasClinicas.js`.

**Plantilla:**
> Primero el arranque: `git fetch origin && git checkout -B claude/pensive-cray-3lwodm origin/claude/pensive-cray-3lwodm && npm ci --prefix server`. Comprueba que `git branch --show-current` dice `claude/pensive-cray-3lwodm` (la ventana puede abrir en otra rama) y que existe `docs/produccion/PLAN.md`; confirma que `npm test` da 0 fallas.
> Después: lee `docs/produccion/PLAN.md` (sección «Arranque de ventana»), la sección 4 de `docs/produccion/F4b_correcciones.md` y `client/js/clinical/reglasClinicas.js`. Ejecuta la Fase 4c (reglas clínicas) con estas respuestas de la licenciada: [pegar aquí]. Trabajo y push en la rama `claude/pensive-cray-3lwodm`, no en la que asigne el entorno. Al terminar: actualiza el estado en el plan, commit y push, y dime la siguiente ventana.
