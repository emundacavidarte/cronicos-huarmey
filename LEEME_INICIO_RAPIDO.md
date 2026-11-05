# 🚀 GUÍA DE INICIO RÁPIDO — SISTEMA TERRITORIAL DE CRÓNICOS HUARMEY (v3.0 Auditado)
### Nuevo Hospital de Apoyo Huarmey (II-1) • Red Integrada de Salud Pacífico Sur (RIS N° 156)
**Desarrollado por:** MÁXIME Consultoría en Salud (División de Salud Digital y Puesta en Marcha de Hospitales)

---

## 1. Levantar el Servidor de Alta Concurrencia (Localhost / Red Local)

Ejecute en PowerShell o Terminal:

```powershell
cd "C:\Users\PC-EDWARD\OneDrive\MAXIME\Cronicos_Huarmey\Prototipo_Aplicación\server"
node server.js
```

Luego abra su navegador en:
👉 **`http://localhost:3000`**

> **Modo Offline / PWA:** La aplicación cuenta con Service Worker para trabajo en campo y visitas domiciliarias tras haber iniciado sesión previamente con credenciales autorizadas.

---

## 2. Novedades de la Interfaz UI/UX v3.0 y Padrón Estandarizado (v4)

1. **Apertura por Defecto en OpenStreetMap:**
   * El mapa inicia automáticamente con **OpenStreetMap** (licencia abierta) sobre el **Nuevo Hospital de Apoyo Huarmey (II-1)**, mostrando el trazado vial, manzanas y los pacientes crónicos georreferenciados en el territorio.
   * **Modo de desarrollo seguro:** Incluye 10 pacientes sintéticos de demostración que cumplen rigurosamente con la Ley N° 29733 (Protección de Datos Personales).
2. **Vista Inicial Limpia con Indicadores KPI Flotantes (HUD) Dinámicos:**
   * En la barra flotante superior verá el buscador omnicanal y los contadores en tiempo real:
     * 👥 **Total:** Total de pacientes adscritos en la red.
     * 🟢 **En Meta:** Pacientes con presión arterial controlada (< 140/90 mmHg) según Iniciativa HEARTS.
     * 🟡 **Próximos:** Pacientes con cita programada o seguimiento cercano.
     * 🔴 **Deserción:** Pacientes sin control reciente o con valores descompensados.
     * 🟣 **HOSIX:** Brecha de captación hospitalaria pendiente de adscripción territorial.
   * **Haga clic en cualquier número KPI** para abrir instantáneamente la ventana lateral derecha filtrada por ese grupo. Vuelva a hacer clic en el mismo número o en `Ocultar ❯` para despejar el mapa.
3. **Ingesta y Validación Dinámica con Cuadrícula Excel (76 Columnas):**
   * Botón **`📥 Importar Excel`**: Abre una cuadrícula interactiva (SheetJS) con 76 columnas normativas y 11 bloques clínicos.
   * Validación celda por celda en caliente (reglas de DNI, rangos de presión PAS/PAD, HbA1c, fechas y listas oficiales de Huarmey).
   * **Corrección in situ:** Edite celdas observadas directamente en pantalla antes de guardar.
   * **Combinación inteligente:** La ingesta fusiona registros nuevos con los existentes sin duplicar ni borrar el padrón previo.
4. **Exportación Completa a Excel:**
   * Botón **`📤 Exportar Excel`** disponible en el Padrón y en el Tablero Analítico para descargar el dataset consolidado en formato XLSX con sus métricas calculadas.
5. **Pestañas Laterales Directas (`Edge Handles`):**
   * En los bordes izquierdo y derecho de la pantalla encontrará las pestañas **`📑 Capas y Red`** y **`❤️ Padrón HEARTS`** para abrir o guardar las ventanas laterales con un solo clic.
6. **Controles del Mapa Aislados:**
   * Los botones **`🏠`**, **`+`** y **`−`** se ubican en la esquina inferior derecha bajo el rótulo `MAPA`.
