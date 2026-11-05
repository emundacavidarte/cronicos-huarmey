# Plan de paso a producción — Crónicos Huarmey

Documento de traspaso entre ventanas. **Cada fase se ejecuta en una ventana nueva** (sesión limpia).
Al empezar una ventana: leer SOLO este archivo y los archivos que la fase pide. Al terminar: marcar la fase aquí, commit y push.

## Decisiones tomadas (no reabrir sin motivo)
- Plataforma: **Render, plan Starter (pago) + disco persistente**. El plan gratuito se usa solo como staging con los 20 pacientes simulados.
- Persistencia: `store.json` en el disco (`DATA_DIR`). **Una sola instancia** (no escala a varias).
- Datos reales de pacientes: **nunca** en el repositorio ni en el historial. Solo se cargan en producción.
- Rama de trabajo: `claude/pensive-cray-3lwodm`. No tocar `main`. No abrir pull request salvo que Edward lo pida.
- Regla de evidencia: nada se afirma sin haberlo ejecutado. Cada hallazgo se reproduce o se marca «solo por lectura».

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
| 3 | Auditoría del cliente, PWA y lógica clínica | Opus 5.5 | `F3_cliente_clinica.md` | PENDIENTE |
| 4 | Correcciones críticas y altas | Opus 5.5 (seguridad) y Sonnet 5.5 (resto) | `F4_correcciones.md` | PENDIENTE (las del servidor ya se hicieron en la Fase 2) |
| 5 | Persistencia, respaldos y migración de datos reales | Opus 5.5 | `F5_datos_respaldos.md` | PENDIENTE |
| 6 | Infraestructura: Render, CI, repositorio | Sonnet 5.5 | `F6_infraestructura.md` | PENDIENTE |
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
**Cierre:** errores clínicos separados de errores técnicos; los clínicos se validan con la licenciada de crónicos.

### Fase 4 — Correcciones críticas y altas
Corregir en orden de gravedad con prueba que falla antes y pasa después. Seguridad y datos primero. Lo medio y bajo queda en lista, no se mezcla.
*Nota (Fase 2):* las correcciones del servidor (S-01 a S-07, S-11 a S-13, S-16, C-01 y los hallazgos F2) ya están hechas y probadas. La Fase 4 queda para lo que encuentre la Fase 3 en el cliente y la lógica clínica, salvo que esa fase también corrija.

### Fase 5 — Persistencia, respaldos y datos reales
`DATA_DIR` en el disco de Render, escritura atómica y recuperación (`store.json.bak`), crecimiento de `store.json` y de la bitácora, respaldo automático y cifrado fuera del servidor, **prueba de restauración**, procedimiento de carga del padrón real (sin pasar por Git), umbral para migrar a SQLite o Postgres.

### Fase 6 — Infraestructura
`render.yaml` (Blueprint), versión de Node fija, `package-lock.json` único, healthcheck, variables de entorno (`AUTH_SECRET`, `ADMIN_PASSWORD`, `TRUST_PROXY`, `DATA_DIR`), `.env.example` sin claves reales, `LICENSE`, GitHub Actions con `npm test`, Dependabot, escaneo de secretos, README de despliegue.

### Fase 7 — Staging y producción
Desplegar primero en staging con datos simulados; humo contra la URL pública; luego producción con disco; carga del padrón real; primer usuario administrador; monitoreo de disponibilidad; plan de reversión; `RUNBOOK.md` (reinicio, restauración, rotación de claves, alta de usuarios).

### Fase 8 — Revisión final independiente
Un modelo distinto revisa el diff completo y la lista de hallazgos sin ver mis conclusiones. Decide Go / No-Go con condiciones.

## Pendientes que NO son técnicos (los decide Edward)
- Inscripción del banco de datos personales y base legal del tratamiento (Ley 29733); transferencia fuera del Perú (Render no tiene región en Lima).
- Quién valida las reglas clínicas y quién administra usuarios.
- Presupuesto mensual (Starter + disco, aprox. US$ 8).
- Capacidad objetivo (surgido en la Fase 1): el código promete «1 000+ usuarios»; lo medido sostiene decenas de usuarios por hospital con ≈550 pacientes. ¿Cuántos usuarios simultáneos se esperan?
- Trabajo sin conexión (Fase 1): hoy no funciona y no deja datos en el dispositivo. ¿Se quiere trabajar sin red con datos de pacientes, o basta un aviso claro?
- Tamaño de la instancia (Fase 1): con 550 pacientes y mucha concurrencia el proceso llega a 1,4 GB; confirmar la memoria del plan Starter de Render (se cree 512 MB) en la Fase 6.
- Rotación de secretos (Fase 2): si alguna vez se desplegó con los valores del antiguo `.env.example`, cambiar `AUTH_SECRET` y la clave del ADMIN. Siguen en el historial de Git.
- Pacientes sin documento (Fase 2): ¿se registran? Hoy el servidor rechaza esas filas porque el cliente les pone a todas el mismo id; hace falta definir su identificador.
- Integración HOSIX (Fase 2): ¿llegarán carnés de extranjería o pasaportes? Hoy esa vía exige DNI de 8 dígitos.
- Claves de usuario (Fase 2): solo el ADMIN fija y cambia las claves; ¿se quiere que cada usuario cambie la suya y que la inicial sea obligatoria de cambiar?
- Cifrado en reposo (Fase 2 → Fase 5): ¿quién custodia la clave? Si se pierde, se pierde el padrón.

## Plantilla para abrir cada ventana
> Lee `docs/produccion/PLAN.md` y el informe de la fase anterior. Ejecuta la Fase N. Trabajo en la rama `claude/pensive-cray-3lwodm`. Al terminar: actualiza el estado en el plan, commit y push, y dime la siguiente ventana.
