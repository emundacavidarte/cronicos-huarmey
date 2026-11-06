/**
 * mapManager.js (v2.1 High Performance Canvas & LOD Engine)
 * Orquestador cartográfico basado en Leaflet.js con aceleración gráfica por Hardware (HTML5 Canvas)
 * y Nivel de Detalle Dinámico (LOD) para carga instantánea al hacer zoom o cambiar de mapa base.
 * Totalmente compatible con GeoRIS MINSA, D.S. 019-2024-SA y Catastro de Huarmey.
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
  autoPanPaddingTopLeft: [20, 70], // 70px garantizan separación visual bajo el header de 52px
  autoPanPaddingBottomRight: [20, 20],
  className: 'georis-popup-custom'
};

/** Texto de la precisión de ubicación de un paciente (G-04) */
function textoPrecisionGeo(prec) {
  return ({
    exacta: 'Exacta (punto tomado en campo)',
    origen: 'Coordenadas del sistema de origen',
    cuadra: 'Aproximada a la cuadra (±50 m, por dirección)',
    calle: 'Aproximada: sobre la calle (sin número de puerta)',
    sector: 'Aproximada: centro del sector',
    localidad: 'Aproximada: centro de la localidad',
    sin_ubicacion: 'Sin ubicar'
  })[prec] || 'Coordenadas del sistema de origen';
}

/** ¿El pin es aproximado (puesto a partir de la dirección)? */
function esAproximada(p) {
  return ['cuadra', 'calle', 'sector', 'localidad'].includes(p && p.precision_geo);
}

class MapManager {
  constructor(containerId = 'map') {
    this.containerId = containerId;
    this.map = null;
    this.baseLayers = {};
    this.currentBaseLayer = null;
    this.canvasRenderer = null; // Renderer Canvas Compartido de Alta Velocidad
    
    // Capas vectoriales jerárquicas GeoRIS
    this.layers = {
      limiteRis: null,           // Polígonos oficiales de las 7 RIS de Áncash
      zonasSanitarias: null,     // Polígonos oficiales de las 44 Zonas Sanitarias
      sectoresSanitarios: null,  // Polígonos de los 72 Sectores Sanitarios (Pacífico Sur)
      areaSanitaria: null,       // Hospitales de Referencia (II-1, II-2)
      zonaSanitaria: null,       // Cabeceras de Zona Sanitaria (I-3, I-4)
      puertaEntrada: null,       // Postas Puerta de Entrada (I-1, I-2, I-3)
      referenciasLines: null,    // Red completa de referencias hacia Hospital II-1 Huarmey
      activeHighlight: null,     // Delineación o ruta activa de referencia seleccionada
      catastroUrbano: null,      // Contenedor del catastro de Huarmey
      pacientes: null            // Pacientes crónicos HEARTS
    };

    // Subcapas de Catastro para LOD (Instanciadas una sola vez en memoria)
    this.cadastreBuildingsLayer = null;
    this.cadastreStreetsLayer = null;
    this.cadastreLoaded = false;

    this.currentRisId = 156;    // Por defecto RIS Pacífico Sur
    this.currentZonaId = 'ALL';
    this.measuring = false;
    this.measurePoints = [];
    this.measurePolyline = null;
    this.rafCoordsId = null;
  }

