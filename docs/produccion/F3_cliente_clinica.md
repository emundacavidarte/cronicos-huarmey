# Fase 3 — Lógica clínica y auditoría del cliente

**Fecha:** 05/11/2026 · **Rama:** `claude/pensive-cray-3lwodm` · **Base:** `0115413` · **Entorno:** Node 22.23.4, Chromium con Playwright · **Datos:** inventados (DNI `96…`) y la semilla de 20 pacientes simulados; el servidor de prueba usó una carpeta temporal y nunca `server/db/`.

**Alcance** (reducido por la sección 8 de `F4_correcciones.md`):
1. Revisar contra la norma el semáforo, el motor HEARTS, los indicadores del convenio y `padronCalculadora.js`.
2. Preparar las preguntas para la licenciada de crónicos.
3. Auditar de forma sistemática los sumideros de HTML del cliente.
4. Validar la precarga por DNI por rol, red y establecimiento.

**No se cambió código del cliente ni del servidor.** Esta fase audita y separa lo clínico de lo técnico (regla del plan). Lo clínico no se puede corregir sin la licenciada; lo técnico queda listo para una ventana de correcciones con prueba que falle antes (sección 10). Edward no pidió «corrige» en esta ventana, a diferencia de las Fases 2 y 4.

Regla de evidencia: cada hallazgo dice si se **reprodujo** (y dónde) o si es **solo por lectura**. Lo que depende de un criterio clínico se presenta como **pregunta**, no como error.

## 1. Resultado

- **37 hallazgos distintos: 0 críticos, 10 altos, 16 medios, 10 bajos y 1 informativo.** Son 11 clínicos (K3), 6 técnicos del motor clínico (T3), 7 del cliente (C3) y 15 de la precarga (P3; dos repiten a K3-01 y T3-06, por eso no se cuentan dos veces). Cada uno dice si se **reprodujo** o es **solo por lectura**.
- **Lectura clínica (mía, a validar con la licenciada):** el semáforo por fechas y los indicadores del convenio están bien construidos (el tablero declara las cuatro definiciones de «controlado»). Lo que **no cumple** la guía ni la vía son tres cosas: **el estado de control que se guarda** (K3-01: HbA1c 11 % queda «Controlado»; la pantalla dice lo contrario), **la regla de 30 / 90 días** (K3-04: no se aplica en ningún sitio) y **el trato de los fallecidos** (K3-02: siguen como desertores y pueden recibir WhatsApp). Mientras no se corrijan, el personal no debería decidir con el estado de control ni con la periodicidad que muestra el sistema.
- **La guía interna del repo no coincide con la vía HEARTS en tres puntos** (HbA1c, meta en alto riesgo y «o glucosa en ayunas»). Hay que corregirla o confirmarla; las preguntas están en la sección 7 (19 en total).
- **Cliente:** 62 sumideros de HTML, 58 seguros o no alcanzables, 4 con algún valor sin escape. **La CSP de la Fase 4 funcionó: no se ejecutó código inyectado en ninguna prueba.** Lo que ella no impide es HTML inyectado: C3-01 permite que un botón inyectado por la API actúe con la sesión de la víctima (cerrarla, escribir una pre-cita). C3-02: la cuadrícula del padrón sobrevive al cierre de sesión y un segundo usuario ve sus filas.
- **Precarga por DNI:** funciona por rol, red y establecimiento y la lectura fuera del alcance es indistinguible de un inexistente (404 idéntico, mismo tiempo). **Pero guardar sin tocar escribe datos que nadie registró** y puede falsear un control o perder una atención (P3-01 a P3-07, siete altos).
- **No se cambió código.** Esta fase audita; la ventana de correcciones (sección 10) queda lista y se puede abrir ya.

## 2. Contra qué se contrastó (y qué no se pudo)

| Fuente | Qué es | Límite |
|---|---|---|
| `docs/GUIA_NORMA_HEARTS.md` | **Guía interna del proyecto**, no es una norma | Sus cifras no coinciden con la vía en tres puntos (abajo) |
| Skill `dominio-salud-peru:enfermedades-cronicas-peru` y sus *references* 02, 04 y 06 (corte 12-oct-2026) | Resume la vía HEARTS, el PP 0018 2026, el manual HIS 2025, la GPC del INS 2026 y la GPC del IETSI 2025 | Es un resumen. El texto íntegro de las normas está en el corpus de Edward y **no estuvo conectado** |
| El código del cliente | Lo que hace hoy | Se ejecutó (sondas), no solo se leyó |

**`[PENDIENTE]` que cierra el corpus o la licenciada:** (1) la lista de CIE-10 del Anexo 04 del convenio y la ficha IP04; (2) el texto de la vía HEARTS para cotejar «< 7 %» y la meta diastólica; (3) la norma de valoración nutricional del adulto mayor; (4) la tabla de riesgo cardiovascular que usa el programa.

