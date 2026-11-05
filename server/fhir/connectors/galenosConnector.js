/**
 * galenosConnector.js
 * Conector de Integración para el Sistema Galenos (SIS-Galenos MINSA)
 * Utilizado ampliamente en hospitales II-1 y II-2 del Ministerio de Salud — Estándar HL7 FHIR R4
 */

const crypto = require('crypto');
const documentos = require('../../utils/documentos');

class GalenosConnector {
  /**
   * Transforma una fila o evento de Galenos a un HL7 FHIR R4 Bundle (transaction)
   */
  transformToFhir(galenosRecord = {}) {
    const doc = documentos.leerDeRegistro(galenosRecord, ['DocIdentidad', 'NumeroDocumento'], ['TipoDocumento', 'TipoDocIdentidad'], 'Galenos');
    const dni = doc.numero;
    const hc = String(galenosRecord.NroHistoriaClinica || 'S/N').trim();
    const nombres = String(galenosRecord.Nombres || '').trim();
    const apPaterno = String(galenosRecord.ApellidoPaterno || '').trim();
    const apMaterno = String(galenosRecord.ApellidoMaterno || '').trim();
    const nombreCompleto = `${apPaterno} ${apMaterno} ${nombres}`.trim() || String(galenosRecord.Paciente || 'PACIENTE GALENOS').trim();
    const telefono = String(galenosRecord.Telefono || galenosRecord.Movil || '').trim();
    const direccion = String(galenosRecord.Direccion || galenosRecord.Domicilio || 'Huarmey').trim();
    const rawCie10 = galenosRecord.CodigoCIE10;
    const cie10 = rawCie10 ? String(rawCie10).trim() : null;
    const fechaAtencion = galenosRecord.FechaAtencion || null;
    const fechaProxima = galenosRecord.FechaProximaCita || null;
    const pas = (galenosRecord.PresionSistolica !== undefined && galenosRecord.PresionSistolica !== '' && galenosRecord.PresionSistolica !== null) ? parseInt(galenosRecord.PresionSistolica, 10) : null;
    const pad = (galenosRecord.PresionDiastolica !== undefined && galenosRecord.PresionDiastolica !== '' && galenosRecord.PresionDiastolica !== null) ? parseInt(galenosRecord.PresionDiastolica, 10) : null;
    const hba1c = parseFloat(galenosRecord.HbA1c) || null;
    const glucosa = parseFloat(galenosRecord.Glucosa) || null;
    const codRenaes = String(galenosRecord.CodRenaes || '00001741').trim();

    const patientId = `pac-${codRenaes}-${dni}`;
    const baseUrl = 'http://hospitalhuarmey.gob.pe/fhir';

    const bundle = {
      resourceType: 'Bundle',
      id: `bundle-galenos-${crypto.randomUUID()}`,
      type: 'transaction',
      timestamp: new Date().toISOString(),
      entry: [
        {
          fullUrl: `${baseUrl}/Patient/${patientId}`,
          request: { method: 'PUT', url: `Patient/${patientId}` },
          resource: {
            resourceType: 'Patient',
            id: patientId,
            identifier: [
              documentos.identificadorFhir(doc.tipo, dni),
              { system: 'http://minsa.gob.pe/galenos/historia_clinica', value: hc }
            ],
            name: [{
              use: 'official',
              family: `${apPaterno} ${apMaterno}`.trim(),
              given: nombres ? [nombres] : [],
              text: nombreCompleto
            }],
            telecom: telefono ? [{ system: 'phone', value: telefono, use: 'mobile' }] : [],
            address: [{ text: direccion, district: 'Huarmey', city: 'Huarmey', state: 'Áncash', country: 'PE' }],
            managingOrganization: { reference: `Organization/${codRenaes}` }
          }
        }
      ]
    };

    if (cie10) {
      const condId = `cond-${dni}-${cie10}`;
      bundle.entry.push({
        fullUrl: `${baseUrl}/Condition/${condId}`,
        request: { method: 'PUT', url: `Condition/${condId}` },
        resource: {
          resourceType: 'Condition',
          id: condId,
          clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
          subject: { reference: `Patient/${patientId}` },
          code: {
            coding: [
              {
                system: 'http://hl7.org/fhir/sid/icd-10',
                code: cie10,
                display: cie10.startsWith('I') ? 'Hipertensión Arterial' : 'Diabetes Mellitus'
              }
            ]
          }
        }
      });
    }

    // Solo registrar Appointment si existe fecha de próxima cita programada
    if (fechaProxima) {
      const aptId = `apt-${dni}-${crypto.randomUUID().slice(0, 8)}`;
      bundle.entry.push({
        fullUrl: `${baseUrl}/Appointment/${aptId}`,
        request: { method: 'POST', url: 'Appointment' },
        resource: {
          resourceType: 'Appointment',
          id: aptId,
          status: 'booked',
          serviceCategory: [{ coding: [{ system: 'http://minsa.gob.pe/fhir/estrategia', code: 'HEARTS' }] }],
          start: fechaProxima,
          comment: (pas !== null && (pas >= 140 || pad >= 90)) ? 'Control a 30 días HEARTS' : 'Control a 90 días HEARTS',
          participant: [{ actor: { reference: `Patient/${patientId}` }, status: 'accepted' }]
        }
      });
    }

    if (pas !== null || pad !== null || hba1c !== null || glucosa !== null) {
      const obsId = `obs-${dni}-${crypto.randomUUID().slice(0, 8)}`;
      const components = [];
      if (pas !== null) components.push({ code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' }] }, valueQuantity: { value: pas, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' } });
      if (pad !== null) components.push({ code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' }] }, valueQuantity: { value: pad, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' } });
      if (hba1c !== null) components.push({ code: { coding: [{ system: 'http://loinc.org', code: '4548-4', display: 'Hemoglobin A1c/Hemoglobin.total in Blood' }] }, valueQuantity: { value: hba1c, unit: '%', system: 'http://unitsofmeasure.org', code: '%' } });
      if (glucosa !== null) components.push({ code: { coding: [{ system: 'http://loinc.org', code: '1558-6', display: 'Fasting glucose [Mass/volume] in Serum or Plasma' }] }, valueQuantity: { value: glucosa, unit: 'mg/dL', system: 'http://unitsofmeasure.org', code: 'mg/dL' } });

      bundle.entry.push({
        fullUrl: `${baseUrl}/Observation/${obsId}`,
        request: { method: 'POST', url: 'Observation' },
        resource: {
          resourceType: 'Observation',
          id: obsId,
          status: 'final',
          code: { coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure panel with all children optional' }] },
          subject: { reference: `Patient/${patientId}` },
          effectiveDateTime: fechaAtencion || new Date().toISOString(),
          component: components
        }
      });
    }

    return bundle;
  }
}

module.exports = new GalenosConnector();
