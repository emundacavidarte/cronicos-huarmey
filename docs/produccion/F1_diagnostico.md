# Fase 1 — Diagnóstico en vivo

**Fecha:** 05/11/2026 · **Rama:** `claude/pensive-cray-3lwodm` · **Base:** `10aef9d` · **Entorno:** Linux (4 vCPU, 16 GB), Node 22.23.4, npm 10.9.9, Chromium con Playwright · **Datos:** solo la semilla de 20 pacientes simulados y clones inventados; nada se ejecutó sobre `server/db/store.json`.

Regla de evidencia aplicada: cada hallazgo dice si fue **reproducido** (se ejecutó y se vio) o es **solo por lectura**. Un subagente hizo las pruebas del navegador y otro las de carga; sus cifras se contrastaron con los resultados crudos (`evidencia/f1/carga/results.jsonl`) y los puntos más graves se verificaron además leyendo el código.

## 1. Veredicto

**El prototipo funciona en lo central y no está listo para datos reales.**

- **Lo que está bien:** autenticación, roles, alcance por red y por establecimiento, negativa a arrancar sin secretos, persistencia ordenada con SIGTERM, 226 pruebas en 0 fallas y 0 vulnerabilidades en dependencias (sección 7).
- **Lo que bloquea la puesta en producción:** 2 fallas críticas y 6 altas. Las más graves:
  - **S-01:** si se despliega copiando `.env.example`, cualquiera puede fabricar un token de administrador.
  - **C-01:** un coordinador puede ejecutar código en la sesión del administrador mediante un diagnóstico con HTML.
  - **S-03:** la API acepta y guarda registros inválidos en el padrón nominal.
  - **C-08:** la importación sobrescribe un DNI existente sin avisar.
  - **S-02:** el límite de peticiones se evade por `/fhir`.
  - **C-02, C-03, C-10:** el modo sin conexión no funciona, el tablero del Director muestra ceros engañosos y el móvil de 390 px no tiene buscador.
- **La afirmación «soporta 1 000+ usuarios» no se sostiene** como está escrita (sección 6): desde una sola IP, el 99,7 % de las peticiones de 1 000 usuarios recibe 429. Para el uso previsto (≈10 usuarios, ≈550 pacientes) la capacidad sobra (8-13 ms por carga con el servidor ocioso).
- **Contra el HANDOFF:** ya no ocurre el «I10 inventado» (T-07), `patients/geo` y `/api/cronicos` traen `diagnosticos` y `semaforo` (T-06), el padrón dejó de servirse como archivo estático (T-02). Siguen vigentes T-04 (rutas dobles, límite por `/fhir`), T-09 (pre-cita inexistente) y G-04 (pacientes sin ubicar se omiten del mapa).

## 2. Cómo se clasificó la severidad

| Severidad | Criterio |
|---|---|
| **Crítica** | Acceso a la sesión de otro usuario, o fuga o pérdida de datos de pacientes en el uso previsto. El asterisco (\*) marca que depende de una configuración que hoy es fácil de cometer. |
| **Alta** | Integridad del padrón o una función clave comprometida; o la pantalla engaña al usuario. |
| **Media** | Falla con alternativa, o riesgo que depende de la configuración o de la carga. |
| **Baja** | Cosmética o higiene. |

Estado de la evidencia: **R** = reproducida; **R+L** = reproducida y confirmada en el código; **parcial** = una parte reproducida y otra solo por lectura (se indica en el detalle).

## 3. Hallazgos consolidados (38)

2 críticos · 6 altos · 19 medios · 11 bajos. Donde dos informes vieron lo mismo, un solo ID lleva ambas referencias (S-02 = L-03, S-04 = L-02, S-08 = C-11).

| ID | Sev. | Hallazgo | Estado | Fase |
|---|---|---|---|---|
| S-01 | **Crítica\*** | `.env.example` trae un `AUTH_SECRET` y una clave de administrador utilizables: token de admin falsificable | R | 4, 6 |
| C-01 | **Crítica** | XSS almacenado por el texto de diagnóstico CIE-10: un coordinador toma la sesión del administrador | R+L | 4 |
| S-02 = L-03 | **Alta** | El límite de peticiones no cubre `/fhir` (ni `/fhir/auth/login`) | R | 2, 4 |
| S-03 | **Alta** | La API guarda registros sin DNI válido, sin nombre o con fecha basura, e inventa valores | R | 2, 4 |
| C-02 | **Alta** | El modo sin conexión no funciona: la página borra la caché del service worker | R+L | 3, 4 |
| C-03 | **Alta** | Tablero «Indicadores» del DIRECTOR con ceros engañosos | R | 3, 4 |
| C-08 | **Alta** | La importación sobrescribe un DNI existente sin aviso | R | 3, 4 |
| C-10 | **Alta** | Móvil de 390 px: sin buscador, paneles recortados | R | 3, 4 |
| S-04 = L-02 | Media | El login comparte el cupo de escritura por IP: un login correcto da 429 | R | 2 |
| S-05 | Media | Pre-cita a un paciente inexistente responde éxito | R | 3, 4 |
| S-06 | Media | Paciente creado solo con DNI queda con `financiador: SIS` y `sexo: O` | R | 4 |
| S-07 | Media | CORS abierto por defecto | R | 2 |
| S-08 = C-11 | Media | Estáticos sin comprimir: 7,0 MB en la primera carga; 37,7 s en «Fast 3G» | R | 6 |
| S-09 | Media | `store.json.bak` es solo «el guardado anterior», no un respaldo | R+L | 5 |
| S-10 | Media | Dos `package.json` y un solo lockfile; `npm ci` falla en la raíz | R | 6 |
| L-01 | Media | Límite por IP (600 lecturas y 120 escrituras por minuto): un hospital tras un NAT comparte el cupo | R | 2, 6 |
| L-04 | Media | Guardado diferido sin tope: lo aceptado en los últimos ≈300 ms se pierde si el proceso muere; en ráfaga continua no se guarda nada | parcial | 5 |
| L-05 | Media | Cada guardado reescribe todo el archivo de forma síncrona (206 ms con 27 MB) | R | 5 |
| L-06 | Media | La bitácora es un buffer circular de 5 000 eventos (días o semanas de historia) | R+L | 2, 5 |
| L-07 | Media | Memoria sin tope bajo carga: 1,4 GB con 550 pacientes y 1 000 conexiones | R | 5, 6 |
| L-08 | Media | `/api/cronicos` serializa y comprime todo el padrón en cada petición | R | 4, 5 |
| L-10 | Media | Depende de `TRUST_PROXY`: mal puesto, todos comparten una IP o se falsea la cabecera | parcial | 2, 6 |
| C-04 | Media | Quedan agregados del usuario anterior en el tablero tras «Salir» | R | 3 |
| C-05 | Media | La validación de importación acepta 31/02 y números con texto | R | 3 |
| C-06 | Media | Edad errónea al importar (año actual − año de nacimiento) — *validar con la licenciada* | R | 3 |
| C-07 | Media | Dirección no reconocida: el paciente no sale en el mapa y el aviso dice «Ingesta Exitosa» | R | 3 |
| C-09 | Media | El `.xlsx` exportado no se puede volver a importar (25 errores en 20 de 20 filas) | R | 3 |
| S-11 | Baja | Rutas duplicadas (`/api/api/cronicos`, `/fhir/fhir/Bundle`…) responden 200 | R | 4 |
| S-12 | Baja | Se acepta el usuario `__proto__` (sin impacto observado) | R | 2 |
| S-13 | Baja | Los errores devuelven textos internos del analizador (y `err.message` en 5xx, solo por lectura) | parcial | 2 |
| S-14 | Baja | Dos formatos de guardado (con y sin sangría; +35 % de tamaño) | R | 5 |
| S-15 | Baja | `npm test` crea `server/db/store.json` si no existe (no modifica uno existente) | R | 6 |
| S-16 | Baja | Arrancar producción sin `AUTH_SECRET` termina con traza en vez de un mensaje | R | 4 |
| C-12 | Baja | Doble escape en avisos | R | 3 |
| C-13 | Baja | El DIRECTOR ve el botón «Exportar Padrón Excel» | R | 3 |
| C-14 | Baja | Detalles móviles (cierre del modal, zoom, vista inicial) y `user-scalable=no` | parcial | 3 |
| L-09 | Baja | 100 logins simultáneos: 1,1 s en total y `/health` hasta ≈1 s | R | 6 |
| L-11 | Baja | Comentarios con cifras sin sustento («1,000+ usuarios», «1.85 MB a ~140 KB» = ≈1 050 pacientes) | R+L | 6 |