| Criterio | Guía interna del repo | Fuentes de dominio | Código hoy |
|---|---|---|---|
| Meta de PA | < 140/90; < 130/80 en alto riesgo | Vía HEARTS, PP 0018, manual HIS e IP04: < 140/90, y sistólica < 130 en alto riesgo (ECV, DM, ERC o riesgo ≥ 10 %). GPC del INS 2026: PAS < 130 (PAD < 80) bajo 65 años, < 140 desde los 65 | Motor y tablero: 140/90 para todos. Ficha del paciente: 130/80 si hay DM, ERC o ECV, **sin** mirar el riesgo ≥ 10 % |
| HbA1c | **≤ 7,0 %** o glucosa en ayunas < 130 | **< 7 %** (< 8 % en adultos mayores o con comorbilidad grave). PP 0018 2026: dos glucemias de 70 a 130 **o** HbA1c < 7 %. IETSI 2025: 7,5–8,5 % desde los 65 | < 7,0 para todos, y glucosa 70–130 **además** (exige ambas) |
| «Controlado» | 3 o más controles estables | Cuatro definiciones en uso: HEARTS (última medición), manual HIS (3 últimas), PP 0018 2026 (4 de 6), SIS IP04 (≥ 2 controles y una PA < 140/90) | Motor: una medición o la etiqueta guardada. Tablero: calcula las cuatro y declara cuál es cada una |
| Periodicidad | 30 días no controlado, 90 controlado | Mensual hasta la meta y trimestral con tres controles en meta; receta para 3 meses | Solo texto: no valida nada |
| Semáforo | Verde > 7 días, amarillo 1–7, rojo ≥ 1 día vencido | — | Verde > 7, amarillo 0–7, rojo < 0 (el día 0 no está definido en la guía) |
| Exámenes | — | HbA1c cada 6 meses; creatinina, TFGe, albuminuria y lípidos cada año; pie; fondo de ojo cada 1–2 años | «HbA1c anual», y solo mira si hay un valor, no su fecha |
| Diagnósticos | HTA I10, DM2 E11 | Manual HIS, «códigos más usados» (no es una lista cerrada del programa): I10, I11.0, I11.9; E10.x, E11.0–E11.9, E13–E14 | Motor: solo I10 y E11. El padrón admite I10–I15 y E10–E14 |

**Tres puntos donde la guía interna no coincide con la vía:** HbA1c (≤ 7,0 frente a < 7), la meta de PA en alto riesgo (130/80 frente a sistólica < 130, sin fijar la diastólica) y el «o glucosa en ayunas < 130», que no consta en lo que trae la skill. El código sigue la vía en HbA1c; **la guía debe corregirse o confirmarse**. Cuando dos fuentes chocan, no se resuelve en silencio: la decisión es de Edward con la licenciada (sección 7).

La guía tampoco recoge dos decisiones que el código ya tomó: el aviso de WhatsApp **no lleva nombre, diagnóstico ni hora** (privacidad), y el consentimiento se exige antes de generar el enlace.

## 3. Errores clínicos (lo que el personal lee o decide)

Cada uno remite a una sonda ejecutable (`C1`, `C2`, `C3`, `C4` en `evidencia/f3/`). «Quién decide»: **Técnica** si no hay criterio clínico de por medio; **Licenciada** si hace falta su respuesta (sección 7).

