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
| **E.S. ÁREA SANITARIA (P_AREA_TOTAL)** | FeatureServer/2 | Punto | **14 IPRESS** | Hospitales de Referencia (II-1 y II-2): Huarmey, Casma, EGB, Huaraz, etc. |
| **E.S. ZONA SANITARIA (P_REF_TOTAL)** | FeatureServer/4 | Punto | **44 IPRESS** | Cabeceras de Zona Sanitaria (I-3 y I-4): C.S. La Victoria en Huarmey, Buenavista, etc. |
| **E.S. PUERTAS DE ENTRADA (P_ENT_TOTAL)** | FeatureServer/3 | Punto | **225 IPRESS** | Postas y Centros de Salud de primer contacto (I-1, I-2, I-3). |
| **E.S. VINCULADOS (P_VIN_TOTAL)** | FeatureServer/5 | Punto | **184 IPRESS** | Puestos de salud anexos y satélites. |
| **RENIPRESS ÁNCASH COMPLETO** | FeatureServer/6 | Punto | **435 IPRESS** | Catálogo oficial de todos los establecimientos de salud de Áncash. |

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
   │    • E.S. Puerta de Entrada Huarmey: P.S. Puerto Huarmey (I-2),        │
   │      P.S. Culebras (I-2), P.S. Molino (I-1), P.S. Quián (I-2),         │
   │      P.S. Huamba (I-1), P.S. Huayán (I-2), P.S. Malvas (I-1),          │
   │      P.S. San Miguel (I-1), P.S. Raypa (I-1), P.S. Huanchay HZ (I-2).  │
   │    • Enclave territorial: P.S. Cochapeti (I-1, Red Huaylas Sur).       │
   │    • Función: Adscripción de familias, tamizaje, entrega de medicación │
   │      mensual/trimestral HEARTS, seguimiento comunitario en domicilio.  │
   └────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Las 7 Redes Integradas de Salud (RIS) de Áncash

El departamento de Áncash se encuentra zonificado en **7 Redes Integradas de Salud** oficiales:

| Código RIS | Nombre Oficial RIS | Población Total | Familias | Viviendas | N° Zonas | N° Sectores | Hospitales de Cabecera |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **156** | **RIS PACIFICO SUR** | **292,742** | **88,990** | **92,271** | **6** | **72** | **Hospital de Apoyo Huarmey (II-1)**, Casma (II-1), Eleazar Guzmán Barrón (II-2) |
| **157** | **RIS PACIFICO NORTE** | 269,794 | 81,450 | 85,120 | 7 | 50 | Hospital La Caleta (II-2, Chimbote) |
| **101** | **RIS HUAYLAS SUR 1** | 214,098 | 64,800 | 71,200 | 5 | 133 | Hospital "Víctor Ramos Guardia" (II-2, Huaraz), Hospital Carhuaz (II-1) |
| **104** | **RIS HUAYLAS SUR 2** | 45,632 | 14,200 | 16,800 | 3 | 25 | Hospital de Apoyo Recuay (II-1), Hospital Barranca (II-2) |
| **69** | **RIS HUAYLAS NORTE** | 102,378 | 30,415 | 41,697 | 6 | 57 | Hospital de Apoyo Caraz (II-1), Hospital de Apoyo Yungay (II-1) |
| **111** | **RIS CONCHUCOS NORTE** | 68,200 | 21,300 | 26,400 | 7 | 52 | Hospital de Apoyo Sihuas (II-1), Hospital de Pomabamba (II-1) |
| **87** | **RIS CONCHUCOS SUR** | 85,530 | 26,800 | 32,100 | 10 | 70 | Hospital de Apoyo Huari (II-1) |
| **TOTAL** | **DEPARTAMENTO ÁNCASH** | **1,078,380** | **327,955** | **365,588** | **44** | **459** | **14 Hospitales de Referencia II-1 y II-2** |

---

## 3. Red Territorial de Huarmey Articulada al Hospital II-1

La provincia de Huarmey conforma la **Zona Sanitaria Huarmey (Zona N° 6 de RIS Pacífico Sur)**. Todas sus puertas de entrada tienen como techo resolutivo de referencia al **Hospital de Apoyo Huarmey (II-1)**:

| IPRESS | Categoría | Rol GeoRIS | Distancia Geodésica al Hosp. II-1 | Tiempo Estimado de Traslado | Estándar GeoRIS (< 4h al Hospital) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Hospital de Apoyo Huarmey** | **II-1** | **Techo Resolutivo Provincial** | **0.0 km** | **0 min** | ✅ Sede Central |
| **C.S. La Victoria** | I-3 | Cabecera de Zona Sanitaria | 1.5 km | ~5 min | ✅ Cumple |
| **P.S. Puerto Huarmey** | I-2 | Puerta de Entrada | 3.4 km | ~10 min | ✅ Cumple |
| **P.S. Culebras** | I-2 | Puerta de Entrada | 15.3 km | ~27 min | ✅ Cumple |
| **P.S. Molino** | I-1 | Puerta de Entrada | 21.2 km | ~38 min | ✅ Cumple |
| **P.S. Quián** | I-2 | Puerta de Entrada | 39.5 km | ~71 min (1h 11m) | ✅ Cumple |
| **P.S. Raypa** | I-1 | Puerta de Entrada (Huanchay/Huaraz) | 45.0 km | ~81 min (1h 21m) | ✅ Cumple |
| **P.S. Huanchay HZ** | I-2 | Puerta de Entrada (Huanchay/Huaraz) | 51.3 km | ~92 min (1h 32m) | ✅ Cumple |
| **P.S. Huamba** | I-1 | Puerta de Entrada | 34.6 km | ~62 min | ✅ Cumple |
| **P.S. Huayán** | I-2 | Puerta de Entrada | 53.7 km | ~96 min (1h 36m) | ✅ Cumple |
| **P.S. Malvas** | I-1 | Puerta de Entrada | 57.1 km | ~102 min (1h 42m) | ✅ Cumple |
| **P.S. San Miguel** | I-1 | Puerta de Entrada | 46.8 km | ~84 min (1h 24m) | ✅ Cumple |
| **P.S. Cochapeti** | I-1 | Enclave Territorial (Red Huaylas Sur) | 56.4 km | ~101 min (1h 41m) | ✅ Cumple |

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
