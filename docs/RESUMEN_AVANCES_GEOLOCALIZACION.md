# Resumen de avances: geolocalización exacta, capas GeoRIS y mapa base
**Fecha:** 05/11/2026 · **Rama:** `claude/epic-hamilton-exotru` (sin pull request) · **Estado:** todo lo descrito está hecho, probado y subido, **salvo el contraste con la fuente oficial del MINSA** (pendiente del usuario, ver §7).

> Este documento se lee solo. Si solo tiene un minuto: lea §1, §7 y §8. El detalle técnico para continuar está en `docs/HANDOFF.md` (bloque «Estado al 05/11/2026» y fichas G-06, G-07).

---

## 1. Qué se pidió y qué se decidió
| Pedido del usuario | Resultado |
|---|---|
| Revisar que la geolocalización y todas sus capas funcionen, con auditores adversariales, y corregir todo; que se pueda geolocalizar **exactamente** al paciente | Hecho: 3 auditorías independientes + 1 segunda ronda sobre lo corregido (40 hallazgos numerados, todos corregidos) y una función nueva de **ubicación exacta** (§3). |
| ¿Están bien las capas GeoRIS del MINSA (sectores, zonas, marca)? | Verificadas (§4): los polígonos y las cifras son coherentes; se corrigieron 4 defectos del dato al mostrarlo. **No se pudo comparar con el servidor oficial** (Cloudflare bloquea la nube). |
| Habilitar el acceso al GeoRIS del MINSA | El usuario habilitó el dominio en la red del entorno; el proxy dejó pasar, pero **Cloudflare, del lado del MINSA**, rechaza las conexiones desde la nube. No se intentó evadirlo. |
| Corregir todo lo encontrado | Cerrados los 4 puntos que quedaban: direcciones oficiales de los establecimientos, centros poblados, alcance por sector en importaciones, Excel y FHIR. |
| **Decisión:** mapa base | **OpenStreetMap por defecto.** Las capas de Google se **mantienen** (rotuladas «sin API, pruebas») por si luego se contrata la API. |
| Descargar el GeoRIS desde el navegador del usuario y subirlo a la nube | Se dejó listo el guion y la carpeta; la sesión en la nube no puede usar Claude in Chrome (§7). |

---

## 2. Estado de hoy en una tabla
| Área | Estado |
|---|---|
| Ubicación exacta del domicilio (GPS, mapa, coordenadas) | ✅ Hecha y probada (navegador, celular simulado) |
| Geocodificador y datos semilla | ✅ Corregidos |
| Reglas del servidor (validación, no pisar ubicación exacta, alcance por sector) | ✅ |
| Capas del mapa (RIS, zonas, sectores, establecimientos, referencias, medición) | ✅ Corregidas y verificadas una por una (7 RIS, 44 zonas) |
| Capas GeoRIS vs. fuente oficial | 🔒 Pendiente del usuario (§7) |
| Mapa base | ✅ OpenStreetMap · 🔒 API de Google a futuro |
| Pruebas | ✅ `npm test` completo en verde; 31 + 3 pruebas de navegador en verde |

---

## 3. Todo lo que se encontró y se corrigió

