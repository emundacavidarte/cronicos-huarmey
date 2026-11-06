/**
 * fhirAdapter.js
 * Normalizador, Validador y Serializador Bidireccional del Estándar Internacional HL7 FHIR Release 4
 * Alineado a RENHICE MINSA Perú (Ley N° 30024 / D.S. 009-2026-SA), Iniciativa HEARTS (OPS/OMS) y GeoRIS MINSA.
 * Soporta escalabilidad multivariable de signos vitales, antropometría, perfil renal, lipídico, citas y farmacoterapia.
 */

const crypto = require('crypto');
const fechaLima = require('../../client/js/utils/fechaLima');
const { getLatestObservation } = require('../utils/latestRecord');

const LOINC_CATALOG = {
  BP_PANEL: { code: '85354-9', display: 'Blood pressure panel with all children optional', unit: 'mm[Hg]' },
  PAS: { code: '8480-6', display: 'Systolic blood pressure', unit: 'mm[Hg]', field: 'pa_sistolica', category: 'vital-signs' },
  PAD: { code: '8462-4', display: 'Diastolic blood pressure', unit: 'mm[Hg]', field: 'pa_diastolica', category: 'vital-signs' },
  GLUCOSA: { code: '1558-6', display: 'Fasting glucose [Mass/volume] in Serum or Plasma', unit: 'mg/dL', field: 'glucosa', category: 'laboratory' },
  HBA1C: { code: '4548-4', display: 'Hemoglobin A1c/Hemoglobin.total in Blood', unit: '%', field: 'hba1c', category: 'laboratory' },
  PESO: { code: '29463-7', display: 'Body weight', unit: 'kg', field: 'peso', category: 'vital-signs' },
  TALLA: { code: '8302-2', display: 'Body height', unit: 'm', field: 'talla', category: 'vital-signs' },
  IMC: { code: '39156-5', display: 'Body mass index (BMI) [Ratio]', unit: 'kg/m2', field: 'imc', category: 'vital-signs' },
  PAB: { code: '8280-0', display: 'Waist Circumference at umbilicus by Tape measure', unit: 'cm', field: 'pab', category: 'vital-signs' },
  NUTRICION: { code: '75275-8', display: 'Nutritional status', unit: '', field: 'diagnostico_nutricional', category: 'exam' },
  RIESGO_CV: { code: '75631-2', display: 'Cardiovascular risk assessment', unit: '', field: 'riesgo_cv', category: 'survey' },
  MICROALBUMINA: { code: '14957-5', display: 'Microalbumin [Mass/volume] in Urine', unit: 'mg/L', field: 'microalbumina', category: 'laboratory' },
  CREATININA: { code: '2160-0', display: 'Creatinine [Mass/volume] in Serum or Plasma', unit: 'mg/dL', field: 'creatinina', category: 'laboratory' },
  DEP_CREATININA: { code: '2164-2', display: 'Creatinine renal clearance', unit: 'mL/min', field: 'depuracion_creatinina', category: 'laboratory' },
  COLESTEROL_TOTAL: { code: '2093-3', display: 'Cholesterol [Mass/volume] in Serum or Plasma', unit: 'mg/dL', field: 'colesterol_total', category: 'laboratory' },
  TRIGLICERIDOS: { code: '2571-8', display: 'Triglyceride [Mass/volume] in Serum or Plasma', unit: 'mg/dL', field: 'trigliceridos', category: 'laboratory' },
  COLESTEROL_HDL: { code: '2085-9', display: 'Cholesterol in HDL [Mass/volume] in Serum or Plasma', unit: 'mg/dL', field: 'colesterol_hdl', category: 'laboratory' },
  COLESTEROL_LDL: { code: '2089-1', display: 'Cholesterol in LDL [Mass/volume] in Serum or Plasma', unit: 'mg/dL', field: 'colesterol_ldl', category: 'laboratory' }
};

class FhirAdapter {
  constructor() {
    this.LOINC = LOINC_CATALOG;
  }

