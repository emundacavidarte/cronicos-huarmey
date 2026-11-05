/**
 * mapManager.js (v3.0 Geolocalización exacta, Canvas único y capas GeoRIS coherentes)
 * Orquestador cartográfico basado en Leaflet.js.
 * - Un solo renderer Canvas para TODAS las geometrías (también las rutas, la medición y los círculos de foco):
 *   dos canvas apilados se roban los clics y dejan sin respuesta a los polígonos de abajo.
 * - Orden de apilamiento fijo tras cada redibujo: RIS < zonas < sectores < catastro < terreno < referencias <
 *   resaltado < pacientes (modo canvas) < foco < medición. Los pines de pacientes van en un panel propio,
 *   por encima de los establecimientos.
 * - Selección de ubicación exacta del domicilio (GPS, punto en el mapa o coordenadas) con confirmación visual,
 *   sector GeoRIS en vivo y marcador arrastrable.
 * - Los pacientes se dibujan en su coordenada real; si varios comparten exactamente el mismo punto (dirección
 *   geocodificada a la misma calle) los pines se abren en abanico en pantalla sin mover la coordenada.
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

const GEORIS_POPUP_CONFIG = {
  maxWidth: 380,
  minWidth: 280,
  autoPan: true,
  autoPanPaddingTopLeft: [20, 70], // se recalcula al abrir según los paneles laterales visibles
  autoPanPaddingBottomRight: [20, 20],
  className: 'georis-popup-custom'
};

// Nombres anteriores de los mapas base (siguen funcionando en enlaces y preferencias guardadas)
const BASEMAP_ALIAS = {
  'Esri Calles y Vías': 'Google Calles y Vías',
  'GeoRIS Oficial (MINSA)': 'Esri World Street Map',
  'Esri Satelital Híbrido': 'Google Satélite Híbrido',
  'Gris Claro Minimalista': 'Gris Claro (CARTO)',
  'Modo Noche / Oscuro': 'Modo Noche (CARTO)',
  'Esri Topográfico': 'Google Relieve',
  'OSM Humanitario Salud': 'OSM Humanitario (HOT)'
};
// Mapa base por defecto: OpenStreetMap (licencia abierta ODbL; uso moderado según la política de mosaicos de la OSMF).
// Las capas de Google quedan en el selector: se usan sin clave de API, lo que sus condiciones no permiten para uso
// formal; al contratar la Map Tiles API de Google se reemplazan sus URL por las de la API.
const BASEMAP_POR_DEFECTO = 'OpenStreetMap';
const BASEMAP_SATELITE = 'Esri Satélite (World Imagery)';

const HOSPITAL_HUARMEY = [-10.04780, -78.15480];

function coordsValidas(p) {
  if (!p) return false;
  if (window.GeoUbicacion) return window.GeoUbicacion.validarCoordenadas(p.latitud, p.longitud).ok;
  return typeof p.latitud === 'number' && typeof p.longitud === 'number' && Number.isFinite(p.latitud) && Number.isFinite(p.longitud);
}

class MapManager {
  constructor(containerId = 'map') {
    this.containerId = containerId;
    this.map = null;
    this.baseLayers = {};
    this.currentBaseLayer = null;
    this.currentBaseName = null;
    this.canvasRenderer = null; // Renderer Canvas único de toda la cartografía vectorial

    // Capas jerárquicas GeoRIS (todas FeatureGroup: tienen bringToFront y getBounds)
    this.layers = {
      limiteRis: null,           // Polígonos oficiales de las 7 RIS de Áncash
      zonasSanitarias: null,     // Polígonos oficiales de las 44 Zonas Sanitarias
      sectoresSanitarios: null,  // Polígonos de los 72 Sectores Sanitarios (Pacífico Sur)
      areaSanitaria: null,       // Hospitales de Referencia (II-1, II-2) y terreno del hospital
      zonaSanitaria: null,       // Cabeceras de Zona Sanitaria (I-3, I-4)
      puertaEntrada: null,       // Puertas de entrada y establecimientos vinculados
      referenciasLines: null,    // Red de referencias hacia el Hospital II-1 Huarmey
      activeHighlight: null,     // Ruta de referencia resaltada
      catastroUrbano: null,      // Catastro de Huarmey (lotes y vías)
      pacientes: null,           // Pacientes crónicos HEARTS
      focoPaciente: null         // Halo y radio de incertidumbre del paciente enfocado
    };

    this.cadastreBuildingsLayer = null;
    this.cadastreStreetsLayer = null;
    this.cadastreLoaded = false;

    this.currentRisId = 156;
    this.currentZonaId = 'ALL';
    this.measuring = false;
    this.measurePoints = [];
    this.measurePolyline = null;
    this.rafCoordsId = null;
    this.patientMarkers = new Map();
    this.seleccion = null;      // selección de ubicación exacta en curso
    this.searchPin = null;
    this._searchPinTimer = null;
    this._tileErrorAvisado = {};
  }

  init() {
    // 1. Renderer Canvas único: se pasa al mapa para que TODA geometría lo use por defecto
    this.canvasRenderer = L.canvas({ padding: 0.25, tolerance: 5 });

    this.map = L.map(this.containerId, {
      center: HOSPITAL_HUARMEY, // Nuevo Hospital Huarmey II-1 (Miramar / detrás de Hotel La Siesta)
      zoom: 15,
      maxZoom: 20,
      zoomControl: false,
      preferCanvas: true,
      renderer: this.canvasRenderer,
      wheelDebounceTime: 40,
      zoomSnap: 1,
      zoomDelta: 1
    });

    // Paneles DOM: pacientes por encima de los establecimientos (markerPane 600), foco y selección encima,
    // todos por debajo de los tooltips (650) y popups (700)
    this.map.createPane('panePacientes').style.zIndex = 615;
    this.map.createPane('paneFoco').style.zIndex = 640;

    // Delegación de eventos para los botones de los popups de pacientes
    const mapContainer = this.map.getContainer();
    mapContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-patient-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-patient-action');
      const pid = btn.getAttribute('data-patient-id');
      if (!pid || !window.app) return;
      if (action === 'detail' && window.app.openPatientDetail) window.app.openPatientDetail(pid);
      else if (action === 'whatsapp' && window.app.sendWhatsAppDirect) window.app.sendWhatsAppDirect(pid);
      else if (action === 'ubicar' && window.app.iniciarFijarUbicacion) window.app.iniciarFijarUbicacion(pid);
    });

    // 2. Mapas base (nombres que dicen el proveedor real)
    const tilePerfOpts = { maxZoom: 20, updateWhenZooming: false, updateWhenIdle: false, keepBuffer: 4 };
    this.baseLayers = {
      'OpenStreetMap': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        ...tilePerfOpts, maxNativeZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
      }),
      // Google (sin clave de API: solo para pruebas hasta contratar la Map Tiles API)
      'Google Calles y Vías': L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&hl=es&x={x}&y={y}&z={z}', {
        ...tilePerfOpts, subdomains: ['0', '1', '2', '3'], maxNativeZoom: 20, attribution: 'Map data &copy; Google'
      }),
      'Esri World Street Map': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        ...tilePerfOpts, maxNativeZoom: 17, attribution: 'Tiles &copy; Esri, HERE, Garmin, USGS'
      }),
      'Google Satélite Híbrido': L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&hl=es&x={x}&y={y}&z={z}', {
        ...tilePerfOpts, subdomains: ['0', '1', '2', '3'], maxNativeZoom: 20, attribution: 'Imagery &copy; Google, Maxar Technologies'
      }),
      'Esri Satélite (World Imagery)': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        ...tilePerfOpts, maxNativeZoom: 18, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics'
      }),
      'Gris Claro (CARTO)': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        ...tilePerfOpts, subdomains: 'abcd', maxNativeZoom: 19, attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
      }),
      'Modo Noche (CARTO)': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        ...tilePerfOpts, subdomains: 'abcd', maxNativeZoom: 19, attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
      }),
      'Google Relieve': L.tileLayer('https://mt{s}.google.com/vt/lyrs=p&hl=es&x={x}&y={y}&z={z}', {
        ...tilePerfOpts, subdomains: ['0', '1', '2', '3'], maxNativeZoom: 19, attribution: 'Terrain &copy; Google'
      }),
      'OSM Humanitario (HOT)': L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
        ...tilePerfOpts, subdomains: 'abc', maxNativeZoom: 19, attribution: '&copy; OpenStreetMap contributors, Humanitarian OpenStreetMap Team'
      })
    };
    Object.entries(this.baseLayers).forEach(([nombre, capa]) => {
      capa.on('tileerror', () => this._avisarErrorMosaicos(nombre));
    });

    this.currentBaseName = BASEMAP_POR_DEFECTO;
    this.currentBaseLayer = this.baseLayers[BASEMAP_POR_DEFECTO];
    this.currentBaseLayer.addTo(this.map);

    // 3. Grupos de capas (orden de apilamiento fijo en _reordenarVectores)
    this.layers.limiteRis = L.geoJSON(null).addTo(this.map);
    this.layers.zonasSanitarias = L.featureGroup().addTo(this.map);
    this.layers.sectoresSanitarios = L.featureGroup().addTo(this.map);
    this.layers.catastroUrbano = L.featureGroup().addTo(this.map);
    this.layers.referenciasLines = L.featureGroup().addTo(this.map);
    this.layers.activeHighlight = L.featureGroup().addTo(this.map);
    this.layers.puertaEntrada = L.featureGroup().addTo(this.map);
    this.layers.zonaSanitaria = L.featureGroup().addTo(this.map);
    this.layers.areaSanitaria = L.featureGroup().addTo(this.map);
    this.layers.pacientes = L.featureGroup().addTo(this.map);
    this.layers.focoPaciente = L.featureGroup().addTo(this.map);

    this.renderAllOfficialLayers();

    // 4. Nivel de detalle (LOD) por zoom
    this.map.on('zoomend', () => this.applyLodRules());

    // 5. Coordenadas bajo el cursor
    this.map.on('mousemove', (e) => {
      if (this.rafCoordsId) cancelAnimationFrame(this.rafCoordsId);
      this.rafCoordsId = requestAnimationFrame(() => {
        const coordEl = document.getElementById('coords-display');
        if (coordEl) {
          coordEl.textContent = `Lat ${e.latlng.lat.toFixed(6)}, Lng ${e.latlng.lng.toFixed(6)} | Zoom: ${this.map.getZoom()}`;
        }
      });
    });

    // 6. Clic del mapa: selección de ubicación o medición (los popups de polígonos se suspenden mientras tanto)
    this.map.on('click', (e) => {
      if (this.seleccion) this._moverSeleccion(e.latlng, 'mapa');
      else if (this.measuring) this.addMeasurePoint(e.latlng);
    });

    // 7. Los popups no deben quedar bajo los paneles laterales
    this.map.on('popupopen', (e) => {
      if (this.capturaClics()) { this.map.closePopup(e.popup); return; }
      const pad = this._paddingPaneles();
      e.popup.options.autoPanPaddingTopLeft = [pad.left, pad.top];
      e.popup.options.autoPanPaddingBottomRight = [pad.right, pad.bottom];
      if (typeof e.popup._adjustPan === 'function') e.popup._adjustPan();
    });

    this.applyLodRules();

    window.addEventListener('resize', () => { if (this.map) this.map.invalidateSize(); });
    setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 150);
    setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 500);
  }

  /** true mientras el clic del mapa se usa para medir o para fijar una ubicación (no abre popups de polígonos). */
  capturaClics() {
    return !!(this.measuring || this.seleccion);
  }

  /**
   * bindPopup que respeta capturaClics(): durante la medición o la selección de ubicación el clic sobre un
   * polígono llega al mapa en lugar de abrir su popup (Leaflet lo detiene en _openPopup).
   */
  _bindPopupGuarded(layer, html) {
    layer.bindPopup(html, GEORIS_POPUP_CONFIG);
    if (typeof layer._openPopup === 'function') {
      layer.off('click', layer._openPopup, layer);
      layer.on('click', (e) => {
        if (this.capturaClics()) return;
        layer._openPopup(e);
      });
    }
    return layer;
  }

  _avisarErrorMosaicos(nombre) {
    if (this._tileErrorAvisado[nombre] || nombre !== this.currentBaseName) return;
    this._tileErrorAvisado[nombre] = true;
    if (window.app && window.app.showToast) {
      window.app.showToast(`No se pudieron cargar los mosaicos de «${nombre}» (sin conexión o servicio no disponible). Las capas GeoRIS, el catastro y los pacientes siguen visibles.`, 'warning', 6000);
    }
  }

  /** Espacio que ocupan los paneles laterales abiertos sobre el mapa (para el autoPan de los popups). */
  _paddingPaneles() {
    const pad = { left: 20, top: 70, right: 20, bottom: 20 };
    const cont = this.map ? this.map.getContainer().getBoundingClientRect() : null;
    if (!cont) return pad;
    const solape = (id, lado) => {
      const el = document.getElementById(id);
      if (!el || el.classList.contains('collapsed') || el.offsetParent === null) return;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      if (lado === 'left' && r.right > cont.left && r.left <= cont.left + 5) pad.left = Math.max(pad.left, r.right - cont.left + 20);
      if (lado === 'right' && r.left < cont.right && r.right >= cont.right - 5) pad.right = Math.max(pad.right, cont.right - r.left + 20);
    };
    solape('left-sidebar', 'left');
    solape('hearts-panel', 'right');
    return pad;
  }

  /**
   * Orden fijo de apilamiento dentro del canvas único (de abajo hacia arriba). Se llama tras cada redibujo,
   * cambio de mapa base, LOD o casilla de capa: así el clic siempre llega a la capa más específica.
   */
  _reordenarVectores() {
    const orden = [
      this.layers.limiteRis,
      this.layers.zonasSanitarias,
      this.layers.sectoresSanitarios,
      this.cadastreBuildingsLayer,
      this.cadastreStreetsLayer,
      this.layers.areaSanitaria,
      this.layers.referenciasLines,
      this.layers.activeHighlight,
      this.layers.pacientes,
      this.layers.focoPaciente,
      this.measurePolyline
    ];
    for (const g of orden) {
      if (g && this.map && this.map.hasLayer(g) && typeof g.bringToFront === 'function') {
        try { g.bringToFront(); } catch (e) { /* capa sin geometrías vectoriales */ }
      }
    }
  }

  /** Enciende o apaga una capa desde las casillas del panel, conservando el orden de apilamiento. */
  toggleCapa(nombre, visible) {
    const capa = this.layers[nombre];
    if (!capa || !this.map) return;
    if (visible) {
      if (!this.map.hasLayer(capa)) capa.addTo(this.map);
    } else if (this.map.hasLayer(capa)) {
      this.map.removeLayer(capa);
    }
    this._reordenarVectores();
  }

  /**
   * Carga y dibuja las capas vectoriales oficiales de Áncash
   */
  renderAllOfficialLayers() {
    if (!window.GeorisTerritory || !window.GeorisTerritory.isReady()) {
      console.warn('GeorisTerritory no disponible aún, esperando carga de datos...');
      return;
    }
    this.renderRisLayer(this.currentRisId);
    this.renderZonasLayer(this.currentRisId, this.currentZonaId);
    this.renderSectoresLayer(this.currentZonaId, this.currentRisId);
    this.renderHospitalesAreaLayer();
    this.renderEessZonaLayer();
    this.renderPuertasEntradaLayer();
    this.renderLineasDeReferencia();
    this.initCatastroUrbanoLayers();
    this._reordenarVectores();
  }

  /** Estilo de un polígono RIS según la selección y el zoom (el LOD no borra el resaltado). */
  _estiloRis(idRis) {
    const cfg = GEORIS_RIS_CONFIG[idRis] || {};
    const sel = this.currentRisId;
    const todas = !sel || sel === 'ALL';
    const esta = !todas && String(sel) === String(idRis);
    const visible = todas || esta;
    const zoomAlto = this.map && this.map.getZoom() >= 15;
    return {
      color: cfg.color || '#0284c7',
      weight: esta ? 3.5 : (visible ? 2 : 1),
      opacity: visible ? 0.85 : 0.25,
      fillColor: cfg.color || '#0284c7',
      fillOpacity: esta ? (zoomAlto ? 0.02 : 0.05) : (visible ? (zoomAlto ? 0.01 : 0.03) : 0.005)
    };
  }

  /**
   * Renderiza los polígonos oficiales de las 7 RIS de Áncash
   */
  renderRisLayer(highlightIdRis = null) {
    this.layers.limiteRis.clearLayers();
    if (!window.GeorisTerritory?.bundle?.ris) return;

    this.layers.limiteRis.addData(window.GeorisTerritory.bundle.ris);
    this.layers.limiteRis.eachLayer(layer => {
      const p = layer.feature.properties;
      const cfg = GEORIS_RIS_CONFIG[p.id_ris] || {};
      layer.setStyle(this._estiloRis(p.id_ris));
      const color = escapeHtml(cfg.color || '#0284c7');
      const popupHtml = `
        <div class="georis-popup">
          <div class="georis-popup-header" style="background:${color};">
            <span>RED INTEGRADA DE SALUD: ${escapeHtml(p.ris)}</span>
          </div>
          <div class="georis-popup-body">
            <div class="georis-popup-row"><span class="georis-popup-label">Código RIS:</span><span class="georis-popup-val">N° ${escapeHtml(p.id_ris)}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Departamento:</span><span class="georis-popup-val">${escapeHtml(p.departamen)}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Población Total:</span><span class="georis-popup-val" style="font-weight:800; color:#0284c7;">${(p.pob_t || 0).toLocaleString()} hab.</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Viviendas / Familias:</span><span class="georis-popup-val">${(p.n_viv || 0).toLocaleString()} viv. / ${(p.n_fam || 0).toLocaleString()} fam.</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Zonas Sanitarias:</span><span class="georis-popup-val">${escapeHtml(p.n_zona)} Zonas</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Sectores Sanitarios:</span><span class="georis-popup-val">${escapeHtml(p.n_sec)} Sectores</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Hospitales de Área:</span><span class="georis-popup-val" style="font-size:var(--font-xs); color:#b91c1c;">${escapeHtml(p.hospital)}</span></div>
          </div>
          <div class="georis-popup-footer">
            <button onclick="window.app.selectRis('${escapeHtml(p.id_ris)}')" class="btn-mini btn-precita">Delimitar Zonas de ${escapeHtml(p.ris)}</button>
          </div>
        </div>
      `;
      this._bindPopupGuarded(layer, popupHtml);
    });
  }

  /**
   * Renderiza los polígonos oficiales de las Zonas Sanitarias (Microrredes)
   */
  renderZonasLayer(idRis = 156, highlightIdZona = 'ALL') {
    this.layers.zonasSanitarias.clearLayers();
    if (!window.GeorisTerritory?.bundle?.zonas) return;

    const allZonas = window.GeorisTerritory.bundle.zonas.features;
    const filteredZonas = (idRis && idRis !== 'ALL')
      ? allZonas.filter(f => f.properties.id_ris === parseInt(idRis, 10))
      : allZonas;

    filteredZonas.forEach(feature => {
      const p = feature.properties;
      const esta = highlightIdZona !== 'ALL' && String(highlightIdZona) === String(p.id_zona);
      const isSelected = highlightIdZona === 'ALL' || esta;

      const layer = L.geoJSON(feature, {
        style: {
          color: isSelected ? '#ea580c' : '#94a3b8',
          weight: esta ? 3 : (isSelected ? 1.8 : 1),
          dashArray: '5, 5',
          fillColor: isSelected ? '#ea580c' : '#cbd5e1',
          fillOpacity: esta ? 0.08 : (isSelected ? 0.03 : 0.005)
        }
      });

      // Datos reales del bundle: la cabecera es la IPRESS de la zona y las puertas se cuentan en eessPuertas
      const nPuertas = window.GeorisTerritory.getPuertasEntrada(p.id_ris, p.id_zona).length;
      const nVinc = window.GeorisTerritory.getVinculados ? window.GeorisTerritory.getVinculados(p.id_ris, p.id_zona).length : 0;
      const popupHtml = `
        <div class="georis-popup">
          <div class="georis-popup-header" style="background:#ea580c;">
            <span>ZONA SANITARIA ${escapeHtml(p.id_zona)}: ${escapeHtml(p.ipress || p.distrito)}</span>
          </div>
          <div class="georis-popup-body">
            <div class="georis-popup-row"><span class="georis-popup-label">Código Zona:</span><span class="georis-popup-val">Zona ${escapeHtml(p.id_zona)}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">RIS Asignada:</span><span class="georis-popup-val">${escapeHtml(p.ris)} (N° ${escapeHtml(p.id_ris)})</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Población Asignada:</span><span class="georis-popup-val" style="font-weight:700; color:#ea580c;">${(p.pob_t || 0).toLocaleString()} hab.</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Cabecera de Zona:</span><span class="georis-popup-val" style="font-weight:600;">${escapeHtml(p.ipress || '—')} (${escapeHtml(p.categoria || '—')})</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Distritos:</span><span class="georis-popup-val">${escapeHtml(p.distrito || '—')}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Puertas de Entrada:</span><span class="georis-popup-val">${nPuertas} E.S.${nVinc ? ` + ${nVinc} vinculados` : ''}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Sectores:</span><span class="georis-popup-val">${escapeHtml(p.n_sec || 0)}</span></div>
          </div>
          <div class="georis-popup-footer">
            <button onclick="window.app.selectZona('${escapeHtml(p.id_ris)}|${escapeHtml(p.id_zona)}')" class="btn-mini btn-precita">Filtrar Sectores y Postas</button>
          </div>
        </div>
      `;
      this._bindPopupGuarded(layer, popupHtml);
      this.layers.zonasSanitarias.addLayer(layer);
    });
  }

  /**
   * Renderiza los sectores sanitarios. El bundle solo trae sectores de la RIS Pacífico Sur (156).
   * Se filtra por RIS y zona: el número de zona se repite entre RIS (la zona 1 existe en las 7).
   */
  renderSectoresLayer(idZona = 'ALL', idRis = this.currentRisId) {
    this.layers.sectoresSanitarios.clearLayers();
    if (!window.GeorisTerritory?.bundle?.sectores) return;

    let filtered = window.GeorisTerritory.bundle.sectores.features;
    if (idRis && idRis !== 'ALL') filtered = filtered.filter(f => f.properties.id_ris === parseInt(idRis, 10));
    if (idZona && idZona !== 'ALL') filtered = filtered.filter(f => f.properties.id_zona === parseInt(idZona, 10));

    filtered.forEach(feature => {
      const p = feature.properties;
      const layer = L.geoJSON(feature, {
        style: { color: '#059669', weight: 1.2, dashArray: '3, 3', fillColor: '#10b981', fillOpacity: 0.05 }
      });

      const popupHtml = `
        <div class="georis-popup">
          <div class="georis-popup-header" style="background:#059669;">
            <span>SECTOR SANITARIO N° ${escapeHtml(p.id_sector)} (${escapeHtml(p.distrito || 'HUARMEY')})</span>
          </div>
          <div class="georis-popup-body">
            <div class="georis-popup-row"><span class="georis-popup-label">Código Sector:</span><span class="georis-popup-val">Sector ${escapeHtml(p.id_sector)}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Distrito / Provincia:</span><span class="georis-popup-val">${escapeHtml(p.distrito || '—')} (${escapeHtml(p.provincia || '—')})</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">IPRESS Asignada:</span><span class="georis-popup-val" style="color:#0369a1; font-weight:700;">${escapeHtml(p.ipress || '—')}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Zona Sanitaria:</span><span class="georis-popup-val">Zona ${escapeHtml(p.id_zona)} · RIS ${escapeHtml(p.id_ris)}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Población Sector:</span><span class="georis-popup-val" style="font-weight:700;">${(p.pob_t || 0).toLocaleString()} hab.</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Viviendas / Familias:</span><span class="georis-popup-val">${(p.n_viv || 0).toLocaleString()} viv. / ${(p.n_fam || 0).toLocaleString()} fam.</span></div>
          </div>
        </div>
      `;
      this._bindPopupGuarded(layer, popupHtml);
      this.layers.sectoresSanitarios.addLayer(layer);
    });
  }

  /**
   * Catastro urbano de Huarmey en el canvas único (lotes y vías se crean una sola vez)
   */
  initCatastroUrbanoLayers() {
    if (this.cadastreLoaded || !window.HUARMEY_CADASTRE || !window.HUARMEY_CADASTRE.features) return;

    const buildings = [];
    const streets = [];
    window.HUARMEY_CADASTRE.features.forEach(f => {
      if (f.properties.type === 'building') buildings.push(f);
      else if (f.properties.type === 'highway') streets.push(f);
    });

    this.cadastreBuildingsLayer = L.geoJSON({ type: 'FeatureCollection', features: buildings }, {
      style: { color: '#475569', weight: 0.8, fillColor: '#94a3b8', fillOpacity: 0.10 },
      onEachFeature: (feature, layer) => {
        // Un lote sin nombre no responde al ratón: así el clic llega al sector sanitario que está debajo
        if (!feature.properties.name) layer.options.interactive = false;
        if (feature.properties.name) {
          layer.bindTooltip(`<b>${escapeHtml(feature.properties.name)}</b>`, { direction: 'top', className: 'georis-tooltip' });
        }
      }
    });

    this.cadastreStreetsLayer = L.geoJSON({ type: 'FeatureCollection', features: streets }, {
      style: { color: '#334155', weight: 1.5, opacity: 0.70 },
      onEachFeature: (feature, layer) => {
        if (!feature.properties.name) layer.options.interactive = false;
        if (feature.properties.name) {
          layer.bindTooltip(escapeHtml(feature.properties.name), { direction: 'center', className: 'georis-tooltip' });
        }
      }
    });

    this.cadastreLoaded = true;
    this._aplicarEstiloCatastro();
    this.applyLodRules();
  }

  /**
   * Reglas de Nivel de Detalle (LOD) por zoom
   */
  applyLodRules() {
    if (!this.map) return;
    const zoom = this.map.getZoom();

    if (this.cadastreLoaded) {
      const lod = (sub, minZoom) => {
        if (!sub) return;
        const dentro = this.layers.catastroUrbano.hasLayer(sub);
        if (zoom >= minZoom && !dentro) this.layers.catastroUrbano.addLayer(sub);
        else if (zoom < minZoom && dentro) this.layers.catastroUrbano.removeLayer(sub);
      };
      lod(this.cadastreBuildingsLayer, 14); // 6,384 lotes solo desde zoom 14
      lod(this.cadastreStreetsLayer, 13);   // vías desde zoom 13
    }

    // Relleno de las RIS según zoom, sin perder el resaltado de la RIS elegida
    if (this.layers.limiteRis) {
      this.layers.limiteRis.eachLayer(l => {
        if (l.setStyle && l.feature) l.setStyle(this._estiloRis(l.feature.properties.id_ris));
      });
    }
    this._reordenarVectores();
  }

  /**
   * Hospitales de referencia de área sanitaria (II-1, II-2) de la RIS elegida
   */
  renderHospitalesAreaLayer() {
    this.layers.areaSanitaria.clearLayers();
    const hospitales = window.GeorisTerritory.getHospitalesArea(this.currentRisId);
    this._codigosHospital = new Set(hospitales.map(h => String(h.cod_renipress)));
    const cabeceras = new Set(((window.GeorisTerritory.bundle && window.GeorisTerritory.bundle.eessZona && window.GeorisTerritory.bundle.eessZona.features) || []).map(f => String(f.properties.cod_reni)));
    const esCabecera = cod => cabeceras.has(String(cod));

    hospitales.forEach(hosp => {
      const isHuarmey = hosp.cod_renipress === '00001741';
      const hospIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `
          <div class="pin-hospital-container">
            <div class="pin-hospital-badge ${isHuarmey ? 'is-huarmey' : ''}">
              <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z"/></svg>
            </div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
      });

      const marker = L.marker([hosp.lat, hosp.lng], { icon: hospIcon, zIndexOffset: isHuarmey ? 4000 : 2500 });
      marker.bindTooltip(`
        <div style="font-weight:700; font-size:var(--font-sm); color:#ffffff; display:flex; align-items:center; gap:6px;">${window.AppIcons ? window.AppIcons.hospital(14, '#ffffff') : ''} ${escapeHtml(hosp.nombre)}</div>
        <div style="font-size:var(--font-xs); color:#fca5a5;">Categoría ${escapeHtml(hosp.categoria)} • ${escapeHtml(hosp.ris)}</div>
        <div style="font-size:var(--font-xs); color:#e2e8f0;">Hospital de Referencia (Techo Resolutivo)</div>
      `, { direction: 'top', offset: [0, -18], className: 'georis-tooltip', opacity: 0.98 });

      if (isHuarmey && window.GeorisTerritory) {
        const netHuarmey = window.GeorisTerritory.getHuarmeyNetwork();
        if (netHuarmey && netHuarmey.hospital && netHuarmey.hospital.polygonCoords) {
          const terrenoPolygon = L.polygon(netHuarmey.hospital.polygonCoords, {
            color: '#DC2626', weight: 2, fillColor: '#FEF2F2', fillOpacity: 0.25, dashArray: '4, 4'
          });
          terrenoPolygon.bindTooltip('<b>Complejo Hospitalario Huarmey II-1</b><br>Contorno referencial · área oficial 11,325.98 m² | PRONIS - Antamina OxI', {
            permanent: false, direction: 'center', className: 'georis-tooltip'
          });
          this.layers.areaSanitaria.addLayer(terrenoPolygon);
        }
      }

      const popupHtml = `
        <div class="georis-popup">
          <div class="georis-popup-header" style="background:#0F234D; color:#FFFFFF; border-bottom:2px solid #DC2626; display:flex; align-items:center; gap:8px;">
            <span>${window.AppIcons ? window.AppIcons.hospital(15, '#ffffff') : ''} ${escapeHtml(hosp.nombre)}</span>
          </div>
          <div class="georis-popup-body">
            <div class="georis-popup-row"><span class="georis-popup-label">Categoría:</span><span class="georis-popup-val" style="font-weight:700; color:#dc2626;">${escapeHtml(hosp.categoria)}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Rol GeoRIS:</span><span class="georis-popup-val">Hospital de Referencia de Área Sanitaria${esCabecera(hosp.cod_renipress) ? ' y Cabecera de Zona Sanitaria' : ''}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Cód. RENIPRESS:</span><span class="georis-popup-val">${escapeHtml(hosp.cod_renipress)}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Red RIS:</span><span class="georis-popup-val">${escapeHtml(hosp.ris)}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Coordenadas:</span><span class="georis-popup-val">${hosp.lat.toFixed(6)}, ${hosp.lng.toFixed(6)}</span></div>
            ${isHuarmey ? `
              <div class="georis-popup-row"><span class="georis-popup-label">Ubicación Actual:</span><span class="georis-popup-val" style="color:#0369a1; font-weight:700;">AA.HH. Miramar / Santo Domingo Ampliación (detrás de Hotel La Siesta)</span></div>
              <div class="georis-popup-row"><span class="georis-popup-label">Terreno Oficial:</span><span class="georis-popup-val">11,325.98 m² (Inversión S/. 188M OxI)</span></div>
              <div class="georis-popup-row"><span class="georis-popup-label">Capacidad Resolutiva:</span><span class="georis-popup-val" style="color:#15803d; font-weight:700;">Medicina Interna, Cardiología, Emergencia 24h, Laboratorio II, Telemonitoreo HEARTS</span></div>
              <div class="georis-popup-row"><span class="georis-popup-label">Red Tributaria:</span><span class="georis-popup-val">12 IPRESS en la Provincia de Huarmey</span></div>
            ` : ''}
          </div>
          <div class="georis-popup-footer">
            <button onclick="window.app.seleccionarHospitalReferencia('${escapeHtml(hosp.cod_renipress)}')" class="btn-mini btn-precita">${isHuarmey ? 'Ver Red de Referencias Tributarias' : 'Centrar en el Hospital'}</button>
          </div>
        </div>
      `;
      marker.bindPopup(popupHtml, GEORIS_POPUP_CONFIG);
      this.layers.areaSanitaria.addLayer(marker);
    });
  }

  /**
   * Cabeceras de zona sanitaria (I-3, I-4) de la RIS y zona elegidas
   */
  renderEessZonaLayer() {
    this.layers.zonaSanitaria.clearLayers();
    let eessZona = window.GeorisTerritory.getEessZona(this.currentRisId);
    if (this.currentZonaId && this.currentZonaId !== 'ALL') {
      eessZona = eessZona.filter(e => String(e.id_zona) === String(this.currentZonaId));
    }
    // Las 44 cabeceras también figuran como puertas de entrada en GeoRIS: se dibujan una sola vez, como cabecera
    eessZona = eessZona.filter(e => !(this._codigosHospital && this._codigosHospital.has(String(e.cod_renipress))));
    this._codigosCabecera = new Set(eessZona.map(e => String(e.cod_renipress)));
    const codigosPuerta = new Set(((window.GeorisTerritory.bundle && window.GeorisTerritory.bundle.eessPuertas && window.GeorisTerritory.bundle.eessPuertas.features) || []).map(f => String(f.properties.cod_reni)));

    eessZona.forEach(es => {
      const zonaIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `
          <div class="pin-zona-badge">
            <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
      });

      const marker = L.marker([es.lat, es.lng], { icon: zonaIcon, zIndexOffset: 2000 });
      marker.bindTooltip(`
        <div style="font-weight:700; font-size:var(--font-sm); color:#ffffff; display:flex; align-items:center; gap:6px;">${window.AppIcons ? window.AppIcons.city(14, '#ffffff') : ''} ${escapeHtml(es.nombre)}</div>
        <div style="font-size:var(--font-xs); color:#fde68a;">Categoría ${escapeHtml(es.categoria)} • Zona ${escapeHtml(es.id_zona)} (${escapeHtml(es.ris)})</div>
        <div style="font-size:var(--font-xs); color:#e2e8f0;">Cabecera de Zona Sanitaria</div>
      `, { direction: 'top', offset: [0, -14], className: 'georis-tooltip', opacity: 0.98 });

      const hosp = window.GeorisTerritory.getHospitalByCode ? window.GeorisTerritory.getHospitalByCode(es.cod_hos) : null;
      const popupHtml = `
        <div class="georis-popup">
          <div class="georis-popup-header" style="background:#0F234D; color:#FFFFFF; border-bottom:2px solid #D97706; display:flex; align-items:center; gap:8px;">
            <span>${window.AppIcons ? window.AppIcons.city(15, '#ffffff') : ''} ${escapeHtml(es.nombre)}</span>
          </div>
          <div class="georis-popup-body">
            <div class="georis-popup-row"><span class="georis-popup-label">Categoría:</span><span class="georis-popup-val" style="font-weight:700; color:#b45309;">${escapeHtml(es.categoria)}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Rol GeoRIS:</span><span class="georis-popup-val">Establecimiento de Referencia de Zona Sanitaria${codigosPuerta.has(String(es.cod_renipress)) ? ' y Puerta de Entrada' : ''}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Cód. RENIPRESS:</span><span class="georis-popup-val">${escapeHtml(es.cod_renipress)}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Zona Sanitaria:</span><span class="georis-popup-val">Zona ${escapeHtml(es.id_zona)} (${escapeHtml(es.ris)})</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Hospital de Referencia:</span><span class="georis-popup-val">${escapeHtml(hosp ? hosp.nombre : 'No indicado en GeoRIS')}</span></div>
          </div>
          <div class="georis-popup-footer">
            ${hosp ? `<button onclick="window.app.trazarReferenciaHaciaHospital('${escapeHtml(es.cod_renipress)}')" class="btn-mini btn-precita">Medir Referencia al Hospital</button>` : ''}
          </div>
        </div>
      `;
      marker.bindPopup(popupHtml, GEORIS_POPUP_CONFIG);
      this.layers.zonaSanitaria.addLayer(marker);
    });
  }

  /** ¿La selección territorial actual incluye la Zona Sanitaria Huarmey (RIS 156, zona 6)? */
  _incluyeHuarmey() {
    const ris = this.currentRisId, zona = this.currentZonaId;
    return (ris === 'ALL' || String(ris) === '156') && (zona === 'ALL' || String(zona) === '6');
  }

  /**
   * Puertas de entrada y establecimientos vinculados de la selección. La red de Huarmey usa el catálogo único
   * (con distancias al hospital); el resto sale del bundle GeoRIS con su propio hospital de referencia (cod_hos).
   */
  renderPuertasEntradaLayer() {
    this.layers.puertaEntrada.clearLayers();
    const lista = [];
    if (this._incluyeHuarmey()) {
      window.GeorisTerritory.getHuarmeyNetwork().puertas.forEach(pe => lista.push({ ...pe, red_huarmey: true }));
    }
    const ris = this.currentRisId, zona = this.currentZonaId;
    const otros = [
      ...window.GeorisTerritory.getPuertasEntrada(ris, zona),
      ...(window.GeorisTerritory.getVinculados ? window.GeorisTerritory.getVinculados(ris, zona) : [])
    ].filter(e => !(e.id_ris === 156 && e.id_zona === 6) && (e.id_zona !== undefined));
    // Un establecimiento se dibuja una sola vez: si ya es hospital o cabecera de la selección, no se repite como puerta
    const vistos = new Set([...lista.map(e => e.cod_renipress), ...(this._codigosHospital || []), ...(this._codigosCabecera || [])]);
    otros.forEach(e => {
      if (vistos.has(e.cod_renipress)) return;
      vistos.add(e.cod_renipress);
      const hosp = window.GeorisTerritory.getHospitalByCode ? window.GeorisTerritory.getHospitalByCode(e.cod_hos) : null;
      if (hosp) {
        const distKm = window.haversineDistance(e.lat, e.lng, hosp.lat, hosp.lng);
        const minutos = window.estimateTravelTimeMinutes(distKm);
        lista.push({ ...e, hospital_nombre: hosp.nombre, distancia_hospital_km: distKm, tiempo_traslado_min: minutos, tiempo_traslado_txt: window.formatMinutes(minutos) });
      } else {
        lista.push({ ...e, hospital_nombre: null });
      }
    });

    lista.forEach(pe => {
      const vinculado = pe.rol_georis === 'Establecimiento Vinculado';
      const puertaIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `
          <div class="pin-puerta-badge ${vinculado ? 'is-vinculado' : ''}">
            <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 8h-3v3h-2v-3H8v-2h3V6h2v3h3v2z"/></svg>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
      });

      const marker = L.marker([pe.lat, pe.lng], { icon: puertaIcon, zIndexOffset: 1200 });
      const hospNombre = pe.red_huarmey ? 'Hosp. Huarmey II-1' : (pe.hospital_nombre || 'sin hospital en GeoRIS');
      const rol = vinculado ? `Vinculado a ${pe.vinculado_a_nombre || 'su puerta de entrada'}` : 'Puerta de Entrada';
      const enclaveBadge = pe.is_enclave ? `<div style="font-size:var(--font-xs); color:#fde047; font-weight:700; display:flex; align-items:center; gap:4px;">${window.AppIcons ? window.AppIcons.alertTriangle(12, '#fde047') : ''} Enclave: ${escapeHtml(pe.red_origen)}</div>` : '';
      const distTxt = pe.distancia_hospital_km !== undefined ? `<b>${escapeHtml(pe.distancia_hospital_km)} km</b> en línea recta (~${escapeHtml(pe.tiempo_traslado_txt)})` : 'no disponible';

      marker.bindTooltip(`
        <div style="font-weight:700; font-size:var(--font-sm); color:#ffffff; display:flex; align-items:center; gap:6px;">${window.AppIcons ? window.AppIcons.door(14, '#ffffff') : ''} ${escapeHtml(pe.nombre)}</div>
        <div style="font-size:var(--font-xs); color:#bae6fd;">Categoría ${escapeHtml(pe.categoria)} • ${escapeHtml(rol)} (${escapeHtml(pe.distrito || '—')})</div>
        ${enclaveBadge}
        <div style="font-size:var(--font-xs); color:#e2e8f0;">${escapeHtml(hospNombre)}: ${distTxt}</div>
      `, { direction: 'top', offset: [0, -12], className: 'georis-tooltip', opacity: 0.98 });

      const cumple = pe.tiempo_traslado_min !== undefined ? pe.tiempo_traslado_min <= 240 : null;
      const popupHtml = `
        <div class="georis-popup">
          <div class="georis-popup-header" style="background:#0F234D; color:#FFFFFF; border-bottom:2px solid #0284C7; display:flex; align-items:center; gap:8px;">
            <span>${window.AppIcons ? window.AppIcons.door(15, '#ffffff') : ''} ${escapeHtml(pe.nombre)}</span>
          </div>
          <div class="georis-popup-body">
            <div class="georis-popup-row"><span class="georis-popup-label">Categoría:</span><span class="georis-popup-val" style="font-weight:700;">${escapeHtml(pe.categoria)}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Rol GeoRIS:</span><span class="georis-popup-val">${escapeHtml(vinculado ? 'Establecimiento Vinculado' : 'Establecimiento Puerta de Entrada')}</span></div>
            ${vinculado ? `<div class="georis-popup-row"><span class="georis-popup-label">Vinculado a:</span><span class="georis-popup-val">${escapeHtml(pe.vinculado_a_nombre || '—')}</span></div>` : ''}
            <div class="georis-popup-row"><span class="georis-popup-label">Cód. RENIPRESS:</span><span class="georis-popup-val">${escapeHtml(pe.cod_renipress)}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Ubicación:</span><span class="georis-popup-val">${escapeHtml(pe.distrito || '—')} (${escapeHtml(pe.provincia || '—')})</span></div>
            ${pe.id_zona !== undefined ? `<div class="georis-popup-row"><span class="georis-popup-label">Zona Sanitaria:</span><span class="georis-popup-val">Zona ${escapeHtml(pe.id_zona)} · RIS ${escapeHtml(pe.id_ris || 156)}</span></div>` : ''}
            ${pe.id_zona_declarada ? `<div class="georis-popup-row" style="background:#fef3c7; padding:4px 6px; border-radius:4px;"><span class="georis-popup-label" style="color:#b45309;">Dato GeoRIS:</span><span class="georis-popup-val" style="color:#b45309;">declara la zona ${escapeHtml(pe.id_zona_declarada)}, pero su punto y su puerta de entrada están en la zona ${escapeHtml(pe.id_zona)}</span></div>` : ''}
            ${pe.is_enclave ? `<div class="georis-popup-row" style="background:#fef3c7; padding:4px 6px; border-radius:4px;"><span class="georis-popup-label" style="color:#b45309;">Enclave:</span><span class="georis-popup-val" style="color:#b45309; font-weight:700;">${escapeHtml(pe.red_origen)}</span></div>` : ''}
            <div class="georis-popup-row"><span class="georis-popup-label">Hospital de referencia:</span><span class="georis-popup-val">${escapeHtml(pe.red_huarmey ? 'NUEVO HOSPITAL DE APOYO HUARMEY' : (pe.hospital_nombre || 'No indicado en GeoRIS'))}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Distancia al hospital:</span><span class="georis-popup-val" style="color:#dc2626; font-weight:800;">${pe.distancia_hospital_km !== undefined ? escapeHtml(pe.distancia_hospital_km) + ' km (línea recta)' : '—'}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Tiempo Estimado:</span><span class="georis-popup-val" style="color:#0369a1; font-weight:700;">${escapeHtml(pe.tiempo_traslado_txt || '—')}</span></div>
            ${cumple === null ? '' : `<div class="georis-popup-row"><span class="georis-popup-label">Estándar GeoRIS:</span><span class="georis-popup-val" style="color:${cumple ? '#15803d' : '#b91c1c'}; font-weight:700;">${cumple ? '✅ &lt; 4h al hospital' : '⚠️ &gt; 4h al hospital'}</span></div>`}
          </div>
          <div class="georis-popup-footer">
            ${(pe.red_huarmey || pe.hospital_nombre) ? `<button onclick="window.app.trazarReferenciaHaciaHospital('${escapeHtml(pe.cod_renipress)}')" class="btn-mini btn-precita">Trazar Referencia y Medir</button>` : ''}
          </div>
        </div>
      `;
      marker.bindPopup(popupHtml, GEORIS_POPUP_CONFIG);
      this.layers.puertaEntrada.addLayer(marker);
    });
  }

  /**
   * Red de líneas de referencia hacia el Hospital de Huarmey (solo si la selección incluye la zona Huarmey)
   */
  renderLineasDeReferencia() {
    this.layers.referenciasLines.clearLayers();
    if (!this._incluyeHuarmey()) return;
    const network = window.GeorisTerritory.getHuarmeyNetwork();
    const hospCoords = [network.hospital.lat, network.hospital.lng];

    network.puertas.forEach(pe => {
      const line = L.polyline([[pe.lat, pe.lng], hospCoords], {
        color: '#0284c7', weight: 1.8, opacity: 0.65, dashArray: '4, 6'
      });
      line.bindTooltip(`<b>${escapeHtml(pe.nombre)}</b> ➔ Hosp. Huarmey (II-1)<br>Distancia: <b>${escapeHtml(pe.distancia_hospital_km)} km</b> en línea recta | Tiempo: <b>${escapeHtml(pe.tiempo_traslado_txt)}</b>`, {
        permanent: false, direction: 'center', className: 'georis-tooltip'
      });
      this.layers.referenciasLines.addLayer(line);
    });
    this._reordenarVectores();
  }

  /**
   * Traza y destaca la ruta de referencia de un establecimiento hacia su hospital
   */
  resaltarReferencia(pe, hosp) {
    this.layers.activeHighlight.clearLayers();
    const peCoords = [pe.lat, pe.lng];
    const hospCoords = [hosp.lat, hosp.lng];

    this.layers.activeHighlight.addLayer(L.polyline([peCoords, hospCoords], { color: '#dc2626', weight: 4, opacity: 0.9, dashArray: '6, 6', interactive: false }));
    this.layers.activeHighlight.addLayer(L.circleMarker(peCoords, { radius: 13, fillColor: '#0284c7', color: '#ffffff', weight: 3, fillOpacity: 0.9, interactive: false }));
    this.layers.activeHighlight.addLayer(L.circleMarker(hospCoords, { radius: 16, fillColor: '#FB7185', color: '#FFFFFF', weight: 4, fillOpacity: 1, interactive: false }));
    this._reordenarVectores();

    this.map.fitBounds(L.latLngBounds([peCoords, hospCoords]), { padding: [60, 60], maxZoom: 14 });
  }

  /** Borra la ruta de referencia resaltada. */
  limpiarResaltado() {
    if (this.layers.activeHighlight) this.layers.activeHighlight.clearLayers();
  }

  /** Clase y etiqueta del pin según la precisión de la ubicación del paciente. */
  _precisionPin(p) {
    const desc = window.GeoUbicacion ? window.GeoUbicacion.describirPrecision(p) : { clave: 'no_verificada', exacta: false, etiqueta: 'Ubicación no verificada' };
    const clase = desc.exacta ? 'pin-exacta' : 'pin-aprox';
    return { desc, clase };
  }

  /**
   * HTML del popup del paciente (se construye al abrirlo)
   */
  buildPatientPopupHtml(p, color, isPurple) {
    const safeName = escapeHtml(p.apellidos_nombres);
    const safeDni = escapeHtml(p.dni || '—');
    const safeHc = escapeHtml(p.historia_clinica || '—');
    const safeFin = escapeHtml(p.financiador || 'SIS');
    const safeEdad = p.edad != null ? `${escapeHtml(p.edad)} años` : '—';
    const safeSexo = p.sexo === 'M' ? 'Masculino' : (p.sexo === 'F' ? 'Femenino' : '—');
    const safeDir = escapeHtml(p.direccion || '—');
    const safeSec = escapeHtml(p.sector_sanitario || '—');
    const safePuerta = escapeHtml(p.puerta_entrada || '—');
    const safeCtrl = escapeHtml(p.estado_control || '—');
    const safeId = escapeHtml(p.id);

    const paPopTxt = (p.pa_sistolica != null && p.pa_diastolica != null) ? `${escapeHtml(p.pa_sistolica)}/${escapeHtml(p.pa_diastolica)} mmHg` : '—';
    const gluOnlyTxt = (p.glucosa != null && p.glucosa !== '') ? `${escapeHtml(p.glucosa)} mg/dL` : '—';
    const a1cOnlyTxt = escapeHtml(p.hba1c_texto || (p.hba1c != null && p.hba1c !== '' ? `${p.hba1c}%` : '—'));
    const diagBadge = (p.diagnosticos || []).map(d => `<span class="badge-diag badge-${escapeHtml(String(d).toLowerCase())}">${escapeHtml(d)}</span>`).join(' ');
    const noLabPopupAlert = !p.tiene_laboratorio
      ? `<div style="background:${isPurple ? '#f5f3ff' : '#fffbeb'}; border:1px solid ${isPurple ? '#ddd6fe' : '#fde68a'}; color:${isPurple ? '#5b21b6' : '#78350f'}; padding:6px 10px; border-radius:6px; font-size:var(--font-xs); font-weight:700; margin-bottom:8px; display:flex; align-items:center; gap:6px;">${window.AppIcons ? window.AppIcons.alertTriangle(12, isPurple ? '#5b21b6' : '#78350f') : ''} Sin datos de laboratorio — Empadronar en HEARTS</div>`
      : '';

    const rawPhone = p.telefono ? String(p.telefono).replace(/\D/g, '') : '';
    const hasPhone = rawPhone.length >= 9;
    const { desc } = this._precisionPin(p);
    const puedeUbicar = !!(window.app && window.app.permisos && window.app.permisos().escribir);
    const coordTxt = coordsValidas(p) ? `${Number(p.latitud).toFixed(6)}, ${Number(p.longitud).toFixed(6)}` : '—';
    const ubicColor = desc.exacta ? '#15803d' : '#b45309';

    const iconPopFicha = window.AppIcons ? window.AppIcons.clipboardCheck(13, '#1E8E3E') : '';
    const iconPopWp = window.AppIcons ? window.AppIcons.whatsapp(13, '#25D366') : '';
    const iconPopUser = window.AppIcons ? window.AppIcons.users(14, '#ffffff') : '';
    const iconPopLoc = window.AppIcons ? window.AppIcons.location(13, '#1A73E8') : '📍';

    return `
      <div class="georis-popup">
        <div class="georis-popup-header" style="background:#0F234D; color:#FFFFFF; display:flex; align-items:center; gap:8px;">
          <span>${iconPopUser} ${safeName} ${isPurple ? '(HOSIX Brecha)' : ''}</span>
        </div>
        <div class="georis-popup-body">
          ${noLabPopupAlert}
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; background:var(--slate-50); padding:8px 10px; border-radius:6px; border:1px solid var(--border-subtle);">
            <div><span style="display:block; font-size:var(--font-xs); color:var(--text-muted); font-weight:700;">DNI</span><span style="font-size:var(--font-sm); font-weight:700; color:var(--text-main);">${safeDni}</span></div>
            <div><span style="display:block; font-size:var(--font-xs); color:var(--text-muted); font-weight:700;">H. Clínica</span><span style="font-size:var(--font-sm); font-weight:700; color:var(--text-main);">${safeHc}</span></div>
            <div><span style="display:block; font-size:var(--font-xs); color:var(--text-muted); font-weight:700;">Edad / Sexo</span><span style="font-size:var(--font-sm); font-weight:700; color:var(--text-main);">${safeEdad} · ${safeSexo}</span></div>
            <div><span style="display:block; font-size:var(--font-xs); color:var(--text-muted); font-weight:700;">Seguro</span><span style="font-size:var(--font-sm); font-weight:700; color:var(--text-main);">${safeFin}</span></div>
          </div>
          <div class="georis-popup-row"><span class="georis-popup-label">Diagnósticos:</span><span>${diagBadge}</span></div>
          <div class="georis-popup-row"><span class="georis-popup-label">Presión Arterial:</span><span class="georis-popup-val" style="font-weight:700;">${paPopTxt}</span></div>
          <div class="georis-popup-row"><span class="georis-popup-label">Glucosa Basal:</span><span class="georis-popup-val" style="font-weight:700;">${gluOnlyTxt}</span></div>
          <div class="georis-popup-row"><span class="georis-popup-label">Hemoglobina Glic. (HbA1c):</span><span class="georis-popup-val" style="font-weight:700;">${a1cOnlyTxt}</span></div>
          <div class="georis-popup-row"><span class="georis-popup-label">Dirección Domiciliaria:</span><span class="georis-popup-val">${safeDir}</span></div>
          <div class="georis-popup-row"><span class="georis-popup-label">Ubicación:</span><span class="georis-popup-val" style="color:${ubicColor}; font-weight:700;">${escapeHtml(desc.etiqueta)}</span></div>
          <div class="georis-popup-row"><span class="georis-popup-label">Coordenadas:</span><span class="georis-popup-val" style="font-family:monospace;">${coordTxt}</span></div>
          <div class="georis-popup-row"><span class="georis-popup-label">Sector Sanitario:</span><span class="georis-popup-val">${safeSec}</span></div>
          <div class="georis-popup-row"><span class="georis-popup-label">IPRESS Adscrita:</span><span class="georis-popup-val" style="font-weight:700; color:#0369a1;">${safePuerta}</span></div>
          <div class="georis-popup-row"><span class="georis-popup-label">Meta Vía Clínica HEARTS:</span><span class="georis-popup-val" style="color:${color}; font-weight:bold;">${safeCtrl}${p.frecuencia_hearts ? ` (Cada ${escapeHtml(p.frecuencia_hearts)}d)` : ''}</span></div>
        </div>
        <div class="georis-popup-footer">
          <button data-patient-action="detail" data-patient-id="${safeId}" class="btn-mini btn-precita">${iconPopFicha} Ficha HEARTS</button>
          ${puedeUbicar ? `<button data-patient-action="ubicar" data-patient-id="${safeId}" class="btn-mini btn-ubicar" title="Fijar la ubicación exacta del domicilio (GPS o mapa)">${iconPopLoc} ${desc.exacta ? 'Corregir ubicación' : 'Fijar ubicación exacta'}</button>` : ''}
          <button data-patient-action="whatsapp" data-patient-id="${safeId}" class="btn-mini btn-whatsapp" ${hasPhone ? '' : 'disabled title="Sin celular registrado" aria-disabled="true"'}>${iconPopWp} WhatsApp</button>
        </div>
      </div>
    `;
  }

  /** Color del semáforo HEARTS del paciente para su pin. */
  _colorPaciente(p) {
    const isPurple = (p.semaforo === 'purple' || p.fuente === 'HOSIX');
    const isRed = (p.semaforo === 'rojo' || p.semaforo === 'red');
    if (isPurple) return { color: '#7C3AED', clase: 'patient-purple', isPurple, isRed };
    if (p.semaforo === 'amarillo' || p.semaforo === 'yellow') return { color: '#D97706', clase: 'patient-yellow', isPurple, isRed };
    if (isRed) return { color: '#DC2626', clase: 'patient-red', isPurple, isRed };
    if (p.semaforo === 'black' || p.fallecido) return { color: '#475569', clase: 'patient-black', isPurple, isRed };
    if (p.semaforo === 'gray') return { color: '#64748B', clase: 'patient-gray', isPurple, isRed };
    return { color: '#16A34A', clase: 'patient-green', isPurple, isRed };
  }

  /**
   * Dibuja los pacientes en su coordenada real con su semáforo HEARTS.
   * Pines con borde punteado = ubicación aproximada (por dirección); borde continuo con marca = exacta.
   * Pacientes que comparten exactamente el mismo punto se abren en abanico en pantalla (sin mover la coordenada).
   */
  renderPatients(patients) {
    this.layers.pacientes.clearLayers();
    this.patientMarkers = new Map();
    const lista = Array.isArray(patients) ? patients : [];
    const umbral = (window.APP_CONFIG && window.APP_CONFIG.MAP_PERFORMANCE && window.APP_CONFIG.MAP_PERFORMANCE.CANVAS_THRESHOLD) || 1500;
    const useHighDensityCanvas = lista.length > umbral;

    // Agrupar por coordenada idéntica (6 decimales ≈ 0,1 m)
    const grupos = new Map();
    for (const p of lista) {
      if (!coordsValidas(p)) continue;
      const lat = Number(p.latitud), lng = Number(p.longitud);
      const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key).push(p);
    }

    for (const grupo of grupos.values()) {
      const n = grupo.length;
      const radioPx = n > 1 ? Math.min(14 + 3 * n, 46) : 0;
      if (n > 1 && !useHighDensityCanvas) {
        // Punto real compartido: un pequeño centro para que se vea dónde está la coordenada
        const p0 = grupo[0];
        this.layers.pacientes.addLayer(L.marker([Number(p0.latitud), Number(p0.longitud)], {
          pane: 'panePacientes',
          interactive: false,
          keyboard: false,
          icon: L.divIcon({ className: 'custom-map-pin', html: `<div class="pin-grupo-centro" title="${n} pacientes en este punto"><span>${n}</span></div>`, iconSize: [18, 18], iconAnchor: [9, 9] })
        }));
      }

      if (n > 1 && useHighDensityCanvas) {
        // Modo canvas (padrones grandes): un círculo por punto compartido con la lista de sus pacientes
        this._marcadorGrupoCanvas(grupo);
        continue;
      }

      grupo.forEach((p, i) => {
        const lat = Number(p.latitud), lng = Number(p.longitud);
        const { color, clase, isPurple, isRed } = this._colorPaciente(p);
        const { desc, clase: clasePrec } = this._precisionPin(p);
        const ang = n > 1 ? (2 * Math.PI * i / n) - Math.PI / 2 : 0;
        const dx = Math.round(radioPx * Math.cos(ang));
        const dy = Math.round(radioPx * Math.sin(ang));

        let marker;
        if (useHighDensityCanvas) {
          marker = L.circleMarker([lat, lng], {
            radius: isRed || isPurple ? 7 : 6,
            fillColor: color,
            color: '#ffffff',
            weight: 1.5,
            dashArray: desc.exacta ? null : '2, 2',
            fillOpacity: 0.92
          });
        } else {
          const patientIcon = L.divIcon({
            className: 'custom-map-pin',
            html: `
              <div class="pin-patient-container ${clase} ${clasePrec}">
                <div class="pin-patient-avatar" style="background:${color};">
                  <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                </div>
                ${desc.exacta ? '<span class="pin-check" aria-hidden="true">✓</span>' : ''}
              </div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12 - dx, 12 - dy],
            popupAnchor: [dx, dy - 12],
            tooltipAnchor: [dx, dy - 14]
          });
          marker = L.marker([lat, lng], {
            icon: patientIcon,
            pane: 'panePacientes',
            zIndexOffset: isPurple ? 300 : (isRed ? 200 : 100),
            title: p.apellidos_nombres ? String(p.apellidos_nombres) : '',
            alt: `Paciente ${p.apellidos_nombres || ''}`
          });
        }

        const paPopTxt = (p.pa_sistolica != null && p.pa_diastolica != null) ? `${escapeHtml(p.pa_sistolica)}/${escapeHtml(p.pa_diastolica)} mmHg` : '—';
        const gluOnlyTxt = (p.glucosa != null && p.glucosa !== '') ? `${escapeHtml(p.glucosa)} mg/dL` : '—';
        const a1cOnlyTxt = escapeHtml(p.hba1c_texto || (p.hba1c != null && p.hba1c !== '' ? `${p.hba1c}%` : '—'));
        const diagTxt = (p.diagnosticos || []).map(d => escapeHtml(d)).join(', ');

        marker.bindTooltip(`
          <div style="font-weight:700; font-size:var(--font-sm); color:#ffffff;">${escapeHtml(p.apellidos_nombres)}</div>
          <div style="font-size:var(--font-xs); color:#cbd5e1;">DNI: <b>${escapeHtml(p.dni || '—')}</b> • HC: <b>${escapeHtml(p.historia_clinica || '—')}</b> • Seg: <b>${escapeHtml(p.financiador || 'SIS')}</b></div>
          <div style="font-size:var(--font-xs); color:#e2e8f0; margin-top:2px;">Diag: <b>${diagTxt}</b> | PA: <b>${paPopTxt}</b> | Glu: <b>${gluOnlyTxt}</b> | HbA1c: <b>${a1cOnlyTxt}</b></div>
          <div style="font-size:var(--font-xs); color:#38bdf8;">${escapeHtml(p.puerta_entrada || '')} (${escapeHtml(p.sector_sanitario || '')})</div>
          <div style="font-size:var(--font-xs); color:${desc.exacta ? '#86efac' : '#fcd34d'};">${escapeHtml(desc.etiqueta)}${n > 1 ? ` · ${n} pacientes en este punto` : ''}</div>
        `, { direction: 'top', offset: useHighDensityCanvas ? [0, -8] : [0, 0], className: 'georis-tooltip', opacity: 0.98 });

        marker.bindPopup(() => this.buildPatientPopupHtml(p, color, isPurple), GEORIS_POPUP_CONFIG);
        this.layers.pacientes.addLayer(marker);
        this.patientMarkers.set(String(p.id), marker);
      });
    }
    this._reordenarVectores();
  }

  /** Círculo único (modo canvas) para varios pacientes en la misma coordenada, con su lista en el popup. */
  _marcadorGrupoCanvas(grupo) {
    const p0 = grupo[0];
    const prioridad = p => (this._colorPaciente(p).isRed ? 3 : (this._colorPaciente(p).isPurple ? 2 : (p.semaforo === 'yellow' ? 1 : 0)));
    const peor = grupo.slice().sort((a, b) => prioridad(b) - prioridad(a))[0];
    const { color } = this._colorPaciente(peor);
    const exactas = grupo.filter(p => window.GeoUbicacion && window.GeoUbicacion.ubicacionEsExacta(p)).length;
    const marker = L.circleMarker([Number(p0.latitud), Number(p0.longitud)], {
      radius: Math.min(8 + grupo.length, 16), fillColor: color, color: '#0f172a', weight: 2, fillOpacity: 0.92,
      dashArray: exactas === grupo.length ? null : '2, 2'
    });
    marker.bindTooltip(`<b>${grupo.length} pacientes en este punto</b><br>${escapeHtml(this._precisionPin(p0).desc.etiqueta)}`, { direction: 'top', className: 'georis-tooltip', opacity: 0.98 });
    marker.bindPopup(() => `
      <div class="georis-popup">
        <div class="georis-popup-header" style="background:#0F234D; color:#FFFFFF;"><span>${grupo.length} pacientes en el mismo punto</span></div>
        <div class="georis-popup-body">
          ${grupo.map(p => `<div class="georis-popup-row"><span class="georis-popup-label">${escapeHtml(p.apellidos_nombres)}</span>
            <button data-patient-action="detail" data-patient-id="${escapeHtml(p.id)}" class="btn-mini btn-precita">Ficha</button></div>`).join('')}
        </div>
      </div>`, GEORIS_POPUP_CONFIG);
    this.layers.pacientes.addLayer(marker);
    grupo.forEach(p => this.patientMarkers.set(String(p.id), marker));
  }

  /**
   * Centra el mapa en el paciente, dibuja su radio de incertidumbre y abre su ficha rápida.
   * Devuelve false si el paciente no tiene coordenadas válidas.
   */
  enfocarPaciente(p, opciones = {}) {
    this.layers.focoPaciente.clearLayers();
    if (!coordsValidas(p)) return false;
    const lat = Number(p.latitud), lng = Number(p.longitud);
    const { desc } = this._precisionPin(p);

    if (desc.radio_m && desc.radio_m > 0) {
      this.layers.focoPaciente.addLayer(L.circle([lat, lng], {
        radius: desc.radio_m,
        color: desc.exacta ? '#16a34a' : '#d97706',
        weight: 2,
        dashArray: desc.exacta ? null : '6, 6',
        fillColor: desc.exacta ? '#22c55e' : '#f59e0b',
        fillOpacity: 0.08,
        interactive: false
      }));
    }
    this.layers.focoPaciente.addLayer(L.marker([lat, lng], {
      pane: 'paneFoco',
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className: 'custom-map-pin', html: '<div class="foco-pulso"></div>', iconSize: [44, 44], iconAnchor: [22, 22] })
    }));
    this._reordenarVectores();

    const zoomPorPrecision = { gps: 18, mapa: 18, manual: 18, calle: 17, sector: 16, localidad: 15 };
    const zoom = opciones.zoom || zoomPorPrecision[desc.clave] || 17;
    this._cancelarAperturaFoco();
    const abrir = () => {
      this._abrirFoco = null;
      if (this.capturaClics()) return; // no abrir (ni mover el mapa con el autoPan) durante una selección o medición
      const m = this.patientMarkers.get(String(p.id));
      if (opciones.abrirPopup !== false && m && this.layers.pacientes.hasLayer(m) && this.map.hasLayer(this.layers.pacientes)) m.openPopup();
    };
    this._abrirFoco = abrir;
    this.map.once('moveend', abrir);
    if (opciones.animar === false) this._centrarSinAnimacion([lat, lng], zoom);
    else this.map.flyTo([lat, lng], zoom, { duration: 0.8 });
    return true;
  }

  /**
   * setView sin animación que no se pierde: si hay un zoom animado en curso, Leaflet devolvería la vista a su
   * destino anterior al terminar la transición, así que se espera a que termine.
   */
  _centrarSinAnimacion(latlng, zoom, despues) {
    const centrar = () => {
      this.map.setView(latlng, zoom, { animate: false });
      if (typeof despues === 'function') despues();
    };
    this.map.stop();
    if (this.map._animatingZoom) this.map.once('zoomend', centrar);
    else centrar();
  }

  /** Anula la apertura pendiente del popup del último paciente enfocado. */
  _cancelarAperturaFoco() {
    if (this._abrirFoco) {
      this.map.off('moveend', this._abrirFoco);
      this._abrirFoco = null;
    }
  }

  limpiarFoco() {
    this._cancelarAperturaFoco();
    if (this.layers.focoPaciente) this.layers.focoPaciente.clearLayers();
  }

  // --- Selección de la ubicación exacta del domicilio ---

  /**
   * Abre el modo de selección: marcador arrastrable (o tocar el mapa), sector GeoRIS en vivo y confirmación.
   * opts = { lat, lng, zoom, titulo, referencia:{lat,lng,nombre}, precision_geo:'mapa'|'gps'|'manual', precision_m,
   *          onConfirm: async ({lat,lng,precision_geo,precision_m}) => void (lanza Error si no se guardó), onCancel }
   */
  iniciarSeleccionUbicacion(opts = {}) {
    if (this.seleccion && this.seleccion.guardando) {
      if (window.app && window.app.showToast) window.app.showToast('Espere a que termine de guardarse la ubicación anterior.', 'warning');
      return false;
    }
    if (this.seleccion) this.cancelarSeleccionUbicacion(true);
    if (this.measuring) this.toggleMeasurement();
    this.limpiarFoco();
    this.map.closePopup();

    const v = window.GeoUbicacion ? window.GeoUbicacion.validarCoordenadas(opts.lat, opts.lng) : { ok: false };
    const inicio = v.ok ? L.latLng(v.lat, v.lng) : this.map.getCenter();
    const precision = ['gps', 'manual', 'mapa'].includes(opts.precision_geo) ? opts.precision_geo : 'mapa';

    const icono = L.divIcon({
      className: 'custom-map-pin',
      html: '<div class="pin-seleccion" aria-hidden="true"><svg viewBox="0 0 24 24" width="38" height="38"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z" fill="#DC2626" stroke="#ffffff" stroke-width="1.6"/><circle cx="12" cy="9" r="2.6" fill="#ffffff"/></svg></div>',
      iconSize: [38, 38],
      iconAnchor: [19, 37]
    });
    const marker = L.marker(inicio, {
      draggable: true,
      autoPan: true,
      pane: 'paneFoco',
      icon: icono,
      zIndexOffset: 10000,
      keyboard: true,
      title: 'Arrastre para ubicar la puerta del domicilio'
    }).addTo(this.map);

    this.seleccion = {
      marker,
      circulo: null,
      precision_geo: precision,
      precision_m: (precision === 'gps' && Number.isFinite(Number(opts.precision_m))) ? Number(opts.precision_m) : null,
      requiereAjuste: !!opts.requiereAjuste, // GPS impreciso: hay que mover el marcador antes de confirmar
      opts,
      guardando: false
    };
    marker.on('drag', () => this._actualizarBannerSeleccion());
    marker.on('dragend', () => this._moverSeleccion(marker.getLatLng(), 'mapa'));

    this.map.getContainer().classList.add('modo-seleccion-ubicacion');
    this._crearBannerSeleccion();
    this._dibujarCirculoPrecision();
    this._actualizarBannerSeleccion();

    this._teclaSeleccion = (e) => {
      if (!this.seleccion) return;
      if (e.key === 'Escape') { e.preventDefault(); this.cancelarSeleccionUbicacion(); }
    };
    document.addEventListener('keydown', this._teclaSeleccion);

    // El punto queda en el centro de la parte del mapa que no tapa el banner (en el celular el banner es alto)
    this._centrarSinAnimacion(inicio, opts.zoom || 18, () => {
      const desplazamiento = this._desplazamientoBanner();
      if (desplazamiento) this.map.panBy([0, -desplazamiento], { animate: false });
    });
  }

  /** Alto (px) del mapa que tapa el banner de selección, dividido entre dos: cuánto bajar el punto para verlo. */
  _desplazamientoBanner() {
    const banner = document.getElementById('ubicacion-banner');
    if (!banner || !this.map) return 0;
    const m = this.map.getContainer().getBoundingClientRect();
    const b = banner.getBoundingClientRect();
    const tapado = Math.max(0, Math.min(b.bottom, m.bottom) - m.top);
    return tapado > 0 && tapado < m.height * 0.8 ? Math.round(tapado / 2) : 0;
  }

  /** Centro de la parte visible del mapa (descontando el banner de selección). */
  _centroVisible() {
    const tam = this.map.getSize();
    return this.map.containerPointToLatLng([tam.x / 2, tam.y / 2 + this._desplazamientoBanner()]);
  }

  _moverSeleccion(latlng, origen) {
    if (!this.seleccion || this.seleccion.guardando) return;
    this.seleccion.marker.setLatLng(latlng);
    if (origen === 'mapa') {
      // Mover el punto a mano lo convierte en una ubicación marcada en el mapa (ya no es la lectura del GPS)
      this.seleccion.precision_geo = 'mapa';
      this.seleccion.precision_m = null;
      this.seleccion.requiereAjuste = false;
    }
    this._dibujarCirculoPrecision();
    this._actualizarBannerSeleccion();
  }

  _dibujarCirculoPrecision() {
    const s = this.seleccion;
    if (!s) return;
    if (s.circulo) { this.map.removeLayer(s.circulo); s.circulo = null; }
    if (s.precision_geo === 'gps' && s.precision_m) {
      s.circulo = L.circle(s.marker.getLatLng(), {
        radius: s.precision_m, color: '#2563eb', weight: 1.5, fillColor: '#3b82f6', fillOpacity: 0.12, interactive: false
      }).addTo(this.map);
      this._reordenarVectores();
    }
  }

  _crearBannerSeleccion() {
    this._quitarBannerSeleccion();
    const banner = document.createElement('div');
    banner.id = 'ubicacion-banner';
    banner.className = 'ubicacion-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Fijar ubicación exacta del domicilio');
    const titulo = escapeHtml(this.seleccion.opts.titulo || 'Ubicación exacta del domicilio');
    banner.innerHTML = `
      <div class="ubicacion-banner-titulo">📍 ${titulo}</div>
      <div class="ubicacion-banner-ayuda">Arrastre el marcador rojo o toque el mapa justo en la puerta de la vivienda. Use el satélite para ver los techos.</div>
      <div class="ubicacion-banner-datos" id="ubicacion-banner-datos" aria-live="polite"></div>
      <div class="ubicacion-banner-error" id="ubicacion-banner-error" role="alert"></div>
      <div class="ubicacion-banner-acciones">
        <button type="button" class="btn-mini" data-ubic="satelite">🛰️ Satélite</button>
        <button type="button" class="btn-mini" data-ubic="centrar">⌖ Traer al centro</button>
        <button type="button" class="btn-mini" data-ubic="cancelar">Cancelar</button>
        <button type="button" class="btn-mini btn-precita" data-ubic="confirmar">✅ Confirmar ubicación</button>
      </div>
    `;
    banner.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ubic]');
      if (!b) return;
      const accion = b.getAttribute('data-ubic');
      if (accion === 'satelite') {
        const destino = this.currentBaseName === BASEMAP_SATELITE ? BASEMAP_POR_DEFECTO : BASEMAP_SATELITE;
        if (window.app && window.app.setBaseMapGlobal) window.app.setBaseMapGlobal(destino); else this.setBaseMap(destino);
        b.textContent = destino === BASEMAP_SATELITE ? '🗺️ Calles' : '🛰️ Satélite';
      } else if (accion === 'centrar') {
        this._moverSeleccion(this._centroVisible(), 'mapa');
      } else if (accion === 'cancelar') {
        this.cancelarSeleccionUbicacion();
      } else if (accion === 'confirmar') {
        this._confirmarSeleccion();
      }
    });
    L.DomEvent.disableClickPropagation(banner);
    L.DomEvent.disableScrollPropagation(banner);
    this.map.getContainer().appendChild(banner);
    document.body.classList.add('seleccionando-ubicacion');
  }

  _quitarBannerSeleccion() {
    const b = document.getElementById('ubicacion-banner');
    if (b) b.remove();
    document.body.classList.remove('seleccionando-ubicacion');
  }

  _actualizarBannerSeleccion() {
    const s = this.seleccion;
    const el = document.getElementById('ubicacion-banner-datos');
    if (!s || !el) return;
    const ll = s.marker.getLatLng();
    const geo = window.AncashGeocoder || window.ancashGeocoder;
    const t = geo && geo.getTerritorioFromCoordinates ? geo.getTerritorioFromCoordinates(ll.lat, ll.lng) : { sector: null, zona: null, ris: null };
    const etiquetas = { gps: 'GPS del dispositivo', mapa: 'Marcada en el mapa', manual: 'Coordenadas ingresadas' };
    let precisionTxt = etiquetas[s.precision_geo] || s.precision_geo;
    if (s.precision_geo === 'gps' && s.precision_m) precisionTxt += ` (±${Math.round(s.precision_m)} m)`;
    const sectorTxt = t.sector ? `Sector ${t.sector.id_sector} · ${escapeHtml(t.sector.ipress || '')}` : 'Fuera de los sectores GeoRIS';
    const zonaTxt = t.zona ? `Zona ${t.zona.id_zona} (${escapeHtml(t.zona.cabecera || '')}) · RIS ${t.zona.id_ris}` : 'Fuera de las zonas sanitarias de Áncash';
    let refTxt = '';
    const ref = s.opts.referencia;
    if (ref && window.GeoUbicacion && Number.isFinite(ref.lat) && Number.isFinite(ref.lng)) {
      const d = window.GeoUbicacion.distanciaMetros(ll.lat, ll.lng, ref.lat, ref.lng);
      refTxt = `<div>Distancia a ${escapeHtml(ref.nombre || 'su establecimiento')}: <b>${d >= 1000 ? (d / 1000).toFixed(2) + ' km' : Math.round(d) + ' m'}</b> (línea recta)</div>`;
    }
    let aviso = (!t.ris || t.ris.id_ris !== 156)
      ? `<div class="ubicacion-banner-aviso">⚠️ El punto está fuera de la RIS Pacífico Sur. Verifique antes de confirmar.</div>`
      : '';
    if (s.requiereAjuste) {
      aviso += `<div class="ubicacion-banner-aviso">⚠️ El GPS tiene poca precisión: arrastre el marcador o toque el mapa sobre la vivienda para poder confirmar.</div>`;
    }
    const btnConf = document.querySelector('#ubicacion-banner [data-ubic="confirmar"]');
    if (btnConf && !s.guardando) btnConf.disabled = !!s.requiereAjuste;
    el.innerHTML = `
      <div><b>Lat</b> ${ll.lat.toFixed(6)} · <b>Lng</b> ${ll.lng.toFixed(6)} · ${escapeHtml(precisionTxt)}</div>
      <div>${sectorTxt}</div>
      <div>${zonaTxt}</div>
      ${refTxt}
      ${aviso}
    `;
  }

  async _confirmarSeleccion() {
    const s = this.seleccion;
    if (!s || s.guardando || s.requiereAjuste) return;
    const ll = s.marker.getLatLng();
    const errEl = document.getElementById('ubicacion-banner-error');
    const v = window.GeoUbicacion ? window.GeoUbicacion.validarCoordenadas(ll.lat, ll.lng) : { ok: true, lat: ll.lat, lng: ll.lng };
    if (!v.ok) { if (errEl) errEl.textContent = v.error; return; }
    const datos = { lat: v.lat, lng: v.lng, precision_geo: s.precision_geo, precision_m: s.precision_m };
    if (typeof s.opts.onConfirm !== 'function') { this.finalizarSeleccionUbicacion(); return; }
    s.guardando = true;
    s.marker.dragging && s.marker.dragging.disable();
    const btn = document.querySelector('#ubicacion-banner [data-ubic="confirmar"]');
    const btnCancelar = document.querySelector('#ubicacion-banner [data-ubic="cancelar"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando…'; }
    if (btnCancelar) btnCancelar.disabled = true;
    if (errEl) errEl.textContent = '';
    try {
      await s.opts.onConfirm(datos);
      if (this.seleccion === s) this.finalizarSeleccionUbicacion();
    } catch (e) {
      if (this.seleccion !== s) return;
      s.guardando = false;
      s.marker.dragging && s.marker.dragging.enable();
      if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar ubicación'; }
      if (btnCancelar) btnCancelar.disabled = false;
      if (errEl) errEl.textContent = (e && e.message) ? e.message : 'No se pudo guardar la ubicación.';
    }
  }

  /** Cierra la selección sin guardar (silencioso = sin llamar a onCancel). */
  cancelarSeleccionUbicacion(silencioso = false) {
    const s = this.seleccion;
    if (!s) return;
    if (s.guardando) {
      // No se puede «cancelar» algo que ya se está guardando en el servidor
      if (!silencioso && window.app && window.app.showToast) window.app.showToast('La ubicación se está guardando; espere la respuesta del servidor.', 'warning');
      return;
    }
    this.finalizarSeleccionUbicacion();
    if (!silencioso && typeof s.opts.onCancel === 'function') s.opts.onCancel();
  }

  finalizarSeleccionUbicacion() {
    const s = this.seleccion;
    if (!s) return;
    if (s.marker) this.map.removeLayer(s.marker);
    if (s.circulo) this.map.removeLayer(s.circulo);
    this.seleccion = null;
    this._quitarBannerSeleccion();
    this.map.getContainer().classList.remove('modo-seleccion-ubicacion');
    if (this._teclaSeleccion) {
      document.removeEventListener('keydown', this._teclaSeleccion);
      this._teclaSeleccion = null;
    }
  }

  // --- Navegación y Filtros Jerárquicos GeoRIS ---

  /** Cambia de RIS: reinicia la zona y redibuja polígonos, sectores, establecimientos y referencias de esa RIS. */
  flyToRis(idRis) {
    this.currentRisId = idRis;
    this.currentZonaId = 'ALL';
    this.limpiarResaltado();
    this.renderRisLayer(idRis);
    this.renderZonasLayer(idRis, 'ALL');
    this.renderSectoresLayer('ALL', idRis);
    this.renderHospitalesAreaLayer();
    this.renderEessZonaLayer();
    this.renderPuertasEntradaLayer();
    this.renderLineasDeReferencia();
    this._reordenarVectores();

    if (idRis === 'ALL') {
      this.map.setView([-9.50, -77.80], 8);
      return;
    }
    const numericId = parseInt(idRis, 10);
    const risFeature = window.GeorisTerritory.bundle.ris.features.find(f => f.properties.id_ris === numericId);
    if (risFeature) this.map.fitBounds(L.geoJSON(risFeature).getBounds(), { padding: [30, 30] });
  }

  /** Cambia de zona sanitaria (de la RIS indicada o de la actual). idZona 'ALL' vuelve a toda la RIS. */
  flyToZona(idZona, idRis = this.currentRisId) {
    if (idZona === 'ALL') {
      this.flyToRis(idRis);
      return;
    }
    if (idRis === 'ALL' || idRis === undefined || idRis === null) return;
    this.currentRisId = idRis;
    this.currentZonaId = idZona;
    this.limpiarResaltado();
    this.renderRisLayer(idRis);
    this.renderZonasLayer(idRis, idZona);
    this.renderSectoresLayer(idZona, idRis);
    this.renderHospitalesAreaLayer();
    this.renderEessZonaLayer();
    this.renderPuertasEntradaLayer();
    this.renderLineasDeReferencia();
    this._reordenarVectores();

    const zonaFeature = window.GeorisTerritory.bundle.zonas.features.find(f =>
      f.properties.id_ris === parseInt(idRis, 10) && f.properties.id_zona === parseInt(idZona, 10)
    );
    if (zonaFeature) this.map.fitBounds(L.geoJSON(zonaFeature).getBounds(), { padding: [40, 40] });
  }

  zoomIn() { this.map.zoomIn(); }
  zoomOut() { this.map.zoomOut(); }
  home() {
    this.limpiarResaltado();
    this.limpiarFoco();
    this.map.setView(HOSPITAL_HUARMEY, 15);
  }

  toggleMeasurement() {
    if (this.seleccion && !this.measuring) {
      if (window.app && window.app.showToast) window.app.showToast('Termine o cancele primero la ubicación del domicilio.', 'warning');
      return false;
    }
    return this.setMedicion(!this.measuring);
  }

  /** Activa o desactiva la medición (silencioso: sin aviso, p. ej. al cerrar sesión). */
  setMedicion(activo, silencioso = false) {
    this.measuring = !!activo;
    this.map.getContainer().classList.toggle('modo-medicion', this.measuring);
    const btn = document.getElementById('btn-medir');
    if (btn) { btn.classList.toggle('active', this.measuring); btn.setAttribute('aria-pressed', String(this.measuring)); }
    if (!this.measuring) {
      if (this.measurePolyline) {
        this.map.removeLayer(this.measurePolyline);
        this.measurePolyline = null;
      }
      this.measurePoints = [];
      if (!silencioso && window.app && window.app.showToast) window.app.showToast('Herramienta de medición desactivada', 'info');
    } else {
      this.map.closePopup();
      if (!silencioso && window.app && window.app.showToast) window.app.showToast('Haga clic en 2 o más puntos del mapa para medir distancia y tiempo estimado de ambulancia. Vuelva a pulsar 📏 para terminar.', 'info', 5000);
    }
    return this.measuring;
  }

  addMeasurePoint(latlng) {
    this.measurePoints.push(latlng);
    if (!this.measurePolyline) {
      this.measurePolyline = L.polyline(this.measurePoints, { color: '#0284C7', weight: 3, dashArray: '6, 6', interactive: false }).addTo(this.map);
    } else {
      this.measurePolyline.setLatLngs(this.measurePoints);
    }
    this._reordenarVectores();

    if (this.measurePoints.length >= 2) {
      let totalDist = 0;
      for (let i = 0; i < this.measurePoints.length - 1; i++) {
        totalDist += this.measurePoints[i].distanceTo(this.measurePoints[i + 1]);
      }
      const distKm = totalDist / 1000;
      const min = Math.round((distKm * 1.35 / 45) * 60);
      if (window.app && window.app.showToast) {
        window.app.showToast(`📏 Distancia en línea recta: ${distKm.toFixed(2)} km | ⏱️ Tiempo estimado en ambulancia: ~${min} min`, 'info', 6000);
      }
    }
  }

  flyTo(lat, lng, zoom = 15) {
    this.map.flyTo([lat, lng], zoom, { duration: 1.0 });
  }

  _aplicarEstiloCatastro() {
    const isDark = this.currentBaseName === 'Modo Noche (CARTO)';
    const isSat = this.currentBaseName === 'Google Satélite Híbrido' || this.currentBaseName === BASEMAP_SATELITE;
    if (this.cadastreBuildingsLayer) {
      this.cadastreBuildingsLayer.setStyle({
        color: isDark ? '#38bdf8' : (isSat ? '#fde047' : '#475569'),
        weight: isSat ? 0.9 : 0.8,
        fillColor: isDark ? '#0284c7' : (isSat ? '#fef08a' : '#94a3b8'),
        fillOpacity: isSat ? 0.08 : (isDark ? 0.12 : 0.10)
      });
    }
    if (this.cadastreStreetsLayer) {
      this.cadastreStreetsLayer.setStyle({
        color: isDark ? '#64748b' : (isSat ? '#ffffff' : '#334155'),
        weight: isSat ? 1.2 : 1.4,
        opacity: isSat ? 0.45 : (isDark ? 0.55 : 0.65)
      });
    }
    const mapContainer = document.getElementById(this.containerId);
    if (mapContainer) mapContainer.style.background = isDark ? '#0b1120' : (isSat ? '#1e293b' : '#e5e7eb');
  }

  /** Nombre canónico de un mapa base (acepta los nombres anteriores). */
  nombreMapaBase(type) {
    if (this.baseLayers[type]) return type;
    if (BASEMAP_ALIAS[type] && this.baseLayers[BASEMAP_ALIAS[type]]) return BASEMAP_ALIAS[type];
    return null;
  }

  /**
   * Cambio de mapa base sin alterar las capas vectoriales. Devuelve el nombre canónico aplicado (o null).
   */
  setBaseMap(type) {
    const nombre = this.nombreMapaBase(type);
    if (!nombre) return null;
    const nextLayer = this.baseLayers[nombre];

    Object.values(this.baseLayers).forEach(layer => {
      if (layer !== nextLayer && this.map.hasLayer(layer)) this.map.removeLayer(layer);
    });
    if (!this.map.hasLayer(nextLayer)) nextLayer.addTo(this.map);
    if (nextLayer.bringToBack) nextLayer.bringToBack();
    this.currentBaseLayer = nextLayer;
    this.currentBaseName = nombre;

    this._aplicarEstiloCatastro();
    this._reordenarVectores();
    return nombre;
  }

  /**
   * Pin temporal para búsquedas de direcciones
   */
  mostrarPinBusqueda(lat, lng, label) {
    if (this.searchPin) {
      this.map.removeLayer(this.searchPin);
      this.searchPin = null;
    }
    if (this._searchPinTimer) clearTimeout(this._searchPinTimer);

    const pinIcon = L.divIcon({
      className: 'custom-map-pin',
      html: `
        <div style="background:#FFFFFF; color:#0F172A; padding:6px 14px; border-radius:14px; font-size:var(--font-xs); font-weight:800; box-shadow:0 3px 12px rgba(15,23,42,0.15); border:2px solid #BAE6FD; display:flex; align-items:center; gap:6px; white-space:nowrap;">
          <span>📍</span> <span>${escapeHtml(label)}</span>
        </div>
      `,
      iconSize: [160, 32],
      iconAnchor: [80, 16]
    });

    const pin = L.marker([lat, lng], { icon: pinIcon, pane: 'paneFoco', interactive: false }).addTo(this.map);
    this.searchPin = pin;
    this._searchPinTimer = setTimeout(() => {
      if (this.searchPin === pin) {
        this.map.removeLayer(pin);
        this.searchPin = null;
      }
    }, 10000);
  }
}

// Exportación
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MapManager;
} else {
  window.MapManager = MapManager;
  window.MAPA_BASE_ALIAS = BASEMAP_ALIAS;
}
