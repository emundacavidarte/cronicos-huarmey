#!/usr/bin/env node
/**
 * comparar_georis_oficial.js
 * Descarga las capas OFICIALES de GeoRIS (MINSA) para Áncash, las compara con el bundle del prototipo
 * (client/data/georis/georisDataBundle.js) y escribe un informe. Con --actualizar reemplaza en el bundle las capas
 * oficiales que pasen las comprobaciones (con copia de seguridad) y actualiza la versión en index.html y sw.js.
 *
 * Debe ejecutarse desde una conexión normal (por ejemplo la PC de la oficina): el servidor del MINSA está detrás de
 * Cloudflare y rechaza las conexiones que salen de servidores en la nube. Si Cloudflare la rechaza, la herramienta lo
 * dice y se detiene; NO intenta evadirlo.
 *
 * Uso (desde la carpeta del proyecto):
 *   node tools/comparar_georis_oficial.js                compara y escribe docs/COMPARACION_GEORIS_OFICIAL.md
 *   node tools/comparar_georis_oficial.js --actualizar   además actualiza el bundle con las capas oficiales
 * Opciones:
 *   --base=URL          servidor ArcGIS (por defecto https://geominsa.minsa.gob.pe/geominsaserver)
 *   --servicio=RUTA     servicio a usar (p. ej. Hosted/RIS_PERU_FINAL_gdb/FeatureServer); por defecto se prueban los conocidos
 *   --desde=CARPETA     no descarga: lee los GeoJSON guardados antes (ris.geojson, zonas.geojson, sectores.geojson, eessArea.geojson…)
 *   --guardar=CARPETA   dónde guardar lo descargado (por defecto georis_oficial/)
 *   --informe=RUTA      dónde escribir el informe (por defecto docs/COMPARACION_GEORIS_OFICIAL.md)
 *   --bundle=RUTA       bundle a comparar/actualizar (por defecto client/data/georis/georisDataBundle.js)
 * Salida: 0 sin diferencias, 1 con diferencias, 2 error (sin acceso, servicio no encontrado, etc.).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ARGS = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));

const BASE = String(ARGS.base || 'https://geominsa.minsa.gob.pe/geominsaserver').replace(/\/+$/, '');
const BUNDLE_PATH = path.resolve(ROOT, ARGS.bundle || 'client/data/georis/georisDataBundle.js');
const INFORME_PATH = path.resolve(ROOT, ARGS.informe || 'docs/COMPARACION_GEORIS_OFICIAL.md');
const GUARDAR_DIR = path.resolve(ROOT, ARGS.guardar || 'georis_oficial');
const AGENTE = 'cronicos-huarmey-comparador-georis/1.0 (MAXIME, verificacion de capas)';

// Áncash con margen (también alcanza a Barranca, hospital de la RIS Huaylas Sur 2)
const BBOX_ANCASH = '-78.95,-11.10,-76.60,-7.70';
const RIS_ANCASH = new Set([69, 87, 101, 104, 111, 156, 157]);

// Servicios conocidos. El primero es el origen del bundle (mismo esquema de campos).
const SERVICIOS = [
  'Hosted/RIS_PERU_FINAL_gdb/FeatureServer',
  'SRV_APP_DGAIN_DIPOS/SRV_DGAIN_DIPOS_Poligonos_Sanitarios_RIS_CONFORMADA/MapServer'
];

// Capa del bundle ← nombre de la capa en el servicio oficial
const CAPAS = [
  { clave: 'ris', tipo: 'poligono', nombre: /^(RIS_TOTAL|RIS|AREA[_ ]?SANITARIA|AREAS?[_ ]?SANITARIAS?)$/i },
  { clave: 'zonas', tipo: 'poligono', nombre: /^(ZONAS?_TOTAL|ZONAS?[_ ]?SANITARIAS?)$/i },
  { clave: 'sectores', tipo: 'poligono', nombre: /^(SECTOR(ES)?_TOTAL|SECTOR(ES)?[_ ]?SANITARIOS?)$/i },
  { clave: 'eessArea', tipo: 'punto', nombre: /^P_AREA(_TOTAL)?$/i },
  { clave: 'eessZona', tipo: 'punto', nombre: /^P_REF(_TOTAL)?$/i },
  { clave: 'eessPuertas', tipo: 'punto', nombre: /^P_ENT(_TOTAL)?$/i },
  { clave: 'eessVinculados', tipo: 'punto', nombre: /^P_VIN(_TOTAL)?$/i }
];

// Campos que la aplicación necesita en cada capa (sin ellos no se actualiza esa capa)
const CAMPOS_REQUERIDOS = {
  ris: ['id_ris', 'ris', 'pob_t', 'n_zona', 'n_sec'],
  zonas: ['id_ris', 'id_zona', 'ipress', 'cod_reni', 'pob_t', 'n_sec'],
  sectores: ['id_ris', 'id_zona', 'id_sector', 'ipress', 'cod_reni', 'pob_t'],
  eessArea: ['cod_reni', 'ipress', 'id_ris'],
  eessZona: ['cod_reni', 'ipress', 'id_ris', 'id_zona'],
  eessPuertas: ['cod_reni', 'ipress', 'id_ris', 'id_zona'],
  eessVinculados: ['cod_reni', 'ipress', 'id_ris', 'id_zona']
};

// Atributos que se comparan
const CAMPOS_COMPARAR = {
  ris: ['ris', 'pob_t', 'n_viv', 'n_fam', 'n_zona', 'n_sec', 'hospital'],
  zonas: ['ipress', 'cod_reni', 'categoria', 'pob_t', 'n_viv', 'n_fam', 'n_sec', 'distrito'],
  sectores: ['id_zona', 'ipress', 'cod_reni', 'pob_t', 'n_viv', 'n_fam', 'distrito'],
  eessArea: ['ipress', 'categoria', 'id_ris', 'id_zona', 'estado'],
  eessZona: ['ipress', 'categoria', 'id_ris', 'id_zona', 'cod_hos', 'estado'],
  eessPuertas: ['ipress', 'categoria', 'id_ris', 'id_zona', 'cod_hos', 'sec_asig', 'estado'],
  eessVinculados: ['ipress', 'categoria', 'id_ris', 'id_zona', 'cod_hos', 'vincu_a', 'cod_p_en', 'estado']
};

const claveDe = {
  ris: p => p.id_ris !== undefined ? String(p.id_ris) : null,
  zonas: p => (p.id_ris !== undefined && p.id_zona !== undefined) ? `${p.id_ris}:${p.id_zona}` : null,
  sectores: p => (p.id_ris !== undefined && p.id_sector !== undefined) ? `${p.id_ris}:${p.id_sector}` : null,
  eess: p => p.cod_reni ? String(p.cod_reni).trim().padStart(8, '0') : null
};
const claveCapa = clave => claveDe[clave] || claveDe.eess;

class SinAcceso extends Error {}

// ---------------------------------------------------------------------------------------------------------------
// Descarga (ArcGIS REST)
// ---------------------------------------------------------------------------------------------------------------
const esperar = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url, intentos = 3) {
  if (typeof fetch !== 'function') throw new Error('Esta herramienta necesita Node.js 18 o superior (fetch).');
  let ultimo;
  for (let i = 0; i < intentos; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': AGENTE, Accept: 'application/json' } });
      const texto = await res.text();
      if (/cloudflare/i.test(texto) && /<html/i.test(texto)) {
        throw new SinAcceso('El servidor del MINSA (Cloudflare) rechazó la conexión desde este equipo. '
          + 'Ejecute la herramienta desde una conexión normal (por ejemplo la PC de la oficina, donde el visor GeoRIS abre en el navegador). '
          + 'Si también se rechaza allí, descargue las capas desde el portal GeoRIS y use --desde=<carpeta>.');
      }
      let json;
      try { json = JSON.parse(texto); } catch (e) { throw new Error(`Respuesta no JSON (${res.status}) de ${url}`); }
      if (json && json.error) throw new Error(`ArcGIS respondió error ${json.error.code}: ${json.error.message} (${url})`);
      return json;
    } catch (e) {
      if (e instanceof SinAcceso) throw e;
      ultimo = e;
      await esperar(800 * (i + 1));
    }
  }
  throw ultimo;
}

const qs = o => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

function areaFirmada(anillo) {
  let a = 0;
  // Σ (x2 − x1)(y2 + y1) sobre cada lado (de j a i): positivo = sentido horario (anillo exterior en Esri)
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) a += (anillo[i][0] - anillo[j][0]) * (anillo[i][1] + anillo[j][1]);
  return a / 2;
}

function enAnillo(x, y, r) {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins;
  }
  return ins;
}

/** Geometría Esri JSON → GeoJSON (anillos exteriores en sentido horario; huecos antihorarios). */
function esriAGeojson(g) {
  if (!g) return null;
  if (typeof g.x === 'number' && typeof g.y === 'number') return { type: 'Point', coordinates: [g.x, g.y] };
  if (!Array.isArray(g.rings)) return null;
  const anillos = g.rings.filter(r => Array.isArray(r) && r.length >= 4);
  let exteriores = anillos.filter(r => areaFirmada(r) > 0);
  let huecos = anillos.filter(r => areaFirmada(r) <= 0);
  if (exteriores.length === 0) { exteriores = huecos; huecos = []; } // orientación invertida en el origen
  const poligonos = exteriores.map(e => [e]);
  for (const h of huecos) {
    const dueno = poligonos.find(p => enAnillo(h[0][0], h[0][1], p[0]));
    if (dueno) dueno.push(h);
  }
  if (poligonos.length === 0) return null;
  return poligonos.length === 1 ? { type: 'Polygon', coordinates: poligonos[0] } : { type: 'MultiPolygon', coordinates: poligonos };
}

