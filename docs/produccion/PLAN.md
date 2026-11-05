# Plan de paso a producción — Crónicos Huarmey

Documento de traspaso entre ventanas. **Cada fase se ejecuta en una ventana nueva** (sesión limpia).
Al empezar una ventana: **primero el arranque de abajo** (rama y dependencias), y solo entonces leer este archivo y los que la fase pide. Al terminar: marcar la fase aquí, commit y push.

## Arranque de ventana (hacer ANTES de leer nada)
Una ventana nueva puede abrir en **otra rama** (la que le asigne el entorno, por ejemplo `claude/practical-pasteur-…`) y **sin dependencias instaladas**. En ese caso `docs/produccion/` no existe y `npm test` falla con `MODULE_NOT_FOUND`. Pasó al abrir la Fase 3 (05/11/2026). Se evita así:

```bash
git fetch origin
git checkout -B claude/pensive-cray-3lwodm origin/claude/pensive-cray-3lwodm
npm ci --prefix server
git branch --show-current          # debe decir claude/pensive-cray-3lwodm
ls docs/produccion/PLAN.md         # debe existir
```

- Se hace `git fetch origin` **completo**: un `fetch` de una sola rama no siempre crea la referencia remota y el `checkout` posterior falla.
- `checkout -B` reinicia la rama local sobre la remota: vale en una ventana nueva (no hay commits locales). Si hubiera commits sin subir, usar `git checkout claude/pensive-cray-3lwodm && git pull --ff-only`.
- Si el entorno asigna otra rama de trabajo, **manda la de este plan**: es la que lleva todo el trabajo y a ella se hace el push (`git push -u origin claude/pensive-cray-3lwodm`). No trabajar ni subir en la rama asignada por el entorno, ni en `main`.
- `npm test` debe dar 0 fallas **antes de tocar nada** (línea base). Si no, anotarlo en el informe de la fase.

## Decisiones tomadas (no reabrir sin motivo)
- Plataforma: **Render, plan Starter (pago) + disco persistente**. El plan gratuito se usa solo como staging con los 20 pacientes simulados.
- Persistencia: `store.json` en el disco (`DATA_DIR`). **Una sola instancia** (no escala a varias).
- Datos reales de pacientes: **nunca** en el repositorio ni en el historial. Solo se cargan en producción.
- Rama de trabajo: `claude/pensive-cray-3lwodm`. No tocar `main`. No abrir pull request salvo que Edward lo pida.
- Regla de evidencia: nada se afirma sin haberlo ejecutado. Cada hallazgo se reproduce o se marca «solo por lectura».
- **Capacidad (decisión de Edward, 05/11/2026):** la salida en Render es un **prototipo con un máximo de 5 usuarios concurrentes**. La **meta de escalada** es de más de 2 000 usuarios conectados a la vez; con la arquitectura actual (un proceso Node + `store.json`) eso **no se alcanza** (medido en la Fase 1: con 2 000 pacientes y 1 000 conexiones la mediana pasa de 17 s) y se trata como proyecto aparte. La Fase 5 deja documentados el umbral y la ruta de migración (base de datos real, varias instancias, `/api/cronicos` paginado o en caché, límite de tasa compartido); no se rediseña para esa meta en esta salida.
- **Contraseñas (Edward, 05/11/2026):** cada usuario se registra con correo (obligatorio y único), puede cambiar su contraseña y recuperarla con un código de 6 dígitos enviado a ese correo.
- **Documento obligatorio (Edward, 05/11/2026):** para registrar a un paciente debe tener documento (DNI de 8 dígitos, carné de extranjería o pasaporte), también cuando llega por HOSIX o FHIR. No se registran pacientes sin documento: la interfaz, la plantilla y el servidor lo exigen.
- **Requisito funcional (Edward, 05/11/2026):** al escribir el DNI para registrar una atención, el sistema debe **cargar los datos ya guardados del paciente**. Existe (`buscarPacientePorDni`, Registro Clínico) y la Fase 1 lo vio funcionar con el administrador. **Validado en la Fase 3 (05/11/2026):** funciona por rol, red y establecimiento y la lectura fuera del alcance no revela existencia; pero los valores por defecto que rellena escriben datos que nadie registró y pueden falsear un control o perder una atención (P3-01 a P3-07, sección 6 de `F3_cliente_clinica.md`). Se corrige en la Fase 4b.

