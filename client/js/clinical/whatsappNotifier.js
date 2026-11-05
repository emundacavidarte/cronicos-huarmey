/**
 * whatsappNotifier.js
 * Generador de avisos y notificaciones por WhatsApp para pacientes crónicos
 * Hospital de Apoyo Huarmey II-1 — Estrategia HEARTS
 */

/** Hoy en Lima como AAAA-MM-DD (en el navegador usa FechaLima; en Node, el mismo cálculo). */
function hoyLima() {
  const raiz = typeof window !== 'undefined' ? window : null;
  if (raiz && raiz.FechaLima) return raiz.FechaLima.hoy();
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

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
    // A un paciente fallecido no se le envían recordatorios
    if (patient.fallecido) return null;
    // Sin consentimiento registrado no se genera ningún enlace
    if (!this.tieneConsentimiento(patient)) return null;

    // Limpiar número telefónico peruano
    let cleanPhone = String(patient.telefono).replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 9) return null;
    if (cleanPhone.length === 9) {
      cleanPhone = `51${cleanPhone}`; // Prefijo de Perú
    }

    // F-6: la fecha sale de la cita real del paciente (fecha_limite = su cita más reciente), no de «hoy + 3 días»
    let aviso;
    if (customDate) {
      aviso = `Le recordamos que su control periódico corresponde para la fecha *${customDate}*.`;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(String(patient.fecha_limite || ''))) {
      const [a, m, d] = String(patient.fecha_limite).split('-');
      const fechaTxt = `${d}/${m}/${a}`;
      aviso = String(patient.fecha_limite) >= hoyLima()
        ? `Le recordamos que su próximo control es el *${fechaTxt}*.`
        : `Su control programado para el *${fechaTxt}* está pendiente. Por favor, comuníquese para reprogramarlo.`;
    } else {
      aviso = 'Le recordamos que le corresponde su control periódico. Por favor, comuníquese para programar su cita.';
    }

    // El mensaje no lleva diagnóstico, tratamiento ni nombre del paciente
    const mensaje =
      `*HOSPITAL DE APOYO HUARMEY*\n\n` +
      `Estimado(a) paciente:\n` +
      `${aviso}\n\n` +
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
