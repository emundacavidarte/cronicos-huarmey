# Fase 2 — Seguridad y privacidad del servidor

**Fecha:** 05/11/2026 · **Rama:** `claude/pensive-cray-3lwodm` · **Base:** `c512a44` · **Entorno:** Linux, Node 22.23.4, Chromium con Playwright · **Datos:** solo inventados (DNI `95…`, `96…`, `97…`) y la semilla de 20 pacientes simulados; todos los servidores de prueba usaron una carpeta temporal (`DATA_DIR`), nunca `server/db/`.

**Instrucción de Edward para esta ventana:** «Ejecuta todas las correcciones». Por eso, a diferencia de lo previsto en el plan (la Fase 2 solo auditaba y la Fase 4 corregía), aquí cada hallazgo del servidor se reprodujo **y se corrigió**, con una prueba que falla antes y pasa después. También se corrigió el XSS C-01 del cliente, porque el plan pedía revisar la CSP junto con él y su arreglo es local.

Regla de evidencia: **R** = reproducido (se ejecutó y se vio); **R+L** = reproducido y confirmado en el código; **L** = solo por lectura.

## 1. Veredicto

**El servidor queda sin hallazgos críticos ni altos abiertos.** No está listo todavía para datos reales por lo que falta de otras fases (cliente, respaldos e infraestructura) y por las decisiones de Edward de la sección 7.

- **21 hallazgos** (2 críticos, 5 altos, 8 medios, 6 bajos): 11 nuevos y 10 que venían de la Fase 1. **20 corregidos y 1 corregido en parte** (F2-17: la CSP aún permite scripts en línea porque el cliente los usa).
- Los nuevos más graves:
  - **F2-03:** un COORDINADOR podía escribir diagnósticos, presión arterial y citas en pacientes de **otra red** a través de `importar-lote`.
  - **F2-13:** cualquiera, **sin sesión**, podía vaciar la bitácora de auditoría en 63 s.
  - **F2-07:** cualquiera, **sin sesión**, podía subir la memoria del proceso en 187 MB con 20 peticiones.
- `npm test`: **263 correctas, 0 con falla** (19 suites). Antes eran 226; la suite nueva `testSeguridadF2.js` tiene 37 comprobaciones (34 fallaban antes de corregir).
- El cliente real se probó en Chromium contra el servidor corregido: inicio de sesión, importación Excel, Registro Clínico, **0 violaciones de la CSP** y **0 errores de página** (sección 8).
- **Cambia el comportamiento** para usuarios e integraciones (sección 6). Por ejemplo, un paciente fuera del alcance ahora da 404 en vez de 403, y `/fhir` solo expone recursos FHIR.

## 2. Alcance y método

Se leyó el código de `server/` completo (servidor, autenticación, alcance, rutas, base de datos, adaptador FHIR y conectores) y los tres puntos del cliente que tocan C-01 y la CSP. Para cada hipótesis se intentó primero explotarla contra un servidor de prueba en producción (`docs/produccion/evidencia/f2/`). Solo después se corrigió, con una prueba automática en `server/tests/testSeguridadF2.js`. Los resultados de «antes» y «después» de cada script quedaron guardados (`out_*_antes.txt` / `out_*_despues.txt`).

Se revisaron los temas que pide el plan: sesiones y token, alcance por red, establecimiento y sector, validación de entradas, CORS, CSP, límites de tasa, inyección y contaminación de prototipos, manejo de errores, registros y bitácora, `ADMIN_RESET`, secretos, dependencias y datos en reposo.

## 3. Hallazgos (21)

Criterio de severidad: el mismo de la Fase 1 (sección 2 de `F1_diagnostico.md`).