## Reglas para todas las ventanas
1. Leer este plan y el informe de la fase anterior; no releer todo el código.
2. El trabajo ruidoso (correr suites, explorar muchos archivos) se delega a subagentes que devuelven solo conclusiones.
3. Cada fase deja un archivo en `docs/produccion/` con resultados, evidencia y pendientes.
4. `npm test` debe quedar con 0 fallas antes de cada commit.
5. Un commit por tema, mensaje claro; push a la rama de trabajo al cerrar la fase.
6. Cerrar con un bloque «Siguiente ventana» (qué leer, qué hacer, modelo sugerido).

## Fases

| # | Fase | Modelo sugerido | Entregable | Estado |
|---|---|---|---|---|
| 0 | Plan y traspaso | Sonnet 5.5 | este archivo | HECHO |
| 1 | Diagnóstico en vivo | Sonnet 5.5 | `F1_diagnostico.md` | HECHO (05/11/2026) |
| 2 | Auditoría de seguridad y privacidad del servidor | Opus 5.5 | `F2_seguridad_servidor.md` | HECHO con correcciones (05/11/2026) |
| 3 | Auditoría del cliente, PWA y lógica clínica | Opus 5.5 | `F3_cliente_clinica.md` | HECHO (05/11/2026; solo auditoría, **sin cambios de código**; 37 hallazgos y 19 preguntas para la licenciada) |
| 4 | Correcciones críticas y altas | Opus 5.5 (seguridad) y Sonnet 5.5 (resto) | `F4_correcciones.md` | HECHO (05/11/2026; también medias y bajas) |
| 4b | Correcciones de la Fase 3 (seguridad del cliente, datos y precarga, motor clínico técnico) | Opus 5.5 (Sonnet 5.5 en lo mecánico) | `F4b_correcciones.md` | PENDIENTE (lista, se puede abrir ya; ver sección 10 de `F3_cliente_clinica.md`) |
| 4c | Reglas clínicas (meta de PA, HbA1c, «controlado», 30/90, semáforo) | Opus 5.5 | `F4c_reglas_clinicas.md` | PENDIENTE (espera las respuestas de la licenciada: sección 7 de `F3_cliente_clinica.md`) |
| 5 | Persistencia, respaldos y migración de datos reales | Opus 5.5 | `F5_datos_respaldos.md` | PENDIENTE (avanzada en la Fase 4: guardado con espera máxima, respaldos diarios, prueba de restauración, cifrado opcional) |
| 6 | Infraestructura: Render, CI, repositorio | Sonnet 5.5 | `F6_infraestructura.md` | PENDIENTE (avanzada en la Fase 4: lockfile, Node 22, gzip de estáticos, README) |
| 7 | Staging, puesta en producción y runbook | Sonnet 5.5 (Haiku 5.5 para documentos) | `F7_produccion.md`, `RUNBOOK.md` | PENDIENTE |
| 8 | Revisión final independiente y Go/No-Go | Fable 5.1 | `F8_go_no_go.md` | PENDIENTE |

### Fase 1 — Diagnóstico en vivo
Arrancar el servidor en desarrollo y con `NODE_ENV=production` (debe negarse sin `AUTH_SECRET`). Probar `/health`, login, `/api/cronicos`, `POST /fhir/Bundle`, permisos por rol y red. Abrir el cliente en Chromium (Playwright): mapa, padrón, Excel, sin conexión. Prueba de carga modesta (el código dice soportar 1 000 usuarios: verificarlo). `npm audit`. **Salida:** lista de fallas con pasos para reproducir.
**Cierre:** cada falla tiene severidad (crítica/alta/media/baja) y evidencia.
**Resultado (05/11/2026):** ver `F1_diagnostico.md` — 38 hallazgos (2 críticos, 6 altos, 19 medios, 11 bajos), cada uno con severidad, estado de la evidencia (reproducida / solo por lectura) y fase que lo atiende. `npm test` 226/226 en verde y `npm audit` con 0 vulnerabilidades. Veredicto: funciona en lo central, **no está listo para datos reales**; los críticos son S-01 (secreto y clave de `.env.example` utilizables) y C-01 (XSS almacenado). «1 000+ usuarios» no se sostiene desde una sola IP. Scripts y mediciones en `docs/produccion/evidencia/f1/`.

