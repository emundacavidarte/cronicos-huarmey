# Reporte de prueba en navegador — Sistema Territorial de Crónicos Huarmey v3.0

**Fecha:** 05/11/2026 (hora de Lima: 04/11/2026, noche)
**Rama probada:** `claude/compassionate-cori-5c7urn` (versión `26096bf`)
**Datos:** solo los 20 pacientes ficticios de `server/db/padron_inicial.js`, más 3 pacientes inventados que se crearon durante la prueba (DNI 7000009x). El servidor usó una carpeta de datos temporal (variable `DATA_DIR`), así que no se tocó `server/db/store.json`.
**Navegador:** Chromium controlado de forma automática con la herramienta Playwright, sin ventana visible, con idioma español de Perú y zona horaria de Lima.
**Capturas de pantalla:** carpeta [`reporte_navegador_2026-11-05/`](reporte_navegador_2026-11-05/). **Programas que hicieron el recorrido:** [`reporte_navegador_2026-11-05/scripts/`](reporte_navegador_2026-11-05/scripts/).

> **Actualización del mismo día:** todos los hallazgos de este reporte se corrigieron y se volvieron a probar en el navegador y en los 9 tamaños de pantalla. El detalle está en la **sección 9**. Las secciones 1 a 8 describen el estado ANTES de las correcciones.

> **Limitación del entorno de prueba:** la red del equipo de prueba bloquea los servidores de mapas externos (Esri, Google, CARTO y OpenStreetMap), así que en las capturas no se ve el mapa de fondo. Las capas propias del sistema (catastro, límites y líneas de referencia) sí cargan. Esto no es una falla del sistema.

---

## 1. Resumen

| Bloque | Resultado |
|---|---|
| Pruebas automáticas (`npm test`) | ✅ 18 grupos de pruebas, **226 de 226** correctas |
| Prueba de navegador incluida en el repositorio (`tests/browser/testNavegadorAcceso.js`) | ⚠️ 14 de 15. La que falla es una prueba desactualizada, no un error de la aplicación (ver 4.1) |
| Recorrido funcional en el navegador (unos 80 pasos) | ⚠️ El flujo principal funciona, con **6 errores funcionales** y **8 observaciones de interfaz** |
| Adaptación a distintos tamaños de pantalla (diseño adaptable o «responsive», 9 tamaños) | ❌ **No se adapta por completo.** Bien en computadoras (1280–1920 px) y en tableta vertical (768 px). Con problemas serios en celulares (360–412 px), celular horizontal y tableta horizontal (1024 px) |
| Trabajo sin conexión | ❌ La aplicación no abre cuando el servidor no responde, aunque el navegador tiene los archivos guardados |
| Rutas de la API (REST y HL7 FHIR) | ✅ Responden. Siguen abiertas las tareas ya conocidas T-04 y T-05 |

---

## 2. Lo que funciona correctamente ✅

**Acceso y roles**
- Sin sesión se ve solo la pantalla de acceso y no se piden datos de pacientes.
- Con clave incorrecta aparece «Usuario o clave incorrectos.». El botón para ver la clave funciona.
- Al recargar la página la sesión se conserva. «Salir» borra la sesión, los pacientes, los indicadores y la lista.
- **Administrador:** ve todo y registra usuarios. Valida usuario repetido, clave de menos de 10 caracteres y red obligatoria. Los establecimientos se filtran según la red elegida.
- **Coordinador** del C. S. La Victoria: ve solo los 3 pacientes de su establecimiento, puede registrar atenciones y no ve «Usuarios».
- **Director:** no recibe datos individuales. El servidor le niega el acceso (código 403) a la lista de pacientes y a cualquier escritura, y sí le entrega el resumen agregado.