| ID | Sev. | Hallazgo | Evid. | Origen | Estado | Prueba |
|---|---|---|---|---|---|---|
| F2-01 | **Crítica\*** | `.env.example` con un `AUTH_SECRET` y una clave de administrador utilizables: se puede falsificar un token de ADMIN | R | S-01 | Corregido | F2-01 |
| F2-20 | **Crítica** | XSS almacenado por el código y el texto del diagnóstico CIE-10 | R+L | C-01 | Corregido | humo 05 + servidor F2-09 |
| F2-03 | **Alta** | `importar-lote`: un DNI propio más el id de un paciente de otra red escriben diagnósticos, controles y citas **en el paciente ajeno** | R | nuevo | Corregido | F2-03 |
| F2-07 | **Alta** | Sin sesión, el servidor lee cuerpos de hasta 10 MB antes de pedir el token: 20 envíos simultáneos suben el proceso de 191 a 377 MB | R | nuevo | Corregido | F2-07 |
| F2-09 | **Alta** | La API guarda DNI, nombres y fechas inválidos, inventa I10 en una Condition sin código y acepta HTML como código CIE-10 | R | S-03, S-06 | Corregido | F2-09 |
| F2-13 | **Alta** | Bitácora: sin sesión se vacía con 5 100 inicios de sesión fallidos; no registra lecturas; una importación no dice qué pacientes tocó; la pre-cita guarda nombre y DNI | R | nuevo (amplía L-06) | Corregido (retención: Fase 5) | F2-13 |
| F2-14 | **Alta** | El límite de tasa no cubre `/fhir` (ni su login); el login comparte el cupo de escritura; el cupo es por IP | R | S-02, S-04, L-01 | Corregido | F2-14 |
| F2-04 | Media | Oráculo de existencia: eventos, consentimiento y pre-cita responden 403 si el DNI existe en otra red y 404 si no existe | R | nuevo | Corregido | F2-04 |
| F2-05 | Media | Pre-cita del ADMIN a un paciente inexistente responde éxito | R | S-05 | Corregido | F2-05 |
| F2-08 | Media | Un campo llamado `toString` provoca un 400 con el texto interno y deja guardada la mitad del lote | R | nuevo | Corregido | F2-08 |
| F2-11 | Media | Asignación masiva: el cliente guarda campos de 200 KB, fija `fuente` y nada registra quién modificó el paciente | R | nuevo | Corregido | F2-11 |
| F2-12 | Media | El ámbito por sector compara por subcadena: un usuario del «Sector 6» ve los sectores 62 a 69 | R | nuevo | Corregido | F2-12 |
| F2-17 | Media | CORS abierto y una CSP que deja enviar datos a cualquier dominio (`connect-src https:`, `img-src https:`) | R | S-07 | **Parcial** | F2-17, script 04 |
| F2-18 | Media | `store.json` y `.bak` con permisos 644 y en texto plano | R | nuevo | Corregido en permisos (cifrado: Fase 5) | F2-18 |
| F2-19 | Media | `ADMIN_RESET=true` olvidado revierte en cada reinicio la clave que el ADMIN cambió y cierra sus sesiones | R | nuevo | Corregido | F2-19 |
| F2-02 | Baja | Sin `AUTH_SECRET` en producción, el servidor termina con una traza de Node | R | S-16 | Corregido | F2-02 |
| F2-06 | Baja | Dos coordinadores de la misma red con distinto establecimiento comparten ETag (304 cruzado). El cliente oficial no lo explota | R (servidor), L (cliente) | nuevo | Corregido | F2-06 |
| F2-10 | Baja | Los errores devuelven textos internos (también un 500); un POST a una ruta inexistente responde con la página HTML de Express | R | S-13 | Corregido | F2-10 |
| F2-15 | Baja | Rutas duplicadas (`/api/api/…`, `/fhir/fhir/…`, `/fhir/users`, `/fhir/auth/login`) | R | S-11 | Corregido | F2-15 |
| F2-16 | Baja | Se aceptan los usuarios `__proto__`, `constructor` y `prototype` | R | S-12 | Corregido | F2-16 |
| F2-21 | Baja | El aviso de `store.json` corrupto copia al registro el texto de `JSON.parse`, que trae un fragmento del archivo | L | nuevo | Corregido | — |

\* Depende de que alguien despliegue copiando el ejemplo (criterio de la Fase 1).

## 4. Detalle: evidencia antes y después, y corrección

Los scripts y sus salidas están en `docs/produccion/evidencia/f2/` (ver su `README.md`). «H-xx» es la línea correspondiente de `01_explotacion.js`.

### F2-01 · Crítica\* — Secretos de ejemplo (S-01)
- **Antes:** con los valores literales de `.env.example`, el servidor de producción seguía vivo a los 8 s, es decir, arrancó (prueba F2-01 antes de corregir; la Fase 1 ya había falsificado un token de ADMIN con ese secreto).
- **Corrección:** `server/auth/config.js` se ejecuta **antes** de abrir la base. En producción rechaza: el secreto y la clave que estuvieron publicados, cualquier valor con «CAMBIAR», un `AUTH_SECRET` de menos de 32 caracteres y uno con menos de 10 caracteres distintos (por ejemplo, `aaaa…`). `.env.example` trae ahora marcadores `CAMBIAR-…` y explica cada variable.
- **Después:** sale con código 1 en los cuatro casos (F2-01).
- **Queda:** los valores viejos siguen en el historial de Git. Si alguno llegó a un entorno real, hay que rotarlo (sección 7).