### Fase 2 — Seguridad y privacidad del servidor
Autenticación y sesiones (token de 8 h sin renovación), alcance por red y establecimiento, validación de entradas, CORS (revisar el valor por defecto sin lista de orígenes), CSP, límites de tasa en memoria, inyección y contaminación de prototipos, manejo de errores, registros sin datos de pacientes, `ADMIN_RESET`, secretos, dependencias, cifrado en reposo. Intentar explotar cada hipótesis antes de reportarla.
**Cierre:** cada hallazgo marcado reproducido / solo por lectura / descartado.
**Resultado (05/11/2026):** ver `F2_seguridad_servidor.md`. Por instrucción de Edward («Ejecuta todas las correcciones»), la fase auditó **y corrigió**. Hubo 21 hallazgos (2 críticos, 5 altos, 8 medios, 6 bajos), 11 de ellos nuevos: escritura cruzada de red por `importar-lote`, bitácora que se vacía sin sesión, cuerpos de 10 MB leídos sin sesión, oráculo de existencia entre redes, sector por subcadena, `ADMIN_RESET` que revierte la clave, permisos 644 de `store.json`, entre otros. Quedan 20 corregidos y 1 en parte: la CSP aún necesita `'unsafe-inline'` en `script-src` por los 69 manejadores en línea del cliente. También se corrigió el XSS C-01 en el cliente. La suite nueva `server/tests/testSeguridadF2.js` (37 comprobaciones) fallaba en 34 antes de corregir; ahora `npm test` da 263 correctas y 0 fallas, y `npm audit` 0 vulnerabilidades. El humo del cliente real en Chromium no muestra violaciones de la CSP. **Cambia el comportamiento** (sección 6 del informe): 404 para pacientes fuera del alcance, `/fhir` solo con recursos FHIR, importación más estricta, CORS cerrado y cupos por usuario. Lo que no se hizo y por qué: el cifrado en reposo pasa a la Fase 5 (custodia de la clave) y la retención de la bitácora también. Scripts y salidas antes y después en `docs/produccion/evidencia/f2/`.

### Fase 3 — Cliente, PWA y lógica clínica
XSS y renderizado de datos, service worker (qué datos de pacientes quedan en caché sin conexión y por cuánto), manejo de sesión, importación y exportación de Excel, semáforo, indicadores del convenio y reglas HEARTS contra `docs/GUIA_NORMA_HEARTS.md`. Pendientes ya conocidos en `docs/HANDOFF.md` (por ejemplo, pre-cita que muestra éxito aunque el servidor falle, cotejo de redes).
Incluye la **precarga por DNI** del Registro Clínico (requisito de Edward, ver «Decisiones tomadas») y los hallazgos C-xx de `F1_diagnostico.md`.
**Cierre:** errores clínicos separados de errores técnicos; los clínicos se validan con la licenciada de crónicos.
**Resultado (05/11/2026):** ver `F3_cliente_clinica.md`. Fase de **auditoría: no se cambió código** (Edward no pidió «corrige» en esta ventana; lo clínico necesita a la licenciada y lo técnico queda listo para la 4b). Hubo **37 hallazgos distintos: 0 críticos, 10 altos, 16 medios, 10 bajos y 1 informativo**, cada uno marcado reproducido o solo por lectura:
- **Clínicos (11):** el estado de control que se guarda ignora la HbA1c (HbA1c 11 % queda «Controlado» aunque la pantalla diga «No»); la regla de 30 / 90 días no se aplica en ningún sitio; un paciente marcado «Fallecido» sigue como desertor y puede recibir WhatsApp; el aviso de WhatsApp dice una fecha que no es la de la cita; tres metas de PA distintas en tres módulos; valores por defecto que se muestran como dato (TFGe con edad supuesta de 50 años). La guía interna `GUIA_NORMA_HEARTS.md` no coincide con la vía HEARTS en tres puntos.
- **Cliente (7):** 62 sumideros de HTML, 58 seguros o no alcanzables y 4 con algún valor sin escape. La CSP de la Fase 4 funcionó: ninguna prueba ejecutó código inyectado. Pero un `nota_duplicado_padron` con HTML guardado por la API puede inyectar un botón que actúa con la sesión de la víctima (C3-01), y la cuadrícula del padrón sobrevive al cierre de sesión (C3-02). Los mosaicos del mapa envían a Google, Esri, Carto y OSM la zona que se mira (C3-05).
- **Precarga por DNI:** funciona por rol, red y establecimiento y no revela existencia al leer. Pero guardar sin tocar nada escribe valores que nadie registró y puede falsear un control o perder una atención (P3-01 a P3-07, siete altos).
- `npm test`: 22 suites, 298 correctas, 0 fallas. Evidencia en `docs/produccion/evidencia/f3/`.