  /**
   * Procesa un FHIR Bundle entrante (transacción masiva o colección desde HOSIX, Galenos, Pakamuros o REFCON)
   */
  processBundle(bundle) {
    if (!bundle || bundle.resourceType !== 'Bundle') {
      throw new Error('El payload no corresponde a un HL7 FHIR Bundle válido');
    }

    const results = {
      patients: [],
      conditions: [],
      appointments: [],
      observations: [],
      medications: []
    };

    if (!Array.isArray(bundle.entry)) {
      return results;
    }

    for (const entry of bundle.entry) {
      const res = entry && entry.resource;
      if (!res || !res.resourceType) continue;

      switch (res.resourceType) {
        case 'Patient':
          results.patients.push(this.parsePatient(res));
          break;
        case 'Condition':
          results.conditions.push(this.parseCondition(res));
          break;
        case 'Appointment':
          results.appointments.push(this.parseAppointment(res));
          break;
        case 'Observation':
          results.observations.push(this.parseObservation(res));
          break;
        case 'MedicationStatement':
        case 'MedicationRequest':
          results.medications.push(this.parseMedication(res));
          break;
      }
    }

    return results;
  }

  /**
   * Convierte un recurso FHIR Patient a la estructura territorial interna (sin inventar edades ni datos faltantes)
   */
  parsePatient(resource) {
    const dniIdentifier = (resource.identifier || []).find(
      i => i.system?.includes('dni') || i.system?.includes('reniec') || i.system?.includes('4.904') || i.type?.coding?.[0]?.code === 'NNPER'
    );
    const hcIdentifier = (resource.identifier || []).find(
      i => i.system?.includes('historia') || i.system?.includes('hc')
    );

    const nameObj = (resource.name && resource.name[0]) || {};
    const family = nameObj.family || '';
    const given = Array.isArray(nameObj.given) ? nameObj.given.join(' ') : (nameObj.given || '');
    const fullName = nameObj.text || `${family} ${given}`.trim();

    const phoneTelecom = (resource.telecom || []).find(t => t.system === 'phone');
    const addressObj = (resource.address && resource.address[0]) || {};

    let lat = null;
    let lng = null;
    let sector = null;
    let financiador = null;

    if (addressObj.extension) {
      const geoExt = addressObj.extension.find(e => e.url?.includes('geolocation'));
      if (geoExt && geoExt.extension) {
        const latExt = geoExt.extension.find(e => e.url === 'latitude');
        const lngExt = geoExt.extension.find(e => e.url === 'longitude');
        if (latExt && latExt.valueDecimal !== undefined) lat = latExt.valueDecimal;
        if (lngExt && lngExt.valueDecimal !== undefined) lng = lngExt.valueDecimal;
        // El rango (Áncash) y el orden lat/lng se validan al guardar (server/geo/geoPaciente.js)
      }

      const sectorExt = addressObj.extension.find(e => e.url?.includes('sector-sanitario'));
      if (sectorExt) sector = sectorExt.valueString;
    }

    if (Array.isArray(resource.extension)) {
      const geoRoot = resource.extension.find(e => e.url?.includes('geolocation'));
      if (geoRoot && Array.isArray(geoRoot.extension)) {
        const latExt = geoRoot.extension.find(e => e.url === 'latitude');
        const lngExt = geoRoot.extension.find(e => e.url === 'longitude');
        if (lat === null && latExt) lat = latExt.valueDecimal;
        if (lng === null && lngExt) lng = lngExt.valueDecimal;
      }
      const finExt = resource.extension.find(e => e.url?.includes('financiador-salud'));
      if (finExt) financiador = finExt.valueString;
    }

    let edad = null;
    if (resource.birthDate) {
      const birth = new Date(resource.birthDate);
      if (!isNaN(birth.getTime())) {
        const diff = Date.now() - birth.getTime();
        const calcAge = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
        if (calcAge >= 0 && calcAge <= 115) edad = calcAge;
      }
    }

    // null = el recurso no informa el dato (no debe sobrescribir lo ya guardado)
    const fallecido = (resource.deceasedBoolean === undefined && !resource.deceasedDateTime)
      ? null
      : Boolean(resource.deceasedBoolean || resource.deceasedDateTime);
    const rawDniVal = dniIdentifier ? String(dniIdentifier.value).trim() : (resource.id ? String(resource.id).replace(/^pac-\d+-/, '') : '');
    const dniVal = rawDniVal ? rawDniVal.replace(/[^A-Za-z0-9\-]/g, '') : '';
    let resId = resource.id ? String(resource.id).trim() : null;
    if (resId && !/^[A-Za-z0-9\-_]{1,64}$/.test(resId)) {
      resId = resId.replace(/[^A-Za-z0-9\-_]/g, '').slice(0, 64);
    }
    const puertaRef = resource.managingOrganization?.reference?.replace('Organization/', '') || null;
    const puertaId = puertaRef || '00001741';

    return {
      id: resId || `pac-${puertaId}-${dniVal || crypto.randomUUID()}`,
      dni: dniVal,
      // Los datos ausentes se devuelven como null: los valores por defecto los aplica
      // db.upsertPatient solo al crear un paciente nuevo, nunca al actualizar uno existente.
      historia_clinica: hcIdentifier ? String(hcIdentifier.value).trim() : null,
      apellidos_nombres: fullName ? fullName.toUpperCase() : null,
      sexo: resource.gender === 'male' ? 'M' : resource.gender === 'female' ? 'F' : (resource.gender ? 'O' : null),
      edad: edad,
      fecha_nacimiento: resource.birthDate || null,
      fallecido: fallecido,
      financiador: financiador || null,
      telefono: phoneTelecom && phoneTelecom.value ? String(phoneTelecom.value).trim() : null,
      direccion: addressObj.text || null,
      distrito: addressObj.district || addressObj.city || null,
      latitud: lat,
      longitud: lng,
      sector_sanitario: sector || null,
      puerta_entrada_id: puertaRef
    };
  }