### F2-20 · Crítica — XSS almacenado por el diagnóstico (C-01)
- **Corrección en el cliente:** `client/js/main.js` (etiquetas de diagnóstico de la ficha, incluido el atributo `class`, y la categoría de la tabla por IPRESS) y `client/js/map/mapManager.js` (diagnósticos y cifras del tooltip) ahora pasan por `escapeHtml`.
- **Corrección en el servidor (defensa adicional):** rechaza `<` y `>` en códigos, diagnósticos, nombres e historia clínica, y en FHIR exige un código CIE-10 con formato válido.
- **Después (R, Chromium, `out_05_humo_cliente.txt`):** se inyectó en memoria un diagnóstico `<img onerror=…>`. La ficha lo muestra como texto y **ninguna** bandera `__xss` se ejecutó.
- **Solo por lectura:** el tooltip del mapa. Se arma al crear el pin y no se rehace con el dato inyectado en memoria; además, el servidor ya no deja guardar ese dato.
- **Descartado por lectura:** la Fase 1 marcó «el mismo patrón» en `registroClinicoModal.js:1122-1128`. Esas líneas arman el cuerpo del envío y la precarga usa `.value`, así que no hay inserción de HTML.

### F2-03 · Alta — Escritura cruzada de red en `importar-lote` (nuevo)
- **Antes (H-01):** un COORDINADOR de Pacífico Sur envió el DNI de un paciente propio con el `id` de un paciente de Pacífico Norte y con diagnósticos, controles y citas. Respuesta 200. El paciente ajeno quedó con el diagnóstico E11 «INYECTADO-F2», presión 210/125 y una cita.
- **Causa:** `checkWrite` revisaba el paciente encontrado por DNI, pero los hijos se guardaban con el `id` del cliente. Los ids siguen el patrón `pac-00001741-<DNI>`, así que basta conocer un DNI.
- **Corrección:**
  1. La validación rechaza un `id` y un DNI que pertenecen a pacientes distintos (400).
  2. Los hijos se cuelgan del paciente **realmente guardado** (`upsertPatient(p).id`).
  3. Si un paciente cambia de DNI, el índice deja de apuntar con el DNI viejo.
- **Después:** 400 y el paciente ajeno queda intacto.

### F2-07 · Alta — Cuerpos grandes sin sesión (nuevo)
- **Antes (H-04):** un POST sin token de 9,5 MB tardaba 163-431 ms en recibir su 401, porque primero se leía el JSON. 20 envíos simultáneos a `/fhir/auth/login` llevaron el proceso de 190,7 a 377,4 MB. Además, `text/plain` se aceptaba como JSON.
- **Corrección:**
  - El cuerpo se lee **después** de exigir la sesión (`server/utils/cuerpoJson.js`).
  - El login acepta como máximo 10 KB.
  - Solo se admite `application/json`; cualquier otro tipo recibe 415.
  - Se quitó el lector de formularios (`urlencoded`), que ninguna ruta usaba, y las consultas se leen en modo simple.
- **Después:** el 401 llega en 17-27 ms y la memoria pasa de 153 a 173,5 MB (+20 MB, frente a +187 MB antes; `out_01_despues.txt`).

### F2-09 · Alta — Validación de entradas en el servidor (S-03, S-06)
- **Antes:**
  - Lo ya visto en la Fase 1: DNI «abc» y fechas basura guardados.
  - Una Condition **sin código** se guardaba como **I10** (H-06), y un código `<img src=x onerror=…>` se guardaba tal cual.
  - Un paciente creado solo con DNI quedaba con `sexo: O` y `financiador: SIS` (S-06).
- **Corrección:** `server/utils/validacion.js` revisa **todo el lote antes de escribir**, y un error rechaza el lote entero con «Fila N: motivo». Comprueba:
  - Documento según el tipo: DNI de 8 dígitos; carné de extranjería y pasaporte, de 6 a 15 letras o dígitos; «Sin documento», sin número.
  - Que un paciente nuevo traiga apellidos y nombres.
  - Fechas reales (`fecha_nacimiento` entre 1900 y hoy, y los demás campos `fecha_*`).
  - Que las cifras clínicas sean números.
  - Formato de `puerta_entrada_id`; sin `<` ni `>` en códigos y nombres.
  - Topes de 4 000 caracteres por campo, 300 campos por fila y cantidad de diagnósticos, controles y citas; documentos repetidos en el lote.

  En FHIR y en los webhooks: el identificador DNI debe tener 8 dígitos, un paciente nuevo necesita DNI y nombre, una Condition necesita un código CIE-10 válido y nunca se inventa, y se validan fechas, cifras e ids. El parser ya no deduce el DNI de cualquier `id` (solo de `pac-<renipress>-<8 dígitos>`). Los valores por defecto ya no inventan sexo ni financiador.
