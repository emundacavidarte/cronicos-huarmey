/**
 * ubicacionPicker.js
 * Mapa pequeño con un marcador ARRASTRABLE para confirmar o corregir en el momento la ubicación de la vivienda
 * (registro web y panel «Revisar ubicaciones»). Sin paquetes nuevos: usa Leaflet, ya cargado.
 *
 * - El marcador parte del punto que dio la dirección (aproximado). Arrastrarlo o hacer clic en el mapa
 *   lo fija como ubicación EXACTA confirmada a mano (geo_fuente 'mapa_manual').
 * - «Usar mi GPS» toma la posición del dispositivo (visita domiciliaria); requiere https o localhost.
 * - Toda coordenada se valida para Áncash antes de aceptarla.
 */
(function (root) {
  const CENTRO_HUARMEY = [-10.0689, -78.1524];
  const ZOOM_POR_PRECISION = { exacta: 18, origen: 17, cuadra: 18, calle: 17, sector: 16, localidad: 14 };

  function crear(container, opciones) {
    const opts = opciones || {};
    if (typeof L === 'undefined') throw new Error('Leaflet no está cargado');
    const geocoder = root.AncashGeocoder || null;

    const mapDiv = document.createElement('div');
    mapDiv.className = 'ubic-picker-map';
    const barra = document.createElement('div');
    barra.className = 'ubic-picker-barra';
    barra.innerHTML = `
      <button type="button" class="ubic-btn" data-accion="gps" title="Toma la posición del celular o la tablet (en la vivienda del paciente)">📡 Usar mi GPS</button>
      <button type="button" class="ubic-btn" data-accion="reset" title="Vuelve al punto calculado con la dirección">↺ Volver a la dirección</button>
      <span class="ubic-estado" aria-live="polite"></span>`;
    container.innerHTML = '';
    container.appendChild(mapDiv);
    container.appendChild(barra);
    const estadoEl = barra.querySelector('.ubic-estado');
    const btnReset = barra.querySelector('[data-accion="reset"]');

    const map = L.map(mapDiv, { zoomControl: true, attributionControl: false }).setView(CENTRO_HUARMEY, 15);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map);
    // Calles con nombre del catastro (el mismo índice que usa el geocodificador), para orientarse sin internet
    const idx = root.HUARMEY_CALLES_INDEX;
    if (idx && Array.isArray(idx.calles)) {
      for (const c of idx.calles) {
        L.polyline(c.tramos, { color: '#0284c7', weight: 2, opacity: 0.55, interactive: true }).bindTooltip(c.nombre, { sticky: true }).addTo(map);
      }
    }

    let marker = null;
    let base = null;   // punto por dirección { lat, lng, precision_geo }
    let actual = null; // { lat, lng, precision_geo, geo_fuente, geo_precision_m, manual }

    const setEstado = (txt, tipo) => {
      estadoEl.textContent = txt || '';
      estadoEl.className = 'ubic-estado' + (tipo ? ' ubic-' + tipo : '');
    };

    const notificar = () => { if (typeof opts.onChange === 'function') opts.onChange(actual ? { ...actual } : null); };

    function validar(lat, lng) {
      if (!geocoder) return { ok: true, lat, lng };
      return geocoder.validarCoordenadas(lat, lng);
    }

    function ponerMarcador(lat, lng) {
      if (!marker) {
        // Pin dibujado con CSS (la imagen por defecto de Leaflet no está en libs/)
        const icon = L.divIcon({ className: 'ubic-pin', html: '<div class="ubic-pin-cabeza"></div><div class="ubic-pin-punta"></div>', iconSize: [28, 38], iconAnchor: [14, 38] });
        marker = L.marker([lat, lng], { icon, draggable: true, autoPan: true, title: 'Arrastre a la vivienda del paciente', keyboard: true }).addTo(map);
        marker.on('dragend', () => {
          const p = marker.getLatLng();
          fijarManual(p.lat, p.lng, 'mapa_manual', null);
        });
      } else {
        marker.setLatLng([lat, lng]);
      }
    }

    function fijarManual(lat, lng, fuente, precisionM) {
      const v = validar(lat, lng);
      if (!v.ok) {
        setEstado('Ese punto está fuera de Áncash: no se acepta.', 'error');
        if (actual) ponerMarcador(actual.lat, actual.lng);
        return;
      }
      actual = {
        lat: +Number(v.lat).toFixed(6), lng: +Number(v.lng).toFixed(6),
        precision_geo: 'exacta', geo_fuente: fuente, geo_precision_m: precisionM, manual: true
      };
      ponerMarcador(actual.lat, actual.lng);
      btnReset.disabled = !base;
      setEstado(fuente === 'gps_dispositivo'
        ? `✔ Ubicación tomada con GPS${precisionM ? ` (±${Math.round(precisionM)} m)` : ''}.`
        : '✔ Ubicación confirmada en el mapa.', 'ok');
      notificar();
    }

    map.on('click', e => fijarManual(e.latlng.lat, e.latlng.lng, 'mapa_manual', null));

    barra.querySelector('[data-accion="gps"]').addEventListener('click', () => {
      if (!navigator.geolocation) { setEstado('Este dispositivo no ofrece GPS al navegador.', 'error'); return; }
      setEstado('Buscando la señal GPS…');
      navigator.geolocation.getCurrentPosition(pos => {
        const { latitude, longitude, accuracy } = pos.coords;
        fijarManual(latitude, longitude, 'gps_dispositivo', accuracy);
        map.setView([latitude, longitude], 18);
        if (accuracy > 50) setEstado(`GPS con poca precisión (±${Math.round(accuracy)} m): arrastre el marcador a la vivienda si hace falta.`, 'aviso');
      }, err => {
        setEstado(err && err.code === 1 ? 'Permiso de ubicación denegado en el navegador.' : 'No se pudo obtener el GPS (requiere https o localhost y señal).', 'error');
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });

    btnReset.addEventListener('click', () => {
      if (!base) return;
      actual = { ...base, manual: false };
      ponerMarcador(base.lat, base.lng);
      map.setView([base.lat, base.lng], ZOOM_POR_PRECISION[base.precision_geo] || 16);
      setEstado('Punto calculado con la dirección (aproximado). Arrástrelo a la vivienda si conoce el lugar.');
      notificar();
    });

    return {
      map,
      /** Punto calculado con la dirección. Si ya hay uno confirmado a mano, no lo mueve (salvo forzar). */
      setPuntoPorDireccion(geo, forzar) {
        if (geo && geo.lat !== null && geo.lat !== undefined) {
          base = { lat: geo.lat, lng: geo.lng, precision_geo: geo.precision_geo, geo_fuente: geo.geo_fuente || 'geocodificador' };
        } else {
          base = null;
        }
        btnReset.disabled = !base;
        if (actual && actual.manual && !forzar) return;
        if (base) {
          actual = { ...base, manual: false };
          ponerMarcador(base.lat, base.lng);
          map.setView([base.lat, base.lng], ZOOM_POR_PRECISION[base.precision_geo] || 16);
          setEstado('Punto calculado con la dirección (aproximado). Arrástrelo a la vivienda si conoce el lugar.');
        } else {
          actual = null;
          if (marker) { map.removeLayer(marker); marker = null; }
          map.setView(opts.centro || CENTRO_HUARMEY, 15);
          setEstado('La dirección no se ubicó: haga clic en el mapa sobre la vivienda (o use el GPS) para marcarla.', 'aviso');
        }
        notificar();
      },
      /** Ubicación ya confirmada antes (exacta o del origen): se muestra como fija */
      setConfirmada(p) {
        actual = { lat: p.lat, lng: p.lng, precision_geo: p.precision_geo || 'exacta', geo_fuente: p.geo_fuente || 'mapa_manual', geo_precision_m: p.geo_precision_m || null, manual: true, preexistente: true };
        ponerMarcador(p.lat, p.lng);
        map.setView([p.lat, p.lng], 18);
        setEstado('Ubicación ya confirmada anteriormente. Puede moverla si cambió.', 'ok');
        notificar();
      },
      getValor() { return actual ? { ...actual } : null; },
      refrescar() { setTimeout(() => map.invalidateSize(), 60); },
      destruir() { map.remove(); container.innerHTML = ''; }
    };
  }

  root.UbicacionPicker = { crear };
})(typeof window !== 'undefined' ? window : this);