/** Nombres de campo en minúsculas (como el bundle), salvo SHAPE__Area / SHAPE__Length. */
function normalizarAtributos(a) {
  const out = {};
  for (const [k, v] of Object.entries(a || {})) {
    const kl = k.toLowerCase();
    if (kl === 'shape__area' || kl === 'shape.starea()' || kl === 'shape_area') out.SHAPE__Area = v;
    else if (kl === 'shape__length' || kl === 'shape.stlength()' || kl === 'shape_length') out.SHAPE__Length = v;
    else out[kl] = v;
  }
  if (out.departamento !== undefined && out.departamen === undefined) out.departamen = out.departamento;
  return out;
}

async function descargarCapa(urlCapa, info) {
  const oid = info.objectIdField || ((info.fields || []).find(f => f.type === 'esriFieldTypeOID') || {}).name || 'objectid';
  const ids = await getJson(`${urlCapa}/query?${qs({ where: '1=1', geometry: BBOX_ANCASH, geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', returnIdsOnly: 'true', f: 'json' })}`);
  const lista = (ids.objectIds || []).slice().sort((a, b) => a - b);
  const lote = Math.max(1, Math.min(Number(info.maxRecordCount) || 1000, 250));
  const features = [];
  for (let i = 0; i < lista.length; i += lote) {
    const parte = lista.slice(i, i + lote);
    const r = await getJson(`${urlCapa}/query?${qs({ objectIds: parte.join(','), outFields: '*', returnGeometry: 'true', outSR: 4326, geometryPrecision: 6, f: 'json' })}`);
    for (const f of (r.features || [])) {
      const geometry = esriAGeojson(f.geometry);
      if (!geometry) continue;
      features.push({ type: 'Feature', properties: normalizarAtributos(f.attributes), geometry });
    }
    process.stdout.write(`\r    ${features.length}/${lista.length} elementos`);
  }
  process.stdout.write('\n');
  if (features.length < lista.length) console.log(`    Aviso: ${lista.length - features.length} elementos sin geometría válida.`);
  return { type: 'FeatureCollection', features };
}