**Mapa y padrón (en computadora)**
- El mapa abre centrado en el Nuevo Hospital (-10.04780, -78.15480, nivel de acercamiento 15) con 20 pacientes marcados. Ningún paciente queda sin coordenadas.
- Los indicadores de la barra superior filtran el panel: Cita vigente 8, Próximos 2, Deserción 6, HOSIX 2.
- Funcionan los filtros por HTA (18), por DM2 (4) y por semáforo, y la búsqueda por DNI (1 resultado), por apellido y sin resultados.
- La ficha clínica abre sin textos como «undefined» o «NaN» y se cierra con la tecla Escape.
- El botón «Ver» centra el mapa en el paciente (acercamiento 16) y el clic en un marcador muestra su ventana de información.
- Capas y red: 7 redes integradas (RIS) → 45 zonas → 226 puertas de entrada, panel de información y 5 hospitales de referencia. Los botones 🏠, + y − funcionan.

**Registro clínico**
- Buscar un DNI ya registrado precarga filiación, domicilio, teléfono y tratamiento.
- Un DNI inválido o un DNI nuevo muestran el mensaje correcto.
- Se validan los campos obligatorios: nombre y consentimiento.
- Los cálculos automáticos funcionan (IMC 29.4, presión 150/95 «fuera de meta», «qué le falta al paciente»).
- Al guardar, el paciente queda en el servidor con presión 150/95, estado «No Controlado» y cita el 2026-12-10.

**Pre-cita, WhatsApp y exportaciones**
- La pre-cita se registra en el servidor y se descarga el archivo CSV de pre-citas.
- WhatsApp pide primero el consentimiento del paciente y recién después abre el enlace de envío.
- La exportación a Excel genera un archivo de 276 KB.

**Tablero de indicadores (Administrador)**
- El total coincide con la barra superior.
- Se muestran patologías, indicadores del convenio IP02, IP03 e IP04, indicadores por establecimiento y la tabla de IPRESS.

**API**
- Responden la verificación de estado (`/health`), la declaración de capacidades FHIR (`/fhir/metadata`), el catálogo LOINC, el expediente FHIR del paciente, el ingreso de pacientes en formato FHIR (`POST /fhir/Bundle`), el resumen de alertas, los indicadores del convenio y el registro de auditoría.
- Sin credencial de acceso el servidor responde 401 (no autorizado). Una ruta inexistente responde 404 (no encontrado) y el archivo antiguo `sampleDataset.js` ya no se publica.

---

## 3. Errores funcionales encontrados ❌

| N.º | Gravedad | Hallazgo | Evidencia / ubicación |
|---|---|---|---|
| F-1 | **Alta** | **La carga de un CSV de HOSIX no se guarda.** Al subir un CSV con el formato de `templates/Plantilla_Importacion_HOSIX_Galenos.csv` aparece «¡Ingesta exitosa! Se procesaron y georreferenciaron 1 pacientes», pero el paciente solo queda en la memoria del navegador. Al recargar, desaparece. | `client/js/main.js`, función `handleFileUpload`: agrega a la lista en pantalla y nunca envía al servidor. Ya figura como pendiente en **T-11**, pero el mensaje de éxito engaña al usuario. |
| F-2 | **Alta** | **El Excel que exporta el propio sistema no se puede volver a importar.** Al cargar el archivo exportado aparecen «25 inconsistencias en 20 pacientes»: 20 por consentimiento vacío, 3 por «meses de medicación», 1 por establecimiento de adscripción y 1 por establecimiento que lo controla. El botón queda en «⛔ Corrija 25 celdas (0 % completado)». La prueba automática de exportar e importar pasa solo con sus propios datos de prueba, no con el padrón inicial. | Captura `04_reimportar_excel_bloqueado.jpg` |
| F-3 | **Alta** | **El tablero del Director sale en cero.** Muestra «Población crónica activa 0», deserción 0, próximos 0, la barra del semáforo vacía, las patologías en 0 % y la tabla de IPRESS vacía, mientras la barra superior del mismo usuario muestra 21/9/3/5/2. Es la pantalla principal de ese rol. | La función `renderDashboard()` calcula con la lista de pacientes en pantalla, que para el Director está vacía. Debería usar el resumen del servidor (`/api/alerts/summary`). Captura `05_tablero_director_en_cero.jpg` |
| F-4 | **Alta** | **No funciona sin conexión.** El navegador guarda los 38 archivos de la aplicación (mediante el archivo `sw.js`), pero al abrirla con el servidor apagado entre 21 y 27 archivos de programa reciben el error 503 «Offline» y la aplicación no arranca: se ve la cabecera, el mapa en blanco y ninguna pantalla de acceso. Se reprodujo de 4 formas: simulando la falta de red, apagando el servidor y recargando, abriendo una pestaña nueva y sin interceptar la red. No se encontró la causa de fondo: desde la consola del navegador los mismos archivos sí se obtienen. El LEEME promete trabajo de campo sin conexión. | `client/sw.js`. Captura `06_sin_conexion.jpg` |
| F-5 | Media | **Error de programa al cambiar el mapa de fondo:** «`this.layers.catastroUrbano.bringToFront is not a function`». Ocurre al iniciar y en cada cambio de mapa de fondo. Ese grupo de capas se creó con un tipo (`L.layerGroup`) que no tiene la función de traer al frente, y el error corta el resto del proceso: no se reordenan las capas siguientes (líneas de referencia, puerta de entrada, zonas y **pacientes**) y no se sincronizan los dos selectores de mapa de fondo. | `client/js/map/mapManager.js:1078`; las capas se crean en las líneas 178–184 |
| F-6 | Media | **El mensaje de WhatsApp anuncia una fecha de control que no es la del paciente.** La función `enviarWhatsApp` usa siempre «hoy + 3 días». Un paciente con próxima cita el 25/11/2026 recibió «su control periódico corresponde para la fecha *7/11/2026*». | `client/js/main.js`, función `enviarWhatsApp`. Relacionado con **T-13** |

