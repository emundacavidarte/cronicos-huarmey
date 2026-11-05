# 🏥 Sistema Territorial de Monitoreo de Pacientes Crónicos — Hospital II-1 Huarmey
### Red Integrada de Salud Pacífico Sur (RIS N° 156) • Iniciativa HEARTS MINSA / OPS

Prototipo operativo y motor de interoperabilidad HL7 FHIR (R4) para la gestión territorial y seguimiento longitudinal de pacientes con enfermedades no transmisibles (Hipertensión Arterial y Diabetes Mellitus Tipo 2) en el ámbito del **Nuevo Hospital de Apoyo Huarmey (II-1)** y sus establecimientos de la Red Pacífico Sur.

---

## 🚀 Inicio Rápido

### Prerrequisitos
* **Node.js** 22 (probado con 22.23; ver `.node-version`)
* **npm**

### Instalación y Ejecución Local
```bash
# Instalar dependencias (instala las del servidor con su package-lock.json)
npm install

# Iniciar servidor
npm start
```
Abra su navegador en: **`http://localhost:3000`**

Credenciales por defecto en desarrollo:
* **Usuario:** `admin`
* En desarrollo sin `.env`, la clave inicial autogenerada se muestra en la consola al iniciar el servidor por primera vez, o puede fijar `ADMIN_PASSWORD` en su `.env`.

---

## 🔒 Privacidad y Datos Sintéticos (Ley N° 29733)
Este repositorio contiene **únicamente 20 pacientes sintéticos/simulados** para demostración clínica, pruebas de concurrencia y validación de interoperabilidad territorial. Ningún dato personal real ni padrón nominal oficial se encuentra almacenado ni versionado en este repositorio.

---

## ☁️ Despliegue en la Nube (PaaS / Render / Railway)

1. Conecte este repositorio a su proveedor de nube (Render, Railway, Fly.io, etc.).
2. **Build Command:** `npm run build` (o `npm install`: el `postinstall` instala las dependencias del servidor con `npm ci`)
3. **Start Command:** `npm start`
4. **Variables de Entorno recomendadas:**
   * `NODE_ENV=production`
   * `AUTH_SECRET`: cadena aleatoria de al menos 32 caracteres (obligatorio en producción).
   * `ADMIN_USER=admin`
   * `ADMIN_PASSWORD`: contraseña segura para el administrador inicial.
   * `TRUST_PROXY=true` (solo si el puerto no es accesible directamente; detrás del proxy del alojamiento)
   * `DATA_DIR`: carpeta del disco persistente (allí quedan `store.json`, `store.json.bak` y `respaldos/` con una copia diaria; se conservan las últimas `RESPALDOS_DIARIOS`, 14 por defecto).
   * `STORE_KEY` (opcional): 32 bytes aleatorios (`openssl rand -hex 32`) para cifrar los datos en reposo con AES-256-GCM. **Quien la active debe guardarla fuera del servidor: sin ella el padrón cifrado no se puede leer.**
   * `CORS_ORIGINS` (opcional): orígenes autorizados, separados por coma. Vacío = ninguno (la interfaz usa el mismo origen).
   * `ADMIN_EMAIL` (opcional): correo del administrador inicial.
   * `MAIL_PROVIDER` (`resend` o `brevo`), `MAIL_API_KEY` y `MAIL_FROM`: envío del código para recuperar la contraseña. Sin ellos, «¿Olvidó su contraseña?» responde que no está disponible y el ADMIN restablece la clave.
   * Ver `.env.example`: el servidor no arranca en producción con valores de ejemplo.

---

## 📡 Endpoints de Interoperabilidad HL7 FHIR (R4)
* **CapabilityStatement FHIR:** `GET /fhir/metadata`
* **Catálogo LOINC v2.78:** `GET /fhir/loinc-catalog`
* **Padrón Territorial:** `GET /api/cronicos`
* **Ingesta Transaccional FHIR Bundle:** `POST /fhir/Bundle`
* **Health Check:** `GET /health`

---

## 📄 Licencia
MIT License — Hospital de Apoyo Huarmey & MÁXIME Consultoría en Salud.
