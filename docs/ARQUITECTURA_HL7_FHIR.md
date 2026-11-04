# ESPECIFICACIÓN TÉCNICA DE INTEROPERABILIDAD NATIVA HL7 FHIR (R4)
## Ecosistema de Salud Conectado: HOSIX, Galenos, Pakamuros Soft y el Motor Territorial de Crónicos
### Hospital de Apoyo Huarmey (II-1) — Red de Salud Pacífico Sur (RIS N° 156)

---

## 1. Introducción y Propósito

El aplicativo no almacena la información médica en esquemas relacionales propietarios o cerrados. En su lugar, el núcleo de persistencia e intercambio adopta las especificaciones de **HL7 FHIR Release 4 (Fast Healthcare Interoperability Resources)**.

Esta decisión garantiza que el aplicativo:
1. Sea **agnóstico al software hospitalario**: puede recibir datos de **HOSIX (SIVSA)**, de **Galenos (MINSA / SIS-Galenos)**, de **Pakamuros Soft (Hospital General de Jaén / MINSA)**, de **e-Qhali** o de cualquier software de historia clínica electrónica.
2. Pueda evolucionar desde la ingesta inicial por archivos (Excel/CSV en el MVP) hacia la **integración automática por API RESTful / Webhooks** en tiempo real.
3. Se alinee con el **Marco de Interoperabilidad del Estado Peruano** y el **RENHICE** (Registro Nacional de Historias Clínicas Electrónicas del MINSA).

---

## 2. Recursos FHIR R4 Implementados

```
                                    ESTRUCTURA DE RECURSOS FHIR R4
                                    
                                          ┌──────────────────┐
                                          │   Organization   │ (Hospital II-1 Huarmey /
                                          │  (E.S. Cabecera) │  Red Pacífico Sur)
                                          └────────┬─────────┘
                                                   │ managingOrganization
                                                   ▼
┌──────────────────┐  serviceProvider     ┌──────────────────┐  addresses
│     Location     │ ◄─────────────────── │     Patient      │ ────────────► ┌──────────────────┐
│(P.S./C.S. Puerta │                      │ (DNI, Nombres,   │               │    Condition     │
│  de Entrada RIS) │                      │  Teléfono, GPS)  │               │ (CIE-10 HTA/DM2) │
└──────────────────┘                      └────────┬─────────┘               └──────────────────┘
                                                   │
                                                   ├─────────────────────────┐
                                                   ▼                         ▼
                                          ┌──────────────────┐      ┌──────────────────┐
                                          │   Appointment    │      │   Observation    │
                                          │(Cita Programada/ │      │ (Presión Art. /  │
                                          │ Semáforo HEARTS) │      │  HbA1c / Glucosa)│
                                          └──────────────────┘      └──────────────────┘
```

### A. Recurso `Patient` (Paciente)
Modela los datos de filiación, contacto telefónico para WhatsApp y georreferenciación domiciliaria:
```json
{
  "resourceType": "Patient",
  "id": "pac-00001741-45892147",
  "identifier": [
    {
      "use": "official",
      "system": "http://minsa.gob.pe/reniec/dni",
      "value": "45892147"
    },
    {
      "use": "secondary",
      "system": "http://minsa.gob.pe/hosix/historia_clinica",
      "value": "HC-18942"
    }
  ],
  "active": true,
  "name": [
    {
      "use": "official",
      "family": "Ramírez Castillo",
      "given": ["Carlos", "Alberto"]
    }
  ],
  "telecom": [
    {
      "system": "phone",
      "value": "+51943123456",
      "use": "mobile"
    }
  ],
  "gender": "male",
  "birthDate": "1962-05-14",
  "address": [
    {
      "use": "home",
      "text": "A.H. Santo Domingo Mz. B Lote 12, Huarmey",
      "city": "Huarmey",
      "district": "Huarmey",
      "state": "Áncash",
      "country": "PER",
      "extension": [
        {
          "url": "http://hl7.org/fhir/StructureDefinition/geolocation",
          "extension": [
            { "url": "latitude", "valueDecimal": -10.0682 },
            { "url": "longitude", "valueDecimal": -78.1495 }
          ]
        },
        {
          "url": "http://minsa.gob.pe/fhir/StructureDefinition/sector-sanitario",
          "valueString": "Sector 03 - Santo Domingo"
        }
      ]
    }
  ],
  "managingOrganization": {
    "reference": "Organization/renipress-00001741",
    "display": "Hospital de Apoyo Huarmey"
  }
}
```

