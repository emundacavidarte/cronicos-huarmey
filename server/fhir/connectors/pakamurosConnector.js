/**
 * pakamurosConnector.js
 * Conector de Integración para el Sistema de Historia Clínica Electrónica PAKAMUROS SOFT
 * Desarrollado originalmente por el Hospital General de Jaén (Cajamarca) y adoptado en redes del MINSA — Estándar HL7 FHIR R4
 */

const crypto = require('crypto');
const documentos = require('../../utils/documentos');

class PakamurosConnector {
  /**
   * Transforma un registro o payload de Pakamuros Soft a un HL7 FHIR R4 Bundle (transaction)
   */
  transformToFhir(pakamurosRecord = {}) {
    const doc = documentos.leerDeRegistro(pakamurosRecord, ['dni_paciente', 'DNI', 'numero_documento'], ['tipo_documento', 'TIPO_DOCUMENTO'], 'Pakamuros');
    const dni = doc.numero;
    const hc = String(pakamurosRecord.hc_numero || pakamurosRecord.nro_historia || pakamurosRecord.historia_clinica || 'S/N').trim();
    const nombreCompleto = String(pakamurosRecord.paciente_apellidos_nombres || pakamurosRecord.nombre_completo || pakamurosRecord.paciente || 'PACIENTE PAKAMUROS').trim();
    const telefono = String(pakamurosRecord.telefono_celular || pakamurosRecord.celular || pakamurosRecord.telefono || '').trim();
    const direccion = String(pakamurosRecord.direccion_actual || pakamurosRecord.direccion || 'Huarmey').trim();
    const distrito = String(pakamurosRecord.distrito || 'Huarmey').trim();
    const rawCie10 = pakamurosRecord.diagnostico_cie10 || pakamurosRecord.cie10;
    const cie10 = rawCie10 ? String(rawCie10).trim() : null;
    const fechaAtencion = pakamurosRecord.fecha_atencion || pakamurosRecord.fecha_registro || null;
    const fechaProxima = pakamurosRecord.fecha_control_cita || pakamurosRecord.proxima_cita || null;

    let pas = (pakamurosRecord.pa_sistolica !== undefined && pakamurosRecord.pa_sistolica !== '' && pakamurosRecord.pa_sistolica !== null)
      ? parseInt(pakamurosRecord.pa_sistolica, 10)
      : ((pakamurosRecord.presion_sistolica !== undefined && pakamurosRecord.presion_sistolica !== '' && pakamurosRecord.presion_sistolica !== null) ? parseInt(pakamurosRecord.presion_sistolica, 10) : null);
    let pad = (pakamurosRecord.pa_diastolica !== undefined && pakamurosRecord.pa_diastolica !== '' && pakamurosRecord.pa_diastolica !== null)
      ? parseInt(pakamurosRecord.pa_diastolica, 10)
      : ((pakamurosRecord.presion_diastolica !== undefined && pakamurosRecord.presion_diastolica !== '' && pakamurosRecord.presion_diastolica !== null) ? parseInt(pakamurosRecord.presion_diastolica, 10) : null);
    if (pas === null && pakamurosRecord.presion_arterial && String(pakamurosRecord.presion_arterial).includes('/')) {
      const parts = String(pakamurosRecord.presion_arterial).split('/');
      pas = parseInt(parts[0], 10) || null;
      pad = parseInt(parts[1], 10) || null;
    }

    const hba1c = (pakamurosRecord.hba1c !== undefined && pakamurosRecord.hba1c !== '' && pakamurosRecord.hba1c !== null)
      ? parseFloat(pakamurosRecord.hba1c)
      : ((pakamurosRecord.hemoglobina_glicosilada !== undefined && pakamurosRecord.hemoglobina_glicosilada !== '' && pakamurosRecord.hemoglobina_glicosilada !== null) ? parseFloat(pakamurosRecord.hemoglobina_glicosilada) : null);
    const glucosa = (pakamurosRecord.glucosa !== undefined && pakamurosRecord.glucosa !== '' && pakamurosRecord.glucosa !== null) ? parseFloat(pakamurosRecord.glucosa) : null;
    const codIpress = String(pakamurosRecord.codigo_ipress || pakamurosRecord.establecimiento_adscripcion || '00001741').trim();

    const patientId = `pac-${codIpress}-${dni}`;
    const baseUrl = 'http://hospitalhuarmey.gob.pe/fhir';

    const bundle = {
      resourceType: 'Bundle',
      id: `bundle-pakamuros-${crypto.randomUUID()}`,
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
              { system: 'http://minsa.gob.pe/pakamuros/historia_clinica', value: hc }
            ],
            name: [{ use: 'official', text: nombreCompleto }],
            telecom: telefono ? [{ system: 'phone', value: telefono, use: 'mobile' }] : [],
            address: [{ text: direccion, district: distrito, city: 'Huarmey', state: 'Áncash', country: 'PE' }],
            managingOrganization: { reference: `Organization/${codIpress}` }
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
                display: cie10.startsWith('I') ? 'Hipertensión Arterial' : 'Diabetes Mellitus Tipo 2'
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

module.exports = new PakamurosConnector();
