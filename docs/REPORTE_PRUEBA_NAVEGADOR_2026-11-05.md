# Reporte de prueba en navegador — Sistema Territorial de Crónicos Huarmey v3.0

**Fecha:** 05/11/2026 (hora de Lima: 04/11/2026, noche)
**Rama probada:** `claude/compassionate-cori-5c7urn` (commit `26096bf`)
**Datos:** solo los 20 pacientes sintéticos de `server/db/padron_inicial.js`, más 3 pacientes inventados que se crearon durante la prueba (DNI 7000009x). El servidor corrió con `DATA_DIR` en una carpeta temporal: no se tocó `server/db/store.json`.
**Navegador:** Chromium (Playwright) sin ventana, idioma `es-PE`, zona `America/Lima`.
**Capturas:** carpeta [`reporte_navegador_2026-11-05/`](reporte_navegador_2026-11-05/). **Scripts del recorrido:** [`reporte_navegador_2026-11-05/scripts/`](reporte_navegador_2026-11-05/scripts/).

> **Limitación del entorno de prueba:** la red del contenedor bloquea los servidores de mosaicos (Esri, Google, CartoDB, OSM), así que en las capturas no se ve el mapa base. Las capas vectoriales propias (catastro, límites, referencias) sí cargan. Esto no es una falla del sistema.

---

## 1. Resumen

| Bloque | Resultado |
|---|---|
| Pruebas automáticas (`npm test`) | ✅ 18 suites, **226/226** correctas |
| Prueba de navegador del repositorio (`tests/browser/testNavegadorAcceso.js`) | ⚠️ 14/15. La que falla es una prueba desactualizada, no un error de la aplicación (ver 4.4) |
| Recorrido funcional en navegador (≈80 pasos) | ⚠️ El flujo principal funciona, con **6 errores funcionales** y **7 observaciones de interfaz** |
| Responsive (9 tamaños de pantalla) | ❌ **No es completamente responsive.** Bien en escritorio (1280–1920 px) y en tablet vertical (768 px). Con problemas serios en celulares (360–412 px), celular horizontal y tablet horizontal (1024 px) |
| Modo sin conexión (PWA) | ❌ La aplicación no abre sin servidor, aunque el Service Worker guarda los archivos |
| Endpoints REST / FHIR | ✅ Responden. Siguen abiertas las tareas ya conocidas T-04 y T-05 |

---

## 2. Lo que funciona correctamente ✅

**Acceso y roles**
- Sin sesión se ve solo la pantalla de acceso y no se piden datos de pacientes.
- Con clave incorrecta aparece «Usuario o clave incorrectos.». El botón para ver la clave funciona.
- Al recargar la página la sesión se conserva. «Salir» borra la sesión, los pacientes, los KPI y la lista.
- **ADMIN:** ve todo y gestiona usuarios. Valida usuario repetido, clave de menos de 10 caracteres y red obligatoria. Los establecimientos se filtran por red.
- **COORDINADOR** de La Victoria: ve solo los 3 pacientes de su establecimiento, puede registrar y no ve «Usuarios».
- **DIRECTOR:** no recibe datos individuales. La API le responde 403 en `/api/cronicos` y en las escrituras, y el resumen agregado responde 200.

**Mapa y padrón (escritorio)**
- El mapa abre sobre el Nuevo Hospital (-10.04780, -78.15480, zoom 15) con 20 marcadores. Ningún paciente queda sin coordenadas.
- Los KPI del HUD filtran el panel: Cita vigente 8, Próximos 2, Deserción 6, HOSIX 2.
- Funcionan los filtros HTA (18), DM2 (4) y por semáforo, y la búsqueda por DNI (1 resultado), por apellido y sin resultados.
- La ficha clínica abre sin «undefined/NaN» y se cierra con Escape.
- El botón «Ver» centra el mapa en el paciente (zoom 16) y el clic en un marcador muestra su ventana.
- Capas y red: 7 RIS → 45 zonas → 226 puertas de entrada, panel de información y 5 hospitales de referencia. Los botones 🏠, + y − funcionan.

**Registro clínico**
- Buscar un DNI existente precarga filiación, domicilio, teléfono y tratamiento.
- Un DNI inválido o un DNI nuevo muestran el mensaje correcto.
- Se validan los campos obligatorios: nombre y consentimiento.
- Los cálculos en vivo funcionan (IMC 29.4, PA 150/95 «fuera de meta», «qué le falta al paciente»).
- Al guardar, el paciente queda en el servidor con PA 150/95, «No Controlado» y cita 2026-12-10.