### Fase 4 — Correcciones críticas y altas
Corregir en orden de gravedad con prueba que falla antes y pasa después. Seguridad y datos primero. Lo medio y bajo queda en lista, no se mezcla.
*Nota (Fase 2):* las correcciones del servidor (S-01 a S-07, S-11 a S-13, S-16, C-01 y los hallazgos F2) ya están hechas y probadas. La Fase 4 queda para lo que encuentre la Fase 3 en el cliente y la lógica clínica, salvo que esa fase también corrija.
**Resultado (05/11/2026):** ver `F4_correcciones.md`. Por instrucción de Edward («Corrige todo») se corrigió todo lo abierto de las Fases 1 y 2 que no depende de la licenciada ni de Render:
- La CSP queda sin scripts en línea (69 manejadores pasados a delegación; un HTML inyectado ya no ejecuta código).
- C-02 a C-14 corregidos. El consentimiento sigue obligatorio al importar (requisito A12).
- Pendientes del cliente de la Fase 2 resueltos.
- Persistencia: espera máxima de 2 s (L-04), un solo formato (S-14), transacciones todo o nada, respaldo diario con prueba de restauración (S-09 local) y cifrado en reposo **opcional** con `STORE_KEY` (apagado por defecto).
- Instalación: gzip de estáticos (≈6,4 → ≈1,4 MB), `npm ci` y Node 22 (S-10), y sin cifras sin sustento (L-11).
- 3 hallazgos nuevos corregidos. El más grave, F4-02: cada atención en Registro Clínico borraba la dislipidemia.
- `npm test`: 283 correctas, 0 fallas (con las decisiones de Edward de la sección 9: 22 suites, 298 correctas, 0 fallas). Chromium: 32 de 32 acciones y 19 de 19 comprobaciones del cliente, sin violaciones de la CSP.
- Decisiones tomadas por defecto (sin internet solo aviso, cifrado apagado, 30 min de inactividad, diagnósticos acumulados): sección 5 del informe. Para «Sin documento», Edward decidió después que el documento es obligatorio.

### Fase 5 — Persistencia, respaldos y datos reales
*Ya hecho en la Fase 4:* espera máxima del guardado, formato único, transacciones con reversión, respaldo diario local con prueba de restauración y cifrado opcional (`STORE_KEY`). Falta: copia cifrada **fuera** del servidor, retención de la bitácora, procedimiento de carga del padrón real y umbral o ruta de migración (L-05, L-07, L-08).
`DATA_DIR` en el disco de Render, escritura atómica y recuperación (`store.json.bak`), crecimiento de `store.json` y de la bitácora, respaldo automático y cifrado fuera del servidor, **prueba de restauración**, procedimiento de carga del padrón real (sin pasar por Git), umbral para migrar a SQLite o Postgres.

### Fase 6 — Infraestructura
*Ya hecho en la Fase 4:* lockfile único con `npm ci` (S-10), Node 22 fijado, gzip de estáticos (S-08), `.env.example` sin claves y README de despliegue actualizado. Falta: `render.yaml`, GitHub Actions, Dependabot, escaneo de secretos, `LICENSE` y verificar `TRUST_PROXY` en Render (L-10).
`render.yaml` (Blueprint), versión de Node fija, `package-lock.json` único, healthcheck, variables de entorno (`AUTH_SECRET`, `ADMIN_PASSWORD`, `TRUST_PROXY`, `DATA_DIR`), `.env.example` sin claves reales, `LICENSE`, GitHub Actions con `npm test`, Dependabot, escaneo de secretos, README de despliegue.

### Fase 7 — Staging y producción
Desplegar primero en staging con datos simulados; humo contra la URL pública; luego producción con disco; carga del padrón real; primer usuario administrador; monitoreo de disponibilidad; plan de reversión; `RUNBOOK.md` (reinicio, restauración, rotación de claves, alta de usuarios).

### Fase 8 — Revisión final independiente
Un modelo distinto revisa el diff completo y la lista de hallazgos sin ver mis conclusiones. Decide Go / No-Go con condiciones.