### B. Recurso `Condition` (Diagnóstico Crónico)
Soporta codificación dual en **CIE-10** y **SNOMED-CT**:
```json
{
  "resourceType": "Condition",
  "id": "cond-45892147-hta",
  "clinicalStatus": {
    "coding": [
      {
        "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
        "code": "active"
      }
    ]
  },
  "verificationStatus": {
    "coding": [
      {
        "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
        "code": "confirmed"
      }
    ]
  },
  "category": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/condition-category",
          "code": "chronic",
          "display": "Enfermedad Crónica"
        }
      ]
    }
  ],
  "code": {
    "coding": [
      {
        "system": "http://hl7.org/fhir/sid/icd-10",
        "code": "I10",
        "display": "Hipertensión Esencial (Primaria)"
      },
      {
        "system": "http://snomed.info/sct",
        "code": "38341003",
        "display": "Hypertensive disorder"
      }
    ]
  },
  "subject": {
    "reference": "Patient/pac-00001741-45892147"
  },
  "onsetDateTime": "2021-03-10"
}
```

### C. Recurso `Appointment` (Cita de Seguimiento HEARTS)
Controla la periodicidad (30 vs 90 días) y los estados del semáforo:
```json
{
  "resourceType": "Appointment",
  "id": "apt-45892147-2026-10",
  "status": "booked",
  "serviceCategory": [
    {
      "coding": [
        {
          "system": "http://minsa.gob.pe/fhir/estrategia-sanitaria",
          "code": "HEARTS",
          "display": "Estrategia HEARTS Crónicos"
        }
      ]
    }
  ],
  "start": "2026-10-25T09:00:00-05:00",
  "end": "2026-10-25T09:30:00-05:00",
  "comment": "Control mensual por hipertensión no controlada. Entrega de Enalapril 20mg.",
  "participant": [
    {
      "actor": {
        "reference": "Patient/pac-00001741-45892147",
        "display": "Ramírez Castillo, Carlos Alberto"
      },
      "status": "accepted"
    },
    {
      "actor": {
        "reference": "Location/renipress-00001741",
        "display": "Hospital de Apoyo Huarmey - Consultorio Medicina Interna"
      },
      "status": "accepted"
    }
  ]
}
```

### D. Recurso `Observation` (Parámetros Clínicos)
Control de presión arterial y hemoglobina glicosilada con códigos **LOINC**:
```json
{
  "resourceType": "Observation",
  "id": "obs-45892147-pa",
  "status": "final",
  "category": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/observation-category",
          "code": "vital-signs"
        }
      ]
    }
  ],
  "code": {
    "coding": [
      {
        "system": "http://loinc.org",
        "code": "85354-9",
        "display": "Blood pressure panel with all children optional"
      }
    ]
  },
  "subject": {
    "reference": "Patient/pac-00001741-45892147"
  },
  "effectiveDateTime": "2026-09-25T10:15:00-05:00",
  "component": [
    {
      "code": {
        "coding": [{ "system": "http://loinc.org", "code": "8480-6", "display": "Systolic blood pressure" }]
      },
      "valueQuantity": { "value": 145, "unit": "mmHg" }
    },
    {
      "code": {
        "coding": [{ "system": "http://loinc.org", "code": "8462-4", "display": "Diastolic blood pressure" }]
      },
      "valueQuantity": { "value": 92, "unit": "mmHg" }
    }
  ]
}
```

---

## 3. Matriz de Mapeo: HOSIX vs. Galenos vs. Pakamuros Soft vs. HL7 FHIR

