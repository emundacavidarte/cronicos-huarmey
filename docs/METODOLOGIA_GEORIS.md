# METODOLOGÍA DE GEORREFERENCIACIÓN TERRITORIAL GEORIS MINSA
## Aplicación en el Hospital de Apoyo Huarmey (II-1) y la Red de Salud Pacífico Sur (RIS N° 156)
### Marco Legal: D.S. 019-2024-SA y Ley Nº 30885 de Conformación y Funcionamiento de las RIS

---

## 1. Marco Normativo y Fuentes Oficiales

El **Decreto Supremo N° 019-2024-SA**, que aprueba el Reglamento de la **Ley N° 30885**, establece las bases para organizar la prestación de salud del Perú en **Redes Integradas de Salud (RIS)**.

Para garantizar fidelidad absoluta e idéntica a la plataforma GeoRIS MINSA, este aplicativo ingesta directamente las capas vectoriales oficiales publicadas en la Infraestructura de Datos Espaciales del MINSA (`geominsa.minsa.gob.pe` / `RIS_PERU_FINAL_gdb`):

| Capa GeoRIS MINSA | ID Capa ArcGIS Server | Geometría | Entidades en Áncash | Descripción Oficial |
| :--- | :---: | :---: | :---: | :--- |
| **LÍMITE DE RIS (RIS_TOTAL)** | FeatureServer/11 | Polígono (WGS84) | **7 RIS** | Polígonos de límites de las 7 Redes Integradas de Salud de Áncash (11,276 vértices en Pacífico Sur). |
| **ZONAS SANITARIAS (ZONAS_TOTAL)** | FeatureServer/13 | Polígono (WGS84) | **44 Zonas** | Delimitación oficial de las 44 Microrredes/Zonas Sanitarias de Áncash. |
| **SECTORES SANITARIOS (SECTOR_TOTAL)** | FeatureServer/12 | Polígono (WGS84) | **72 Sectores** | Malla territorial comunal de RIS Pacífico Sur con densidad y población. |
| **E.S. ÁREA SANITARIA (P_AREA_TOTAL)** | FeatureServer/2 | Punto | **13 IPRESS** (14 registros; Sihuas repetido) | Hospitales de Referencia (II-1 y II-2): Huarmey, Casma, EGB, Huaraz, etc. |
| **E.S. ZONA SANITARIA (P_REF_TOTAL)** | FeatureServer/4 | Punto | **44 IPRESS** | Cabeceras de Zona Sanitaria (I-3 y I-4): C.S. La Victoria en Huarmey, Buenavista, etc. |
| **E.S. PUERTAS DE ENTRADA (P_ENT_TOTAL)** | FeatureServer/3 | Punto | **225 IPRESS** | Postas y Centros de Salud de primer contacto (I-1, I-2, I-3). |
| **E.S. VINCULADOS (P_VIN_TOTAL)** | FeatureServer/5 | Punto | **184 IPRESS** | Puestos de salud anexos y satélites. En 32 registros (RIS Huaylas Sur 1, Conchucos Sur y Conchucos Norte; ninguno de Huarmey) el `id_zona` declarado no es el de la zona donde están su punto y su puerta de entrada: la aplicación los asigna por ubicación y muestra el valor declarado. |
| **RENIPRESS ÁNCASH COMPLETO** | FeatureServer/6 | Punto | — | Catálogo de todos los establecimientos de Áncash. **No está incluido en el bundle de este prototipo.** |

