/**
 * registroClinicoModal.js
 * Formulario Web de Registro Clínico y Atención en Línea
 * Padrón Estandarizado - Hospital de Apoyo Huarmey II-1
 * 
 * Flujo optimizado:
 * 1. Búsqueda por DNI: Si el paciente ya existe en la base de datos, jala automáticamente
 *    toda su filiación, domicilio, diagnósticos, historial y PRECARGA su medicación anterior.
 * 2. Enfoque en la Atención de Hoy: Permite ingresar directamente los signos vitales de la
 *    consulta, laboratorios nuevos y verificar/ajustar la medicación con 1 clic.
 * 3. Cálculos Clínicos 100% Automáticos: Genera en vivo las 22 variables normativas (IMC,
 *    TFGe CKD-EPI, Estadio ERC, Semáforo HEARTS, Metas PA/HbA1c/LDL y Alertas de Tamizaje).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(
      require('../data/padronSchema'),
      require('../clinical/padronCalculadora')
    );
  } else {
    root.RegistroClinicoModal = factory(root.PadronSchema, root.PadronCalculadora);
  }
})(typeof window !== 'undefined' ? window : this, function (schema, calculadora) {

  const MESES_CODIGOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
  const MESES_NOMBRES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    // Los valores que vienen de un Excel o de la API nunca se escriben tal cual en la página
  const esc = (v) => String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  class RegistroClinicoModal {
    constructor() {
      this.dom = {};
      this.isInitialized = false;
      this.currentPatient = null;
      this.isExistingPatient = false;
    }

    init() {
      if (this.isInitialized) return;
      this.buildModalDOM();
      this.attachEvents();
      this.isInitialized = true;
    }

    buildModalDOM() {
      let modal = document.getElementById('modal-registro-clinico');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-registro-clinico';
        modal.className = 'reg-modal-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');

        const mesesOptions = MESES_CODIGOS.map((c, i) => `<option value="${c}">${MESES_NOMBRES[i]}</option>`).join('');

        const iconSteth = window.AppIcons ? window.AppIcons.stethoscope(22, '#1A73E8') : '🩺';
        const iconDni = window.AppIcons ? window.AppIcons.padron(16, '#1A73E8') : '🪪';
        const iconSearch = window.AppIcons ? window.AppIcons.search(14, '#FFFFFF') : '🔍';
        const iconRefresh = window.AppIcons ? window.AppIcons.refresh(14, '#5F6368') : '🔄';
        const iconUser = window.AppIcons ? window.AppIcons.users(16, '#1f4e79') : '👤';
        const iconPill = window.AppIcons ? window.AppIcons.pill(16, '#9a3412') : '💊';
        const iconClipboard = window.AppIcons ? window.AppIcons.clipboardCheck(14, '#1E8E3E') : '📋';
        const iconSteth2 = window.AppIcons ? window.AppIcons.stethoscope(16, '#15803d') : '🩺';
        const iconLab = window.AppIcons ? window.AppIcons.lab(16, '#1e40af') : '🧪';
        const iconPulse = window.AppIcons ? window.AppIcons.heartPulse(16, '#1A73E8') : '⚡';
        const iconAlert = window.AppIcons ? window.AppIcons.alertTriangle(14, '#D93025') : '⚠️';
        const iconSave = window.AppIcons ? window.AppIcons.checkCircle(16, '#FFFFFF') : '💾';

        modal.innerHTML = `
          <div class="reg-modal-box">
            <!-- 1. Cabecera -->
            <div class="reg-modal-header">
              <div class="reg-header-left">
                <div class="reg-header-icon">${iconSteth}</div>
                <div>
                  <h2 class="reg-title">REGISTRO CLÍNICO Y ATENCIÓN EN LÍNEA</h2>
                  <div class="reg-subtitle">Padrón Estandarizado · Huarmey (Cálculos Clínicos Automáticos)</div>
                </div>
              </div>
              <div class="reg-header-right">
                <span id="reg-patient-badge" class="reg-semaforo-pill reg-sem-gris">Nuevo Registro</span>
                <button type="button" class="btn-close-accessible" id="reg-btn-cerrar" title="Cerrar modal">✕</button>
              </div>
            </div>

            <!-- 2. Cuerpo en Dos Columnas -->
            <div class="reg-modal-body">
              
              <!-- Columna Izquierda: Formulario Asistido -->
              <div class="reg-form-container" id="reg-form-container">
                
                <!-- Buscador Principal por DNI -->
                <div class="reg-dni-search-card">
                  <div class="reg-dni-row">
                    <label class="reg-dni-label" for="reg-input-dni">
                      <span>${iconDni}</span> DNI del Paciente:
                    </label>
                    <div class="reg-dni-input-wrap">
                      <input type="text" id="reg-input-dni" class="reg-dni-input" placeholder="8 dígitos numéricos" maxlength="8" autocomplete="off" autofocus>
                      <button type="button" id="reg-btn-buscar-dni" class="reg-dni-btn-search">
                        ${iconSearch} Buscar
                      </button>
                      <button type="button" id="reg-btn-limpiar" class="reg-btn-cancel" style="display:none;" title="Limpiar formulario para otro paciente">
                        ${iconRefresh} Limpiar
                      </button>
                    </div>
                  </div>
                  <div id="reg-dni-status-alert" style="display:none;"></div>
                </div>

                <!-- FORMULARIO DE CAMPOS -->
                <form id="reg-form-datos" autocomplete="off">
                  
                  <!-- BLOQUE A & B: FILIACIÓN Y DOMICILIO -->
                  <div class="reg-section" id="reg-sec-filiacion">
                    <div class="reg-section-header" style="background:#dce9f8; color:#1f4e79;">
                      <span>${iconUser} I. Filiación y Ubicación del Paciente</span>
                      <small id="reg-filiacion-toggle-text">▼ Expandir / Colapsar</small>
                    </div>
                    <div class="reg-section-body" id="reg-sec-filiacion-body">
                      <div class="reg-field">
                        <label class="reg-label">Tipo de documento <span class="req">*</span></label>
                        <select id="reg-tipo-documento" class="reg-select">
                          <option value="DNI" selected>DNI</option>
                          <option value="Carné de extranjería">Carné de extranjería</option>
                          <option value="Pasaporte">Pasaporte</option>
                          <option value="Sin documento">Sin documento</option>
                        </select>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Historia Clínica / Carpeta</label>
                        <input type="text" id="reg-historia-clinica" class="reg-input" placeholder="Ej: HC-1045">
                      </div>

                      <div class="reg-field col-span-2">
                        <label class="reg-label">Apellidos y Nombres <span class="req">*</span></label>
                        <input type="text" id="reg-apellidos-nombres" class="reg-input" placeholder="APELLIDOS Y NOMBRES COMPLETOS" required>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Sexo <span class="req">*</span></label>
                        <select id="reg-sexo" class="reg-select">
                          <option value="Femenino" selected>Femenino</option>
                          <option value="Masculino">Masculino</option>
                        </select>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Fecha de nacimiento <span class="req">*</span></label>
                        <input type="date" id="reg-fecha-nacimiento" class="reg-input" required>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Seguro de salud <span class="req">*</span></label>
                        <select id="reg-seguro-salud" class="reg-select">
                          <option value="SIS" selected>SIS</option>
                          <option value="EsSalud">EsSalud</option>
                          <option value="Otro seguro">Otro seguro</option>
                          <option value="Sin seguro">Sin seguro</option>
                        </select>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Teléfono o celular</label>
                        <input type="text" id="reg-telefono" class="reg-input" placeholder="9XXXXXXXX" maxlength="9">
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Sector Sanitario <span class="req">*</span></label>
                        <select id="reg-sector" class="reg-select">
                          <option value="Sector I – Centro" selected>Sector I – Centro</option>
                          <option value="Sector II – La Victoria">Sector II – La Victoria</option>
                          <option value="Sector III – Santo Domingo">Sector III – Santo Domingo</option>
                          <option value="Sector IV – Buenos Aires">Sector IV – Buenos Aires</option>
                          <option value="Santo Domingo Ampliación – Miramar">Santo Domingo Ampliación – Miramar</option>
                          <option value="Puerto Huarmey">Puerto Huarmey</option>
                          <option value="Huamba">Huamba</option>
                          <option value="Lecheral">Lecheral</option>
                          <option value="Congón – San Isidro">Congón – San Isidro</option>
                          <option value="Culebras">Culebras</option>
                          <option value="Huayán">Huayán</option>
                          <option value="Malvas">Malvas</option>
                          <option value="Cochapetí">Cochapetí</option>
                          <option value="Otro distrito (se anota cuál en la dirección)">Otro distrito</option>
                        </select>
                      </div>

                      <div class="reg-field col-span-2">
                        <label class="reg-label">Dirección y Referencia <span class="req">*</span></label>
                        <input type="text" id="reg-direccion" class="reg-input" placeholder="Jr., Calle, Av. y N.º en Huarmey (para georreferenciación)" required>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">EESS Adscripción <span class="req">*</span></label>
                        <select id="reg-eess-adscripcion" class="reg-select">
                          <option value="Hospital de Apoyo Huarmey (00001741, II-1)" selected>Hospital de Apoyo Huarmey (II-1)</option>
                          <option value="C. S. La Victoria (00001744, I-3)">C. S. La Victoria (I-3)</option>
                          <option value="P. S. Puerto Huarmey (00001742, I-2)">P. S. Puerto Huarmey (I-2)</option>
                          <option value="P. S. Huamba (00001751, I-1)">P. S. Huamba (I-1)</option>
                        </select>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">EESS que lo controla hoy <span class="req">*</span></label>
                        <select id="reg-eess-control" class="reg-select">
                          <option value="Hospital de Apoyo Huarmey (00001741, II-1)" selected>Hospital de Apoyo Huarmey (II-1)</option>
                          <option value="C. S. La Victoria (00001744, I-3)">C. S. La Victoria (I-3)</option>
                          <option value="P. S. Puerto Huarmey (00001742, I-2)">P. S. Puerto Huarmey (I-2)</option>
                          <option value="P. S. Huamba (00001751, I-1)">P. S. Huamba (I-1)</option>
                          <option value="Fuera del distrito (se anota cuál en Observaciones)">Fuera del distrito</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <!-- BLOQUE C & E: DIAGNÓSTICO Y MEDICACIÓN PRECARGADA -->
                  <div class="reg-section" id="reg-sec-tratamiento">
                    <div class="reg-section-header" style="background:#fbe6d4; color:#9a3412;">
                      <span>${iconPill} II. Diagnósticos y Medicación Habitual</span>
                      <small>Verificar o ajustar receta</small>
                    </div>
                    <div class="reg-section-body">
                      
                      <!-- Banner de Medicación Precargada -->
                      <div class="reg-med-precarga-box" id="reg-med-alert-box" style="display:none;">
                        <div>
                          <strong>${iconClipboard} Medicación Previa Precargada:</strong>
                          <span id="reg-med-alert-text">Cargando tratamiento anterior...</span>
                        </div>
                        <span style="font-size:11px; color:#6d28d9;">(Modifique solo si el médico cambió la receta hoy)</span>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Hipertensión (CIE-10)</label>
                        <input type="text" id="reg-cie10-hta" class="reg-input" placeholder="I10 – Hipertensión esencial">
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Diabetes Mellitus (CIE-10)</label>
                        <input type="text" id="reg-cie10-dm" class="reg-input" placeholder="E11 – Diabetes mellitus tipo 2">
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Dislipidemia (CIE-10)</label>
                        <input type="text" id="reg-cie10-dislipidemia" class="reg-input" placeholder="E78 – Dislipidemia">
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">ERC (CIE-10)</label>
                        <input type="text" id="reg-cie10-erc" class="reg-input" placeholder="N18 – Enfermedad renal crónica">
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Dx Confirmado</label>
                        <select id="reg-dx-confirmado" class="reg-select">
                          <option value="Sí" selected>Sí</option>
                          <option value="En estudio">En estudio</option>
                        </select>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Enfermedad Cardiovascular Previa</label>
                        <select id="reg-enfermedad-cv" class="reg-select">
                          <option value="No" selected>No</option>
                          <option value="Sí (infarto, angina, ACV, arteriopatía periférica)">Sí (infarto, angina, ACV...)</option>
                        </select>
                      </div>

                      <div class="reg-field col-span-2">
                        <label class="reg-label">Tratamiento HTA (Fármaco y Dosis)</label>
                        <input type="text" id="reg-tratamiento-hta" class="reg-input" placeholder="Ej: Losartán 50 mg c/12h + Amlodipino 5 mg c/24h">
                      </div>

                      <div class="reg-field col-span-2">
                        <label class="reg-label">Tratamiento Diabetes (Fármaco y Dosis)</label>
                        <input type="text" id="reg-tratamiento-dm" class="reg-input" placeholder="Ej: Metformina 850 mg c/12h / Insulina NPH">
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Estatina (Atorvastatina/Simvastatina)</label>
                        <select id="reg-estatina" class="reg-select">
                          <option value="No" selected>No</option>
                          <option value="Sí">Sí</option>
                        </select>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Ácido acetilsalicílico (AAS 100 mg)</label>
                        <select id="reg-aspirina" class="reg-select">
                          <option value="No indicado" selected>No indicado</option>
                          <option value="Sí">Sí</option>
                          <option value="No">No</option>
                        </select>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Meses de medicación entregados</label>
                        <select id="reg-meses-medicacion" class="reg-select">
                          <option value="1" selected>1 mes</option>
                          <option value="2">2 meses</option>
                          <option value="3">3 meses</option>
                        </select>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Riesgo CV según Tablas OMS (%)</label>
                        <input type="number" id="reg-riesgo-cv-porcentaje" class="reg-input" placeholder="Ej: 8.5" min="0" max="100" step="0.1">
                      </div>
                    </div>
                  </div>

                  <!-- BLOQUE G, F & J: ATENCIÓN DE HOY Y CONTROLES (DESTACADO) -->
                  <div class="reg-section highlight-today" id="reg-sec-atencion-hoy">
                    <div class="reg-section-header">
                      <span>${iconSteth2} III. Controles Clínicos de esta Atención (Hoy)</span>
                      <span style="font-size:11.5px; font-weight:800; background:#16a34a; color:#ffffff; padding:2px 8px; border-radius:4px;">★ Sección Activa</span>
                    </div>
                    <div class="reg-section-body">
                      
                      <div class="reg-field">
                        <label class="reg-label">Fecha de este control <span class="req">*</span></label>
                        <input type="date" id="reg-fecha-atencion" class="reg-input" required>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Mes a registrar en el Padrón <span class="req">*</span></label>
                        <select id="reg-mes-control" class="reg-select">
                          ${mesesOptions}
                        </select>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Presión Sistólica (PAS) mmHg <span class="req">*</span></label>
                        <input type="number" id="reg-pas-hoy" class="reg-input" placeholder="70 – 260" min="70" max="260" style="font-size:15px; font-weight:800; color:#0f172a;" required>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Presión Diastólica (PAD) mmHg <span class="req">*</span></label>
                        <input type="number" id="reg-pad-hoy" class="reg-input" placeholder="40 – 150" min="40" max="150" style="font-size:15px; font-weight:800; color:#0f172a;" required>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Peso (kg)</label>
                        <input type="number" id="reg-peso" class="reg-input" placeholder="Ej: 72.5" min="25" max="250" step="0.1">
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Talla (metros)</label>
                        <input type="number" id="reg-talla" class="reg-input" placeholder="Ej: 1.65" min="1.20" max="2.10" step="0.01">
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Perímetro Abdominal (cm)</label>
                        <input type="number" id="reg-perimetro-abd" class="reg-input" placeholder="Ej: 88" min="50" max="200">
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Próxima cita programada <span class="req">*</span></label>
                        <input type="date" id="reg-proxima-cita" class="reg-input" required>
                      </div>

                      <div class="reg-field col-span-2">
                        <label class="reg-label">Observaciones clínicas de la consulta</label>
                        <input type="text" id="reg-observaciones" class="reg-input" placeholder="Anotaciones de la atención...">
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Estado del Paciente</label>
                        <select id="reg-estado-paciente" class="reg-select">
                          <option value="Activo" selected>Activo</option>
                          <option value="Cambió de residencia">Cambió de residencia</option>
                          <option value="Abandono (solo después de intentar contactarlo)">Abandono</option>
                          <option value="Fallecido">Fallecido</option>
                        </select>
                      </div>

                      <div class="reg-field" id="reg-field-consentimiento">
                        <label class="reg-label" for="reg-consentimiento">Consentimiento para recordatorios por WhatsApp (se pregunta una sola vez)</label>
                        <select id="reg-consentimiento" class="reg-select">
                          <option value="" selected disabled>Seleccione…</option>
                          <option value="Sí, firmado">Sí, firmado</option>
                          <option value="No">No</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <!-- BLOQUE H & I: LABORATORIO Y TAMIZAJES (OPCIONAL) -->
                  <div class="reg-section" id="reg-sec-laboratorio">
                    <div class="reg-section-header" style="background:#dce4f5; color:#1e40af;">
                      <span>${iconLab} IV. Laboratorio y Tamizajes Recientes (Opcional)</span>
                      <small>Registrar si trae examen</small>
                    </div>
                    <div class="reg-section-body">
                      <div class="reg-field">
                        <label class="reg-label">HbA1c (%)</label>
                        <input type="number" id="reg-hba1c" class="reg-input" placeholder="3.0 – 20.0" min="3.0" max="20.0" step="0.1">
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Fecha HbA1c</label>
                        <input type="date" id="reg-fecha-hba1c" class="reg-input">
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Glucosa en ayunas (mg/dl)</label>
                        <input type="number" id="reg-glucosa" class="reg-input" placeholder="20 – 800" min="20" max="800">
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Fecha Glucosa</label>
                        <input type="date" id="reg-fecha-glucosa" class="reg-input">
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Creatinina sérica (mg/dl)</label>
                        <input type="number" id="reg-creatinina" class="reg-input" placeholder="0.2 – 20.0" min="0.2" max="20.0" step="0.01">
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Fecha Creatinina</label>
                        <input type="date" id="reg-fecha-creatinina" class="reg-input">
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Albuminuria / RAC</label>
                        <select id="reg-albuminuria" class="reg-select">
                          <option value="" selected>-- Sin dato --</option>
                          <option value="Menor de 30 mg/g (A1)">Menor de 30 mg/g (A1 - Normal)</option>
                          <option value="30 a 300 mg/g (A2)">30 a 300 mg/g (A2 - Moderada)</option>
                          <option value="Mayor de 300 mg/g (A3)">Mayor de 300 mg/g (A3 - Severa)</option>
                        </select>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Colesterol Total (mg/dl)</label>
                        <input type="number" id="reg-colesterol-total" class="reg-input" placeholder="50 – 600" min="50" max="600">
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Colesterol LDL (mg/dl)</label>
                        <input type="number" id="reg-colesterol-ldl" class="reg-input" placeholder="10 – 500" min="10" max="500">
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Fecha Evaluación de Pie</label>
                        <input type="date" id="reg-fecha-eval-pie" class="reg-input">
                      </div>
                    </div>
                  </div>

                </form>
              </div>

              <!-- Columna Derecha: Tarjeta Clínica Viva (Resultados Automáticos en Tiempo Real) -->
              <div class="reg-sidebar-container">
                <div class="reg-live-panel">
                  
                  <div class="reg-live-title">
                    <span>${iconPulse} Resultados Clínicos Automáticos (22)</span>
                  </div>

                  <!-- Semáforo HEARTS y Próxima Cita -->
                  <div class="reg-live-metric-card" id="card-semaforo-live">
                    <div class="metric-header">
                      <span>Semáforo HEARTS</span>
                      <span id="live-semaforo-pill" class="reg-semaforo-pill reg-sem-gris">Sin Cita</span>
                    </div>
                    <div class="metric-value" id="live-estado-cita">Programe la próxima cita</div>
                    <div class="metric-sub" id="live-dias-atraso">Días de atraso: 0</div>
                  </div>

                  <!-- Antropometría: IMC y Nutrición -->
                  <div class="reg-live-metric-card">
                    <div class="metric-header">
                      <span>Antropometría</span>
                      <span>X2 · X3</span>
                    </div>
                    <div class="metric-value" id="live-imc">— kg/m²</div>
                    <div class="metric-sub" id="live-nutricion">Ingrese peso y talla</div>
                  </div>

                  <!-- Presión Arterial: Meta y Control -->
                  <div class="reg-live-metric-card">
                    <div class="metric-header">
                      <span>Control de Presión Arterial</span>
                      <span id="live-pa-meta-badge" style="font-weight:800; color:#64748b;">—</span>
                    </div>
                    <div class="metric-value" id="live-pa-ultima">— / — mmHg</div>
                    <div class="metric-sub" id="live-meta-presion">Meta: < 140/90 mmHg</div>
                    <div class="metric-sub" id="live-controlado-estable" style="margin-top:2px;">Controlado y estable: —</div>
                  </div>

                  <!-- Función Renal: TFGe CKD-EPI 2021 -->
                  <div class="reg-live-metric-card">
                    <div class="metric-header">
                      <span>Función Renal (CKD-EPI)</span>
                      <span>X13 · X14</span>
                    </div>
                    <div class="metric-value" id="live-tfge">— ml/min/1.73m²</div>
                    <div class="metric-sub" id="live-estadio-erc">Estadio ERC: Sin creatinina</div>
                  </div>

                  <!-- Metabolismo: HbA1c y LDL en meta -->
                  <div class="reg-live-metric-card">
                    <div class="metric-header">
                      <span>Metabolismo & Lípidos</span>
                      <span>X12 · X15</span>
                    </div>
                    <div class="metric-sub" id="live-hba1c-meta">HbA1c en meta: —</div>
                    <div class="metric-sub" id="live-ldl-meta">Colesterol LDL en meta: —</div>
                  </div>

                  <!-- Qué le falta al paciente -->
                  <div class="reg-faltantes-box">
                    <div class="reg-faltantes-title">
                      <span>${iconAlert} Qué le falta al paciente:</span>
                    </div>
                    <div class="reg-faltantes-text" id="live-que-le-falta">
                      Ingrese los datos de la atención para evaluar tamizajes pendientes.
                    </div>
                  </div>

                </div>

                <!-- Footer de Acciones -->
                <div class="reg-sidebar-footer">
                  <button type="button" class="reg-btn-save" id="reg-btn-guardar">
                    <span>${iconSave}</span> Guardar Atención en Padrón
                  </button>
                  <button type="button" class="reg-btn-cancel" id="reg-btn-cancelar">
                    Cancelar
                  </button>
                </div>
              </div>

            </div>
          </div>
        `;
        document.body.appendChild(modal);
      }

      // Referencias DOM
      this.dom = {
        modal,
        btnCerrar: document.getElementById('reg-btn-cerrar'),
        btnCancelar: document.getElementById('reg-btn-cancelar'),
        btnGuardar: document.getElementById('reg-btn-guardar'),
        btnBuscarDni: document.getElementById('reg-btn-buscar-dni'),
        btnLimpiar: document.getElementById('reg-btn-limpiar'),
        inputDni: document.getElementById('reg-input-dni'),
        statusAlert: document.getElementById('reg-dni-status-alert'),
        patientBadge: document.getElementById('reg-patient-badge'),
        form: document.getElementById('reg-form-datos'),

        // Bloque A & B
        tipoDoc: document.getElementById('reg-tipo-documento'),
        hc: document.getElementById('reg-historia-clinica'),
        nombres: document.getElementById('reg-apellidos-nombres'),
        sexo: document.getElementById('reg-sexo'),
        fechaNac: document.getElementById('reg-fecha-nacimiento'),
        seguro: document.getElementById('reg-seguro-salud'),
        telefono: document.getElementById('reg-telefono'),
        sector: document.getElementById('reg-sector'),
        direccion: document.getElementById('reg-direccion'),
        eessAds: document.getElementById('reg-eess-adscripcion'),
        eessCtrl: document.getElementById('reg-eess-control'),

        // Bloque C & E
        medAlertBox: document.getElementById('reg-med-alert-box'),
        medAlertText: document.getElementById('reg-med-alert-text'),
        cie10Hta: document.getElementById('reg-cie10-hta'),
        cie10Dm: document.getElementById('reg-cie10-dm'),
        cie10Dislip: document.getElementById('reg-cie10-dislipidemia'),
        cie10Erc: document.getElementById('reg-cie10-erc'),
        dxConfirmado: document.getElementById('reg-dx-confirmado'),
        ecv: document.getElementById('reg-enfermedad-cv'),
        tratamientoHta: document.getElementById('reg-tratamiento-hta'),
        tratamientoDm: document.getElementById('reg-tratamiento-dm'),
        estatina: document.getElementById('reg-estatina'),
        aspirina: document.getElementById('reg-aspirina'),
        mesesMed: document.getElementById('reg-meses-medicacion'),
        riesgoCvPorc: document.getElementById('reg-riesgo-cv-porcentaje'),

        // Bloque G, F & J (Atención de Hoy)
        fechaAtencion: document.getElementById('reg-fecha-atencion'),
        mesControl: document.getElementById('reg-mes-control'),
        pasHoy: document.getElementById('reg-pas-hoy'),
        padHoy: document.getElementById('reg-pad-hoy'),
        peso: document.getElementById('reg-peso'),
        talla: document.getElementById('reg-talla'),
        perimetroAbd: document.getElementById('reg-perimetro-abd'),
        proximaCita: document.getElementById('reg-proxima-cita'),
        observaciones: document.getElementById('reg-observaciones'),
        estadoPaciente: document.getElementById('reg-estado-paciente'),
        consentimiento: document.getElementById('reg-consentimiento'),

        // Bloque H & I
        hba1c: document.getElementById('reg-hba1c'),
        fechaHba1c: document.getElementById('reg-fecha-hba1c'),
        glucosa: document.getElementById('reg-glucosa'),
        fechaGlucosa: document.getElementById('reg-fecha-glucosa'),
        creatinina: document.getElementById('reg-creatinina'),
        fechaCreatinina: document.getElementById('reg-fecha-creatinina'),
        albuminuria: document.getElementById('reg-albuminuria'),
        colesterolTotal: document.getElementById('reg-colesterol-total'),
        colesterolLdl: document.getElementById('reg-colesterol-ldl'),
        fechaEvalPie: document.getElementById('reg-fecha-eval-pie'),

        // Tarjeta Clínica Viva (Outputs)
        liveSemaforoPill: document.getElementById('live-semaforo-pill'),
        liveEstadoCita: document.getElementById('live-estado-cita'),
        liveDiasAtraso: document.getElementById('live-dias-atraso'),
        liveImc: document.getElementById('live-imc'),
        liveNutricion: document.getElementById('live-nutricion'),
        livePaMetaBadge: document.getElementById('live-pa-meta-badge'),
        livePaUltima: document.getElementById('live-pa-ultima'),
        liveMetaPresion: document.getElementById('live-meta-presion'),
        liveControladoEstable: document.getElementById('live-controlado-estable'),
        liveTfge: document.getElementById('live-tfge'),
        liveEstadioErc: document.getElementById('live-estadio-erc'),
        liveHba1cMeta: document.getElementById('live-hba1c-meta'),
        liveLdlMeta: document.getElementById('live-ldl-meta'),
        liveQueLeFalta: document.getElementById('live-que-le-falta')
      };
    }

    attachEvents() {
      this.dom.btnCerrar.addEventListener('click', () => this.close());
      this.dom.btnCancelar.addEventListener('click', () => this.close());

      // Búsqueda automática por DNI al escribir 8 dígitos o presionar Enter
      this.dom.inputDni.addEventListener('input', (e) => {
        const val = e.target.value.replace(/\D/g, '');
        e.target.value = val;
        if (val.length === 8) {
          this.buscarPacientePorDni(val);
        }
      });

      this.dom.inputDni.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.buscarPacientePorDni(this.dom.inputDni.value.trim());
        }
      });

      this.dom.btnBuscarDni.addEventListener('click', () => {
        this.buscarPacientePorDni(this.dom.inputDni.value.trim());
      });

      this.dom.btnLimpiar.addEventListener('click', () => {
        this.resetForm();
      });

      // Recalcular en vivo en cada cambio de campo
      this.dom.form.addEventListener('input', () => this.recalcularEnVivo());
      this.dom.form.addEventListener('change', () => this.recalcularEnVivo());

      // Guardar
      this.dom.btnGuardar.addEventListener('click', () => this.commitSave());

      // Atajo Escape para cerrar
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.dom.modal.classList.contains('active')) {
          this.close();
        }
      });
    }

    open(prefillDni = null) {
      this.init();
      this.resetForm();
      this.dom.modal.classList.add('active');

      // Preseleccionar fecha de hoy y mes actual
      const hoy = new Date();
      const hoyStr = window.FechaLima.hoy();
      this.dom.fechaAtencion.value = hoyStr;
      const mesIdx = hoy.getMonth();
      this.dom.mesControl.value = MESES_CODIGOS[mesIdx];

      // Próxima cita por defecto (en 30 días)
      const prox = new Date();
      prox.setDate(prox.getDate() + 30);
      this.dom.proximaCita.value = prox.toISOString().split('T')[0];

      if (prefillDni) {
        this.dom.inputDni.value = String(prefillDni).replace(/\D/g, '');
        this.buscarPacientePorDni(this.dom.inputDni.value);
      } else {
        setTimeout(() => this.dom.inputDni.focus(), 150);
      }

      this.recalcularEnVivo();
    }

    close() {
      if (this.dom.modal) {
        this.dom.modal.classList.remove('active');
      }
    }

    resetForm() {
      this.currentPatient = null;
      this.isExistingPatient = false;
      this.dom.form.reset();
      this.dom.inputDni.value = '';
      this.dom.statusAlert.style.display = 'none';
      this.dom.statusAlert.className = '';
      this.dom.statusAlert.innerHTML = '';
      this.dom.btnLimpiar.style.display = 'none';
      this.dom.medAlertBox.style.display = 'none';
      this.dom.patientBadge.className = 'reg-semaforo-pill reg-sem-gris';
      this.dom.patientBadge.textContent = 'Nuevo Registro';

      // Valores por defecto
      this.dom.tipoDoc.value = 'DNI';
      this.dom.sexo.value = 'Femenino';
      this.dom.seguro.value = 'SIS';
      this.dom.sector.value = 'Sector I – Centro';
      this.dom.eessAds.value = 'Hospital de Apoyo Huarmey (00001741, II-1)';
      this.dom.eessCtrl.value = 'Hospital de Apoyo Huarmey (00001741, II-1)';
      this.dom.dxConfirmado.value = 'Sí';
      this.dom.ecv.value = 'No';
      this.dom.estatina.value = 'No';
      this.dom.aspirina.value = 'No indicado';
      this.dom.mesesMed.value = '1';
      this.dom.estadoPaciente.value = 'Activo';
      this.dom.consentimiento.value = '';
      this.mostrarCampoConsentimiento(true);

      const hoy = new Date();
      this.dom.fechaAtencion.value = window.FechaLima.hoy();
      this.dom.mesControl.value = MESES_CODIGOS[hoy.getMonth()];

      const prox = new Date();
      prox.setDate(prox.getDate() + 30);
      this.dom.proximaCita.value = prox.toISOString().split('T')[0];

      this.dom.inputDni.focus();
    }

    /**
     * Búsqueda por DNI y Precarga Inteligente de Paciente Existente
     */
    buscarPacientePorDni(dni) {
      if (!dni || dni.length !== 8) {
        this.dom.statusAlert.style.display = 'block';
        this.dom.statusAlert.className = 'reg-dni-status-alert reg-alert-warn';
        this.dom.statusAlert.innerHTML = '⚠️ Ingrese un DNI válido de 8 dígitos numéricos.';
        return;
      }

      // 1. Buscar en la memoria de la aplicación
      const allPatients = (window.app && Array.isArray(window.app.patients)) ? window.app.patients : [];
      let found = allPatients.find(p => String(p.dni || p.nro_documento || '').replace(/\D/g, '') === dni);

      // Si no está en array directo, buscar por id
      if (!found && window.app && typeof window.app.findPatient === 'function') {
        found = window.app.findPatient(dni);
      }

      if (found) {
        this.cargarDatosPacienteExistente(found);
      } else {
        // Paciente Nuevo
        this.isExistingPatient = false;
        this.currentPatient = null;
        this.dom.btnLimpiar.style.display = 'inline-block';
        this.dom.statusAlert.style.display = 'block';
        this.dom.statusAlert.className = 'reg-dni-status-alert reg-alert-new';
        this.dom.statusAlert.innerHTML = `
          <span>🆕</span>
          <div>
            <strong>Paciente Nuevo:</strong> No registra atenciones previas con el DNI <strong>${esc(dni)}</strong>.
            Complete la filiación y los datos de su primera consulta.
          </div>
        `;
        this.dom.patientBadge.className = 'reg-semaforo-pill reg-sem-amarillo';
        this.dom.patientBadge.textContent = 'Paciente Nuevo';
        this.dom.medAlertBox.style.display = 'none';

        // Enfocar nombres
        setTimeout(() => this.dom.nombres.focus(), 100);
      }

      this.recalcularEnVivo();
    }

    /**
     * Precarga todos los datos comunes de filiación, dirección, diagnósticos y MEDICACIÓN
     */
    /** El consentimiento se pregunta una sola vez: si el paciente ya lo tiene registrado, el campo se oculta. */
    mostrarCampoConsentimiento(visible) {
      const campo = document.getElementById('reg-field-consentimiento');
      if (campo) campo.style.display = visible ? '' : 'none';
    }

    cargarDatosPacienteExistente(p) {
      this.isExistingPatient = true;
      this.currentPatient = p;
      const yaRegistrado = p.consentimiento === 'Sí, firmado' || p.consentimiento === 'No';
      this.dom.consentimiento.value = yaRegistrado ? p.consentimiento : '';
      this.mostrarCampoConsentimiento(!yaRegistrado);
      this.dom.btnLimpiar.style.display = 'inline-block';

      // 1. Mensaje de Alerta Positiva
      const nombreCompleto = p.apellidos_nombres || `${p.nombres || ''} ${p.apellidos || ''}`.trim() || 'Paciente';
      this.dom.statusAlert.style.display = 'block';
      this.dom.statusAlert.className = 'reg-dni-status-alert reg-alert-found';
      this.dom.statusAlert.innerHTML = `
        <span style="font-size:18px;">🎉</span>
        <div>
          <strong>Paciente Encontrado:</strong> <strong>${esc(nombreCompleto)}</strong> (DNI: ${esc(p.dni || p.nro_documento || '')})<br>
          <small>✓ Filiación, domicilio y medicación habitual precargados. Ingrese los controles de la atención de hoy.</small>
        </div>
      `;

      this.dom.patientBadge.className = 'reg-semaforo-pill reg-sem-verde';
      this.dom.patientBadge.textContent = 'En Padrón';

      // 2. Precargar Filiación y Ubicación
      this.dom.tipoDoc.value = p.tipo_documento || 'DNI';
      this.dom.hc.value = p.historia_clinica || '';
      this.dom.nombres.value = nombreCompleto;
      this.dom.sexo.value = p.sexo || 'Femenino';
      this.dom.fechaNac.value = p.fecha_nacimiento || '';
      this.dom.seguro.value = p.seguro_salud || p.seguro || 'SIS';
      this.dom.telefono.value = p.telefono || '';
      this.dom.sector.value = p.sector || p.sector_sanitario || 'Sector I – Centro';
      this.dom.direccion.value = p.direccion || 'Huarmey';
      this.dom.eessAds.value = p.establecimiento_adscripcion || 'Hospital de Apoyo Huarmey (00001741, II-1)';
      this.dom.eessCtrl.value = p.establecimiento_control || p.puerta_entrada || 'Hospital de Apoyo Huarmey (00001741, II-1)';

      // 3. Precargar Diagnósticos
      this.dom.cie10Hta.value = p.cie10_hta || '';
      this.dom.cie10Dm.value = p.cie10_dm || '';
      this.dom.cie10Dislip.value = p.cie10_dislipidemia || '';
      this.dom.cie10Erc.value = p.cie10_erc || '';
      this.dom.dxConfirmado.value = p.dx_confirmado || 'Sí';
      this.dom.ecv.value = p.enfermedad_cardiovascular || 'No';

      // Si tiene conditions en formato FHIR, extraer códigos
      if (Array.isArray(p.conditions)) {
        p.conditions.forEach(c => {
          const cod = String(c.cie10_cod || '');
          if (cod.startsWith('I10') || cod.startsWith('I1')) this.dom.cie10Hta.value = `${cod} – Hipertensión`;
          if (cod.startsWith('E11') || cod.startsWith('E1')) this.dom.cie10Dm.value = `${cod} – Diabetes`;
          if (cod.startsWith('E78')) this.dom.cie10Dislip.value = `${cod} – Dislipidemia`;
          if (cod.startsWith('N18')) this.dom.cie10Erc.value = `${cod} – ERC`;
        });
      }

      // 4. PRECARGA DE MEDICACIÓN ANTERIOR (Lista para verificar y ajustar si cambia)
      const medHta = p.tratamiento_hta || '';
      const medDm = p.tratamiento_dm || '';
      const estatinaVal = p.estatina || 'No';
      const aspirinaVal = p.aspirina_aas || 'No indicado';
      const mesesVal = p.meses_medicacion || '1';

      this.dom.tratamientoHta.value = medHta;
      this.dom.tratamientoDm.value = medDm;
      this.dom.estatina.value = estatinaVal;
      this.dom.aspirina.value = aspirinaVal;
      this.dom.mesesMed.value = mesesVal;
      this.dom.riesgoCvPorc.value = p.riesgo_cv_porcentaje || '';

      const resumenMed = [
        medHta ? `HTA: ${medHta}` : null,
        medDm ? `DM: ${medDm}` : null,
        estatinaVal === 'Sí' ? 'Estatina' : null,
        aspirinaVal === 'Sí' ? 'AAS 100mg' : null
      ].filter(Boolean).join(' · ') || 'Sin medicación registrada previamente';

      this.dom.medAlertBox.style.display = 'flex';
      this.dom.medAlertText.textContent = resumenMed;

      // 5. Historial de Últimos Signos Vitales
      if (Array.isArray(p.observations) && p.observations.length > 0) {
        const ultObs = p.observations[0];
        if (ultObs.pa_sistolica) this.dom.pasHoy.value = ultObs.pa_sistolica;
        if (ultObs.pa_diastolica) this.dom.padHoy.value = ultObs.pa_diastolica;
        if (ultObs.hba1c) this.dom.hba1c.value = ultObs.hba1c;
        if (ultObs.glucosa) this.dom.glucosa.value = ultObs.glucosa;
      }

      if (p.peso) this.dom.peso.value = p.peso;
      if (p.talla) this.dom.talla.value = p.talla;
      if (p.perimetro_abdominal) this.dom.perimetroAbd.value = p.perimetro_abdominal;
      if (p.creatinina) this.dom.creatinina.value = p.creatinina;
      if (p.colesterol_ldl) this.dom.colesterolLdl.value = p.colesterol_ldl;

      // 6. ENFOCAR DIRECTAMENTE LA ATENCIÓN DE HOY
      const secHoy = document.getElementById('reg-sec-atencion-hoy');
      if (secHoy) {
        secHoy.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => this.dom.pasHoy.focus(), 250);
      }
    }

    /**
     * Lee todos los campos del formulario como objeto plano
     */
    getFormData() {
      const data = {
        tipo_documento: this.dom.tipoDoc.value,
        nro_documento: this.dom.inputDni.value.trim(),
        historia_clinica: this.dom.hc.value.trim(),
        apellidos_nombres: this.dom.nombres.value.trim().toUpperCase(),
        sexo: this.dom.sexo.value,
        fecha_nacimiento: this.dom.fechaNac.value,
        seguro_salud: this.dom.seguro.value,
        telefono: this.dom.telefono.value.trim(),
        sector: this.dom.sector.value,
        direccion: this.dom.direccion.value.trim(),
        establecimiento_adscripcion: this.dom.eessAds.value,
        establecimiento_control: this.dom.eessCtrl.value,

        cie10_hta: this.dom.cie10Hta.value.trim(),
        cie10_dm: this.dom.cie10Dm.value.trim(),
        cie10_dislipidemia: this.dom.cie10Dislip.value.trim(),
        cie10_erc: this.dom.cie10Erc.value.trim(),
        dx_confirmado: this.dom.dxConfirmado.value,
        enfermedad_cardiovascular: this.dom.ecv.value,

        tratamiento_hta: this.dom.tratamientoHta.value.trim(),
        tratamiento_dm: this.dom.tratamientoDm.value.trim(),
        estatina: this.dom.estatina.value,
        aspirina_aas: this.dom.aspirina.value,
        meses_medicacion: this.dom.mesesMed.value,
        riesgo_cv_porcentaje: this.dom.riesgoCvPorc.value,

        fecha_ultimo_control: this.dom.fechaAtencion.value,
        proxima_cita: this.dom.proximaCita.value,
        peso: this.dom.peso.value,
        talla: this.dom.talla.value,
        perimetro_abdominal: this.dom.perimetroAbd.value,
        observaciones: this.dom.observaciones.value.trim(),
        estado_paciente: this.dom.estadoPaciente.value,
        consentimiento: this.dom.consentimiento.value,

        hba1c: this.dom.hba1c.value,
        fecha_hba1c: this.dom.fechaHba1c.value,
        glucosa: this.dom.glucosa.value,
        fecha_glucosa: this.dom.fechaGlucosa.value,
        creatinina: this.dom.creatinina.value,
        fecha_creatinina: this.dom.fechaCreatinina.value,
        albuminuria: this.dom.albuminuria.value,
        colesterol_total: this.dom.colesterolTotal.value,
        colesterol_ldl: this.dom.colesterolLdl.value,
        fecha_evaluacion_pie: this.dom.fechaEvalPie.value
      };

      // Inyectar PAS y PAD en el mes seleccionado
      const mesCod = this.dom.mesControl.value;
      if (mesCod) {
        data[`pas_${mesCod}`] = this.dom.pasHoy.value;
        data[`pad_${mesCod}`] = this.dom.padHoy.value;
      }

      // Conservar historial previo si existía paciente
      if (this.currentPatient) {
        MESES_CODIGOS.forEach(m => {
          if (m !== mesCod && this.currentPatient[`pas_${m}`]) {
            data[`pas_${m}`] = this.currentPatient[`pas_${m}`];
          }
          if (m !== mesCod && this.currentPatient[`pad_${m}`]) {
            data[`pad_${m}`] = this.currentPatient[`pad_${m}`];
          }
        });
      }

      return data;
    }

    /**
     * Recalcula en tiempo real las 22 variables y actualiza la tarjeta lateral
     */
    recalcularEnVivo() {
      const formData = this.getFormData();
      const calc = calculadora.calcularPadron(formData);

      // 1. Semáforo HEARTS y Próxima Cita
      const semClass = `reg-sem-${calc.semaforo_hearts}`;
      this.dom.liveSemaforoPill.className = `reg-semaforo-pill ${semClass}`;
      this.dom.liveSemaforoPill.textContent = calc.semaforo_hearts.toUpperCase();
      this.dom.liveEstadoCita.textContent = calc.estado_cita;
      this.dom.liveDiasAtraso.textContent = calc.dias_atraso > 0 ? `⚠️ Atraso: ${calc.dias_atraso} días` : 'Cita al día';

      // 2. Antropometría (IMC y Nutrición)
      this.dom.liveImc.textContent = calc.imc ? `${calc.imc} kg/m²` : '— kg/m²';
      this.dom.liveNutricion.textContent = calc.valoracion_nutricional;

      // 3. Control de Presión Arterial
      if (calc.ultima_pas && calc.ultima_pad) {
        this.dom.livePaUltima.textContent = `${calc.ultima_pas} / ${calc.ultima_pad} mmHg`;
        this.dom.livePaMetaBadge.textContent = calc.pa_en_meta === 'Sí' ? '✓ EN META' : '⚠️ FUERA DE META';
        this.dom.livePaMetaBadge.style.color = calc.pa_en_meta === 'Sí' ? '#16a34a' : '#dc2626';
      } else {
        this.dom.livePaUltima.textContent = '— / — mmHg';
        this.dom.livePaMetaBadge.textContent = '—';
        this.dom.livePaMetaBadge.style.color = '#64748b';
      }
      this.dom.liveMetaPresion.textContent = `Meta: ${calc.meta_presion}`;
      this.dom.liveControladoEstable.textContent = `Controlado y estable: ${calc.controlado_estable}`;

      // 4. Función Renal (CKD-EPI)
      this.dom.liveTfge.textContent = calc.tfge ? `${calc.tfge} ml/min` : '— ml/min';
      this.dom.liveEstadioErc.textContent = calc.estadio_erc;

      // 5. Metabolismo
      this.dom.liveHba1cMeta.textContent = `HbA1c en meta: ${calc.hba1c_en_meta}`;
      this.dom.liveLdlMeta.textContent = `Colesterol LDL en meta: ${calc.ldl_en_meta}`;

      // 6. Qué le falta al paciente
      this.dom.liveQueLeFalta.textContent = calc.que_le_falta;
    }

    /**
     * Guarda la atención y sincroniza con el Padrón Estandarizado y el mapa territorial
     */
    async commitSave() {
      const dni = this.dom.inputDni.value.trim().replace(/\D/g, '');
      const nombres = this.dom.nombres.value.trim();
      const sector = this.dom.sector.value;
      const direccion = this.dom.direccion.value.trim();
      const eess = this.dom.eessCtrl.value;

      // Validaciones obligatorias
      if (dni.length !== 8) {
        alert('El DNI debe tener exactamente 8 dígitos numéricos.');
        this.dom.inputDni.focus();
        return;
      }
      if (!nombres) {
        alert('Por favor ingrese los apellidos y nombres del paciente.');
        this.dom.nombres.focus();
        return;
      }
      if (!this.dom.fechaNac.value) {
        alert('Por favor ingrese la fecha de nacimiento.');
        this.dom.fechaNac.focus();
        return;
      }
      if (!direccion) {
        alert('Por favor ingrese la dirección del paciente para su georreferenciación en Huarmey.');
        this.dom.direccion.focus();
        return;
      }
      if (!this.dom.consentimiento.value) {
        alert('Pregunte al paciente si autoriza recordatorios por WhatsApp y registre su respuesta (Sí o No). Se pregunta una sola vez.');
        this.dom.consentimiento.focus();
        return;
      }

      this.dom.btnGuardar.disabled = true;
      this.dom.btnGuardar.innerHTML = '⏳ Guardando y geolocalizando...';

      try {
        const formData = this.getFormData();
        const calc = calculadora.calcularPadron(formData);
        // Sin geocodificador no se inventa una ubicación. Con la misma dirección y una ubicación ya guardada, no se
        // vuelve a geocodificar ni se envían coordenadas: el servidor conserva las guardadas y su precisión
        // (la ubicación exacta tomada en campo por GPS o en el mapa no se pierde al registrar una atención).
        const geocoder = window.AncashGeocoder || { geocode: () => ({ lat: null, lng: null, sector: null, matched: false }), claveDireccion: t => String(t || '') };
        const previo = this.currentPatient || null;
        const mismaDireccion = !!previo && geocoder.claveDireccion(previo.direccion || '') === geocoder.claveDireccion(direccion);
        const conservarUbicacion = mismaDireccion && window.GeoUbicacion && window.GeoUbicacion.validarCoordenadas(previo.latitud, previo.longitud).ok;
        const geo = conservarUbicacion ? { matched: false } : geocoder.geocode(direccion);
        const ubicacion = conservarUbicacion
          ? {}
          : (geo.matched ? { latitud: geo.lat, longitud: geo.lng, precision_geo: geo.precision_geo, geo_fuente: 'geocodificador', geo_toponimo: geo.toponym, sector_sanitario: geo.sector || undefined } : {});

        const pas = parseInt(this.dom.pasHoy.value, 10) || null;
        const pad = parseInt(this.dom.padHoy.value, 10) || null;
        const hba1c = parseFloat(this.dom.hba1c.value) || null;
        const glucosa = parseInt(this.dom.glucosa.value, 10) || null;
        const fechaAtencion = this.dom.fechaAtencion.value || window.FechaLima.hoy();
        const fechaProxima = this.dom.proximaCita.value || null;

        // Construir objeto paciente consolidado
        const patientId = this.currentPatient?.id || `pac-00001741-${dni}`;

        const fullPatient = {
          ...formData,
          ...calc,
          id: patientId,
          dni,
          historia_clinica: formData.historia_clinica || '',
          apellidos_nombres: nombres.toUpperCase(),
          direccion,
          // «sector» es la nomenclatura local del padrón; el sector sanitario GeoRIS sale de la ubicación
          sector,
          distrito: calc.distrito_residencia,
          establecimiento_adscripcion: formData.establecimiento_adscripcion,
          puerta_entrada_id: ((/\((\d{8})\b/.exec(String(eess || '')) || [])[1]) || undefined,
          establecimiento_control: eess,
          puerta_entrada: eess,
          ...ubicacion,
          conditions: [],
          observations: (this.currentPatient?.observations ? [...this.currentPatient.observations] : []),
          appointments: (this.currentPatient?.appointments ? [...this.currentPatient.appointments] : [])
        };

        // Agregar la observación de hoy
        if (pas || pad || hba1c || glucosa) {
          fullPatient.observations.unshift({
            fecha_registro: fechaAtencion,
            pa_sistolica: pas,
            pa_diastolica: pad,
            hba1c,
            glucosa,
            estado_control: (pas >= 140 || pad >= 90) ? 'No Controlado' : 'Controlado'
          });
        }

        // Agregar la próxima cita programada
        if (fechaProxima) {
          fullPatient.appointments.unshift({
            fecha_cita: fechaProxima,
            estado: 'booked'
          });
        }

        // Diagnósticos CIE-10
        if (formData.cie10_hta) {
          fullPatient.conditions.push({ cie10_cod: formData.cie10_hta.split('–')[0].trim(), diagnostico: 'Hipertensión Arterial' });
        }
        if (formData.cie10_dm) {
          fullPatient.conditions.push({ cie10_cod: formData.cie10_dm.split('–')[0].trim(), diagnostico: 'Diabetes Mellitus Tipo 2' });
        }
        if (formData.cie10_erc) {
          fullPatient.conditions.push({ cie10_cod: formData.cie10_erc.split('–')[0].trim(), diagnostico: 'Enfermedad Renal Crónica' });
        }

        // 1. Enviar al servidor: solo se da por guardado si el servidor lo confirma
        if (!(window.app && window.app.session && window.app.session.authFetch)) {
          throw new Error('No hay una sesión activa para guardar en el servidor.');
        }
        let respuesta;
        try {
          respuesta = await window.app.session.authFetch('/api/padron/importar-lote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patients: [fullPatient] })
          });
        } catch (e) {
          throw new Error('No se pudo conectar con el servidor. La atención no se guardó.');
        }
        if (!respuesta || !respuesta.ok) {
          let motivo = 'el servidor la rechazó';
          try {
            const cuerpo = await respuesta.json();
            const d = cuerpo && cuerpo.issue && cuerpo.issue[0] && cuerpo.issue[0].diagnostics;
            if (typeof d === 'string' && d) motivo = d;
          } catch (e) { /* sin cuerpo */ }
          throw new Error(`La atención no se guardó: ${motivo} (código ${respuesta ? respuesta.status : 'sin respuesta'}).`);
        }

        // 2. Actualizar en Memoria y Mapa Territorial desde el servidor (que decide la ubicación final)
        if (window.app && typeof window.app.loadInitialData === 'function') {
          await window.app.loadInitialData();
          if (typeof window.app.showToast === 'function') {
            window.app.showToast(`🎉 ¡Atención de ${nombres} guardada y georreferenciada en el Padrón Estandarizado!`, 'success', 5000);
          }
        } else if (window.app) {
          const list = Array.isArray(window.app.patients) ? [...window.app.patients] : [];
          const idx = list.findIndex(p => String(p.dni || p.nro_documento) === dni);
          if (idx >= 0) {
            list[idx] = fullPatient;
          } else {
            list.unshift(fullPatient);
          }

          window.app.setPatients(list);
          window.app.render();

          if (typeof window.app.showToast === 'function') {
            window.app.showToast(`🎉 ¡Atención de ${nombres} guardada y georreferenciada en el Padrón Estandarizado!`, 'success', 5000);
          }
        }

        alert(`✅ ¡Atención de ${nombres} guardada con éxito en el Padrón Estandarizado!`);
        this.close();

      } catch (err) {
        alert('Error al guardar la atención: ' + err.message);
      } finally {
        this.dom.btnGuardar.disabled = false;
        const iconSave = window.AppIcons ? window.AppIcons.checkCircle(16, '#FFFFFF') : '';
        this.dom.btnGuardar.innerHTML = `<span>${iconSave}</span> Guardar Atención en Padrón`;
      }
    }
  }

  return new RegistroClinicoModal();
});