  parseCondition(resource) {
    const coding = resource.code?.coding?.[0] || {};
    const code = coding.code || 'I10';
    let defaultDesc = 'Hipertensión Arterial';
    if (code.startsWith('E1')) defaultDesc = 'Diabetes Mellitus';
    else if (code.startsWith('N18')) defaultDesc = 'Enfermedad Renal Crónica';

    return {
      id: resource.id || `cond-${crypto.randomUUID()}`,
      patient_id: (resource.subject?.reference || '').replace('Patient/', ''),
      cie10_cod: code,
      diagnostico: coding.display || resource.code?.text || defaultDesc,
      estado_clinico: resource.clinicalStatus?.coding?.[0]?.code || 'active',
      fecha_diagnostico: resource.onsetDateTime ? resource.onsetDateTime.split('T')[0] : fechaLima.hoy()
    };
  }

  parseAppointment(resource) {
    const isHearts = resource.serviceCategory?.[0]?.coding?.[0]?.code === 'HEARTS';
    const startDate = resource.start ? resource.start.split('T')[0] : fechaLima.hoy();
    const patientRef = resource.participant?.find(p => p.actor?.reference?.includes('Patient'))?.actor?.reference;

    return {
      id: resource.id || `apt-${crypto.randomUUID()}`,
      patient_id: patientRef ? patientRef.replace('Patient/', '') : '',
      fecha_cita: startDate,
      estado: resource.status || 'booked',
      frecuencia_dias: resource.comment?.includes('90') ? 90 : 30,
      es_precita: resource.status === 'proposed' ? 1 : 0,
      comentarios: resource.comment || (isHearts ? 'Control bajo Vía Clínica HEARTS' : '')
    };
  }

