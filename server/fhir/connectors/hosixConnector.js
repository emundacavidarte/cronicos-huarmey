/**
 * hosixConnector.js
 * Conector de Integración para el Sistema de Gestión Hospitalaria HOSIX (SIVSA)
 * Hospital de Apoyo Huarmey II-1 — Estándar HL7 FHIR R4
 */

const crypto = require('crypto');
const documentos = require('../../utils/documentos');

class HosixConnector {
  /**
   * Transforma una fila o payload nativo de HOSIX a un HL7 FHIR R4 Bundle (transaction)
   */
  transformToFhir(hosixRecord = {}) {
    // Documento obligatorio: DNI, carné de extranjería o pasaporte. Tipo en TIPO_DOCUMENTO (DNI/CE/PASAPORTE o los
    // códigos SUNAT 1/4/7); si no viene, se infiere del formato (supuesto hasta conocer el envío real de HOSIX).
    const doc = documentos.leerDeRegistro(hosixRecord, ['NRO_DOCUMENTO', 'NUM_DOCUMENTO', 'DNI'], ['TIPO_DOCUMENTO', 'TIPO_DOC', 'TIPODOC'], 'HOSIX');
    const dni = doc.numero;
    const hc = String(hosixRecord.HISTORIA_CLINICA || hosixRecord.NUM_HC || 'S/N').trim();
    const nombre = String(hosixRecord.PACIENTE || hosixRecord.APELLIDOS_NOMBRES || 'PACIENTE HOSIX').trim();
    const telefono = String(hosixRecord.TELEFONO || hosixRecord.CELULAR || '').trim();
    const direccion = String(hosixRecord.DIRECCION || hosixRecord.REF_DIRECCION || 'Huarmey').trim();
    const rawCie10 = hosixRecord.CIE10_COD || hosixRecord.DIAGNOSTICO;
    const cie10 = rawCie10 ? String(rawCie10).trim() : null;
    const fechaUltima = hosixRecord.FEC_ULTIMA_ATENCION || null;
    const fechaProxima = hosixRecord.FEC_PROXIMA_CITA || null;
    const pas = (hosixRecord.PA_SISTOLICA !== undefined && hosixRecord.PA_SISTOLICA !== '' && hosixRecord.PA_SISTOLICA !== null) ? parseInt(hosixRecord.PA_SISTOLICA, 10) : null;
    const pad = (hosixRecord.PA_DIASTOLICA !== undefined && hosixRecord.PA_DIASTOLICA !== '' && hosixRecord.PA_DIASTOLICA !== null) ? parseInt(hosixRecord.PA_DIASTOLICA, 10) : null;
    const hba1c = parseFloat(hosixRecord.HBA1C) || null;
    const glucosa = parseFloat(hosixRecord.GLUCOSA) || null;
    const estado = hosixRecord.ESTADO_CONTROL || ((pas !== null && pad !== null) ? ((pas >= 140 || pad >= 90) ? 'No Controlado' : 'Controlado') : (hosixRecord.ESTADO_CONTROL || 'Sin Datos de Control en Padrón'));

    const patientId = `pac-00001741-${dni}`;
    const baseUrl = 'http://hospitalhuarmey.gob.pe/fhir';

    const bundle = {
      resourceType: 'Bundle',
      id: `bundle-hosix-${crypto.randomUUID()}`,
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
              { system: 'http://minsa.gob.pe/hosix/historia_clinica', value: hc }
            ],
            name: [{ use: 'official', text: nombre }],
            telecom: telefono ? [{ system: 'phone', value: telefono, use: 'mobile' }] : [],
            address: [{ text: direccion, district: 'Huarmey', city: 'Huarmey', state: 'Áncash', country: 'PE' }],
            managingOrganization: { reference: 'Organization/00001741', display: 'NUEVO HOSPITAL DE APOYO HUARMEY' }
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
                display: cie10.startsWith('I') ? 'Hipertensión Esencial' : (cie10.startsWith('E') ? 'Diabetes Mellitus' : 'Condición Crónica')
              }
            ]
          }
        }
      });
    }

    // Solo registrar Appointment si existe una fecha de próxima cita programada (evita falsos desertores)
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
          comment: estado === 'No Controlado' ? 'Control a 30 días HEARTS' : 'Control a 90 días HEARTS',
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
          effectiveDateTime: fechaUltima || new Date().toISOString(),
          component: components
        }
      });
    }

    return bundle;
  }
}

module.exports = new HosixConnector();
