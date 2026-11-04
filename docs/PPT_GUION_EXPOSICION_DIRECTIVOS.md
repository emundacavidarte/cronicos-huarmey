# GUION EJECUTIVO Y ESTRUCTURA DE LA PRESENTACIÓN (PPT) PARA EL DIRECTORIO DE MÁXIME
## MÁXIME Consultoría en Salud: Puesta en Marcha de Hospitales
### Producto: Manejo de Pacientes Crónicos e Integración con el Primer Nivel de Atención (HL7 FHIR & GeoRIS)
**Archivo PowerPoint generado:** [`Presentacion_Directorio_MAXIME_Seguimiento_Cronicos.pptx`](file:///c:/Users/PC-EDWARD/OneDrive/MAXIME/Cronicos_Huarmey/Prototipo_Aplicación/Presentacion_Directorio_MAXIME_Seguimiento_Cronicos.pptx)

---

```
                                    ┌────────────────────────────────────────────────────────┐
                                    │      MÁXIME CONSULTORÍA: PUESTA EN MARCHA              │
                                    │   Producto: Pacientes Crónicos e Integración con Red   │
                                    └───────────────────────────┬────────────────────────────┘
                                                                │
                 ┌──────────────────────────────────────────────┴─────────────────────────────────────────────┐
                 │                                                                                            │
                 ▼                                                                                            ▼
   ┌───────────────────────────┐                                                                ┌───────────────────────────┐
   │    BLOQUE 1: ECOSISTEMA   │                                                                │     BLOQUE 2: SISTEMA     │
   │  Slides 1 al 5            │                                                                │   Slides 6 al 10          │
   │  • Puesta en Marcha       │                                                                │   • GeoRIS Oficial Áncash │
   │  • Padrón y Consulta Ext. │                                                                │   • Inspector de Medición │
   │  • Integración HCE / FHIR │                                                                │   • Las 7 Ventajas        │
   │  • HEARTS y 3 Salidas     │                                                                │   • Fases y Negocio MAXIME│
   └───────────────────────────┘                                                                └───────────────────────────┘
```

---

## ESTRUCTURA DEL DECK DE 10 DIAPOSITIVAS (WIDESCREEN 16:9)

### SLIDE 01: PORTADA EJECUTIVA
* **Tag:** MÁXIME CONSULTORÍA • PUESTA EN MARCHA DE HOSPITALES
* **Título:** Producto: Manejo de Pacientes Crónicos e Integración con el Primer Nivel de Atención
* **Subtítulo:** Herramienta Tecnológica de Puesta en Marcha para Articular Cualquier HCE (HOSIX / Galenos) con la Red Territorial (HL7 FHIR & GeoRIS)
* **Caso Piloto Pionero:** Nuevo Hospital de Apoyo Huarmey (II-1) — Red Pacífico Sur (RIS N° 156) — Sistema HOSIX (SIVSA)
* **Objetivo de Puesta en Marcha:** Evitar el colapso temprano de la consulta externa del nuevo hospital ($11,325\text{ m}^2$) articulándolo con las 12 IPRESS del primer nivel (C.S. La Victoria, P.S. Puerto Huarmey, Culebras), permitiendo que los pacientes crónicos estables continúen su tratamiento en su posta o vía teleconsulta, y el hospital opere a plena capacidad resolutiva de segundo nivel.
* **Notas del Orador:**
  > *"Estimados directivos de MAXIME: El core de nuestra consultora es la puesta en marcha de hospitales ('del ladrillo al servicio'). Hoy les presentamos nuestro producto tecnológico estratégico para garantizar esa puesta en marcha: el Sistema de Manejo de Pacientes Crónicos e Integración con el Primer Nivel de Atención. Diseñado bajo el estándar internacional HL7 FHIR y GeoRIS oficial, este producto resuelve el riesgo número uno de cualquier hospital nuevo: el colapso temprano de su consulta externa por pacientes crónicos rutinarios."*

---

### SLIDE 02: EL RETO OPERACIONAL EN LA PUESTA EN MARCHA
* **Categoría:** Puesta en Marcha Hospitalaria
* **Título:** El Reto Operacional: Gestión del Padrón Nominal y Descongestión de Consulta Externa
* **Contenido en 3 Tarjetas:**
  1. **El Problema Operacional (Saturación de Consulta Externa):**  
     En un hospital nuevo (como Huarmey II-1), los pacientes crónicos llegan a saturar gran parte de la consulta externa. Son pacientes crónicos **ESTABLES** que acuden únicamente por renovación de receta o tratamiento habitual. Esto consume horas de médicos internistas y especialistas que deberían dedicarse a patologías de mayor complejidad, mientras que la deserción silenciosa supera el 70% porque el paciente se cansa de hacer filas para un trámite repetitivo.
  2. **La Estrategia de MAXIME (Integrarse al Ecosistema Existente):**  
     **No ser un aplicativo más adicional** que aumente la carga burocrática del personal de salud. Interoperar de forma transparente con la Historia Clínica Electrónica del hospital (HOSIX en Huarmey, Galenos en otros). Gestionar el **PADRÓN NOMINAL TERRITORIAL** vinculando datos clínicos con el mapa real donde vive el paciente y complementar el trabajo clínico hospitalario articulando el hospital con el primer nivel.
  3. **El Resultado Asistencial (Atención Diferenciada y Eficiente):**  
     Descongestión real de los consultorios del hospital II-1 (>30% de citas liberadas). Canalización de crónicos estables hacia su posta cercana o mediante **TELECONSULTA / TELEMONITOREO**. Los médicos especialistas del hospital se reservan para pacientes descompensados o con daño de órgano blanco.
* **Notas del Orador:**
  > *"Directores: Miren el término exacto: los pacientes crónicos pueden llegar a saturar una parte sustancial de la consulta externa. En la puesta en marcha, el gran error de gestión es permitir que el hospital se llene de pacientes estables que solo van por tratamiento habitual. Por eso MAXIME plantea esta estrategia: no venimos a vender 'otra app más' para que los médicos abran dos pantallas, sino a integrarnos al ecosistema del hospital (HOSIX) para gestionar el padrón nominal, derivar crónicos estables a teleconsulta o a su posta, y reservar los consultorios del nuevo hospital para la verdadera capacidad resolutiva de segundo nivel."*

---

### SLIDE 03: ARQUITECTURA DE INTEGRACIÓN: HCE ⟷ APLICATIVO CRÓNICOS
* **Categoría:** Integración y Flujos
* **Título:** Arquitectura de Integración: HCE ⟷ Aplicativo Crónicos (HL7 FHIR)
* **Recreación del Esquema Manuscrito:**
  * **1. HCE Hospitalaria:** HOSIX (Huarmey), Galenos (MINSA), Pakamuros Soft o Carga Asistida CSV/Excel (Modo MVP Día 1). El hospital mantiene su software clínico de cabecera; MAXIME no altera la base de datos de HOSIX.
  * **2. Intercambio Técnico:**
    * **API REST (PULL):** Extracción segura y programada de atenciones.
    * **Webhooks (PUSH):** Disparo automático en tiempo real al guardar atención en HOSIX.
  * **3. Flujo de Retorno (Auto Pre-citas):**  
    El aplicativo genera solicitudes automáticas de cupo hacia la ventanilla de Admisión de HOSIX, eliminando las colas a las 4 AM.
  * **4. Aplicativo Crónicos (Cerebro MAXIME):** Normalización bajo **HL7 FHIR Release 4** (`Patient`, `Condition`, `Appointment`, `Observation`, `Location`, `Organization`).
* **Notas del Orador:**
  > *"Esta lámina reproduce con fidelidad técnica el diagrama manuscrito: arriba el HCE hospitalario (HOSIX en Huarmey, Galenos o Pakamuros). Al centro, la comunicación bidireccional mediante API REST y Webhooks bajo el estándar internacional HL7 FHIR. Y la flecha curva de retorno: las Auto Pre-citas que viajan desde el Aplicativo de Crónicos hacia la bandeja de Admisión de HOSIX. Y abajo, el Aplicativo Crónicos de MAXIME que procesa el padrón nominal con sus recursos FHIR. Integración pura, cero islas."*

---

### SLIDE 04: EL CEREBRO CLÍNICO HEARTS Y SEMÁFORO TERRITORIAL
* **Categoría:** Protocolo Clínico (OPS/MINSA)
* **Título:** El Cerebro Clínico: Vía HEARTS y Semáforo de Riesgo Territorial
* **Estratificación Clínica HEARTS:**
  * **Ventana de 30 Días (Pacientes NO CONTROLADOS):** Presión $\ge 140/90\text{ mmHg}$ o $\text{HbA1c} > 7\%$. Requieren ajuste farmacológico y evaluación mensual estricta en el hospital.
  * **Ventana de 90 Días (Pacientes CONTROLADOS):** Presión en meta terapéutica. Retiran medicación trimestral y son candidatos directos a teleconsulta o posta médica.
* **Semáforo Territorial Dinámico:**
  * 🟢 **Verde (Control Vigente en Meta):** Tratamiento estable a 90 días. Recojo en posta o telemonitoreo.
  * 🟡 **Amarillo (Próximo a Vencer - 7 días):** Dispara automáticamente la pre-cita en HOSIX y el recordatorio institucional por WhatsApp.
  * 🔴 **Rojo (Inasistente / Deserción Crítica):** Cita vencida con cifras descompensadas. Pulso de alerta activo en el mapa y derivación a búsqueda activa domiciliaria.
* **Notas del Orador:**
  > *"El aplicativo tiene un cerebro clínico basado en la norma HEARTS de la OPS y el MINSA. Diferencia con rigor médico: el no controlado viene cada 30 días para titulación de dosis; el controlado viene cada 90 días y recoge medicación trimestral. El semáforo territorial clasifica en tiempo real: verde (en meta), amarillo (vence en 7 días) y rojo (inasistente con riesgo cardiovascular). El sistema sabe exactamente a quién priorizar."*

---

### SLIDE 05: LOS 3 CANALES DE ACCIÓN SANITARIA (LAS 3 FLECHAS DEL DIAGRAMA)
* **Categoría:** Acción Territorial y Cierre de Ciclo
* **Título:** Los Tres Canales de Acción Sanitaria (Las 3 Salidas del Diagrama)
* **Las 3 Salidas del Esquema Manuscrito:**
  1. **💊 MEDICAMENTOS (Acercamiento al Primer Nivel):**  
     Algoritmo de Geo-Adscripción y Contrarreferencia Territorial. Detecta al paciente controlado y calcula su distancia a la posta más cercana (P.S. Puerto Huarmey, Culebras, C.S. La Victoria). Sugiere la contrarreferencia para recojo de medicación habitual en su posta o mediante teleconsulta, descongestionando >30% de la consulta externa del Hospital II-1.
  2. **📱 MENSAJES WHATSAPP (Contacto Directo al Paciente):**  
     Notificación institucional automatizada y personalizada con datos de HOSIX.  
     *Mensaje Oficial Integrado:*  
     *«Estimado(a) Sr(a). [Nombre], le recordamos que su control mensual de hipertensión en el Hospital de Huarmey corresponde para el día [Fecha]. Evite complicaciones y confirme su asistencia.»*  
     Confirmación de cita con un solo clic desde el celular (reduce el ausentismo en >40%).
  3. **🚨 ALERTAS PARA CITAS (Búsqueda Activa Domiciliaria):**  
     Filtro inteligente de pacientes en Alerta Roja (desertores crónicos no controlados). Planificador de Brigadas con hojas de ruta geográficas por sector (Santo Domingo, Miramar, La Victoria) para rescate temprano en domicilio antes de que sufran un ACV o infarto.
* **Notas del Orador:**
  > *"Esta lámina explica exactamente las tres flechas que dibujamos en el esquema manuscrito: Flecha 1 (Medicamentos): Acercar los fármacos a las postas del primer nivel para que los pacientes estables no abarroten el hospital. Flecha 2 (Mensajes WhatsApp): Notificación directa al celular del paciente con el texto institucional personalizado para confirmar cita. Flecha 3 (Alertas para Citas): Búsqueda activa de campo con hojas de ruta para que las brigadas rescaten en su casa a los pacientes en rojo."*

---

### SLIDE 06: LA BASE TERRITORIAL OFICIAL: GEORIS ÁNCASH PRECARGADO
* **Categoría:** Delimitación Territorial Oficial
* **Título:** La Base Territorial Oficial: GeoRIS Áncash Precargado (D.S. 019-2024-SA)
* **El Esquema Territorial del Apunte:**
  * **[6 Redes de Salud]:** RIS Pacífico Sur (N° 156), Pacífico Norte, Huaylas Sur, Huaylas Norte, Conchucos Sur y Conchucos Norte (partición continua del 100% de Áncash sin vacíos territoriales).
  * **[20 Provincias]:** Huarmey, Casma, Santa, Huaraz, Recuay, Bolognesi, etc. (166 distritos delimitados con centros poblados IGN/INEI).
  * **[620 IPRESS]:** Clasificadas con roles GeoRIS: Puertas de Entrada (I-1/I-2), Cabeceras de Zona (I-3/I-4) y Hospitales de Área (II-1/II-2). Red tributaria de Huarmey: 12 IPRESS.
  * **Emplazamiento Real del Nuevo Hospital Huarmey:** AA.HH. Miramar / Santo Domingo Ampliación (detrás del Hotel La Siesta) con su polígono oficial de $11,325.98\text{ m}^2$ y catastro urbano de 6,384 lotes.
* **Notas del Orador:**
  > *"Esta lámina refleja el esquema de Áncash que incluimos en las notas del prototipo: las 6 Redes de Salud (encabezadas por RIS Pacífico Sur N° 156), las 20 provincias, los 166 distritos y las 620 IPRESS. Y en Huarmey, el hospital está en su lugar real: detrás del Hotel La Siesta con sus 11,325 m2 de complejo hospitalario y el catastro urbano de 6,384 inmuebles. Todo precargado de forma local (Local First)."*

---

### SLIDE 07: INSPECTOR DE MEDICIÓN Y FLUJO DE REFERENCIA GEORIS
* **Categoría:** Validación Legal D.S. 019-2024-SA
* **Título:** Inspector de Medición y Flujo de Referencia Territorial GeoRIS
* **Capacidades en Vivo:**
  * Al hacer clic en "Trazar Referencia y Medir": Dibuja la ruta activa animada desde cualquier posta periférica (ej. Puerto Huarmey o Culebras) hasta el Nuevo Hospital de Apoyo Huarmey (II-1).
  * Despliega la **Tarjeta Flotante del Inspector GeoRIS** con distancia real en km y tiempo estimado de traslado en ambulancia.
  * **Verificación de Techos Resolutivos de Ley (D.S. 019-2024-SA):**
    * *Acceso a Cabecera de Zona:* $\le 2\text{ horas}$ (✅ Cumple en toda la red).
    * *Acceso a Hospital de Área II-1:* $\le 4\text{ horas}$ (✅ Cumple en toda la provincia de Huarmey).
  * Conteo y filtrado instantáneo de la carga de pacientes crónicos HEARTS adscritos a dicha posta.
* **Notas del Orador:**
  > *"Esta lámina muestra una de las herramientas más potentes para convencer a directores y evaluadores: el Inspector de Referencias. Seleccionamos cualquier posta (P.S. Puerto Huarmey o Culebras) y damos clic en 'Trazar Referencia y Medir'. El mapa traza la ruta en vivo, abre la tarjeta flotante y certifica el cumplimiento del techo legal de 4 horas del D.S. 019-2024-SA. Y muestra la carga de pacientes crónicos para filtrarlos con un toque."*

---

### SLIDE 08: LAS SIETE VENTAJAS TÉCNICAS Y FUNCIONALES DE MAXIME
* **Categoría:** Valor Diferencial del Producto
* **Título:** Las Siete Ventajas Técnicas y Funcionales de la Plataforma MAXIME
* **Las 7 Ventajas Clave Integradas desde las Notas:**
  1. **Fidelidad y Exactitud Cartográfica GeoRIS Precargada:** Delimitación oficial continua de todo Áncash y catastro urbano de Huarmey precargados localmente (Local First), garantizando operatividad ante caídas de internet.
  2. **Alto Rendimiento y Concurrencia Multiusuario:** Procesamiento en segundo plano mediante Web Workers y arquitectura cliente-servidor optimizada para soportar múltiples digitadores y consultorios en simultáneo.
  3. **Interoperabilidad Nativa HL7 FHIR (R4):** Arquitectura 100% agnóstica para conectarse con HOSIX (SIVSA), Galenos (MINSA), Pakamuros Soft o planillas Excel de contingencia.
  4. **Inteligencia Clínica según Norma HEARTS:** Estratificación médica automatizada de metas de presión arterial y glucosa, con ventanas dinámicas de 30 días (no controlado) vs 90 días (controlado).
  5. **Telemonitoreo y Notificaciones por WhatsApp:** Canal directo al paciente sin intermediarios ni costos de mensajería SMS, con confirmación de pre-citas en un solo clic.
  6. **Diseño 100% Responsivo y PWA Listo para Android:** Interfaz adaptable a pantallas de escritorio, tablets y smartphones Android para brigadas de salud en campo.
  7. **Documentación Continua de Handoff y Réplica:** Repositorio versionado con memoria técnica completa, esquemas de bases de datos y guías de despliegue para escalamiento institucional rápido.
* **Notas del Orador:**
  > *"Directores: estas son las 7 ventajas que redactamos en las notas del prototipo y que sustentan la superioridad técnica de MAXIME. Fidelidad GeoRIS oficial, alto rendimiento multiusuario, interoperabilidad HL7 FHIR, vía clínica HEARTS, WhatsApp integrado, diseño PWA para Android y documentación de Handoff para asegurar la réplica. Es un producto maduro, robusto y verificable."*

---

### SLIDE 09: PLAN DE IMPLEMENTACIÓN EN FASES ACUMULATIVAS (ROADMAP)
* **Categoría:** Despliegue Progresivo y Seguro
* **Título:** Plan de Implementación en Fases Acumulativas (Roadmap Operativo)
* **Las 4 Fases Claras y Desagregadas:**
  * **FASE 1: MVP INMEDIATO (Semanas 1 - 2 | 100% Hecho):**  
    Servidor local Express activo, GeoRIS Áncash precargado, catastro de 6,384 lotes en Huarmey, semáforo HEARTS, WhatsApp y PWA Android. Ingesta asistida CSV de contingencia para operar en el Día 1.
  * **FASE 2: CONEXIÓN HOSIX (Semanas 3 - 5 | En Curso):**  
    Despliegue en intranet del Hospital II-1 Huarmey, conexión API REST / Webhooks con HOSIX, automatización de pre-citas en ventanilla de Admisión, capacitación y pilotaje con médicos internistas.
  * **FASE 3: RED PROVINCIAL (Semanas 6 - 8 | Articulación):**  
    Interconexión con las 12 postas de la provincia de Huarmey, protocolo de contrarreferencia para entrega de fármacos en postas, teleconsulta/telemonitoreo y hojas de ruta para brigadas comunitarias.
  * **FASE 4: EXPANSIÓN RIS (Semanas 9+ | Escalamiento):**  
    Replicación a la RIS Pacífico Norte (Chimbote) y redes de Huaylas y Conchucos, integración con Galenos y Pakamuros Soft en otros hospitales, empaquetado comercial SaaS e integración con HIS-MINSA.
* **Notas del Orador:**
  > *"Aquí desagregamos con total claridad el plan de implementación en 4 fases acumulativas: Fase 1 (MVP Inmediato ya construido y listo en local); Fase 2 (Conexión directa con HOSIX en el hospital de Huarmey para automatizar pre-citas); Fase 3 (Articulación de las 12 postas para contrarreferencia de medicación); y Fase 4 (Escalamiento comercial y regional a las otras redes de Áncash). Cada fase tiene entregables claros y medibles."*

---

### SLIDE 10: MODELO DE NEGOCIO Y VALOR ESTRATÉGICO PARA MAXIME CONSULTORÍA
* **Categoría:** Propuesta de Valor para MAXIME
* **Título:** Modelo de Negocio y Valor Estratégico para MAXIME Consultoría
* **Los 3 Pilares Estratégicos:**
  1. **DIFERENCIADOR EN LICITACIONES DE PUESTA EN MARCHA:**  
     Ninguna otra firma de puesta en marcha en el Perú cuenta con un software operativo propio de articulación territorial. Nos posiciona como favoritos técnicos en licitaciones de PRONIS, Gobiernos Regionales y Mineras (Antamina por Obras por Impuestos). Pasamos de entregar informes documentales en PDF a entregar sistemas vivos en marcha.
  2. **NUEVAS LÍNEAS DE INGRESO DE ALTO VALOR:**  
     Paquete integral de Puesta en Marcha (Procesos + Software de Articulación). Servicios de interoperabilidad e integración con HCEs (HOSIX, Galenos, etc.). Suscripción recurrente (SaaS) por soporte de geocodificación territorial, GeoRIS y servidores.
  3. **IMPACTO SANITARIO REAL Y LIDERAZGO VBHC:**  
     Descongestiona la consulta externa hospitalaria y reduce >40% el ausentismo a citas. Previene activamente infartos, derrames cerebrales y hemodiálisis en pacientes crónicos. Consolida a MAXIME como la firma líder en salud basada en valor (Value-Based Healthcare) en el Perú.
* **Notas del Orador:**
  > *"Señores directivos: esta es la conclusión de negocio para MAXIME. Con este producto damos un salto estratégico decisivo: dejamos de ser una consultora que solo entrega informes en papel para convertirnos en la firma que lidera la puesta en marcha hospitalaria con tecnología propia, estándares mundiales HL7 FHIR y resultados clínicos tangibles. Tenemos el producto listo, verificado y corriendo en vivo para la demostración práctica."*
