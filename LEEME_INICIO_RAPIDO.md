# 🚀 GUÍA DE INICIO RÁPIDO — SISTEMA TERRITORIAL DE CRÓNICOS HUARMEY (v3.0 Auditado)
### Nuevo Hospital de Apoyo Huarmey (II-1) • Red Integrada de Salud Pacífico Sur (RIS N° 156)
**Desarrollado por:** MÁXIME Consultoría en Salud (División de Salud Digital y Puesta en Marcha de Hospitales)

---

## 1. Levantar el Servidor de Alta Concurrencia (Localhost / Red Local)

Ejecute en PowerShell o Terminal:

```powershell
cd "<carpeta del proyecto>\server"
npm install
node server.js
```
(En Windows también puede usar `INICIAR_PROTOTIPO.bat`.)

Luego abra su navegador en:
👉 **`http://localhost:3000`**

> **Trabajo sin conexión:** la aplicación guarda sus archivos en el navegador (trabajador de servicio) y abre aunque el servidor no responda, siempre que antes se haya abierto con conexión. Sin servidor no hay datos de pacientes: el padrón solo viaja por la API con sesión iniciada.

---

## 2. Novedades de la Interfaz UI/UX v3.0 y Padrón Estandarizado (v4)

1. **Apertura por Defecto en Calles y Sentidos Viales:**
   * El mapa inicia automáticamente en el modo **"Calles y Sentidos Viales"** sobre el **Nuevo Hospital de Apoyo Huarmey (II-1)**, mostrando el trazado vial, manzanas y los pacientes crónicos georreferenciados en el territorio.
   * **Modo de desarrollo seguro:** Incluye 20 pacientes sintéticos de demostración que cumplen rigurosamente con la Ley N° 29733 (Protección de Datos Personales).
2. **Vista Inicial Limpia con Indicadores KPI Flotantes (HUD) Dinámicos:**
   * En la barra flotante superior verá el buscador omnicanal y los contadores en tiempo real:
     * 👥 **Total:** pacientes activos de la red (no cuenta a los fallecidos).
     * 🟢 **Cita vigente:** su próxima cita de control es en más de 7 días. Mide la vigencia de la cita, no la presión.
     * 🟡 **Próximos:** su cita es en 7 días o menos.
     * 🔴 **Deserción:** su cita ya venció.
     * 🟣 **HOSIX:** brecha de captación hospitalaria pendiente de adscripción territorial.
     * El control de la presión (< 140/90 mmHg, HEARTS) se ve en el **Tablero** («Control clínico en meta») y en la ficha de cada paciente.
   * **Haga clic en cualquier indicador** para abrir la ventana lateral derecha filtrada por ese grupo. Con la ventana abierta, la barra de indicadores se corre al espacio libre del mapa: vuelva a hacer clic en el mismo indicador o en `Ocultar ❯` para cerrarla.
3. **Ingesta y Validación Dinámica con Cuadrícula Excel (76 Columnas):**
   * Botón **`📥 Importar Excel`**: Abre una cuadrícula interactiva (SheetJS) con 76 columnas normativas y 11 bloques clínicos.
   * Validación celda por celda en caliente (reglas de DNI, rangos de presión PAS/PAD, HbA1c, fechas y listas oficiales de Huarmey).
   * **Corrección in situ:** Edite celdas observadas directamente en pantalla antes de guardar.
   * **Combinación inteligente:** La ingesta fusiona registros nuevos con los existentes sin duplicar ni borrar el padrón previo.
   * **Consentimiento:** a un paciente nuevo se le exige la respuesta (Sí, firmado / No). Un paciente que ya estaba en el sistema sin respuesta registrada puede cargarse igual: se le preguntará una sola vez, al enviarle su primer recordatorio por WhatsApp. Por eso el Excel que exporta el sistema se puede volver a importar.
   * **CSV de HOSIX / Galenos** (`templates/Plantilla_Importacion_HOSIX_Galenos.csv`): se guarda en el servidor. Las filas sin número de documento o sin nombre no se cargan y el aviso indica cuáles.
4. **Exportación Completa a Excel:**
   * Botón **`📤 Exportar Excel`** disponible en el Padrón y en el Tablero Analítico para descargar el dataset consolidado en formato XLSX con sus métricas calculadas.
5. **Pestañas Laterales Directas (`Edge Handles`):**
   * En los bordes izquierdo y derecho de la pantalla encontrará las pestañas **`📑 Capas y Red`** y **`❤️ Padrón HEARTS`** para abrir o guardar las ventanas laterales con un solo clic.
6. **Controles del Mapa Aislados:**
   * Los botones **`🏠`**, **`+`** y **`−`** se ubican en la esquina inferior derecha bajo el rótulo `MAPA`.
7. **Ficha Clínica HEARTS MINSA / OPS (Datos 100% Individualizados):**
   * Al hacer clic en cualquier paciente o en el botón **`📋 Ficha`**, se despliega la ficha clínica estructurada en **5 pilares y 2 columnas**, con cada campo demográfico y metabólico en su propia celda independiente (`DNI`, `Historia Clínica`, `Edad Actual`, `Sexo Biológico`, `Fecha de Nacimiento`, `Seguro de Salud`, `Teléfono`, `Dirección`, `Sector Sanitario`, `IPRESS Adscrita`, `Presión Arterial`, `Glucosa Basal`, `HbA1c`, `Perfil Renal`, `Perfil Lipídico` y `Evolución trimestral de la presión 2026`).
8. **Pantallas de todo tamaño:** en celulares (desde 360 px) la cabecera deja el buscador a la vista, los 5 indicadores entran en una fila, los paneles ocupan todo el ancho y «Usuarios» y «Salir» están en la barra inferior. En tabletas y computadoras pequeñas «Salir» siempre queda visible en la cabecera.

---

## 3. Endpoints Principales (REST & HL7 FHIR R4)

* **Health Check & Estado de Memoria:** `GET http://localhost:3000/health`
* **CapabilityStatement HL7 FHIR R4:** `GET http://localhost:3000/fhir/metadata`
* **Catálogo LOINC v2.78:** `GET http://localhost:3000/fhir/loinc-catalog`
* **Padrón Completo (Gzip + ETag):** `GET http://localhost:3000/api/cronicos`
* **Recurso FHIR Patient:** `GET http://localhost:3000/fhir/Patient/10000001`
* **Expediente Individual FHIR Bundle:** `GET http://localhost:3000/fhir/Patient/10000001/bundle`
* **Ingesta Transaccional FHIR Bundle:** `POST http://localhost:3000/fhir/Bundle`
* **Webhooks HOSIX / Galenos / Pakamuros:** `POST http://localhost:3000/api/webhooks/hosix`
* **Auditoría de Seguridad (Fase 2 Readiness):** `GET http://localhost:3000/api/security/audit-logs`
