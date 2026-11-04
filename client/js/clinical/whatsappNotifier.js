/**
 * whatsappNotifier.js
 * Generador de avisos y notificaciones por WhatsApp para pacientes crónicos
 * Hospital de Apoyo Huarmey II-1 — Estrategia HEARTS
 */

class WhatsappNotifier {
  /**
   * Genera el enlace oficial de WhatsApp Click-to-Chat
   * @param {Object} patient Paciente con teléfono, nombres, diagnóstico y fecha límite
   */
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

  generateLink(patient, customDate = null) {
    if (!patient || !patient.telefono) return null;
    // Sin consentimiento registrado no se genera ningún enlace
    if (!this.tieneConsentimiento(patient)) return null;

    // Limpiar número telefónico peruano
    let cleanPhone = String(patient.telefono).replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 9) return null;
    if (cleanPhone.length === 9) {
      cleanPhone = `51${cleanPhone}`; // Prefijo de Perú
    }

    const fechaTxt = customDate || patient.fecha_limite || 'esta semana';

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
      alert(this.tieneConsentimiento(patient)
        ? 'El paciente no tiene registrado un número telefónico celular válido.'
        : 'El paciente no tiene consentimiento registrado para recibir recordatorios por WhatsApp.');
      return false;
    }
    window.open(link, '_blank');
    return true;
  }
}

// Exportación
if (typeof module !== 'undefined' && module.exports) {
  module.exports = new WhatsappNotifier();
} else {
  window.WhatsappNotifier = new WhatsappNotifier();
}
