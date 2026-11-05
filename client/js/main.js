/**
 * main.js (v2.1 UI/UX Enhanced & Scalable)
 * Orquestador principal del Frontend de Crónicos Huarmey (GeoRIS & HL7 FHIR)
 * Soporta jerarquía territorial completa: RIS Áncash -> Zonas Sanitarias -> Puertas de Entrada -> Hospital II-1
 * Con notificaciones Toast no bloqueantes, filtrado rápido interactivo y preparación para API Cloud.
 */

function escapeHtml(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
if (typeof window !== 'undefined') {
  window.escapeHtml = escapeHtml;
}

/**
 * Argumento seguro para un manejador en línea (onclick="f(...)"): cadena JSON escapada para el atributo HTML.
 * escapeHtml solo no basta: el navegador decodifica &#39; antes de ejecutar el JavaScript del atributo.
 */
function argJs(val) {
  return escapeHtml(JSON.stringify(String(val === null || val === undefined ? '' : val)));
}

class App {
  constructor() {
    this.mapManager = null;
    this.patients = [];
    this.patientMap = new Map();
    this.currentFilter = {
      diagnostico: 'ALL',
      semaforo: 'ALL',
      sector: 'ALL',
      puerta: 'ALL',
      search: ''
    };
    this.selectedRisId = 156;
    this.selectedZonaId = 'ALL';
    this.selectedPatientForPreCita = null;
    this.visibleLimit = 50;
    this._searchDebounceTimer = null;
    this.session = null; // T-03b: sesión con token (js/auth/session.js)
    this.authUi = null;  // T-03b: pantalla de acceso y gestión de usuarios (js/auth/authUi.js)
  }

  /** Endpoints activos (config.js). */
  apiEndpoints() {
    return (window.APP_CONFIG && window.APP_CONFIG.getApi()) || {};
  }

  /** Permisos del usuario con sesión (solo para mostrar u ocultar; el servidor decide con 401/403). */
  permisos() {
    const u = this.session ? this.session.getUser() : null;
    return window.AuthSession.permisosDe(u ? u.role : null);
  }

  /**
   * Indexa en memoria O(1) y pre-calcula tokens de búsqueda para soportar >10,000 pacientes sin latencia
   */
  setPatients(list) {
    this.patients = Array.isArray(list) ? list : [];
    // El semáforo guardado en el padrón queda vencido con el paso de los días: se recalcula siempre al cargar
    if (window.SemaforoHearts) {
      this.semaforosCorregidos = window.SemaforoHearts.aplicarSemaforo(this.patients, new Date());
    }
    this.patientMap.clear();
    for (let i = 0; i < this.patients.length; i++) {
      const p = this.patients[i];
      if (p.id) this.patientMap.set(String(p.id), p);
      if (p.dni) this.patientMap.set(String(p.dni), p);
      p._searchStr = `${p.dni || ''} ${p.historia_clinica || ''} ${p.apellidos_nombres || ''} ${p.direccion || ''} ${p.puerta_entrada || ''} ${p.sector_sanitario || ''}`.toLowerCase();
    }
    this.renderDashboard();
  }

  /**
   * Actualiza o agrega pacientes a la memoria sin reemplazar la lista existente.
   * Permite que la carga de archivos combine registros conservando los pacientes previos.
   */
  upsertPatients(incomingList) {
    if (!Array.isArray(incomingList) || incomingList.length === 0) return;
    const currentList = Array.isArray(this.patients) ? [...this.patients] : [];

    for (const incoming of incomingList) {
      const incomingDni = String(incoming.dni || incoming.nro_documento || '').replace(/\D/g, '');
      const incomingId = incoming.id ? String(incoming.id) : null;

      let foundIndex = -1;
      if (incomingDni) {
        foundIndex = currentList.findIndex(p => String(p.dni || p.nro_documento || '').replace(/\D/g, '') === incomingDni);
      }
      if (foundIndex === -1 && incomingId) {
        foundIndex = currentList.findIndex(p => String(p.id) === incomingId);
      }

      if (foundIndex >= 0) {
        const existing = currentList[foundIndex];
        const mergedObs = (incoming.observations && incoming.observations.length > 0)
          ? [...incoming.observations, ...(existing.observations || []).filter(eo => !incoming.observations.some(io => io.fecha_registro === eo.fecha_registro))]
          : (existing.observations || []);
        const mergedAppts = (incoming.appointments && incoming.appointments.length > 0)
          ? [...incoming.appointments, ...(existing.appointments || []).filter(ea => !incoming.appointments.some(ia => ia.fecha_cita === ea.fecha_cita))]
          : (existing.appointments || []);
        const mergedConds = (incoming.conditions && incoming.conditions.length > 0)
          ? incoming.conditions
          : (existing.conditions || []);

        const merged = {
          ...existing,
          ...incoming,
          observations: mergedObs,
          appointments: mergedAppts,
          conditions: mergedConds
        };
        // Un registro entrante sin coordenadas válidas no borra la ubicación que ya se mostraba, y una ubicación exacta
        // (GPS, mapa) no se reemplaza por otra aproximada si la dirección es la misma (igual que en el servidor)
        const geoU = window.GeoUbicacion;
        const geoC = window.AncashGeocoder;
        const mismaDir = !!geoC && geoC.claveDireccion(incoming.direccion || existing.direccion || '') === geoC.claveDireccion(existing.direccion || '');
        const conservarExacta = !!geoU && geoU.ubicacionEsExacta(existing) && mismaDir;
        if (geoU && (conservarExacta || !geoU.validarCoordenadas(incoming.latitud, incoming.longitud).ok)) {
          ['latitud', 'longitud', 'precision_geo', 'precision_m', 'geo_fuente', 'geo_toponimo', 'geo_fecha', 'geo_registrado_por'].forEach(k => {
            if (existing[k] !== undefined) merged[k] = existing[k]; else delete merged[k];
          });
        }
        currentList[foundIndex] = merged;
      } else {
        currentList.push(incoming);
      }
    }

    this.setPatients(currentList);
  }

  setBaseMapGlobal(type) {
    // Los dos selectores se sincronizan siempre, aunque el mapa base falle al cambiar
    const nombre = this.mapManager ? (this.mapManager.nombreMapaBase(type) || type) : type;
    const selTop = document.getElementById('select-basemap');
    const selSide = document.getElementById('select-basemap-sidebar');
    if (selTop && selTop.value !== nombre) selTop.value = nombre;
    if (selSide && selSide.value !== nombre) selSide.value = nombre;
    if (this.mapManager) {
      try {
        this.mapManager.setBaseMap(nombre);
      } catch (e) {
        console.error('No se pudo cambiar el mapa base:', e);
      }
    }
  }

  /**
   * Control ágil de apertura/cierre de ventanas laterales y pestañas de borde
   */
  toggleLeftSidebar(forceState) {
    const sidebar = document.getElementById('left-sidebar');
    const handle = document.getElementById('left-drawer-handle');
    const topBtn = document.getElementById('btn-toggle-layers');
    if (!sidebar) return;

    const shouldOpen = (typeof forceState === 'boolean') ? forceState : sidebar.classList.contains('collapsed');
    if (shouldOpen) {
      sidebar.classList.remove('collapsed');
      if (handle) {
        handle.classList.add('is-hidden');
        handle.setAttribute('aria-expanded', 'true');
      }
      if (topBtn) topBtn.classList.add('active');
      // En pantallas medianas y reducidas (<= 1400px), colapsar el padrón para no canibalizar el mapa
      if (window.innerWidth <= 1400) this.toggleHeartsPanel(false);
    } else {
      sidebar.classList.add('collapsed');
      if (handle) {
        handle.classList.remove('is-hidden');
        handle.setAttribute('aria-expanded', 'false');
      }
      if (topBtn) topBtn.classList.remove('active');
    }
    if (this.mapManager && this.mapManager.map) {
      setTimeout(() => this.mapManager.map.invalidateSize(), 300);
    }
  }

  toggleHeartsPanel(forceState) {
    const panel = document.getElementById('hearts-panel');
    const handle = document.getElementById('right-drawer-handle');
    const topBtn = document.getElementById('btn-toggle-hearts');
    const mapCtrls = document.querySelector('.georis-map-controls');
    if (!panel) return;

    const shouldOpen = (typeof forceState === 'boolean') ? forceState : panel.classList.contains('collapsed');
    if (shouldOpen) {
      panel.classList.remove('collapsed');
      if (handle) {
        handle.classList.add('is-hidden');
        handle.setAttribute('aria-expanded', 'true');
      }
      if (topBtn) topBtn.classList.add('active');
      if (mapCtrls && window.innerWidth > 768) mapCtrls.style.right = '454px';
      // En pantallas medianas y reducidas (<= 1400px), colapsar el panel de capas
      if (window.innerWidth <= 1400) this.toggleLeftSidebar(false);
    } else {
      panel.classList.add('collapsed');
      if (handle) {
        handle.classList.remove('is-hidden');
        handle.setAttribute('aria-expanded', 'false');
      }
      if (topBtn) topBtn.classList.remove('active');
      if (mapCtrls) mapCtrls.style.right = '16px';
      document.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('active'));
    }
  }

  closeAllDrawers() {
    this.toggleLeftSidebar(false);
    this.toggleHeartsPanel(false);
  }

  toggleNavRail(forceState) {
    const rail = document.getElementById('app-nav-rail');
    if (!rail) return;
    const isExpanded = (typeof forceState === 'boolean') ? forceState : !rail.classList.contains('expanded');
    rail.classList.toggle('expanded', isExpanded);
  }

  switchView(viewName) {
    const viewMap = document.getElementById('view-map');
    const viewDash = document.getElementById('view-dashboard');
    const tabMapa = document.getElementById('rail-tab-mapa');
    const tabDash = document.getElementById('rail-tab-dashboard');

    if (viewName === 'dashboard') {
      if (viewMap) viewMap.classList.add('is-hidden');
      if (viewDash) viewDash.classList.add('active-view');
      if (tabMapa) tabMapa.classList.remove('active');
      if (tabDash) tabDash.classList.add('active');
      this.closeAllDrawers();
      this.renderDashboard();
      this.loadIndicadoresConvenio();
    } else {
      if (viewDash) viewDash.classList.remove('active-view');
      if (viewMap) viewMap.classList.remove('is-hidden');
      if (tabDash) tabDash.classList.remove('active');
      if (tabMapa) tabMapa.classList.add('active');
      if (this.mapManager && this.mapManager.map) {
        setTimeout(() => this.mapManager.map.invalidateSize(), 150);
      }
    }
  }

  abrirModalPadronGrid() {
    const fileInput = document.getElementById('hosix-file-input');
    if (window.PadronGridModal && window.PadronGridModal.patients && window.PadronGridModal.patients.length > 0) {
      window.PadronGridModal.open();
    } else if (fileInput) {
      fileInput.value = '';
      fileInput.click();
    } else if (window.PadronGridModal && typeof window.PadronGridModal.open === 'function') {
      window.PadronGridModal.open();
    }
  }

  abrirRegistroClinico() {
    if (window.RegistroClinicoModal) {
      window.RegistroClinicoModal.open();
    }
  }

  renderDashboard() {
    const list = this.patients || [];
    const total = list.length;
    
    // Contadores de semáforo
    let green = 0, yellow = 0, red = 0, purple = 0, black = 0;
    // Control de presión arterial: definición HEARTS = la última medición < 140/90, sobre quienes tienen una medición
    let controlled = 0;
    let conPa = 0;
    
    // Contadores por diagnóstico CIE-10
    let countHTA = 0, countDM = 0, countERC = 0, countDislip = 0, countObes = 0;
    
    // Distribución por IPRESS
    const ipressMap = new Map();

    for (const p of list) {
      if (p.fallecido || p.semaforo === 'black') black++;
      else if (p.semaforo === 'green') green++;
      else if (p.semaforo === 'yellow') yellow++;
      else if (p.semaforo === 'red') red++;
      else if (p.semaforo === 'purple' || p.fuente === 'HOSIX') purple++;
      else green++;

      const obs = (Array.isArray(p.observations) && p.observations.length > 0) ? p.observations[0] : null;
      const pas = Number(p.pa_sistolica != null ? p.pa_sistolica : (obs ? obs.pa_sistolica : null));
      const pad = Number(p.pa_diastolica != null ? p.pa_diastolica : (obs ? obs.pa_diastolica : null));
      const hasValidBp = !isNaN(pas) && !isNaN(pad) && pas > 0 && pad > 0;
      const isControlled = hasValidBp && pas < 140 && pad < 90;
      const cuenta = !p.fallecido && p.semaforo !== 'black';
      if (hasValidBp && cuenta) conPa++;
      if (isControlled && cuenta) {
        controlled++;
      }

      const diags = ((p.diagnosticos || []).concat((p.conditions || []).map(c => c.cie10_cod || ''))).join(' ');
      if (diags.includes('I1')) countHTA++;
      if (diags.includes('E1')) countDM++;
      if (diags.includes('N18')) countERC++;
      if (diags.includes('E78')) countDislip++;
      if (diags.includes('E66')) countObes++;

      const ipressName = p.puerta_entrada || p.establecimiento_adscripcion || 'Hospital de Apoyo Huarmey';
      const ipressClave = p.puerta_entrada_id || ipressName;
      if (!ipressMap.has(ipressClave)) {
        // La categoría sale del catálogo oficial por código RENIPRESS, no del nombre
        const cat = (window.ESTABLECIMIENTOS_HUARMEY || []).find(e => e.cod_renipress === p.puerta_entrada_id);
        ipressMap.set(ipressClave, { nombre: cat && cat.nombre ? cat.nombre : ipressName, categoria: cat ? cat.categoria : null, total: 0, controlled: 0, conPa: 0, red: 0 });
      }
      const entry = ipressMap.get(ipressClave);
      entry.total++;
      if (hasValidBp && cuenta) entry.conPa++;
      if (isControlled && cuenta) entry.controlled++;
      if (p.semaforo === 'red') entry.red++;
    }

    const pctControlled = conPa > 0 ? Math.round((controlled / conPa) * 100) : 0;

    // Actualizar Hero Cards
    const elTotal = document.getElementById('dash-val-total');
    const elControl = document.getElementById('dash-val-control');
    const elDesercion = document.getElementById('dash-val-desercion');
    const elProximos = document.getElementById('dash-val-proximos');
    if (elTotal) elTotal.textContent = total;
    if (elControl && !this._heroDelServidor) elControl.textContent = `${pctControlled}%`;
    if (elDesercion) elDesercion.textContent = red;
    if (elProximos) elProximos.textContent = yellow;

    // Actualizar Barra HEARTS
    const segGreen = document.getElementById('bar-seg-green');
    const segYellow = document.getElementById('bar-seg-yellow');
    const segRed = document.getElementById('bar-seg-red');
    const segPurple = document.getElementById('bar-seg-purple');
    const segBlack = document.getElementById('bar-seg-black');
    if (total > 0) {
      if (segGreen) segGreen.style.width = `${(green / total) * 100}%`;
      if (segYellow) segYellow.style.width = `${(yellow / total) * 100}%`;
      if (segRed) segRed.style.width = `${(red / total) * 100}%`;
      if (segPurple) segPurple.style.width = `${(purple / total) * 100}%`;
      if (segBlack) segBlack.style.width = `${(black / total) * 100}%`;
    }
    const cG = document.getElementById('dash-count-green');
    const cY = document.getElementById('dash-count-yellow');
    const cR = document.getElementById('dash-count-red');
    const cP = document.getElementById('dash-count-purple');
    const cB = document.getElementById('dash-count-black');
    if (cG) cG.textContent = green;
    if (cY) cY.textContent = yellow;
    if (cR) cR.textContent = red;
    if (cP) cP.textContent = purple;
    if (cB) cB.textContent = black;

    // Actualizar Lista de Patologías
    const pathList = document.getElementById('dash-pathology-list');
    if (pathList) {
      const pathologies = [
        { name: 'Hipertensión Arterial Esencial (I10)', count: countHTA, color: '#1A73E8' },
        { name: 'Diabetes Mellitus Tipo 2 (E11)', count: countDM, color: '#F29900' },
        { name: 'Enfermedad Renal Crónica (N18)', count: countERC, color: '#9334E6' },
        { name: 'Dislipidemia Mixta / Hipercolesterolemia (E78)', count: countDislip, color: '#1E8E3E' },
        { name: 'Obesidad y Sobrepeso Clínico (E66)', count: countObes, color: '#D93025' }
      ];
      pathList.innerHTML = pathologies.map(item => {
        const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
        return `
          <div>
            <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:4px;">
              <span style="font-weight:500; color:var(--text-main);">${item.name}</span>
              <span style="font-weight:600; color:var(--text-secondary);">${item.count} pac. (${pct}%)</span>
            </div>
            <div style="height:6px; border-radius:3px; background:var(--slate-100); overflow:hidden;">
              <div style="height:100%; width:${pct}%; background:${item.color}; border-radius:3px;"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Actualizar Tabla por IPRESS
    const ipressTbody = document.getElementById('dash-ipress-tbody');
    if (ipressTbody) {
      const rows = [];
      ipressMap.forEach((data) => {
        const name = data.nombre;
        const pct = data.conPa > 0 ? Math.round((data.controlled / data.conPa) * 100) : null;
        const categoria = data.categoria || 'Sin dato';
        rows.push(`
          <tr>
            <td><strong>${window.escapeHtml(name)}</strong></td>
            <td><span class="badge-diag">${categoria}</span></td>
            <td><strong>${data.total}</strong></td>
            <td><span style="color:var(--hearts-green-text); font-weight:600;">${data.controlled}</span></td>
            <td><span style="color:var(--hearts-red-text); font-weight:600;">${data.red}</span></td>
            <td>
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-weight:600; min-width:32px;">${pct === null ? 'Sin dato' : pct + '%'}</span>
                <div style="flex:1; height:6px; background:var(--slate-100); border-radius:3px; overflow:hidden; min-width:60px;">
                  <div style="height:100%; width:${pct === null ? 0 : pct}%; background:var(--google-blue);"></div>
                </div>
              </div>
            </td>
            <td>
              <button class="btn-export-mini" onclick="window.app.switchView('mapa'); window.app.toggleHeartsPanel(true);" title="Ver pacientes en mapa">Ver en Mapa</button>
            </td>
          </tr>
        `);
      });
      ipressTbody.innerHTML = rows.join('');
    }
  }

  switchHeartsTab(tabName) {
    const tabPac = document.getElementById('tab-pacientes');
    const tabIng = document.getElementById('tab-ingesta');
    const btnPac = document.getElementById('tab-btn-pacientes');
    const btnIng = document.getElementById('tab-btn-ingesta');
    if (!tabPac || !tabIng) return;

    if (tabName === 'ingesta') {
      tabPac.style.display = 'none';
      tabPac.classList.remove('active-pane');
      tabIng.style.display = 'block';
      if (btnPac) btnPac.classList.remove('active');
      if (btnIng) btnIng.classList.add('active');
    } else {
      tabPac.style.display = 'flex';
      tabPac.classList.add('active-pane');
      tabIng.style.display = 'none';
      if (btnPac) btnPac.classList.add('active');
      if (btnIng) btnIng.classList.remove('active');
    }
  }

  init() {
    // 0. Sesión (T-03b): sin sesión válida no se pide ningún dato; la pantalla de acceso tapa la aplicación
    this.session = window.AuthSession.create({
      getEndpoints: () => this.apiEndpoints(),
      onExpired: () => this.authUi.alVencer()
    });
    this.authUi = window.AuthUi.create({ app: this });

    // 1. Inicializar Mapa con Leaflet, Aceleración Canvas y Capas GeoRIS
    this.mapManager = new window.MapManager('map');
    this.mapManager.init();

    // 2. Poblar selectores territoriales iniciales (RIS 156 Pacífico Sur)
    this.poblarSelectoresTerritoriales();

    // 3. Vincular Eventos de Interfaz y Filtros
    this.bindEvents();

    // 4. Registrar Service Worker para PWA en Android
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('PWA Service Worker registrado'))
        .catch(err => console.log('SW error:', err));
    }

    // 5. Acceso: restaura la sesión guardada o pide usuario y clave. Los datos se cargan en onLogin().
    this.authUi.iniciar();
  }

  /** Llamado por authUi cuando hay una sesión válida (acceso nuevo o restaurada). */
  onLogin(user) {
    this.limpiarSesion();
    const p = this.permisos();
    this.showToast(`Bienvenido(a), ${escapeHtml(user.nombre)}`, 'info', 3000);
    if (p.verPacientes) {
      this.loadInitialData();
    } else if (p.verResumen) {
      this.loadResumenDashboard();
    }
  }

  /** Vuelve los filtros y el buscador a su estado inicial. */
  resetFiltros() {
    this.currentFilter = { diagnostico: 'ALL', semaforo: 'ALL', sector: 'ALL', puerta: 'ALL', search: '' };
    this.visibleLimit = 50;
    if (this._searchDebounceTimer) clearTimeout(this._searchDebounceTimer);
    document.querySelectorAll('[data-filter-diag]').forEach(b => b.classList.toggle('active', b.dataset.filterDiag === 'ALL'));
    document.querySelectorAll('[data-filter-semaforo]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('active'));
    const search = document.getElementById('search-input');
    if (search) search.value = '';
    const clear = document.getElementById('btn-clear-search');
    if (clear) clear.style.display = 'none';
    const file = document.getElementById('hosix-file-input');
    if (file) file.value = '';
  }

  /**
   * Borra de la memoria y de la pantalla todo lo que venga de pacientes (al salir, al vencer la sesión
   * y antes de cargar los datos de otro usuario), para que nadie vea datos de la sesión anterior.
   */
  limpiarSesion() {
    this._heroDelServidor = false;
    this.patients = [];
    this.patientMap.clear();
    this.semaforosCorregidos = 0;
    this.selectedPatientForPreCita = null;
    if (window.AlertsManager) window.AlertsManager.precitas = [];
    this.resetFiltros();

    this.cerrarModalUbicacion(); // detiene el GPS y sus temporizadores
    if (this.mapManager) {
      if (this.mapManager.seleccion) this.mapManager.finalizarSeleccionUbicacion();
      if (this.mapManager.measuring) this.mapManager.setMedicion(false, true);
      if (this.mapManager.limpiarFoco) this.mapManager.limpiarFoco();
      const capa = this.mapManager.layers && this.mapManager.layers.pacientes;
      if (capa) capa.clearLayers();
      if (this.mapManager.map) this.mapManager.map.closePopup();
      if (this.mapManager.searchPin && this.mapManager.map) {
        this.mapManager.map.removeLayer(this.mapManager.searchPin);
        this.mapManager.searchPin = null;
      }
    }

    ['modal-patient-detail', 'reference-inspector-card', 'modal-ubicacion'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    const modalPre = document.getElementById('modal-precita');
    if (modalPre) modalPre.classList.remove('active');
    const avisos = document.getElementById('toast-container'); // un aviso de pre-cita puede nombrar a un paciente
    if (avisos) avisos.innerHTML = '';
    const lista = document.getElementById('patient-list');
    if (lista) lista.innerHTML = '';
    const sub = document.getElementById('patient-count-subtitle');
    if (sub) sub.textContent = 'Cargando pacientes...';
    const cnt = document.getElementById('filter-active-label');
    if (cnt) cnt.textContent = '';
    this._setKpiValores(0, 0, 0, 0, 0);
    this.closeAllDrawers();
  }

  _setKpiValores(total, green, yellow, red, purple) {
    const valores = { 'kpi-total': total, 'kpi-green': green, 'kpi-yellow': yellow, 'kpi-red': red, 'kpi-purple': purple };
    Object.keys(valores).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = valores[id];
    });
  }

  /** DIRECTOR: solo totales de su red (GET /api/alerts/summary), sin datos individuales. */
  async loadResumenDashboard() {
    const token = this.session.getToken();
    const url = this.apiEndpoints().API_ALERTS_SUMMARY || '/api/alerts/summary';
    try {
      const res = await this.session.authFetch(url);
      if (this.session.getToken() !== token) return;
      if (!res.ok) {
        if (res.status !== 401) this.showToast(`No se pudo cargar el resumen de su red (código ${res.status}).`, 'danger', 5000);
        return;
      }
      const r = await res.json();
      if (this.session.getToken() !== token) return;
      const a = r.alertas || {};
      this._setKpiValores(r.total_pacientes || 0, a.vigentes_verde || 0, a.proximos_amarillo || 0, a.desertores_rojo || 0, a.hosix_brecha_morado || 0);
    } catch (e) {
      this.showToast('No se pudo conectar con el servidor para cargar el resumen.', 'warning', 5000);
    }
  }

  /**
   * Sistema de Notificaciones Toast no bloqueante (Reemplaza a window.alert)
   */
  showToast(message, type = 'info', duration = 4000) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (window.AppIcons) {
      if (type === 'success') iconSvg = window.AppIcons.checkCircle(16, '#1E8E3E');
      else if (type === 'warning') iconSvg = window.AppIcons.alertTriangle(16, '#F29900');
      else if (type === 'danger') iconSvg = window.AppIcons.alertTriangle(16, '#D93025');
      else iconSvg = window.AppIcons.clipboardCheck(16, '#1A73E8');
    }

    const iconSpan = document.createElement('span');
    if (iconSvg) {
      iconSpan.innerHTML = iconSvg;
    } else {
      let icon = 'ℹ️';
      if (type === 'success') icon = '✅';
      else if (type === 'warning') icon = '⚠️';
      else if (type === 'danger') icon = '🔴';
      iconSpan.textContent = icon;
    }

    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    toast.appendChild(iconSpan);
    toast.appendChild(document.createTextNode(' '));
    toast.appendChild(msgSpan);
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  poblarSelectoresTerritoriales() {
    const selectRis = document.getElementById('select-ris');
    if (selectRis && window.GeorisTerritory) {
      const allRis = window.GeorisTerritory.getAllRis();
      selectRis.innerHTML = `
        <option value="ALL">-- Todas las RIS de Áncash (7 Redes) --</option>
        ${allRis.map(r => `<option value="${r.id_ris}" ${r.id_ris === 156 ? 'selected' : ''}>${r.nombre} (N° ${r.id_ris})</option>`).join('')}
      `;
    }

    this.actualizarSelectorZonas(156);
    this.actualizarSelectorPuertas(156, 'ALL');
    this.actualizarSelectorHospitales('00001741');
    this.actualizarPanelInfoRis(156);
  }

  selectRis(risId) {
    this.selectedRisId = risId;
    this.selectedZonaId = 'ALL';
    const selectRis = document.getElementById('select-ris');
    if (selectRis && String(selectRis.value) !== String(risId)) selectRis.value = String(risId);

    this.actualizarSelectorZonas(risId);
    this.actualizarSelectorPuertas(risId, 'ALL');
    this.mapManager.flyToRis(risId);
    this.actualizarPanelInfoRis(risId);
  }

  /** Opciones de zona con su RIS («156|6»): el número de zona se repite entre las 7 RIS. */
  actualizarSelectorZonas(risId) {
    const selectZona = document.getElementById('select-zona');
    if (!selectZona || !window.GeorisTerritory) return;

    const zonas = window.GeorisTerritory.getZonasByRis(risId);
    const todas = risId === 'ALL';
    selectZona.innerHTML = `
      <option value="ALL" selected>-- Todas las Zonas Sanitarias (${zonas.length}) --</option>
      ${zonas.map(z => `<option value="${escapeHtml(z.id_ris)}|${escapeHtml(z.id_zona)}">${todas ? `${escapeHtml(z.ris)} · ` : ''}ZONA ${escapeHtml(z.id_zona)}: ${escapeHtml(z.distrito || z.cabecera)}</option>`).join('')}
    `;
  }

  /** zonaValor: 'ALL', 'ris|zona' o solo el número de zona (de la RIS elegida). */
  selectZona(zonaValor) {
    let risId = this.selectedRisId;
    let zonaId = zonaValor;
    if (typeof zonaValor === 'string' && zonaValor.includes('|')) {
      const partes = zonaValor.split('|');
      risId = partes[0];
      zonaId = partes[1];
    }
    if (zonaId !== 'ALL' && String(risId) !== String(this.selectedRisId)) {
      // Elegir una zona de otra RIS (o desde «Todas las RIS») deja seleccionada esa RIS
      this.selectedRisId = risId;
      const selectRis = document.getElementById('select-ris');
      if (selectRis) selectRis.value = String(risId);
      this.actualizarSelectorZonas(risId);
      this.actualizarPanelInfoRis(risId);
    }
    this.selectedZonaId = zonaId;
    const selectZona = document.getElementById('select-zona');
    const valorSelect = zonaId === 'ALL' ? 'ALL' : `${risId}|${zonaId}`;
    if (selectZona && selectZona.value !== valorSelect) selectZona.value = valorSelect;
    this.actualizarSelectorPuertas(risId, zonaId);
    this.mapManager.flyToZona(zonaId, risId);
    this.actualizarPanelInfoZona(risId, zonaId);
  }

  /** Puertas de entrada y establecimientos vinculados de la RIS y zona elegidas. */
  actualizarSelectorPuertas(risId, zonaId) {
    const selectPuerta = document.getElementById('select-puerta');
    if (!selectPuerta || !window.GeorisTerritory) return;

    const G = window.GeorisTerritory;
    const lista = [];
    const vistos = new Set();
    const agregar = e => { if (!vistos.has(e.cod_renipress)) { vistos.add(e.cod_renipress); lista.push(e); } };
    const incluyeHuarmey = (risId === 'ALL' || String(risId) === '156') && (!zonaId || zonaId === 'ALL' || String(zonaId) === '6');
    if (incluyeHuarmey) G.getHuarmeyNetwork().puertas.forEach(agregar);
    G.getPuertasEntrada(risId, zonaId).forEach(agregar);
    if (G.getVinculados) G.getVinculados(risId, zonaId).forEach(agregar);

    selectPuerta.innerHTML = `
      <option value="ALL">-- Seleccionar Puerta de Entrada o Vinculado (${lista.length}) --</option>
      ${lista.map(p => `<option value="${escapeHtml(p.cod_renipress)}">${escapeHtml(p.nombre)} (${escapeHtml(p.categoria || 'I-1')})${p.rol_georis === 'Establecimiento Vinculado' ? ' · vinculado' : ''}</option>`).join('')}
    `;
  }

  /** Opciones de hospital de referencia generadas desde GeoRIS (códigos RENIPRESS reales). */
  actualizarSelectorHospitales(codSeleccionado) {
    const sel = document.getElementById('select-hospital');
    if (!sel || !window.GeorisTerritory) return;
    const hospitales = window.GeorisTerritory.getHospitalesArea('ALL')
      .sort((a, b) => (a.cod_renipress === '00001741' ? -1 : b.cod_renipress === '00001741' ? 1 : String(a.ris).localeCompare(String(b.ris)) || String(a.nombre).localeCompare(String(b.nombre))));
    sel.innerHTML = hospitales.map(h => `<option value="${escapeHtml(h.cod_renipress)}" ${h.cod_renipress === codSeleccionado ? 'selected' : ''}>${escapeHtml(h.nombre)} (${escapeHtml(h.categoria)}) · ${escapeHtml(h.ris)}</option>`).join('');
  }

  selectPuertaEntrada(codReni) {
    if (!codReni || codReni === 'ALL') return;
    this.trazarReferenciaHaciaHospital(codReni);
  }

  seleccionarHospitalReferencia(codReni) {
    if (!codReni || !window.GeorisTerritory) return;

    const hospArea = window.GeorisTerritory.getHospitalByCode
      ? window.GeorisTerritory.getHospitalByCode(codReni)
      : window.GeorisTerritory.getHospitalesArea('ALL').find(h => h.cod_renipress === codReni);
    if (!hospArea) {
      this.showToast(`El hospital ${codReni} no figura en las capas GeoRIS.`, 'warning');
      return;
    }
    const sel = document.getElementById('select-hospital');
    if (sel && sel.value !== codReni) sel.value = codReni;

    this.mapManager.flyTo(hospArea.lat, hospArea.lng, 15);

    if (codReni === "00001741") {
      this.mapManager.renderLineasDeReferencia();
      this.mostrarCardHospitalHuarmey(hospArea);
    } else {
      this.showToast(`Establecimiento de Área: ${hospArea.nombre} (${hospArea.ris})`, "info");
    }
  }

  actualizarPanelInfoRis(risId) {
    const panel = document.getElementById('zona-info-panel');
    if (!panel) return;

    // Cifras calculadas del bundle GeoRIS (no escritas a mano)
    const G = window.GeorisTerritory;
    if (risId === 'ALL') {
      const t = G.getResumenAncash ? G.getResumenAncash() : null;
      if (!t) return;
      panel.innerHTML = `
        <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:6px; padding:10px; margin-top:8px; font-size:var(--font-xs); line-height:var(--lh-normal);">
          <strong style="color:#0369a1;">DEPARTAMENTO DE ÁNCASH (${t.ris} RIS)</strong><br>
          • <strong>Población Total:</strong> ${t.poblacion.toLocaleString('es-PE')} hab. | ${t.familias.toLocaleString('es-PE')} familias<br>
          • <strong>Zonas Sanitarias:</strong> ${t.zonas} | <strong>Sectores:</strong> ${t.sectores} (polígonos cargados: ${t.sectores_con_poligono}, solo Pacífico Sur)<br>
          • <strong>Hospitales de Área:</strong> ${t.hospitales} II-1 / II-2 | <strong>Cabeceras:</strong> ${t.cabeceras}<br>
          • <strong>Puertas de entrada:</strong> ${t.puertas} | <strong>Vinculados:</strong> ${t.vinculados}
        </div>
      `;
      return;
    }

    const r = G.getRisById(risId);
    if (r) {
      const conPoligono = G.getSectoresConPoligono ? G.getSectoresConPoligono(risId) : r.sectores_count;
      const avisoSectores = conPoligono < r.sectores_count
        ? `<br><span style="color:#b45309;">⚠️ GeoRIS de este prototipo no trae los polígonos de los ${escapeHtml(r.sectores_count)} sectores de esta RIS: se dibujan zonas y establecimientos.</span>`
        : '';
      panel.innerHTML = `
        <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:6px; padding:10px; margin-top:8px; font-size:var(--font-xs); line-height:var(--lh-normal);">
          <strong style="color:#0369a1;">${escapeHtml(r.nombre)} (N° ${escapeHtml(r.id_ris)})</strong><br>
          • <strong>Población:</strong> ${escapeHtml(r.poblacion)} hab. | ${escapeHtml(r.familias)} familias<br>
          • <strong>Zonas Sanitarias:</strong> ${escapeHtml(r.zonas_count)} | <strong>Sectores:</strong> ${escapeHtml(r.sectores_count)}<br>
          • <strong>Hospitales de Área:</strong> ${escapeHtml(r.hospitales)}${avisoSectores}
        </div>
      `;
    }
  }

  actualizarPanelInfoZona(risId, zonaId) {
    const panel = document.getElementById('zona-info-panel');
    if (!panel) return;

    if (zonaId === 'ALL') {
      this.actualizarPanelInfoRis(risId);
      return;
    }

    const zonas = window.GeorisTerritory.getZonasByRis(risId);
    const z = zonas.find(item => item.id_zona === parseInt(zonaId, 10));

    if (z) {
      panel.innerHTML = `
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:10px; margin-top:8px; font-size:var(--font-xs); line-height:var(--lh-normal);">
          <strong style="color:#047857;">ZONA ${escapeHtml(z.id_zona)}: ${escapeHtml(z.distrito || z.cabecera)}</strong><br>
          • <strong>Cabecera:</strong> ${escapeHtml(z.cabecera)} (${escapeHtml(z.categoria)})<br>
          • <strong>Cód. RENIPRESS:</strong> ${escapeHtml(z.cod_renipress)}<br>
          • <strong>Población Asignada:</strong> ${escapeHtml(z.poblacion)} hab. | ${escapeHtml(z.familias)} familias<br>
          • <strong>Sectores Sanitarios:</strong> ${escapeHtml(z.sectores_count)}${window.GeorisTerritory.getSectoresByZona(zonaId, risId).length ? '' : ' <span style="color:#b45309;">(sin polígonos en este prototipo)</span>'}
        </div>
      `;
    }
  }

  /**
   * Traza la referencia de un establecimiento hacia SU hospital de referencia (cod_hos de GeoRIS).
   * La red de Huarmey va al Nuevo Hospital de Apoyo Huarmey; las demás, a su propio hospital.
   */
  trazarReferenciaHaciaHospital(esCod) {
    if (!window.GeorisTerritory) return;
    const G = window.GeorisTerritory;
    const net = G.getHuarmeyNetwork();
    let es = net.puertas.find(e => e.cod_renipress === esCod);
    let hosp = es ? net.hospital : null;
    if (!es && net.cabecera.cod_renipress === esCod) {
      es = net.cabecera;
      hosp = net.hospital;
    }
    if (!es) {
      const candidatos = [
        ...G.getPuertasEntrada('ALL', 'ALL'),
        ...(G.getVinculados ? G.getVinculados('ALL', 'ALL') : []),
        ...G.getEessZona('ALL')
      ];
      es = candidatos.find(p => p.cod_renipress === esCod) || null;
      if (es) {
        const h = G.getHospitalByCode ? G.getHospitalByCode(es.cod_hos) : null;
        if (h) {
          hosp = h;
          const distKm = window.haversineDistance(es.lat, es.lng, h.lat, h.lng);
          const minutos = window.estimateTravelTimeMinutes(distKm);
          es = { ...es, distancia_hospital_km: distKm, tiempo_traslado_min: minutos, tiempo_traslado_txt: window.formatMinutes(minutos) };
        }
      }
    }

    if (!es) {
      this.showToast('El establecimiento no figura en las capas GeoRIS.', 'warning');
      return;
    }
    if (!hosp) {
      this.showToast(`${es.nombre}: GeoRIS no indica su hospital de referencia.`, 'warning');
      return;
    }
    this.mapManager.resaltarReferencia(es, hosp);
    this.mostrarCardInspectorReferencia(es, hosp);
  }

  mostrarCardInspectorReferencia(es, hosp) {
    let card = document.getElementById('reference-inspector-card');
    if (!card) {
      card = document.createElement('div');
      card.id = 'reference-inspector-card';
      card.className = 'reference-inspector-card';
      document.body.appendChild(card);
    }

    const distKm = es.distancia_hospital_km || window.haversineDistance(es.lat, es.lng, hosp.lat, hosp.lng);
    const tiempoMin = es.tiempo_traslado_min || window.estimateTravelTimeMinutes(distKm);
    const tiempoTxt = es.tiempo_traslado_txt || window.formatMinutes(tiempoMin);
    const cumple = tiempoMin <= 240;

    const verPac = this.permisos().verPacientes;
    const pacCount = verPac ? this.patients.filter(p => String(p.puerta_entrada_id || '') === String(es.cod_renipress)).length : null;

    card.innerHTML = `
      <div class="ref-card-header">
        <div style="display:flex; align-items:center; gap:8px;">
          ${window.AppIcons ? window.AppIcons.layers(18, '#0284c7') : '<span>📐</span>'}
          <span style="font-weight:700;">INSPECTOR DE REFERENCIA GEORIS</span>
        </div>
        <button type="button" class="btn-close-accessible" aria-label="Cerrar inspector de referencia" onclick="document.getElementById('reference-inspector-card').remove(); window.app.mapManager.limpiarResaltado();">✕</button>
      </div>
      <div class="ref-card-body">
        <div style="font-size:var(--font-sm); margin-bottom:8px;">
          <strong>Origen:</strong> <span style="color:#0284c7; font-weight:700;">${escapeHtml(es.nombre)} (${escapeHtml(es.categoria || 'I-1')})</span><br>
          <strong>Destino:</strong> <span style="color:#9F1239; font-weight:700;">${escapeHtml(hosp.nombre)} (${escapeHtml(hosp.categoria)})</span>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:8px; background:var(--slate-50); padding:8px; border-radius:6px; border:1px solid var(--border-subtle);">
          <div>
            <span style="font-size:var(--font-xs); color:var(--text-muted); display:block;">Distancia en línea recta:</span>
            <span style="font-size:var(--font-md); font-weight:800; color:var(--text-main);">${distKm} km</span>
          </div>
          <div>
            <span style="font-size:var(--font-xs); color:var(--text-muted); display:block;">Tiempo Traslado:</span>
            <span style="font-size:var(--font-md); font-weight:800; color:#0284c7;">~${tiempoTxt}</span>
          </div>
        </div>
        <div style="font-size:var(--font-xs); margin-bottom:8px; line-height:var(--lh-normal);">
          <strong>Estándar GeoRIS D.S. 019-2024-SA:</strong><br>
          • Traslado al E.S. de Área: <span style="color:${cumple ? '#047857' : '#9F1239'}; font-weight:700; display:inline-flex; align-items:center; gap:4px;">${cumple ? `${window.AppIcons ? window.AppIcons.checkCircle(13, '#047857') : '✓'} Cumple (&lt; 4h)` : `${window.AppIcons ? window.AppIcons.alertTriangle(13, '#9F1239') : '⚠️'} Excede (&gt; 4h)`}</span><br>
          • Pacientes Crónicos en Jurisdicción: <strong>${verPac ? pacCount + ' pacientes' : 'no disponible para su rol'}</strong>
        </div>
        <div style="display:flex; gap:6px;">
          ${verPac ? `<button class="btn-mini btn-precita" style="flex:1;" onclick="window.app.filtrarPorPuerta('${escapeHtml(es.cod_renipress)}')">Ver Pacientes</button>` : ''}
          <button class="btn-mini btn-ubicar" onclick="window.app.mapManager.home()">Vista General</button>
        </div>
      </div>
    `;

    card.style.display = 'block';
  }

  mostrarCardHospitalHuarmey(hosp) {
    let card = document.getElementById('reference-inspector-card');
    if (!card) {
      card = document.createElement('div');
      card.id = 'reference-inspector-card';
      card.className = 'reference-inspector-card';
      document.body.appendChild(card);
    }

    card.innerHTML = `
      <div class="ref-card-header" style="background:linear-gradient(135deg, #FFF1F2 0%, #FFE4E6 100%); color:#9F1239; border-bottom:1px solid #FECDD3;">
        <div style="display:flex; align-items:center; gap:8px;">
          ${window.AppIcons ? window.AppIcons.hospital(18, '#9F1239') : ''}
          <span style="font-weight:700;">NUEVO HOSPITAL DE APOYO HUARMEY (II-1)</span>
        </div>
        <button type="button" class="btn-close-accessible" aria-label="Cerrar ficha de hospital" onclick="document.getElementById('reference-inspector-card').remove()">✕</button>
      </div>
      <div class="ref-card-body">
        <div style="font-size:var(--font-sm); margin-bottom:8px;">
          <strong>Rol GeoRIS:</strong> Techo Resolutivo Provincial (Puesta en Marcha)<br>
          <strong>Ubicación:</strong> <span style="color:#0369a1; font-weight:700;">AA.HH. Miramar / Santo Domingo Ampliación (detrás de Hotel La Siesta)</span><br>
          <strong>Terreno Oficial:</strong> 11,325.98 m² (Complejo moderno de 3 niveles)<br>
          <strong>Cód. RENIPRESS:</strong> 00001741 | <strong>Categoría:</strong> II-1
        </div>
        <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:8px; font-size:var(--font-xs); margin-bottom:8px; line-height:var(--lh-normal);">
          • <strong>Cartera Crónicos HEARTS:</strong> Consultorio Medicina Interna, Cardiología, Emergencia 24h, Laboratorio Clínico II, Farmacia, Teleconsulta<br>
          • <strong>Red Tributaria:</strong> 12 IPRESS articuladas en la provincia de Huarmey
        </div>
        <button class="btn-mini btn-precita" style="width:100%;" onclick="document.getElementById('reference-inspector-card').remove()">Entendido</button>
      </div>
    `;

    card.style.display = 'block';
  }

  /** Filtra la lista por establecimiento (código RENIPRESS o nombre). */
  filtrarPorPuerta(codONombre) {
    const est = window.EstablecimientosHuarmey ? window.EstablecimientosHuarmey.getByCode(codONombre) : null;
    const nombre = est ? est.nombre : String(codONombre || '');
    const clean = nombre.toLowerCase().replace('puesto de salud ', '').replace('centro de salud ', '').trim();
    this.currentFilter.search = clean;
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = clean;
    this.toggleHeartsPanel(true);
    this.render();
  }

  ejecutarBusqueda(query) {
    if (!query) return;
    const clean = query.trim();

    const pacienteEncontrado = this.patients.find(p => 
      p.dni === clean || 
      (p.apellidos_nombres && p.apellidos_nombres.toLowerCase().includes(clean.toLowerCase()))
    );

    if (pacienteEncontrado && pacienteEncontrado.latitud && pacienteEncontrado.longitud) {
      this.centrarPaciente(pacienteEncontrado.dni);
      this.showToast(`Paciente localizado: ${pacienteEncontrado.apellidos_nombres}`, "success");
      return;
    }

    const geocoder = window.ancashGeocoder || window.AncashGeocoder;
    if (geocoder) {
      const geo = geocoder.geocode(clean);
      if (geo && geo.matched) {
        this.mapManager.flyTo(geo.lat, geo.lng, 17);
        this.mapManager.mostrarPinBusqueda(geo.lat, geo.lng, `${clean.toUpperCase()}`);
        this.showToast(`Dirección catastral ubicada: ${clean}`, "info");
        return;
      }
    }

    this.showToast(`No se encontraron registros para: "${clean}"`, "warning");
  }

  async loadInitialData() {
    // El padrón solo viaja por la API REST (T-02) y con el token de la sesión (T-03b): el servidor
    // entrega únicamente los pacientes de la red del usuario (el Administrador ve todas).
    const token = this.session.getToken();
    const apiUrl = this.apiEndpoints().API_CRONICOS || '/api/cronicos';
    try {
      const response = await this.session.authFetch(apiUrl);
      if (this.session.getToken() !== token) return; // la sesión cambió o se cerró mientras se esperaba
      if (response.ok) {
        const data = await response.json();
        if (this.session.getToken() !== token) return;
        const list = Array.isArray(data) ? data : (data.data || []);
        this.setPatients(list);
        this.render();
        if (list.length === 0) this.showToast('No hay pacientes registrados para su red.', 'info', 4000);
      } else if (response.status === 403) {
        this.showToast('Su rol no tiene permiso para ver el padrón nominal.', 'warning', 5000);
      } else if (response.status !== 401) {
        this.showToast(`No se pudo cargar el padrón (código ${response.status}).`, 'danger', 5000);
      }
    } catch (e) {
      console.log('API REST no disponible: no hay padrón local sin conexión. Inicie el servidor (INICIAR_PROTOTIPO.bat).');
      this.showToast('No se pudo conectar con el servidor para cargar el padrón.', 'warning', 5000);
    }
  }

  render() {
    if (!this.permisos().verPacientes) return; // el Director solo ve totales: no hay lista ni pines
    let filtered = this.patients;

    if (this.currentFilter.diagnostico !== 'ALL') {
      const fd = this.currentFilter.diagnostico;
      filtered = filtered.filter(p => {
        const diags = p.diagnosticos || [];
        if (fd === 'I10') return diags.some(d => d.startsWith('I1'));
        if (fd === 'E11') return diags.some(d => d.startsWith('E1'));
        return diags.includes(fd);
      });
    }

    if (this.currentFilter.semaforo !== 'ALL') {
      const fs = this.currentFilter.semaforo;
      filtered = filtered.filter(p => (fs === 'purple') ? (p.semaforo === 'purple' || p.fuente === 'HOSIX') : p.semaforo === fs);
    }

    if (this.currentFilter.search) {
      const q = this.currentFilter.search.toLowerCase();
      filtered = filtered.filter(p => (p._searchStr || '').includes(q));
    }

    this.updateKpis();
    this.renderPatientList(filtered);
    this.mapManager.renderPatients(filtered);
  }

  updateKpis() {
    const total = this.patients.length;
    let green = 0, yellow = 0, red = 0, purple = 0;

    for (let i = 0; i < total; i++) {
      const p = this.patients[i];
      if (p.fallecido) continue; // los fallecidos no cuentan como desertores ni como pendientes
      if (p.semaforo === 'purple' || p.fuente === 'HOSIX') purple++;
      else if (p.semaforo === 'green') green++;
      else if (p.semaforo === 'yellow') yellow++;
      else if (p.semaforo === 'red') red++;
    }

    const elTotal = document.getElementById('kpi-total');
    const elGreen = document.getElementById('kpi-green');
    const elYellow = document.getElementById('kpi-yellow');
    const elRed = document.getElementById('kpi-red');
    const elPurple = document.getElementById('kpi-purple');

    if (elTotal) elTotal.textContent = total;
    if (elGreen) elGreen.textContent = green;
    if (elYellow) elYellow.textContent = yellow;
    if (elRed) elRed.textContent = red;
    if (elPurple) elPurple.textContent = purple;
  }

  findPatient(idOrDni) {
    if (!idOrDni) return null;
    const key = String(idOrDni);
    return this.patientMap.get(key) || this.patients.find(x => x.id === key || x.dni === key) || null;
  }

  renderPatientList(patients) {
    const container = document.getElementById('patient-list');
    if (!container) return;

    const subEl = document.getElementById('patient-count-subtitle');
    const countEl = document.getElementById('filter-active-label');
    if (subEl) {
      const sinUbic = window.GeoUbicacion ? patients.filter(p => !window.GeoUbicacion.validarCoordenadas(p.latitud, p.longitud).ok).length : 0;
      subEl.textContent = `${patients.length} de ${this.patients.length} pacientes filtrados${sinUbic ? ` · ${sinUbic} sin ubicación en el mapa` : ''}`;
    }
    if (countEl) countEl.textContent = `Mostrando ${Math.min(patients.length, this.visibleLimit)} de ${patients.length} pacientes`;

    container.innerHTML = '';

    if (patients.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:28px 16px; color:#64748b; font-size:12px;">
          No hay pacientes que coincidan con los filtros aplicados.
        </div>
      `;
      return;
    }

    const slice = patients.slice(0, this.visibleLimit);
    const fragment = document.createDocumentFragment();

    slice.forEach(p => {
      const card = document.createElement('div');
      card.className = `patient-card border-${p.semaforo || 'gray'}`;

      let badgeHtml = '';
      if (p.fallecido) badgeHtml = `<span class="badge-semaforo" style="background:#1e293b; color:#fff;"><span class="semaforo-dot" style="background:#94a3b8;"></span> Fallecido</span>`;
      else if (p.semaforo === 'green') badgeHtml = `<span class="badge-semaforo badge-green"><span class="semaforo-dot" style="background:#1e8e3e;"></span> ${escapeHtml(p.dias_restantes)}d</span>`;
      else if (p.semaforo === 'yellow') badgeHtml = `<span class="badge-semaforo badge-yellow"><span class="semaforo-dot" style="background:#f29900;"></span> ${escapeHtml(p.dias_restantes)}d</span>`;
      else if (p.semaforo === 'red') badgeHtml = `<span class="badge-semaforo badge-red"><span class="semaforo-dot" style="background:#d93025;"></span> +${escapeHtml(p.dias_vencido)}d</span>`;
      else if (p.semaforo === 'purple' || p.fuente === 'HOSIX') badgeHtml = `<span class="badge-semaforo badge-purple"><span class="semaforo-dot" style="background:#9334e6;"></span> HOSIX</span>`;
      else badgeHtml = `<span class="badge-semaforo badge-gray"><span class="semaforo-dot" style="background:#94a3b8;"></span> S/C</span>`;

      const diagBadges = (p.diagnosticos || []).map(d => `<span class="badge-diag badge-${escapeHtml(String(d).toLowerCase())}">${escapeHtml(d)}</span>`).join(' ');
      const hosixTag = (p.fuente === 'HOSIX') ? `<span class="badge-hosix-mini">HOSIX</span>` : '';

      const paCardTxt = (p.pa_sistolica != null && p.pa_diastolica != null) ? `${escapeHtml(p.pa_sistolica)}/${escapeHtml(p.pa_diastolica)}` : '—';
      const isCtrl = p.estado_control === 'Controlado';
      const safeId = escapeHtml(p.id);
      const safeName = escapeHtml(p.apellidos_nombres);
      const safeAddr = escapeHtml(p.direccion || 'Sin dirección');

      const rawPhone = p.telefono ? String(p.telefono).replace(/\D/g, '') : '';
      const hasPhone = rawPhone.length >= 9;

      const iconLoc = window.AppIcons ? window.AppIcons.location(13, '#5F6368') : '📍';
      const iconLocBlue = window.AppIcons ? window.AppIcons.location(13, '#1A73E8') : '📍';
      const ubic = window.GeoUbicacion ? window.GeoUbicacion.describirPrecision(p) : { clave: 'no_verificada', exacta: false, etiqueta: '' };
      const sinUbic = ubic.clave === 'sin_ubicacion';
      const ubicBadge = `<span class="badge-ubicacion ${ubic.exacta ? 'is-exacta' : (sinUbic ? 'is-sin' : 'is-aprox')}" title="${escapeHtml(ubic.etiqueta)}">${ubic.exacta ? '📍 Exacta' : (sinUbic ? '⚠️ Sin ubicación' : '≈ Aproximada')}</span>`;
      const puedeUbicar = this.permisos().escribir;
      const btnVer = sinUbic
        ? (puedeUbicar ? `<button class="btn-mini btn-ubicar" onclick="window.app.iniciarFijarUbicacion(${argJs(p.id)})" title="Fijar la ubicación del domicilio" aria-label="Fijar la ubicación de ${safeName}">${iconLocBlue} Ubicar</button>` : '')
        : `<button class="btn-mini btn-ubicar" onclick="window.app.centrarPaciente(${argJs(p.id)})" title="Ubicar en el mapa" aria-label="Ubicar a ${safeName} en el mapa">${iconLocBlue} Ver</button>`;
      const iconFicha = window.AppIcons ? window.AppIcons.clipboardCheck(13, '#1E8E3E') : '📋';
      const iconWp = window.AppIcons ? window.AppIcons.whatsapp(13, '#25D366') : '📱';

      card.innerHTML = `
        <div class="patient-card-header" onclick="window.app.openPatientDetail(${argJs(p.id)})" role="button" tabindex="0" aria-label="Abrir ficha clínica de ${safeName}">
          <div class="patient-card-title-group">
            <span class="patient-name" title="${safeName}">${safeName}</span>
            <div class="patient-card-badges">${diagBadges} ${hosixTag} ${ubicBadge}</div>
          </div>
          ${badgeHtml}
        </div>

        <div class="pcard-compact-grid" onclick="window.app.openPatientDetail(${argJs(p.id)})" role="button" tabindex="0">
          <div class="pcard-demo-cell">
            <span class="pcard-cell-lbl">DNI</span>
            <span class="pcard-cell-val">${escapeHtml(p.dni || '—')}</span>
          </div>
          <div class="pcard-demo-cell">
            <span class="pcard-cell-lbl">Edad</span>
            <span class="pcard-cell-val">${p.edad != null ? p.edad + ' años' : '—'}</span>
          </div>
          <div class="pcard-demo-cell">
            <span class="pcard-cell-lbl">PA (mmHg)</span>
            <span class="pcard-cell-val">${paCardTxt}</span>
          </div>
          <div class="pcard-demo-cell">
            <span class="pcard-cell-lbl">Meta HEARTS</span>
            <span class="pcard-cell-val" style="color:${isCtrl ? 'var(--hearts-green-text)' : 'var(--hearts-yellow-text)'};">${escapeHtml(p.estado_control || '—')}</span>
          </div>
        </div>

        <div class="pcard-bottom-bar">
          <span class="pcard-address" title="${safeAddr} • ${escapeHtml(p.puerta_entrada || '')}">${iconLoc} ${safeAddr}</span>
          <div class="patient-actions">
            ${btnVer}
            <button class="btn-mini btn-precita" onclick="window.app.openPatientDetail(${argJs(p.id)})" title="Ver Ficha Clínica HEARTS" aria-label="Ver Ficha Clínica de ${safeName}">${iconFicha} Ficha</button>
            <button class="btn-mini btn-whatsapp" ${hasPhone ? `onclick="window.app.enviarWhatsApp(${argJs(p.id)})" title="Enviar recordatorio por WhatsApp"` : 'disabled title="Paciente sin número de celular registrado" aria-disabled="true"'} aria-label="Enviar recordatorio WhatsApp a ${safeName}">${iconWp} WhatsApp</button>
          </div>
        </div>
      `;

      fragment.appendChild(card);
    });

    if (patients.length > this.visibleLimit) {
      const moreBtn = document.createElement('button');
      moreBtn.className = 'btn-mini';
      moreBtn.style.cssText = 'width:100%; justify-content:center; padding:8px; background:var(--slate-100); color:var(--text-main); font-weight:700; border-radius:8px; border:1px solid var(--border-subtle); margin-top:6px; cursor:pointer;';
      moreBtn.textContent = `Mostrar más pacientes (${patients.length - this.visibleLimit} restantes)...`;
      moreBtn.onclick = () => {
        this.visibleLimit += 60;
        this.renderPatientList(patients);
      };
      fragment.appendChild(moreBtn);
    }

    container.appendChild(fragment);
  }

  /** Centra el mapa en el domicilio del paciente (con su radio de incertidumbre) y abre su ficha rápida. */
  centrarPaciente(idOrDni) {
    const p = this.findPatient(idOrDni);
    if (!p) return;
    if (!this.mapManager.enfocarPaciente(p)) {
      const puede = this.permisos().escribir;
      this.showToast(`${p.apellidos_nombres || 'El paciente'} no tiene ubicación en el mapa.${puede ? ' Use «Fijar ubicación exacta» en su ficha.' : ''}`, 'warning', 5000);
      return;
    }
    if (window.innerWidth <= 768) {
      const panel = document.getElementById('hearts-panel');
      if (panel) panel.classList.add('collapsed');
    }
  }

  // ===================== UBICACIÓN EXACTA DEL DOMICILIO =====================

  /** Datos de ubicación que muestra la ficha clínica (precisión, coordenadas, aviso de sector). */
  _datosUbicacionFicha(p) {
    const G = window.GeoUbicacion;
    const desc = G ? G.describirPrecision(p) : { clave: 'no_verificada', exacta: false, etiqueta: 'Ubicación no verificada' };
    const tieneCoords = desc.clave !== 'sin_ubicacion';
    const partes = [];
    if (tieneCoords) partes.push(`<span style="font-family:monospace;">${Number(p.latitud).toFixed(6)}, ${Number(p.longitud).toFixed(6)}</span>`);
    if (p.geo_fuente) partes.push(escapeHtml(p.geo_fuente) + (p.geo_toponimo ? ` («${escapeHtml(p.geo_toponimo)}»)` : ''));
    if (p.geo_registrado_por) {
      const f = p.geo_fecha ? String(p.geo_fecha).slice(0, 10).split('-').reverse().join('/') : '';
      partes.push(`registrada por ${escapeHtml(p.geo_registrado_por)}${f ? ` el ${escapeHtml(f)}` : ''}`);
    }
    if (!tieneCoords) partes.push('La dirección no se pudo ubicar en el mapa');
    else if (!desc.exacta) partes.push('Verifíquela en la visita domiciliaria');

    // Sector que corresponde a las coordenadas (polígono GeoRIS) frente al registrado
    let avisoSector = '';
    const geo = window.AncashGeocoder || window.ancashGeocoder;
    if (tieneCoords && geo && geo.getSectorFromCoordinates) {
      const s = geo.getSectorFromCoordinates(p.latitud, p.longitud);
      const segunCoords = s ? `Sector ${s.id_sector}` : null;
      if (segunCoords && String(p.sector_sanitario || '').trim() !== segunCoords) {
        avisoSector = `<span class="ficha-aviso-sector" title="El punto del domicilio cae en el polígono oficial del ${escapeHtml(segunCoords)}">Según el mapa: ${escapeHtml(segunCoords)}</span>`;
      }
    }
    return {
      desc,
      tieneCoords,
      detalle: partes.join(' · '),
      avisoSector,
      clase: desc.exacta ? 'is-exacta' : (tieneCoords ? 'is-aprox' : 'is-sin'),
      puedeUbicar: this.permisos().escribir
    };
  }

  /** Punto de referencia para medir la distancia del domicilio: el establecimiento del paciente. */
  _referenciaUbicacion(p) {
    const est = window.EstablecimientosHuarmey ? window.EstablecimientosHuarmey.getByCode(p.puerta_entrada_id) : null;
    return est ? { lat: est.latitud, lng: est.longitud, nombre: est.nombre } : null;
  }

  /** Detiene la lectura del GPS en curso; los avisos de intentos anteriores se ignoran (contador de intento). */
  _detenerGps() {
    this._gpsIntento = (this._gpsIntento || 0) + 1;
    if (this._gpsWatchId !== undefined && this._gpsWatchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(this._gpsWatchId);
    }
    this._gpsWatchId = null;
    if (this._gpsTimer) { clearTimeout(this._gpsTimer); this._gpsTimer = null; }
  }

  cerrarModalUbicacion() {
    this._detenerGps();
    const m = document.getElementById('modal-ubicacion');
    if (m) m.remove();
  }

  /**
   * Abre las opciones para fijar la ubicación EXACTA del domicilio: GPS del celular (en la puerta de la vivienda),
   * marcar el punto en el mapa o escribir/pegar coordenadas. Toda opción termina con una confirmación en el mapa.
   */
  iniciarFijarUbicacion(idOrDni) {
    const p = this.findPatient(idOrDni);
    if (!p) return;
    if (!this.permisos().escribir) {
      this.showToast('Su rol no puede modificar la ubicación de los pacientes.', 'warning');
      return;
    }
    this.cerrarModalUbicacion();
    const desc = window.GeoUbicacion ? window.GeoUbicacion.describirPrecision(p) : { etiqueta: '' };
    const gpsDisponible = ('geolocation' in navigator) && (window.isSecureContext !== false);
    const modal = document.createElement('div');
    modal.id = 'modal-ubicacion';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-box modal-ubicacion-box" role="dialog" aria-modal="true" aria-labelledby="modal-ubicacion-titulo">
        <div class="modal-ubicacion-header">
          <span id="modal-ubicacion-titulo">📍 Ubicación exacta del domicilio</span>
          <button type="button" class="btn-close-accessible" data-ubic-accion="cerrar" aria-label="Cerrar">✕</button>
        </div>
        <div class="modal-ubicacion-body">
          <div class="modal-ubicacion-paciente">
            <strong>${escapeHtml(p.apellidos_nombres)}</strong> · DNI ${escapeHtml(p.dni || '—')}<br>
            <span>${escapeHtml(p.direccion || 'Sin dirección')}</span><br>
            <span class="modal-ubicacion-actual">Ubicación actual: ${escapeHtml(desc.etiqueta)}</span>
          </div>
          <div class="modal-ubicacion-opciones" id="modal-ubicacion-opciones">
            <button type="button" class="opcion-ubicacion" data-ubic-accion="gps" ${gpsDisponible ? '' : 'disabled'}>
              <span class="opcion-ubicacion-icono">📡</span>
              <span><strong>Usar el GPS de este celular</strong><br><small>${gpsDisponible ? 'Solo si está ahora en la puerta de la vivienda del paciente.' : 'No disponible: el GPS del navegador exige abrir el sistema por https:// (o en localhost).'}</small></span>
            </button>
            <button type="button" class="opcion-ubicacion" data-ubic-accion="mapa">
              <span class="opcion-ubicacion-icono">🗺️</span>
              <span><strong>Marcar la vivienda en el mapa</strong><br><small>Arrastre el marcador sobre el techo o la puerta (con vista satélite).</small></span>
            </button>
            <button type="button" class="opcion-ubicacion" data-ubic-accion="coords">
              <span class="opcion-ubicacion-icono">⌨️</span>
              <span><strong>Escribir o pegar coordenadas</strong><br><small>Decimales, grados (10°04'08"S) o un enlace de Google Maps / WhatsApp.</small></span>
            </button>
          </div>
          <div id="modal-ubicacion-paso" class="modal-ubicacion-paso"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) { this.cerrarModalUbicacion(); return; }
      const b = e.target.closest('[data-ubic-accion]');
      if (!b || b.disabled) return;
      const accion = b.getAttribute('data-ubic-accion');
      // Elegir cualquier opción detiene una lectura de GPS anterior
      this._detenerGps();
      if (accion === 'cerrar') this.cerrarModalUbicacion();
      else if (accion === 'gps') this._ubicacionPorGps(p);
      else if (accion === 'mapa') this._abrirSeleccionEnMapa(p, null);
      else if (accion === 'coords') this._ubicacionPorCoordenadas(p);
    });
    const primero = modal.querySelector('.opcion-ubicacion:not([disabled])');
    if (primero) primero.focus();
  }

  /** Lleva al mapa en modo selección (punto inicial: lectura GPS, coordenadas, ubicación actual o su establecimiento). */
  _abrirSeleccionEnMapa(p, inicial) {
    this.cerrarModalUbicacion();
    const detalle = document.getElementById('modal-patient-detail');
    if (detalle) detalle.classList.remove('active');
    if (window.innerWidth <= 768) {
      const panel = document.getElementById('hearts-panel');
      if (panel) panel.classList.add('collapsed');
    }
    const G = window.GeoUbicacion;
    const ref = this._referenciaUbicacion(p);
    let punto = inicial;
    if (!punto && G && G.validarCoordenadas(p.latitud, p.longitud).ok) punto = { lat: Number(p.latitud), lng: Number(p.longitud), precision_geo: 'mapa' };
    if (!punto && ref) punto = { lat: ref.lat, lng: ref.lng, precision_geo: 'mapa', zoom: 16 };
    if (!punto) punto = { lat: -10.06866, lng: -78.15187, precision_geo: 'mapa', zoom: 16 }; // Plaza de Armas de Huarmey

    this.mapManager.iniciarSeleccionUbicacion({
      lat: punto.lat,
      lng: punto.lng,
      zoom: punto.zoom || 18,
      precision_geo: punto.precision_geo || 'mapa',
      precision_m: punto.precision_m,
      requiereAjuste: !!punto.requiereAjuste,
      titulo: `Domicilio de ${p.apellidos_nombres || 'paciente'}`,
      referencia: ref,
      onConfirm: (datos) => this.guardarUbicacion(p, datos)
    });
  }

  /** Lectura del GPS: se queda con la más precisa durante unos segundos y luego se confirma en el mapa. */
  _ubicacionPorGps(p) {
    const paso = document.getElementById('modal-ubicacion-paso');
    if (!paso) return;
    if (!('geolocation' in navigator)) {
      paso.innerHTML = '<div class="ubic-error">Este navegador no ofrece GPS. Use «Marcar la vivienda en el mapa».</div>';
      return;
    }
    this._detenerGps();
    const intento = this._gpsIntento;
    const vigente = () => intento === this._gpsIntento && !!document.getElementById('modal-ubicacion');
    let mejor = null;
    const OBJETIVO_M = 15;
    const LIMITE_MS = 25000;
    paso.innerHTML = `
      <div class="ubic-gps">
        <div class="ubic-gps-estado" id="ubic-gps-estado" aria-live="polite">Buscando señal GPS… acepte el permiso de ubicación si el navegador lo pide. Al aire libre la señal mejora.</div>
        <div class="ubic-gps-acciones">
          <button type="button" class="btn-mini" id="ubic-gps-cancelar">Cancelar</button>
          <button type="button" class="btn-mini btn-precita" id="ubic-gps-usar" disabled>Usar esta lectura</button>
        </div>
      </div>
    `;
    const estado = () => document.getElementById('ubic-gps-estado');
    const terminar = () => {
      if (!vigente()) return; // intento anterior, opción cambiada o ventana cerrada
      this._detenerGps();
      if (!mejor) {
        const el = estado();
        if (el) el.innerHTML = '<span class="ubic-error">No se obtuvo ninguna lectura del GPS. Salga al exterior y reintente, o marque la vivienda en el mapa.</span>';
        return;
      }
      const v = window.GeoUbicacion.validarCoordenadas(mejor.lat, mejor.lng);
      if (!v.ok) {
        const el = estado();
        if (el) el.innerHTML = `<span class="ubic-error">${escapeHtml(v.error)}</span>`;
        return;
      }
      const acc = Math.max(1, Math.round(mejor.acc));
      const maxM = window.GeoUbicacion.GPS_MAX_EXACTA_M;
      // Una lectura de más de 50 m no se puede confirmar tal cual: hay que poner el marcador sobre la vivienda
      this._abrirSeleccionEnMapa(p, { lat: v.lat, lng: v.lng, precision_geo: 'gps', precision_m: acc, requiereAjuste: acc > maxM });
      if (acc > maxM) this.showToast(`Precisión del GPS baja (±${acc} m). Arrastre el marcador sobre la vivienda para poder confirmar.`, 'warning', 7000);
    };
    document.getElementById('ubic-gps-cancelar').onclick = () => {
      this._detenerGps();
      paso.innerHTML = '';
    };
    document.getElementById('ubic-gps-usar').onclick = terminar;

    this._gpsWatchId = navigator.geolocation.watchPosition((pos) => {
      if (!vigente()) return;
      const acc = Number(pos.coords.accuracy);
      if (!Number.isFinite(acc)) return;
      if (!mejor || acc < mejor.acc) mejor = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc };
      const el = estado();
      if (el) el.innerHTML = `Lectura GPS: <b>${mejor.lat.toFixed(6)}, ${mejor.lng.toFixed(6)}</b> · precisión <b>±${Math.round(mejor.acc)} m</b>${mejor.acc > OBJETIVO_M ? ' · esperando más precisión…' : ''}`;
      const usar = document.getElementById('ubic-gps-usar');
      if (usar) usar.disabled = false;
      if (mejor.acc <= OBJETIVO_M) terminar();
    }, (err) => {
      const motivos = {
        1: 'Permiso de ubicación denegado. Actívelo para este sitio en el navegador o marque la vivienda en el mapa.',
        2: 'El dispositivo no pudo determinar la ubicación (sin señal GPS).',
        3: 'El GPS tardó demasiado en responder.'
      };
      if (!vigente()) return;
      if (mejor && err.code === 3) { terminar(); return; }
      this._detenerGps();
      const el = estado();
      if (el) el.innerHTML = `<span class="ubic-error">${escapeHtml(motivos[err.code] || err.message || 'Error del GPS.')}</span>`;
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: LIMITE_MS });
    this._gpsTimer = setTimeout(terminar, LIMITE_MS);
  }

  /** Coordenadas escritas o pegadas: se interpretan en vivo y se confirman en el mapa. */
  _ubicacionPorCoordenadas(p) {
    const paso = document.getElementById('modal-ubicacion-paso');
    if (!paso) return;
    const actual = (window.GeoUbicacion && window.GeoUbicacion.validarCoordenadas(p.latitud, p.longitud).ok)
      ? `${Number(p.latitud).toFixed(6)}, ${Number(p.longitud).toFixed(6)}` : '';
    paso.innerHTML = `
      <label class="ux-field-label" for="ubic-coords-input">Coordenadas (latitud, longitud)</label>
      <input id="ubic-coords-input" class="georis-select" type="text" inputmode="text" autocomplete="off" spellcheck="false"
        placeholder="-10.068950, -78.152100" value="${escapeHtml(actual)}">
      <div id="ubic-coords-resultado" class="ubic-coords-resultado" aria-live="polite"></div>
      <div class="ubic-gps-acciones">
        <button type="button" class="btn-mini btn-precita" id="ubic-coords-ver" disabled>Ver en el mapa y confirmar</button>
      </div>
    `;
    const input = document.getElementById('ubic-coords-input');
    const res = document.getElementById('ubic-coords-resultado');
    const btn = document.getElementById('ubic-coords-ver');
    let ultimo = null;
    const evaluar = () => {
      const r = window.GeoUbicacion.interpretarTexto(input.value);
      ultimo = r.ok ? r : null;
      btn.disabled = !r.ok;
      if (!input.value.trim()) { res.textContent = ''; return; }
      if (!r.ok) { res.innerHTML = `<span class="ubic-error">${escapeHtml(r.error)}</span>`; return; }
      const geo = window.AncashGeocoder || window.ancashGeocoder;
      const s = geo && geo.getSectorFromCoordinates ? geo.getSectorFromCoordinates(r.lat, r.lng) : null;
      res.innerHTML = `Latitud <b>${r.lat.toFixed(6)}</b>, longitud <b>${r.lng.toFixed(6)}</b> · ${s ? `Sector ${escapeHtml(s.id_sector)}` : 'fuera de los sectores GeoRIS'}`
        + (r.invertidas ? '<br><span class="ubic-aviso">Se corrigió el orden: venían longitud y latitud invertidas.</span>' : '')
        + (!r.enAncash ? '<br><span class="ubic-aviso">⚠️ El punto está fuera de Áncash.</span>' : '');
    };
    input.addEventListener('input', evaluar);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && ultimo) { e.preventDefault(); btn.click(); } });
    btn.onclick = () => {
      if (!ultimo) return;
      this._abrirSeleccionEnMapa(p, { lat: ultimo.lat, lng: ultimo.lng, precision_geo: 'manual' });
    };
    evaluar();
    input.focus();
  }

  /**
   * Guarda en el servidor la ubicación confirmada (PUT /api/patients/:id/ubicacion). Lanza Error si no se guardó
   * (la selección en el mapa queda abierta para reintentar). El sector lo recalcula el servidor con GeoRIS.
   */
  async guardarUbicacion(p, datos) {
    const base = this.apiEndpoints().API_PATIENTS || '/api/patients';
    const url = `${base}/${encodeURIComponent(p.id)}/ubicacion`;
    const token = this.session.getToken();
    let res;
    try {
      res = await this.session.authFetch(url, {
        method: 'PUT',
        body: JSON.stringify({ latitud: datos.lat, longitud: datos.lng, precision_geo: datos.precision_geo, precision_m: datos.precision_m })
      });
    } catch (e) {
      throw new Error('Sin conexión con el servidor: la ubicación no se guardó. Reintente cuando haya señal.');
    }
    if (!res || !res.ok) {
      let motivo = '';
      try { const b = await res.json(); motivo = (b && (b.error || (b.issue && b.issue[0] && b.issue[0].diagnostics))) || ''; } catch (e) { /* sin cuerpo */ }
      if (res && res.status === 401) throw new Error('La sesión venció: ingrese de nuevo y repita la ubicación.');
      throw new Error(`La ubicación no se guardó${motivo ? ': ' + motivo : ''} (código ${res ? res.status : 'sin respuesta'}).`);
    }
    const cuerpo = await res.json();
    const d = cuerpo.data || {};
    // La sesión cambió o se cerró mientras se guardaba: no se toca la pantalla de otro usuario (ni la de acceso)
    if (this.session.getToken() !== token) return d;
    const objetivo = this.findPatient(p.id);
    if (!objetivo) return d;
    objetivo.latitud = d.latitud;
    objetivo.longitud = d.longitud;
    objetivo.precision_geo = d.precision_geo;
    if (d.precision_m === null || d.precision_m === undefined) delete objetivo.precision_m; else objetivo.precision_m = d.precision_m;
    objetivo.geo_fuente = d.geo_fuente;
    objetivo.geo_fecha = d.geo_fecha;
    objetivo.geo_registrado_por = d.geo_registrado_por;
    delete objetivo.geo_toponimo;
    objetivo.sector_por_ubicacion = true;
    delete objetivo.ubicacion_por_verificar;
    if (d.sector_sanitario) objetivo.sector_sanitario = d.sector_sanitario;
    objetivo._searchStr = `${objetivo.dni || ''} ${objetivo.historia_clinica || ''} ${objetivo.apellidos_nombres || ''} ${objetivo.direccion || ''} ${objetivo.puerta_entrada || ''} ${objetivo.sector_sanitario || ''}`.toLowerCase();
    this.render();
    // El mapa ya está sobre el punto confirmado: se enfoca sin animación (una animación en curso movería la vista)
    this.mapManager.enfocarPaciente(objetivo, { animar: false });
    const t = d.territorio || {};
    const zona = t.zona ? ` · Zona ${t.zona.id_zona}` : '';
    this.showToast(`Ubicación exacta guardada: ${objetivo.sector_sanitario}${zona}.`, 'success', 5000);
    return d;
  }

  openPatientDetail(idOrDni) {
    const p = this.findPatient(idOrDni);
    if (!p) return;

    this.selectedPatientForPreCita = p;
    let modal = document.getElementById('modal-patient-detail');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-patient-detail';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    const isHosix = (p.semaforo === 'purple' || p.fuente === 'HOSIX');

    // Formateadores limpios según estándar clínico peruano (MINSA)
    const formatDatePE = (str) => {
      if (!str || String(str).trim() === '' || str === 'Sin fecha') return 'Sin registro';
      const s = String(str).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, d] = s.split('-');
        return `${d}/${m}/${y}`;
      }
      return s;
    };

    const formatSexoTxt = (sx) => {
      if (!sx) return 'Sin registro';
      const u = String(sx).trim().toUpperCase();
      if (u === 'M') return 'Masculino';
      if (u === 'F') return 'Femenino';
      return sx;
    };

    const formatPhone = (tel) => {
      if (!tel || String(tel).trim() === '') return 'Sin registro';
      const clean = String(tel).replace(/\D/g, '');
      if (clean.length === 9) {
        return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
      }
      return String(tel).trim();
    };

    // Helper minimalista de baja fatiga visual para celdas clínicas individuales (con sanitización XSS)
    const renderMetricCell = (label, val, unit = '', metaTxt = '', statusType = 'neutral', badgeTxt = '') => {
      const hasVal = (val !== null && val !== undefined && String(val).trim() !== '' && String(val).trim() !== '-');
      const safeVal = escapeHtml(val);
      const safeUnit = escapeHtml(unit);
      const safeLabel = escapeHtml(label);
      const safeMeta = escapeHtml(metaTxt);
      const displayVal = hasVal
        ? (unit && !String(val).toLowerCase().includes(unit.toLowerCase()) ? `${safeVal} <small class="hearts-unit">${safeUnit}</small>` : `${safeVal}`)
        : `<span class="hearts-empty-val">Sin registro</span>`;

      const statusCls = hasVal ? (statusType === 'ok' ? 'is-ok' : (statusType === 'warn' ? 'is-warn' : (statusType === 'alert' ? 'is-alert' : ''))) : 'is-empty';
      const pillHtml = (hasVal && badgeTxt) ? `<span class="hearts-mini-pill ${statusCls}">${escapeHtml(badgeTxt)}</span>` : '';

      return `
        <div class="hearts-metric-cell ${statusCls}">
          <div class="hearts-metric-top">
            <span class="hearts-metric-label">${safeLabel}</span>
            ${metaTxt ? `<span class="hearts-metric-ref">${safeMeta}</span>` : ''}
          </div>
          <div class="hearts-metric-bottom">
            <span class="hearts-metric-value">${displayVal}</span>
            ${pillHtml}
          </div>
        </div>
      `;
    };

    // 1. Etiquetas de Estatus Territorial y Clínico (Concisas y con puntos vectoriales nítidos)
    let semaforoBadgeHtml = '';
    if (p.fallecido) {
      semaforoBadgeHtml = `<span class="badge-semaforo" style="background:#1e293b; color:#fff;"><span class="semaforo-dot" style="background:#94a3b8;"></span> Baja por Fallecimiento</span>`;
    } else if (isHosix) {
      semaforoBadgeHtml = `<span class="badge-semaforo badge-purple"><span class="semaforo-dot" style="background:#9334e6;"></span> Brecha HOSIX (No Empadronado)</span>`;
    } else if (p.semaforo === 'green') {
      semaforoBadgeHtml = `<span class="badge-semaforo badge-green"><span class="semaforo-dot" style="background:#1e8e3e;"></span> Cita Vigente (${escapeHtml(p.dias_restantes)} días)</span>`;
    } else if (p.semaforo === 'yellow') {
      semaforoBadgeHtml = `<span class="badge-semaforo badge-yellow"><span class="semaforo-dot" style="background:#f29900;"></span> Cita Próxima (${escapeHtml(p.dias_restantes)} días)</span>`;
    } else {
      semaforoBadgeHtml = `<span class="badge-semaforo badge-red"><span class="semaforo-dot" style="background:#d93025;"></span> Cita Vencida (+${escapeHtml(p.dias_vencido)} días)</span>`;
    }

    const isControlado = (p.estado_control === 'Controlado');
    let clinicoBadgeHtml = '';
    if (p.fallecido) {
      clinicoBadgeHtml = `<span class="badge-semaforo badge-gray"><span class="semaforo-dot" style="background:#64748b;"></span> Óbito Registrado</span>`;
    } else if (isHosix) {
      clinicoBadgeHtml = `<span class="badge-semaforo badge-purple"><span class="semaforo-dot" style="background:#9334e6;"></span> Pendiente Empadronamiento DNT</span>`;
    } else if (isControlado) {
      clinicoBadgeHtml = `<span class="badge-semaforo badge-green"><span class="semaforo-dot" style="background:#1e8e3e;"></span> ✓ Controlado (En Meta HEARTS)</span>`;
    } else {
      clinicoBadgeHtml = `<span class="badge-semaforo badge-red"><span class="semaforo-dot" style="background:#d93025;"></span> ${escapeHtml(p.estado_control || 'No Controlado')}</span>`;
    }

    // Evaluación de metas clínicas HEARTS (OPS / MINSA)
    const hasPa = (p.pa_sistolica != null && p.pa_diastolica != null);
    const isHighPa = hasPa && (p.pa_sistolica >= 140 || p.pa_diastolica >= 90);
    const paValStr = hasPa ? `${escapeHtml(p.pa_sistolica)}/${escapeHtml(p.pa_diastolica)}` : '';
    const paStatus = hasPa ? (isHighPa ? 'alert' : 'ok') : 'neutral';
    const paBadgeTxt = hasPa ? (isHighPa ? '≥ 140/90' : '✓ En Meta') : '';

    // Glucosa Basal (Independiente)
    const hasGlu = (p.glucosa != null && p.glucosa !== '');
    const isBadGlu = hasGlu && (p.glucosa > 130 || p.glucosa < 70);
    const gluStatus = hasGlu ? (isBadGlu ? 'alert' : 'ok') : 'neutral';
    const gluBadgeTxt = hasGlu ? (isBadGlu ? 'Fuera de Meta' : '✓ En Meta') : '';

    // Hemoglobina Glicosilada HbA1c (Independiente)
    const hasA1c = (p.hba1c != null && p.hba1c !== '');
    const isBadA1c = hasA1c && (p.hba1c >= 7.0);
    const a1cValStr = p.hba1c_texto || (hasA1c ? `${escapeHtml(p.hba1c)}` : '');
    const a1cStatus = hasA1c ? (isBadA1c ? 'alert' : 'ok') : 'neutral';
    const a1cBadgeTxt = hasA1c ? (isBadA1c ? '≥ 7.0%' : '✓ < 7.0%') : '';

    // Diagnóstico nutricional según IMC
    const nutStatus = p.diagnostico_nutricional
      ? (p.diagnostico_nutricional === 'NORMOPESO' ? 'ok' : 'warn')
      : 'neutral';

    // Riesgo CV y Daño de Órgano Blanco
    const rcvStatus = (p.riesgo_cv === 'ALTO' || p.riesgo_cv === 'MUY ALTO') ? 'alert' : (p.riesgo_cv ? 'ok' : 'neutral');
    const dobStatus = (p.dano_organo_blanco && p.dano_organo_blanco !== 'NO') ? 'alert' : (p.dano_organo_blanco === 'NO' ? 'ok' : 'neutral');

    // Diagnósticos CIE-10
    const condPills = (p.conditions && p.conditions.length > 0)
      ? p.conditions.map(c => `<span class="badge-diag badge-${(c.cie10_cod || 'i10').slice(0,3).toLowerCase()}">${c.cie10_cod}: ${c.diagnostico}</span>`).join(' ')
      : (p.diagnosticos || []).map(d => `<span class="badge-diag badge-${d.toLowerCase()}">${d}</span>`).join(' ');

    // Construcción del Histórico Longitudinal HEARTS
    // 1. Evolución Trimestral de Presión Arterial 2026
    const getQuarterData = (qName, pas, pad) => {
      const hasQ = (pas != null && pad != null && pas > 0 && pad > 0);
      if (!hasQ) {
        return `
          <div class="hearts-quarter-card">
            <span class="quarter-name">${qName}</span>
            <span class="quarter-val blank">—</span>
            <span class="quarter-badge badge-empty">Sin registro</span>
          </div>
        `;
      }
      const inMeta = (pas < 140 && pad < 90);
      const cardCls = inMeta ? 'has-data is-target-ok' : 'has-data is-target-alert';
      const badgeCls = inMeta ? 'badge-ok' : 'badge-alert';
      const badgeTxt = inMeta ? '✓ En Meta' : '≥ 140/90';
      return `
        <div class="hearts-quarter-card ${cardCls}">
          <span class="quarter-name">${qName}</span>
          <span class="quarter-val">${pas}/${pad} <small style="font-size:10px; font-weight:500; color:var(--text-secondary);">mmHg</small></span>
          <span class="quarter-badge ${badgeCls}">${badgeTxt}</span>
        </div>
      `;
    };

    // T1: ene o mar
    const t1Pas = p.pas_ene || p.pas_mar;
    const t1Pad = p.pad_ene || p.pad_mar;
    // T2: abr o jun
    const t2Pas = p.pas_abr || p.pas_jun;
    const t2Pad = p.pad_abr || p.pad_jun;
    // T3: jul o ago o set
    const t3Pas = p.pas_jul || p.pas_ago || p.pas_set;
    const t3Pad = p.pad_jul || p.pad_ago || p.pad_set;
    // T4: oct
    const t4Pas = p.pas_oct || (p.pa_sistolica && !t1Pas ? p.pa_sistolica : null);
    const t4Pad = p.pad_oct || (p.pa_diastolica && !t1Pad ? p.pa_diastolica : null);

    const quartersGridHtml = `
      <div class="hearts-quarters-grid">
        ${getQuarterData('T1 (Ene-Mar)', t1Pas, t1Pad)}
        ${getQuarterData('T2 (Abr-Jun)', t2Pas, t2Pad)}
        ${getQuarterData('T3 (Jul-Set)', t3Pas, t3Pad)}
        ${getQuarterData('T4 (Oct-Dic)', t4Pas, t4Pad)}
      </div>
    `;

    // 2. Línea de Tiempo Clínica Longitudinal
    let timelineItemsHtml = '';

    // Nodo A: Próxima Cita / Estado de Agenda
    if (p.fallecido) {
      timelineItemsHtml += `
        <div class="timeline-item">
          <div class="timeline-dot dot-blue">
            ${window.AppIcons ? window.AppIcons.checkCircle(12, '#64748b') : '•'}
          </div>
          <div class="timeline-card">
            <div class="timeline-card-header">
              <span class="timeline-card-title">Baja Definitiva del Padrón</span>
              <span class="timeline-card-date">${formatDatePE(p.fecha_estado || p.fecha_limite)}</span>
            </div>
            <div class="timeline-card-body">
              Paciente retirado del cronograma activo de citas por óbito verificado en RIS Pacífico Sur.
            </div>
          </div>
        </div>
      `;
    } else if (p.dias_vencido > 0) {
      timelineItemsHtml += `
        <div class="timeline-item">
          <div class="timeline-dot dot-red">
            ${window.AppIcons ? window.AppIcons.alertTriangle(12, '#d93025') : '•'}
          </div>
          <div class="timeline-card" style="border-left:3px solid var(--hearts-red);">
            <div class="timeline-card-header">
              <span class="timeline-card-title" style="color:var(--hearts-red);">Cita Vencida (+${escapeHtml(p.dias_vencido)} días)</span>
              <span class="timeline-card-date">Límite: ${formatDatePE(p.fecha_limite)}</span>
            </div>
            <div class="timeline-card-body">
              <strong>Establecimiento:</strong> ${escapeHtml(p.puerta_entrada || 'Hospital II-1 Huarmey')}<br>
              <strong>Acción prioritaria:</strong> Generar pre-cita en HOSIX o realizar visita de búsqueda activa en ${escapeHtml(p.sector_sanitario || 'Sector')}.
            </div>
          </div>
        </div>
      `;
    } else if (p.dias_restantes <= 10) {
      timelineItemsHtml += `
        <div class="timeline-item">
          <div class="timeline-dot dot-yellow">
            ${window.AppIcons ? window.AppIcons.clock(12, '#f29900') : '•'}
          </div>
          <div class="timeline-card" style="border-left:3px solid var(--hearts-yellow);">
            <div class="timeline-card-header">
              <span class="timeline-card-title" style="color:#b45309;">Próximo Control en ${escapeHtml(p.dias_restantes)} días</span>
              <span class="timeline-card-date">${formatDatePE(p.fecha_limite)}</span>
            </div>
            <div class="timeline-card-body">
              <strong>Establecimiento:</strong> ${escapeHtml(p.puerta_entrada || 'Hospital II-1 Huarmey')} • <strong>Agenda DNT</strong><br>
              Se recomienda enviar recordatorio preventivo vía WhatsApp para asegurar continuidad y dispensación de fármacos.
            </div>
          </div>
        </div>
      `;
    } else {
      timelineItemsHtml += `
        <div class="timeline-item">
          <div class="timeline-dot dot-green">
            ${window.AppIcons ? window.AppIcons.calendar(12, '#1e8e3e') : '•'}
          </div>
          <div class="timeline-card" style="border-left:3px solid var(--hearts-green);">
            <div class="timeline-card-header">
              <span class="timeline-card-title" style="color:var(--hearts-green-text);">Próximo Control Programado</span>
              <span class="timeline-card-date">${formatDatePE(p.fecha_limite)} (en ${escapeHtml(p.dias_restantes)} días)</span>
            </div>
            <div class="timeline-card-body">
              <strong>Establecimiento:</strong> ${escapeHtml(p.puerta_entrada || 'Hospital II-1 Huarmey')}<br>
              Seguimiento regular cada ${escapeHtml(p.frecuencia_hearts || 90)} días. Adherencia al esquema terapéutico vigente.
            </div>
          </div>
        </div>
      `;
    }

    // Eventos de la línea de tiempo (A11): se piden al servidor al abrir la ficha y se pintan en este contenedor
    timelineItemsHtml += `<div id="ficha-eventos" data-paciente="${escapeHtml(p.id)}"><div class="timeline-vacio">Cargando eventos…</div></div>`;

    // Conducta clínica resumida y serena (sin saturar la pantalla)
    let conductaTexto = '';
    let conductaClase = 'conducta-neutral';
    if (p.fallecido) {
      conductaTexto = `Paciente registrado como fallecido en monitoreo DNT (${escapeHtml(p.observacion || 'Verificado')}). Excluir de programación activa.`;
      conductaClase = 'conducta-dark';
    } else if (isHosix) {
      conductaTexto = `Captación en Consulta Externa (${escapeHtml(p.observacion || 'HOSIX')}) pendiente de empadronamiento en Estrategia DNT y toma de laboratorio basal en ${escapeHtml(p.puerta_entrada)}.`;
      conductaClase = 'conducta-purple';
    } else if (p.semaforo === 'red') {
      conductaTexto = `Cita vencida hace ${escapeHtml(p.dias_vencido)} días. Según Vía Clínica HEARTS, requiere citación prioritaria en HOSIX o visita domiciliaria en ${escapeHtml(p.sector_sanitario)}.`;
      conductaClase = 'conducta-red';
    } else if (p.semaforo === 'yellow') {
      conductaTexto = `Próximo control programado en ${escapeHtml(p.dias_restantes)} días (${formatDatePE(p.fecha_limite)}). Enviar recordatorio preventivo por WhatsApp.`;
      conductaClase = 'conducta-yellow';
    } else {
      conductaTexto = `Seguimiento al día en meta terapéutica. Continuar control cada ${escapeHtml(p.frecuencia_hearts || 90)} días en ${escapeHtml(p.puerta_entrada)}.`;
      conductaClase = 'conducta-green';
    }

    const rawPhone = p.telefono ? String(p.telefono).replace(/\D/g, '') : '';
    const hasPhone = rawPhone.length >= 9;

    const iconClipboard = window.AppIcons ? window.AppIcons.clipboardCheck(18, '#1A73E8') : '';
    const iconPhone = window.AppIcons ? window.AppIcons.phone(13, '#5F6368') : '';
    const iconLocation = window.AppIcons ? window.AppIcons.location(13, '#5F6368') : '';
    const iconMap = window.AppIcons ? window.AppIcons.map(13, '#5F6368') : '';
    const iconHospital = window.AppIcons ? window.AppIcons.hospital(13, '#5F6368') : '';
    const iconStethoscope = window.AppIcons ? window.AppIcons.stethoscope(16, '#1A73E8') : '';
    const iconHeartPulse = window.AppIcons ? window.AppIcons.heartPulse(16, '#D93025') : '';
    const iconPill = window.AppIcons ? window.AppIcons.pill(16, '#9334E6') : '';
    const iconLab = window.AppIcons ? window.AppIcons.lab(16, '#1A73E8') : '';
    const iconHistory = window.AppIcons ? window.AppIcons.history(16, '#1A73E8') : '';
    const iconBtnLocation = window.AppIcons ? window.AppIcons.location(14, '#FFFFFF') : '';
    const iconBtnEdit = window.AppIcons ? window.AppIcons.edit(14, '#FFFFFF') : '';
    const iconBtnCalendar = window.AppIcons ? window.AppIcons.calendar(14, '#FFFFFF') : '';
    const iconBtnWhatsapp = window.AppIcons ? window.AppIcons.whatsapp(14, '#FFFFFF') : '';
    const iconRefresh = window.AppIcons ? window.AppIcons.refresh(12, '#1A73E8') : '';
    const ubicFicha = this._datosUbicacionFicha(p);

    modal.innerHTML = `
      <div class="modal-box hearts-ficha-modal" role="dialog" aria-modal="true" aria-labelledby="ficha-paciente-title">
        <!-- CABECERA INSTITUCIONAL COMPACTA -->
        <div class="hearts-ficha-header">
          <div class="hearts-ficha-title-wrap">
            <span class="hearts-ficha-kicker">MINSA PERÚ • VÍA CLÍNICA HEARTS (OPS/OMS) • RIS PACÍFICO SUR</span>
            <span id="ficha-paciente-title" class="hearts-ficha-main-title">${iconClipboard} FICHA CLÍNICA Y SEGUIMIENTO TERRITORIAL DNT</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            ${p.fila_excel ? `<span class="hearts-padron-pill">Padrón #${escapeHtml(p.fila_excel)}</span>` : ''}
            <button class="hearts-close-btn btn-close-accessible" onclick="document.getElementById('modal-patient-detail').classList.remove('active')" title="Cerrar ficha clínica" aria-label="Cerrar ficha clínica">✕</button>
          </div>
        </div>

        <div class="hearts-ficha-body">
          <!-- 1. BLOQUE DE FILIACIÓN E IDENTIFICACIÓN (DATOS 100% SEPARADOS E INDIVIDUALES) -->
          <div class="hearts-patient-banner">
            <div class="hearts-patient-top">
              <div class="hearts-patient-identity">
                <h2 class="hearts-patient-name">${escapeHtml(p.apellidos_nombres)}</h2>
                <div class="hearts-diag-row">
                  ${condPills}
                </div>
              </div>
              <div class="hearts-status-pills">
                ${clinicoBadgeHtml}
                ${semaforoBadgeHtml}
              </div>
            </div>

            <!-- Fila Demográfica: 6 Campos Independientes (Nunca concatenados) -->
            <div class="hearts-demo-grid-6">
              <div class="hearts-id-item">
                <span class="hearts-id-label">DNI / Documento</span>
                <span class="hearts-id-val">${escapeHtml(p.dni || 'Sin registro')}</span>
              </div>
              <div class="hearts-id-item">
                <span class="hearts-id-label">Historia Clínica</span>
                <span class="hearts-id-val">${escapeHtml(p.historia_clinica || 'Sin registro')}</span>
              </div>
              <div class="hearts-id-item">
                <span class="hearts-id-label">Edad Actual</span>
                <span class="hearts-id-val">${p.edad != null ? escapeHtml(p.edad) + ' años' : 'Sin registro'}</span>
              </div>
              <div class="hearts-id-item">
                <span class="hearts-id-label">Sexo Biológico</span>
                <span class="hearts-id-val">${escapeHtml(formatSexoTxt(p.sexo))}</span>
              </div>
              <div class="hearts-id-item">
                <span class="hearts-id-label">Fecha de Nacimiento</span>
                <span class="hearts-id-val">${escapeHtml(formatDatePE(p.fecha_nacimiento))}</span>
              </div>
              <div class="hearts-id-item">
                <span class="hearts-id-label">Seguro de Salud</span>
                <span class="hearts-id-val">${escapeHtml(p.financiador || 'SIS')}</span>
              </div>
            </div>

            <!-- Fila Territorial y Contacto: 4 Campos Independientes -->
            <div class="hearts-demo-grid-4">
              <div class="hearts-id-item">
                <span class="hearts-id-label">${iconPhone} Teléfono / Celular</span>
                <span class="hearts-id-val">${escapeHtml(formatPhone(p.telefono))}</span>
              </div>
              <div class="hearts-id-item">
                <span class="hearts-id-label">${iconLocation} Dirección Domiciliaria</span>
                <span class="hearts-id-val">${escapeHtml(p.direccion || 'Sin registro')}</span>
              </div>
              <div class="hearts-id-item">
                <span class="hearts-id-label">${iconMap} Sector Sanitario</span>
                <span class="hearts-id-val">${escapeHtml(p.sector_sanitario || 'Sin sector')}</span>
                ${ubicFicha.avisoSector}
              </div>
              <div class="hearts-id-item">
                <span class="hearts-id-label">${iconHospital} IPRESS Adscrita</span>
                <span class="hearts-id-val" style="color:#0369a1;">${escapeHtml(p.puerta_entrada || 'Hospital II-1 Huarmey')}</span>
              </div>
            </div>

            <!-- Ubicación del domicilio: precisión, coordenadas y cómo fijarla exactamente -->
            <div class="ficha-ubicacion ${ubicFicha.clase}">
              <div class="ficha-ubicacion-info">
                <span class="hearts-id-label">${iconLocation} Ubicación del domicilio</span>
                <span class="ficha-ubicacion-estado">${escapeHtml(ubicFicha.desc.etiqueta)}</span>
                <span class="ficha-ubicacion-detalle">${ubicFicha.detalle}</span>
              </div>
              <div class="ficha-ubicacion-acciones">
                ${ubicFicha.tieneCoords ? `<button class="btn-mini btn-ubicar" onclick="document.getElementById('modal-patient-detail').classList.remove('active'); window.app.centrarPaciente(${argJs(p.id)})">Ver en el mapa</button>` : ''}
                ${ubicFicha.puedeUbicar ? `<button class="btn-mini btn-precita" onclick="window.app.iniciarFijarUbicacion(${argJs(p.id)})">📍 ${ubicFicha.desc.exacta ? 'Corregir ubicación' : 'Fijar ubicación exacta'}</button>` : ''}
              </div>
            </div>
          </div>

          <!-- 2. DISTRIBUCIÓN EN 2 COLUMNAS BALANCEADAS SEGÚN PILARES VÍA CLÍNICA HEARTS -->
          <div class="hearts-clinical-columns">

            <!-- COLUMNA IZQUIERDA: TRIAJE, RIESGO CV Y ESQUEMA TERAPÉUTICO -->
            <div class="hearts-col">

              <!-- PILAR I: SIGNOS VITALES Y ANTROPOMETRÍA -->
              <section class="hearts-section">
                <div class="hearts-section-header">
                  <span class="hearts-sec-title">${iconStethoscope} I. Triaje Clínico y Antropometría</span>
                  <span class="hearts-sec-tag">Meta PA: &lt; 140/90 mmHg</span>
                </div>
                <div class="hearts-section-body">
                  <!-- Indicador Principal HEARTS: Presión Arterial -->
                  <div class="hearts-pa-hero ${paStatus === 'ok' ? 'pa-ok' : (paStatus === 'alert' ? 'pa-alert' : '')}">
                    <div>
                      <span class="hearts-pa-title">Presión Arterial (PA)</span>
                      <span class="hearts-pa-sub">Medición estandarizada Vía Clínica HEARTS</span>
                    </div>
                    <div class="hearts-pa-right">
                      <span class="hearts-pa-val">${paValStr ? `${paValStr} <small>mmHg</small>` : '<span class="hearts-empty-val">Sin registro</span>'}</span>
                      ${paBadgeTxt ? `<span class="hearts-mini-pill is-${paStatus}">${paBadgeTxt}</span>` : ''}
                    </div>
                  </div>

                  <!-- Grilla Antropométrica en 5 Celdas Individuales -->
                  <div class="hearts-anthro-grid">
                    ${renderMetricCell('Peso Corporal', p.peso, 'kg')}
                    ${renderMetricCell('Talla', p.talla, 'm')}
                    ${renderMetricCell('IMC', p.imc, 'kg/m²')}
                    ${renderMetricCell('Perímetro Abd.', p.pab, 'cm')}
                    ${renderMetricCell('Estado Nutricional', p.diagnostico_nutricional, '', 'Según IMC', nutStatus)}
                  </div>
                </div>
              </section>

              <!-- PILAR II: ESTRATIFICACIÓN DE RIESGO CARDIOVASCULAR -->
              <section class="hearts-section">
                <div class="hearts-section-header">
                  <span class="hearts-sec-title">${iconHeartPulse} II. Estratificación de Riesgo Cardiovascular</span>
                  <span class="hearts-sec-tag">OPS / MINSA</span>
                </div>
                <div class="hearts-section-body">
                  <div class="hearts-grid-3">
                    ${renderMetricCell('Riesgo Cardiovascular', p.riesgo_cv, '', 'Escala HEARTS', rcvStatus)}
                    ${renderMetricCell('Daño Órgano Blanco', p.dano_organo_blanco, '', 'Evaluación clínica', dobStatus)}
                    ${renderMetricCell('Comorbilidades', p.otras_patologias, '', 'Asociadas')}
                  </div>
                </div>
              </section>

              <!-- PILAR III: PROTOCOLO FARMACOLÓGICO ESCALONADO HEARTS -->
              <section class="hearts-section" style="margin-bottom:0;">
                <div class="hearts-section-header">
                  <span class="hearts-sec-title">${iconPill} III. Protocolo Farmacológico HEARTS</span>
                  <span class="hearts-sec-tag">Esquema Actual</span>
                </div>
                <div class="hearts-section-body">
                  <div class="hearts-grid-2">
                    ${renderMetricCell('Esquema Antihipertensivo (HTA)', p.tratamiento_hta, '', 'IECA / ARA-II / BCC')}
                    ${renderMetricCell('Esquema Antidiabético (DM2)', p.tratamiento_dm, '', 'Norma Técnica DM2')}
                  </div>
                </div>
              </section>

            </div>

            <!-- COLUMNA DERECHA: LABORATORIO METABÓLICO Y SEGUIMIENTO ANUAL -->
            <div class="hearts-col">

              <!-- PILAR IV: MONITOREO METABÓLICO Y LABORATORIO CLÍNICO -->
              <section class="hearts-section">
                <div class="hearts-section-header">
                  <span class="hearts-sec-title">${iconLab} IV. Laboratorio Clínico y Metabólico</span>
                  <span class="hearts-sec-tag">Fecha Examen: ${formatDatePE(p.fecha_examenes)}</span>
                </div>
                <div class="hearts-section-body">
                  <!-- Subbloque 1: Control Glicémico (Separados individualmente) -->
                  <div class="hearts-sub-label">Control Glicémico (Indicadores Independientes)</div>
                  <div class="hearts-grid-2" style="margin-bottom:10px;">
                    ${renderMetricCell('Glucosa Basal en Ayunas', p.glucosa, 'mg/dL', 'Meta: 70–130', gluStatus, gluBadgeTxt)}
                    ${renderMetricCell('Hemoglobina Glicosilada (HbA1c)', a1cValStr, '%', 'Meta: < 7.0%', a1cStatus, a1cBadgeTxt)}
                  </div>

                  <!-- Subbloque 2: Función Renal -->
                  <div class="hearts-sub-label">Función Renal (Tamizaje Nefropatía)</div>
                  <div class="hearts-grid-3" style="margin-bottom:10px;">
                    ${renderMetricCell('Creatinina Sérica', p.creatinina, 'mg/dL')}
                    ${renderMetricCell('Microalbuminuria', p.microalbumina, 'mg/L')}
                    ${renderMetricCell('Depuración Creat.', p.depuracion_creatinina, 'mL/min')}
                  </div>

                  <!-- Subbloque 3: Perfil Lipídico -->
                  <div class="hearts-sub-label">Perfil Lipídico Completo</div>
                  <div class="hearts-grid-4">
                    ${renderMetricCell('Colesterol Total', p.colesterol_total, 'mg/dL')}
                    ${renderMetricCell('Colesterol LDL', p.colesterol_ldl, 'mg/dL')}
                    ${renderMetricCell('Colesterol HDL', p.colesterol_hdl, 'mg/dL')}
                    ${renderMetricCell('Triglicéridos', p.trigliceridos, 'mg/dL')}
                  </div>
                </div>
              </section>

              <!-- PILAR V: HISTÓRICO CLÍNICO Y SEGUIMIENTO LONGITUDINAL -->
              <section class="hearts-section" style="margin-bottom:0;">
                <div class="hearts-section-header">
                  <span class="hearts-sec-title">${iconHistory} V. Histórico Clínico y Evolución HEARTS</span>
                  <span class="hearts-sec-tag">Seguimiento Anual</span>
                </div>
                <div class="hearts-section-body">
                  <!-- Fila de Programación en 3 Celdas Individuales -->
                  <div class="hearts-grid-3" style="margin-bottom:12px;">
                    ${renderMetricCell('Periodicidad HEARTS', p.frecuencia_hearts ? `Cada ${escapeHtml(p.frecuencia_hearts)} días` : 'Cada 30 días', '', isControlado ? 'Controlado' : 'No controlado')}
                    ${renderMetricCell('Próxima Cita', formatDatePE(p.fecha_limite), '', 'Agenda DNT')}
                    ${renderMetricCell('Fuente Registro', isHosix ? 'HOSIX (Brecha)' : 'Padrón Estandarizado', '', p.estado_empadronamiento || '')}
                  </div>
                  <div class="hearts-grid-3" style="margin-bottom:12px;">
                    ${renderMetricCell('Consentimiento WhatsApp', ({ si: 'Sí, firmado', no: 'No autoriza', sin_registrar: 'Sin registrar' })[window.WhatsappNotifier.estadoConsentimiento(p)], '', p.consentimiento_fecha ? `Registrado el ${formatDatePE(p.consentimiento_fecha)}` : '')}
                  </div>

                  <!-- 1. Evolución Trimestral de PA (Grilla de 4 Trimestres) -->
                  <div class="hearts-sub-label">Evolución Trimestral de Presión Arterial 2026 (Meta: &lt; 140/90 mmHg)</div>
                  ${quartersGridHtml}

                  <!-- 2. Línea de Tiempo Longitudinal -->
                  <div class="hearts-sub-label">Línea de Tiempo Clínica (Histórico Longitudinal de Atención)</div>
                  <div class="hearts-timeline">
                    ${timelineItemsHtml}
                  </div>

                  <!-- Barra Serena de Conducta Vía Clínica HEARTS -->
                  <div class="hearts-conducta-bar ${conductaClase}">
                    <strong>Conducta Vía Clínica HEARTS:</strong> ${conductaTexto}
                    ${p.nota_duplicado_padron ? `<div style="margin-top:4px; font-size:var(--font-xs); opacity:0.9;">${iconRefresh} <strong>Trazabilidad:</strong> ${p.nota_duplicado_padron}</div>` : ''}
                  </div>
                </div>
              </section>

            </div>

          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-mini btn-ubicar" onclick="document.getElementById('modal-patient-detail').classList.remove('active'); window.app.centrarPaciente(${argJs(p.id)})">${iconBtnLocation} Ubicar en Mapa</button>
          <button class="btn-mini btn-precita" style="background:#16a34a; border-color:#15803d; color:#ffffff;" onclick="document.getElementById('modal-patient-detail').classList.remove('active'); if(window.RegistroClinicoModal) window.RegistroClinicoModal.open('${p.dni || p.nro_documento || ''}');" title="Registrar nueva atención médica en Padrón Estandarizado">${iconBtnEdit} Registrar Atención</button>
          <button class="btn-mini btn-precita" onclick="document.getElementById('modal-patient-detail').classList.remove('active'); window.app.abrirModalPreCita(${argJs(p.id)})">${iconBtnCalendar} Pre-cita HOSIX</button>
          <button class="btn-mini btn-whatsapp" ${hasPhone ? `onclick="window.app.enviarWhatsApp(${argJs(p.id)})"` : 'disabled title="Paciente sin número de celular registrado" aria-disabled="true"'} aria-label="Notificar por WhatsApp a ${escapeHtml(p.apellidos_nombres)}">${iconBtnWhatsapp} Notificar por WhatsApp</button>
        </div>
      </div>
    `;

    modal.classList.add('active');
    this.cargarEventosPaciente(p);

    // Manejo de foco y soporte de tecla Escape para cerrar modal
    const closeHandler = (e) => {
      if (e.key === 'Escape') {
        modal.classList.remove('active');
        document.removeEventListener('keydown', closeHandler);
      }
    };
    document.addEventListener('keydown', closeHandler);
  }

  abrirModalConsentimiento(p) {
    if (!this.permisos().escribir) {
      this.showToast('El paciente no tiene consentimiento registrado y su rol no permite registrarlo.', 'warning', 5000);
      return;
    }
    this.pacienteConsentimiento = p;
    document.getElementById('modal-consentimiento-estado').textContent =
      'El paciente no tiene consentimiento registrado para recibir recordatorios por WhatsApp. Se pregunta una sola vez: su respuesta queda guardada.';
    document.getElementById('modal-consentimiento-dni').textContent = p.dni || '';
    document.getElementById('modal-consentimiento-paciente').textContent = p.apellidos_nombres || '';
    document.getElementById('modal-consentimiento').classList.add('active');
  }

  cerrarModalConsentimiento() {
    this.pacienteConsentimiento = null;
    document.getElementById('modal-consentimiento').classList.remove('active');
  }

  /** Guarda el consentimiento en el servidor y, si fue "Sí", continúa con el envío. */
  async registrarConsentimiento(valor) {
    const p = this.pacienteConsentimiento;
    if (!p) return;
    if (!this.permisos().escribir) {
      this.showToast('Su rol no permite registrar el consentimiento.', 'warning', 4000);
      return;
    }
    const base = this.apiEndpoints().API_PATIENTS || '/api/patients';
    try {
      const res = await this.session.authFetch(`${base}/${encodeURIComponent(p.id)}/consentimiento`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consentimiento: valor })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      p.consentimiento = data.data.consentimiento;
      p.consentimiento_fecha = data.data.consentimiento_fecha;
      p.consentimiento_registrado_por = data.data.consentimiento_registrado_por;
    } catch (e) {
      this.showToast('El servidor no guardó el consentimiento. No se envió ningún mensaje.', 'danger', 5000);
      return;
    }
    this.cerrarModalConsentimiento();
    if (valor === 'Sí, firmado') {
      this.showToast('Consentimiento registrado.', 'success', 2500);
      this.enviarWhatsApp(p.id);
    } else {
      this.showToast('Se registró que el paciente no autoriza recordatorios por WhatsApp.', 'info', 4000);
    }
  }

  /** Pide al servidor los indicadores del convenio SIS y de HEARTS (A8) y los pinta en el tablero. */
  async loadIndicadoresConvenio() {
    const tbody = document.getElementById('ind-convenio-tbody');
    if (!tbody) return;
    const nota = document.getElementById('ind-periodo');
    try {
      const res = await this.session.authFetch((this.apiEndpoints().API_INDICADORES || '/api/indicadores') + '/convenio');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const r = await res.json();
      this.renderIndicadoresConvenio(r);
    } catch (e) {
      if (nota) nota.textContent = 'No se pudieron calcular los indicadores.';
      tbody.innerHTML = '';
    }
  }

  renderIndicadoresConvenio(r) {
    const fecha = (s) => String(s).split('-').reverse().join('/');
    const fmt = (v) => (v === null || v === undefined) ? '—' : `${Number(v).toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
    const nota = document.getElementById('ind-periodo');
    if (nota) nota.textContent = `Periodo del convenio (IP02, IP03 e IP04): ${fecha(r.periodo.desde)} a ${fecha(r.periodo.hasta)}. Control HEARTS y telemonitoreo: año completo.`;

    const meta = (i) => i.modo === 'meta'
      ? `${i.meta} %${i.porcentaje !== null ? (i.porcentaje >= i.meta ? ' · alcanzada' : ' · por debajo') : ''}`
      : 'Seguimiento (no es meta en este nivel)';
    const fila = (nombre, num, den, porc, metaTxt, fuente) => `
      <tr>
        <td><strong>${escapeHtml(nombre)}</strong></td>
        <td>${escapeHtml(num)}</td>
        <td>${escapeHtml(den)}</td>
        <td><strong>${escapeHtml(porc)}</strong></td>
        <td>${escapeHtml(metaTxt)}</td>
        <td style="font-size:var(--font-xs);">${escapeHtml(fuente)}</td>
      </tr>`;
    const t = r.total;
    const h = t.hearts;
    const cobHta = h.cobertura_hta;
    const cobDm = h.cobertura_dm;
    document.getElementById('ind-convenio-tbody').innerHTML =
      fila('IP02 · Diabéticos con HbA1c', t.ip02.numerador, t.ip02.denominador, fmt(t.ip02.porcentaje), meta(t.ip02), t.ip02.fuente) +
      fila('IP03 · Diabéticos con microalbuminuria y creatinina', t.ip03.numerador, t.ip03.denominador, fmt(t.ip03.porcentaje), meta(t.ip03), t.ip03.fuente) +
      fila('IP04 · Hipertensos en meta terapéutica', t.ip04.numerador, t.ip04.denominador, fmt(t.ip04.porcentaje), meta(t.ip04), t.ip04.fuente) +
      Object.keys(t.control_definiciones).map(k => {
        const d = t.control_definiciones[k];
        return fila(`Controlado (${d.nombre})`, d.numerador, d.denominador, fmt(d.porcentaje), `${d.regla}${d.no_evaluables ? ` ${d.no_evaluables} sin mediciones suficientes.` : ''}`, d.fuente);
      }).join('') +
      fila('Cobertura HEARTS · Hipertensos en el padrón', cobHta.padron, cobHta.esperados === null ? 'Esperados sin declarar' : cobHta.esperados, fmt(cobHta.porcentaje), '80 % (compromiso de mejora 39)', 'DS 021-2025-SA, Anexo I, ficha 39') +
      fila('Cobertura HEARTS · Diabéticos en el padrón', cobDm.padron, cobDm.esperados === null ? 'Esperados sin declarar' : cobDm.esperados, fmt(cobDm.porcentaje), '80 % (compromiso de mejora 39)', 'DS 021-2025-SA, Anexo I, ficha 39') +
      fila('Telemonitoreo · Pacientes con HTA o DM atendidos', t.telemonitoreo.pacientes_atendidos, t.telemonitoreo.poblacion, fmt(t.telemonitoreo.porcentaje), `${t.telemonitoreo.atenciones} atenciones en el año`, t.telemonitoreo.fuente);

    // La tarjeta «Control» del tablero usa la misma cifra HEARTS del panel (una sola definición a la vista)
    const hc = t.control_definiciones.hearts;
    const heroControl = document.getElementById('dash-val-control');
    if (heroControl) {
      heroControl.textContent = hc.porcentaje === null ? '—' : `${Math.round(hc.porcentaje)}%`;
      this._heroDelServidor = true;
    }
    const heroPie = document.getElementById('dash-foot-control');
    if (heroPie) heroPie.textContent = `HEARTS: última presión < 140/90 mmHg en ${hc.numerador} de ${hc.denominador} hipertensos`;

    const filas = Object.values(r.por_establecimiento)
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)))
      .map(e => {
        const celda = (i) => `${i.numerador} de ${i.denominador} · ${fmt(i.porcentaje)}${i.modo === 'seguimiento' ? ' (seguimiento)' : ''}`;
        return `
      <tr>
        <td><strong>${escapeHtml(e.nombre)}</strong></td>
        <td>${escapeHtml(e.categoria || 'Sin dato')}</td>
        <td>${escapeHtml(celda(e.ip02))}</td>
        <td>${escapeHtml(celda(e.ip03))}</td>
        <td>${escapeHtml(celda(e.ip04))}</td>
        <td>${escapeHtml(`${e.hearts.hta_en_meta} de ${e.hearts.hta_con_medicion} · ${fmt(e.hearts.control_porcentaje)}`)}</td>
      </tr>`;
      });
    document.getElementById('ind-est-tbody').innerHTML = filas.join('') || '<tr><td colspan="6">Sin pacientes en su alcance.</td></tr>';
  }

  /** Pide al servidor la línea de tiempo del paciente (A11) y la pinta en la ficha. */
  async cargarEventosPaciente(p) {
    const cont = document.getElementById('ficha-eventos');
    if (!cont) return;
    const base = this.apiEndpoints().API_PATIENTS || '/api/patients';
    try {
      const res = await this.session.authFetch(`${base}/${encodeURIComponent(p.id)}/eventos`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // La ficha pudo cerrarse o cambiar de paciente mientras llegaba la respuesta
      const actual = document.getElementById('ficha-eventos');
      if (!actual || actual.getAttribute('data-paciente') !== String(p.id)) return;
      actual.innerHTML = this.renderEventosHtml(data.eventos || []);
    } catch (e) {
      const actual = document.getElementById('ficha-eventos');
      if (actual) actual.innerHTML = '<div class="timeline-vacio">No se pudieron cargar los eventos del paciente.</div>';
    }
  }

  renderEventosHtml(eventos) {
    if (!eventos.length) return '<div class="timeline-vacio">Sin eventos registrados para este paciente.</div>';
    const TIPOS = {
      control: { etq: 'Control', dot: 'dot-green' },
      cita: { etq: 'Cita', dot: 'dot-blue' },
      referencia: { etq: 'Referencia', dot: 'dot-yellow' },
      contrarreferencia: { etq: 'Contrarreferencia', dot: 'dot-green' },
      cambio_establecimiento: { etq: 'Cambio de establecimiento', dot: 'dot-blue' },
      telemonitoreo: { etq: 'Telemonitoreo', dot: 'dot-green' }
    };
    const fechaPE = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? String(s).split('-').reverse().join('/') : escapeHtml(s);
    return eventos.map(e => {
      const t = TIPOS[e.tipo] || { etq: escapeHtml(e.tipo), dot: 'dot-blue' };
      const lugar = e.destino_establecimiento
        ? `${escapeHtml(e.establecimiento || 'Sin dato')} → ${escapeHtml(e.destino_establecimiento)}`
        : escapeHtml(e.establecimiento || 'Establecimiento sin dato');
      const quien = e.registrado_por
        ? `${escapeHtml(e.registrado_por)}${e.rol_registrante ? ' (' + escapeHtml(e.rol_registrante) + ')' : ''}`
        : 'Sin dato';
      return `
        <div class="timeline-item">
          <div class="timeline-dot ${t.dot}"></div>
          <div class="timeline-card">
            <div class="timeline-card-header">
              <span class="timeline-card-title">${t.etq}${e.estado ? ' · ' + escapeHtml(e.estado) : ''}</span>
              <span class="timeline-card-date">${fechaPE(e.fecha)}</span>
            </div>
            <div class="timeline-card-body">
              <strong>Establecimiento:</strong> ${lugar}<br>
              ${e.detalle ? escapeHtml(e.detalle) + '<br>' : ''}<strong>Registró:</strong> ${quien}
            </div>
          </div>
        </div>`;
    }).join('');
  }

  abrirModalPreCita(idOrDni) {
    if (!this.permisos().escribir) {
      this.showToast('Su rol no permite generar pre-citas.', 'warning', 4000);
      return;
    }
    const p = this.findPatient(idOrDni);
    if (!p) return;

    this.selectedPatientForPreCita = p;
    document.getElementById('modal-precita-dni').textContent = p.dni;
    document.getElementById('modal-precita-paciente').textContent = p.apellidos_nombres;
    document.getElementById('modal-precita-diag').textContent = (p.diagnosticos || []).join(', ');

    document.getElementById('modal-precita-fecha').value = window.FechaLima.hoy(3);

    document.getElementById('modal-precita').classList.add('active');
  }

  async confirmarPreCita() {
    if (!this.selectedPatientForPreCita) return;
    if (!this.permisos().escribir) {
      this.showToast('Su rol no permite generar pre-citas.', 'warning', 4000);
      return;
    }
    const p = this.selectedPatientForPreCita;
    const fecha = document.getElementById('modal-precita-fecha')?.value || window.FechaLima.hoy();
    const consultorio = document.getElementById('modal-precita-consultorio')?.value || 'Consultorio de Crónicos / Medicina Interna';

    window.AlertsManager.crearPreCita(p, fecha, consultorio);
    document.getElementById('modal-precita').classList.remove('active');

    // Sincronizar con el servidor HL7 FHIR / Base de Datos (con el token de la sesión; el servidor valida la red)
    const token = this.session.getToken();
    const precitaUrl = this.apiEndpoints().API_PRECITAS || '/api/appointments/pre-cita';
    let mensaje = `Pre-cita registrada en Admisión HOSIX (${escapeHtml(p.apellidos_nombres)} — ${escapeHtml(fecha)})`;
    let tipo = 'success';

    try {
      const res = await this.session.authFetch(precitaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: p.id,
          fecha_sugerida: fecha,
          comentario: `Pre-cita HEARTS (${consultorio}) para paciente ${p.apellidos_nombres} (DNI: ${p.dni})`
        })
      });
      if (this.session.getToken() !== token) return; // la sesión se cerró mientras se enviaba
      if (res.status === 403) {
        mensaje = 'El servidor no autorizó la pre-cita: el paciente no pertenece a su red. Quedó solo en esta sesión.';
        tipo = 'warning';
      } else if (!res.ok && res.status !== 401) {
        mensaje = `La pre-cita no se pudo guardar en el servidor (código ${res.status}). Quedó solo en esta sesión.`;
        tipo = 'warning';
      }
    } catch (e) {
      mensaje = 'Sin conexión con el servidor: la pre-cita quedó solo en esta sesión.';
      tipo = 'warning';
    }

    this.showToast(mensaje, tipo, 5000);
    this.render();
  }

  enviarWhatsApp(idOrDni) {
    const p = this.findPatient(idOrDni);
    if (!p) return;

    // Sin consentimiento registrado no se genera el enlace (A12, Ley N° 29733).
    // Si ya respondió "No" no se vuelve a preguntar; si nunca se registró (paciente anterior al formulario), se pregunta una vez.
    const estadoConsent = window.WhatsappNotifier.estadoConsentimiento(p);
    if (estadoConsent === 'no') {
      this.showToast('El paciente no autorizó recordatorios por WhatsApp.', 'warning', 4000);
      return;
    }
    if (estadoConsent !== 'si') {
      this.abrirModalConsentimiento(p);
      return;
    }

    const fechaSugerida = new Date();
    fechaSugerida.setDate(fechaSugerida.getDate() + 3);
    const fechaStr = fechaSugerida.toLocaleDateString('es-PE');

    const url = window.WhatsappNotifier.generarEnlace(p, fechaStr);
    if (!url) {
      this.showToast(`El paciente ${p.apellidos_nombres} no registra número celular válido en el Padrón ni en HOSIX.`, "warning", 4000);
      return;
    }
    window.open(url, '_blank');
    this.showToast(`Abriendo WhatsApp para notificar a ${p.apellidos_nombres}...`, "info", 3000);
  }

  sendWhatsAppDirect(idOrDni) {
    this.enviarWhatsApp(idOrDni);
  }

  bindEvents() {
    // 1. Filtrado interactivo mediante clic en los números KPI del HUD flotante (Progressive Disclosure)
    const kpiCards = {
      'kpi-total': 'ALL',
      'kpi-green': 'green',
      'kpi-yellow': 'yellow',
      'kpi-red': 'red',
      'kpi-purple': 'purple'
    };

    Object.keys(kpiCards).forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        const card = el.closest('.kpi-card');
        if (card) {
          card.addEventListener('click', () => {
            const targetFilter = kpiCards[id];
            const panel = document.getElementById('hearts-panel');
            const isAlreadyActive = card.classList.contains('active') && panel && !panel.classList.contains('collapsed');

            if (isAlreadyActive) {
              this.toggleHeartsPanel(false);
              return;
            }

            document.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            this.visibleLimit = 50;
            this.currentFilter.semaforo = targetFilter;

            // Sincronizar chips del panel
            document.querySelectorAll('[data-filter-semaforo]').forEach(b => {
              b.classList.toggle('active', b.dataset.filterSemaforo === targetFilter);
            });

            this.render();
            this.switchHeartsTab('pacientes');
            this.toggleHeartsPanel(true);
          });
        }
      }
    });

    // 2. Filtros de diagnóstico CIE-10
    document.querySelectorAll('[data-filter-diag]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('[data-filter-diag]').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.visibleLimit = 50;
        this.currentFilter.diagnostico = e.currentTarget.dataset.filterDiag;
        if (e.currentTarget.dataset.filterDiag === 'ALL') {
          this.currentFilter.semaforo = 'ALL';
          document.querySelectorAll('[data-filter-semaforo]').forEach(b => b.classList.remove('active'));
        }
        this.render();
      });
    });

    // 3. Filtros rápidos de semáforo
    document.querySelectorAll('[data-filter-semaforo]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget.dataset.filterSemaforo;
        const isAlready = e.currentTarget.classList.contains('active') && this.currentFilter.semaforo === target;
        document.querySelectorAll('[data-filter-semaforo]').forEach(b => b.classList.remove('active'));
        if (isAlready) {
          this.currentFilter.semaforo = 'ALL';
        } else {
          e.currentTarget.classList.add('active');
          this.currentFilter.semaforo = target;
        }
        this.visibleLimit = 50;
        this.render();
      });
    });

    // 4. Búsqueda reactiva con Debounce (120ms), Enter, Botón Ir y Botón Limpiar (✕)
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.querySelector('.georis-search-btn');
    const clearBtn = document.getElementById('btn-clear-search');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (clearBtn) clearBtn.style.display = val.length > 0 ? 'block' : 'none';
        if (this._searchDebounceTimer) clearTimeout(this._searchDebounceTimer);
        this._searchDebounceTimer = setTimeout(() => {
          this.currentFilter.search = val;
          this.visibleLimit = 50;
          if (val.length >= 2) {
            this.toggleHeartsPanel(true);
          }
          this.render();
        }, 120);
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (this._searchDebounceTimer) clearTimeout(this._searchDebounceTimer);
          this.currentFilter.search = searchInput.value.trim();
          this.render();
          this.ejecutarBusqueda(searchInput.value);
        }
      });
    }

    if (clearBtn && searchInput) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        this.currentFilter.search = '';
        this.visibleLimit = 50;
        this.render();
      });
    }

    if (searchBtn && searchInput) {
      searchBtn.addEventListener('click', () => {
        this.ejecutarBusqueda(searchInput.value);
      });
    }

    // 5. Toggle de Paneles Laterales desde el Header y con tecla Escape
    const btnToggleLayers = document.getElementById('btn-toggle-layers');
    if (btnToggleLayers) {
      btnToggleLayers.addEventListener('click', () => this.toggleLeftSidebar());
    }

    const btnToggleHearts = document.getElementById('btn-toggle-hearts');
    if (btnToggleHearts) {
      btnToggleHearts.addEventListener('click', () => this.toggleHeartsPanel());
    }

    const btnTopSubirExcel = document.getElementById('btn-top-subir-excel');
    if (btnTopSubirExcel) {
      btnTopSubirExcel.addEventListener('click', () => {
        const fileInput = document.getElementById('hosix-file-input');
        if (fileInput) {
          fileInput.value = ''; // Resetear para que elegir el mismo archivo siempre dispare 'change'
          fileInput.click();
        }
      });
    }

    const btnTopNuevoRegistro = document.getElementById('btn-top-nuevo-registro');
    if (btnTopNuevoRegistro) {
      btnTopNuevoRegistro.addEventListener('click', () => {
        if (window.RegistroClinicoModal) {
          window.RegistroClinicoModal.open();
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // La selección de ubicación en el mapa y su ventana manejan su propio Escape
        if (this.mapManager && this.mapManager.seleccion) return;
        const modalUbic = document.getElementById('modal-ubicacion');
        if (modalUbic) { this.cerrarModalUbicacion(); return; }
        const modalDetail = document.getElementById('modal-patient-detail');
        const modalPre = document.getElementById('modal-precita');
        if (modalDetail && modalDetail.classList.contains('active')) {
          modalDetail.classList.remove('active');
        } else if (modalPre && modalPre.classList.contains('active')) {
          modalPre.classList.remove('active');
        } else {
          this.closeAllDrawers();
        }
      }
    });

    // 6. Ingesta de archivos HOSIX / Galenos / Pakamuros
    const fileInput = document.getElementById('hosix-file-input');
    const dropZone = document.getElementById('upload-dropzone');

    if (dropZone && fileInput) {
      dropZone.addEventListener('click', (e) => {
        if (e.target !== fileInput) {
          fileInput.value = '';
          fileInput.click();
        }
      });

      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });

      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
          this.handleFileUpload(e.dataTransfer.files[0]);
        }
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          const file = e.target.files[0];
          this.handleFileUpload(file);
          setTimeout(() => {
            try { fileInput.value = ''; } catch (_) {}
          }, 500);
        }
      });

      const btnBrowse = document.getElementById('btn-browse-excel');
      if (btnBrowse) {
        btnBrowse.addEventListener('click', () => {
          fileInput.value = '';
          fileInput.click();
        });
      }
    }

    // 7. Exportar Pre-citas HOSIX
    const btnExportPreCitas = document.getElementById('btn-export-precitas');
    if (btnExportPreCitas) {
      btnExportPreCitas.addEventListener('click', () => {
        const csv = window.AlertsManager.exportarCsvParaHosix();
        if (!csv) {
          this.showToast('No hay pre-citas pendientes generadas en esta sesión.', 'warning');
          return;
        }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `PreCitas_HOSIX_Huarmey_${window.FechaLima.hoy()}.csv`;
        a.click();
        this.showToast('Archivo CSV de Pre-citas descargado para Admisión HOSIX.', 'success');
      });
    }
  }

  handleFileUpload(file) {
    if (!this.permisos().escribir) {
      this.showToast('Su rol no permite subir archivos de ingesta.', 'warning', 4000);
      return;
    }

    const fileName = (file && file.name) ? file.name.toLowerCase() : '';
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    // 1. Si es archivo Excel (.xlsx, .xls), abrir directamente en el Editor Interactivo
    if (isExcel) {
      if (window.PadronGridModal) {
        this.showToast('Abriendo auditoría y corrector de Padrón en pantalla...', 'info', 3000);
        window.PadronGridModal.openWithFile(file);
        return;
      } else {
        console.error('El módulo PadronGridModal no está disponible en window.');
        this.showToast('Error: El módulo de Padrón no se cargó correctamente.', 'danger', 4000);
      }
    }

    // 2. Si es archivo de texto / CSV
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;

      // Si es un CSV con las columnas del Padrón Estandarizado, abrir en el editor interactivo
      if ((text.includes('Fecha de captación') || text.includes('N.º de documento') || text.includes('Tipo de documento')) && window.PadronGridModal) {
        window.PadronGridModal.openWithFile(file);
        this.showToast('Abriendo auditoría y corrector de Padrón en pantalla...', 'info', 3000);
        return;
      }

      // De lo contrario, procesar con el parser HOSIX / Galenos
      const records = window.HosixParser.parseCSV(text);
      if (records.length === 0) {
        this.showToast('El archivo no contiene filas válidas o el formato no es compatible.', 'danger');
        return;
      }
      const processed = window.HosixParser.processRecords(records);
      this.upsertPatients(processed);
      this.render();
      this.showToast(`¡Ingesta exitosa! Se procesaron y georreferenciaron ${processed.length} pacientes.`, 'success', 5000);
    };
    reader.readAsText(file);
  }

  /**
   * Exporta la lista actual de pacientes (simulados o reales) a un archivo Excel (.xlsx) estandarizado.
   */
  exportarPadronExcel(filename) {
    if (!this.patients || this.patients.length === 0) {
      this.showToast('No hay pacientes para exportar.', 'warning');
      return;
    }
    const XLSX = window.XLSX;
    if (!XLSX) {
      this.showToast('La librería de exportación Excel no está disponible.', 'danger');
      return;
    }

    const name = filename || `Padron_Cronicos_Huarmey_${window.FechaLima.hoy()}.xlsx`;

    if (!window.PadronExportV4) {
      this.showToast('El módulo de exportación del padrón no se cargó correctamente.', 'danger');
      return;
    }

    try {
      // Mismo formato del Excel de llenado v4 que se importa: hojas, encabezados, orden de columnas y fórmulas
      const wb = window.PadronExportV4.construirLibro(XLSX, this.patients);
      XLSX.writeFile(wb, name, { cellDates: true });
      this.showToast(`📥 Descarga iniciada: ${name} (${this.patients.length} pacientes, formato del padrón v4).`, 'success');
    } catch (err) {
      console.error('Error al exportar Excel:', err);
      this.showToast('Error al exportar el archivo Excel: ' + err.message, 'danger');
    }
  }
}

// Inicialización global al cargar DOM
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  window.app.init();
});