| ID | Sev. | Qué pasa | Base | Evidencia | Quién decide |
|---|---|---|---|---|---|
| K3-01 | **Alta** | **El estado de control que se guarda ignora la HbA1c y la meta por diabetes.** En el Registro Clínico, `estado_control = (pas >= 140 \|\| pad >= 90) ? 'No Controlado' : 'Controlado'` (`registroClinicoModal.js:1117`). Sin PA, `null >= 140` es falso y queda «Controlado». **La propia pantalla lo contradice**: dice «HbA1c en meta: No» y se guarda «Controlado». Con un diabético e hipertenso con 135/85 y HbA1c 6,5 % pasa igual: la pantalla dice «FUERA DE META» y se guarda «Controlado». Con esa etiqueta el servidor asigna 90 días (`apiRoutes.js:202-205`) y el motor, 90 (`I2`). Lo mismo hace `hosixParser.js:129` | Guía §2; vía HEARTS | **Reproducido** en Chromium (`C3`, casos 1 y 2), `C1` I1–I3 y H4 | Licenciada (qué es «controlado»); evitar «Controlado» sin datos es técnico |
| K3-02 | **Alta** | **Un paciente marcado «Fallecido» sigue como desertor y puede recibir WhatsApp.** La interfaz y la cuadrícula envían `estado_paciente = "Fallecido"`, pero nadie fija `fallecido = true`; el semáforo solo mira ese campo. Con el servidor real: el paciente sale **rojo** y suma a los desertores, igual que un activo con la misma cita vencida; con `fallecido:true` (que la interfaz nunca envía) sale negro. `generateLink` tampoco excluye fallecidos. La semilla trae fallecidos con el campo bien puesto, por eso ninguna prueba lo vio | Guía §3 (negro: excluir de la programación) | **Reproducido** con el servidor real (`C2`) y `C1` B1, G1, G2 | Técnica |
| K3-03 | **Alta** | **El aviso de WhatsApp le dice al paciente una fecha que no es la de su cita.** `main.js:1962-1966` usa «hoy + 3 días» del navegador, no su próxima cita. Medido: el mensaje decía `8/11/2026`; su cita real era el 5/12/2026 (y el «hoy + 3» de Lima era el 7/11) | Guía §4 (fecha y hora de la cita confirmada) | **Reproducido** en Chromium (`C3`) | Técnica; confirmar con Admisión de dónde sale la fecha |
| K3-04 | **Alta** | **La regla de 30 / 90 días no se aplica en ningún sitio.** (a) El semáforo no usa `frecuencia_hearts`: un no controlado (170/100) con cita a 200 días sale **verde** (`B3`). (b) El formulario propone siempre «hoy + 30» (31 de noche, ver T3-04), también al controlado: con 120/70 y HbA1c 6,0 no cambió la propuesta (`C3`, caso 3). (c) Nada avisa si la cita excede el intervalo. (d) La semilla trae 2 pacientes con 60 días y 2 con 0, valores que la guía no contempla. (e) La ficha usa 90 como valor por defecto (`main.js:1400, 1426`) y otra celda, 30 (`main.js:1640`) | Guía §2; manual HIS | **Reproducido** `C1` B3 y `C3`; (d) por conteo de la semilla; (e) por lectura | Licenciada |
| K3-05 | Media | **«Controlado» con una sola medición, y la etiqueta guardada manda sobre la cifra.** Con 120/70 una vez: «Controlado», 90 días (`C9`). Con la etiqueta «Controlado» y PA 190/110: sigue «Controlado» (`C1`). La ficha muestra «Sí (Parcial)» con una medición (`E7`) | Guía §2 y manual HIS: tres controles en meta | **Reproducido** (`C1`) | Licenciada |
| K3-06 | Media | **El rojo significa «pasó la fecha de la cita», no «no vino».** Un paciente que **sí asistió** (control registrado ese día) y aún no tiene otra cita aparece rojo, «desertor», hasta que alguien programe la siguiente (`B2`). Además `main.js:1426` dice «Seguimiento al día **en meta terapéutica**» para todo verde, y verde solo significa «cita lejana» | Guía §3 («Inasistente») | **Reproducido** `C1` B2; el texto, por lectura | Licenciada |
| K3-07 | Media | **Tres metas de PA para el mismo paciente.** DM2 con 135/85: ficha «NO en meta» (130/80), motor «controlado» (140/90) y tablero «en meta» (140/90) (`D1`). Riesgo CV 25 % sin DM/ERC/ECV: la ficha usa 140/90 aunque la guía y la vía piden más estricto (`D2`). La HbA1c es < 7 para todas las edades (`E10`: 75 años con 7,5 % sale «No») | Guía §2; vía HEARTS; GPC INS 2026 | **Reproducido** (`C1`) | Edward + licenciada |
| K3-08 | Media | **El motor solo reconoce I10 y E11.** I11–I15 y E10, E13, E14 quedan sin evaluar, aunque el padrón los admite y el manual HIS los incluye. El texto «diabetes tipo 1» se cuenta como DM2 (`C5`, `C6`, `C6b`) | Manual HIS | **Reproducido** (`C1`) | Licenciada (¿entra la DM1?) |
| K3-09 | Media | **Valores por defecto que se muestran como dato clínico.** TFGe con **edad supuesta de 50 años** si no hay fecha de nacimiento: con creatinina 1,4 sale 46 (G3a); a los 80 años sería 38 (G3b) (`E1`). «Medicación hasta» supone 1 mes si falta (`E2`). `cie10_dm = "-"`, `"No"` o `"Ninguno"` cuenta como diabetes y sube el riesgo a «Alto» (`E6`). «Qué le falta» dice «Al día» con una HbA1c y un examen de pie de hace más de 4 años (`E5`) | Vía HEARTS (exámenes periódicos) | **Reproducido** (`C1`) | Mixta |
| K3-10 | Media | **La importación del CSV de HOSIX inventa datos.** Sin diagnóstico pone «I10 / Hipertensión Arterial»; sin documento, «DNI-1»; sin nombre, «PACIENTE REGISTRADO»; y **todo código que no empiece con I se rotula «Diabetes Mellitus Tipo 2»** (N18.3, una enfermedad renal, sale como diabetes) (`H1`–`H4`). Contradice la decisión «documento obligatorio» | Decisión de Edward 05/11/2026 | **Reproducido** (`C1`); qué hace el servidor con «DNI-1», sin probar con este parser | Técnica |
| K3-11 | Baja | **Indicadores del convenio: definiciones por cerrar.** (a) «Atendido»: la cabecera dice «al menos un control» y el código también cuenta un examen (`F1`). (b) Solo el fallecido sale del denominador; «Cambió de residencia» y «Abandono» siguen (`F2`). (c) Deja fuera I15.0 por el Anexo 04 (`F3`). (d) Las columnas `pas_ene…pas_dic` **no tienen año** y el periodo por defecto es 2026: en enero de 2027 el padrón no distingue un año de otro (por lectura) | Convenio SIS–GORE | `C1` F1–F3 | Licenciada y SIS; (c) `[PENDIENTE: Anexo 04]` |

## 4. Errores técnicos del cliente clínico