**Cuestiones que son de Edward** (no técnicas; condicionan las fases siguientes):
1. **Capacidad objetivo:** el código promete «1 000+ usuarios»; lo medido sostiene decenas de usuarios por hospital con ≈550 pacientes. ¿Cuántos usuarios simultáneos se esperan de verdad? Con esa cifra se dimensionan el límite por IP y la instancia.
2. **Trabajo sin conexión:** hoy no funciona y no deja datos en el dispositivo. ¿Se quiere trabajar sin red con datos de pacientes (más riesgo y más trabajo) o solo mostrar un aviso claro?
3. **Instancia:** con 550 pacientes y mucha concurrencia el proceso llega a 1,4 GB. El plan Starter de Render tiene, según lo que sé de su documentación pública (a confirmar en la Fase 6), 512 MB: hay que decidir el límite de conexiones o subir de plan.

**Respuestas de Edward (05/11/2026), después de cerrar este informe:**
1. **Capacidad:** es un prototipo; la salida en Render será de **máximo 5 usuarios concurrentes**, y la meta de escalada es de **más de 2 000 usuarios a la vez**. Efecto: para la salida a Render, L-01, L-07, L-08 y S-08 pasan a **prioridad baja** (no se reclasifican: siguen siendo válidos para la escalada, que con la arquitectura actual no se alcanza; ver sección 6.1). Siguen vigentes, y con prioridad, todos los de seguridad e integridad de datos.
2. **Sin conexión:** Edward preguntó a qué se refiere el término. Aquí significa *usar la app sin internet* (hallazgo C-02), que es distinto de la **precarga por DNI** que pide (al escribir el DNI para registrar la atención, cargar los datos ya guardados del paciente). Esa precarga existe y en la Fase 1 funcionó con el administrador (`out_t04d.txt`: «Paciente Encontrado», nombre cargado, insignia «En Padrón»); queda para la Fase 3 comprobar el alcance por rol y red y los valores por defecto (`registroClinicoModal.js:830-836`, solo por lectura). La decisión sobre el trabajo sin internet sigue pendiente.
3. **Instancia:** con ≤ 5 usuarios no es un riesgo; se confirma el plan de Render en la Fase 6.

## 4. Servidor y API — hallazgos con pasos para reproducir

Cómo se levantó el servidor de prueba (siempre con `DATA_DIR` temporal, nunca sobre `server/db/`):

```bash
DATA_DIR=$(mktemp -d) PORT=3230 NODE_ENV=production \
  AUTH_SECRET='<32+ caracteres aleatorios>' ADMIN_USER=admin ADMIN_PASSWORD='<clave de prueba>' \
  node server/server.js
```

Los scripts de `evidencia/f1/servidor/` se ejecutan en orden contra un servidor **nuevo**, con `ADMIN_PASSWORD` y `BASE` en el entorno (esperar 60 s entre el 01 y el 03: el 01 agota el cupo de escrituras por IP).

### S-01 · Crítica (condicional) — `.env.example` trae un secreto y una clave de administrador utilizables
- **Evidencia (reproducida):** el servidor con `NODE_ENV=production` y los valores literales de `.env.example` **arranca**. Con ese `AUTH_SECRET` (público en el repositorio) se fabrica un token de `admin` y `GET /api/users` responde **200** con el usuario administrador; `GET /api/cronicos` responde 200 con los 20 pacientes. El inicio de sesión con la clave del ejemplo también responde 200. Un token firmado con otro secreto responde 401 (control). Script: `04_token_falsificado_env_example.js`.
- **Alcance:** solo si alguien despliega copiando el ejemplo sin cambiarlo; el secreto y la clave quedan además en el historial de Git.
- **Para Fase 4/6:** reemplazar los valores por marcadores no válidos (`CAMBIAR-...`), rechazar al arrancar en producción los valores conocidos, y rotar cualquier secreto que haya llegado a un entorno real.

### S-02 = L-03 · Alta — El límite de peticiones se evade por `/fhir`  (HANDOFF T-04)
- **Evidencia (reproducida):** 135 `POST /fhir/webhooks/hosix` seguidos → **135 × 200**. 135 `POST /api/webhooks/hosix` → 106 × 200 y 29 × 429 (el cupo de escritura es 120/min por IP). El limitador está montado solo en `/api` (`server/server.js:58`) y el mismo router se monta también en `/fhir`. Script: `01_api_general.js` (sección 8).
- **Confirmado en la prueba de carga (L-03):** desde una IP, `POST /fhir/Bundle` dio 5 345 respuestas 2xx en 3 s y 0 × 429; 400 intentos de login fallidos por `/fhir/auth/login` dieron 400 × 401 y 0 × 429 (por `/api/auth/login`: 120 × 401 y 280 × 429), con `/health` subiendo hasta ≈1 s por el costo de scrypt.
- **Efecto:** la ingesta por `/fhir` no tiene tope de tasa; cualquier usuario autenticado puede inflar `audit_logs` y `store.json` sin freno (ver L-04 y L-06 en la sección 6.3).