## 4. Observaciones de interfaz y consistencia ⚠️

| N.º | Hallazgo | Ubicación |
|---|---|---|
| O-1 | **La ficha clínica se ve sin formato en las secciones I a IV.** La ficha usa 13 estilos que no están definidos en ninguna hoja de estilos (`hearts-anthro-grid`, `hearts-grid-2/3/4`, `hearts-metric-top/label/bottom/ref`, `hearts-pa-title/sub/right`, `hearts-unit` y `hearts-empty-val`). Por eso peso, talla, glucosa, creatinina, etc. salen como texto apilado y no en celdas. Además, el LEEME promete un «Cronograma Anual 2026» y la ficha muestra una «Evolución trimestral». | `client/js/main.js` (función `openPatientDetail`). Captura `03_ficha_sin_estilos.jpg` |
| O-2 | **El indicador «HOSIX» queda tapado por el panel del padrón.** Con el panel abierto, el indicador ocupa de x = 985 a 1082 px y el panel empieza en x = 986 px. No se puede volver a pulsar para cerrar el panel, como indica el LEEME. | Captura `02_kpi_hosix_tapado.jpg` (pantalla de 1440×900) |
| O-3 | **Etiquetas que significan cosas distintas.** El indicador dice «Cita vigente» (vigencia de la cita) y el botón de filtro dice «Meta», pero ambos filtran lo mismo (8). El LEEME dice que «En Meta» es presión controlada, y el tablero muestra «Control clínico en meta 75 %», que es otra medida. El «Total» de la barra superior incluye 2 fallecidos (8+2+6+2 = 18, no 20), igual que «Población crónica **activa**». | `index.html`, `main.js` (funciones `updateKpis` y `renderDashboard`) |
| O-4 | **La pantalla no se actualiza después de guardar.** Tras «Guardar atención», el paciente nuevo queda en pantalla sin presión ni estado de control: su tarjeta muestra presión «—» y meta «—» hasta recargar, aunque el servidor sí tiene 150/95. Tras una pre-cita, los indicadores tampoco cambian hasta recargar (el paciente pasa de rojo a amarillo). | `registroClinicoModal.js` (guardar) y función `confirmarPreCita` |
| O-5 | «Período Octubre 2026» está escrito fijo en el tablero, aunque hoy es noviembre. | `client/index.html:512` |
| O-6 | La ventana del marcador dice «Sin datos de laboratorio — Empadronar en HEARTS» a pacientes que ya están en el padrón. | `client/js/map/mapManager.js:801` |
| O-7 | Las validaciones del registro clínico usan la ventana de alerta del navegador, que bloquea la pantalla, en lugar de los avisos emergentes que usa el resto de la aplicación. | `registroClinicoModal.js` |
| O-8 | **Quedan textos en inglés en la interfaz.** «Director (solo **dashboard** de su red)» en el registro de usuarios; «Tablero de Indicadores y **Dashboards**» como descripción del tablero; y en los créditos de los mapas de fondo «**Tiles**», «**Imagery**», «**Terrain**», «**Map data**» y «OpenStreetMap **contributors**». | `client/index.html:153, 503 y 846`; `client/js/map/mapManager.js:109–157` |