| ID | Sev. | Qué pasa | Evidencia |
|---|---|---|---|
| T3-01 | Media | **Las fechas `AAAA-MM-DD` se leen como UTC y corren un día en Lima.** `padronCalculadora.evaluarCita` y `heartsEngine` usan `new Date('2026-11-04')`. En el formulario real, en hora de Lima: una cita de **hoy** muestra «Vencida hace 1 día», ROJO; a +8 días, «En 7 días», AMARILLO; la de ayer, «2 días». No depende de la hora. `semaforo.js` lo hace bien. El mismo error se corrigió para la edad en la Fase 4 (C-06) | **Reproducido** en Chromium con `timezoneId: America/Lima` (`C4`) y `C1` A1–A6 (en UTC dan OK) |
| T3-02 | Media | **Hay tres implementaciones del semáforo y del estado de control.** `semaforo.js` se declara «única fuente de verdad», pero `heartsEngine.js` y `padronCalculadora.evaluarCita` repiten la lógica con otras reglas: `heartsEngine` no distingue fallecidos ni HOSIX, `padronCalculadora` no distingue HOSIX, y los dos leen la fecha en UTC. Es la causa de T3-01, de K3-07 y de que el tablero y la ficha puedan discrepar. `heartsEngine.js` **no tiene ninguna prueba automática** (los demás módulos clínicos sí) | Por lectura y `C1`; búsqueda en `server/tests/` |
| T3-03 | Baja | `heartsEngine.evaluatePatient` **reordena la lista de observaciones** del paciente (`sort` en el sitio) y **lanza `RangeError`** con una fecha de cita inválida. Ya constaba como F20 / T-13 y sigue abierto | **Reproducido** (`C1` C7, C8) |
| T3-04 | Baja | La próxima cita que propone el formulario y la fecha del aviso usan la fecha UTC o la del navegador. De noche en Lima la propuesta sale un día adelantada (31 días en vez de 30) | **Reproducido** (`C3`, de noche, ≈23:30 en Lima); antes de las 19:00 las dos fechas coinciden |
| T3-05 | Media | **Valores por defecto «a prueba de todo» que abren en verde y «Controlado».** Si `HeartsEngine` no carga, todo lo que se importa queda `green` y `Controlado` (`padronGridModal.js:710`, `hosixParser.js:71`). Si no carga el geocodificador, el paciente queda en las coordenadas del hospital con `matched: true` (`padronGridModal.js:709`, `registroClinicoModal.js:1075`). Lo normal es que carguen (el service worker los guarda), por eso es raro, pero el fallo es en silencio | Solo por lectura |
| T3-06 | Baja | `alerta_del_dato` marca **todo carné de extranjería y pasaporte** como «DNI no tiene 8 dígitos». Desde la decisión del 05/11 son documentos válidos | **Reproducido** (`C1` E3, E4) |

## 5. Auditoría del cliente: sumideros de HTML, salida de datos y sesión

**Método.** Inventario estático de todos los sumideros de `client/index.html`, `client/js/**` y `client/sw.js` (cada contexto leído, no solo buscado), y reproducción en Chromium contra el servidor real con datos hostiles puestos por la vía legítima (`A2`); después, la red y el almacenamiento durante una sesión completa (`A3`). El inventario con archivo:línea está en `A1_sumideros_estatico.txt`.

### 5.1 Sumideros de HTML

| Grupo | Sumideros | Veredicto |
|---|---:|---|
| Solo texto, íconos o números | 21 | Seguro |
| Datos de usuario, API, Excel o HOSIX, con escape correcto en todos los valores | 19 | Seguro |
| Datos estáticos del paquete (GeoRIS, catastro, catálogo), sin escape | 18 | No alcanzable salvo con un despliegue alterado. En los 5 MB, 0 coincidencias de `<`, `>`, `&`, comilla invertida o `javascript:` |
| Con al menos un valor de usuario **sin escape** | 4 | **Riesgo** (C3-01 a C3-04) |
| **Total** | **62** (42 `innerHTML` con contenido y 20 de Leaflet) | 58 seguros o no alcanzables |

Además: 10 vaciados con `innerHTML = ''`, y 7 de URL, navegación y descargas (`window.open`, CSV, XLSX), todos seguros. Los atributos armados con datos (`title`, `data-*`, `value`, `class`, `style`) también.

- **`acciones.js`:** con 19 nombres ajenos (`__proto__`, `constructor`, `eval`, `Function`…) hubo 0 llamadas y 0 errores. Los argumentos con comillas, comilla invertida y `${…}` llegan como texto (variable centinela = 0). Las 33 acciones de clic y las 6 de cambio son exactamente las que usan la página y las plantillas.
- **Lo que defiende el servidor:** rechaza `<` y `>` en 16 campos de texto corto (nombre, historia clínica, teléfono, sector, CIE-10, diagnósticos y estados: 400); descarta lo no numérico en `edad`, `dias_*` y `frecuencia_hearts`; exige fecha ISO. **Guarda tal cual** (hasta 4 000 caracteres) la dirección, el seguro, los tratamientos, las observaciones y `nota_duplicado_padron`, entre otros. El cliente los escapa, salvo el último.
- **CSP** (`script-src 'self'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`): **en todas las pruebas no se ejecutó ningún código inyectado** (centinela = 0; los manejadores y scripts en línea quedaron bloqueados). La Fase 4 cumplió su objetivo. Lo que sigue es lo que la CSP no puede impedir: HTML inyectado.

### 5.2 Hallazgos del cliente