### 3.1 Capas del mapa (auditoría A, 17 hallazgos) — `client/js/map/mapManager.js`, `georisAncashLayers.js`, `main.js`, `index.html`
| # | Gravedad | Hallazgo | Corrección |
|---|---|---|---|
| 1 | Alta | Tras «Trazar referencia» dejaban de responder todos los polígonos y tooltips (la ruta creaba un **segundo `<canvas>`** que se quedaba con el ratón) | Un único renderer canvas para todo; prueba: sigue habiendo 1 canvas y el popup del sector responde |
| 2 | Alta | XSS almacenado en el tooltip del paciente (diagnósticos, HbA1c) | `escapeHtml` en todo el tooltip; prueba con carga maliciosa |
| 3 | Alta | Cada cambio de mapa base lanzaba una excepción (`bringToFront` en `LayerGroup`) y desincronizaba los selectores | Todas las capas son `FeatureGroup`; orden fijo; selectores siempre sincronizados |
| 4 | Alta | Al cambiar de RIS/zona quedaban capas de la red anterior; los sectores se filtraban solo por `id_zona` (se repite entre RIS) | `flyToRis`/`flyToZona` redibujan todo con RIS+zona; opciones de zona `ris\|zona` |
| 5 | Media-alta | Toda referencia se trazaba al hospital de Huarmey | Cada establecimiento va a su propio hospital (`cod_hos` de GeoRIS) |
| 6 | Media | 4 de 5 opciones de «Hospital de Referencia» no hacían nada (códigos inexistentes) | Selector generado de GeoRIS (13 hospitales reales) |
| 7 | Media | La medición no tenía botón y los polígonos se robaban el clic | Botón 📏; los popups se suspenden mientras se mide |
| 8 | Media | Orden de apilamiento dependía del historial | `_reordenarVectores()` tras cada redibujo |
| 9 | Media | Popup de zona con datos inventados («C.S. La Victoria», «12 E.S.») | Cabecera y puertas reales del bundle |
| 10 | Media | 7 de 11 «puertas de entrada» de Huarmey son **vinculados** en GeoRIS | Rol correcto, «vinculado a …» en popup, tooltip y selector |
| 11–17 | Baja | Botones de popups sin sincronizar selectores; LOD borraba el resaltado de la RIS; terreno del hospital de 19 523 m² (declarado 11 325,98); pin de búsqueda desaparecía antes; popups bajo los paneles laterales; etiquetas y leyendas de mapas base engañosas; ruta roja sin forma de borrarla; Sihuas duplicado | Todos corregidos (terreno redibujado como contorno referencial con el área oficial; nombres reales de los mapas base; leyendas con los colores reales) |

### 3.2 Geocodificación y ciclo de vida de las coordenadas (auditoría B, 11 hallazgos) — `ancashGeocoder.js`, `database.js`, `geoUbicacion.js`
| # | Gravedad | Hallazgo | Corrección |
|---|---|---|---|
| 1 | Crítica | «Jirón/Psje./Av. Casma», «Jr. Huaraz», «Av. Chimbote» se iban a la **ciudad** (66–109 km) | La ciudad solo si se nombra como ciudad; un número de casa o tipo de vía indica calle |
| 2 | Crítica | Cada reimportación pisaba la coordenada guardada, aunque fuera exacta | El servidor protege la ubicación exacta (misma dirección) |
| 3 | Alta | El servidor aceptaba coordenadas basura (texto, 0/0, 999, invertidas) y un valor malo rompía el mapa | `geoUbicacion.validarCoordenadas` en toda ingesta; corrige invertidas; acepta coma decimal |
| 4 | Alta | Cuatro vocabularios de sector; 18 de 20 pacientes semilla contradecían su polígono | El sector sale siempre del polígono GeoRIS; «Sin sector GeoRIS» cuando cae fuera |
| 5 | Alta | «Más palabras gana» ignoraba la localidad (calles del Puerto o de Culebras iban al casco urbano) | La localidad manda; un centro poblado manda sobre su distrito |
| 6 | Media | La dispersión por hash inventaba precisión y cambiaba el sector según el número de casa | Sin dispersión; un solo punto con su radio de incertidumbre |
| 7 | Media | `precision_geo` se perdía en todo el recorrido | Se guarda, se muestra, viaja por API, FHIR y Excel |
| 8 | Media | No había forma de fijar la ubicación exacta | **Función nueva** (§3.4) |
| 9 | Media | Errores del diccionario (dirección de La Victoria a 1,6 km, Santo Domingo Ampliación en el casco urbano, puerta ≠ IPRESS del sector) | Topónimos sobre el trazo del catastro, direcciones de GeoRIS, puerta = IPRESS oficial del sector |
| 10 | Baja | Un paciente semilla en el mar y otros a 25–30 km de su localidad | Semilla corregida; migración solo de fichas sintéticas |
| 11 | Baja | Altas por webhook/FHIR sin geocodificar; FHIR con `geolocation` nula; la fusión local borraba coordenadas | El servidor geocodifica; FHIR sin extensión nula; fusión protegida |