**Pre-cita, WhatsApp y exportaciones**
- La pre-cita se registra en el servidor y se exporta el CSV de pre-citas.
- WhatsApp pide primero el consentimiento y recién después abre `wa.me`.
- La exportación a Excel genera un archivo de 276 KB.

**Tablero (ADMIN)**
- El total coincide con el HUD.
- Se muestran patologías, indicadores del convenio IP02/IP03/IP04, indicadores por establecimiento y la tabla de IPRESS.

**API**
- `/health`, `/fhir/metadata`, `/fhir/loinc-catalog`, `/fhir/Patient/:id/bundle`, `POST /fhir/Bundle`, `/api/alerts/summary`, `/api/indicadores/convenio` y `/api/security/audit-logs` responden.
- Sin token se recibe 401. Una ruta inexistente responde 404 y `sampleDataset.js` ya no se publica.

---

## 3. Errores funcionales encontrados ❌

| # | Severidad | Hallazgo | Evidencia / ubicación |
|---|---|---|---|
| F-1 | **Alta** | **La ingesta CSV HOSIX no se guarda.** Al subir un CSV con el formato de `templates/Plantilla_Importacion_HOSIX_Galenos.csv` aparece «¡Ingesta exitosa! Se procesaron y georreferenciaron 1 pacientes», pero solo se guarda en la memoria del navegador. Al recargar, el paciente desaparece. | `client/js/main.js` → `handleFileUpload` llama a `upsertPatients` y nunca al servidor. Ya figura como pendiente en **T-11**, pero el mensaje de éxito engaña al usuario. |
| F-2 | **Alta** | **El Excel que exporta el sistema no se puede volver a importar.** Al cargar el propio archivo exportado aparecen «25 inconsistencias en 20 pacientes» (20 por consentimiento vacío, 3 por «meses de medicación», 1 por EESS de adscripción y 1 por EESS que lo controla). El botón queda en «⛔ Corrija 25 celdas (0 % completado)». La prueba automática de ida y vuelta pasa solo con sus propios datos de prueba, no con el padrón semilla. | Captura `04_reimportar_excel_bloqueado.jpg` |
| F-3 | **Alta** | **El tablero del DIRECTOR sale en cero.** Muestra «Población crónica activa 0», deserción 0, próximos 0, la barra del semáforo vacía, las patologías en 0 % y la tabla de IPRESS vacía, mientras el HUD del mismo usuario muestra 21/9/3/5/2. Es la pantalla principal de ese rol. | `renderDashboard()` calcula con `this.patients`, que para el DIRECTOR está vacío. Debería usar `/api/alerts/summary`. Captura `05_tablero_director_en_cero.jpg` |
| F-4 | **Alta** | **El modo sin conexión no funciona.** El Service Worker guarda los 38 archivos, pero al abrir la aplicación con el servidor apagado los 21–27 scripts reciben 503 «Offline» del Service Worker. La aplicación no arranca: se ve la cabecera, el mapa en blanco y ningún acceso. Se reprodujo de 4 formas: emulación sin red, servidor apagado con recarga, pestaña nueva y sin interceptar la red. No se determinó la causa raíz: desde la consola, `caches.match` y `fetch` sí devuelven 200. El LEEME promete trabajo de campo sin conexión. | `client/sw.js`. Captura `06_sin_conexion.jpg` |
| F-5 | Media | **Error de JavaScript al cambiar el mapa base:** `this.layers.catastroUrbano.bringToFront is not a function`. Ocurre al iniciar y en cada cambio de mapa base. `L.layerGroup` no tiene `bringToFront`, así que la excepción corta el resto del método: no se reordenan las capas siguientes (referencias, puerta de entrada, zonas, **pacientes**) y no se sincronizan los dos selectores de mapa base. | `client/js/map/mapManager.js:1078`, capas creadas como `L.layerGroup()` en las líneas 178–184 |
| F-6 | Media | **El WhatsApp anuncia una fecha de control que no es la del paciente.** `enviarWhatsApp` usa siempre «hoy + 3 días». Un paciente con próxima cita el 25/11/2026 recibió «su control periódico corresponde para la fecha *7/11/2026*». | `client/js/main.js` → `enviarWhatsApp` (`fechaSugerida.setDate(+3)`). Relacionado con **T-13** |

## 4. Observaciones de interfaz y consistencia ⚠️