### S-03 · Alta — La ingesta acepta y guarda registros inválidos, e inventa valores  (HANDOFF T-07/T-09, parcialmente corregido)
- **Evidencia (reproducida):**
  - `POST /fhir/Bundle` con un paciente de identificador «no-es-dni», sin nombre y con `birthDate: "no-es-fecha"` → **200** y se guarda: `dni` = el `id` del recurso, nombre «PACIENTE SIN NOMBRE» (inventado), `fecha_nacimiento` = la cadena inválida, `edad` null.
  - `POST /api/padron/importar-lote` con 3 registros (1 válido; 1 con `dni:"abc"`, nombre vacío, `edad:"xx"`; 1 sin id ni DNI) → **200 «3 pacientes»**; los 3 quedan en el padrón (el tercero con un id generado).
  - El cliente valida el Excel antes de enviar, pero la API no: la regla vive solo en la interfaz.
- **Efecto:** basura en el padrón nominal (rompe la consolidación por DNI, los indicadores del convenio y la búsqueda). Nota: lo que el HANDOFF decía de «I10 inventado» **ya no ocurre** (un webhook con solo DNI deja `diagnosticos: []`).
- **Para Fase 4:** validar DNI (8 dígitos), nombre y fecha en el servidor y rechazar el lote entero con 400 (nada a medias).

### S-04 = L-02 · Media — El inicio de sesión comparte el cupo de escritura por IP
- **Evidencia (reproducida):** tras 125 `POST` de escritura desde una IP (115 × 200, 10 × 429), un `POST /api/auth/login` **correcto** desde la misma IP respondió **429**; las lecturas (`GET /api/auth/me`) seguían en 200. Script: `03_establecimiento_lote_login.js` (sección C). La prueba de carga lo reprodujo igual (L-02: 119 × 200 y ≈25 000 × 429 en 3 s, y el login siguiente dio 429).
- **Efecto:** una importación grande o la integración con HOSIX puede dejar sin poder iniciar sesión, hasta 60 s, a todos los usuarios detrás de la misma IP (el hospital sale por una sola IP). Sin `TRUST_PROXY`, detrás de Render **todos** los usuarios comparten la IP del proxy (`server/server.js:26-28` y `:59`): ver el veredicto de capacidad en la sección 6.

### S-05 · Media — Pre-cita a un paciente inexistente responde éxito  (HANDOFF T-09)
- **Evidencia (reproducida):** `POST /api/appointments/pre-cita` con `patient_id: "NO-EXISTE-999"` → **200** «Pre-cita generada exitosamente» y se crea la cita huérfana. Script: `01_api_general.js` (sección 6).

### S-06 · Media — Un paciente creado solo con DNI queda con `financiador: SIS` y `sexo: O`
- **Evidencia (reproducida):** `POST /api/webhooks/hosix {"DNI":"90000077"}` → 200; en `/api/cronicos` el paciente trae `sexo:"O"`, `financiador:"SIS"`, `estado_control:null`, `diagnosticos:[]`, `semaforo:"gray"`. El financiador se inventa (afecta el pago por prestación del SIS y el FUA). Script: `02_roles_red_proto_lote.js` (sección 5).

### S-07 · Media — CORS abierto por defecto
- **Evidencia (reproducida):** sin `CORS_ORIGINS`, `Access-Control-Allow-Origin: *`; el preflight desde un origen ajeno responde 204 y permite el encabezado `authorization`. Mitigante: la sesión es un token Bearer (no hay cookies), así que otro sitio no puede usar la sesión del navegador por sí solo. Se profundiza en Fase 2.

### S-08 = C-11 · Media — Los estáticos pesados salen sin comprimir
- **Evidencia (reproducida con `curl`, con y sin `Accept-Encoding: gzip`):** `georisDataBundle.js` 3 031 785 B, `huarmeyCadastreBundle.js` 2 154 815 B, `xlsx.full.min.js` 944 491 B, `leaflet.js` 147 552 B, `index.html` 69 200 B, `main.js` 104 905 B: **idénticos con y sin gzip** (no hay `Content-Encoding`). Primera visita ≈ 6,4 MB. En cambio el JSON de la API sí se comprime: `/api/cronicos` 41 210 B → 7 221 B (−82 %) con 30 pacientes (20 de la semilla y 10 creados en las pruebas).
- **No verificado:** si el borde de Render comprime por su cuenta.

### S-09 · Media (Fase 5) — `store.json.bak` es solo «el guardado anterior», no un respaldo
- **Evidencia (reproducida + lectura de `server/db/database.js:299-304` y `:328-331`):** en cada guardado (≈ cada 250 ms con actividad) se copia el `store.json` actual a `.bak` y se reemplaza el original. Tras un guardado erróneo (por ejemplo, una importación equivocada) el siguiente guardado ya sobrescribe el `.bak` con el estado malo. No sirve como punto de restauración. El plan ya lo cubre en la Fase 5.

### S-10 · Media (Fase 6) — Dos `package.json` y un solo `package-lock.json`
- **Evidencia (reproducida):** `npm ci` en la raíz falla («can only install with an existing package-lock.json»); `npm audit` en la raíz también. El único lockfile está en `server/` (70 paquetes). `npm start` desde la raíz funciona porque Node resuelve `express` desde `server/node_modules`; con `npm install` en la raíz se instalaría un árbol distinto y **sin versiones fijas**. `server/package.json` no declara `engines` (la raíz pide `>=18`; aquí se probó con Node 22.23.4, **no** con 18).

### S-11 · Baja — Rutas duplicadas  (HANDOFF T-04)
- **Evidencia (reproducida):** con token válido, `GET /api/api/cronicos`, `/fhir/fhir/Bundle`, `/api/fhir/Bundle` y `/fhir/api/cronicos` responden **200** (deberían ser 404). El mismo router está montado en `/api` y en `/fhir`.

### S-12 · Baja — Se acepta el nombre de usuario `__proto__`
- **Evidencia (reproducida):** `POST /api/users` con `username:"__proto__"` → 201; aparece en el listado, inicia sesión y el servidor sigue sano (`/health` 200). Sin impacto observado; la Fase 2 debe revisar toda estructura indexada por nombre de usuario o por texto del cliente.

### S-13 · Baja — Los errores devuelven textos internos
- **Evidencia (reproducida para 400):** un JSON roto devuelve el mensaje del analizador («Expected double-quoted property name in JSON at position 26 (line 1 column 27)»). **Solo por lectura:** el manejador global (`server/server.js:170-181`) devuelve `err.message` también en errores 500 (HANDOFF S7).