### 3.3 Segunda auditoría, sobre lo ya corregido (12 hallazgos)
| # | Gravedad | Hallazgo | Corrección |
|---|---|---|---|
| 1 | Alta | La ubicación exacta se perdía si la misma casa se reimportaba escrita distinto (o si no había dirección antes) | Clave de dirección sin tipo de vía, Mza/Lote, orden ni referencias; completar una dirección vacía no es mudanza; dirección ilegible = punto «por verificar»; mudanza lejana guarda `geo_anterior` |
| 2 | Alta | Carreras del GPS (temporizador y watch sobrevivían al cambiar de opción) | `_detenerGps()` + contador de intento |
| 3 | Alta | XSS por id de paciente en los botones | Ids saneados al guardar; argumentos con escape JavaScript |
| 4 | Media-alta | Un GPS impreciso (±3000 m) quedaba como «Exacta» | Más de 50 m: hay que ajustar el marcador; el servidor lo rechaza |
| 5 | Media | Un coordinador limitado a un sector podía sacar pacientes de su alcance | 403 en la ruta PUT y en importaciones/FHIR/webhooks (`db.simularSector`) |
| 6 | Media | Carrera al guardar: Escape o abrir otra selección mientras se guardaba | Bloqueo mientras se guarda |
| 7 | Media | Cerrar sesión no detenía GPS ni medición; la respuesta tardía tocaba la pantalla | `limpiarSesion` los apaga; se ignora la respuesta si la sesión cambió |
| 8 | Media | La fusión del cliente pisaba la ubicación exacta | Se conserva si la dirección es la misma |
| 9 | Media-baja | El sector quedaba desactualizado al mudarse a una dirección sin ubicar | Sector derivado marcado y reiniciado |
| 10 | Media-baja | Sin abanico en modo canvas (>1500 pacientes) | Grupo con lista (y se corrigió un `return` que dejaba pacientes sin dibujar) |
| 11 | Baja | Enlaces de mapas: pin `!3d!4d`, `%2C` codificado, `geo:` | `interpretarTexto` los reconoce |
| 12 | Baja | Lotes del catastro sin nombre tapaban el clic de los sectores | Lotes y vías sin nombre no son interactivos |

*Hallazgos propios encontrados al probar:* marcador de selección tapado por el banner en el celular (banner compacto y punto centrado en la parte visible); animación de zoom que devolvía el mapa a otro punto (`_centrarSinAnimacion`); «Localidad de Quian, Culebras» se iba a 35 km (centro poblado antes que distrito).

### 3.4 Función nueva: ubicación exacta del domicilio
- **Dónde:** botón **«📍 Fijar ubicación exacta»** en la ficha del paciente, en su popup del mapa y en la lista (botón «Ubicar» si no tiene ubicación).
- **Tres formas:** (1) **GPS del celular** estando en la puerta (toma la mejor lectura unos segundos y muestra ±m); (2) **marcar en el mapa** arrastrando un marcador (con vista satélite Esri); (3) **escribir o pegar coordenadas** (decimales, coma decimal, grados `10°04'08"S`, enlaces de Google Maps o WhatsApp).
- **Siempre se confirma en el mapa**, viendo en vivo sector GeoRIS, zona, RIS y distancia al establecimiento.
- **Al guardar:** `PUT /api/patients/:id/ubicacion`; el servidor recalcula el sector con el polígono oficial y registra quién y cuándo; queda en auditoría (sin las coordenadas).
- **Señales en pantalla:** pin con ✓ = exacta; pin con borde punteado = aproximada; insignias «Exacta / Aproximada / Sin ubicación» en la lista; contador «N sin ubicación en el mapa»; al centrar un paciente se dibuja su radio de incertidumbre.

---