| # | Hallazgo | Ubicación |
|---|---|---|
| O-1 | **La ficha clínica se ve sin estilos en las secciones I a IV.** 13 clases CSS que usa la ficha no están definidas en ningún `.css`: `hearts-anthro-grid`, `hearts-grid-2/3/4`, `hearts-metric-top/label/bottom/ref`, `hearts-pa-title/sub/right`, `hearts-unit` y `hearts-empty-val`. Por eso peso, talla, glucosa, creatinina, etc. salen como texto apilado y no en celdas. Además, el LEEME promete «Cronograma Anual 2026» y la ficha muestra «Evolución trimestral». | `client/js/main.js` (`openPatientDetail`). Captura `03_ficha_sin_estilos.jpg` |
| O-2 | **La tarjeta KPI «HOSIX» queda tapada por el panel del padrón.** Con el panel abierto, la tarjeta ocupa x = 985–1082 px y el panel empieza en x = 986 px. No se puede volver a pulsar para cerrar el panel, como indica el LEEME. | Captura `02_kpi_hosix_tapado.jpg` (1440×900) |
| O-3 | **Etiquetas que dicen cosas distintas.** El KPI dice «Cita vigente» (vigencia de la cita) y el chip del filtro dice «Meta», pero ambos filtran lo mismo (8). El LEEME dice que «En Meta» significa presión controlada, y el tablero muestra «Control clínico en meta 75 %», que es otra medida. El «Total» del HUD incluye 2 fallecidos (8+2+6+2 = 18 ≠ 20), igual que «Población crónica **activa**». | `index.html`, `main.js` (`updateKpis`, `renderDashboard`) |
| O-4 | **La pantalla no se actualiza después de guardar.** Tras «Guardar atención», el paciente nuevo queda en memoria sin `pa_sistolica`, `pa_diastolica` ni `estado_control`, y su tarjeta muestra PA «—» y Meta «—» hasta recargar (el servidor sí tiene 150/95). Tras una pre-cita, los KPI tampoco cambian hasta recargar (el paciente pasa de rojo a amarillo). | `registroClinicoModal.js` (guardar), `confirmarPreCita` |
| O-5 | «Período Octubre 2026» está escrito fijo en el tablero, aunque hoy es noviembre. | `client/index.html:512` |
| O-6 | La ventana del marcador dice «Sin datos de laboratorio — Empadronar en HEARTS» a pacientes que ya están en el padrón. | `client/js/map/mapManager.js:801` |
| O-7 | Las validaciones del registro clínico usan `alert()` nativo, que bloquea la pantalla, en lugar de los avisos (toasts) del resto de la aplicación. | `registroClinicoModal.js` |

### 4.4 Prueba de navegador del repositorio
- `server/tests/browser/testNavegadorAcceso.js` solo busca Edge o Chrome en rutas de Windows, así que no corre en Linux ni en Mac. Se ejecutó una copia que solo cambia la ruta del navegador: **14/15**.
- La que falla espera ver `#btn-toggle-hearts`, que hoy está oculto con `style="display:none"` por el rediseño (el padrón se abre desde la barra lateral). Hay que actualizar la prueba; la aplicación no tiene el error.

---

## 5. Revisión responsive (9 tamaños de pantalla)

Para cada tamaño se midieron: desborde horizontal de la página, elementos fuera de la pantalla, solapes en la cabecera, si cada ventana cabe y si su botón de cerrar es visible. Se recorrieron acceso, mapa, padrón, capas, ficha, registro, cuadrícula Excel, tablero, usuarios, pre-cita y menú.

| Pantalla | Resultado |
|---|---|
| 360×740 (Android) · 390×844 (iPhone 13) · 412×915 (Pixel 7) | ❌ Problemas serios (R-1 a R-7) |
| 844×390 (celular horizontal) | ❌ R-8, R-9 |
| 768×1024 (tablet vertical) | ✅ Bien: barra inferior, KPI completos, ficha y registro usables. Solo se recorta la cabecera a la derecha, pero «Salir» está en la barra inferior |
| 1024×768 (tablet horizontal) | ❌ R-8: sin botón «Salir» visible |
| 1280×720 · 1366×768 · 1920×1080 | ✅ Sin problemas |

**Lo positivo:** en ningún tamaño la página tiene desplazamiento horizontal. Las ventanas de acceso, usuarios y pre-cita caben en todos los tamaños. Las tablas del tablero se desplazan dentro de su contenedor.

**Problemas:**