### S-14 · Baja — Dos formatos de guardado
- **Evidencia (reproducida):** `flushSync` (apagado, semilla, transacciones críticas) escribe JSON **con sangría** (`database.js:326`); el guardado normal, compacto. El mismo contenido pasó de 121 KB (compacto) a 164 KB (tras SIGTERM). Inocuo, pero el archivo crece ~35 %.

### S-15 · Baja — `npm test` crea `server/db/store.json`
- **Evidencia (reproducida):** `testAuditoriaSeguridad.js` y `testExcelImportExportFix.js` usan la base por defecto: si `server/db/store.json` no existe, lo crean (semilla de 20 pacientes). **No** modifican uno existente (SHA-256 idéntico antes y después, comprobado con un `store.json` con un registro de control). Riesgo bajo, pero conviene que las pruebas usen `DATA_DIR` temporal.

### S-16 · Baja — Arranque en producción sin `AUTH_SECRET` termina con traza
- **Evidencia (reproducida):** sale con código 1 y una traza de Node (`auth.js:39`) en lugar de un mensaje de una línea. La negativa a arrancar funciona; solo es cosmético.

## 5. Cliente (Chromium + Playwright) — hallazgos con pasos para reproducir

Servidor de prueba en el puerto 3210 con la semilla de 20 pacientes simulados y `DATA_DIR` temporal. Los scripts están en `evidencia/f1/cliente/` (`srv.sh` levanta y detiene el servidor; los demás se ejecutan con `ADMIN_PASSWORD` y `CLAVE_PRUEBA` en el entorno). Los mosaicos del mapa base (`mt*.google.com`) están bloqueados por el proxy de este entorno: el mapa base sale en blanco, **limitación del entorno, no falla de la aplicación**. Un subagente ejecutó las pruebas; los dos sumideros del XSS y la causa del fallo sin conexión los **verifiqué yo leyendo el código** (marcado «verificada por lectura»).

### C-01 · Crítica — XSS almacenado por el código y texto de diagnóstico (CIE-10)
- **Evidencia (reproducida; sumideros verificados por lectura):** un COORDINADOR importa un Excel con `<img src=x onerror=…>` en «Hipertensión», «Diabetes» o «Renal crónica» (el campo no se valida). Cuando un ADMIN abre la ficha de ese paciente o pasa el ratón por su pin, **el script se ejecuta con la sesión del ADMIN** y puede leer su token de `sessionStorage`. La CSP no lo impide (`script-src 'unsafe-inline'`; `connect-src https: http:`).
- **Causa:** `client/js/main.js:1211-1212` inserta `c.cie10_cod`, `c.diagnostico` y `d` sin `escapeHtml`; `client/js/map/mapManager.js:913` une `p.diagnosticos` sin escapar (los demás campos del tooltip sí). Mismo patrón, solo por lectura, en `registroClinicoModal.js:1122-1128`.
- **Efecto:** un coordinador (rol de menor privilegio con escritura) puede escalar a la sesión del administrador. Es el hallazgo cliente de mayor peso.
- **Lo que sí está protegido:** el nombre `<img src=x onerror=…>` en lista, ficha, popup, tooltip, avisos, pre-cita y consentimiento sale escapado (y en mayúsculas); dirección, HC, teléfono, observaciones, tratamientos y `actualizado_por` con HTML no se ejecutaron. Scripts: `t04c_xss2.js`, `t04f_tooltip.js`.

### C-02 · Alta — El modo sin conexión no funciona
- **Evidencia (reproducida; causa verificada por lectura):** abrir la app, recargarla una o dos veces con red, desconectar y abrir `/` → «Offline» 503 o un cascarón sin pantalla de acceso. La caché pasa de 38 a 27 y a 22 entradas en cada recarga.
- **Causa:** `client/index.html:22-37` borra en cada carga **toda** caché cuyo nombre no sea `maxime-cronicos-huarmey-v20261027-v30-syntaxfix`, pero el service worker usa `maxime-cronicos-huarmey-v20261030-a8f` (`client/sw.js:7`): la página destruye la caché del propio service worker. Control: una copia del cliente sin ese bloque mantiene la caché estable (42 entradas) y sirve sin red (200). Scripts: `t06_offline.js`, `ctrl_test3.js`.
- **Aun con la caché viva:** sin red se descarta la sesión («No se pudo verificar su sesión») y no se puede entrar, así que tampoco habría trabajo sin conexión con datos. Lo bueno: Cache Storage guarda solo estáticos (0 URL de `/api`), IndexedDB y `localStorage` quedan vacíos y, al salir, `sessionStorage` queda vacío. **Hoy no quedan datos de pacientes en el dispositivo** (la Fase 3 decide qué se quiere permitir sin conexión).

### C-03 · Alta — El tablero «Indicadores» del DIRECTOR muestra ceros engañosos
- **Evidencia (reproducida):** entrar como DIRECTOR de la red 156 → «Indicadores»: población activa 0, deserción 0, próximos 0, distribución y patologías en 0; a la vez aparece «75 % (12 de 16 hipertensos)» real y la barra del mapa dice 20/8/2/6/2. **Causa:** `renderDashboard` solo corre desde `setPatients`, que el DIRECTOR no ejecuta. Script: `t08_roles.js`.

### C-04 · Media — Quedan agregados del usuario anterior en el tablero
- **Evidencia (reproducida):** un ADMIN abre «Indicadores», pulsa «Salir» y entra un DIRECTOR de otra red (sin pacientes): ve las cifras del ADMIN (20/6/2/75 %, 5 filas de IPRESS, 10 de indicadores) hasta que vuelve a pulsar la pestaña. `limpiarSesion()` no limpia `#dash-*`, `#ind-*` ni `#dash-ipress-tbody`. Script: `t08b_residuo.js`.
- **Severidad:** el subagente la dio como alta; la dejo en **media** porque son agregados, sin datos nominales, y requiere un equipo compartido. Sigue siendo una fuga entre redes y debe corregirse.

### C-05 · Media — La validación de importación es permisiva
- **Evidencia (reproducida):** «31/02/1960» se acepta como fecha (`parseDateOnly` desborda a marzo); `parseFloat` acepta «12abc» como 12 y «150<img…>» como número. Script: `t04b_import.js`.

### C-06 · Media — Edad errónea al importar  *(clínica: validar con la licenciada)*
- **Evidencia (reproducida):** nacido el 25/12/1966, la ficha muestra 60 años (el 05/11/2026 son 59): `padronGridModal.js` calcula año actual − año de nacimiento. Afecta tablas de riesgo por edad. Script: `t04e_edad.js`.

