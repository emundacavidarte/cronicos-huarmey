# 🏥 Sistema Territorial de Monitoreo de Pacientes Crónicos — Hospital II-1 Huarmey
### Red Integrada de Salud Pacífico Sur (RIS N° 156) • Iniciativa HEARTS MINSA / OPS

Prototipo operativo y motor de interoperabilidad HL7 FHIR (R4) para la gestión territorial y seguimiento longitudinal de pacientes con enfermedades no transmisibles (Hipertensión Arterial y Diabetes Mellitus Tipo 2) en el ámbito del **Nuevo Hospital de Apoyo Huarmey (II-1)** y sus establecimientos de la Red Pacífico Sur.

---

## 🚀 Inicio Rápido

### Prerrequisitos
* **Node.js** >= 18.0.0
* **npm**

### Instalación y Ejecución Local
```bash
# Instalar dependencias
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
2. **Build Command:** `npm install`
3. **Start Command:** `npm start`
4. **Variables de Entorno recomendadas:**
   * `NODE_ENV=production`
   * `AUTH_SECRET`: cadena aleatoria de al menos 32 caracteres (obligatorio en producción).
   * `ADMIN_USER=admin`
   * `ADMIN_PASSWORD`: contraseña segura para el administrador inicial.
   * `TRUST_PROXY=true`

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