- **Después:** los 8 casos inválidos de importación y los 4 de FHIR reciben 400 y no se guarda nada. Un lote válido, incluido un carné de extranjería, sigue entrando (F2-09).

### F2-13 · Alta — Bitácora de auditoría (nuevo; amplía L-06)
- **Antes (script 02):** sin sesión, 5 100 inicios de sesión fallidos por `/fhir/auth/login` en 62,7 s. La bitácora quedó con 5 000 entradas, todas `LOGIN_FALLIDO`, y desapareció la marca previa (la creación de un usuario).
  - No se registraba ninguna lectura de datos de pacientes (H-12).
  - `BULK_IMPORT` guardaba solo `{"count":1}`.
  - `PRE_CITA_GENERADA` guardaba el comentario, donde el cliente escribe el nombre y el DNI del paciente.
- **Corrección:**
  - Los `LOGIN_FALLIDO` ocupan como máximo 500 lugares y se descartan primero los más antiguos de ese tipo.
  - Las lecturas del padrón (`/api/cronicos`, `/api/patients`, `/api/patients/geo`, `/fhir/Bundle`) y de un paciente (`/fhir/Patient/:id`, eventos) se registran: una entrada por usuario, recurso y hora.
  - Las importaciones, los Bundle y los webhooks registran los ids que tocaron (hasta 200).
  - La pre-cita registra solo el id, el paciente y la fecha.
  - `GET /api/security/audit-logs?evento=…` filtra por tipo.
- **Después:** con 600 IP distintas y 600 fallidos, quedan como máximo 500 `LOGIN_FALLIDO` y los demás eventos siguen (F2-13). Desde una IP el login se corta a los 30 por minuto (script 02: 28 × 401 y 272 × 429; las 2 restantes del cupo fueron los inicios de sesión del propio script).
- **Queda para la Fase 5:** la bitácora sigue siendo un anillo de 5 000 eventos dentro de `store.json`. Su retención y durabilidad (Ley 29733) se definen allí.

### F2-14 · Alta — Límite de tasa (S-02, S-04, L-01)
- **Antes:** `/fhir` no tenía límite. 130 inicios de sesión fallidos por `/fhir/auth/login` dieron 130 × 401 y 0 × 429. El login compartía el cupo de escritura por IP.
- **Corrección:**
  - El límite cubre `/api` y `/fhir`.
  - Con un token válido, el cupo es **por usuario**: 600 lecturas y 120 escrituras por minuto. Un hospital detrás de un NAT ya no comparte un solo cupo.
  - Sin token, el cupo es por IP. El login tiene un cupo propio de 30 por minuto por IP.
  - El 429 trae `Retry-After` y un texto con los segundos reales.
  - Los mapas de cupos y de intentos fallidos tienen tope de tamaño.
- **Después:**
  - Un usuario que pasa de 120 escrituras recibe 429 con `Retry-After`; otro usuario detrás de la misma IP sigue escribiendo y cualquiera puede iniciar sesión.
  - El intento 31 de login en un minuto recibe 429 (F2-14).

### F2-04 · Media — Oráculo de existencia entre redes (nuevo)
- **Antes (H-02):** con un DNI de otra red, `GET/POST /patients/:id/eventos`, `PUT …/consentimiento` y la pre-cita respondían **403**; con un DNI inexistente, **404** (la pre-cita, dos 403 con textos distintos). Un COORDINADOR podía averiguar si una persona está registrada como paciente crónico en otra red, que es un dato de salud.
- **Corrección:** `pacienteVisible()` en `apiRoutes.js`: fuera del alcance se responde 404 «Paciente no encontrado», igual que para un paciente inexistente.
- **Queda:** `importar-lote` y `POST /fhir/Bundle` todavía permiten deducir que un DNI existe en otra red, porque crear ese DNI en la propia red se rechaza (403). Es inherente a que el DNI sea único en todo el padrón; se anota para la Fase 5 junto con el cotejo de redes.