| ID | Sev. | Qué pasa | Estado |
|---|---|---|---|
| C3-01 | Media | **HTML guardado por la API se pinta sin escape en la ficha** (`main.js:1661`, `nota_duplicado_padron`; la escribe un ADMIN o COORDINADOR). Es el único campo que llega a ser elemento por la vía real. No ejecuta scripts, pero **un botón inyectado con `data-accion` actúa con la sesión de quien lo pulsa**: `clicEn` con `btn-logout` cerró la sesión de la víctima y `confirmarPreCita` **escribió una pre-cita en el servidor** con su sesión. También se reprodujeron un `div` a pantalla completa que tapa la aplicación (suplantación visual), un enlace a un sitio externo y un `<meta refresh>` que saca al usuario de la aplicación. No pudo enviar formularios fuera ni cambiar `base` (CSP). Lo agrava que `clicEn`, `quitarElemento` y `cerrarModal` aceptan **cualquier id** de la página | **Reproducido** (`A2`, partes 1 y 3a) |
| C3-02 | Media | **La ventana del padrón y la del Registro Clínico no se cierran ni se vacían al terminar la sesión**, y su `z-index` (99999 y 9999) supera al de la pantalla de acceso (3000). Un coordinador de otra red (0 pacientes en su alcance) que entra en el mismo navegador **ve las filas del usuario anterior** al abrir «Padrón»; además el clic sobre «Ingresar» lo recibe la cuadrícula. Es la misma clase de fallo que C-04, que la Fase 4 corrigió para el tablero pero no para esta ventana. Tampoco se cierra con el cierre por inactividad | **Reproducido** (`A3` §6) |
| C3-03 | Baja | Valores sin escape que hoy el servidor filtra: `edad` (`main.js:1100`), `fecha_*` (`main.js:1343, 1360, 1378, 1396, 1423, 1602`) y `frecuencia_hearts` (`mapManager.js:831`). Si el filtro del servidor cambiara, serían inyección | **Reproducido** en memoria (`A2`, parte 2) |
| C3-04 | Baja | El pin de búsqueda del mapa pinta sin escape lo que escribe el propio usuario (`mapManager.js:1092`, con `main.js:935`): autoinyección | **Reproducido** (`A2`, 3c) |
| C3-05 | Baja | **Salida de datos a terceros.** Los mosaicos del mapa van a Google, Esri, Carto y OpenStreetMap-fr. Al centrar un paciente a zoom 20 se pide un mosaico de ~38 m de lado que **contiene su domicilio**; el proveedor recibe la zona, la IP y el `Referer`, sin nombre ni DNI. WhatsApp recibe el teléfono, la fecha y el establecimiento al hacer clic (sin nombre, DNI ni diagnóstico; con consentimiento, A12). Es una decisión de Edward por la Ley 29733 | **Reproducido** (`A3` §1–2) |
| C3-06 | Baja | Si el servidor rechaza un lote, el cliente igual agrega los pacientes a la memoria y avisa «cargados en pantalla»: quedan filas no guardadas junto a las guardadas (`padronGridModal.js:846-863`) | **Reproducido** (`A2`, 3e) |
| C3-07 | Info | SheetJS 0.20.1 (`client/libs/xlsx.full.min.js`) es anterior a la 0.20.2, que corrige un ReDoS al leer un Excel hostil (CVE-2024-22363, según el subagente). El efecto sería colgar la pestaña de quien lo abre | **Solo por lectura**: versión leída del archivo; la CVE no se verificó aquí |

### 5.3 Qué sale del navegador y qué queda en él

| Qué | Resultado |
|---|---|
| Hosts externos contactados | Mosaicos de mapa (`mt*.google.com`, `server.arcgisonline.com`, `*.basemaps.cartocdn.com`, `*.tile.openstreetmap.fr`) y `wa.me`. **Ninguna fuente, script ni hoja de estilos externos**; solo peticiones GET, sin cookies ni cuerpo de la aplicación; 0 URLs externas con DNI, teléfono o nombre (salvo `wa.me`, que lleva el teléfono por diseño) |
| Geocodificador | Sin red: usa un catálogo local |
| Token de sesión | En `sessionStorage` (accesible por scripts del mismo origen; la CSP impide ejecutar los inyectados). Sin cookie, así que no hay CSRF clásico. Vence a las 8 h y la inactividad cierra a los 30 min |
| `localStorage`, IndexedDB, cookies | Vacíos |
| Cache Storage | 41 entradas, **0 de `/api`**, 0 con datos de pacientes |
| Respuestas de la API | `Cache-Control: no-store` (`private, no-store` en `/api/cronicos` e indicadores) |
| Consola | 319 mensajes, 2 distintos, 0 con DNI o nombres |
| Tras «Cerrar sesión» | El token queda revocado (401); se vacían pacientes, mapa, pre-citas, lista, ficha y tablero. **No se vacía la cuadrícula del padrón** (C3-02) |

## 6. Precarga por documento, por rol, red y establecimiento

**Cómo funciona.** No hay un endpoint de búsqueda: el Registro Clínico **filtra la lista que `GET /api/cronicos` trajo al iniciar sesión**. Al buscar hace 0 llamadas de red. Por eso el alcance de la precarga es el de esa lista, que el servidor ya filtra por rol, red y establecimiento (Fase 2).

**Matriz** (servidor real, semilla de 20 pacientes, usuarios creados por el ADMIN en redes y establecimientos distintos):

| Rol / alcance | Paciente propio | Otra red u otro establecimiento | Inexistente | Guardar |
|---|---|---|---|---|
| ADMIN | Encontrado (DNI, carné de extranjería y pasaporte) | Encontrado (ve todo) | «Paciente Nuevo» | 200 |
| Coordinador Pacífico Sur | Encontrado | «Paciente Nuevo», igual que el inexistente; 404 en la API | «Paciente Nuevo» | Otra red: 403; inexistente: 200 |
| Coordinador Pacífico Sur, solo La Victoria | Encontrado (4 pacientes) | «Paciente Nuevo» (incluido el hospital) | «Paciente Nuevo» | Otro establecimiento: 403 |
| Coordinador Pacífico Norte | Encontrado | «Paciente Nuevo» | «Paciente Nuevo» | Siempre 403 |
| Director | Sin el botón de registro | — | — | 403 |