async function descargarOficial() {
  const servicios = ARGS.servicio ? [String(ARGS.servicio)] : SERVICIOS;
  const capas = {};
  const fuentes = {};
  for (const servicio of servicios) {
    const url = `${BASE}/rest/services/${servicio}`;
    let meta;
    try {
      meta = await getJson(`${url}?f=json`);
    } catch (e) {
      if (e instanceof SinAcceso) throw e;
      console.log(`  · ${servicio}: no disponible (${e.message})`);
      continue;
    }
    const capasServicio = [...(meta.layers || []), ...(meta.tables || [])];
    console.log(`  · ${servicio}: ${capasServicio.length} capas (${capasServicio.map(c => c.name).join(', ')})`);
    for (const def of CAPAS) {
      if (capas[def.clave]) continue;
      const c = capasServicio.find(x => def.nombre.test(String(x.name).trim()));
      if (!c) continue;
      const urlCapa = `${url}/${c.id}`;
      const info = await getJson(`${urlCapa}?f=json`);
      const esPoligono = /polygon/i.test(info.geometryType || '');
      if ((def.tipo === 'poligono') !== esPoligono) continue;
      console.log(`  ↓ ${def.clave} ← ${c.name}`);
      capas[def.clave] = await descargarCapa(urlCapa, info);
      fuentes[def.clave] = urlCapa;
    }
  }
  return { capas, fuentes };
}