### F2-05 · Media — Pre-cita a un paciente inexistente (S-05)
- **Antes:** el ADMIN recibía 200 y quedaba una cita huérfana. Un COORDINADOR recibía 403 con un texto que delataba el motivo.
- **Corrección:** se exige que el paciente exista y esté al alcance (404). `fecha_sugerida` inválida da 400 (antes se cambiaba en silencio por hoy) y `patient_id` debe ser texto o número.

### F2-08 · Media — Claves heredadas y lotes a medias (nuevo)
- **Antes (H-05):** un campo `toString` en un paciente existente produjo un 400 con el texto «(PLACEHOLDER_VALUES[field] || []).includes is not a function». En el lote [nuevo válido, existente con `hasOwnProperty`], el **primero quedó guardado** aunque la respuesta fue error.
- **Corrección:** `hasRealValue` usa `hasOwnProperty`; la validación rechaza nombres de campo heredados de `Object.prototype` o con caracteres raros y revisa todo antes de escribir.
- **Después:** 400 «Fila 1: nombre de campo no permitido.» y no se guarda nada.

### F2-11 · Media — Asignación masiva y trazabilidad (nuevo)
- **Antes (H-08):** el COORDINADOR guardó `fuente: "HOSIX"` y un campo arbitrario de 200 000 caracteres.
- **Corrección:**
  - `fuente`, `ultima_modificacion_por`, `ultima_modificacion_fecha` y los datos del consentimiento los fija el servidor; si el cliente los envía, se descartan.
  - Cada escritura deja `ultima_modificacion_por` (el usuario de la sesión) y `ultima_modificacion_fecha`.
  - Topes de tamaño por campo y por fila.
- **Aclaración:** `actualizado_por` es una columna del Excel v4 («Registrado / Actualizado por») que llena la persona. No es un rastro del sistema y se deja como dato.

### F2-12 · Media — Ámbito por sector por subcadena (nuevo)
- **Antes (H-09):** un usuario acotado al «Sector 6» veía 17 pacientes de los sectores 62, 63, 64, 65, 66, 68 y 69. Con los nombres reales («Sector I – Centro», «Sector II – La Victoria»…), «Sector I» vería también II, III y IV.
- **Corrección:** comparación **exacta**, sin tildes, mayúsculas ni diferencias de guion o espacios. Un paciente sin sector sigue visible para que se le pueda asignar uno.
- **Después:** 0 pacientes ajenos.

### F2-17 · Media — CORS y CSP (S-07) — parcial
- **Antes (script 04):** CORS `*`. En Chromium, un script inyectado podía hacer `fetch` y lanzar una baliza por imagen a un dominio ajeno **sin que la CSP lo bloqueara**, y el manejador `onerror` en línea se ejecutaba.
- **Corrección:**
  - CORS cerrado por defecto; solo `CORS_ORIGINS` autoriza orígenes, y solo esos.
  - CSP con `default-src 'self'`, `connect-src 'self'`, imágenes solo de los mapas base que usa Leaflet (Google `mt0-3`, CartoDB, OSM Francia, ArcGIS), `frame-ancestors 'none'`, `worker-src` y `manifest-src 'self'`.
  - `X-Frame-Options: DENY`, `X-XSS-Protection: 0`, `Cross-Origin-Opener-Policy` y `Cross-Origin-Resource-Policy: same-origin`.
- **Después (script 04):** el `fetch` y la baliza a un dominio ajeno quedan **bloqueados**; los mosaicos de CartoDB siguen permitidos; el cliente real no registra ninguna violación (humo 05).
- **Queda abierto:** el manejador en línea **se sigue ejecutando**, porque `script-src` necesita `'unsafe-inline'`: el cliente tiene 48 `onclick`/`onchange` en `index.html` y 21 en HTML generado. Quitarlo exige pasar esos manejadores a `addEventListener` (Fase 3/4). Mientras tanto, la defensa principal contra el XSS es el escape del cliente (F2-20) y la validación del servidor.

### F2-18 · Media — Datos en reposo (nuevo)
- **Antes (H-13):** `store.json` y `store.json.bak` con modo 644 (cualquier usuario del sistema puede leerlos) y en texto plano.
- **Corrección:** se escriben con 600, también al copiar el `.bak` y al arrancar sobre un archivo existente.
- **No implementado, y por qué:** el **cifrado en reposo**. Exige decidir quién custodia la clave: si se pierde, se pierde el padrón. Además, una clave en las variables de entorno no protege contra quien controla el servidor. Va con los respaldos cifrados de la Fase 5.