## 4. Capas GeoRIS: qué se verificó (detalle en `docs/METODOLOGIA_GEORIS.md` §5)
**Correcto en el dato del MINSA:** anillos cerrados; sin huecos ni superposiciones entre zonas ni entre RIS; cada sector dentro de su zona y cada zona dentro de su RIS (muestreo interior); conteos de zonas y sectores = lo declarado en las 7 RIS; población de la RIS = Σ zonas y de la zona = Σ sectores (Pacífico Sur); sectores 1 a 72 completos; la IPRESS de cada sector existe y es de su zona.

**Defectos del dato que la aplicación corrige al mostrar:**
1. **32 puestos vinculados** (Huaylas Sur 1, Conchucos Sur y Norte; ninguno de Huarmey) declaran un `id_zona` distinto de la zona donde están su punto y su puerta → se asignan por ubicación y el popup muestra el valor declarado.
2. **Sihuas repetido** con una RIS 177 inexistente → 13 hospitales (no 14).
3. **Las 44 cabeceras también figuran como puertas de entrada** (y 2 hospitales en otras capas) → cada establecimiento se dibuja una vez con su rol más alto.
4. **Cifras de la documentación** que no coincidían con el bundle → `METODOLOGIA_GEORIS.md` corregido; totales de Áncash calculados del bundle (1 078 374 hab., 316 831 familias, 44 zonas, 367 sectores).

**Limitación:** el bundle solo trae los **polígonos de los 72 sectores de Pacífico Sur**; de las otras 6 RIS hay conteos, no polígonos (el panel lo avisa).

**Verificado en el navegador:** las 7 RIS y las 44 zonas, una por una (polígonos, sectores, cabecera, puertas y vinculados; todo dentro de la zona elegida; sin duplicados).

---

## 5. Archivos nuevos
| Archivo | Para qué |
|---|---|
| `client/js/map/geoUbicacion.js` | Reglas únicas de coordenadas y precisión (navegador y servidor) |
| `tools/comparar_georis_oficial.js` · `COMPARAR_GEORIS_OFICIAL.bat` | Descarga/lee las capas oficiales, las compara y con `--actualizar` reemplaza el bundle (con respaldo) |
| `tools/descargar_georis_en_navegador.js` | Guion para pegar en la consola de la página del MINSA (descarga 7 capas + manifiesto) |
| `georis_oficial/LEEME.md` | Paso a paso: descargar, copiar, subir, comparar |
| `server/tests/testUbicacionExacta.js` (47) · `testComparadorGeoris.js` (6) | Pruebas dentro de `npm test` |
| `server/tests/helpers/mockArcgis.js` | Servidor ArcGIS simulado para las pruebas |
| `server/tests/browser/testNavegadorGeolocalizacion.js` (31) · `testDescargaGeorisNavegador.js` (3) | Pruebas en Chromium (Playwright; opcionales) |
| `docs/RESUMEN_AVANCES_GEOLOCALIZACION.md` | Este documento |

**Modificados con más peso:** `client/js/map/mapManager.js` (reescrito), `ancashGeocoder.js`, `georisAncashLayers.js`, `establecimientos.js`, `client/js/main.js`, `server/db/database.js`, `server/routes/apiRoutes.js`, `server/auth/scope.js`, `server/fhir/fhirAdapter.js`, `server/db/padron_inicial.js` (semilla), `client/index.html`, `client/sw.js`, `client/css/components.css`, `docs/HANDOFF.md`, `docs/METODOLOGIA_GEORIS.md`, `LEEME_INICIO_RAPIDO.md`, `README.md`.

**Endpoints y campos nuevos:** `PUT /api/patients/:id/ubicacion`; `ubicaciones {exacta, aproximada, sin_ubicacion}` en `/api/patients/geo` y `/api/alerts/summary`; extensión FHIR `…/precision-geolocalizacion`; campos `precision_geo`, `precision_m`, `geo_fuente`, `geo_toponimo`, `geo_fecha`, `geo_registrado_por`, `sector_por_ubicacion`, `ubicacion_por_verificar`, `geo_anterior`.

---