- **Sin sesión, con token alterado o vencido:** 401 en 14 casos, con el mismo cuerpo exista o no el documento.
- **Lectura fuera del alcance:** idéntica a la de un inexistente en 6 vías de lectura y 4 coordinadores: 404 con `{"error":"Paciente no encontrado"}`; mediana de 1,23 ms frente a 1,22 ms. Sin discrepancias con `scope.js`.

**Veredicto.** La precarga **funciona dentro del alcance** para ADMIN y COORDINADOR con los tres tipos de documento, y la lectura **se niega sin revelar existencia**. Cumple el requisito de Edward en lo que pidió validar. Reservas: **guardar sí revela existencia** (P3-12), la lista no se actualiza durante la sesión (P3-05) y, sobre todo, **los valores por defecto del formulario escriben datos que nadie registró** (P3-01 a P3-04, `B3_valores_por_defecto.txt`).

### 6.1 Hallazgos de la precarga

Todos **reproducidos** con el servidor real, salvo lo indicado. P3-04 repite K3-01 y P3-15 repite T3-06: no se cuentan dos veces.

| ID | Sev. | Qué pasa | Relación |
|---|---|---|---|
| P3-01 | **Alta** | **Guardar sin tocar nada copia el control anterior como si fuera la medición de hoy** (`registroClinicoModal.js:886-893, 1110-1119`), y toma el más antiguo si la lista viene en orden cronológico. Con dos controles (150/95 del 1-jun y 118/74 del 1-oct) el indicador HEARTS pasó de 13/27 a 12/27 | Falsea un control |
| P3-02 | **Alta** | El estado del paciente no se precarga: un **fallecido vuelve a «Activo»** y recibe control y cita | K3-02 |
| P3-03 | **Alta** | **Lo que falta se guarda como dato.** Un paciente con infarto previo (I25.2) y sin el campo quedó con enfermedad cardiovascular «No» y riesgo «Bajo». Guardar sin tocar a uno incompleto escribió 12 valores de entrada y 1 cita, y el semáforo pasó de gris a verde (no inventó mediciones, diagnósticos ni consentimiento) | K3-09 |
| P3-04 | **Alta** | Una HbA1c sin presión deja el control en «Controlado» (`:1117`) | = K3-01 |
| P3-05 | **Alta** | Si un colega creó al paciente **después** del inicio de sesión, sale «Nuevo» y el guardado **sobrescribe** sexo, seguro, estatina, aspirina, meses, enfermedad cardiovascular y establecimiento | — |
| P3-06 | **Alta** | **Se pierde una atención** cuando dos usuarios guardan con listas distintas: los ids de control se asignan por posición (`apiRoutes.js:747`). B guardó 111/71; A, con la lista vieja, guardó 133/83 y la de B desapareció | Pérdida de datos |
| P3-07 | **Alta** | El sexo guardado como `M`/`F` (HOSIX, FHIR y la semilla) no se reconoce en el formulario y la **TFGe se calcula como hombre**: 84 frente a 63 ml/min con creatinina 1,0 en una mujer de 64 años | K3-09 |
| P3-08 | Media | La próxima cita por defecto (+30 días) se guarda como cita y pone el semáforo en verde; la cita ya guardada no se precarga | K3-04, K3-06 |
| P3-09 | Media | Todo código E1x queda como «Diabetes Mellitus Tipo 2» y la fecha de diagnóstico pasa a hoy (`apiRoutes.js:740`): con E10 y diagnóstico de 2019 | K3-08, K3-10 |
| P3-10 | Media | El sector del formulario pisa el de GeoRIS y puede sacar al paciente del alcance de un coordinador con sector | — |
| P3-11 | Media | **Un coordinador de otra red no puede registrar desde la interfaz:** el selector de establecimientos es fijo y el catálogo trae solo 13, todos de Pacífico Sur | — |
| P3-12 | Media | Residual de F2-04: la pantalla dice «Nuevo» y luego el guardado responde 403 «fuera de su alcance» si el paciente existe en otra red. Revela existencia al guardar | — |
| P3-13 | Baja | Un coordinador con establecimiento puede mover a un paciente suyo a otro establecimiento de su red | — |
| P3-14 | Baja | El selector ofrece 4 de los 13 establecimientos y alerta «Falta EESS» | — |
| P3-15 | Baja | Carné de extranjería y pasaporte reciben la alerta «DNI no tiene 8 dígitos» | = T3-06 |

**Por lectura, sin reproducir:** el respaldo del geocodificador con coordenadas fijas y la fecha en UTC (T3-05 y T3-04). **No se pudo comprobar** el formulario con datos reales (solo la semilla y pacientes inventados) ni la precarga en un navegador con hora de Lima (las fechas sí se midieron en Lima con `C4`).

**Valores por defecto** (lista completa con archivo:línea en `B3_valores_por_defecto.txt`):

| Clase | Valores |
|---|---|
| Inocuos | Tipo de documento, consentimiento (vacío y obligatorio), fecha de atención, mes, laboratorio vacío, dirección «Huarmey» (el servidor no deja pisar un dato real con ella) |
| **Registran un dato que no se midió** | Sexo «Femenino», seguro «SIS», diagnóstico confirmado «Sí», enfermedad cardiovascular «No», estatina «No», aspirina «No indicado», 1 mes de medicación, establecimiento «Hospital», sector, estado «Activo», próxima cita +30 días, presión, HbA1c y glucosa del control anterior, «Controlado» sin presión, último control hoy, etiqueta y fecha del diagnóstico, riesgo «Bajo» y «medicación hasta» con 1 mes |

Un administrador que guarda sin tocar a un paciente de otra red **no** lo cambia de red.