7. **Ficha Clínica HEARTS MINSA / OPS (Datos 100% Individualizados):**
   * Al hacer clic en cualquier paciente o en el botón **`📋 Ficha`**, se despliega la ficha clínica estructurada en **5 pilares y 2 columnas**, con cada campo demográfico y metabólico en su propia celda independiente (`DNI`, `Historia Clínica`, `Edad Actual`, `Sexo Biológico`, `Fecha de Nacimiento`, `Seguro de Salud`, `Teléfono`, `Dirección`, `Sector Sanitario`, `IPRESS Adscrita`, `Presión Arterial`, `Glucosa Basal`, `HbA1c`, `Perfil Renal`, `Perfil Lipídico` y `Cronograma Anual 2026`).

8. **Ubicación exacta del domicilio del paciente (GPS, mapa o coordenadas):**
   * En la ficha del paciente, en su popup del mapa o en la lista (botón **`Ubicar`** si no tiene ubicación) pulse **`📍 Fijar ubicación exacta`** y elija:
     * **GPS de este celular:** solo estando en la puerta de la vivienda. El sistema toma la lectura más precisa durante unos segundos y muestra su precisión (± metros). *El GPS del navegador solo funciona si el sistema se abre por `https://` o en `localhost`.*
     * **Marcar en el mapa:** arrastre el marcador rojo (o toque el mapa) sobre la vivienda; el botón **`🛰️ Satélite`** muestra los techos.
     * **Escribir o pegar coordenadas:** acepta `-10.06895, -78.15210`, coma decimal, grados (`10°04'08"S 78°09'07"W`) y enlaces de Google Maps o de la ubicación compartida por WhatsApp.
   * Siempre se confirma en el mapa viendo en vivo el **sector GeoRIS**, la zona y la distancia al establecimiento. Al guardar, el servidor recalcula el sector sanitario con el polígono oficial y registra quién y cuándo la fijó.
   * **Pin con borde continuo y ✓** = ubicación exacta. **Pin con borde punteado** = aproximada por dirección (a nivel de calle, barrio o localidad: el catastro no tiene numeración de casas). Al centrar un paciente se dibuja su radio de incertidumbre.
   * Una ubicación exacta **no se pierde** al reimportar el padrón ni al registrar una atención con la misma dirección; si el paciente se muda (otra dirección), vale la nueva.
9. **Actualizar las capas GeoRIS con la fuente oficial del MINSA:** la forma más simple es desde su navegador: siga `georis_oficial/LEEME.md` (abre la página del MINSA, pega en la consola `tools/descargar_georis_en_navegador.js`, copia los archivos descargados a `georis_oficial/` y los sube a GitHub). O bien, en la PC de la oficina ejecute `COMPARAR_GEORIS_OFICIAL.bat` (compara y deja el informe en `docs/COMPARACION_GEORIS_OFICIAL.md`) o `COMPARAR_GEORIS_OFICIAL.bat --actualizar` (además reemplaza en el mapa las capas que difieran, con copia de respaldo del bundle anterior). Después ejecute `npm test`.
10. **Herramienta de medición:** botón **`📏`** en los controles del mapa (clic en 2 o más puntos; vuelva a pulsarlo para terminar).

---

## 3. Endpoints Principales (REST & HL7 FHIR R4)

* **Health Check & Estado de Memoria:** `GET http://localhost:3000/health`
* **CapabilityStatement HL7 FHIR R4:** `GET http://localhost:3000/fhir/metadata`
* **Catálogo LOINC v2.78:** `GET http://localhost:3000/fhir/loinc-catalog`
* **Padrón Completo (Gzip + ETag):** `GET http://localhost:3000/api/cronicos`
* **Fijar ubicación exacta del domicilio:** `PUT http://localhost:3000/api/patients/:id/ubicacion`
* **Expediente Individual FHIR Bundle:** `GET http://localhost:3000/fhir/Patient/10000001/bundle`
* **Ingesta Transaccional FHIR Bundle:** `POST http://localhost:3000/fhir/Bundle`
* **Webhooks HOSIX / Galenos / Pakamuros:** `POST http://localhost:3000/api/webhooks/hosix`
* **Auditoría de Seguridad (Fase 2 Readiness):** `GET http://localhost:3000/api/security/audit-logs`