### 4.1 Prueba de navegador del repositorio
- `server/tests/browser/testNavegadorAcceso.js` solo busca Edge o Chrome en rutas de Windows, así que no corre en Linux ni en Mac. Se ejecutó una copia que solo cambia la ruta del navegador: **14 de 15**.
- La que falla espera ver el botón `#btn-toggle-hearts`, que hoy está oculto a propósito por el rediseño (el padrón se abre desde la barra lateral). Hay que actualizar la prueba; la aplicación no tiene el error.

---

## 5. Revisión de adaptación a pantallas (9 tamaños)

Para cada tamaño se midió:
- si la página se desplaza hacia los costados;
- qué elementos quedan fuera de la pantalla;
- si hay elementos encimados en la cabecera;
- si cada ventana cabe y si su botón de cerrar se ve.

Se recorrieron acceso, mapa, padrón, capas, ficha, registro, cuadrícula de Excel, tablero, usuarios, pre-cita y menú.

| Pantalla | Resultado |
|---|---|
| 360×740 (Android) · 390×844 (iPhone 13) · 412×915 (Pixel 7) | ❌ Problemas serios (R-1 a R-7) |
| 844×390 (celular horizontal) | ❌ R-8, R-9 |
| 768×1024 (tableta vertical) | ✅ Bien: barra inferior, indicadores completos, ficha y registro usables. Solo se recorta la cabecera a la derecha, pero «Salir» está en la barra inferior |
| 1024×768 (tableta horizontal) | ❌ R-8: sin botón «Salir» visible |
| 1280×720 · 1366×768 · 1920×1080 (computadoras) | ✅ Sin problemas |

**Lo positivo:** en ningún tamaño la página se desplaza hacia los costados. Las ventanas de acceso, usuarios y pre-cita caben en todos los tamaños. Las tablas del tablero se desplazan dentro de su propio recuadro.

**Problemas:**