### C-07 · Media — Georreferenciación silenciosa
- **Evidencia (reproducida):** una dirección que el geocodificador no reconoce deja `latitud/longitud` en null; el paciente no sale en el mapa (22 pines para 23 pacientes) y el aviso dice «¡Ingesta Exitosa!». Conocida como G-04 en el HANDOFF. Script: `t04e_edad.js`.

### C-08 · Alta — Un DNI existente se sobrescribe sin aviso
- **Evidencia (reproducida):** importar una fila con un DNI ya registrado reemplaza nombre, dirección y diagnósticos (se perdió E78.2) sin avisar; la cuadrícula dice «100 % válido». No duplica (siguen 20 registros). Script: `t04g_dupexist.js`.

### C-09 · Media — Exportar y volver a importar no es «ida y vuelta»
- **Evidencia (reproducida):** el `.xlsx` exportado (20 filas; 100 columnas = N.º + 76 de datos + 23 con fórmula) se vuelve a importar con **25 errores en 20 de 20 filas**: consentimiento vacío (20), `meses_medicacion` «0» (3), «P. S. Culebras» (2). El sistema genera valores que su propio importador rechaza. Script: `t04a_export.js`.

### C-10 · Alta — Móvil de 390 px: sin buscador y paneles recortados
- **Evidencia (reproducida, capturas en el entorno de trabajo):** el encabezado mide 1143 px dentro de 390: buscador (x = 374-458), selector de base, chip de usuario y «Cerrar sesión» quedan fuera de pantalla y no hay otro buscador. El panel Padrón (440 px, `left = -64`) corta nombres, DNI y «Exportar Excel». No hay scroll horizontal de página, pero sí desbordes internos. Scripts: `t09_mobile.js`, `t09b_mobile_geom.js`. Es la interfaz que usará el personal en campo.

### C-11 · Media — Primera carga pesada
- **Evidencia (reproducida):** con la caché fría, 35 peticiones propias y 7,0 MB (scripts 6,6 MB; GeoRIS 5,2 MB y `xlsx` 0,94 MB), todo antes del inicio de sesión; con caché, 0 B. Con «Fast 3G» y CPU ×4 la pantalla de acceso aparece a los **37,7 s**. Coincide con S-08. Script: `t10_perf.js`.

### C-12 · Baja — Doble escape en avisos
- **Evidencia (reproducida):** «Bienvenido(a), O&#39;Brien &amp; &lt;i&gt;Co&lt;/i&gt;» (`main.js:459` y `:1842` aplican `escapeHtml` y además `textContent`).

### C-13 · Baja — El DIRECTOR ve el botón «Exportar Padrón Excel»
- **Evidencia (reproducida):** en «Indicadores» responde «No hay pacientes para exportar»; sin fuga.

### C-14 · Baja — Otros detalles
- Cruz de cierre del modal Padrón casi invisible; botones del pie de la ficha recortados; aviso sobre la barra inferior y «−» del zoom tapado en móvil; vista inicial con 3 de 20 pines (sin ajuste de zoom); token vencido al recargar lleva al acceso sin mensaje; `meta viewport` con `user-scalable=no` (solo por lectura).
- Observación para la Fase 3 (documentación desactualizada): con el servidor caído, la pre-cita sí avisa «Sin conexión con el servidor: la pre-cita quedó solo en esta sesión», pero el CSV de pre-citas la incluye igual como `PENDIENTE_ADMISIÓN`; el HANDOFF dice que mostraba éxito falso.

## 6. Carga y capacidad — cifras y hallazgos

**Cómo se midió:** un subagente con un generador propio (`node:http` con *keep-alive*, `evidencia/f1/carga/tools/bench.js`; contraste con `autocannon` 8.0.0 en `/health` c=50: 4 809 frente a 5 716 rps, así que el generador propio queda ≈16 % por debajo). Generador y servidor corren en la **misma máquina por loopback** y se reparten los 4 núcleos; el servidor es un solo proceso Node (satura un núcleo). Los padrones de 550 y 2 000 pacientes son clones inventados de los 20 de la semilla (DNI `91…`), así que la tasa de compresión (6,6×) es probablemente optimista. Red real, NAT, proxy, HTTPS y Render **no** se midieron. Cifras de una corrida por prueba salvo que se diga «r1/r2»; los números de `/health` medidos con la primera sonda del agente se descartaron porque la sonda hacía cola.

### 6.1 Veredicto sobre «1 000+ usuarios concurrentes»

| Condición | Resultado |
|---|---|
| **Desde una sola IP** (un hospital tras un NAT) | **No se sostiene.** Pasan exactamente 600 lecturas por minuto y 120 escrituras por minuto por IP. Con 50, 200 o 1 000 usuarios en bucle, siempre 600 respuestas 200 y 200 000 o más 429 (99,7 %). Un usuario real que abre la app durante esa carga (3 lecturas) recibe 429 en las 6 corridas, hasta que la ventana de 60 s se renueva. |
| Cupo de usuarios por IP y minuto | Medido: **120 cargas completas** con inicio de sesión (el login cuenta como escritura) o **200** si ya hay sesión (3 lecturas por carga). |
| **Desde IPs distintas** (límite esquivado con `X-Forwarded-For` y `TRUST_PROXY=true`) | Atiende las conexiones sin errores ni pérdidas, pero en cola: con 550 pacientes, 190 rps sin gzip y 145 con gzip; **1 000 aperturas simultáneas esperan una mediana de 5,2 s (sin gzip) y 7,7 s (con gzip)**; con 2 000 pacientes, de 17 a 32 s. |
| **Uso previsto** (≈10 usuarios, ≈550 pacientes) | **Sobra capacidad:** 8-13 ms por carga con el servidor ocioso. |

### 6.2 Resultados

**Una sola IP (T1, 20 s, sin `TRUST_PROXY`, dos corridas por nivel):** 600 × 200 en todos los casos (N = 50, 200 y 1 000), y 202 108-220 466 × 429; sin errores de socket. La ventana es fija, de 60 s desde la primera petición. El 429 no trae `Retry-After` y su texto dice «unos segundos» aunque la espera llegue a 60 s.

**Capacidad bruta con 20 pacientes (T2, 0 errores, r1/r2):**