### F2-19 · Media — `ADMIN_RESET` olvidado (nuevo)
- **Antes (script 03):** el ADMIN cambió su clave por la interfaz. Tras un reinicio con `ADMIN_RESET=true` aún en el entorno, la clave nueva dio 401, la del entorno 200, y el token vigente quedó invalidado. Render reinicia en cada despliegue.
- **Corrección:** el restablecimiento se aplica **una sola vez por clave del entorno**. Se guarda una huella HMAC del usuario y la clave, no la clave. Si la variable queda olvidada, el registro lo dice y no hace nada; una `ADMIN_PASSWORD` distinta sí vuelve a aplicarse.
- **Después:** clave nueva 200, clave del entorno 401, token vigente 200.

### F2-02, F2-06, F2-10, F2-15, F2-16, F2-21 · Bajas
- **F2-02 (S-16):** la configuración se revisa antes de cargar nada. Un error sale en una sola línea `[CONFIG] No se puede arrancar: …`.
- **F2-06:**
  - **Antes (H-03):** con el ETag del coordinador de red completa, el de un solo establecimiento recibía 304, o sea, reutilizaría en un navegador compartido una lista con más pacientes que los suyos.
  - **Por qué Baja:** la interfaz oficial no lo explota, porque pide los datos con `cache: 'no-store'` (`client/js/auth/session.js:180`, lectura).
  - **Corrección:** ETag por usuario y alcance, y `Cache-Control: no-store` en toda respuesta de `/api` y `/fhir`.
- **F2-10 (S-13):**
  - **Antes:** «code.startsWith is not a function» (400); `patient_id` como objeto daba **500** «Cannot convert object to primitive value»; un JSON roto devolvía el texto del analizador.
  - **Ahora:** los mensajes de validación son propios; cualquier otro error responde «El contenido enviado no tiene la estructura esperada.». Los 5xx dan un texto genérico con una referencia que también va al registro, sin el cuerpo de la solicitud. Cualquier ruta inexistente de `/api` o `/fhir`, con cualquier método, responde 404 en JSON.
- **F2-15 (S-11):** dos enrutadores separados. `/api` lleva la API y `/fhir` solo `metadata`, `Bundle` (GET/POST), `Patient/:id(/bundle)` y `loinc-catalog`. `/fhir/auth/*` y `/fhir/users` ya no existen.
- **F2-16 (S-12):** `__proto__`, `constructor` y `prototype` dejan de ser nombres de usuario válidos.
- **F2-21:** los avisos de `store.json` corrupto registran el tipo de error, no el mensaje (que podía incluir un fragmento del archivo).

## 5. Descartados y aceptados

| Hipótesis | Resultado | Evid. |
|---|---|---|
| Contaminación de prototipos (`__proto__`/`constructor` en `PATCH /users`, en el lote y en la consulta) | **Descartada:** el rol no cambió y no hubo efecto global. Ahora además se rechaza en la validación | R (H-11) |
| COORDINADOR acotado a un establecimiento mueve a su paciente a otro establecimiento de su red | **No es una vulnerabilidad:** es una transferencia; no puede traerlo de vuelta (403). La Fase 3 decide si debe registrar un evento `cambio_establecimiento` | R (H-10) |
| Enumeración de usuarios por el login | Descartada: misma respuesta y mismo tiempo (Fase 1) | R |
| Registros de consola con datos de pacientes | Descartada: se leyeron todos los `console.*` del servidor y los registros de los servidores de prueba; solo hay nombres de usuario y mensajes técnicos | R+L |
| Compresión y ataque tipo BREACH | Descartada: la sesión va en una cabecera y no hay datos de un tercero reflejados junto a un secreto | L |
| `Host` reflejado en `fullUrl` de `GET /fhir/Bundle` | Descartada: no hay caché compartida (`no-store`) | L |
| Token de 8 h sin renovación | **Aceptado:** cubre una jornada. Salir o cambiar la clave revoca los tokens (Fase 1). «Salir» cierra todas las sesiones del usuario. Falta el cierre por inactividad en el cliente (Fase 3) | R (F1) + L |
| scrypt con N = 2^14 | **Aceptado:** subirlo multiplica la memoria por intento (16 MB hoy) en una instancia pequeña | L |
| Bloqueo de 15 min por IP y usuario tras 10 fallos | **Aceptado:** un colega detrás del mismo NAT puede bloquear a otro; es el compromiso habitual | R (F1) |
| `/health` público con memoria y tiempo encendido | **Aceptado** (bajo): no trae datos personales y sirve al monitoreo | L |
| Dependencias | `npm audit` en `server/`: **0 vulnerabilidades** | R |