## Pendientes que NO son técnicos (los decide Edward)
- Inscripción del banco de datos personales y base legal del tratamiento (Ley 29733); transferencia fuera del Perú (Render no tiene región en Lima).
- Quién valida las reglas clínicas y quién administra usuarios.
- Presupuesto mensual (Starter + disco, aprox. US$ 8).
- ~~Capacidad objetivo~~ — **RESUELTO el 05/11/2026**: ≤ 5 usuarios concurrentes en Render; escalada de 2 000+ como proyecto aparte (ver «Decisiones tomadas»).
- Trabajo sin conexión (Fase 1): «sin conexión» = abrir y usar la app **sin internet** (hoy no funciona y no deja datos en el dispositivo). **Pendiente de que Edward confirme** si lo quiere o basta un aviso claro; la precarga por DNI que pidió es otra cosa y no depende de estar sin red.
- ~~Tamaño de la instancia~~ — con ≤ 5 usuarios la memoria no es un riesgo (70 MB al inicio); queda solo confirmar el plan de Render en la Fase 6.
- Rotación de secretos (Fase 2): si alguna vez se desplegó con los valores del antiguo `.env.example`, cambiar `AUTH_SECRET` y la clave del ADMIN. Siguen en el historial de Git.
- ~~Pacientes sin documento~~ — **RESUELTO el 05/11/2026 por Edward: para registrar a un paciente el documento es obligatorio** (DNI, carné de extranjería o pasaporte). La pantalla y el servidor rechazan «Sin documento».
- ~~Integración HOSIX~~ — **RESUELTO el 05/11/2026 por Edward: por HOSIX también llegan carnés de extranjería y pasaportes.** Implementado: los conectores y FHIR aceptan DNI, CE y pasaporte (ver `F4_correcciones.md`, sección 9). Falta confirmar con SIVSA cómo envía el tipo de documento.
- ~~Claves de usuario~~ — **RESUELTO el 05/11/2026 por Edward: cada usuario se registra con correo, cambia su contraseña y la recupera con un código enviado al correo.** Implementado (sección 9 de `F4_correcciones.md`). **Falta elegir el proveedor de correo** (Resend o Brevo), verificar el dominio remitente y cargar `MAIL_PROVIDER`, `MAIL_API_KEY` y `MAIL_FROM` en Render. También falta poner el correo a los usuarios que ya existan y definir `ADMIN_EMAIL`.
- Cifrado en reposo (Fase 2 → Fase 5): ¿quién custodia la clave? Si se pierde, se pierde el padrón. *Fase 4:* ya está implementado y apagado; se activa definiendo `STORE_KEY` en Render cuando se decida la custodia.
- **Preguntas para la licenciada de crónicos (Fase 3):** 19 preguntas sobre edad, metas, «controlado», semáforo, alta y baja de diagnósticos, estados del paciente, exámenes y convenio (sección 7 de `F3_cliente_clinica.md`). Hasta que respondan, el sistema no cambia su criterio clínico. Las respuestas abren la ventana 4c.
- **Corregir o confirmar `docs/GUIA_NORMA_HEARTS.md`** (Fase 3): no coincide con la vía HEARTS en HbA1c (≤ 7,0 frente a < 7), en la meta de PA en alto riesgo y en el «o glucosa en ayunas < 130».
- **Mosaicos de mapa de terceros** (Fase 3, C3-05): al ver a un paciente, Google, Esri, Carto y OpenStreetMap reciben la zona (hasta ~38 m a zoom 20), con la IP del usuario, sin nombre ni DNI. Decidir si se aceptan, se limita el zoom o se sirven mosaicos propios (Ley 29733).
- **Corpus no conectado en la Fase 3:** falta confirmar con el texto íntegro el Anexo 04 y la ficha IP04 del convenio, la vía HEARTS, la valoración nutricional del adulto mayor y la tabla de riesgo cardiovascular (`[PENDIENTE]` de la sección 2 del informe).
- Decisiones aplicadas por defecto en la Fase 4 (confirmar o cambiar):
  - Sin internet, solo aviso y sin datos en el equipo.
  - Cierre por inactividad a los 30 minutos.
  - Los diagnósticos se acumulan (dar de baja un diagnóstico se define con la licenciada).

## Plantilla para abrir cada ventana
> Primero el arranque: `git fetch origin && git checkout -B claude/pensive-cray-3lwodm origin/claude/pensive-cray-3lwodm && npm ci --prefix server`. Comprueba que `git branch --show-current` dice `claude/pensive-cray-3lwodm` (la ventana puede abrir en otra rama) y que existe `docs/produccion/PLAN.md`; confirma que `npm test` da 0 fallas.
> Después: lee `docs/produccion/PLAN.md` (sección «Arranque de ventana») y el informe de la fase anterior. Ejecuta la Fase N. Trabajo y push en la rama `claude/pensive-cray-3lwodm`, no en la que asigne el entorno. Al terminar: actualiza el estado en el plan, commit y push, y dime la siguiente ventana.