function leerDesde(dir) {
  const capas = {};
  const fuentes = {};
  for (const def of CAPAS) {
    const f = path.join(dir, `${def.clave}.geojson`);
    if (!fs.existsSync(f)) continue;
    const fc = JSON.parse(fs.readFileSync(f, 'utf8'));
    capas[def.clave] = { type: 'FeatureCollection', features: (fc.features || []).map(x => ({ ...x, properties: normalizarAtributos(x.properties) })) };
    fuentes[def.clave] = f;
  }
  return { capas, fuentes };
}

// ---------------------------------------------------------------------------------------------------------------
// Comparación
// ---------------------------------------------------------------------------------------------------------------
function leerBundle(p) {
  const sandbox = { window: {} };
  const codigo = fs.readFileSync(p, 'utf8');
  new Function('window', codigo)(sandbox.window);
  if (!sandbox.window.GEORIS_DATA_BUNDLE) throw new Error(`${p} no define window.GEORIS_DATA_BUNDLE`);
  return sandbox.window.GEORIS_DATA_BUNDLE;
}

const polys = g => g && g.type === 'Polygon' ? [g.coordinates] : g && g.type === 'MultiPolygon' ? g.coordinates : [];
const enGeom = (x, y, g) => polys(g).some(p => enAnillo(x, y, p[0]) && !p.slice(1).some(h => enAnillo(x, y, h)));
function caja(g) {
  let a = [Infinity, Infinity, -Infinity, -Infinity];
  polys(g).forEach(p => p[0].forEach(q => { a = [Math.min(a[0], q[0]), Math.min(a[1], q[1]), Math.max(a[2], q[0]), Math.max(a[3], q[1])]; }));
  return a;
}
function areaM2(g) {
  let total = 0;
  for (const p of polys(g)) {
    const lat0 = p[0][0][1] * Math.PI / 180;
    const kx = Math.cos(lat0) * 111320, ky = 110574;
    p.forEach((r, i) => { const a = Math.abs(areaFirmada(r.map(q => [q[0] * kx, q[1] * ky]))); total += i === 0 ? a : -a; });
  }
  return total;
}
/** Intersección sobre unión estimada con una malla de puntos (1 = idénticos). */
function iou(a, b, n = 40) {
  const ca = caja(a), cb = caja(b);
  const x0 = Math.min(ca[0], cb[0]), y0 = Math.min(ca[1], cb[1]), x1 = Math.max(ca[2], cb[2]), y1 = Math.max(ca[3], cb[3]);
  let inter = 0, union = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = x0 + (i + 0.5) * (x1 - x0) / n, y = y0 + (j + 0.5) * (y1 - y0) / n;
    const ea = enGeom(x, y, a), eb = enGeom(x, y, b);
    if (ea || eb) union++;
    if (ea && eb) inter++;
  }
  return union ? inter / union : 1;
}
function distanciaM(a, b) {
  const R = 6371000, t = x => x * Math.PI / 180;
  const dLat = t(b[1] - a[1]), dLon = t(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(t(a[1])) * Math.cos(t(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const igual = (a, b) => {
  const na = a === null || a === undefined ? '' : (typeof a === 'string' ? a.trim().replace(/\s+/g, ' ').toUpperCase() : a);
  const nb = b === null || b === undefined ? '' : (typeof b === 'string' ? b.trim().replace(/\s+/g, ' ').toUpperCase() : b);
  if (typeof na === 'number' || typeof nb === 'number') return Number(na) === Number(nb);
  return String(na) === String(nb);
};

/** Solo lo de Áncash: departamento/región ANCASH o una de sus 7 RIS (así entra Barranca, de la RIS Huaylas Sur 2). */
function esDeAncash(p) {
  const dep = String(p.departamen || p.region || p.departamento || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return dep.includes('ANCASH') || RIS_ANCASH.has(Number(p.id_ris));
}

function compararCapa(clave, oficial, bundle) {
  const k = claveCapa(clave);
  const res = { clave, oficial: oficial.features.length, bundle: bundle.features.length, sinClave: 0, soloOficial: [], soloBundle: [], atributos: [], geometria: [], iguales: 0 };
  const mapaB = new Map();
  for (const f of bundle.features) { const c = k(f.properties); if (c && !mapaB.has(c)) mapaB.set(c, f); }
  const vistos = new Set();
  for (const f of oficial.features) {
    const c = k(f.properties);
    if (!c) { res.sinClave++; continue; }
    if (vistos.has(c)) continue;
    vistos.add(c);
    const b = mapaB.get(c);
    if (!b) { res.soloOficial.push({ clave: c, nombre: f.properties.ipress || f.properties.ris || '' }); continue; }
    const difs = [];
    for (const campo of CAMPOS_COMPARAR[clave]) {
      if (f.properties[campo] === undefined) continue;
      if (!igual(f.properties[campo], b.properties[campo])) difs.push({ campo, oficial: f.properties[campo], bundle: b.properties[campo] });
    }
    let geo = null;
    if (f.geometry.type === 'Point') {
      const d = distanciaM(f.geometry.coordinates, b.geometry.coordinates);
      if (d > 5) geo = { distancia_m: Math.round(d) };
    } else {
      const v = iou(f.geometry, b.geometry);
      const aO = areaM2(f.geometry), aB = areaM2(b.geometry);
      const difArea = aB ? Math.abs(aO - aB) / aB : 1;
      if (v < 0.99 || difArea > 0.01) geo = { iou: Math.round(v * 1000) / 1000, area_oficial_km2: Math.round(aO / 1e4) / 100, area_bundle_km2: Math.round(aB / 1e4) / 100 };
    }
    const nombre = f.properties.ipress || f.properties.ris || '';
    if (difs.length) res.atributos.push({ clave: c, nombre, difs });
    if (geo) res.geometria.push({ clave: c, nombre, ...geo });
    if (!difs.length && !geo) res.iguales++;
  }
  for (const [c, f] of mapaB) if (!vistos.has(c)) res.soloBundle.push({ clave: c, nombre: f.properties.ipress || f.properties.ris || '' });
  return res;
}

function informe(resultados, fuentes, faltantes, actualizado) {
  const fecha = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const l = [];
  l.push('# Comparación de las capas GeoRIS del prototipo con la fuente oficial del MINSA', '');
  l.push(`Generado por \`tools/comparar_georis_oficial.js\` el ${fecha} (UTC). Ámbito: Áncash (7 RIS).`, '');
  l.push('## Fuentes', '');
  for (const [c, u] of Object.entries(fuentes)) l.push(`- **${c}**: ${u}`);
  if (faltantes.length) l.push('', `No se encontraron en la fuente oficial: ${faltantes.join(', ')} (se conservan las del bundle).`);
  l.push('', '## Resumen', '');
  l.push('| Capa | Oficial | Bundle | Iguales | Solo oficial | Solo bundle | Atributos distintos | Geometría distinta |');
  l.push('| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const r of resultados) l.push(`| ${r.clave} | ${r.oficial} | ${r.bundle} | ${r.iguales} | ${r.soloOficial.length} | ${r.soloBundle.length} | ${r.atributos.length} | ${r.geometria.length} |`);
  for (const r of resultados) {
    if (!r.soloOficial.length && !r.soloBundle.length && !r.atributos.length && !r.geometria.length && !r.sinClave) continue;
    l.push('', `## ${r.clave}`, '');
    if (r.sinClave) l.push(`- ${r.sinClave} elementos oficiales sin los campos de identificación (no se pudieron emparejar).`);
    if (r.soloOficial.length) l.push(`- **Solo en la fuente oficial (${r.soloOficial.length}):** ${r.soloOficial.slice(0, 60).map(x => `${x.clave} ${x.nombre}`.trim()).join('; ')}${r.soloOficial.length > 60 ? '; …' : ''}`);
    if (r.soloBundle.length) l.push(`- **Solo en el bundle (${r.soloBundle.length}):** ${r.soloBundle.slice(0, 60).map(x => `${x.clave} ${x.nombre}`.trim()).join('; ')}${r.soloBundle.length > 60 ? '; …' : ''}`);
    if (r.atributos.length) {
      l.push('', '| Elemento | Campo | Oficial | Bundle |', '| :--- | :--- | :--- | :--- |');
      r.atributos.slice(0, 200).forEach(a => a.difs.forEach(d => l.push(`| ${a.clave} ${a.nombre} | ${d.campo} | ${String(d.oficial).replace(/\|/g, '/')} | ${String(d.bundle).replace(/\|/g, '/')} |`)));
    }
    if (r.geometria.length) {
      l.push('', '| Elemento | Diferencia de geometría |', '| :--- | :--- |');
      r.geometria.slice(0, 200).forEach(g => l.push(`| ${g.clave} ${g.nombre} | ${g.distancia_m !== undefined ? `punto a ${g.distancia_m} m` : `IoU ${g.iou} · área ${g.area_oficial_km2} km² (oficial) vs ${g.area_bundle_km2} km² (bundle)`} |`));
    }
  }
  l.push('', '## Bundle', '', actualizado
    ? `Actualizado con las capas oficiales: ${actualizado.join(', ')}. Copia del anterior en \`client/data/georis/\` (*.backup-*.js). Ejecute \`npm test\`.`
    : 'No se modificó (use `--actualizar` para reemplazar las capas por las oficiales).');
  return l.join('\n') + '\n';
}

function actualizarBundle(bundle, capas) {
  const aplicadas = [];
  const nuevo = { ...bundle };
  for (const def of CAPAS) {
    const fc = capas[def.clave];
    if (!fc) continue;
    const req = CAMPOS_REQUERIDOS[def.clave];
    const faltan = req.filter(c => !fc.features.some(f => f.properties[c] !== undefined && f.properties[c] !== null));
    if (faltan.length) { console.log(`  ✗ ${def.clave}: no se actualiza, faltan campos ${faltan.join(', ')}`); continue; }
    const actual = (bundle[def.clave] && bundle[def.clave].features.length) || 0;
    if (fc.features.length < actual * 0.8) { console.log(`  ✗ ${def.clave}: no se actualiza, la descarga trae ${fc.features.length} y el bundle ${actual} (¿descarga incompleta?)`); continue; }
    nuevo[def.clave] = fc;
    aplicadas.push(def.clave);
  }
  if (!aplicadas.length) return null;
  const sello = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13).replace('T', '-');
  const copia = BUNDLE_PATH.replace(/\.js$/, `.backup-${sello}.js`);
  fs.copyFileSync(BUNDLE_PATH, copia);
  fs.writeFileSync(BUNDLE_PATH, `window.GEORIS_DATA_BUNDLE = ${JSON.stringify(nuevo)};\n`);
  // Nueva versión en index.html y sw.js para que el navegador y el modo sin conexión tomen el bundle nuevo
  // (solo si se actualizó el bundle de la aplicación, no una copia indicada con --bundle)
  const version = `georis_${sello}`;
  const esElDeLaApp = BUNDLE_PATH === path.resolve(ROOT, 'client/data/georis/georisDataBundle.js');
  for (const f of (esElDeLaApp ? ['client/index.html', 'client/sw.js'] : [])) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    const s = fs.readFileSync(p, 'utf8').replace(/(georisDataBundle\.js\?v=)[^"']+/g, `$1${version}`);
    fs.writeFileSync(p, f.endsWith('sw.js') ? s.replace(/const CACHE_NAME = '([^']*)';/, (m, n) => `const CACHE_NAME = '${n.replace(/-georis-.*$/, '')}-georis-${sello}';`) : s);
  }
  console.log(`  ✓ bundle actualizado (${aplicadas.join(', ')}); copia en ${path.relative(ROOT, copia)}`);
  return aplicadas;
}

async function main() {
  console.log(`Bundle del prototipo: ${path.relative(ROOT, BUNDLE_PATH)}`);
  const bundle = leerBundle(BUNDLE_PATH);
  let origen;
  if (ARGS.desde) {
    console.log(`Leyendo capas oficiales guardadas en ${ARGS.desde}`);
    origen = leerDesde(path.resolve(ROOT, String(ARGS.desde)));
  } else {
    console.log(`Descargando capas oficiales de ${BASE} (Áncash)…`);
    origen = await descargarOficial();
    fs.mkdirSync(GUARDAR_DIR, { recursive: true });
    for (const [c, fc] of Object.entries(origen.capas)) fs.writeFileSync(path.join(GUARDAR_DIR, `${c}.geojson`), JSON.stringify(fc));
    if (Object.keys(origen.capas).length) console.log(`  Guardado en ${path.relative(ROOT, GUARDAR_DIR)}/`);
  }
  const obtenidas = Object.keys(origen.capas);
  if (!obtenidas.length) throw new Error('No se encontró ninguna capa GeoRIS en la fuente oficial (revise --base/--servicio).');
  for (const c of obtenidas) origen.capas[c].features = origen.capas[c].features.filter(f => esDeAncash(f.properties));

  const resultados = CAPAS.filter(d => origen.capas[d.clave] && bundle[d.clave]).map(d => compararCapa(d.clave, origen.capas[d.clave], bundle[d.clave]));
  const faltantes = CAPAS.map(d => d.clave).filter(c => !origen.capas[c]);
  console.log('\nCapa            Oficial Bundle Iguales SoloOf SoloBu Atrib Geom');
  for (const r of resultados) console.log(`${r.clave.padEnd(15)} ${String(r.oficial).padStart(7)} ${String(r.bundle).padStart(6)} ${String(r.iguales).padStart(7)} ${String(r.soloOficial.length).padStart(6)} ${String(r.soloBundle.length).padStart(6)} ${String(r.atributos.length).padStart(5)} ${String(r.geometria.length).padStart(4)}`);

  const actualizado = ARGS.actualizar ? actualizarBundle(bundle, origen.capas) : null;
  fs.mkdirSync(path.dirname(INFORME_PATH), { recursive: true });
  fs.writeFileSync(INFORME_PATH, informe(resultados, origen.fuentes, faltantes, actualizado));
  fs.writeFileSync(path.join(path.dirname(INFORME_PATH), 'COMPARACION_GEORIS_OFICIAL.json'), JSON.stringify({ generado: new Date().toISOString(), fuentes: origen.fuentes, faltantes, actualizado, resultados }, null, 1));
  console.log(`\nInforme: ${path.relative(ROOT, INFORME_PATH)}`);
  const hayDiferencias = resultados.some(r => r.soloOficial.length || r.soloBundle.length || r.atributos.length || r.geometria.length);
  return hayDiferencias ? 1 : 0;
}

if (require.main === module) {
  main().then(code => process.exit(code)).catch(e => {
    console.error(`\nERROR: ${e.message}`);
    process.exit(2);
  });
}

module.exports = { esriAGeojson, normalizarAtributos, compararCapa, esDeAncash, iou, areaM2 };
