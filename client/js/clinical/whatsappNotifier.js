/**
 * whatsappNotifier.js
 * Generador de avisos y notificaciones por WhatsApp para pacientes crónicos
 * Hospital de Apoyo Huarmey II-1 — Estrategia HEARTS
 *
 * Fase 3 (K3-02, K3-03): no se genera aviso para un paciente fallecido (bandera o estado «Fallecido») y el aviso no
 * inventa la fecha: sin fecha de control (parámetro `customDate` o `patient.fecha_limite`) no hay enlace.
 * El mensaje sigue sin llevar nombre, documento, diagnóstico ni tratamiento (privacidad, Ley N° 29733).
 */
(function (root) {
  const enNode = typeof module !== 'undefined' && module.exports;
  const R = enNode ? require('./reglasClinicas') : root.ReglasClinicas;
  if (!R) throw new Error('Reglas clínicas no cargadas (reglasClinicas.js debe cargarse antes que whatsappNotifier.js)');

  /** Fecha que se le dice al paciente: la indicada o la fecha límite de su cita; '' si no hay (no se inventa una). */
  function fechaDelAviso(patient, customDate) {
    for (const candidata of [customDate, patient && patient.fecha_limite]) {
      const t = candidata === undefined || candidata === null ? '' : String(candidata).trim();
      if (t !== '' && t.toLowerCase() !== 'sin fecha') return t;
    }
    return '';
  }

  class WhatsappNotifier {
    /**
     * Estado del consentimiento para recordatorios por WhatsApp (Ley N° 29733).
     * Solo "Sí, firmado" autoriza el envío; vacío o "No" no.
     */
    estadoConsentimiento(patient) {
      const v = patient && patient.consentimiento ? String(patient.consentimiento).trim() : '';
      if (v === 'Sí, firmado') return 'si';
      if (v === 'No') return 'no';
      return 'sin_registrar';
    }

    tieneConsentimiento(patient) {
      return this.estadoConsentimiento(patient) === 'si';
    }

    /**
     * Por qué NO se puede avisar a este paciente, o '' si se puede (para explicárselo a quien pulsa el botón).
     * Orden: fallecido, consentimiento, teléfono, fecha.
     */
    motivoSinEnlace(patient, customDate = null) {
      if (!patient) return 'No hay paciente seleccionado.';
      if (R.esFallecido(patient)) return 'El paciente figura como fallecido: no se envían recordatorios.';
      if (!this.tieneConsentimiento(patient)) return 'El paciente no tiene consentimiento registrado para recibir recordatorios por WhatsApp.';
      const tel = patient.telefono ? String(patient.telefono).replace(/\D/g, '') : '';
      if (tel.length < 9) return 'El paciente no tiene registrado un número telefónico celular válido.';
      if (!fechaDelAviso(patient, customDate)) return 'El paciente no tiene una fecha de control registrada: no se envía el recordatorio sin fecha.';
      return '';
    }

    /**
     * Genera el enlace oficial de WhatsApp Click-to-Chat
     * @param {Object} patient Paciente con teléfono, consentimiento y fecha límite
     * @param {string} [customDate] fecha del control que se le dice al paciente (por defecto, patient.fecha_limite)
     * @returns {string|null} null si es fallecido, no tiene consentimiento, teléfono válido o fecha
     */
    generateLink(patient, customDate = null) {
      if (!patient || !patient.telefono) return null;
      // Un fallecido no recibe recordatorios aunque haya firmado el consentimiento en vida
      if (R.esFallecido(patient)) return null;
      // Sin consentimiento registrado no se genera ningún enlace
      if (!this.tieneConsentimiento(patient)) return null;

      // Limpiar número telefónico peruano
      let cleanPhone = String(patient.telefono).replace(/\D/g, '');
      if (!cleanPhone || cleanPhone.length < 9) return null;
      if (cleanPhone.length === 9) {
        cleanPhone = `51${cleanPhone}`; // Prefijo de Perú
      }

      // Sin fecha de control no hay aviso: decirle al paciente «esta semana» o una fecha inventada puede hacerle perder su cita
      const fechaTxt = fechaDelAviso(patient, customDate);
      if (!fechaTxt) return null;

      // El mensaje no lleva diagnóstico, tratamiento ni nombre del paciente
      const mensaje =
        `*HOSPITAL DE APOYO HUARMEY*\n\n` +
        `Estimado(a) paciente:\n` +
        `Le recordamos que su control periódico corresponde para la fecha *${fechaTxt}*.\n\n` +
        `🏥 *Lugar:* ${patient.puerta_entrada || 'Consultorio de Crónicos / Admisión HOSIX'}\n\n` +
        `_Por favor responda a este mensaje con un *1* para CONFIRMAR su asistencia o un *2* para REPROGRAMAR su turno._`;

      const encodedMsg = encodeURIComponent(mensaje);
      return `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
    }

    generarEnlace(patient, customDate = null) {
      return this.generateLink(patient, customDate);
    }

    /**
     * Abre directamente la ventana de WhatsApp Web / App
     */
    sendDirect(patient) {
      const link = this.generateLink(patient);
      if (!link) {
        alert(this.motivoSinEnlace(patient) || 'No se pudo generar el enlace de WhatsApp.');
        return false;
      }
      window.open(link, '_blank', 'noopener');
      return true;
    }
  }

  // Exportación
  if (enNode) {
    module.exports = new WhatsappNotifier();
  } else {
    root.WhatsappNotifier = new WhatsappNotifier();
  }
})(typeof window !== 'undefined' ? window : this);