| # | Pantallas | Hallazgo |
|---|---|---|
| R-1 | Celulares | **La cabecera se corta.** Buscador, selector de mapa base, «Usuarios», chip del usuario y «Salir» quedan fuera de la pantalla (x = 374–1143 px en un ancho de 360). **En celular no hay forma de buscar un paciente**, porque la barra inferior no tiene buscador. |
| R-2 | Celulares | **Solo se ven 2 de los 5 KPI** (Total y Cita vigente). Próximos, Deserción y HOSIX quedan fuera (x = 336–680) y no hay ninguna indicación de que se pueda deslizar. |
| R-3 | 360–412 px | **El panel del padrón mide 440 px fijos**, así que en 360 px se cortan 94 px a la izquierda: nombres truncados, chip «Todos» oculto y «Exportar Excel» cortado. |
| R-4 | Celulares y horizontal | **La ficha clínica usa una grilla de 6 columnas fijas** (celdas de 64–98 px), con textos cortados. La parte superior de la ventana queda fuera (−31 px) y los botones del pie (Ubicar, Registrar atención, Pre-cita, WhatsApp) quedan parcial o totalmente fuera de la pantalla. |
| R-5 | Celulares | **El registro clínico no se puede usar.** El área desplazable del formulario mide **32 px de alto** (con 2 617 px de contenido), mientras el panel de resultados ocupa 420 px. Prácticamente no se pueden llenar datos desde un celular. Captura `11_registro_movil_formulario_32px.jpg` |
| R-6 | Celulares | Cuadrícula Excel: el botón ✕ de cerrar queda fuera de la pantalla y la insignia «% Válido» se corta. Se puede usar con desplazamiento y el botón Cancelar. |
| R-7 | Celulares | Tablero: el botón «Exportar Padrón Excel» se corta en el borde derecho y el título ocupa 5 líneas. |
| R-8 | 769 a ~1160 px (tablet horizontal, laptops pequeñas) y celular horizontal | **No hay botón «Salir» visible.** Queda fuera de la cabecera (x = 1107–1143 px en un ancho de 1024) y la barra inferior móvil solo aparece hasta 768 px. El chip del usuario también se corta. Captura `10_tablet_1024_sin_boton_salir.jpg` |
| R-9 | 844×390 | En el menú lateral las etiquetas se montan y se cortan («Mapa», «Indicadores»…). La ventana de pre-cita es más alta que la pantalla. |
| R-10 | General | Todo el CSS tiene solo 5 `@media` (900 px y 768 px). La cabecera, el panel del padrón, la ficha y el registro no tienen reglas para pantallas angostas. |

---

## 6. Endpoints y servidor

- Las rutas dobles siguen respondiendo 200 (`/api/api/cronicos`, `/fhir/api/cronicos`) → pendiente **T-04**.
- Un JSON mal formado devuelve al cliente el mensaje interno del parser → pendiente **T-05 (S7)**.
- `GET /fhir/Patient/10000001` devuelve un `Bundle`, no un recurso `Patient`. FHIR R4 espera un `Patient` en esa ruta.
- `GET /fhir/metadata` exige token. En FHIR el `CapabilityStatement` suele ser público; es una decisión a confirmar.
- `.env.example` trae una `ADMIN_PASSWORD` y un `AUTH_SECRET` concretos. Si alguien copia ese archivo tal cual a producción, las credenciales serían conocidas. Conviene dejar valores de ejemplo vacíos (encaja en el bloque de seguridad del final).

## 7. Documentación

- `LEEME_INICIO_RAPIDO.md` dice «10 pacientes sintéticos» (son 20), usa la etiqueta «En Meta» (hoy dice «Cita vigente») y trae una ruta local de Windows (`C:\Users\PC-EDWARD\...`).
- El README indica `npm install` y `npm start` en la raíz: funciona.

---

## 8. Prioridad sugerida para corregir

1. **F-3** (tablero del DIRECTOR en cero) y **R-8** (sin «Salir» entre 769 y 1160 px): arreglos chicos con mucho impacto.
2. **F-1** (decidir T-11 y, mientras tanto, no decir «Ingesta exitosa») y **F-2** (aceptar el consentimiento vacío del padrón semilla o pedirlo de forma masiva).
3. **F-5** (`bringToFront`: cambiar las capas a `L.featureGroup()` o proteger la llamada) y **O-1** (agregar el CSS que falta en la ficha).
4. **Responsive en celular:** R-1, R-2, R-3, R-4 y R-5. Cabecera plegable con el buscador en la barra inferior, panel al 100 % del ancho, grilla de la ficha en 2 columnas y formulario de registro antes del panel de resultados.
5. **F-4** (sin conexión) y **F-6** (fecha del WhatsApp).