| N.º | Pantallas | Hallazgo |
|---|---|---|
| R-1 | Celulares | **La cabecera se corta.** Buscador, selector de mapa de fondo, «Usuarios», nombre del usuario y «Salir» quedan fuera de la pantalla (entre x = 374 y 1143 px en un ancho de 360). **En el celular no hay forma de buscar un paciente**, porque la barra inferior no tiene buscador. |
| R-2 | Celulares | **Solo se ven 2 de los 5 indicadores** (Total y Cita vigente). Próximos, Deserción y HOSIX quedan fuera (entre x = 336 y 680) y nada indica que se pueda deslizar. |
| R-3 | 360–412 px | **El panel del padrón mide 440 px fijos**, así que en 360 px se cortan 94 px a la izquierda: nombres truncados, botón de filtro «Todos» oculto y «Exportar Excel» cortado. |
| R-4 | Celulares y celular horizontal | **La ficha clínica usa una grilla de 6 columnas fijas** (celdas de 64 a 98 px), con textos cortados. La parte superior de la ventana queda fuera (−31 px) y los botones del pie (Ubicar, Registrar atención, Pre-cita, WhatsApp) quedan fuera de la pantalla en todo o en parte. |
| R-5 | Celulares | **El registro clínico no se puede usar.** La zona del formulario mide **32 px de alto** (con 2617 px de contenido), mientras el panel de resultados ocupa 420 px. Prácticamente no se pueden llenar datos desde un celular. Captura `11_registro_movil_formulario_32px.jpg` |
| R-6 | Celulares | Cuadrícula de Excel: el botón ✕ de cerrar queda fuera de la pantalla y la insignia «% Válido» se corta. Se puede usar desplazándose y con el botón Cancelar. |
| R-7 | Celulares | Tablero: el botón «Exportar Padrón Excel» se corta en el borde derecho y el título ocupa 5 líneas. |
| R-8 | De 769 a unos 1160 px (tableta horizontal, computadoras pequeñas) y celular horizontal | **No hay botón «Salir» visible.** Queda fuera de la cabecera (entre x = 1107 y 1143 px en un ancho de 1024) y la barra inferior para celulares solo aparece hasta 768 px. El nombre del usuario también se corta. Captura `10_tablet_1024_sin_boton_salir.jpg` |
| R-9 | 844×390 | En el menú lateral las etiquetas se enciman y se cortan («Mapa», «Indicadores»…). La ventana de pre-cita es más alta que la pantalla. |
| R-10 | General | Todas las hojas de estilo tienen solo 5 reglas de adaptación a pantalla (`@media`, para 900 px y 768 px). La cabecera, el panel del padrón, la ficha y el registro no tienen reglas para pantallas angostas. |

---

## 6. Rutas de la API y servidor

- Las rutas duplicadas siguen respondiendo con éxito (`/api/api/cronicos`, `/fhir/api/cronicos`) → pendiente **T-04**.
- Si se envía un JSON mal formado, el servidor devuelve al usuario el mensaje técnico interno → pendiente **T-05 (S7)**.
- `GET /fhir/Patient/10000001` devuelve un paquete de recursos (`Bundle`) y no el recurso del paciente (`Patient`), que es lo que el estándar FHIR R4 espera en esa ruta.
- La declaración de capacidades FHIR (`/fhir/metadata`) exige credencial de acceso. En FHIR suele ser pública; es una decisión a confirmar.
- El archivo de ejemplo de configuración `.env.example` trae una clave de administrador (`ADMIN_PASSWORD`) y una clave secreta (`AUTH_SECRET`) reales. Si alguien lo copia tal cual a producción, las credenciales serían conocidas. Conviene dejar esos valores vacíos (encaja en el bloque de seguridad del final).

## 7. Documentación

- `LEEME_INICIO_RAPIDO.md` dice «10 pacientes sintéticos» (son 20), usa la etiqueta «En Meta» (hoy dice «Cita vigente») y trae una ruta local de Windows (`C:\Users\PC-EDWARD\...`).
- El README indica `npm install` y `npm start` en la carpeta principal: funciona.

---

## 8. Orden sugerido para corregir

1. **F-3** (tablero del Director en cero) y **R-8** (sin «Salir» entre 769 y 1160 px): arreglos pequeños con mucho impacto.
2. **F-1** (decidir T-11 y, mientras tanto, no mostrar «Ingesta exitosa») y **F-2** (aceptar el consentimiento vacío del padrón inicial o permitir registrarlo para todos a la vez).
3. **F-5** (crear esas capas con un tipo que sí pueda traerse al frente, `L.featureGroup()`, o proteger la llamada) y **O-1** (agregar los estilos que faltan en la ficha).
4. **Celulares:** R-1, R-2, R-3, R-4 y R-5. Cabecera plegable con el buscador en la barra inferior, panel a todo el ancho, ficha en 2 columnas y formulario de registro antes del panel de resultados.
5. **F-4** (trabajo sin conexión), **F-6** (fecha del WhatsApp) y **O-8** (textos en inglés).

---

## 9. Correcciones aplicadas y verificación (05/11/2026)

Se repitieron los mismos recorridos en el navegador con datos limpios y los 9 tamaños de pantalla.