## 7. Preguntas para la licenciada de crónicos

Cada pregunta trae lo que hace el sistema hoy, para que responda sí o no. **Hasta que respondan, el sistema no cambia su criterio clínico.**

**Edad**
1. ¿Desde qué edad entra una persona al programa (adultos de 18 años o más)? ¿Qué se hace con un menor con diabetes? ¿Quedan fuera las gestantes (hipertensión o diabetes gestacional)? Hoy no hay límite inferior. (Los indicadores de ENDES miden a personas de 15 años o más, según la skill de dominio.)
2. ¿A partir de qué edad se individualiza la meta? El sistema usa HbA1c < 7 % a todas las edades; la vía fija < 8 % en adultos mayores. La rama «mayor de 65» de la meta de PA existe en el código pero no cambia nada.
3. ¿La valoración nutricional del adulto mayor usa otros cortes de IMC? Hoy se usan los del adulto joven. `[PENDIENTE: norma de valoración nutricional del adulto mayor]`

**Metas y «controlado»**
4. ¿Qué meta de PA rige **para el paciente** (ficha y conducta) y cuál **para el indicador** del convenio? Hoy son tres distintas (K3-07). La vía dice 140/90 y sistólica < 130 en alto riesgo; la GPC del INS 2026 sugiere PAS < 130 desde los 65 hacia abajo.
5. ¿La diastólica < 80 en alto riesgo se exige? La vía solo fija la sistólica.
6. ¿Qué es «alto riesgo»: solo ECV, DM y ERC, o también riesgo cardiovascular ≥ 10 %? ¿Con qué tabla de riesgo y con qué cortes? Hoy: < 5 / 5–9 / 10–19 / ≥ 20 %, y LDL < 70 si es alto, < 100 si no.
7. HbA1c: ¿< 7 % (vía) o ≤ 7,0 % (guía interna)? ¿Se acepta «HbA1c < 7 % **o** dos glucemias de 70 a 130» (PP 0018 2026) o se exigen ambas, como hoy? ¿Una glucosa baja aislada debe volver «No controlado» a quien tiene HbA1c en meta?
8. ¿Cuántos controles en meta hacen «controlado y estable»: tres (guía y manual HIS), cuatro de seis (PP 0018 2026) u otro? ¿Quién decide el paso de 30 a 90 días?
9. ¿Qué definición de «controlado» usa el programa de Huarmey en su tablero? Hay cuatro (HEARTS, manual HIS, PP 0018 2026, SIS IP04).

**Semáforo y periodicidad**
10. ¿El **rojo** significa «pasó la fecha de la cita» o «no vino»? ¿Cómo se cierra una cita a la que el paciente sí asistió (K3-06)?
11. El día de la cita (día 0): ¿amarillo, como hoy?
12. ¿El sistema debe **avisar** cuando la cita programada excede los 30 días (no controlado) o los 90 (controlado)? ¿Existe un intervalo de 60 días? (la semilla trae dos pacientes así).
13. ¿Se mantiene el aviso de WhatsApp sin nombre, diagnóstico ni hora (privacidad), aunque la guía §4 los incluya? ¿De dónde sale la fecha del aviso: de la pre-cita confirmada por Admisión?

**Diagnósticos, altas y bajas**
14. ¿Qué códigos entran al programa: I10–I15 y E10–E14, como admite el padrón, o solo I10, I11.0, I11.9, E10, E11, E13, E14, como el manual HIS? ¿Entra la diabetes tipo 1? (K3-08)
15. **Alta y baja de un diagnóstico:** hoy los diagnósticos solo se acumulan y no hay acción para quitar uno. ¿Quién lo da de baja y por qué causas (error de registro, remisión, diagnóstico descartado)? ¿Debe dejar constancia?
16. Estados del paciente: «Cambió de residencia» y «Abandono (solo después de intentar contactarlo)»: ¿salen del denominador del indicador de control? ¿Quién confirma un fallecimiento y con qué documento?

**Exámenes**
17. ¿Con qué frecuencia se espera HbA1c (6 meses según la vía, «anual» según el sistema), creatinina, albuminuria, perfil lipídico, examen del pie y fondo de ojo? «Al día» debe mirar la **fecha** del examen, no solo que exista el valor.
18. TFGe: ¿se muestra el «estadio de ERC» con una sola creatinina? El estadio exige persistencia y albuminuria. ¿Se rotula «categoría de TFGe»?

**Convenio (con el SIS)**
19. «Atendido» para IP04: ¿un control o también un examen? ¿Se incluye I15.0? `[PENDIENTE: ficha IP04 y Anexo 04]`

## 8. Lo que NO se hizo, y por qué