## 6. Cambios de comportamiento (avisar a usuarios e integraciones)

1. **Pacientes fuera del alcance:** 404 en vez de 403 en eventos, consentimiento y pre-cita. El cliente muestra «no se pudo», pero el mensaje específico de la pre-cita para «otra red» (que usaba el 403) ya no aparecerá: revisarlo en la Fase 3.
2. **Rutas:**
   - `/fhir` solo para recursos FHIR. Las integraciones inician sesión en `/api/auth/login`.
   - `/api/Bundle`, `/api/Patient/…` y `/api/metadata` dan 404; se usa `/fhir/…`.
   - Las rutas dobles (`/api/api/…`) también dan 404.
3. **Importación más estricta (400 «Fila N: …»):** DNI que no tiene 8 dígitos con tipo DNI, paciente nuevo sin nombre, fechas imposibles (31/02), campos de más de 4 000 caracteres, `<` o `>` en códigos o diagnósticos.
4. **Filas «Sin documento»:** el cliente les pone el id `pac-00001741-`, el mismo para todas, y antes se fundían en un solo paciente. Ahora se rechazan. *Resuelto el 05/11/2026: Edward decidió que el documento es obligatorio (ver `F4_correcciones.md`).*
5. **Webhooks HOSIX/FHIR:**
   - El documento debe ser un DNI de 8 dígitos (antes, 3 a 15 caracteres); CE y pasaporte por esa vía se rechazan.
   - Un paciente nuevo necesita nombre.
   - Una Condition sin código se rechaza.
6. **Cuerpo y CORS:** `text/plain` → 415. CORS cerrado salvo `CORS_ORIGINS`.
7. **Cupos:** login, 30 intentos por minuto por IP; con sesión, 600 lecturas y 120 escrituras por minuto **por usuario**.
8. **Sexo y financiador:** un paciente nuevo sin esos datos queda vacío. El cliente todavía muestra «SIS» cuando el financiador está vacío (`main.js:1435`, `mapManager.js:787`; Fase 3).

## 7. Pendientes

**Técnicos, por fase**
- **Fase 3/4 (cliente):**
  - Pasar los 69 manejadores en línea a `addEventListener` y quitar `'unsafe-inline'` de `script-src`. Mientras tanto, `main.js:1605-1608` interpola `p.id` y `p.dni` dentro de JavaScript en línea. Hoy es seguro porque el servidor solo acepta `[A-Za-z0-9_.-]` en ids y letras o dígitos en documentos, pero no debe depender de eso.
  - ~~Id propio para «Sin documento»~~ (no aplica: el documento es obligatorio).
  - No perder las letras del CE o del pasaporte (`replace(/\D/g, '')` en `padronGridModal.js`).
  - No mostrar «SIS» cuando el financiador está vacío.
  - Mensaje de la pre-cita con 404.
  - Probar el tooltip con un diagnóstico guardado.
  - Cierre de sesión por inactividad.
- **Fase 5:**
  - Cifrado en reposo y respaldos cifrados fuera del servidor (decidir la custodia de la clave).
  - Retención y durabilidad de la bitácora; las lecturas suman cerca de un evento por usuario, recurso y hora.
  - `runTransaction` no deshace si algo falla a mitad. Está mitigado porque se valida todo antes de escribir, pero no es atómico.
  - El oráculo residual de F2-04 en la importación.
- **Fase 6/7:**
  - Confirmar en Render cuántos proxies hay delante. Con `trust proxy 1` y dos saltos, `req.ip` sería la IP de un proxy y el cupo de login sin sesión sería compartido; con el puerto expuesto, `X-Forwarded-For` se falsea (L-10).
  - Cupos: con la decisión de Edward (como máximo 5 usuarios concurrentes en Render) sobran. Para la escalada a más de 2 000 usuarios, un límite en memoria no sirve con varias instancias; va en la ruta de migración que documenta la Fase 5.

**De Edward (no técnicos)**
1. **Rotar secretos:** si alguna vez se desplegó con los valores del antiguo `.env.example`, cambiar `AUTH_SECRET` y la clave del ADMIN. Siguen en el historial de Git.
2. ~~Pacientes sin documento~~ — **resuelto (05/11/2026): no; el documento es obligatorio.**
3. ~~Integración HOSIX~~ — **resuelto (05/11/2026): sí llegan; implementado en la Fase 4.**
4. ~~Claves~~ — **resuelto (05/11/2026): correo obligatorio, cambio y recuperación por código; implementado en la Fase 4.**
5. **Cifrado en reposo:** ¿quién custodia la clave?