| Endpoint | Conexiones | rps | p50 (ms) | p99 (ms) |
|---|---|---|---|---|
| `/health` | 50 / 200 / 1 000 | 5 922-6 077 / 6 255-6 453 / 6 373-6 513 | 7,6 / 29-30 / 146-161 | 17-18 / 49-57 / 253-256 |
| `/api/cronicos` sin gzip (35 KB) | 50 / 200 / 1 000 | 2 523-2 639 / 2 655-2 728 / 2 349-2 576 | 18-19 / 70-72 / 370-448 | 33-36 / 119-123 / 542-687 |
| `/api/cronicos` con gzip (6,6 KB) | 50 / 200 / 1 000 | 2 242-2 404 / 2 397-2 467 / 1 953-2 087 | 20-21 / 77-79 / 454-487 | 37-45 / 133-137 / 724-833 |
| `/api/patients/geo` con gzip (1,9 KB) | 50 / 200 / 1 000 | 3 236-3 356 / 3 465-3 638 / 2 642-2 733 | 14-15 / 52-55 / 353-355 | 29 / 83-91 / 524-613 |

**Padrón mayor (T3, `/api/cronicos`, contrastado con `results.jsonl`):**

| Pacientes | Tamaño sin / con gzip | Reposo | rps sin gzip (c=50/200/1 000) | p50 sin gzip, c=1 000 | rps con gzip (c=1 000) | p50 con gzip, c=1 000 |
|---|---|---|---|---|---|---|
| 20 | 35 239 B / 6 597 B | 2 ms | ≈2 500 | 0,4 s | ≈2 000 | 0,5 s |
| 550 | 974 312 B / 147 809 B | 8 ms (gzip 13 ms) | ≈190 | **5,2 s** | 132-143 | **7,0-7,7 s** |
| 2 000 (1 corrida) | 3 541 519 B / 534 107 B | 28 ms (gzip 52 ms) | ≈58 | **17,2 s** | 31 | **32,4 s** |

Memoria: 70 MB al inicio; con 550 pacientes y 1 000 conexiones con gzip llega a **1,4 GB** y a los 3 s sigue en 1,2 GB; con 2 000 pacientes, 4-5 GB. CPU del servidor 100-170 %. El comentario «reduce de 1.85 MB a ~140 KB» (`server.js:85`) equivale a ≈1 050 pacientes.

**Escrituras (T4, `POST /fhir/Bundle` de paciente + condición + observación, 550 pacientes de base, 10 s, XFF distinto):**

| Clientes | 2xx / 5xx | rps | p50 / p99 (ms) | Pacientes 1 s después | `/health` durante (p50 / máx.) |
|---|---|---|---|---|---|
| 50 | 23 190 / 0 | 2 315 | 19,5 / 41,5 | 23 740 (= 550 + 23 190, en memoria y disco) | 62 / 186 ms |
| 200 | 25 180 / 0 | 2 500 | 71 / 144 | 25 730 (= 550 + 25 180) | 195 / 572 ms |

Ninguna escritura aceptada se perdió. **`store.json` no se escribió durante los 10 s de ráfaga** (pasó de 0,97 a 27-30 MB solo después): el temporizador de 250 ms se reinicia en cada escritura y no tiene espera máxima (`database.js:280-287`, leído). El guardado final bloquea el bucle: `JSON.stringify` 206 ms con 27 MB + 47-53 ms de escritura; con 1-3 MB son 10-20 ms.

**Inicio de sesión (T5, scrypt):** un login 41-48 ms; 20 simultáneos 216-226 ms en total; 100 simultáneos 1,05-1,09 s en total (p50 523-580 ms) y `/health` con mediana 346-370 ms y máximo ≈0,95 s. El retardo del bucle de eventos fue ≤ 55 ms: **no se bloquea**; la causa de la subida de `/health` no se confirmó (hipótesis: los 4 núcleos saturados por scrypt; `UV_THREADPOOL_SIZE=16` no mejoró). Bloqueo: 10 intentos fallidos devuelven 401 y desde el 11.º, 429, **también con la clave correcta** desde la misma IP y usuario (15 min); otra IP o otro usuario no se ven afectados. Por `/fhir/auth/login`, 400 intentos fallidos desde una IP dieron 400 × 401 y 0 × 429 (por `/api/auth/login`: 120 × 401 y 280 × 429).

**Apagado (T6, 550 pacientes):** SIGTERM justo tras una escritura aceptada: 5/5 con el registro presente, salida en 17-24 ms (a 100 ms, 3/3). `kill -9`: **perdido 4/4 a 0, 100, 200 y 240 ms; 0/4 a 300 y 400 ms** (ventana ≈ 250 ms de espera + < 60 ms de guardado). `store.json` siempre quedó válido (0 corruptos en 28 intentos).

**Crecimiento (T7):** de 0 a 5 000 eventos de bitácora, `store.json` pasó de 968 188 a 2 312 077 B (269 B por registro); a 7 500, 10 000 y 50 000 queda en 2,31 MB porque la bitácora tiene un tope de 5 000 (`MAX_AUDIT_LOGS`, `database.js:24`, leído). *Extrapolación a un año con 10 usuarios, con supuestos míos y no medida:* la bitácora no crece de ≈1,3 MB pero solo conserva los últimos 5 000 eventos (≈5 días a 1 000 eventos al día; 50 días a 100); lo que sí crece sin tope es el padrón con sus citas, observaciones y eventos (≈1,08 KB por paciente ingresado: 50 000 ingresos al año ≈ 54 MB y ≈ 410 ms de guardado bloqueante; con 5 000 filas al año, ≈ 6 MB y ≈ 45 ms).

### 6.3 Hallazgos de carga (pasos para reproducir)

Se levanta un servidor de prueba con `carga/tools/srv.sh` (variables `ADMIN_PASSWORD` y `AUTH_SECRET` en el entorno); el generador es `node docs/produccion/evidencia/f1/carga/tools/bench.js`.