| Bloque | Antes | Después |
|---|---|---|
| Pruebas automáticas (`npm test`) | 226 de 226 | ✅ **242 de 242** (19 grupos; se agregó `testCorrecciones05nov.js` con 16 pruebas, de las cuales 14 fallaban con el código anterior) |
| Prueba de navegador del repositorio | 14 de 15 y solo en Windows | ✅ **15 de 15**; ahora corre en Windows, Linux y Mac (variable `NAVEGADOR=` para indicar otro navegador) |
| Errores de programa en la página | `bringToFront` en cada cambio de mapa | ✅ Ninguno en todo el recorrido |
| Adaptación a pantallas | Fallaba en celulares, celular horizontal y tableta horizontal | ✅ Los 9 tamaños sin elementos fuera de la pantalla, con los 5 indicadores visibles y «Salir» siempre accesible |
| Trabajo sin conexión | No abría | ✅ Abre con el servidor apagado (0 archivos fallidos) y muestra el acceso con un mensaje claro |

### 9.1 Qué se corrigió en cada hallazgo

| N.º | Corrección | Dónde |
|---|---|---|
| F-1 | El CSV de HOSIX / Galenos se envía al servidor (`/api/padron/importar-lote`). El aviso de éxito aparece solo cuando el servidor confirma. El analizador lee el texto completo: comillas con saltos de línea, marca BOM, `\r\n`, y UTF-8 o Windows-1252. Ya no inventa DNI («DNI-1»), nombre («PACIENTE REGISTRADO»), dirección ni diagnóstico («I10»): las filas sin documento o sin nombre se descartan y el aviso indica cuáles. El establecimiento sale de la columna `COD_IPRESS_ORIGEN` (cierra **T-11**). | `client/js/data/hosixParser.js`, `client/js/main.js` (`handleFileUpload`) |
| F-2 | El Excel exportado se vuelve a importar 100 % válido. Un paciente que ya está en el sistema sin consentimiento puede cargarse y se le preguntará en su primer WhatsApp; a un paciente nuevo se le sigue exigiendo. Un establecimiento del catálogo oficial escrito con su código (por ejemplo, P. S. Culebras) se acepta. Se quitó el valor «0» de «meses de medicación» del padrón inicial ficticio, porque no existe en la lista oficial. | `client/js/ui/padronGridModal.js`, `client/js/data/padronSchema.js`, `server/db/padron_inicial.js` |
| F-3 | El tablero del Director se arma con agregados que entrega el servidor en `/api/alerts/summary` (bloque `tablero`), sin datos individuales. El cálculo vive en un módulo único que usan el servidor y el navegador, así los números coinciden. | `client/js/clinical/resumenTablero.js` (nuevo), `server/routes/apiRoutes.js`, `client/js/main.js` |
| F-4 | Se quitó el script de `index.html` que borraba en cada carga la caché vigente del trabajador de servicio (comparaba contra un nombre antiguo). La instalación guarda archivo por archivo y la lista de caché coincide con las versiones de la página. | `client/index.html`, `client/sw.js` |
| F-5 | Las capas se traen al frente con una función que también recorre los grupos (`L.layerGroup` no tiene `bringToFront`). | `client/js/map/mapManager.js` (`traerAlFrente`) |
| F-6 | El mensaje usa la cita real del paciente. Con cita futura dice «su próximo control es el *dd/mm/aaaa*»; con la cita vencida pide reprogramar; sin cita no inventa fecha; a un fallecido no se le envía nada. | `client/js/clinical/whatsappNotifier.js`, `client/js/main.js` |
| O-1 | Se agregaron los 13 estilos que faltaban: la ficha muestra cada dato en su celda y se reacomoda en pantallas angostas. | `client/css/components.css` |
| O-2 | Con el padrón o las capas abiertos, la barra de indicadores se centra en el espacio libre del mapa. | `client/css/layout.css` |
| O-3 | «Total» y «Población crónica activa» ya no cuentan a los fallecidos, así que la suma de los semáforos da el total. «Sin cita» ya no se cuenta como «cita vigente». Los botones de filtro dicen «Cita vigente» y «Deserción», igual que los indicadores. | `resumenTablero.js`, `client/index.html`, LEEME |
| O-4 | Después de guardar una atención o una pre-cita se recarga el padrón desde el servidor: la tarjeta muestra la presión y el control, y los indicadores cambian sin recargar la página. | `registroClinicoModal.js`, `main.js` (`confirmarPreCita`) |
| O-5 | El período del tablero es el mes en curso en Lima («Período Noviembre 2026»). | `client/index.html`, `main.js` |
| O-6 | La ventana del marcador dice «Solicitar exámenes» a los pacientes ya empadronados y «Empadronar en HEARTS» solo a la brecha HOSIX. | `mapManager.js` |
| O-7 | El registro clínico y la cuadrícula de Excel avisan con mensajes en pantalla, no con la ventana de alerta del navegador. Los avisos quedan por encima de cualquier ventana. | `registroClinicoModal.js`, `padronGridModal.js`, `components.css` |
| O-8 | «Director (solo tablero de su red)», «Tablero de indicadores» y créditos de mapas en español («Datos del mapa», «Mosaicos», «Imágenes», «Relieve», «colaboradores de OpenStreetMap»). | `index.html`, `mapManager.js` |
| R-1 a R-10 | **Cabecera:** el buscador cede espacio y lo demás se oculta por tramos, solo cuando existe en otro lugar. **Celular:** los 5 indicadores en una fila, paneles a todo el ancho por encima de la barra inferior, ficha en 2 columnas, registro en una columna con «Guardar» fijo al pie, cuadrícula con ✕ visible, tablero y usuarios sin cortes. **Ventanas:** nunca superan el alto de la pantalla. **Pantallas bajas:** menú lateral compacto. **«Salir»:** visible desde 769 px y en la barra inferior hasta 768 px. | `layout.css`, `components.css`, `registro-clinico.css`, `padron-grid.css` |
| Sección 6 | Las rutas con doble prefijo responden 404 y el límite de peticiones aplica también a `/fhir` (cierra **T-04**). Un JSON mal formado responde 400 con un mensaje claro, sin el texto interno del analizador, y los errores 5xx van al registro del servidor. `/fhir/Patient/:id` entrega un recurso `Patient` y `/bundle` el expediente. `.env.example` ya no trae claves. | `server/server.js`, `server/routes/apiRoutes.js`, `.env.example` |
| Sección 7 | LEEME: 20 pacientes ficticios, significado de cada indicador, ruta genérica, trabajo sin conexión, consentimiento y CSV, y adaptación a pantallas. HANDOFF: T-04 y T-11 cerradas y una línea de registro. | `LEEME_INICIO_RAPIDO.md`, `docs/HANDOFF.md` |

### 9.2 Lo que queda pendiente

- `GET /fhir/metadata` sigue exigiendo credencial. Hacerlo público es una decisión de seguridad que debe tomar el equipo, no un error.
- Siguen pendientes las tareas de seguridad que el equipo dejó para el final (T-05 en su parte de CSP y CORS, T-10 y T-15) y la carga de datos reales (T-18). Este reporte no las cubre.
- En celular horizontal (390 px de alto) la ficha clínica se puede usar desplazándose, pero muestra poco contenido a la vez por el poco alto de la pantalla.

### 9.3 Capturas después de las correcciones

`12_despues_ficha_con_celdas.jpg`, `13_despues_indicadores_con_panel_abierto.jpg`, `14_despues_tablero_director.jpg`, `15_despues_reimportar_excel_100.jpg`, `16_despues_sin_conexion.jpg`, `17_despues_movil_360_mapa_padron_ficha_registro.jpg`, `18_despues_movil_360_excel_tablero_usuarios_precita.jpg`, `19_despues_movil_horizontal.jpg` y `20_despues_tablet_1024_con_salir.jpg`, en la carpeta [`reporte_navegador_2026-11-05/`](reporte_navegador_2026-11-05/).