| Campo Clínico / Operativo | HOSIX (SIVSA) | Galenos (MINSA) | Pakamuros Soft (HCE MINSA) | Mapeo HL7 FHIR R4 |
| :--- | :--- | :--- | :--- | :--- |
| **Documento Identidad** | `NRO_DOCUMENTO` / `DNI` | `DocIdentidad` / `NumeroDocumento` | `dni_paciente` / `numero_documento` | `Patient.identifier[system='dni'].value` |
| **Historia Clínica** | `HISTORIA_CLINICA` / `NUM_HC` | `NroHistoriaClinica` | `hc_numero` / `nro_historia` | `Patient.identifier[system='hc'].value` |
| **Apellidos y Nombres** | `PACIENTE` / `APELLIDOS_NOMBRES` | `ApellidoPaterno`, `ApellidoMaterno`, `Nombres` | `paciente_apellidos_nombres` | `Patient.name.text` / `family`, `given` |
| **Teléfono Celular** | `TELEFONO` / `CELULAR` | `Telefono` / `Movil` | `telefono_celular` | `Patient.telecom[system='phone'].value` |
| **Dirección Domiciliaria** | `DIRECCION` / `REF_DIRECCION` | `Direccion` / `Domicilio` | `direccion_actual` | `Patient.address.text` |
| **Distrito / Localidad** | `DISTRITO` / `LOCALIDAD` | `Distrito` / `Ubigeo` | `distrito` | `Patient.address.district` |
| **Diagnóstico Principal** | `CIE10_COD` / `DIAGNOSTICO` | `CodigoCIE10` / `DescDiagnostico` | `diagnostico_cie10` / `cie10` | `Condition.code.coding[system='icd-10'].code` |
| **Fecha de Atención** | `FEC_ULTIMA_ATENCION` | `FechaAtencion` | `fecha_atencion` | `Observation.effectiveDateTime` |
| **Fecha Próxima Cita** | `FEC_PROXIMA_CITA` | `FechaProximaCita` | `fecha_control_cita` | `Appointment.start` |
| **Presión Arterial** | `PA_SISTOLICA` / `PA_DIASTOLICA` | `PresionSistolica` / `PresionDiastolica` | `pa_sistolica` / `presion_arterial` | `Observation.component[code='8480-6' / '8462-4']` |
| **Glucemia / HbA1c** | `HBA1C` | `HbA1c` | `hba1c` / `hemoglobina_glicosilada` | `Observation.valueQuantity` (code: 4548-4) |
| **Establecimiento Origen**| `ESTABLECIMIENTO` / `COD_IPRESS`| `CodRenaes` / `IdEstablecimiento`| `codigo_ipress` / `adscripcion` | `managingOrganization.identifier` |

---

## 4. Endpoints de la API RESTful FHIR

El servidor expone los siguientes endpoints para interoperabilidad:

### Ingesta de Datos (Automática desde HOSIX, Galenos o Pakamuros):
* `POST /fhir/Bundle`  
  * Recibe un lote completo de transacciones (pacientes, diagnósticos, citas del día).
* `POST /fhir/Patient`  
  * Da de alta o actualiza un paciente con su dirección y teléfono.
* `POST /fhir/Appointment`  
  * Registra una nueva cita o el incumplimiento (`status: noshow`) disparado por el sistema hospitalario.

### Webhooks de Integración Rápida:
* `POST /api/webhooks/hosix`  
  * Recibe el payload en formato JSON de HOSIX; el **HosixConnector** lo transforma internamente a FHIR.
* `POST /api/webhooks/galenos`  
  * Recibe el payload en formato de Galenos; el **GalenosConnector** lo traduce a FHIR de forma automática.
* `POST /api/webhooks/pakamuros`  
  * Recibe el payload en formato de Pakamuros Soft; el **PakamurosConnector** lo traduce a FHIR de forma automática.

### Consultas de Inteligencia Territorial (Para el Mapa y la App Móvil):
* `GET /api/patients/geo`  
  * Retorna los pacientes en formato GeoJSON FeatureCollection con sus metadatos clínicos y semáforo HEARTS.
* `GET /api/alerts/summary`  
  * Devuelve el consolidado de pacientes con alerta roja (deserción >30 o >90 días), amarilla (próximo control a 7 días) y verde.
* `POST /api/appointments/pre-cita`  
  * Dispara la orden de pre-reserva de cita hacia HOSIX/Galenos/Pakamuros para que el personal de admisión le asigne cupo.