## 6. Pruebas y cómo correrlas
```bash
npm --prefix server install     # una vez
npm test                        # todas las suites del servidor y del cliente (incluye ubicación exacta y comparador)
node server/tests/browser/testNavegadorGeolocalizacion.js   # 31 pruebas en navegador real (requiere Playwright)
node server/tests/browser/testDescargaGeorisNavegador.js    # 3 pruebas del guion de descarga
node tools/medir_geocodificador.js && node tools/verificar_establecimientos.js
```
Resultado al 05/11/2026: todo en verde. Los mosaicos de mapa se simulan en las pruebas (el entorno de desarrollo no llega a internet), así que **no se vieron mosaicos reales**.

---

## 7. Pendiente y decisiones abiertas
1. **🔒 Contrastar con la fuente oficial del MINSA (G-07).** Cloudflare del MINSA rechaza las conexiones desde la nube. Opciones para el usuario:
   - **Sin instalar nada:** seguir `georis_oficial/LEEME.md` (abrir `https://geominsa.minsa.gob.pe/geominsaserver/rest/services`, pegar el guion en la consola con F12, mover los 8 archivos descargados a `georis_oficial/` y subirlos a la rama por la web de GitHub).
   - **Con Claude en su PC:** `claude --chrome` en la carpeta del proyecto (extensión Claude in Chrome ≥ 1.0.36, sesión iniciada con la cuenta y no con API key, plan Pro/Max/Team/Enterprise; no en WSL) y pegarle la instrucción que se le dio. La sesión en la nube **no** puede usar esa extensión.
   - Luego avisar «ya están subidas» y se hace: `git pull`, comparar, actualizar, probar, corregir la documentación.
   - **Sin verificar contra el servidor real:** nombres de capas y campos supuestos (si no coinciden, el guion lista lo que encontró y se ajusta).
2. **🔒 API de Google (a futuro).** OpenStreetMap es el defecto; las capas de Google siguen en el selector «sin API, pruebas». Al contratar la API: reemplazar sus URL en `baseLayers` de `mapManager.js` (la clave va en configuración, no en el repositorio). Con mucho uso, el servidor público de OSM pide uso moderado: conviene un proveedor con convenio.
3. **Avisos:** el GPS del navegador solo funciona por `https://` o en `localhost`; 6 de las 13 direcciones de GeoRIS de establecimientos no nombran su caserío (el punto del establecimiento sí es el oficial); un `store.json` real conserva sus coordenadas antiguas (solo se migran las fichas sintéticas): al cargar la trama real (T-18) conviene reevaluar con `precision_geo` y «sin ubicar».

---

## 8. Cómo retomar en cualquier momento
1. `git checkout claude/epic-hamilton-exotru && git pull`.
2. Leer **este documento** y el bloque «Estado al 05/11/2026» de `docs/HANDOFF.md` (hasta `FIN-COLA`).
3. Correr `npm --prefix server install` y `npm test` para confirmar que todo sigue en verde.
4. Si el usuario ya subió las capas del MINSA a `georis_oficial/` → ficha **G-07** del HANDOFF.
5. Si no → las demás tareas abiertas de la cola (A13, A14, A22; luego T-09, T-13, T-14, T-11 y, **al final**, la seguridad T-04, T-05, T-10, T-15 y la trama real T-18).
6. Reglas que siguen vigentes: no imprimir datos de pacientes (solo conteos); al cambiar archivos de `client/` subir la versión `?v=` en `index.html` y `sw.js`; no evadir bloqueos del MINSA.

---

## 9. Cronología de commits (rama `claude/epic-hamilton-exotru`)
| Commit | Contenido |
|---|---|
| `987431e` | Ubicación exacta y corrección de las capas del mapa (3 auditorías) |
| `c0c7bde` | Capas GeoRIS: verificación y corrección de zona y duplicados |
| `acab919` | Segunda auditoría adversarial: 12 hallazgos corregidos |
| `187c713` | Herramienta para comparar y actualizar con la fuente oficial |
| `3e01358` | Cierre: direcciones oficiales, centros poblados, alcance por sector, FHIR, Excel |
| `8adddd9` | Mapa base por defecto: OpenStreetMap (Google queda como opción) |
| `867eaf3` | Descarga de las capas oficiales desde el navegador del usuario |
| (siguiente) | HANDOFF y este resumen |