```
                               JERARQUÍA DEL MODELO GEORIS (MINSA)
                               
   ┌────────────────────────────────────────────────────────────────────────┐
   │ 1. ÁREA SANITARIA (Nivel 2 de Complejidad / Techo Resolutivo)          │
   │    • Ámbito: RIS Pacífico Sur (N° RIS: 156)                            │
   │    • Población asignada: 292,742 habitantes (88,990 familias)          │
   │    • E.S. Referencial Huarmey: Hospital de Apoyo Huarmey (II-1)        │
   │    • Otros Hospitales: Hospital Casma (II-1), E. Guzmán Barrón (II-2) │
   └───────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │ 2. ZONA SANITARIA (Nivel Intermedio / Microrredes de Salud)            │
   │    • Zonas: 6 en Pacífico Sur (Huarmey, Casma, San Jacinto,            │
   │      Yugoslavia/Nvo. Chimbote, Pariacoto y Quillo).                    │
   │    • Cabecera Zona Huarmey: C.S. La Victoria (I-3, 32,196 habitantes)  │
   └───────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │ 3. SECTOR SANITARIO Y PUERTA DE ENTRADA (Primer Nivel de Atención)     │
   │    • Sectores: 72 sectores comunales censales en Pacífico Sur          │
   │    • Puertas de Entrada Huarmey: C.S. La Victoria (I-3), P.S. Culebras │
   │      (I-2), P.S. Huamba (I-1), P.S. Huayán (I-2), P.S. Huanchay HZ.    │
   │    • Vinculados: P.S. Puerto Huarmey, Quián y Raypa (a La Victoria),   │
   │      P.S. Molino (a Culebras), P.S. Malvas, San Miguel y Cochapetí     │
   │      (a Huamba; Cochapetí es enclave de la Red Huaylas Sur).           │
   │    • Función: Adscripción de familias, tamizaje, entrega de medicación │
   │      mensual/trimestral HEARTS, seguimiento comunitario en domicilio.  │
   └────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Las 7 Redes Integradas de Salud (RIS) de Áncash

El departamento de Áncash se encuentra zonificado en **7 Redes Integradas de Salud** oficiales:

| Código RIS | Nombre Oficial RIS | Población Total | Familias | Viviendas | N° Zonas | N° Sectores | Hospitales de Área (GeoRIS) |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **156** | **RIS PACIFICO SUR** | **292,742** | **88,990** | **92,271** | **6** | **72** | **Hospital de Apoyo Huarmey (II-1)**, Hospital de Apoyo Casma, Eleazar Guzmán Barrón |
| **157** | **RIS PACIFICO NORTE** | 269,794 | 72,851 | 70,013 | 7 | 65 | Hospital La Caleta |
| **101** | **RIS HUAYLAS SUR 1** | 214,098 | 62,353 | 75,520 | 5 | 58 | Hospital de Apoyo Carhuaz, Hospital "Víctor Ramos Guardia" - Huaraz |
| **104** | **RIS HUAYLAS SUR 2** | 45,632 | 15,044 | 21,581 | 3 | 20 | Hospital de Apoyo Recuay, Hospital de Barranca |
| **69** | **RIS HUAYLAS NORTE** | 102,378 | 30,415 | 41,697 | 6 | 57 | Hospital de Apoyo Caraz, Hospital de Apoyo Yungay |
| **111** | **RIS CONCHUCOS NORTE** | 68,200 | 20,940 | 27,369 | 7 | 47 | Hospital de Apoyo de Pomabamba "Antonio Caldas Domínguez", Hospital de Apoyo Sihuas |
| **87** | **RIS CONCHUCOS SUR** | 85,530 | 26,238 | 33,261 | 10 | 48 | Hospital de Apoyo Huari |
| **TOTAL** | **DEPARTAMENTO ÁNCASH** | **1,078,374** | **316,831** | **361,712** | **44** | **367** | **13 hospitales de referencia** (el bundle trae 14 registros: Sihuas está repetido con una RIS 177 inexistente) |

> Cifras tomadas tal cual de las propiedades de las capas `RIS_TOTAL` y `ZONAS_TOTAL` del bundle (`client/data/georis/georisDataBundle.js`); la suma de las zonas coincide con cada RIS. **Polígonos de sectores:** el bundle trae solo los 72 de la RIS Pacífico Sur; de las otras 6 RIS hay conteos pero no polígonos.

---

## 3. Red Territorial de Huarmey Articulada al Hospital II-1

La provincia de Huarmey conforma la **Zona Sanitaria Huarmey (Zona N° 6 de RIS Pacífico Sur)**. Todas sus puertas de entrada tienen como techo resolutivo de referencia al **Hospital de Apoyo Huarmey (II-1)**:

| IPRESS | Categoría | Rol GeoRIS (bundle oficial) | Distancia en línea recta al Hosp. II-1 | Tiempo estimado de traslado* | Estándar GeoRIS (< 4h al Hospital) |
| :--- | :---: | :--- | :---: | :---: | :---: |
| **Nuevo Hospital de Apoyo Huarmey** | **II-1** | **Hospital de Referencia (Área Sanitaria)** | **0.0 km** | **0 min** | ✅ Sede |
| **C.S. La Victoria** | I-3 | Cabecera de Zona Sanitaria y Puerta de Entrada (sectores 64-69) | 1.0 km | ~2 min | ✅ Cumple |
| **P.S. Culebras** | I-2 | Puerta de Entrada (sector 62) | 13.1 km | ~24 min | ✅ Cumple |
| **P.S. Huamba** | I-1 | Puerta de Entrada (sectores 70, 71) | 33.9 km | ~1h 1m | ✅ Cumple |
| **P.S. Huanchay HZ** | I-2 | Puerta de Entrada (sector 63) | 51.3 km | ~1h 32m | ✅ Cumple |
| **P.S. Huayán** | I-2 | Puerta de Entrada (sector 72) | 52.6 km | ~1h 35m | ✅ Cumple |
| **P.S. Puerto Huarmey** | I-2 | Vinculado a C.S. La Victoria | 5.7 km | ~10 min | ✅ Cumple |
| **P.S. Molino** | I-1 | Vinculado a P.S. Culebras | 19.0 km | ~34 min | ✅ Cumple |
| **P.S. Quián** | I-2 | Vinculado a C.S. La Victoria | 37.9 km | ~1h 8m | ✅ Cumple |
| **P.S. Raypa** | I-1 | Vinculado a C.S. La Victoria | 45.0 km | ~1h 21m | ✅ Cumple |
| **P.S. San Miguel** | I-1 | Vinculado a P.S. Huamba | 46.1 km | ~1h 23m | ✅ Cumple |
| **P.S. Malvas** | I-1 | Vinculado a P.S. Huamba | 56.1 km | ~1h 41m | ✅ Cumple |
| **P.S. Cochapetí** | I-1 | Vinculado a P.S. Huamba (enclave, Red Huaylas Sur) | 56.2 km | ~1h 41m | ✅ Cumple |

\* Estimación: distancia en línea recta × 1,35 (curvas) a 45 km/h. No es la distancia vial real.

---

## 4. Estándares de Accesibilidad e Isócronas GeoRIS

De acuerdo al marco metodológico del MINSA para la delimitación de RIS:
1. **Acceso a E.S. de Zona Sanitaria (Cabecera):**
   - El tiempo de traslado desde cualquier establecimiento puerta de entrada hacia su cabecera de zona no debe exceder **2 horas**.
2. **Acceso a E.S. de Área Sanitaria (Hospital II-1):**
   - El tiempo de traslado desde cualquier punto de la zona hacia el hospital de referencia provincial no debe exceder **4 horas**.
3. **Flujo de Pacientes Crónicos HEARTS:**
   - Pacientes con HTA / DM2 controlados: Atención periódica (cada 90 días) en su **Puerta de Entrada** más cercana (entrega de medicamentos y control de PA/glicemia).
   - Pacientes con HTA / DM2 no controlados o con daño a órgano blanco: **Referencia activa inmediata** al Hospital de Apoyo Huarmey (II-1) para evaluación por Medicina Interna, ajuste terapéutico y electrocardiograma/laboratorio.

---

## 5. Verificación de las capas GeoRIS del prototipo (05/11/2026)

Medición automática sobre el bundle del repositorio y sobre el mapa dibujado en el navegador (sin acceso al servidor `geominsa.minsa.gob.pe` desde el entorno de verificación; no se comparó contra la fuente en línea):

| Comprobación | Resultado |
| :--- | :--- |
| Anillos de polígonos cerrados (7 RIS, 44 zonas, 72 sectores) | ✅ 0 abiertos |
| Huecos y superposiciones entre zonas de cada RIS (malla de ~39 000 puntos) | ✅ 0 % y 0 % |
| Superposición entre RIS | ✅ 0 puntos |
| Zona dentro de su RIS / sector dentro de su zona (muestreo interior) | ✅ 100 % |
| Superposición entre sectores de Pacífico Sur | ✅ 0 puntos |
| N.º de zonas y sectores declarados por RIS = conteo real | ✅ 7 de 7 |
| Población de la RIS = Σ zonas; población de la zona = Σ sectores (Pacífico Sur) | ✅ exacto |
| Sectores 1 a 72 sin repetir ni faltar; IPRESS de cada sector existe y es de su zona | ✅ |
| Puertas de Pacífico Sur: su punto cae en uno de sus sectores asignados (`sec_asig`) | ✅ |
| Establecimientos dentro de su zona declarada | ⚠️ 435 de 467; los 32 restantes son vinculados con `id_zona` errado en la fuente (se corrigen por ubicación) |
| Cabeceras que también figuran como puertas de entrada | 44 de 44: se dibujan una sola vez (como cabecera, o como hospital si lo son) |
| Mapa dibujado: 7 RIS y 44 zonas, una por una (polígonos, sectores, cabecera, puertas y vinculados, todos dentro de la zona elegida, sin duplicados) | ✅ 0 problemas |