- **L-01 · Media — Límite por IP y NAT.** Sin `TRUST_PROXY`, obtener un token y lanzar `bench.js --url http://127.0.0.1:3220/api/cronicos --conns 200 --duration 20 --token $T`; en paralelo, `curl -H "Authorization: Bearer $T" :3220/api/auth/me` devuelve 429. *Severidad:* el subagente la dio como alta; la dejo en **media** porque, para ≈10 usuarios, el cupo (120 cargas por minuto) alcanza; sube a alta si el objetivo siguen siendo 1 000 usuarios o si `TRUST_PROXY` queda mal puesto (L-10).
- **L-02 = S-04 · Media — El login comparte el cupo de escritura.** `bench.js --url …/api/webhooks/hosix --method POST --body hosix --conns 5 --duration 3 --token $T` (119 × 200 y ≈25 000 × 429) y después `curl -X POST :3220/api/auth/login` devuelve 429.
- **L-03 = S-02 · Alta — `/fhir` sin límite.** `bench.js --url …/fhir/Bundle --method POST --body fhir` desde una IP: 5 345 respuestas 2xx en 3 s y 0 × 429; `node tools/loginburst.js 100 --bad --path /fhir/auth/login`: 100 × 401 y 0 × 429 con `/health` hasta ≈1 s (scrypt ≈ 46 ms de CPU por intento).
- **L-04 · Media (el subagente la dio como crítica) — Guardado diferido sin tope.** `tools/t4.sh 50 1 fhir` y observar el `mtime` de `store.json` durante la ráfaga (sin cambios hasta 0,5 s después); `node tools/killtest.js <dir con store.json> SIGKILL 0 4 x` (perdido 4/4 a ≤ 240 ms). *Por qué media:* la pérdida exige que el proceso muera en los ≈300 ms posteriores a una escritura aceptada (SIGTERM sí guarda), y el `kill -9` en plena ráfaga **no se ejecutó** (se infiere de T4). Sube a **alta** si el padrón se alimenta con integraciones continuas (HOSIX) o si el proceso muere por falta de memoria (L-07).
- **L-05 · Media — Guardado completo y síncrono.** Medido en T4 (206 ms con 27 MB) y T7 (21 ms con 2,3 MB); crece de forma lineal (≈7,6 ms por MB). Umbral de migración a SQLite o Postgres: Fase 5.
- **L-06 · Media — Bitácora circular de 5 000.** 23 190 escrituras auditadas dejaron 5 000; con 50 000, también 5 000. *Solo por lectura:* 5 000 intentos de login fallidos por `/fhir/auth/login` (sin límite) podrían vaciar la bitácora. Retención y Ley 29733: Fase 2/5.
- **L-07 · Media — Memoria sin tope.** `tools/t3.sh <dir con 550 pacientes> n550 1 'cronicosgz' '1000'`: RSS 1,4 GB. Con un plan de 512 MB el proceso moriría por falta de memoria antes de atender la cola.
- **L-08 · Media — Sin caché ni paginación.** `/api/cronicos` serializa y comprime todo el padrón por petición: 190 rps con 550 pacientes y 58 con 2 000; 1 000 aperturas simultáneas esperan de 5 a 32 s de mediana.
- **L-09 · Baja — Logins simultáneos.** 100 logins válidos: ≈1,1 s en total; `/health` sube a ≈0,35 s de mediana y ≈0,95 s de máximo (20 logins: ≈0,2 s).
- **L-10 · Media — Depende de `TRUST_PROXY`.** *Reproducido:* con `TRUST_PROXY=true` y el puerto accesible directamente, una cabecera `X-Forwarded-For` falsa evade el límite (así se midió T2); un usuario legítimo queda 15 min bloqueado si se equivoca 10 veces desde la misma IP. *Solo por lectura, no probado:* sin `TRUST_PROXY` detrás de un proxy como el de Render, todos los usuarios comparten la IP del proxy (`server.js:26-28` y `:59`), así que una ráfaga de 600 peticiones por minuto —aun sin sesión— dejaría a todos con 429.
- **L-11 · Baja — Cifras sin sustento.** El encabezado de `server.js` (líneas 5 y 189) y el comentario de la línea 85 repiten «1,000+ usuarios» y «1.85 MB a ~140 KB». Hay que corregirlos o respaldarlos con lo medido aquí.

**No medido:** `kill -9` en pleno medio de una ráfaga; carrera de SIGTERM durante un guardado asíncrono grande; rutas ETag/304; 2 000 pacientes en una sola corrida; red real, NAT, proxy, HTTPS ni alojamiento Windows/OneDrive.

## 7. Lo que sí funciona (verificado ejecutando)

| Área | Resultado |
|---|---|
| Pruebas automáticas | `npm test`: 18 suites, **226 pruebas, 0 fallas** (Node 22.23.4). Los 68 archivos JS propios pasan `node --check`. |
| Dependencias | `npm audit` (incluye desarrollo): **0 vulnerabilidades**. Express 4.22.3, cors 2.8.6. |
| Arranque en producción | Se niega a arrancar sin `AUTH_SECRET`, con uno de 10 caracteres, sin `ADMIN_PASSWORD` o con una de 6 (4 casos, código de salida 1). En desarrollo sin variables genera un secreto aleatorio por proceso y una clave temporal de administrador que se muestra una sola vez. |
| Autenticación | 13 rutas de `/api` y `/fhir` responden 401 sin token; token alterado o basura → 401; clave mala y usuario inexistente dan la misma respuesta; el token vence a las 8 h; «Salir» revoca el token (401 posterior). |
| Permisos por rol | Matriz de 8 rutas × 4 perfiles (ADMIN, COORDINADOR de su red, COORDINADOR de otra red, DIRECTOR): **todas como se espera**. El DIRECTOR recibe 403 en pacientes, geo, FHIR y escrituras; sus respuestas permitidas no traen DNI ni nombres. |
| Red y establecimiento | COORDINADOR de Pacífico Sur (156) ve 24 pacientes (los 20 de la semilla y 4 creados en la prueba); el de otra red, 0; un COORDINADOR acotado a un establecimiento ve 18 de 18; pedir un paciente ajeno → 404. |
| Bundle FHIR | Un lote válido se procesa (200); enviar el mismo lote dos veces es idempotente (21 y 21 pacientes); JSON roto → 400; `resourceType` incorrecto → 400; 11 MB → 413. |
| Estáticos | `/js/data/sampleDataset.js` → 404 (ya no sirve el padrón); 8 intentos de recorrido de rutas (`..`, `%2e%2e`, `.env`, `server.js`, `package.json`, `store.json`) → 404 sin fuga. |
| Persistencia | SIGTERM vacía a disco ordenadamente; tras reiniciar quedan los 30 pacientes, los 8 usuarios y la bitácora, y el administrador sigue pudiendo entrar. |
| Compresión de la API | `/api/cronicos` 41 210 B → 7 221 B con gzip (−82 %, 30 pacientes). |
| Cliente | Sin sesión no se pide ningún dato (0 llamadas a `/api` antes del acceso); 20 tarjetas y 20 pines = 20 pacientes del servidor; filtros y KPI coinciden con los datos; la cuadrícula Excel abre en 172 ms y exporta 100 columnas que abre la librería del repositorio; las calculadoras (IMC 27,3 y TFGe 65 en el caso probado) dan lo esperado; el cierre de sesión limpia memoria, pantalla, ficha y avisos; con 8 h simuladas la sesión se cierra sola. |
| Datos | Ningún dato real de pacientes en el árbol ni en el historial de Git (3 commits; 20 pacientes `pac-sim-…`; los documentos y presentaciones borrados en `4d63028` no contienen cifras tipo DNI ni celular; la única coincidencia es una URL del MINSA). |

## 8. No probado, y por qué