| Tema | Por qué | Dónde sigue |
|---|---|---|
| **Corregir código** (cliente y servidor) | Edward no lo pidió en esta ventana, a diferencia de las Fases 2 y 4. Lo clínico necesita a la licenciada; lo técnico queda listo, cada hallazgo con su sonda de reproducción | Ventana de la sección 10 |
| Fijar las reglas clínicas (meta de PA, HbA1c, «controlado», 30/90, semáforo) | Es decisión de Edward con la licenciada. Cuando las fuentes chocan no se resuelve en silencio | Sección 7 |
| Corregir `docs/GUIA_NORMA_HEARTS.md` | Depende de las respuestas 4 a 8 | Edward |
| Texto íntegro de las normas: Anexo 04 del convenio, ficha IP04, vía HEARTS, valoración nutricional del adulto mayor, tabla de riesgo CV | El corpus no estuvo conectado a esta sesión | `[PENDIENTE]` de la sección 2 |
| Probar el formulario con datos reales | Los datos reales no entran al repositorio ni a las pruebas; solo a producción | Fase 7 |
| La precarga en un navegador con hora de Lima | No se midió; las fechas sí (`C4`) | Ventana de correcciones |
| Qué hace el servidor con el «DNI-1» que inventa el parser de HOSIX | No se probó con ese parser (K3-10) | Ventana de correcciones |
| Verificar la CVE de SheetJS (C3-07) | Solo por lectura; sin acceso a la base de CVE | Ventana de correcciones (actualizar la librería) |
| L-05, L-07, L-08, L-10, S-09 fuera del servidor, `render.yaml` y CI | Ya estaban fuera de esta fase | Fases 5 y 6 |

## 9. Evidencia

`docs/produccion/evidencia/f3/` (ver su `README.md`). Un resumen de lo medido:

- **Sondas del motor clínico (`C1`), 47 casos:** con `TZ=America/Lima`, 2 correctos, 28 con discrepancia y 17 preguntas; con `TZ=UTC`, 7 correctos, 23 con discrepancia y 17 preguntas. La diferencia entre las dos son las 5 sondas de fechas (T3-01).
- **Extremo a extremo (`C2`):** el «Fallecido» de la interfaz sigue rojo; con `fallecido:true` sale negro.
- **Navegador (`C3`, `C4`, `A2`, `A3`, `B2`, `B3`):** los hallazgos de las secciones 3, 5 y 6.
- **Línea base de `npm test`** antes de empezar: 22 suites, 298 correctas, 0 fallas.
- **`npm test` al cerrar:** 22 suites, 298 correctas, 0 fallas (igual que la línea base, porque esta fase no cambió código); `server/db/` sin `store.json`.

## 10. Siguiente ventana

**Fase 4b — Correcciones de la Fase 3.** Modelo sugerido: **Opus 5.5** (hay pérdida de datos y seguridad; lo mecánico puede ir con Sonnet 5.5). Esta ventana se puede abrir **ya**: no depende de la licenciada, salvo lo marcado en el punto 4.

**Qué leer:**
1. `docs/produccion/PLAN.md`, sección «Arranque de ventana» (rama y dependencias).
2. Este archivo: secciones 3, 4, 5.2, 6.1 y 8.
3. `docs/produccion/evidencia/f3/README.md`.

**Qué hacer, en este orden y con una prueba que falle antes y pase después** (suite nueva `server/tests/testClinicoF3.js` para el motor y comprobaciones en Chromium para lo de pantalla):
1. **Seguridad del cliente:**
   - C3-01: escapar `nota_duplicado_padron`, y limitar `clicEn`, `quitarElemento` y `cerrarModal` a una lista fija de ids.
   - C3-02: cerrar y vaciar la cuadrícula del padrón y el Registro Clínico al salir y al cerrar por inactividad, y corregir su `z-index`.
   - C3-03, C3-04 y C3-06.
2. **Datos y precarga:**
   - P3-01, P3-03, P3-05 y P3-07: no guardar valores por defecto como dato ni copiar el control anterior; refrescar la lista; reconocer `M`/`F`.
   - P3-06: ids de control por contenido y no por posición.
   - P3-02 y K3-02: precargar el estado y fijar `fallecido` desde `estado_paciente` (cliente y servidor); excluir fallecidos del WhatsApp.
   - P3-08 a P3-14.
3. **Motor clínico, lo que no es criterio clínico:**
   - T3-01 a T3-06: que `heartsEngine` y `padronCalculadora` usen `semaforo.js`, fechas locales, y sin fallback «verde / Controlado».
   - K3-03: la fecha del aviso de WhatsApp debe ser la de la cita.
   - K3-10: el parser de HOSIX no inventa datos.
   - K3-09: sin edad supuesta ni «1 mes» por defecto; que «al día» mire fechas.
4. **No tocar** K3-01 (la definición), K3-04 a K3-09 y K3-11 hasta que Edward traiga las respuestas de la sección 7. Lo único seguro de K3-01: no escribir «Controlado» cuando no hay ninguna medición (escribir «Sin datos»).

**En paralelo, Edward:** llevar la sección 7 a la licenciada de crónicos, decidir C3-05 (mosaicos de mapa de terceros) y corregir o confirmar `GUIA_NORMA_HEARTS.md`. Cuando haya respuestas: ventana **4c** (reglas clínicas), y después las Fases 5 y 6.

**Plantilla:**
> Primero el arranque: `git fetch origin && git checkout -B claude/pensive-cray-3lwodm origin/claude/pensive-cray-3lwodm && npm ci --prefix server`. Comprueba que `git branch --show-current` dice `claude/pensive-cray-3lwodm` (la ventana puede abrir en otra rama) y que existe `docs/produccion/PLAN.md`; confirma que `npm test` da 0 fallas.
> Después: lee `docs/produccion/PLAN.md` (sección «Arranque de ventana») y las secciones 3, 4, 5.2, 6.1, 8 y 10 de `docs/produccion/F3_cliente_clinica.md`. Ejecuta la Fase 4b (correcciones de la Fase 3, sin tocar las reglas clínicas que esperan a la licenciada). Trabajo y push en la rama `claude/pensive-cray-3lwodm`, no en la que asigne el entorno. Al terminar: actualiza el estado en el plan, commit y push, y dime la siguiente ventana.
