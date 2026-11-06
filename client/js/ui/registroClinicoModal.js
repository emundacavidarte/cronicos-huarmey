/**
 * registroClinicoModal.js
 * Formulario Web de Registro Clínico y Atención en Línea
 * Padrón Estandarizado - Hospital de Apoyo Huarmey II-1
 *
 * Flujo optimizado:
 * 1. Búsqueda por documento: si el paciente ya existe, el formulario precarga SOLO lo que está guardado
 *    (filiación, domicilio, diagnósticos, medicación). Lo que falta queda en blanco: no se guarda como dato (P3-03).
 *    Antes de declarar «Paciente Nuevo» se vuelve a pedir la lista al servidor (P3-05).
 * 2. Enfoque en la atención de hoy: la presión, la HbA1c y la glucosa de hoy empiezan VACÍAS; el último control se
 *    muestra como pista (P3-01). Solo si se escribe un valor se agrega una observación, y su «estado de control» sale de
 *    ReglasClinicas.estadoControl con la meta del paciente (K3-01). La próxima cita se propone según el estado de control
 *    (30 días; 90 solo si está controlado y estable) y se avisa si la fecha elegida excede el intervalo (K3-04).
 * 3. Cálculos clínicos automáticos en vivo (IMC, TFGe CKD-EPI y su categoría, semáforo HEARTS, metas de PA/HbA1c/LDL y
 *    tamizajes pendientes). Toda cifra clínica sale de reglasClinicas.js.
 * 4. Al guardar se envían solo los campos con valor: nada por omisión y nada que la persona no haya escrito o cambiado
 *    (sector, establecimiento y sexo guardados no se pisan; P3-07, P3-10).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(
      require('../data/padronSchema'),
      require('../clinical/padronCalculadora'),
      require('../clinical/reglasClinicas')
    );
  } else {
    root.RegistroClinicoModal = factory(root.PadronSchema, root.PadronCalculadora, root.ReglasClinicas);
  }
})(typeof window !== 'undefined' ? window : this, function (schema, calculadora, R) {

  const MESES_CODIGOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
  const MESES_NOMBRES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    // Los valores que vienen de un Excel o de la API nunca se escriben tal cual en la página
  const esc = (v) => String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // ---------- fechas: siempre la fecha de Lima, nunca toISOString() (UTC) ni getMonth() del navegador (T3-04) ----------
  const hoyTexto = (dias) => ((typeof window !== 'undefined' && window.FechaLima)
    ? window.FechaLima.hoy(dias || 0)
    : R.sumarDias(R.aTexto(new Date()), dias || 0));
  const mesDe = (fechaTxt) => MESES_CODIGOS[Number(String(fechaTxt || '').slice(5, 7)) - 1] || '';
  /** 15-oct (con el año si no es el actual) */
  function fechaCorta(fechaTxt) {
    const f = R.parseFechaLocal(fechaTxt);
    if (!f) return '';
    const base = `${String(f.getDate()).padStart(2, '0')}-${MESES_CODIGOS[f.getMonth()]}`;
    return f.getFullYear() === Number(hoyTexto().slice(0, 4)) ? base : `${base}-${f.getFullYear()}`;
  }

  // ---------- valores: solo se usa lo que alguien registró ----------
  // Textos con los que el servidor rellena lo que falta (database.js: PLACEHOLDER_VALUES): no son datos registrados
  const RELLENO = {
    direccion: ['Huarmey', 'Sin dirección consignada'],
    historia_clinica: ['S/N'],
    apellidos_nombres: ['PACIENTE SIN NOMBRE', 'PACIENTE HOSIX'],
    sector_sanitario: ['Sector 01 - Centro Urbano']
  };
  /** Texto de un valor guardado, o '' si falta («-», vacío o texto de relleno). */
  function guardado(campo, v) {
    if (!R.tieneValor(v)) return '';
    const t = String(v).trim();
    return (RELLENO[campo] || []).includes(t) ? '' : t;
  }
  function numero(v) {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  /** Quita lo que no tiene valor (undefined, null, '', NaN): al servidor solo viaja lo que alguien escribió o decidió. */
  function conValor(obj) {
    const r = {};
    Object.keys(obj).forEach(k => {
      const v = obj[k];
      if (v === undefined || v === null) return;
      if (typeof v === 'string' && v.trim() === '') return;
      if (typeof v === 'number' && !Number.isFinite(v)) return;
      r[k] = v;
    });
    return r;
  }
  const ESTADOS_CITA_NO_VIGENTE = ['cancelled', 'noshow', 'fulfilled', 'entered-in-error', 'cancelada', 'no_asistio', 'cumplida'];

  // ---------- establecimientos: TODO el catálogo del cliente (P3-14), no 4 fijos ----------
  const CATALOGO_RESPALDO = [
    { cod: '00001741', etiqueta: 'Hospital de Apoyo Huarmey', cat: 'II-1' },
    { cod: '00001744', etiqueta: 'C. S. La Victoria', cat: 'I-3' },
    { cod: '00001742', etiqueta: 'P. S. Puerto Huarmey', cat: 'I-2' },
    { cod: '00001751', etiqueta: 'P. S. Huamba', cat: 'I-1' }
  ];
  const PALABRAS_MENORES = ['de', 'del', 'la', 'las', 'el', 'los', 'y'];
  function etiquetaEstablecimiento(e) {
    let n = String(e.nombre || '').trim().toLowerCase();
    let prefijo = '';
    if (/hospital/.test(n)) n = n.replace(/^nuevo\s+/, '');
    else if (/^puesto de salud\s+/.test(n)) { prefijo = 'P. S. '; n = n.replace(/^puesto de salud\s+/, ''); }
    else if (/^centro de salud\s+/.test(n)) { prefijo = 'C. S. '; n = n.replace(/^centro de salud\s+/, ''); }
    const titulo = n.split(/\s+/).map((w, i) => {
      if (i > 0 && PALABRAS_MENORES.includes(w)) return w;
      return w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
    return prefijo + titulo;
  }
  function catalogoEstablecimientos() {
    const E = (typeof window !== 'undefined') ? window.EstablecimientosHuarmey : null;
    const lista = E && typeof E.getAllHuarmey === 'function' ? E.getAllHuarmey() : [];
    if (!lista.length) return CATALOGO_RESPALDO;
    return lista.map(e => ({ cod: e.cod_renipress, etiqueta: etiquetaEstablecimiento(e), cat: e.categoria }));
  }
  const valorEstablecimiento = (e) => `${e.etiqueta} (${e.cod}, ${e.cat})`;
  const codigoRenipress = (texto) => { const m = /\((\d{8})\b/.exec(String(texto === undefined || texto === null ? '' : texto)); return m ? m[1] : ''; };
  function opcionesEstablecimiento(incluirFuera) {
    const op = catalogoEstablecimientos().map(e => `<option value="${esc(valorEstablecimiento(e))}" data-cod="${esc(e.cod)}">${esc(e.etiqueta)} (${esc(e.cat)})</option>`);
    if (incluirFuera) op.push('<option value="Fuera del distrito (se anota cuál en Observaciones)">Fuera del distrito</option>');
    return '<option value="" selected>Seleccione…</option>' + op.join('');
  }

  // ---------- selectores: un valor guardado que no figura entre las opciones NO se pierde en silencio ----------
  function quitarExtras(sel) { Array.from(sel.querySelectorAll('option[data-extra]')).forEach(o => o.remove()); }
  function fijarSelect(sel, valor) {
    quitarExtras(sel);
    const v = valor === undefined || valor === null ? '' : String(valor).trim();
    if (!v) { sel.value = ''; return; }
    let op = Array.from(sel.options).find(o => o.value === v);
    if (!op) {
      op = document.createElement('option');
      op.value = v; op.textContent = v; op.dataset.extra = '1';
      sel.appendChild(op);
    }
    sel.value = v;
  }
  /** Busca el establecimiento por su código RENIPRESS (el texto guardado puede estar escrito distinto). */
  function fijarEstablecimiento(sel, texto) {
    quitarExtras(sel);
    const t = guardado('', texto);
    if (!t) { sel.value = ''; return; }
    const cod = codigoRenipress(t);
    const op = Array.from(sel.options).find(o => (cod && o.dataset.cod === cod) || o.value === t);
    if (op) { sel.value = op.value; return; }
    fijarSelect(sel, t);
  }

  class RegistroClinicoModal {
    constructor() {
      this.dom = {};
      this.isInitialized = false;
      this.currentPatient = null;
      this.isExistingPatient = false;
      this._busquedaId = 0;        // descarta la respuesta de una búsqueda vieja (P3-05)
      this._base = {};             // lo que mostraba el formulario al cargar: solo se envía lo que la persona cambia
      this._citaEditada = false;   // la persona tocó la fecha: la propuesta ya no la pisa
      this._citaGuardada = '';     // cita futura que el paciente ya tiene guardada
      this._mesesTocado = false;
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
                      <span>${iconDni}</span> Documento del paciente:
                    </label>
                    <div class="reg-dni-input-wrap">
                      <input type="text" id="reg-input-dni" class="reg-dni-input" placeholder="DNI (8 dígitos), carné de extranjería o pasaporte" maxlength="15" autocomplete="off" autofocus>
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
                        <label class="reg-label">Sexo</label>
                        <select id="reg-sexo" class="reg-select">
                          <option value="" selected>Seleccione…</option>
                          <option value="Femenino">Femenino</option>
                          <option value="Masculino">Masculino</option>
                        </select>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Fecha de nacimiento <span class="req">*</span></label>
                        <input type="date" id="reg-fecha-nacimiento" class="reg-input" required>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Seguro de salud</label>
                        <select id="reg-seguro-salud" class="reg-select">
                          <option value="" selected>Seleccione…</option>
                          <option value="SIS">SIS</option>
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
                        <label class="reg-label">Sector Sanitario</label>
                        <select id="reg-sector" class="reg-select">
                          <option value="" selected>Seleccione…</option>
                          <option value="Sector I – Centro">Sector I – Centro</option>
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
                        <label class="reg-label">EESS Adscripción</label>
                        <select id="reg-eess-adscripcion" class="reg-select">
                          ${opcionesEstablecimiento(false)}
                        </select>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">EESS que lo controla hoy</label>
                        <select id="reg-eess-control" class="reg-select">
                          ${opcionesEstablecimiento(true)}
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
                          <option value="" selected>Seleccione…</option>
                          <option value="Sí">Sí</option>
                          <option value="En estudio">En estudio</option>
                        </select>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Enfermedad Cardiovascular Previa</label>
                        <select id="reg-enfermedad-cv" class="reg-select">
                          <option value="" selected>Seleccione…</option>
                          <option value="No">No</option>
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
                          <option value="" selected>Seleccione…</option>
                          <option value="No">No</option>
                          <option value="Sí">Sí</option>
                        </select>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Ácido acetilsalicílico (AAS 100 mg)</label>
                        <select id="reg-aspirina" class="reg-select">
                          <option value="" selected>Seleccione…</option>
                          <option value="No indicado">No indicado</option>
                          <option value="Sí">Sí</option>
                          <option value="No">No</option>
                        </select>
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Meses de medicación entregados</label>
                        <select id="reg-meses-medicacion" class="reg-select">
                          <option value="" selected>Seleccione…</option>
                          <option value="1">1 mes</option>
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
                        <label class="reg-label">Presión Sistólica (PAS) de hoy, mmHg</label>
                        <input type="number" id="reg-pas-hoy" class="reg-input" placeholder="70 – 260" min="70" max="260" style="font-size:15px; font-weight:800; color:#0f172a;">
                      </div>

                      <div class="reg-field">
                        <label class="reg-label">Presión Diastólica (PAD) de hoy, mmHg</label>
                        <input type="number" id="reg-pad-hoy" class="reg-input" placeholder="40 – 150" min="40" max="150" style="font-size:15px; font-weight:800; color:#0f172a;">
                      </div>

                      <div class="reg-pista" id="reg-pista-ultimo-control" hidden></div>

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
                        <label class="reg-label">Próxima cita programada</label>
                        <input type="date" id="reg-proxima-cita" class="reg-input">
                        <small class="reg-pista-cita" id="reg-pista-proxima-cita"></small>
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
                    <div class="reg-aviso-cita" id="live-aviso-cita" role="alert" hidden></div>
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
                    <div class="metric-sub reg-estado-control" id="live-estado-control">Estado de control (esta atención): sin medición hoy</div>
                  </div>

                  <!-- Función Renal: TFGe CKD-EPI 2021 -->
                  <div class="reg-live-metric-card">
                    <div class="metric-header">
                      <span>Función Renal (CKD-EPI)</span>
                      <span>X13 · X14</span>
                    </div>
                    <div class="metric-value" id="live-tfge">— ml/min/1.73m²</div>
                    <div class="metric-sub" id="live-estadio-erc">Categoría de TFGe: sin creatinina</div>
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
        pistaUltimoControl: document.getElementById('reg-pista-ultimo-control'),
        pistaProximaCita: document.getElementById('reg-pista-proxima-cita'),
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
        liveAvisoCita: document.getElementById('live-aviso-cita'),
        liveEstadoControl: document.getElementById('live-estado-control'),
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

      // Búsqueda automática al escribir un DNI de 8 dígitos; un carné de extranjería o pasaporte se busca con Enter o «Buscar»
      this.dom.inputDni.addEventListener('input', (e) => {
        const val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        e.target.value = val;
        if (/^\d{8}$/.test(val)) {
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

      // Si la persona toca la fecha de la próxima cita, la propuesta automática deja de pisarla (K3-04)
      this.dom.proximaCita.addEventListener('input', () => { this._citaEditada = true; });
      // «Medicación hasta» solo se recalcula si la persona confirma los meses entregados
      this.dom.mesesMed.addEventListener('change', () => { this._mesesTocado = true; });
      // El mes a registrar acompaña a la fecha de la atención (T3-04)
      this.dom.fechaAtencion.addEventListener('change', () => {
        const m = mesDe(this.dom.fechaAtencion.value);
        if (m) this.dom.mesControl.value = m;
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
      this.resetForm(false);
      this.dom.modal.classList.add('active');

      if (prefillDni) {
        this.dom.inputDni.value = String(prefillDni).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
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

    /**
     * C3-02: lo usa main.js al cerrar la sesión o vencerla. Cierra el modal (si está abierto), vacía el formulario y
     * deja currentPatient = null, para que el siguiente usuario no vea nada del anterior. Sirve aunque nunca se abriera.
     */
    reiniciar() {
      this._busquedaId++;              // una búsqueda en curso ya no puede pintar nada
      this.currentPatient = null;
      this.isExistingPatient = false;
      if (!this.isInitialized) return;
      this.close();
      this.resetForm(false);
    }

    /** Vacía los campos del formulario (no toca el documento ni los avisos de búsqueda). Nada queda «por omisión» (P3-03). */
    vaciarCampos() {
      const d = this.dom;
      [d.sexo, d.seguro, d.sector, d.eessAds, d.eessCtrl, d.dxConfirmado, d.ecv, d.estatina, d.aspirina, d.mesesMed, d.estadoPaciente, d.tipoDoc, d.albuminuria]
        .forEach(quitarExtras);
      d.form.reset();                  // los selectores vuelven a «Seleccione…»; el tipo de documento a DNI y el estado a Activo
      d.tipoDoc.value = 'DNI';
      d.estadoPaciente.value = 'Activo';
      d.consentimiento.value = '';
      const hoy = hoyTexto();
      d.fechaAtencion.value = hoy;
      d.mesControl.value = mesDe(hoy);
      d.proximaCita.disabled = false;
      d.proximaCita.value = '';
      d.pistaUltimoControl.textContent = '';
      d.pistaUltimoControl.hidden = true;
      d.pistaProximaCita.textContent = '';
      this._citaEditada = false;
      this._citaGuardada = '';
      this._mesesTocado = false;
      this._consentimientoGuardado = false;
      this._base = {};
    }

    resetForm(enfocar = true) {
      this._busquedaId++;
      this.currentPatient = null;
      this.isExistingPatient = false;
      this.vaciarCampos();
      this.dom.inputDni.value = '';
      this.dom.statusAlert.style.display = 'none';
      this.dom.statusAlert.className = '';
      this.dom.statusAlert.innerHTML = '';
      this.dom.btnLimpiar.style.display = 'none';
      this.dom.medAlertBox.style.display = 'none';
      this.dom.patientBadge.className = 'reg-semaforo-pill reg-sem-gris';
      this.dom.patientBadge.textContent = 'Nuevo Registro';
      this.mostrarCampoConsentimiento(true);
      if (enfocar) this.dom.inputDni.focus();
    }

    /** Busca el documento en la lista que la aplicación tiene en memoria. */
    buscarEnMemoria(dni) {
      const allPatients = (window.app && Array.isArray(window.app.patients)) ? window.app.patients : [];
      let found = allPatients.find(p => String(p.dni || p.nro_documento || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase() === dni);
      // Si no está en el array directo, buscar por id
      if (!found && window.app && typeof window.app.findPatient === 'function') {
        found = window.app.findPatient(dni);
      }
      return found || null;
    }

    /**
     * Búsqueda por documento y precarga del paciente existente.
     * P3-05: antes de decir «Paciente Nuevo» se vuelve a pedir la lista al servidor (un colega pudo crearlo después de que
     * esta persona inició sesión). Si no se puede recargar, se sigue como antes.
     */
    async buscarPacientePorDni(dni) {
      // DNI de 8 dígitos, o carné de extranjería / pasaporte de 6 a 15 letras o dígitos (el documento es obligatorio)
      dni = String(dni || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (!/^\d{8}$/.test(dni) && !/^[A-Z0-9]{6,15}$/.test(dni)) {
        this.dom.statusAlert.style.display = 'block';
        this.dom.statusAlert.className = 'reg-dni-status-alert reg-alert-warn';
        this.dom.statusAlert.textContent = '⚠️ Ingrese un DNI de 8 dígitos, o un carné de extranjería o pasaporte de 6 a 15 letras o dígitos.';
        return;
      }

      const busqueda = ++this._busquedaId;
      let found = this.buscarEnMemoria(dni);

      if (!found && window.app && typeof window.app.recargarPacientes === 'function') {
        this.dom.statusAlert.style.display = 'block';
        this.dom.statusAlert.className = 'reg-dni-status-alert reg-alert-warn';
        this.dom.statusAlert.textContent = '⏳ Buscando el documento en el padrón actualizado…';
        try {
          await window.app.recargarPacientes();
        } catch (e) { /* sin recarga: se sigue con la lista que hay */ }
        if (busqueda !== this._busquedaId) return;       // otra búsqueda, «Limpiar», o se cerró la sesión
        found = this.buscarEnMemoria(dni);
      }

      if (found) {
        this.cargarDatosPacienteExistente(found);
      } else {
        this.mostrarPacienteNuevo(dni);
      }

      this.recalcularEnVivo();
    }

    mostrarPacienteNuevo(dni) {
      // Si venía de un paciente existente, no se arrastra nada suyo al formulario del nuevo
      if (this.isExistingPatient) this.vaciarCampos();
      this.isExistingPatient = false;
      this.currentPatient = null;
      this._base = {};
      // Si no es un DNI, se sugiere el tipo (solo dígitos: carné de extranjería; con letras: pasaporte)
      if (!/^\d{8}$/.test(dni)) this.dom.tipoDoc.value = /^\d+$/.test(dni) ? 'Carné de extranjería' : 'Pasaporte';
      else this.dom.tipoDoc.value = 'DNI';
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
      this.dom.pistaUltimoControl.hidden = true;
      this.mostrarCampoConsentimiento(true);

      // Enfocar nombres
      setTimeout(() => this.dom.nombres.focus(), 100);
    }

    /** El consentimiento se pregunta una sola vez: si el paciente ya lo tiene registrado, el campo se oculta. */
    mostrarCampoConsentimiento(visible) {
      const campo = document.getElementById('reg-field-consentimiento');
      if (campo) campo.style.display = visible ? '' : 'none';
    }

    /** Cita futura que el paciente ya tiene guardada (la más próxima desde hoy), o ''. */
    citaFuturaGuardada(p) {
      const hoy = R.parseFechaLocal(hoyTexto());
      const fechas = [];
      (Array.isArray(p.appointments) ? p.appointments : []).forEach(a => {
        if (!a || ESTADOS_CITA_NO_VIGENTE.includes(String(a.estado || '').toLowerCase())) return;
        fechas.push(a.fecha_cita);
      });
      fechas.push(p.proxima_cita);
      let mejor = '';
      fechas.forEach(txt => {
        const f = R.parseFechaLocal(txt);
        if (!f || f.getTime() < hoy.getTime()) return;
        const t = R.aTexto(f);
        if (!mejor || t < mejor) mejor = t;
      });
      return mejor;
    }

    /** «Último control: 120/75 mmHg el 15-oct · Última HbA1c …»: el último control por FECHA, como pista (P3-01). */
    textoUltimoControl(p) {
      const obs = Array.isArray(p.observations) ? p.observations : [];
      const masReciente = (valido) => {
        let m = null;
        obs.forEach(o => {
          if (!o) return;
          const f = R.parseFechaLocal(o.fecha_registro);
          if (!f || !valido(o)) return;
          if (!m || f.getTime() >= m.f.getTime()) m = { f, o };
        });
        return m;
      };
      const partes = [];
      const pa = masReciente(o => R.tieneValor(o.pa_sistolica) && R.tieneValor(o.pa_diastolica));
      if (pa) {
        partes.push(`Último control: ${pa.o.pa_sistolica}/${pa.o.pa_diastolica} mmHg el ${fechaCorta(pa.o.fecha_registro)}`);
      } else {
        const mes = [...MESES_CODIGOS].reverse().find(m => R.tieneValor(p[`pas_${m}`]) && R.tieneValor(p[`pad_${m}`]));
        if (mes) partes.push(`Último control: ${p[`pas_${mes}`]}/${p[`pad_${mes}`]} mmHg (${mes})`);
      }
      const hb = masReciente(o => R.tieneValor(o.hba1c));
      if (hb) partes.push(`Última HbA1c: ${hb.o.hba1c} % el ${fechaCorta(hb.o.fecha_registro)}`);
      else if (R.tieneValor(p.hba1c)) partes.push(`Última HbA1c: ${p.hba1c} %${R.tieneValor(p.fecha_hba1c) ? ' el ' + fechaCorta(p.fecha_hba1c) : ''}`);
      const gl = masReciente(o => R.tieneValor(o.glucosa));
      if (gl) partes.push(`Última glucosa: ${gl.o.glucosa} mg/dl el ${fechaCorta(gl.o.fecha_registro)}`);
      else if (R.tieneValor(p.glucosa)) partes.push(`Última glucosa: ${p.glucosa} mg/dl${R.tieneValor(p.fecha_glucosa) ? ' el ' + fechaCorta(p.fecha_glucosa) : ''}`);
      if (!partes.length) return 'Sin controles previos registrados. Escriba los valores de HOY solo si los midió.';
      return partes.join(' · ') + '. Escriba abajo los valores de HOY; si no mide nada hoy, déjelos en blanco.';
    }

    /** Fecha del último control real guardado (observaciones o campo propio). */
    ultimaFechaControl(p) {
      let mejor = '';
      (Array.isArray(p.observations) ? p.observations : []).forEach(o => {
        const f = o && R.parseFechaLocal(o.fecha_registro);
        if (f && R.aTexto(f) > mejor) mejor = R.aTexto(f);
      });
      const propia = R.parseFechaLocal(p.fecha_ultimo_control);
      if (propia && R.aTexto(propia) > mejor) mejor = R.aTexto(propia);
      return mejor;
    }

    /**
     * Precarga SOLO lo que el paciente tiene guardado: lo que falta queda en blanco («Seleccione…») y no se guarda como dato.
     */
    cargarDatosPacienteExistente(p) {
      this.vaciarCampos();             // nada del paciente anterior se arrastra
      const d = this.dom;
      this.isExistingPatient = true;
      this.currentPatient = p;
      const yaRegistrado = p.consentimiento === 'Sí, firmado' || p.consentimiento === 'No';
      this._consentimientoGuardado = yaRegistrado;
      d.consentimiento.value = yaRegistrado ? p.consentimiento : '';
      this.mostrarCampoConsentimiento(!yaRegistrado);
      d.btnLimpiar.style.display = 'inline-block';

      const fallecido = R.esFallecido(p);

      // 1. Mensaje de alerta positiva
      const nombreCompleto = guardado('apellidos_nombres', p.apellidos_nombres) || `${p.nombres || ''} ${p.apellidos || ''}`.trim() || 'Paciente';
      d.statusAlert.style.display = 'block';
      d.statusAlert.className = 'reg-dni-status-alert reg-alert-found';
      d.statusAlert.innerHTML = `
        <span style="font-size:18px;">🎉</span>
        <div>
          <strong>Paciente Encontrado:</strong> <strong>${esc(nombreCompleto)}</strong> (DNI: ${esc(p.dni || p.nro_documento || '')})<br>
          <small>✓ Se precargaron solo los datos guardados; lo que falta queda en blanco. Ingrese los controles de la atención de hoy.</small>
          ${fallecido ? '<br><strong>⚠️ Paciente registrado como FALLECIDO: no se le programa cita ni control.</strong>' : ''}
        </div>
      `;

      d.patientBadge.className = fallecido ? 'reg-semaforo-pill reg-sem-negro' : 'reg-semaforo-pill reg-sem-verde';
      d.patientBadge.textContent = fallecido ? 'Fallecido' : 'En Padrón';

      // 2. Filiación y ubicación (el sexo guardado como M/F de HOSIX, FHIR o la semilla se reconoce: P3-07)
      const nroDoc = String(p.dni || p.nro_documento || '');
      fijarSelect(d.tipoDoc, guardado('', p.tipo_documento) || (/^\d{8}$/.test(nroDoc) ? 'DNI' : /^\d+$/.test(nroDoc) ? 'Carné de extranjería' : 'Pasaporte'));
      d.hc.value = guardado('historia_clinica', p.historia_clinica);
      d.nombres.value = guardado('apellidos_nombres', nombreCompleto) ? nombreCompleto : '';
      fijarSelect(d.sexo, R.normalizarSexo(p.sexo));
      d.fechaNac.value = String(p.fecha_nacimiento || '').slice(0, 10);
      fijarSelect(d.seguro, guardado('', p.seguro_salud) || guardado('', p.seguro) || guardado('', p.financiador));
      d.telefono.value = guardado('', p.telefono);
      fijarSelect(d.sector, guardado('sector', p.sector) || guardado('sector_sanitario', p.sector_sanitario));
      d.direccion.value = guardado('direccion', p.direccion);
      fijarEstablecimiento(d.eessAds, p.establecimiento_adscripcion);
      let control = guardado('', p.establecimiento_control);
      if (!control && p.puerta_entrada_id) {
        const e = catalogoEstablecimientos().find(x => x.cod === String(p.puerta_entrada_id));
        control = e ? valorEstablecimiento(e) : guardado('', p.puerta_entrada);
      }
      fijarEstablecimiento(d.eessCtrl, control || guardado('', p.puerta_entrada));

      // 3. Diagnósticos (lo escrito en el padrón; si no, los códigos de los diagnósticos guardados)
      d.cie10Hta.value = guardado('', p.cie10_hta);
      d.cie10Dm.value = guardado('', p.cie10_dm);
      d.cie10Dislip.value = guardado('', p.cie10_dislipidemia);
      d.cie10Erc.value = guardado('', p.cie10_erc);
      const codigos = [];
      (Array.isArray(p.conditions) ? p.conditions : []).forEach(c => { if (c) codigos.push(String(c.cie10_cod || '').trim()); });
      (Array.isArray(p.diagnosticos) ? p.diagnosticos : []).forEach(c => codigos.push(String(c || '').trim()));
      [
        { campo: d.cie10Hta, es: R.esHta, base: 'Hipertensión' },
        { campo: d.cie10Dm, es: R.esDm, base: 'Diabetes' },
        { campo: d.cie10Erc, es: R.esErc, base: 'ERC' },
        { campo: d.cie10Dislip, es: (c) => /^E78/i.test(R.extraerCodigo(c)), base: 'Dislipidemia' }
      ].forEach(({ campo, es, base }) => {
        if (campo.value) return;
        const cod = codigos.find(c => R.extraerCodigo(c) && es(c));
        if (cod) campo.value = `${R.extraerCodigo(cod)} – ${R.rotuloCie10(cod) || base}`;
      });
      fijarSelect(d.dxConfirmado, guardado('', p.dx_confirmado));
      fijarSelect(d.ecv, guardado('', p.enfermedad_cardiovascular));

      // 4. Medicación anterior (lista para verificar y ajustar si cambia)
      const medHta = guardado('', p.tratamiento_hta);
      const medDm = guardado('', p.tratamiento_dm);
      const estatinaVal = guardado('', p.estatina);
      const aspirinaVal = guardado('', p.aspirina_aas);
      d.tratamientoHta.value = medHta;
      d.tratamientoDm.value = medDm;
      fijarSelect(d.estatina, estatinaVal);
      fijarSelect(d.aspirina, aspirinaVal);
      fijarSelect(d.mesesMed, guardado('', p.meses_medicacion));
      d.riesgoCvPorc.value = R.tieneValor(p.riesgo_cv_porcentaje) ? p.riesgo_cv_porcentaje : '';

      const resumenMed = [
        medHta ? `HTA: ${medHta}` : null,
        medDm ? `DM: ${medDm}` : null,
        estatinaVal === 'Sí' ? 'Estatina' : null,
        aspirinaVal === 'Sí' ? 'AAS 100mg' : null
      ].filter(Boolean).join(' · ') || 'Sin medicación registrada previamente';

      d.medAlertBox.style.display = 'flex';
      d.medAlertText.textContent = resumenMed;

      // 5. Mediciones: la PA, la HbA1c y la glucosa de HOY quedan vacías; el último control es solo una pista (P3-01)
      d.pistaUltimoControl.textContent = this.textoUltimoControl(p);
      d.pistaUltimoControl.hidden = false;

      const pab = R.tieneValor(p.perimetro_abdominal) ? p.perimetro_abdominal : p.pab;
      if (R.tieneValor(p.peso)) d.peso.value = p.peso;
      if (R.tieneValor(p.talla)) d.talla.value = p.talla;
      if (R.tieneValor(pab)) d.perimetroAbd.value = pab;
      if (R.tieneValor(p.creatinina)) d.creatinina.value = p.creatinina;
      if (R.tieneValor(p.colesterol_ldl)) d.colesterolLdl.value = p.colesterol_ldl;

      // 6. Estado del paciente: un fallecido NO vuelve a «Activo» al guardar (P3-02)
      fijarSelect(d.estadoPaciente, fallecido ? 'Fallecido' : (guardado('', p.estado_paciente) || 'Activo'));

      // 7. Próxima cita: si ya tiene una cita futura guardada, se precarga (P3-08)
      const futura = this.citaFuturaGuardada(p);
      if (futura) {
        this._citaGuardada = futura;
        d.proximaCita.value = futura;
      }

      // Lo que muestra el formulario ahora es lo guardado: solo se enviará lo que la persona cambie
      this._base = this.getFormData();

      // 8. Enfocar directamente la atención de hoy
      const secHoy = document.getElementById('reg-sec-atencion-hoy');
      if (secHoy) {
        secHoy.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => d.pasHoy.focus(), 250);
      }
    }

    // ---------------------------------------------------------------------------------------------------------
    // Datos del formulario y cálculo
    // ---------------------------------------------------------------------------------------------------------

    /** Mediciones que la persona escribió en ESTA atención (null si no escribió). */
    medicionesDeHoy() {
      const d = this.dom;
      return { pas: numero(d.pasHoy.value), pad: numero(d.padHoy.value), hba1c: numero(d.hba1c.value), glucosa: numero(d.glucosa.value) };
    }

    /** Hay control hoy solo si se escribió la presión completa (sistólica y diastólica), la HbA1c o la glucosa. */
    hayControlHoy(med) {
      return (med.pas !== null && med.pad !== null) || med.hba1c !== null || med.glucosa !== null;
    }

    /** Banderas clínicas del paciente según el formulario y lo ya guardado (los diagnósticos solo se acumulan). */
    perfilDelFormulario() {
      const d = this.dom;
      const cur = this.currentPatient || {};
      return R.perfilClinico({
        diagnosticos: cur.diagnosticos,
        conditions: cur.conditions,
        cie10_hta: d.cie10Hta.value,
        cie10_dm: d.cie10Dm.value,
        cie10_erc: d.cie10Erc.value,
        enfermedad_cardiovascular: d.ecv.value,
        riesgo_cv_porcentaje: d.riesgoCvPorc.value
      });
    }

    /**
     * Lee todos los campos del formulario como objeto plano (con '' en lo que está en blanco). Sirve para calcular en vivo
     * y para saber qué cambió la persona; NO es lo que se envía al servidor (eso lo arma construirPaciente).
     */
    getFormData() {
      const d = this.dom;
      const data = {
        tipo_documento: d.tipoDoc.value,
        nro_documento: d.inputDni.value.trim(),
        historia_clinica: d.hc.value.trim(),
        apellidos_nombres: d.nombres.value.trim().toUpperCase(),
        sexo: d.sexo.value,
        fecha_nacimiento: d.fechaNac.value,
        seguro_salud: d.seguro.value,
        telefono: d.telefono.value.trim(),
        sector: d.sector.value,
        direccion: d.direccion.value.trim(),
        establecimiento_adscripcion: d.eessAds.value,
        establecimiento_control: d.eessCtrl.value,

        cie10_hta: d.cie10Hta.value.trim(),
        cie10_dm: d.cie10Dm.value.trim(),
        cie10_dislipidemia: d.cie10Dislip.value.trim(),
        cie10_erc: d.cie10Erc.value.trim(),
        dx_confirmado: d.dxConfirmado.value,
        enfermedad_cardiovascular: d.ecv.value,

        tratamiento_hta: d.tratamientoHta.value.trim(),
        tratamiento_dm: d.tratamientoDm.value.trim(),
        estatina: d.estatina.value,
        aspirina_aas: d.aspirina.value,
        meses_medicacion: d.mesesMed.value,
        riesgo_cv_porcentaje: d.riesgoCvPorc.value,

        fecha_ultimo_control: d.fechaAtencion.value,
        proxima_cita: d.proximaCita.value,
        peso: d.peso.value,
        talla: d.talla.value,
        perimetro_abdominal: d.perimetroAbd.value,
        observaciones: d.observaciones.value.trim(),
        estado_paciente: d.estadoPaciente.value,
        consentimiento: d.consentimiento.value,

        hba1c: d.hba1c.value,
        fecha_hba1c: d.fechaHba1c.value,
        glucosa: d.glucosa.value,
        fecha_glucosa: d.fechaGlucosa.value,
        creatinina: d.creatinina.value,
        fecha_creatinina: d.fechaCreatinina.value,
        albuminuria: d.albuminuria.value,
        colesterol_total: d.colesterolTotal.value,
        colesterol_ldl: d.colesterolLdl.value,
        fecha_evaluacion_pie: d.fechaEvalPie.value
      };

      // Historial de presiones del paciente (para «controlado y estable»); la de hoy solo si se escribió completa
      const cur = this.currentPatient;
      if (cur) {
        MESES_CODIGOS.forEach(m => {
          if (R.tieneValor(cur[`pas_${m}`]) && R.tieneValor(cur[`pad_${m}`])) {
            data[`pas_${m}`] = cur[`pas_${m}`];
            data[`pad_${m}`] = cur[`pad_${m}`];
          }
        });
      }
      const mesCod = d.mesControl.value;
      const med = this.medicionesDeHoy();
      if (mesCod && med.pas !== null && med.pad !== null) {
        data[`pas_${mesCod}`] = d.pasHoy.value;
        data[`pad_${mesCod}`] = d.padHoy.value;
      }
      return data;
    }

    /**
     * Datos para los cálculos: el formulario más lo ya guardado que solo sirve para evaluar (diagnósticos y últimos
     * exámenes). Nada de esto se vuelve a guardar como si fuera de hoy.
     */
    datosParaCalculo(f, hayControl) {
      const cur = this.currentPatient || {};
      const datos = Object.assign({}, f);
      datos.diagnosticos = cur.diagnosticos;
      datos.conditions = cur.conditions;
      ['hba1c', 'fecha_hba1c', 'glucosa', 'fecha_glucosa', 'creatinina', 'fecha_creatinina', 'albuminuria', 'fecha_albuminuria',
        'colesterol_total', 'colesterol_ldl', 'fecha_perfil_lipidico', 'fecha_evaluacion_pie'].forEach(k => {
        if (!R.tieneValor(datos[k]) && R.tieneValor(cur[k])) datos[k] = cur[k];
      });
      // Un control de hoy cierra la cita vencida de antes; sin control de hoy rige el último control real
      datos.fecha_ultimo_control = hayControl ? this.fechaAtencion() : this.ultimaFechaControl(cur);
      return datos;
    }

    /** Fecha de la atención (Lima) para las cuentas de días. */
    fechaAtencion() {
      const v = this.dom.fechaAtencion.value;
      return R.parseFechaLocal(v) ? v : hoyTexto();
    }

    /**
     * Próxima cita (P3-08, K3-04). Fallecido: sin cita. Cita futura ya guardada: se precarga. Si no, se PROPONE con el
     * intervalo del estado de control (30 días; 90 solo si está controlado y estable) y se recalcula mientras la persona
     * no toque la fecha. Devuelve el aviso si la fecha elegida excede el intervalo.
     */
    gestionarProximaCita(frecuencia) {
      const d = this.dom;
      const base = this.fechaAtencion();
      if (d.estadoPaciente.value === 'Fallecido') {
        d.proximaCita.value = '';
        d.proximaCita.disabled = true;
        d.pistaProximaCita.textContent = 'Paciente fallecido: no se programa cita.';
        return '';
      }
      d.proximaCita.disabled = false;
      if (!this._citaEditada) {
        if (this._citaGuardada) {
          d.proximaCita.value = this._citaGuardada;
          d.pistaProximaCita.textContent = `Cita ya programada para el ${fechaCorta(this._citaGuardada)}. Si elige otra fecha se agrega una cita nueva.`;
        } else {
          d.proximaCita.value = R.sumarDias(base, frecuencia) || '';
          d.pistaProximaCita.textContent = frecuencia === R.REGLAS.DIAS_CONTROLADO
            ? `Propuesta: en ${frecuencia} días (controlado y estable). Puede cambiar la fecha.`
            : `Propuesta: en ${frecuencia} días (control mensual hasta alcanzar la meta; ${R.REGLAS.DIAS_CONTROLADO} días solo si está controlado y estable). Puede cambiar la fecha.`;
        }
      } else {
        d.pistaProximaCita.textContent = d.proximaCita.value
          ? (d.proximaCita.value === this._citaGuardada ? `Cita ya programada para el ${fechaCorta(this._citaGuardada)}.` : 'Fecha elegida por usted.')
          : 'Sin próxima cita: no se programará ninguna.';
      }
      const r = d.proximaCita.value ? R.citaExcedeIntervalo(base, d.proximaCita.value, frecuencia) : null;
      return r && r.excede ? `La cita queda a ${r.dias} días; el máximo para este paciente es ${r.maximo}.` : '';
    }

    /**
     * Recalcula en tiempo real las variables y actualiza la tarjeta lateral
     */
    recalcularEnVivo() {
      if (!this.dom.form) return;
      const d = this.dom;
      const f = this.getFormData();
      const med = this.medicionesDeHoy();
      const hayControl = this.hayControlHoy(med);
      const datos = this.datosParaCalculo(f, hayControl);
      const perfil = this.perfilDelFormulario();
      const meta = R.metaPA(perfil);
      const estadoHoy = hayControl ? R.estadoControl(med, perfil) : R.SIN_DATOS;

      // «Controlado y estable» (3 controles en meta) define si el intervalo es de 90 días; luego se ubica la cita
      let calc = calculadora.calcularPadron(datos);
      const frecuencia = R.frecuenciaDias(estadoHoy, calc.controlado_estable === 'Sí');
      const aviso = this.gestionarProximaCita(frecuencia);
      datos.proxima_cita = d.proximaCita.value;
      calc = calculadora.calcularPadron(datos);

      // 1. Semáforo HEARTS y Próxima Cita
      const semClass = `reg-sem-${calc.semaforo_hearts}`;
      d.liveSemaforoPill.className = `reg-semaforo-pill ${semClass}`;
      d.liveSemaforoPill.textContent = calc.semaforo_hearts.toUpperCase();
      d.liveEstadoCita.textContent = calc.estado_cita;
      d.liveDiasAtraso.textContent = calc.dias_atraso > 0 ? `⚠️ Atraso: ${calc.dias_atraso} días` : 'Cita al día';
      d.liveAvisoCita.textContent = aviso;
      d.liveAvisoCita.hidden = !aviso;

      // 2. Antropometría (IMC y Nutrición)
      d.liveImc.textContent = calc.imc ? `${calc.imc} kg/m²` : '— kg/m²';
      d.liveNutricion.textContent = calc.valoracion_nutricional;

      // 3. Control de Presión Arterial: la meta del paciente es la de ReglasClinicas.metaPA, la misma con la que se guarda
      if (calc.ultima_pas && calc.ultima_pad) {
        const enMeta = R.paEnMeta(calc.ultima_pas, calc.ultima_pad, meta);
        d.livePaUltima.textContent = `${calc.ultima_pas} / ${calc.ultima_pad} mmHg`;
        d.livePaMetaBadge.textContent = enMeta ? '✓ EN META' : '⚠️ FUERA DE META';
        d.livePaMetaBadge.style.color = enMeta ? '#16a34a' : '#dc2626';
      } else {
        d.livePaUltima.textContent = '— / — mmHg';
        d.livePaMetaBadge.textContent = '—';
        d.livePaMetaBadge.style.color = '#64748b';
      }
      d.liveMetaPresion.textContent = `Meta: ${meta.texto}`;
      d.liveControladoEstable.textContent = `Controlado y estable: ${calc.controlado_estable}`;
      d.liveEstadoControl.textContent = hayControl
        ? `Estado de control (esta atención): ${estadoHoy}`
        : 'Estado de control (esta atención): sin medición hoy; no se guarda ningún estado';

      // 4. Función Renal (CKD-EPI): sin sexo o sin fecha de nacimiento no se calcula (no se supone hombre ni edad)
      const creatinina = numero(f.creatinina);
      d.liveTfge.textContent = calc.tfge ? `${calc.tfge} ml/min` : '— ml/min';
      let categoria = 'sin creatinina';
      if (calc.tfge) categoria = calc.estadio_erc;
      else if (creatinina) categoria = !R.normalizarSexo(f.sexo) ? 'indique el sexo para calcularla' : (calc.edad_anios === null ? 'indique la fecha de nacimiento para calcularla' : 'sin dato');
      d.liveEstadioErc.textContent = `Categoría de TFGe: ${categoria}`;

      // 5. Metabolismo
      const hbHoy = med.hba1c !== null;
      d.liveHba1cMeta.textContent = `HbA1c en meta: ${calc.hba1c_en_meta}${!hbHoy && calc.hba1c_en_meta !== 'Sin dato' ? ' (último valor registrado)' : ''}`;
      d.liveLdlMeta.textContent = `Colesterol LDL en meta: ${calc.ldl_en_meta}`;

      // 6. Qué le falta al paciente
      d.liveQueLeFalta.textContent = calc.que_le_falta;
    }

    // ---------------------------------------------------------------------------------------------------------
    // Guardar
    // ---------------------------------------------------------------------------------------------------------

    /** Códigos CIE-10 que el paciente ya tiene guardados (en mayúsculas). */
    codigosGuardados() {
      const cur = this.currentPatient || {};
      const s = new Set();
      (Array.isArray(cur.conditions) ? cur.conditions : []).forEach(c => { if (c && c.cie10_cod) s.add(String(c.cie10_cod).trim().toUpperCase()); });
      (Array.isArray(cur.diagnosticos) ? cur.diagnosticos : []).forEach(c => { if (c) s.add(String(c).trim().toUpperCase()); });
      return s;
    }

    /**
     * Arma lo que se envía al servidor. SOLO campos con valor: nada por omisión, ni cadenas vacías, ni lo que la persona no
     * escribió o cambió (un paciente que ya existe conserva su sexo, sector, establecimiento y demás datos guardados).
     * @returns {{ paciente: object, local: object, aviso: object }}
     */
    construirPaciente(contexto) {
      const d = this.dom;
      const cur = this.currentPatient;
      const esNuevo = !this.isExistingPatient || !cur;
      const base = this._base || {};
      const f = this.getFormData();
      const cambio = (k) => esNuevo || f[k] !== base[k];
      const { dni, tipoDocumento, nombres, direccion, med, hayControl, estadoHoy, frecuencia, fechaAtencion, geo, ubicado } = contexto;

      // Identificación y datos obligatorios
      const paciente = {
        id: cur && cur.id ? cur.id : `pac-00001741-${dni}`,
        dni,
        nro_documento: dni,
        tipo_documento: tipoDocumento,
        apellidos_nombres: nombres.toUpperCase(),
        fecha_nacimiento: f.fecha_nacimiento,
        direccion,
        estado_paciente: f.estado_paciente || 'Activo'
      };
      if (paciente.estado_paciente === 'Fallecido') paciente.fallecido = true;
      else if (cur && R.esFallecido(cur)) paciente.fallecido = false;
      if (!this._consentimientoGuardado && f.consentimiento) paciente.consentimiento = f.consentimiento;

      // Campos opcionales de texto o selección: solo con valor y, si el paciente ya existe, solo si cambiaron
      ['historia_clinica', 'sexo', 'seguro_salud', 'telefono', 'cie10_hta', 'cie10_dm', 'cie10_dislipidemia', 'cie10_erc',
        'dx_confirmado', 'enfermedad_cardiovascular', 'tratamiento_hta', 'tratamiento_dm', 'estatina', 'aspirina_aas',
        'meses_medicacion', 'riesgo_cv_porcentaje', 'observaciones', 'albuminuria', 'fecha_hba1c', 'fecha_glucosa',
        'fecha_creatinina', 'fecha_evaluacion_pie'].forEach(k => { if (cambio(k) && R.tieneValor(f[k])) paciente[k] = f[k]; });
      // Mediciones y exámenes: números
      ['peso', 'talla', 'perimetro_abdominal', 'hba1c', 'glucosa', 'creatinina', 'colesterol_total', 'colesterol_ldl'].forEach(k => {
        const n = numero(f[k]);
        if (cambio(k) && n !== null) paciente[k] = n;
      });

      // Sector y establecimientos (P3-10): no pisan lo guardado si la persona no los cambió
      if (f.sector && cambio('sector')) {
        paciente.sector = f.sector;
        paciente.sector_sanitario = f.sector;
      } else if (esNuevo && ubicado && geo.sector) {
        paciente.sector_sanitario = geo.sector;   // paciente nuevo sin sector elegido: el que ubica el geocodificador
      }
      if (f.establecimiento_adscripcion && cambio('establecimiento_adscripcion')) paciente.establecimiento_adscripcion = f.establecimiento_adscripcion;
      if (f.establecimiento_control && cambio('establecimiento_control')) {
        paciente.establecimiento_control = f.establecimiento_control;
        paciente.puerta_entrada = f.establecimiento_control;
        const cod = codigoRenipress(f.establecimiento_control);
        if (cod) paciente.puerta_entrada_id = cod;
      }

      // Ubicación: solo si el geocodificador la encontró (sin ubicar = sin coordenadas, nunca las del hospital: T3-05)
      if (ubicado) {
        paciente.latitud = geo.lat;
        paciente.longitud = geo.lng;
      }

      // Diagnósticos nuevos (los que ya tiene no se reenvían: reescribirlos cambiaba su fecha de diagnóstico)
      const yaTiene = this.codigosGuardados();
      const conditions = [];
      [[f.cie10_hta, 'Hipertensión Arterial'], [f.cie10_dm, 'Diabetes Mellitus'], [f.cie10_erc, 'Enfermedad Renal Crónica'], [f.cie10_dislipidemia, 'Dislipidemia']]
        .forEach(([texto, rotuloBase]) => {
          const cod = R.extraerCodigo(texto);
          if (!cod || yaTiene.has(cod) || conditions.some(c => c.cie10_cod === cod)) return;
          conditions.push({ cie10_cod: cod, diagnostico: R.rotuloCie10(cod) || rotuloBase });
        });
      if (conditions.length) paciente.conditions = conditions;

      // Control de HOY: solo si la persona escribió algún valor (P3-01); su estado sale de ReglasClinicas (K3-01)
      const observacionesPrevias = cur && Array.isArray(cur.observations) ? cur.observations : [];
      if (hayControl) {
        const obs = { fecha_registro: fechaAtencion, estado_control: estadoHoy };
        if (med.pas !== null && med.pad !== null) { obs.pa_sistolica = med.pas; obs.pa_diastolica = med.pad; }
        if (med.hba1c !== null) obs.hba1c = med.hba1c;
        if (med.glucosa !== null) obs.glucosa = med.glucosa;
        paciente.observations = [obs, ...observacionesPrevias];
        paciente.fecha_ultimo_control = fechaAtencion;
        paciente.frecuencia_hearts = frecuencia;
        const mesCod = d.mesControl.value;
        if (mesCod && med.pas !== null && med.pad !== null) {
          paciente[`pas_${mesCod}`] = med.pas;
          paciente[`pad_${mesCod}`] = med.pad;
        }
      }

      // Próxima cita: solo se guarda una cita NUEVA (fecha distinta de las ya guardadas); a un fallecido no se le programa
      const citasPrevias = cur && Array.isArray(cur.appointments) ? cur.appointments : [];
      const fechaProxima = d.proximaCita.value;
      if (f.estado_paciente !== 'Fallecido' && R.parseFechaLocal(fechaProxima) && !citasPrevias.some(a => a && a.fecha_cita === fechaProxima)) {
        paciente.appointments = [{ fecha_cita: fechaProxima, estado: 'booked' }, ...citasPrevias];
        paciente.proxima_cita = fechaProxima;
      }

      // Variables calculadas: sin las que significan «no hay dato» ni las que dependen de algo que nadie registró
      const datos = this.datosParaCalculo(f, hayControl || this._mesesTocado);
      const calc = calculadora.calcularPadron(datos);
      const derivados = {};
      Object.keys(calc).forEach(k => {
        const v = calc[k];
        if (v === null || v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v))) return;
        if (typeof v === 'string' && /^Sin (dato|datos|fecha|cita)/i.test(v)) return;
        derivados[k] = v;
      });
      if (!paciente.sector) delete derivados.distrito_residencia;
      if (!((hayControl || this._mesesTocado) && R.tieneValor(f.meses_medicacion))) delete derivados.medicacion_hasta;
      if (paciente.sector && derivados.distrito_residencia) paciente.distrito = derivados.distrito_residencia;
      Object.assign(paciente, derivados);

      // Cómo queda el paciente en memoria: lo que ya tenía más lo enviado
      const local = Object.assign({}, cur || {}, paciente);
      local.observations = paciente.observations || observacionesPrevias;
      local.appointments = paciente.appointments || citasPrevias;
      local.conditions = [...(cur && Array.isArray(cur.conditions) ? cur.conditions : []), ...conditions];
      local.diagnosticos = [...new Set([...(cur && Array.isArray(cur.diagnosticos) ? cur.diagnosticos : []), ...conditions.map(c => c.cie10_cod)])];

      // Semáforo: se calcula aquí con la cita que quedará (el servidor, si no lo recibe, lo calcularía solo con lo enviado)
      if (typeof window !== 'undefined' && window.SemaforoHearts && typeof window.SemaforoHearts.calcularSemaforo === 'function') {
        const sem = window.SemaforoHearts.calcularSemaforo(local, new Date());
        Object.assign(paciente, conValor({ semaforo: sem.semaforo, dias_restantes: sem.dias_restantes, dias_vencido: sem.dias_vencido, fecha_limite: sem.fecha_limite }));
        Object.assign(local, paciente, { observations: local.observations, appointments: local.appointments, conditions: local.conditions, diagnosticos: local.diagnosticos });
      }
      return { paciente, local };
    }

    /**
     * Guarda la atención y sincroniza con el Padrón Estandarizado y el mapa territorial
     */
    async commitSave() {
      const d = this.dom;
      const tipoDocumento = d.tipoDoc.value || 'DNI';
      const dni = tipoDocumento === 'DNI'
        ? d.inputDni.value.trim().replace(/\D/g, '')
        : d.inputDni.value.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const nombres = d.nombres.value.trim();
      const direccion = d.direccion.value.trim();

      // Validaciones obligatorias
      if (tipoDocumento === 'DNI' ? !/^\d{8}$/.test(dni) : !/^[A-Z0-9]{6,15}$/.test(dni)) {
        alert(tipoDocumento === 'DNI'
          ? 'El documento es obligatorio: el DNI debe tener exactamente 8 dígitos.'
          : 'El documento es obligatorio: el carné de extranjería o pasaporte debe tener de 6 a 15 letras o dígitos.');
        d.inputDni.focus();
        return;
      }
      if (!nombres) {
        alert('Por favor ingrese los apellidos y nombres del paciente.');
        d.nombres.focus();
        return;
      }
      if (!d.fechaNac.value) {
        alert('Por favor ingrese la fecha de nacimiento.');
        d.fechaNac.focus();
        return;
      }
      if (!direccion) {
        alert('Por favor ingrese la dirección del paciente para su georreferenciación en Huarmey.');
        d.direccion.focus();
        return;
      }
      if (!d.consentimiento.value) {
        alert('Pregunte al paciente si autoriza recordatorios por WhatsApp y registre su respuesta (Sí o No). Se pregunta una sola vez.');
        d.consentimiento.focus();
        return;
      }
      const med = this.medicionesDeHoy();
      if ((med.pas === null) !== (med.pad === null)) {
        alert('Anote la presión sistólica y la diastólica juntas, o deje ambas en blanco si hoy no se midió.');
        (med.pas === null ? d.pasHoy : d.padHoy).focus();
        return;
      }

      d.btnGuardar.disabled = true;
      d.btnGuardar.textContent = '⏳ Guardando y geolocalizando...';

      try {
        // P3-05: un paciente «nuevo» pudo ser registrado por otra persona mientras se llenaba el formulario
        if (!this.isExistingPatient && window.app && typeof window.app.recargarPacientes === 'function') {
          try { await window.app.recargarPacientes(); } catch (e) { /* sin recarga: se sigue como antes */ }
          if (this.buscarEnMemoria(dni.toUpperCase())) {
            alert('Este paciente fue registrado por otro usuario después de su búsqueda. Pulse «Buscar» para ver sus datos actuales antes de guardar (así no se sobrescribe lo que ya registraron).');
            return;
          }
        }

        const perfil = this.perfilDelFormulario();
        const hayControl = this.hayControlHoy(med);
        const estadoHoy = hayControl ? R.estadoControl(med, perfil) : R.SIN_DATOS;
        const fechaAtencion = this.fechaAtencion();
        const calcPrevio = calculadora.calcularPadron(this.datosParaCalculo(this.getFormData(), hayControl));
        const frecuencia = R.frecuenciaDias(estadoHoy, calcPrevio.controlado_estable === 'Sí');

        // Ubicación: solo si el paciente es nuevo, cambió la dirección o aún no tiene coordenadas
        const cur = this.currentPatient;
        const tieneCoord = !!cur && R.tieneValor(cur.latitud) && R.tieneValor(cur.longitud);
        const direccionCambio = !!cur && direccion !== (this._base.direccion || '');
        const necesitaUbicar = !cur || direccionCambio || !tieneCoord;
        const geocoder = (typeof window !== 'undefined' && window.AncashGeocoder && typeof window.AncashGeocoder.geocode === 'function') ? window.AncashGeocoder : null;
        const geo = necesitaUbicar && geocoder ? geocoder.geocode(direccion) : { lat: null, lng: null, sector: null, matched: false };
        const ubicado = necesitaUbicar && !!geo && geo.matched === true && Number.isFinite(geo.lat) && Number.isFinite(geo.lng);

        const { paciente, local } = this.construirPaciente({ dni, tipoDocumento, nombres, direccion, med, hayControl, estadoHoy, frecuencia, fechaAtencion, geo, ubicado });

        // 1. Enviar al servidor: solo se da por guardado si el servidor lo confirma
        if (!(window.app && window.app.session && window.app.session.authFetch)) {
          throw new Error('No hay una sesión activa para guardar en el servidor.');
        }
        let respuesta;
        try {
          respuesta = await window.app.session.authFetch('/api/padron/importar-lote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patients: [paciente] })
          });
        } catch (e) {
          throw new Error('No se pudo conectar con el servidor. La atención no se guardó.');
        }
        if (!respuesta || !respuesta.ok) {
          let motivo = 'el servidor la rechazó';
          try {
            const cuerpo = await respuesta.json();
            const dg = cuerpo && cuerpo.issue && cuerpo.issue[0] && cuerpo.issue[0].diagnostics;
            if (typeof dg === 'string' && dg) motivo = dg;
          } catch (e) { /* sin cuerpo */ }
          const pista = (respuesta && respuesta.status === 403 && !this.isExistingPatient && !d.eessCtrl.value)
            ? ' Elija el «EESS que lo controla hoy» y vuelva a guardar.' : '';
          throw new Error(`La atención no se guardó: ${motivo} (código ${respuesta ? respuesta.status : 'sin respuesta'}).${pista}`);
        }

        // 2. Actualizar en memoria y mapa territorial
        const quedaSinUbicar = !ubicado && !tieneCoord;
        if (window.app) {
          const list = Array.isArray(window.app.patients) ? [...window.app.patients] : [];
          const idx = list.findIndex(p => String(p.dni || p.nro_documento) === dni);
          if (idx >= 0) list[idx] = local; else list.unshift(local);
          window.app.setPatients(list);
          window.app.render();

          if (typeof window.app.showToast === 'function') {
            window.app.showToast(quedaSinUbicar
              ? `✅ Atención de ${nombres} guardada. Su dirección no se pudo ubicar en el mapa: quedó sin ubicar.`
              : `🎉 ¡Atención de ${nombres} guardada${ubicado ? ' y georreferenciada' : ''} en el Padrón Estandarizado!`, quedaSinUbicar ? 'warning' : 'success', 5000);
          }
        }

        let mensaje = `✅ ¡Atención de ${nombres} guardada con éxito en el Padrón Estandarizado!`;
        if (quedaSinUbicar) mensaje += '\n\nAviso: no se pudo ubicar la dirección en el mapa; el paciente quedó sin ubicar (no aparece como pin). Revise la dirección en su ficha.';
        else if (!ubicado && direccionCambio) mensaje += '\n\nAviso: no se pudo ubicar la nueva dirección en el mapa; se conserva la ubicación anterior.';
        alert(mensaje);
        this.close();

      } catch (err) {
        alert('Error al guardar la atención: ' + err.message);
      } finally {
        d.btnGuardar.disabled = false;
        const iconSave = window.AppIcons ? window.AppIcons.checkCircle(16, '#FFFFFF') : '';
        d.btnGuardar.innerHTML = `<span>${iconSave}</span> Guardar Atención en Padrón`;
      }
    }
  }

  return new RegistroClinicoModal();
});