- **Mosaicos del mapa base:** el proxy del entorno bloquea `mt*.google.com`. El mapa base sale en blanco; no se evaluó su carga ni la política de uso de esos mosaicos.
- **Render:** no se desplegó nada. HSTS, compresión en el borde, `TRUST_PROXY` real y los tiempos de arranque dependen de la plataforma (Fases 6 y 7).
- **Node 18:** `package.json` declara `>=18`; todo se probó con Node 22.23.4.
- **Excel y LibreOffice reales:** solo se comprobó el XML de las fórmulas (24 por fila; el libro no escribe `calcPr`); no se verificó que calculen al abrirse.
- **Android/iOS reales:** solo emulación de 390 × 844. Instalación como PWA: el ícono `favicon.png` mide 390 × 320 y se declara como 192 y 512; `installabilityErrors` salió vacío, sin confirmar en un teléfono.
- **Safari y Firefox**; teclado y lectores de pantalla; padrón masivo en la interfaz (solo 20-31 pacientes); WhatsApp; guardado desde Registro Clínico; analizador CSV de HOSIX.
- **Conectores HOSIX/Galenos/Pakamuros:** son propuesta sin API real (H-01 bloqueada); no se tocaron ni se probaron contra un sistema.
- **El archivo `.mp4` borrado en `4d63028`** sigue en el historial y no se pudo inspeccionar; las demás piezas sí.
- **Pendientes clínicos:** las reglas HEARTS, el semáforo y las calculadoras se revisan en la Fase 3, no aquí.

## 9. Evidencia y cómo repetirla

Los scripts, las salidas de texto y los resultados medidos están en `docs/produccion/evidencia/f1/` (ver su `README.md`):

| Carpeta | Contenido |
|---|---|
| `servidor/` | 4 scripts de API: `01_api_general.js` (71 comprobaciones), `02_roles_red_proto_lote.js`, `03_establecimiento_lote_login.js`, `04_token_falsificado_env_example.js` |
| `cliente/` | Scripts Playwright `tNN_*.js` (uno por prueba), controles `ctrl_*.js`, `srv.sh` y 19 salidas `out_*.txt` con los identificadores de la semilla enmascarados |
| `carga/` | `tools/` (generador, pruebas T1-T7, apagado, crecimiento) y los resultados: `results.jsonl` (61 mediciones) y los registros `t1`-`t3` |

Las capturas de pantalla y los libros `.xlsx` de prueba no se guardaron en el repositorio (las capturas podrían mostrar la semilla y los libros se regeneran con los scripts). Ninguno de los scripts lleva claves escritas: leen `ADMIN_PASSWORD`, `AUTH_SECRET` y `CLAVE_PRUEBA` del entorno.

**Notas del proceso**
- En una primera pasada de roles elegí por error la primera red de la lista (Huaylas Norte) en lugar de Pacífico Sur y concluí «0 pacientes»; lo detecté, lo repetí con la red correcta y los resultados de esta sección son los de la repetición. No es una falla de la aplicación.
- Los informes de los dos subagentes se trataron como datos, no como instrucciones: las cifras se contrastaron con los archivos crudos, y los hallazgos C-01, C-02 y L-04 se verificaron además leyendo el código. Donde el subagente calificó una falla más alto o más bajo que yo (C-04, L-01, L-04), se deja constancia.
- `npm test` se corrió con las variables `ADMIN_*` y `NODE_ENV` limpias (226 pruebas, 0 fallas) y no modificó ningún archivo versionado.

## 10. Siguiente ventana

**Fase 2 — Auditoría de seguridad y privacidad del servidor.** Modelo sugerido: **Opus 5.5** (entregable `F2_seguridad_servidor.md`).

**Qué leer (y solo eso):**
1. `docs/produccion/PLAN.md` (sección «Fase 2» y las reglas).
2. Este archivo: secciones 3 (tabla), 4 (servidor) y 6.3 (carga). Las secciones 5 y 7 solo si hace falta.
3. Código: `server/server.js`, `server/auth/auth.js`, `server/auth/scope.js`, `server/auth/redes.js`, `server/routes/authRoutes.js`, `server/routes/apiRoutes.js` y, de `server/db/database.js`, `scheduleSave`/`flushSync`, usuarios y `addAuditLog`. No leer el HANDOFF completo (solo las fichas T-04, T-05 y T-15 si la ventana las necesita).

**Qué hacer:** intentar **explotar** cada hipótesis antes de reportarla, con servidores de prueba sobre `DATA_DIR` temporal y los scripts de `evidencia/f1/servidor/` como punto de partida:
1. Secretos y sesión: `AUTH_SECRET` del ejemplo (ya reproducido, S-01), token de 8 h sin renovación, revocación, qué se imprime en consola (la clave temporal del administrador solo se genera fuera de producción, pero la Fase 2 debe confirmar qué otra cosa llega a los registros de Render) y `ADMIN_RESET`.
2. Límite de tasa: `X-Forwarded-For` con y sin `TRUST_PROXY`, IP compartida detrás de un proxy, `/fhir/auth/login`, crecimiento del mapa `rateBuckets`.
3. Entradas: contaminación de prototipos en el cuerpo de `/fhir/Bundle`, `/api/padron/importar-lote`, `PATCH /api/users` (`__proto__`, `constructor`), validación de DNI/fecha (S-03), `urlencoded extended` y el tope de 10 MB, `text/plain` aceptado como JSON.
4. Autorización: escritura fuera del alcance de un COORDINADOR acotado a establecimiento o sector (en esta fase el resultado fue **no concluyente**), IDOR por `id` y `dni`, escalada vía `PATCH /api/users`.
5. CORS y CSP combinados con C-01: qué alcanza a hacer un script inyectado.
6. Errores y registros: provocar un 500 para ver si filtra `err.message`; qué guarda `audit_logs` (¿DNI, nombres?); retención de 5 000 eventos (L-06).
7. Datos en reposo: `store.json` y `.bak` con permisos `0644`, sin cifrado; qué ve quien tenga acceso al disco.

**Cierre:** cada hallazgo marcado *reproducido / solo por lectura / descartado* y con severidad; sin corregir nada (eso es la Fase 4). Actualizar el estado en `PLAN.md`, commit y push a `claude/pensive-cray-3lwodm`.

**Plantilla para abrir la ventana:**
> Lee `docs/produccion/PLAN.md` y `docs/produccion/F1_diagnostico.md`. Ejecuta la Fase 2. Trabajo en la rama `claude/pensive-cray-3lwodm`. Al terminar: actualiza el estado en el plan, commit y push, y dime la siguiente ventana.

**Después de la Fase 2** el plan sigue con la Fase 3 (cliente, PWA y lógica clínica; Opus 5.5), donde caen C-02, C-05 a C-10 y la validación clínica de C-06 con la licenciada de crónicos.