  parseObservation(resource) {
    const obs = {
      id: resource.id || `obs-${crypto.randomUUID()}`,
      patient_id: (resource.subject?.reference || '').replace('Patient/', ''),
      fecha_registro: resource.effectiveDateTime ? resource.effectiveDateTime.split('T')[0] : fechaLima.hoy(),
      pa_sistolica: null,
      pa_diastolica: null,
      glucosa: null,
      hba1c: null,
      peso: null,
      talla: null,
      imc: null,
      pab: null,
      creatinina: null,
      microalbumina: null,
      depuracion_creatinina: null,
      colesterol_total: null,
      trigliceridos: null,
      colesterol_hdl: null,
      colesterol_ldl: null,
      riesgo_cv: null,
      diagnostico_nutricional: null
    };

    const assignByLoinc = (loincCode, val) => {
      if (val === undefined || val === null || !loincCode) return;
      for (const key of Object.keys(LOINC_CATALOG)) {
        const item = LOINC_CATALOG[key];
        if (item.code === loincCode && item.field) {
          obs[item.field] = val;
        }
      }
    };

    if (Array.isArray(resource.component)) {
      for (const comp of resource.component) {
        const code = comp.code?.coding?.[0]?.code;
        const val = comp.valueQuantity?.value ?? comp.valueString;
        assignByLoinc(code, val);
      }
    }

    const mainCode = resource.code?.coding?.[0]?.code;
    const mainVal = resource.valueQuantity?.value ?? resource.valueString ?? resource.valueCodeableConcept?.text;
    assignByLoinc(mainCode, mainVal);

    // Soporte de retrocompatibilidad si un conector envía valueQuantity con unit "%" sin LOINC explícito en raíz
    if (obs.hba1c === null && resource.valueQuantity?.unit === '%' && resource.valueQuantity?.value !== undefined) {
      obs.hba1c = resource.valueQuantity.value;
    }

    // Evaluación estricta según meta HEARTS (sin dar por controlado cuando todo es null)
    const hasVital = (obs.pa_sistolica !== null && obs.pa_diastolica !== null) || obs.hba1c !== null || obs.glucosa !== null;
    if (!hasVital) {
      obs.estado_control = 'Sin Datos de Control en Padrón';
    } else {
      const paOk = (obs.pa_sistolica !== null && obs.pa_diastolica !== null) ? (obs.pa_sistolica < 140 && obs.pa_diastolica < 90) : true;
      const a1cOk = obs.hba1c !== null ? (obs.hba1c < 7.0) : true;
      const gluOk = obs.glucosa !== null ? (obs.glucosa >= 70 && obs.glucosa <= 130) : true;
      obs.estado_control = (paOk && a1cOk && gluOk) ? 'Controlado' : 'No Controlado';
    }

    return obs;
  }

  parseMedication(resource) {
    const patientRef = resource.subject?.reference || '';
    const medText = resource.medicationCodeableConcept?.text || resource.dosage?.[0]?.text || '';
    const category = resource.category?.coding?.[0]?.code || 'HTA';
    return {
      id: resource.id || `med-${crypto.randomUUID()}`,
      patient_id: patientRef.replace('Patient/', ''),
      categoria: category,
      esquema: medText
    };
  }