  init() {
    // 1. Instanciar Canvas Renderer Global para evitar miles de nodos SVG en el DOM
    this.canvasRenderer = L.canvas({
      padding: 0.25,
      tolerance: 5
    });

    // 2. Inicializar Mapa con aceleración Canvas habilitada
    this.map = L.map(this.containerId, {
      center: [-10.04780, -78.15480], // Nuevo Hospital Huarmey II-1 (Miramar / Detrás de Hotel La Siesta)
      zoom: 15,
      maxZoom: 20,
      zoomControl: false,
      preferCanvas: true,            // Dibuja geometrías en un único canvas GPU
      wheelDebounceTime: 40,
      zoomSnap: 1,
      zoomDelta: 1
    });

    // Delegación de eventos segura para acciones de pacientes en Popups Leaflet
    const mapContainer = this.map.getContainer();
    mapContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-patient-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-patient-action');
      const pid = btn.getAttribute('data-patient-id');
      if (!pid) return;
      if (action === 'detail' && window.app && window.app.openPatientDetail) {
        window.app.openPatientDetail(pid);
      } else if (action === 'whatsapp' && window.app && window.app.sendWhatsAppDirect) {
        window.app.sendWhatsAppDirect(pid);
      }
    });

    // 3. Opciones de alto rendimiento para capas de mosaicos (Tiles)
    // Se evita crossOrigin:true global y se configura maxNativeZoom por proveedor para eliminar "Map data not yet available"
    const tilePerfOpts = {
      maxZoom: 20,
      updateWhenZooming: false,
      updateWhenIdle: false,
      keepBuffer: 4
    };

    // A. GeoRIS Oficial (Esri World Street Map - maxNativeZoom 17 evita mosaicos grises en zoom 18-20)
    const georisOficial = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      ...tilePerfOpts,
      maxNativeZoom: 17,
      attribution: 'Tiles &copy; Esri, HERE, Garmin, USGS | GeoRIS MINSA'
    });

    // B. Satelital HD Híbrido (Cobertura nativa hasta Zoom 20 en Huarmey con calles y etiquetas)
    const satHybrid = L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&hl=es&x={x}&y={y}&z={z}', {
      ...tilePerfOpts,
      subdomains: ['0', '1', '2', '3'],
      maxNativeZoom: 20,
      attribution: 'Imagery &copy; Google, Maxar Technologies | GeoRIS'
    });

    // C. Gris Claro Minimalista (CartoDB Positron HD - Cobertura nativa hasta Zoom 20 sin corte en Huarmey)
    const lightGrayMinimal = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      ...tilePerfOpts,
      subdomains: 'abcd',
      maxNativeZoom: 19,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    });

    // D. Modo Noche / Oscuro (CartoDB Dark Matter HD - Alto contraste hasta Zoom 20 sin corte en Huarmey)
    const darkNightMode = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      ...tilePerfOpts,
      subdomains: 'abcd',
      maxNativeZoom: 19,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    });

    // E. Topográfico y Relieve (Relieve Topográfico HD con cobertura completa en Áncash)
    const topoRelief = L.tileLayer('https://mt{s}.google.com/vt/lyrs=p&hl=es&x={x}&y={y}&z={z}', {
      ...tilePerfOpts,
      subdomains: ['0', '1', '2', '3'],
      maxNativeZoom: 19,
      attribution: 'Terrain &copy; Google | GeoRIS'
    });

    // F. Calles y Sentidos Viales (Cartografía vial detallada hasta Zoom 20)
    const streetsRoads = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&hl=es&x={x}&y={y}&z={z}', {
      ...tilePerfOpts,
      subdomains: ['0', '1', '2', '3'],
      maxNativeZoom: 20,
      attribution: 'Map data &copy; Google | GeoRIS'
    });

    // G. OpenStreetMap Humanitario Salud (HOT)
    const osmHot = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      ...tilePerfOpts,
      subdomains: 'abc',
      maxNativeZoom: 19,
      attribution: '&copy; OpenStreetMap contributors, Humanitarian OpenStreetMap Team'
    });

    this.baseLayers = {
      "GeoRIS Oficial (MINSA)": georisOficial,
      "Esri Satelital Híbrido": satHybrid,
      "Gris Claro Minimalista": lightGrayMinimal,
      "Modo Noche / Oscuro": darkNightMode,
      "Esri Topográfico": topoRelief,
      "Esri Calles y Vías": streetsRoads,
      "OSM Humanitario Salud": osmHot
    };

    // Capa base por defecto: Calles y Sentidos Viales
    this.currentBaseLayer = this.baseLayers["Esri Calles y Vías"];
    this.currentBaseLayer.addTo(this.map);

    // Inicializar grupos de capas Leaflet en el orden óptimo de apilamiento
    this.layers.limiteRis = L.geoJSON(null, { renderer: this.canvasRenderer }).addTo(this.map);
    this.layers.zonasSanitarias = L.geoJSON(null, { renderer: this.canvasRenderer }).addTo(this.map);
    this.layers.sectoresSanitarios = L.geoJSON(null, { renderer: this.canvasRenderer }).addTo(this.map);
    this.layers.catastroUrbano = L.layerGroup().addTo(this.map);
    this.layers.referenciasLines = L.layerGroup().addTo(this.map);
    this.layers.activeHighlight = L.layerGroup().addTo(this.map);
    this.layers.puertaEntrada = L.layerGroup().addTo(this.map);
    this.layers.zonaSanitaria = L.layerGroup().addTo(this.map);
    this.layers.areaSanitaria = L.layerGroup().addTo(this.map);
    this.layers.pacientes = L.layerGroup().addTo(this.map);

    // Renderizar capas vectoriales oficiales
    this.renderAllOfficialLayers();

    // 4. Control de Nivel de Detalle Dinámico (LOD) en eventos de Zoom
    this.map.on('zoomend', () => {
      this.applyLodRules();
    });

    // 5. Lectura eficiente de coordenadas con throttling (requestAnimationFrame)
    this.map.on('mousemove', (e) => {
      if (this.rafCoordsId) cancelAnimationFrame(this.rafCoordsId);
      this.rafCoordsId = requestAnimationFrame(() => {
        const coordEl = document.getElementById('coords-display');
        if (coordEl) {
          coordEl.textContent = `${e.latlng.lng.toFixed(5)} ${e.latlng.lat.toFixed(5)} Grados | Zoom: ${this.map.getZoom().toFixed(1)}`;
        }
      });
    });

    // 6. Medición interactiva
    this.map.on('click', (e) => {
      if (this.measuring) {
        this.addMeasurePoint(e.latlng);
      }
    });

    // Aplicar LOD inicial según el zoom de arranque (15)
    this.applyLodRules();

    // Garantizar que Leaflet ocupe el 100% de la pantalla al iniciar y al redimensionar
    window.addEventListener('resize', () => {
      if (this.map) this.map.invalidateSize();
    });
    setTimeout(() => {
      if (this.map) this.map.invalidateSize();
    }, 150);
    setTimeout(() => {
      if (this.map) this.map.invalidateSize();
    }, 500);
  }

  /**
   * Carga y dibuja las capas vectoriales oficiales de Áncash
   */
  renderAllOfficialLayers() {
    if (!window.GeorisTerritory || !window.GeorisTerritory.isReady()) {
      console.warn('GeorisTerritory no disponible aún, esperando carga de datos...');
      return;
    }

    // 1. Límites de RIS (7 Redes con 33,623 vértices topográficos)
    this.renderRisLayer(this.currentRisId);

    // 2. Zonas Sanitarias (44 Zonas)
    this.renderZonasLayer(this.currentRisId, this.currentZonaId);

    // 3. Sectores Sanitarios (72 Sectores Pacífico Sur)
    this.renderSectoresLayer(this.currentZonaId);

    // 4. Hospitales de Área (II-1, II-2)
    this.renderHospitalesAreaLayer();

    // 5. Cabeceras de Zona Sanitaria (I-3, I-4)
    this.renderEessZonaLayer();

    // 6. Puertas de Entrada (Postas I-1, I-2, I-3)
    this.renderPuertasEntradaLayer();

    // 7. Red de Referencias geodésicas hacia el Hospital II-1 Huarmey
    this.renderLineasDeReferencia();

    // 8. Inicialización del Catastro Urbano en memoria (6,384 inmuebles + 659 vías)
    this.initCatastroUrbanoLayers();
  }

  /**
   * Renderiza los polígonos oficiales de las 7 RIS de Áncash utilizando Canvas
   */
  renderRisLayer(highlightIdRis = null) {
    this.layers.limiteRis.clearLayers();
    if (!window.GeorisTerritory?.bundle?.ris) return;

    const geojsonData = window.GeorisTerritory.bundle.ris;

    this.layers.limiteRis.addData(geojsonData);
    this.layers.limiteRis.eachLayer(layer => {
      const p = layer.feature.properties;
      const idRis = p.id_ris;
      const cfg = GEORIS_RIS_CONFIG[idRis] || {};
      const isSelected = (!highlightIdRis || highlightIdRis === 'ALL' || highlightIdRis == idRis);

      layer.setStyle({
        renderer: this.canvasRenderer,
        color: cfg.color || "#0284c7",
        weight: isSelected ? (highlightIdRis == idRis ? 3.5 : 2) : 1,
        opacity: isSelected ? 0.85 : 0.25,
        fillColor: cfg.color || "#0284c7",
        fillOpacity: (highlightIdRis == idRis) ? 0.05 : (isSelected ? 0.02 : 0.005)
      });

      const popupHtml = `
        <div class="georis-popup">
          <div class="georis-popup-header" style="background:${cfg.color || '#0284c7'};">
            <span>RED INTEGRADA DE SALUD: ${p.ris}</span>
          </div>
          <div class="georis-popup-body">
            <div class="georis-popup-row"><span class="georis-popup-label">Código RIS:</span><span class="georis-popup-val">N° ${p.id_ris}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Departamento:</span><span class="georis-popup-val">${p.departamen}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Población Total:</span><span class="georis-popup-val" style="font-weight:800; color:#0284c7;">${(p.pob_t || 0).toLocaleString()} hab.</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Viviendas / Familias:</span><span class="georis-popup-val">${(p.n_viv || 0).toLocaleString()} viv. / ${(p.n_fam || 0).toLocaleString()} fam.</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Zonas Sanitarias:</span><span class="georis-popup-val">${p.n_zona} Zonas</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Sectores Sanitarios:</span><span class="georis-popup-val">${p.n_sec} Sectores</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Hospitales de Área:</span><span class="georis-popup-val" style="font-size:var(--font-xs); color:#b91c1c;">${p.hospital}</span></div>
          </div>
          <div class="georis-popup-footer">
            <button onclick="window.app.selectRis('${p.id_ris}')" class="btn-mini btn-precita">Delimitar Zonas de ${p.ris}</button>
          </div>
        </div>
      `;

      layer.bindPopup(popupHtml, GEORIS_POPUP_CONFIG);
    });
  }

  /**
   * Renderiza los polígonos oficiales de las Zonas Sanitarias (Microrredes)
   */
  renderZonasLayer(idRis = 156, highlightIdZona = 'ALL') {
    this.layers.zonasSanitarias.clearLayers();
    if (!window.GeorisTerritory?.bundle?.zonas) return;

    const allZonas = window.GeorisTerritory.bundle.zonas.features;
    let filteredZonas = allZonas;
    if (idRis && idRis !== 'ALL') {
      filteredZonas = allZonas.filter(f => f.properties.id_ris === parseInt(idRis, 10));
    }

    filteredZonas.forEach(feature => {
      const p = feature.properties;
      const isSelected = (highlightIdZona === 'ALL' || highlightIdZona == p.id_zona);

      const layer = L.geoJSON(feature, {
        renderer: this.canvasRenderer,
        style: {
          color: isSelected ? "#ea580c" : "#94a3b8",
          weight: isSelected ? (highlightIdZona == p.id_zona ? 3 : 1.8) : 1,
          dashArray: "5, 5",
          fillColor: isSelected ? "#ea580c" : "#cbd5e1",
          fillOpacity: (highlightIdZona == p.id_zona) ? 0.08 : (isSelected ? 0.03 : 0.005)
        }
      });

      const popupHtml = `
        <div class="georis-popup">
          <div class="georis-popup-header" style="background:#ea580c;">
            <span>ZONA SANITARIA ${p.id_zona}: ${p.cabecera || p.distrito}</span>
          </div>
          <div class="georis-popup-body">
            <div class="georis-popup-row"><span class="georis-popup-label">Código Zona:</span><span class="georis-popup-val">Zona ${p.id_zona}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">RIS Asignada:</span><span class="georis-popup-val">${p.ris} (N° ${p.id_ris})</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Población Asignada:</span><span class="georis-popup-val" style="font-weight:700; color:#ea580c;">${(p.pob_t || 0).toLocaleString()} hab.</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Cabecera de Zona:</span><span class="georis-popup-val" style="font-weight:600;">${p.cabecera || 'C.S. La Victoria'}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Puertas de Entrada:</span><span class="georis-popup-val">${p.n_pe || '12'} E.S.</span></div>
          </div>
          <div class="georis-popup-footer">
            <button onclick="window.app.selectZona('${p.id_zona}')" class="btn-mini btn-precita">Filtrar Sectores y Postas</button>
          </div>
        </div>
      `;

      layer.bindPopup(popupHtml, GEORIS_POPUP_CONFIG);
      this.layers.zonasSanitarias.addLayer(layer);
    });
  }

  /**
   * Renderiza los microsectores comunales de la RIS Pacífico Sur
   */
  renderSectoresLayer(idZona = 'ALL') {
    this.layers.sectoresSanitarios.clearLayers();
    if (!window.GeorisTerritory?.bundle?.sectores) return;

    const allSectores = window.GeorisTerritory.bundle.sectores.features;
    let filtered = allSectores;

    if (idZona && idZona !== 'ALL') {
      filtered = allSectores.filter(f => f.properties.id_zona === parseInt(idZona, 10));
    }

    filtered.forEach(feature => {
      const p = feature.properties;
      const layer = L.geoJSON(feature, {
        renderer: this.canvasRenderer,
        style: {
          color: "#059669",
          weight: 1.2,
          dashArray: "3, 3",
          fillColor: "#10b981",
          fillOpacity: 0.05
        }
      });

      const sectorTitle = p.sector || `N° ${p.id_sector} (${p.distrito || 'HUARMEY'})`;
      const popupHtml = `
        <div class="georis-popup">
          <div class="georis-popup-header" style="background:#059669;">
            <span>SECTOR SANITARIO ${sectorTitle}</span>
          </div>
          <div class="georis-popup-body">
            <div class="georis-popup-row"><span class="georis-popup-label">Código Sector:</span><span class="georis-popup-val">Sector ${p.id_sector}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Distrito / Provincia:</span><span class="georis-popup-val">${p.distrito || 'Huarmey'} (${p.provincia || 'Huarmey'})</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">IPRESS Asignada:</span><span class="georis-popup-val" style="color:#0369a1; font-weight:700;">${p.ipress || 'Hospital de Apoyo Huarmey'}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Zona Sanitaria:</span><span class="georis-popup-val">Zona ${p.id_zona}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Población Sector:</span><span class="georis-popup-val" style="font-weight:700;">${(p.pob_t || 0).toLocaleString()} hab.</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Viviendas / Familias:</span><span class="georis-popup-val">${(p.n_viv || 0).toLocaleString()} viv. / ${(p.n_fam || 0).toLocaleString()} fam.</span></div>
          </div>
        </div>
      `;

      layer.bindPopup(popupHtml, GEORIS_POPUP_CONFIG);
      this.layers.sectoresSanitarios.addLayer(layer);
    });
  }

  /**
   * Inicializa las capas de Catastro Urbano en memoria con Canvas Renderer (Zero DOM Lag)
   */
  initCatastroUrbanoLayers() {
    if (this.cadastreLoaded || !window.HUARMEY_CADASTRE || !window.HUARMEY_CADASTRE.features) return;

    const buildings = [];
    const streets = [];

    window.HUARMEY_CADASTRE.features.forEach(f => {
      if (f.properties.type === 'building') buildings.push(f);
      else if (f.properties.type === 'highway') streets.push(f);
    });

    // 1. Manzanas y Lotes Urbanos (6,384 Polígonos de Huarmey)
    this.cadastreBuildingsLayer = L.geoJSON({ type: 'FeatureCollection', features: buildings }, {
      renderer: this.canvasRenderer,
      style: {
        color: '#475569',
        weight: 0.8,
        fillColor: '#94a3b8',
        fillOpacity: 0.10
      },
      onEachFeature: (feature, layer) => {
        if (feature.properties.name) {
          layer.bindTooltip(`<b>${feature.properties.name}</b>`, { direction: 'top', className: 'georis-tooltip' });
        }
      }
    });

    // 2. Trazado Vial y Calles (659 Tramos)
    this.cadastreStreetsLayer = L.geoJSON({ type: 'FeatureCollection', features: streets }, {
      renderer: this.canvasRenderer,
      style: {
        color: '#334155',
        weight: 1.5,
        opacity: 0.70
      },
      onEachFeature: (feature, layer) => {
        if (feature.properties.name) {
          layer.bindTooltip(feature.properties.name, { direction: 'center', className: 'georis-tooltip' });
        }
      }
    });

    this.cadastreLoaded = true;
    this.applyLodRules();
  }

  /**
   * Reglas de Nivel de Detalle (LOD): Activa o desactiva capas según el nivel de zoom
   * para garantizar respuesta a 60 FPS en cualquier dispositivo
   */
  applyLodRules() {
    const zoom = this.map.getZoom();

    if (!this.cadastreLoaded) return;

    // Regla para Lotes Urbanos (6,384 edificios): Solo visibles en zoom >= 14
    if (zoom >= 14) {
      if (!this.layers.catastroUrbano.hasLayer(this.cadastreBuildingsLayer)) {
        this.layers.catastroUrbano.addLayer(this.cadastreBuildingsLayer);
      }
    } else {
      if (this.layers.catastroUrbano.hasLayer(this.cadastreBuildingsLayer)) {
        this.layers.catastroUrbano.removeLayer(this.cadastreBuildingsLayer);
      }
    }

    // Regla para Ejes Viales y Calles: Visibles en zoom >= 13
    if (zoom >= 13) {
      if (!this.layers.catastroUrbano.hasLayer(this.cadastreStreetsLayer)) {
        this.layers.catastroUrbano.addLayer(this.cadastreStreetsLayer);
      }
    } else {
      if (this.layers.catastroUrbano.hasLayer(this.cadastreStreetsLayer)) {
        this.layers.catastroUrbano.removeLayer(this.cadastreStreetsLayer);
      }
    }

    // Regla para Polígonos Macro de RIS: A partir de zoom 15 se minimiza el relleno
    if (this.layers.limiteRis) {
      const newOpacity = zoom >= 15 ? 0.01 : 0.04;
      this.layers.limiteRis.eachLayer(l => {
        if (l.setStyle) l.setStyle({ fillOpacity: newOpacity });
      });
    }
  }

  /**
   * Renderiza los Hospitales de Referencia de Área Sanitaria (II-1, II-2)
   */
  renderHospitalesAreaLayer() {
    this.layers.areaSanitaria.clearLayers();
    const hospitales = window.GeorisTerritory.getHospitalesArea(this.currentRisId);

    hospitales.forEach(hosp => {
      const isHuarmey = hosp.cod_renipress === "00001741";
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

      const marker = L.marker([hosp.lat, hosp.lng], {
        icon: hospIcon,
        zIndexOffset: isHuarmey ? 4000 : 2500
      });

      marker.bindTooltip(`
        <div style="font-weight:700; font-size:var(--font-sm); color:#ffffff; display:flex; align-items:center; gap:6px;">${window.AppIcons ? window.AppIcons.hospital(14, '#ffffff') : ''} ${hosp.nombre}</div>
        <div style="font-size:var(--font-xs); color:#fca5a5;">Categoría ${hosp.categoria} • ${hosp.ris}</div>
        <div style="font-size:var(--font-xs); color:#e2e8f0;">Hospital de Referencia (Techo Resolutivo)</div>
      `, {
        direction: 'top',
        offset: [0, -18],
        className: 'georis-tooltip',
        opacity: 0.98
      });

      if (isHuarmey && window.GeorisTerritory) {
        const netHuarmey = window.GeorisTerritory.getHuarmeyNetwork();
        if (netHuarmey && netHuarmey.hospital && netHuarmey.hospital.polygonCoords) {
          const terrenoPolygon = L.polygon(netHuarmey.hospital.polygonCoords, {
            renderer: this.canvasRenderer,
            color: '#DC2626',
            weight: 2,
            fillColor: '#FEF2F2',
            fillOpacity: 0.25,
            dashArray: '4, 4'
          });

          terrenoPolygon.bindTooltip('<b>Complejo Hospitalario Huarmey II-1</b><br>Contorno REFERENCIAL dibujado a mano (no es el lindero oficial; terreno oficial 11,325.98 m²)', {
            permanent: false,
            direction: 'center',
            className: 'georis-tooltip'
          });

          this.layers.areaSanitaria.addLayer(terrenoPolygon);
        }
      }

      const popupHtml = `
        <div class="georis-popup">
          <div class="georis-popup-header" style="background:#0F234D; color:#FFFFFF; border-bottom:2px solid #DC2626; display:flex; align-items:center; gap:8px;">
            <span>${window.AppIcons ? window.AppIcons.hospital(15, '#ffffff') : ''} ${hosp.nombre}</span>
          </div>
          <div class="georis-popup-body">
            <div class="georis-popup-row"><span class="georis-popup-label">Categoría:</span><span class="georis-popup-val" style="font-weight:700; color:#dc2626;">${hosp.categoria}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Rol GeoRIS:</span><span class="georis-popup-val">Hospital de Referencia de Área Sanitaria</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Cód. RENIPRESS:</span><span class="georis-popup-val">${hosp.cod_renipress}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Red RIS:</span><span class="georis-popup-val">${hosp.ris}</span></div>
            ${isHuarmey ? `
              <div class="georis-popup-row"><span class="georis-popup-label">Ubicación Actual:</span><span class="georis-popup-val" style="color:#0369a1; font-weight:700;">AA.HH. Miramar / Santo Domingo Ampliación (detrás de Hotel La Siesta)</span></div>
              <div class="georis-popup-row"><span class="georis-popup-label">Terreno Oficial:</span><span class="georis-popup-val">11,325.98 m² (Inversión S/. 188M OxI)</span></div>
              <div class="georis-popup-row"><span class="georis-popup-label">Capacidad Resolutiva:</span><span class="georis-popup-val" style="color:#15803d; font-weight:700;">Medicina Interna, Cardiología, Emergencia 24h, Laboratorio II, Telemonitoreo HEARTS</span></div>
              <div class="georis-popup-row"><span class="georis-popup-label">Red Tributaria:</span><span class="georis-popup-val">12 IPRESS en la Provincia de Huarmey</span></div>
            ` : ''}
          </div>
          <div class="georis-popup-footer">
            <button onclick="window.app.seleccionarHospitalReferencia('${hosp.cod_renipress}')" class="btn-mini btn-precita">Ver Red de Referencias Tributarias</button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, GEORIS_POPUP_CONFIG);
      this.layers.areaSanitaria.addLayer(marker);
    });
  }

  /**
   * Renderiza los Establecimientos de Zona Sanitaria (Cabeceras I-3, I-4)
   */
  renderEessZonaLayer() {
    this.layers.zonaSanitaria.clearLayers();
    const eessZona = window.GeorisTerritory.getEessZona(this.currentRisId);

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

      const marker = L.marker([es.lat, es.lng], {
        icon: zonaIcon,
        zIndexOffset: 2000
      });

      marker.bindTooltip(`
        <div style="font-weight:700; font-size:var(--font-sm); color:#ffffff; display:flex; align-items:center; gap:6px;">${window.AppIcons ? window.AppIcons.city(14, '#ffffff') : ''} ${es.nombre}</div>
        <div style="font-size:var(--font-xs); color:#fde68a;">Categoría ${es.categoria} • Zona ${es.id_zona} (${es.ris})</div>
        <div style="font-size:var(--font-xs); color:#e2e8f0;">Cabecera de Zona Sanitaria</div>
      `, {
        direction: 'top',
        offset: [0, -14],
        className: 'georis-tooltip',
        opacity: 0.98
      });

      const popupHtml = `
        <div class="georis-popup">
          <div class="georis-popup-header" style="background:#0F234D; color:#FFFFFF; border-bottom:2px solid #D97706; display:flex; align-items:center; gap:8px;">
            <span>${window.AppIcons ? window.AppIcons.city(15, '#ffffff') : ''} ${es.nombre}</span>
          </div>
          <div class="georis-popup-body">
            <div class="georis-popup-row"><span class="georis-popup-label">Categoría:</span><span class="georis-popup-val" style="font-weight:700; color:#b45309;">${es.categoria}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Rol GeoRIS:</span><span class="georis-popup-val">Establecimiento de Referencia de Zona Sanitaria</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Cód. RENIPRESS:</span><span class="georis-popup-val">${es.cod_renipress}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Zona Sanitaria:</span><span class="georis-popup-val">Zona ${es.id_zona} (${es.ris})</span></div>
          </div>
          <div class="georis-popup-footer">
            <button onclick="window.app.trazarReferenciaHaciaHospital('${es.cod_renipress}')" class="btn-mini btn-precita">Medir Referencia al Hospital</button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, GEORIS_POPUP_CONFIG);
      this.layers.zonaSanitaria.addLayer(marker);
    });
  }

  /**
   * Renderiza los Establecimientos Puerta de Entrada (Postas I-1, I-2, I-3)
   */
  renderPuertasEntradaLayer() {
    this.layers.puertaEntrada.clearLayers();
    const redHuarmey = window.GeorisTerritory.getHuarmeyNetwork();

    redHuarmey.puertas.forEach(pe => {
      const puertaIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `
          <div class="pin-puerta-badge">
            <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 8h-3v3h-2v-3H8v-2h3V6h2v3h3v2z"/></svg>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
      });

      const marker = L.marker([pe.lat, pe.lng], {
        icon: puertaIcon,
        zIndexOffset: 1200
      });

      const enclaveBadge = pe.is_enclave ? `<div style="font-size:var(--font-xs); color:#fde047; font-weight:700; display:flex; align-items:center; gap:4px;">${window.AppIcons ? window.AppIcons.alertTriangle(12, '#fde047') : ''} Enclave: ${pe.red_origen}</div>` : '';

      marker.bindTooltip(`
        <div style="font-weight:700; font-size:var(--font-sm); color:#ffffff; display:flex; align-items:center; gap:6px;">${window.AppIcons ? window.AppIcons.door(14, '#ffffff') : ''} ${pe.nombre}</div>
        <div style="font-size:var(--font-xs); color:#bae6fd;">Categoría ${pe.categoria} • Puerta de Entrada (${pe.distrito || 'Huarmey'})</div>
        ${enclaveBadge}
        <div style="font-size:var(--font-xs); color:#e2e8f0;">Distancia en línea recta al Hosp. II-1: <b>${pe.distancia_hospital_km} km</b> (tiempo estimado ~${pe.tiempo_traslado_txt})</div>
      `, {
        direction: 'top',
        offset: [0, -12],
        className: 'georis-tooltip',
        opacity: 0.98
      });

      const popupHtml = `
        <div class="georis-popup">
          <div class="georis-popup-header" style="background:#0F234D; color:#FFFFFF; border-bottom:2px solid #0284C7; display:flex; align-items:center; gap:8px;">
            <span>${window.AppIcons ? window.AppIcons.door(15, '#ffffff') : ''} ${pe.nombre}</span>
          </div>
          <div class="georis-popup-body">
            <div class="georis-popup-row"><span class="georis-popup-label">Categoría:</span><span class="georis-popup-val" style="font-weight:700;">${pe.categoria}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Rol GeoRIS:</span><span class="georis-popup-val">${escapeHtml(pe.rol_georis || 'Puerta de Entrada')}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Cód. RENIPRESS:</span><span class="georis-popup-val">${pe.cod_renipress}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Ubicación:</span><span class="georis-popup-val">${pe.distrito} (${pe.provincia})</span></div>
            ${pe.is_enclave ? `<div class="georis-popup-row" style="background:#fef3c7; padding:4px 6px; border-radius:4px;"><span class="georis-popup-label" style="color:#b45309;">Enclave:</span><span class="georis-popup-val" style="color:#b45309; font-weight:700;">${pe.red_origen}</span></div>` : ''}
            <div class="georis-popup-row"><span class="georis-popup-label">Distancia en línea recta al Hosp. II-1:</span><span class="georis-popup-val" style="color:#dc2626; font-weight:800;">${pe.distancia_hospital_km} km</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Tiempo estimado (línea recta × 1,35 a 45 km/h):</span><span class="georis-popup-val" style="color:#0369a1; font-weight:700;">${pe.tiempo_traslado_txt}</span></div>
            <div class="georis-popup-row"><span class="georis-popup-label">Estándar GeoRIS (estimado):</span><span class="georis-popup-val" style="color:${pe.cumple_estandar_area ? '#15803d' : '#b91c1c'}; font-weight:700;">${pe.cumple_estandar_area ? '✅ &lt; 4h' : '⚠️ &gt; 4h'} al techo resolutivo</span></div>
          </div>
          <div class="georis-popup-footer">
            <button onclick="window.app.trazarReferenciaHaciaHospital('${pe.cod_renipress}')" class="btn-mini btn-precita">Trazar Referencia y Medir</button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, GEORIS_POPUP_CONFIG);
      this.layers.puertaEntrada.addLayer(marker);
    });
  }

  /**
   * Dibuja la red completa de líneas de referencia geodésica hacia el Hospital de Huarmey
   */
  renderLineasDeReferencia() {
    this.layers.referenciasLines.clearLayers();
    const network = window.GeorisTerritory.getHuarmeyNetwork();
    const hospCoords = [network.hospital.lat, network.hospital.lng];

    network.puertas.forEach(pe => {
      const peCoords = [pe.lat, pe.lng];
      const line = L.polyline([peCoords, hospCoords], {
        renderer: this.canvasRenderer,
        color: "#0284c7",
        weight: 1.8,
        opacity: 0.65,
        dashArray: "4, 6"
      });

      line.bindTooltip(`<b>${pe.nombre}</b> ➔ Hosp. Huarmey (II-1)<br>Distancia en línea recta: <b>${pe.distancia_hospital_km} km</b> | Tiempo estimado: <b>${pe.tiempo_traslado_txt}</b>`, {
        permanent: false,
        direction: 'center',
        className: 'georis-tooltip'
      });

      this.layers.referenciasLines.addLayer(line);
    });
  }

  /**
   * Traza y destaca la ruta de referencia de un establecimiento específico hacia el Hospital
   */
  resaltarReferencia(pe, hosp) {
    this.layers.activeHighlight.clearLayers();

    const peCoords = [pe.lat, pe.lng];
    const hospCoords = [hosp.lat, hosp.lng];

    const activeLine = L.polyline([peCoords, hospCoords], {
      color: "#dc2626",
      weight: 4,
      opacity: 0.9,
      dashArray: "6, 6"
    });

    const originPulse = L.circleMarker(peCoords, {
      radius: 13,
      fillColor: "#0284c7",
      color: "#ffffff",
      weight: 3,
      fillOpacity: 0.9
    });

    const destPulse = L.circleMarker(hospCoords, {
      radius: 16,
      fillColor: "#FB7185",
      color: "#FFFFFF",
      weight: 4,
      fillOpacity: 1
    });

    this.layers.activeHighlight.addLayer(activeLine);
    this.layers.activeHighlight.addLayer(originPulse);
    this.layers.activeHighlight.addLayer(destPulse);

    const bounds = L.latLngBounds([peCoords, hospCoords]);
    this.map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
  }

  /**
   * Control del mapa con el resumen de ubicación (G-04): cuántos pacientes del filtro están en el mapa,
   * cuántos con ubicación aproximada y cuántos SIN UBICAR (no aparecen como pin).
   */
  actualizarResumenGeo(patients) {
    if (!this.map || typeof L === 'undefined') return;
    let enMapa = 0, aprox = 0, sinUbicar = 0;
    for (const p of patients || []) {
      const tiene = p.latitud !== null && p.latitud !== undefined && p.longitud !== null && p.longitud !== undefined;
      if (!tiene) { sinUbicar++; continue; }
      enMapa++;
      if (esAproximada(p)) aprox++;
    }
    if (!this._geoResumenControl) {
      const Ctl = L.Control.extend({
        options: { position: 'bottomleft' },
        onAdd: () => {
          const div = L.DomUtil.create('div', 'geo-resumen-control');
          div.setAttribute('role', 'status');
          L.DomEvent.disableClickPropagation(div);
          return div;
        }
      });
      this._geoResumenControl = new Ctl();
      this._geoResumenControl.addTo(this.map);
    }
    const el = this._geoResumenControl.getContainer();
    if (!el) return;
    el.innerHTML = `📍 <b>${enMapa}</b> en el mapa` +
      (aprox ? ` · <b>${aprox}</b> aproximados <span title="Ubicados por dirección: cuadra, calle, sector o localidad. Borde discontinuo.">(borde discontinuo)</span>` : '') +
      `<br><span class="${sinUbicar ? 'geo-sin-ubicar' : ''}">⚠ ${sinUbicar} sin ubicar</span>` +
      (sinUbicar ? ' <span style="opacity:.8">(dirección no reconocida: no tienen pin)</span>' : '');
  }

  /**
   * Construye el HTML del popup bajo demanda (Lazy Evaluation al hacer clic)
   * Evita concatenar miles de strings HTML en cada cambio de filtro o búsqueda
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

    const iconPopFicha = window.AppIcons ? window.AppIcons.clipboardCheck(13, '#1E8E3E') : '';
    const iconPopWp = window.AppIcons ? window.AppIcons.whatsapp(13, '#25D366') : '';
    const iconPopUser = window.AppIcons ? window.AppIcons.users(14, '#ffffff') : '';

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
          <div class="georis-popup-row"><span class="georis-popup-label">Sector Sanitario:</span><span class="georis-popup-val">${safeSec}${p.sector_georis && p.sector_georis !== p.sector_sanitario ? ` · GeoRIS ${escapeHtml(p.sector_georis)}` : ''}</span></div>
          <div class="georis-popup-row"><span class="georis-popup-label">Ubicación en el mapa:</span><span class="georis-popup-val" style="font-weight:700; color:${esAproximada(p) ? '#b45309' : '#047857'};">${escapeHtml(textoPrecisionGeo(p.precision_geo))}</span></div>
          ${p.geo_detalle ? `<div class="georis-popup-row"><span class="georis-popup-label">Detalle:</span><span class="georis-popup-val">${escapeHtml(p.geo_detalle)}</span></div>` : ''}
          <div class="georis-popup-row"><span class="georis-popup-label">IPRESS Adscrita:</span><span class="georis-popup-val" style="font-weight:700; color:#0369a1;">${safePuerta}</span></div>
          <div class="georis-popup-row"><span class="georis-popup-label">Meta Vía Clínica HEARTS:</span><span class="georis-popup-val" style="color:${color}; font-weight:bold;">${safeCtrl}${p.frecuencia_hearts ? ` (Cada ${p.frecuencia_hearts}d)` : ''}</span></div>
        </div>
        <div class="georis-popup-footer">
          <button data-patient-action="detail" data-patient-id="${safeId}" class="btn-mini btn-precita">${iconPopFicha} Ficha HEARTS</button>
          <button data-patient-action="whatsapp" data-patient-id="${safeId}" class="btn-mini btn-whatsapp" ${hasPhone ? '' : 'disabled title="Sin celular registrado" aria-disabled="true"'}>${iconPopWp} WhatsApp</button>
        </div>
      </div>
    `;
  }

  /**
   * Renderiza los pacientes crónicos en el mapa con su semáforo de colores HEARTS
   * Soporta escalabilidad automática a Canvas GPU cuando la cohorte supera 1,500 pacientes
   */
  renderPatients(patients) {
    this.layers.pacientes.clearLayers();
    this.actualizarResumenGeo(patients);
    const useHighDensityCanvas = patients.length > ((window.APP_CONFIG && window.APP_CONFIG.MAP_PERFORMANCE && window.APP_CONFIG.MAP_PERFORMANCE.CANVAS_THRESHOLD) || 1500);

    patients.forEach(p => {
      if (p.latitud === null || p.latitud === undefined || p.longitud === null || p.longitud === undefined) return;

      let color = '#16A34A'; // Verde menta pastel (vigente)
      let semaforoClass = 'patient-green';

      const isPurple = (p.semaforo === 'purple' || p.fuente === 'HOSIX');
      const isRed = (p.semaforo === 'rojo' || p.semaforo === 'red');

      if (isPurple) {
        color = '#7C3AED'; // Lavanda pastel para HOSIX Brecha
        semaforoClass = 'patient-purple';
      } else if (p.semaforo === 'amarillo' || p.semaforo === 'yellow') {
        color = '#D97706'; // Mantequilla / Ámbar pastel
        semaforoClass = 'patient-yellow';
      } else if (isRed) {
        color = '#DC2626'; // Rosa / Coral pastel suave
        semaforoClass = 'patient-red';
      } else if (p.semaforo === 'black' || p.fallecido) {
        color = '#475569'; // Pizarra suave
        semaforoClass = 'patient-black';
      } else if (p.semaforo === 'gray') {
        color = '#64748B'; // Gris pastel
        semaforoClass = 'patient-gray';
      }

      let marker;
      const aprox = esAproximada(p);
      if (useHighDensityCanvas) {
        marker = L.circleMarker([p.latitud, p.longitud], {
          renderer: this.canvasRenderer,
          radius: isRed || isPurple ? 7 : 6,
          fillColor: color,
          color: '#ffffff',
          weight: 1.5,
          dashArray: aprox ? '3, 3' : null,
          fillOpacity: aprox ? 0.75 : 0.92
        });
      } else {
        const patientIcon = L.divIcon({
          className: 'custom-map-pin',
          html: `
            <div class="pin-patient-container ${semaforoClass}${aprox ? ' pin-aprox' : ''}">
              <div class="pin-patient-avatar" style="background:${color};">
                <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              </div>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
          popupAnchor: [0, -12]
        });

        marker = L.marker([p.latitud, p.longitud], {
          icon: patientIcon,
          zIndexOffset: isPurple ? 300 : (isRed ? 200 : 100)
        });
      }

      const paPopTxt = (p.pa_sistolica != null && p.pa_diastolica != null) ? `${p.pa_sistolica}/${p.pa_diastolica} mmHg` : '—';
      const gluOnlyTxt = (p.glucosa != null && p.glucosa !== '') ? `${p.glucosa} mg/dL` : '—';
      const a1cOnlyTxt = p.hba1c_texto || (p.hba1c != null && p.hba1c !== '' ? `${p.hba1c}%` : '—');

      marker.bindTooltip(`
        <div style="font-weight:700; font-size:var(--font-sm); color:#ffffff;">${escapeHtml(p.apellidos_nombres)}</div>
        <div style="font-size:var(--font-xs); color:#cbd5e1;">DNI: <b>${escapeHtml(p.dni || '—')}</b> • HC: <b>${escapeHtml(p.historia_clinica || '—')}</b> • Seg: <b>${escapeHtml(p.financiador || 'SIS')}</b></div>
        <div style="font-size:var(--font-xs); color:#e2e8f0; margin-top:2px;">Diag: <b>${(p.diagnosticos || []).join(', ')}</b> | PA: <b>${paPopTxt}</b> | Glu: <b>${gluOnlyTxt}</b> | HbA1c: <b>${a1cOnlyTxt}</b></div>
        <div style="font-size:var(--font-xs); color:#38bdf8;">${escapeHtml(p.puerta_entrada || '')} (${escapeHtml(p.sector_sanitario || '')})</div>
        <div style="font-size:var(--font-xs); color:${aprox ? '#fcd34d' : '#86efac'};">Ubicación: ${escapeHtml(textoPrecisionGeo(p.precision_geo))}</div>
      `, {
        direction: 'top',
        offset: [0, -14],
        className: 'georis-tooltip',
        opacity: 0.98
      });

      marker.bindPopup(() => this.buildPatientPopupHtml(p, color, isPurple), GEORIS_POPUP_CONFIG);
      this.layers.pacientes.addLayer(marker);
    });
  }

  // --- Navegación y Filtros Jerárquicos GeoRIS ---
  flyToRis(idRis) {
    this.currentRisId = idRis;
    this.renderRisLayer(idRis);
    this.renderZonasLayer(idRis, 'ALL');

    if (idRis === 'ALL') {
      this.map.setView([-9.50, -77.80], 8);
      return;
    }

    const numericId = parseInt(idRis, 10);
    const risFeature = window.GeorisTerritory.bundle.ris.features.find(f => f.properties.id_ris === numericId);
    if (risFeature) {
      const geoLayer = L.geoJSON(risFeature);
      this.map.fitBounds(geoLayer.getBounds(), { padding: [30, 30] });
    }
  }

  flyToZona(idZona) {
    this.currentZonaId = idZona;
    this.renderZonasLayer(this.currentRisId, idZona);
    this.renderSectoresLayer(idZona);

    if (idZona === 'ALL') {
      this.flyToRis(this.currentRisId);
      return;
    }

    const numericId = parseInt(idZona, 10);
    const zonaFeature = window.GeorisTerritory.bundle.zonas.features.find(f => 
      f.properties.id_ris === parseInt(this.currentRisId, 10) && f.properties.id_zona === numericId
    );

    if (zonaFeature) {
      const geoLayer = L.geoJSON(zonaFeature);
      this.map.fitBounds(geoLayer.getBounds(), { padding: [40, 40] });
    }
  }

  zoomIn() { this.map.zoomIn(); }
  zoomOut() { this.map.zoomOut(); }
  home() { this.map.setView([-10.04780, -78.15480], 15); }

  toggleMeasurement() {
    this.measuring = !this.measuring;
    if (!this.measuring) {
      if (this.measurePolyline) {
        this.map.removeLayer(this.measurePolyline);
        this.measurePolyline = null;
      }
      this.measurePoints = [];
      if (window.app && window.app.showToast) {
        window.app.showToast("Herramienta de medición desactivada", "info");
      }
    } else {
      if (window.app && window.app.showToast) {
        window.app.showToast("Haga clic en 2 o más puntos del mapa para medir distancia y tiempo de ambulancia", "info");
      }
    }
    return this.measuring;
  }

  addMeasurePoint(latlng) {
    this.measurePoints.push(latlng);
    if (!this.measurePolyline) {
      this.measurePolyline = L.polyline(this.measurePoints, { color: '#0284C7', weight: 3, dashArray: '6, 6' }).addTo(this.map);
    } else {
      this.measurePolyline.setLatLngs(this.measurePoints);
    }

    if (this.measurePoints.length >= 2) {
      let totalDist = 0;
      for (let i = 0; i < this.measurePoints.length - 1; i++) {
        totalDist += this.measurePoints[i].distanceTo(this.measurePoints[i+1]);
      }
      const distKm = (totalDist / 1000).toFixed(2);
      const min = Math.round((distKm * 1.35 / 45) * 60);

      if (window.app && window.app.showToast) {
        window.app.showToast(`📏 Distancia en línea recta: ${distKm} km | ⏱️ Tiempo estimado (línea recta × 1,35 a 45 km/h, no es una ruta): ~${min} min`, "info", 7000);
      }
    }
  }

  flyTo(lat, lng, zoom = 15) {
    this.map.flyTo([lat, lng], zoom, { duration: 1.0 });
  }

  /**
   * Cambio Instantáneo de Mapa Base sin alterar capas vectoriales
   */
  setBaseMap(type) {
    const nextLayer = this.baseLayers[type];
    if (!nextLayer) return;

    Object.values(this.baseLayers).forEach(layer => {
      if (layer && layer !== nextLayer) {
        try {
          if (this.map.hasLayer(layer)) {
            this.map.removeLayer(layer);
          }
          if (layer.eachLayer) {
            layer.eachLayer(child => {
              if (this.map.hasLayer(child)) {
                this.map.removeLayer(child);
              }
            });
          }
        } catch (e) {}
      }
    });

    if (!this.map.hasLayer(nextLayer)) {
      nextLayer.addTo(this.map);
    }
    if (nextLayer.bringToBack) {
      nextLayer.bringToBack();
    }
    this.currentBaseLayer = nextLayer;

    // Ajustar fondo del contenedor y contraste del catastro según el modo elegido
    const mapContainer = document.getElementById(this.containerId);
    const isDark = (type === "Modo Noche / Oscuro");
    const isSat = (type === "Esri Satelital Híbrido");

    if (mapContainer) {
      mapContainer.style.background = isDark ? '#0b1120' : (isSat ? '#1e293b' : '#e5e7eb');
    }

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

    // Asegurarse de que el orden de capas vectoriales se mantenga al frente
    if (this.layers.limiteRis) this.layers.limiteRis.bringToFront();
    if (this.layers.zonasSanitarias) this.layers.zonasSanitarias.bringToFront();
    if (this.layers.sectoresSanitarios) this.layers.sectoresSanitarios.bringToFront();
    if (this.layers.catastroUrbano) this.layers.catastroUrbano.bringToFront();
    if (this.layers.referenciasLines) this.layers.referenciasLines.bringToFront();
    if (this.layers.puertaEntrada) this.layers.puertaEntrada.bringToFront();
    if (this.layers.zonaSanitaria) this.layers.zonaSanitaria.bringToFront();
    if (this.layers.areaSanitaria) this.layers.areaSanitaria.bringToFront();
    if (this.layers.pacientes) this.layers.pacientes.bringToFront();
  }

  /**
   * Muestra un pin destacado temporal para búsquedas toponímicas
   */
  mostrarPinBusqueda(lat, lng, label) {
    if (this.searchPin) {
      this.map.removeLayer(this.searchPin);
      this.searchPin = null;
    }

    const pinIcon = L.divIcon({
      className: 'custom-map-pin',
      html: `
        <div style="background:#FFFFFF; color:#0F172A; padding:6px 14px; border-radius:14px; font-size:var(--font-xs); font-weight:800; box-shadow:0 3px 12px rgba(15,23,42,0.15); border:2px solid #BAE6FD; display:flex; align-items:center; gap:6px; white-space:nowrap;">
          <span>📍</span> <span>${label}</span>
        </div>
      `,
      iconSize: [160, 32],
      iconAnchor: [80, 16]
    });

    this.searchPin = L.marker([lat, lng], { icon: pinIcon }).addTo(this.map);

    setTimeout(() => {
      if (this.searchPin) {
        this.map.removeLayer(this.searchPin);
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
}