## 8. Verificación

| Qué | Resultado |
|---|---|
| `npm test` (19 suites) | **263 correctas, 0 con falla** (Node 22.23.4, con `ADMIN_*`, `NODE_ENV` y `AUTH_SECRET` limpios) |
| Suite nueva `testSeguridadF2.js` | Antes de corregir: 3 de 37 (las 3 son controles de regresión); después: **37 de 37** |
| Pruebas existentes modificadas | Solo donde codificaban el comportamiento corregido: 403 → 404 fuera del alcance (`testAuthHttp`, `testLineaTiempo`, `testConsentimiento`, `testRevision30oct`), ETag por usuario y secreto repetitivo (`testAuth`), importación del nuevo enrutador (`testErrorB`) |
| Humo del cliente real (Chromium, `05_humo_cliente.js`) | Login; importación Excel de 3 pacientes (200, `ultima_modificacion_por: admin`); precarga por DNI en Registro Clínico («Paciente Encontrado») y Guardar (200); XSS del diagnóstico mostrado como texto; **0 violaciones de la CSP y 0 errores de página** |
| Regresión descartada en el humo | Un cuelgue de la prueba al guardar desde Registro Clínico se investigó contra el código original. La causa era la propia prueba: leía el cuerpo de la respuesta mientras la alerta de éxito seguía abierta. El guardado respondió 200 en ambos casos |
| `npm audit` (`server/`) | 0 vulnerabilidades |
| `server/db/store.json` | `npm test` lo crea (S-15, Fase 6); se borró al terminar. Ningún archivo de datos entró al commit |

## 9. Evidencia

`docs/produccion/evidencia/f2/` (ver su `README.md`): `01_explotacion.js` (16 hipótesis), `02_bitacora_borrado.js`, `03_admin_reset.sh`, `04_csp_navegador.js`, `05_humo_cliente.js`, `srv.sh` y las salidas `out_*_antes.txt` / `out_*_despues.txt`. La prueba automática equivalente es `server/tests/testSeguridadF2.js`.

## 10. Siguiente ventana

**Fase 3 — Cliente, PWA y lógica clínica.** Modelo sugerido: **Opus 5.5** (entregable `F3_cliente_clinica.md`).

**Qué leer (y solo eso):**
1. `docs/produccion/PLAN.md` (sección «Fase 3» y las reglas).
2. Este archivo: secciones 1, 6 (cambios de comportamiento que el cliente debe reflejar) y 7 (pendientes del cliente).
3. `F1_diagnostico.md`, sección 5 (hallazgos del cliente C-02 a C-14).
4. `docs/GUIA_NORMA_HEARTS.md` para las reglas clínicas, y del HANDOFF solo las fichas que la ventana necesite.

**Qué hacer:**
- Auditar en Chromium `client/index.html`, `client/sw.js`, `client/js/main.js`, `auth/session.js`, `map/mapManager.js`, `ui/*.js`, `data/*.js` y `clinical/*.js`: sumideros de HTML restantes, manejadores en línea con datos, service worker y caché sin conexión (C-02), sesión y residuos entre usuarios (C-04), importación y exportación Excel (C-05 a C-09), tablero del DIRECTOR (C-03), móvil (C-10) y los pendientes del cliente de la sección 7.
- Validar la **precarga por DNI** del Registro Clínico por rol, red y establecimiento, y los valores por defecto que rellena (requisito de Edward en `PLAN.md`). Con el servidor corregido funcionó con el ADMIN («Paciente Encontrado», humo 05).
- Separar los errores clínicos de los técnicos; los clínicos (semáforo, indicadores del convenio, HEARTS, edad C-06) se validan con la licenciada de crónicos.

**Si Edward quiere el mismo modo que en esta ventana** (auditar y corregir en la misma fase), conviene decirlo en la plantilla. Si no, la Fase 3 solo audita y la Fase 4 corrige.

**Plantilla para abrir la ventana:**
> Lee `docs/produccion/PLAN.md` y `docs/produccion/F2_seguridad_servidor.md`. Ejecuta la Fase 3. Trabajo en la rama `claude/pensive-cray-3lwodm`. Al terminar: actualiza el estado en el plan, commit y push, y dime la siguiente ventana.