  /**
   * Exporta un paciente interno completo (56 columnas DNT + HOSIX) a un HL7 FHIR R4 Bundle estándar
   */
  toFhirBundle(p) {
    if (!p) return null;
    const entries = [];
    const baseUrl = 'http://hospitalhuarmey.gob.pe/fhir';
    const pid = String(p.id || `pac-00001741-${p.dni}`);

    // 1. Recurso Patient (con extensiones RENHICE / GeoRIS / Financiador / Estado HEARTS)
    const patientExtensions = [];
    if (p.financiador) {
      patientExtensions.push({
        url: 'http://minsa.gob.pe/renhice/StructureDefinition/financiador-salud',
        valueString: String(p.financiador)
      });
    }
    if (p.estado_control) {
      patientExtensions.push({
        url: 'http://minsa.gob.pe/hearts/StructureDefinition/estado-control-clinico',
        valueString: String(p.estado_control)
      });
    }
    if (p.semaforo) {
      patientExtensions.push({
        url: 'http://minsa.gob.pe/hearts/StructureDefinition/semaforo-adherencia',
        valueString: String(p.semaforo)
      });
    }

    const patientResource = {
      resourceType: 'Patient',
      id: pid,
      meta: {
        profile: ['http://minsa.gob.pe/renhice/StructureDefinition/Patient-PE']
      },
      identifier: [
        {
          use: 'official',
          system: 'urn:oid:2.16.840.1.113883.4.904', // OID RENIEC DNI Perú
          type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'NNPER', display: 'Documento Nacional de Identidad' }] },
          value: String(p.dni || '')
        },
        {
          use: 'usual',
          system: 'http://hospitalhuarmey.gob.pe/fhir/sid/historia-clinica',
          value: String(p.historia_clinica || '')
        }
      ],
      active: !p.fallecido,
      deceasedBoolean: Boolean(p.fallecido),
      name: [{ use: 'official', text: p.apellidos_nombres }],
      telecom: p.telefono ? [{ system: 'phone', value: String(p.telefono), use: 'mobile' }] : [],
      gender: p.sexo === 'M' ? 'male' : (p.sexo === 'F' ? 'female' : 'unknown'),
      birthDate: p.fecha_nacimiento || undefined,
      address: [
        {
          use: 'home',
          text: p.direccion || undefined,
          district: p.distrito || 'Huarmey',
          state: 'Áncash',
          country: 'PE',
          // Solo se emite lo que existe: sin coordenadas null ni sector inventado (G-04)
          extension: (() => {
            const ext = [];
            if (p.latitud !== null && p.latitud !== undefined && p.longitud !== null && p.longitud !== undefined) {
              ext.push({
                url: 'http://hl7.org/fhir/StructureDefinition/geolocation',
                extension: [
                  { url: 'latitude', valueDecimal: p.latitud },
                  { url: 'longitude', valueDecimal: p.longitud }
                ]
              });
            }
            if (p.sector_sanitario) {
              ext.push({ url: 'http://minsa.gob.pe/georis/StructureDefinition/sector-sanitario', valueString: p.sector_sanitario });
            }
            return ext.length ? ext : undefined;
          })()
        }
      ],
      extension: patientExtensions.length > 0 ? patientExtensions : undefined,
      managingOrganization: {
        reference: `Organization/${p.puerta_entrada_id || '00001741'}`,
        display: p.puerta_entrada || 'NUEVO HOSPITAL DE APOYO HUARMEY'
      }
    };
    entries.push({ fullUrl: `${baseUrl}/Patient/${pid}`, resource: patientResource });

    // 2. Recursos Condition (CIE-10 + Daño de Órgano Blanco + Otras Patologías)
    (p.conditions || []).forEach((c, idx) => {
      const condId = c.id || `${pid}-cond-${idx + 1}`;
      entries.push({
        fullUrl: `${baseUrl}/Condition/${condId}`,
        resource: {
          resourceType: 'Condition',
          id: condId,
          clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: c.estado_clinico || 'active' }] },
          verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }] },
          code: {
            coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: c.cie10_cod, display: c.diagnostico }],
            text: c.diagnostico
          },
          subject: { reference: `Patient/${pid}` },
          recordedDate: c.fecha_diagnostico || undefined
        }
      });
    });

    if (p.dano_organo_blanco) {
      const todId = `${pid}-target-organ-damage`;
      entries.push({
        fullUrl: `${baseUrl}/Condition/${todId}`,
        resource: {
          resourceType: 'Condition',
          id: todId,
          clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
          category: [{ coding: [{ system: 'http://minsa.gob.pe/hearts/CodeSystem/condition-category', code: 'target-organ-damage', display: 'Daño de Órgano Blanco Demostrado (HEARTS)' }] }],
          code: { text: String(p.dano_organo_blanco) },
          subject: { reference: `Patient/${pid}` }
        }
      });
    }

    if (p.otras_patologias) {
      const comorbId = `${pid}-comorbidity`;
      entries.push({
        fullUrl: `${baseUrl}/Condition/${comorbId}`,
        resource: {
          resourceType: 'Condition',
          id: comorbId,
          clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
          category: [{ coding: [{ system: 'http://minsa.gob.pe/hearts/CodeSystem/condition-category', code: 'comorbidity', display: 'Otras Patologías / Comorbilidades' }] }],
          code: { text: String(p.otras_patologias) },
          subject: { reference: `Patient/${pid}` }
        }
      });
    }

    // 3. Recursos Observation codificados en LOINC v2.78
    const latestObservation = getLatestObservation(p.observations);
    const obsDate = p.fecha_examenes || p.ultima_atencion || (latestObservation?.fecha_registro) || '2026-10-01';
    if (p.pa_sistolica !== null && p.pa_sistolica !== undefined && p.pa_diastolica !== null && p.pa_diastolica !== undefined) {
      const bpId = `${pid}-obs-bp`;
      entries.push({
        fullUrl: `${baseUrl}/Observation/${bpId}`,
        resource: {
          resourceType: 'Observation',
          id: bpId,
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: LOINC_CATALOG.BP_PANEL.code, display: LOINC_CATALOG.BP_PANEL.display }] },
          subject: { reference: `Patient/${pid}` },
          effectiveDateTime: obsDate,
          component: [
            {
              code: { coding: [{ system: 'http://loinc.org', code: LOINC_CATALOG.PAS.code, display: LOINC_CATALOG.PAS.display }] },
              valueQuantity: { value: Number(p.pa_sistolica), unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' }
            },
            {
              code: { coding: [{ system: 'http://loinc.org', code: LOINC_CATALOG.PAD.code, display: LOINC_CATALOG.PAD.display }] },
              valueQuantity: { value: Number(p.pa_diastolica), unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' }
            }
          ]
        }
      });
    }

    const singleObservations = [
      'GLUCOSA', 'HBA1C', 'PESO', 'TALLA', 'IMC', 'PAB',
      'MICROALBUMINA', 'CREATININA', 'DEP_CREATININA',
      'COLESTEROL_TOTAL', 'TRIGLICERIDOS', 'COLESTEROL_HDL', 'COLESTEROL_LDL',
      'NUTRICION', 'RIESGO_CV'
    ];

    for (const key of singleObservations) {
      const meta = LOINC_CATALOG[key];
      const rawVal = p[meta.field];
      if (rawVal !== null && rawVal !== undefined && rawVal !== '') {
        const numVal = Number(rawVal);
        const isNum = !isNaN(numVal) && String(rawVal).trim() !== '';
        const obsId = `${pid}-obs-${key.toLowerCase()}`;
        const obsRes = {
          resourceType: 'Observation',
          id: obsId,
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: meta.category || 'laboratory' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: meta.code, display: meta.display }] },
          subject: { reference: `Patient/${pid}` },
          effectiveDateTime: obsDate
        };
        if (isNum && meta.unit) {
          obsRes.valueQuantity = { value: numVal, unit: meta.unit, system: 'http://unitsofmeasure.org', code: meta.unit };
        } else {
          obsRes.valueString = String(rawVal);
        }
        entries.push({ fullUrl: `${baseUrl}/Observation/${obsId}`, resource: obsRes });
      }
    }

    // Observaciones longitudinales adicionales almacenadas en p.observations[]
    if (Array.isArray(p.observations) && p.observations.length > 1) {
      // Historial = todas las observaciones salvo la más reciente (ya reflejada arriba)
      p.observations.filter(o => o !== latestObservation).forEach((histObs, idx) => {
        if (histObs.pa_sistolica && histObs.pa_diastolica) {
          const histId = histObs.id || `${pid}-obs-hist-${idx + 1}`;
          entries.push({
            fullUrl: `${baseUrl}/Observation/${histId}`,
            resource: {
              resourceType: 'Observation',
              id: histId,
              status: 'final',
              category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
              code: { coding: [{ system: 'http://loinc.org', code: LOINC_CATALOG.BP_PANEL.code, display: LOINC_CATALOG.BP_PANEL.display }] },
              subject: { reference: `Patient/${pid}` },
              effectiveDateTime: histObs.fecha_registro || obsDate,
              component: [
                {
                  code: { coding: [{ system: 'http://loinc.org', code: LOINC_CATALOG.PAS.code, display: LOINC_CATALOG.PAS.display }] },
                  valueQuantity: { value: Number(histObs.pa_sistolica), unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' }
                },
                {
                  code: { coding: [{ system: 'http://loinc.org', code: LOINC_CATALOG.PAD.code, display: LOINC_CATALOG.PAD.display }] },
                  valueQuantity: { value: Number(histObs.pa_diastolica), unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' }
                }
              ]
            }
          });
        }
      });
    }

    // 4. Recursos MedicationStatement (Esquemas HTA, DM y adicionales)
    if (p.tratamiento_hta) {
      const medHtaId = `${pid}-med-hta`;
      entries.push({
        fullUrl: `${baseUrl}/MedicationStatement/${medHtaId}`,
        resource: {
          resourceType: 'MedicationStatement',
          id: medHtaId,
          status: 'active',
          category: { coding: [{ system: 'http://minsa.gob.pe/hearts/CodeSystem/medication-category', code: 'HTA', display: 'Esquema Antihipertensivo HEARTS' }] },
          medicationCodeableConcept: { text: String(p.tratamiento_hta) },
          subject: { reference: `Patient/${pid}` }
        }
      });
    }
    if (p.tratamiento_dm) {
      const medDmId = `${pid}-med-dm`;
      entries.push({
        fullUrl: `${baseUrl}/MedicationStatement/${medDmId}`,
        resource: {
          resourceType: 'MedicationStatement',
          id: medDmId,
          status: 'active',
          category: { coding: [{ system: 'http://minsa.gob.pe/hearts/CodeSystem/medication-category', code: 'DM', display: 'Esquema Antidiabético HEARTS' }] },
          medicationCodeableConcept: { text: String(p.tratamiento_dm) },
          subject: { reference: `Patient/${pid}` }
        }
      });
    }

    // 5. Recursos Appointment (Citas y Pre-citas HEARTS)
    const appts = Array.isArray(p.appointments) && p.appointments.length > 0
      ? p.appointments
      : (p.proxima_cita ? [{ id: `${pid}-apt-next`, fecha_cita: p.proxima_cita, estado: 'booked', frecuencia_dias: p.frecuencia_hearts || 30, comentarios: p.recomendacion || 'Control programado bajo Vía Clínica HEARTS' }] : []);

    appts.forEach((a, idx) => {
      const aptId = a.id || `${pid}-apt-${idx + 1}`;
      entries.push({
        fullUrl: `${baseUrl}/Appointment/${aptId}`,
        resource: {
          resourceType: 'Appointment',
          id: aptId,
          status: a.estado || 'booked',
          serviceCategory: [{ coding: [{ system: 'http://minsa.gob.pe/fhir/estrategia', code: 'HEARTS', display: 'Iniciativa HEARTS OPS/MINSA' }] }],
          start: a.fecha_cita,
          comment: a.comentarios || `Control cada ${a.frecuencia_dias || 30} días`,
          participant: [
            { actor: { reference: `Patient/${pid}`, display: p.apellidos_nombres }, status: 'accepted' },
            { actor: { reference: `Organization/${p.puerta_entrada_id || '00001741'}`, display: p.puerta_entrada || 'NUEVO HOSPITAL DE APOYO HUARMEY' }, status: 'accepted' }
          ]
        }
      });
    });

    return {
      resourceType: 'Bundle',
      id: `bundle-hearts-${pid}`,
      type: 'collection',
      timestamp: new Date().toISOString(),
      total: entries.length,
      entry: entries
    };
  }
}

module.exports = new FhirAdapter();
