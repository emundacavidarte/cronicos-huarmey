# Auditoría de geolocalización — 06/11/2026

Alcance: establecimientos, geocodificador de direcciones, ingesta (Excel, registro web, CSV, HOSIX/FHIR), API y mapa.
Solo se usaron datos inventados y la cartografía del repositorio. No se leyó ningún padrón real.

## 1. Establecimientos

| Verificación | Resultado |
|---|---|
| 12 de los 13 establecimientos de la Zona 6 contra GeoRIS (geometría y campos `este/norte`) | Idénticos (≤ 1,5 m). El bundle GeoRIS no tiene otros puntos alterados. |
| Nombre, categoría, distrito, provincia, RIS y zona contra GeoRIS | Sin diferencias. |
| **Nuevo Hospital 00001741** | El punto (-10.04780, -78.15480) **no viene de GeoRIS**: el bundle se editó a mano (geometría, nombre y dirección). GeoRIS/RENIPRESS siguen publicando el **local antiguo** (-10.06809, -78.15572, junto a la Panamericana). Distancia entre los dos: **2,26 km**. La prensa informa que el hospital se trasladó a una zona segura a unos **2,05 km** del local anterior y que se inauguró el 30/04/2026 ([Perú Construye](https://peruconstruye.net/2026/10/14/hospital-de-huarmey-moderna-infraestructura-atencion-de-salud-ancash/), [Altavoz](https://altavoz.pe/locales/inauguran-moderno-hospital-de-huarmey-con-inversion-de-s-227-millones-via-obras-por-impuestos/)). El punto queda **coherente, pero sin confirmar**: ninguna fuente oficial publica coordenadas y no se pudieron abrir las páginas de MINSA, Antamina ni El Peruano desde este entorno. En el catastro (OSM) el punto queda a 440 m al este de la Panamericana. |
| Polígono del «terreno oficial» del hospital | Fue dibujado a mano y mide unos **19 500 m²**, no los 11 325,98 m² oficiales. Ahora se rotula como «contorno referencial». |
| Rol GeoRIS | Siete establecimientos figuraban como «Puerta de Entrada», pero en GeoRIS son **vinculados**: Puerto Huarmey, Quián y Raypa a La Victoria; Molino a Culebras; Malvas, San Miguel y Cochapetí a Huamba. Se corrigió y se agregó `puerta_entrada_georis`. |
| Cochapetí como «enclave de Huaylas Sur» | GeoRIS lo pone en la RIS 156, Zona 6. El dato del enclave queda «por verificar». |
| Códigos de los hospitales de cabecera de las otras 6 RIS (`georisAncashLayers.js`) | Los seis eran inventados (por ejemplo, 00001650 en lugar de 00001652 para La Caleta). Se corrigieron con los de GeoRIS. |

## 2. Geocodificador de direcciones: hallazgos nuevos

| # | Hallazgo | Ejemplo (dirección inventada) | Error |
|---|---|---|---|
| G12 | Una calle que se llama como una ciudad se mandaba a esa ciudad | «Av Casma 230», «Jr Huaraz 145», «Jr Chimbote 12», «Pje Culebras 4» | 13 a 109 km |
| G13 | Si la dirección nombraba otra ciudad, igual quedaba en Huarmey | «Urb Buenos Aires, Chimbote», «Jr Belén 20, Casma» | 66 a 119 km |
| G14 | «Chimbote» se ubicaba en Nuevo Chimbote (RIS Pacífico Sur); el distrito de Chimbote es de la RIS Pacífico Norte (157) | «Chimbote» | red equivocada |
| G15 | El sector salía del punto con dispersión: en una misma calle cambiaba según el número de puerta | «Jr Grau 100» y «Jr Grau 102» | sector inestable |
| G16 | El servidor creaba `global.window` para cargar GeoRIS | — | riesgo para otros módulos |
| G17 | La puerta de entrada de las direcciones urbanas era el hospital; en GeoRIS los sectores 64 a 69 son de C.S. La Victoria | — | — |

**Hallazgos pendientes de G4, G5 y G11 (ya corregidos):** el servidor no geocodificaba; ponía «Sector 01 - Centro Urbano» por defecto. La carga CSV escribía «Zona X» como si fuera un establecimiento. El Excel geocodificaba la palabra «Huarmey» cuando no había dirección. Había sustitutos que ponían a todos en el hospital o en la plaza. La salida FHIR emitía coordenadas `null`.

## 3. Correcciones

- **Pin sobre la calle real:** 45 entradas del diccionario cubren las 49 vías con nombre del catastro (`huarmeyCallesIndex.js`, 22 KB). El índice se regenera con `tools/generar_indice_calles.js`.
- **Cuadra por número de puerta:** del 100 al 199 es la cuadra 1, y así sucesivamente. Cada cuadra mide unos 100 m. La numeración se cuenta desde el extremo de la calle más cercano a la Plaza de Armas. **Esto es un supuesto que hay que verificar en campo.**
- **Sector del padrón como contexto:** «Calle Grau» con sector «Puerto Huarmey» se ubica en Puerto Huarmey. Si la dirección no se reconoce, el paciente va al sector declarado con precisión «sector».
- **Precisión honesta:** cada paciente queda con un valor `precision_geo`: exacta, origen, cuadra, calle, sector, localidad o sin_ubicacion.
- **Servidor (G-03):** geocodifica al ingresar pacientes por cualquier vía y valida las coordenadas (rango de Áncash, lat/lng intercambiadas, valores no numéricos o 0,0). No reemplaza una ubicación exacta o del origen con una aproximación. Vuelve a geocodificar si cambia la dirección.
- **API y mapa (G-04):** `/api/patients/geo` y `/api/alerts/summary` incluyen `resumen_geo` con los conteos por precisión y de pacientes sin ubicar. El mapa muestra «N en el mapa · N aproximados · N sin ubicar», y los pines aproximados llevan borde discontinuo. «Distancia vial» pasa a llamarse «distancia en línea recta», y el tiempo se rotula como estimado.
- **Registro web:** debajo de la dirección aparece una vista previa de la ubicación y su precisión, con indicaciones («pida el número de puerta…»). El sector ya no tiene valor por defecto y es obligatorio.

## 4. Verificación

- `npm test`: 19 suites en verde. Son nuevas `testGeoServidor.js` (11 pruebas, incluida una contra el servidor real) y 11 pruebas de `testGeolocalizacion.js`.
- `tools/medir_geocodificador.js`: 12 de 12.
- En navegador (Chromium sin interfaz): la página carga sin errores y el geocodificador responde. **No se probó** a mano el formulario con sesión iniciada.

## 5. Límite que no se puede corregir con los datos actuales

El catastro del repositorio (OpenStreetMap) **no tiene números de puerta, manzanas ni lotes**. Por eso, con solo el texto de la dirección:
- «Jr. Bolognesi 330» → cuadra estimada (±50 m a lo largo de la calle);
- «Mz B Lt 4 AH La Victoria» → centro del asentamiento (precisión «sector»);
- una calle que no está en el catastro → sin ubicar, nunca un punto inventado.

## 6. Decisiones pendientes (G-06)

1. **Geocodificador externo** (tipo Google Maps o ArcGIS): se parece más a «buscar en Maps», pero envía direcciones a un tercero (Ley N.° 29733), exige clave de API e internet, y puede tener costo.
2. **Plano de manzanas y lotes** (COFOPRI o municipalidad): es la única vía para ubicar «Mz B Lt 4» en su lote.
3. **Tarjeta con mapa y marcador arrastrable** en el registro web para corregir en el momento, y lista «por revisar» después de cargar el Excel.
