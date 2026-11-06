/**
 * revisarUbicacionModal.js
 * Panel «Revisar ubicaciones» (G-06): lista de pacientes SIN UBICAR o con ubicación APROXIMADA
 * (sector, localidad o calle sin número) para corregirlos en el mapa, sin volver a cargar el Excel.
 * Se abre desde el contador del mapa y, automáticamente, después de cargar un padrón con pendientes.
 * Guarda con PUT /api/patients/:id/ubicacion (queda «exacta», con quién y cuándo).
 */
(function (root) {
  const PENDIENTES = ['sin_ubicacion', 'localidad', 'sector', 'calle'];
  const ETIQUETA = {
    sin_ubicacion: 'Sin ubicar', localidad: 'Centro de la localidad', sector: 'Centro del sector', calle: 'Sobre la calle (sin número)'
  };
  const esc = (t) => String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function precisionDe(p) {
    const tiene = p.latitud !== null && p.latitud !== undefined && p.longitud !== null && p.longitud !== undefined;
    if (!tiene) return 'sin_ubicacion';
    return p.precision_geo || 'origen';
  }

  class RevisarUbicacionModal {
    constructor() {
      this.el = null;
      this.picker = null;
      this.filtro = 'sin_ubicacion';
      this.actual = null;
      this.hechos = new Set();
    }

    pendientes() {
      const list = (root.app && Array.isArray(root.app.patients)) ? root.app.patients : [];
      return list.filter(p => PENDIENTES.includes(precisionDe(p)) || this.hechos.has(String(p.id)));
    }

    conteo() {
      const c = { sin_ubicacion: 0, aproximados: 0 };
      for (const p of this.pendientes()) {
        if (this.hechos.has(String(p.id))) continue;
        if (precisionDe(p) === 'sin_ubicacion') c.sin_ubicacion++; else c.aproximados++;
      }
      return c;
    }

    construir() {
      if (this.el) return;
      const el = document.createElement('div');
      el.id = 'modal-revisar-ubicacion';
      el.className = 'ubic-modal-overlay';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', 'Revisar ubicaciones de pacientes');
      el.innerHTML = `
        <div class="ubic-modal-box">
          <div class="ubic-modal-header">
            <div>
              <div class="ubic-modal-titulo">📍 Revisar ubicaciones</div>
              <div class="ubic-modal-sub">Pacientes que la dirección no permitió ubicar con precisión. Elija uno, arrastre el marcador a la vivienda (o use el GPS en la visita) y guarde.</div>
            </div>
            <button type="button" class="btn-close-accessible" data-accion="cerrar" aria-label="Cerrar">✕</button>
          </div>
          <div class="ubic-modal-filtros">
            <button type="button" class="ubic-filtro" data-filtro="sin_ubicacion"></button>
            <button type="button" class="ubic-filtro" data-filtro="aproximados"></button>
          </div>
          <div class="ubic-modal-cuerpo">
            <div class="ubic-lista" role="list"></div>
            <div class="ubic-detalle">
              <div class="ubic-detalle-info">Seleccione un paciente de la lista.</div>
              <div class="ubic-detalle-mapa"></div>
              <div class="ubic-detalle-acciones">
                <button type="button" class="btn-mini btn-precita" data-accion="guardar" disabled>Guardar ubicación</button>
                <span class="ubic-guardar-estado" aria-live="polite"></span>
              </div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(el);
      this.el = el;
      el.querySelector('[data-accion="cerrar"]').addEventListener('click', () => this.cerrar());
      el.addEventListener('click', e => { if (e.target === el) this.cerrar(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.el && this.el.classList.contains('active')) this.cerrar(); });
      el.querySelectorAll('.ubic-filtro').forEach(b => b.addEventListener('click', () => { this.filtro = b.dataset.filtro; this.pintarLista(); }));
      el.querySelector('.ubic-lista').addEventListener('click', e => {
        const item = e.target.closest('[data-id]');
        if (item) this.seleccionar(item.dataset.id);
      });
      el.querySelector('[data-accion="guardar"]').addEventListener('click', () => this.guardar());
    }

    abrir(filtro) {
      this.construir();
      if (filtro) this.filtro = filtro;
      const c = this.conteo();
      if (!filtro && c.sin_ubicacion === 0 && c.aproximados > 0) this.filtro = 'aproximados';
      this.el.classList.add('active');
      this.pintarLista();
    }

    cerrar() {
      if (!this.el) return;
      this.el.classList.remove('active');
      if (root.app && typeof root.app.render === 'function') root.app.render();
    }

    pintarLista() {
      const c = this.conteo();
      const bSin = this.el.querySelector('[data-filtro="sin_ubicacion"]');
      const bAprox = this.el.querySelector('[data-filtro="aproximados"]');
      bSin.textContent = `Sin ubicar (${c.sin_ubicacion})`;
      bAprox.textContent = `Aproximados (${c.aproximados})`;
      bSin.classList.toggle('activo', this.filtro === 'sin_ubicacion');
      bAprox.classList.toggle('activo', this.filtro === 'aproximados');
      const lista = this.pendientes().filter(p => {
        const pr = precisionDe(p);
        if (this.hechos.has(String(p.id))) return this.filtro === 'aproximados' || pr === 'sin_ubicacion';
        return this.filtro === 'sin_ubicacion' ? pr === 'sin_ubicacion' : pr !== 'sin_ubicacion';
      });
      const cont = this.el.querySelector('.ubic-lista');
      if (!lista.length) {
        cont.innerHTML = '<div class="ubic-vacio">✔ No hay pacientes pendientes en este grupo.</div>';
        return;
      }
      cont.innerHTML = lista.slice(0, 500).map(p => {
        const hecho = this.hechos.has(String(p.id));
        return `<div class="ubic-item${this.actual && String(this.actual.id) === String(p.id) ? ' sel' : ''}${hecho ? ' hecho' : ''}" role="listitem" tabindex="0" data-id="${esc(p.id)}">
          <div class="ubic-item-nombre">${hecho ? '✔ ' : ''}${esc(p.apellidos_nombres || 'Paciente')}</div>
          <div class="ubic-item-dir">${esc(p.direccion || 'Sin dirección')} · ${esc(p.sector || p.sector_sanitario || 'sin sector')}</div>
          <div class="ubic-item-prec">${hecho ? 'Ubicación confirmada' : esc(ETIQUETA[precisionDe(p)] || '')}</div>
        </div>`;
      }).join('') + (lista.length > 500 ? `<div class="ubic-vacio">Se muestran 500 de ${lista.length}.</div>` : '');
    }

    seleccionar(id) {
      const p = (root.app.patients || []).find(x => String(x.id) === String(id));
      if (!p) return;
      this.actual = p;
      this.pintarLista();
      const info = this.el.querySelector('.ubic-detalle-info');
      info.innerHTML = `<b>${esc(p.apellidos_nombres || '')}</b> · DNI ${esc(p.dni || '—')}<br>${esc(p.direccion || 'Sin dirección')} · ${esc(p.sector || p.sector_sanitario || 'sin sector')}`;
      const mapaCont = this.el.querySelector('.ubic-detalle-mapa');
      if (!this.picker) {
        this.picker = root.UbicacionPicker.crear(mapaCont, {
          onChange: v => { this.el.querySelector('[data-accion="guardar"]').disabled = !(v && v.manual); }
        });
      }
      this.picker.refrescar();
      this.el.querySelector('.ubic-guardar-estado').textContent = '';
      const geo = (root.AncashGeocoder && p.direccion) ? root.AncashGeocoder.resolverUbicacion({ direccion: p.direccion, sector: p.sector || p.sector_sanitario }) : null;
      const tiene = p.latitud !== null && p.latitud !== undefined;
      this.picker.setPuntoPorDireccion(tiene ? { lat: p.latitud, lng: p.longitud, precision_geo: p.precision_geo } : (geo && geo.matched ? geo : null), true);
      this.el.querySelector('[data-accion="guardar"]').disabled = true;
    }

    async guardar() {
      const v = this.picker && this.picker.getValor();
      const p = this.actual;
      if (!p || !v || !v.manual) return;
      const estado = this.el.querySelector('.ubic-guardar-estado');
      const btn = this.el.querySelector('[data-accion="guardar"]');
      btn.disabled = true;
      estado.textContent = 'Guardando…';
      try {
        const r = await root.app.session.authFetch(`/api/patients/${encodeURIComponent(p.id)}/ubicacion`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitud: v.lat, longitud: v.lng, geo_fuente: v.geo_fuente, geo_precision_m: v.geo_precision_m })
        });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || `código ${r.status}`);
        Object.assign(p, body.data, { latitud: body.data.latitud, longitud: body.data.longitud });
        this.hechos.add(String(p.id));
        estado.textContent = '✔ Guardado.';
        if (root.app && typeof root.app.setPatients === 'function') root.app.setPatients(root.app.patients);
        this.pintarLista();
      } catch (e) {
        estado.textContent = 'No se guardó: ' + e.message;
        btn.disabled = false;
      }
    }
  }

  root.RevisarUbicacionModal = new RevisarUbicacionModal();
})(typeof window !== 'undefined' ? window : this);
