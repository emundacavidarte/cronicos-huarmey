#!/usr/bin/env node
'use strict';

/*
 * perfil_padron.js
 * Uso: node tools/perfil_padron.js <ruta a sampleDataset.js> [--hoy=yyyy-mm-dd] [--bbox=latMin,latMax,lonMin,lonMax]
 *
 * Carga el archivo en un sandbox de Node (vm, window = {}), toma el arreglo de
 * pacientes e imprime SOLO agregados: nunca imprime valores de pacientes.
 * Los valores solo se muestran en distribuciones de campos no identificables
 * (semaforo, sector, financiador, sexo, fuente, estado_control, distrito, CIE-10),
 * y solo si hay pocos valores distintos y son cortos.
 */

const fs = require('fs');
const vm = require('vm');

// ---------- Argumentos ----------
const args = process.argv.slice(2);
const ruta = args.find((a) => !a.startsWith('--'));
const optHoy = (args.find((a) => a.startsWith('--hoy=')) || '').split('=')[1];
const optBbox = (args.find((a) => a.startsWith('--bbox=')) || '').split('=')[1];

if (!ruta) {
  console.error('Uso: node tools/perfil_padron.js <ruta a sampleDataset.js> [--hoy=yyyy-mm-dd] [--bbox=latMin,latMax,lonMin,lonMax]');
  process.exit(1);
}

// Caja aproximada de Huarmey (configurable con --bbox)
let BBOX = { latMin: -10.20, latMax: -9.95, lonMin: -78.25, lonMax: -78.05 };
if (optBbox) {
  const p = optBbox.split(',').map(Number);
  if (p.length === 4 && p.every((n) => !Number.isNaN(n))) {
    BBOX = { latMin: p[0], latMax: p[1], lonMin: p[2], lonMax: p[3] };
  }
}

const HOY = (() => {
  if (optHoy) {
    const m = optHoy.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  }
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
})();
const DIAS_PROXIMA = 30;

// Campos no identificables: unicos cuya distribucion se puede imprimir
const DIST_RE = /sem[aá]foro|sector|financ|sexo|g[eé]nero|fuente|origen_dato|estado_control|distrito|cie/i;
const MAX_DISTINTOS_DIST = 50;
const MAX_LARGO_DIST = 40;

// ---------- Utilidades ----------
const pct = (n, t) => (t ? ((100 * n) / t).toFixed(1) : '0.0') + '%';

function countBy(arr) {
  const m = new Map();
  for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
}

function isEmpty(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    return t === '' || t === 'null' || t === 'undefined';
  }
  if (typeof v === 'number') return Number.isNaN(v);
  if (Array.isArray(v)) return v.length === 0 || v.every(isEmpty);
  if (isPlainObject(v)) {
    const vals = Object.values(v);
    return vals.length === 0 || vals.every(isEmpty);
  }
  return false;
}

function typeName(v) {
  if (v === undefined) return 'ausente';
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (v instanceof Date) return 'date';
  return typeof v;
}

function mkDate(y, mo, d) {
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? dt : null;
}

function parseDate(v) {
  if (v instanceof Date) return v;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  if (m) return mkDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return mkDate(+m[3], +m[2], +m[1]);
  return null;
}

function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

const FORMATOS_FECHA = new Set(['yyyy-mm-dd', 'ISO fecha-hora', 'dd/mm/yyyy']);

function formatOf(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return 'booleano';
  if (typeof v === 'number') return Number.isInteger(v) ? 'número entero' : 'número decimal';
  if (v instanceof Date) return 'Date';
  if (Array.isArray(v)) return 'arreglo';
  if (isPlainObject(v)) return 'objeto';
  if (typeof v !== 'string') return typeof v;
  const t = v.trim();
  let f;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) f = 'yyyy-mm-dd';
  else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(t)) f = 'ISO fecha-hora';
  else if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) f = 'dd/mm/yyyy';
  else if (/^\d+$/.test(t)) f = t.length + ' dígitos';
  else if (/^-?\d+\.\d+$/.test(t)) f = 'decimal en texto';
  else if (/^-?\d+,\d+$/.test(t)) f = 'decimal con coma en texto';
  else if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(t)) f = 'email';
  else if (/^\+?[\d\s()-]+$/.test(t)) f = 'dígitos con separadores (' + t.replace(/\D/g, '').length + ' dígitos)';
  else if (/^[A-Z0-9_]+$/.test(t)) f = 'CODIGO_MAYUS';
  else f = 'texto';
  if (v !== t) f += ' +espacios sobrantes';
  return f;
}

function listCounts(entries, max) {
  const lim = max || 6;
  const shown = entries.slice(0, lim).map(([k, n]) => k + '=' + n);
  if (entries.length > lim) shown.push('... (+' + (entries.length - lim) + ' más)');
  return shown.join(', ');
}

// ---------- Carga ----------
function cargar(rutaArchivo) {
  const code = fs.readFileSync(rutaArchivo, 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { timeout: 15000 });

  const candidatos = [];
  const fuentes = [['window', sandbox.window], ['global', sandbox]];
  for (const [origen, obj] of fuentes) {
    for (const k of Object.keys(obj)) {
      if (origen === 'global' && k === 'window') continue;
      const v = obj[k];
      if (Array.isArray(v) && v.length && v.every(isPlainObject)) {
        candidatos.push({ origen, nombre: k, datos: v });
      }
    }
  }
  candidatos.sort((a, b) => b.datos.length - a.datos.length);
  return { code, candidatos };
}

function describirEnvoltorio(code, candidato) {
  const lines = [];
  lines.push('Tamaño: ' + Buffer.byteLength(code, 'utf8') + ' bytes');
  lines.push('BOM al inicio: ' + (code.charCodeAt(0) === 0xfeff ? 'sí' : 'no'));
  lines.push('Saltos de línea: ' + (code.includes('\r\n') ? 'CRLF' : 'LF'));
  lines.push('Termina con salto de línea: ' + (/\n$/.test(code) ? 'sí' : 'no'));
  lines.push('Comentarios iniciales: ' + (/^\uFEFF?\s*(\/\/|\/\*)/.test(code) ? 'sí' : 'no'));
  lines.push('Dónde queda el arreglo: ' + candidato.origen + '.' + candidato.nombre);

  // Solo el nombre de la asignación (identificador), nunca valores
  const m = code.match(/([A-Za-z_$][\w$.]*)\s*=\s*[\[{]/);
  lines.push('Asignación detectada: ' + (m ? m[1] : 'no detectada'));

  const idx = code.search(/=\s*[\[{]/);
  if (idx >= 0) {
    const inicio = idx + code.slice(idx).search(/[\[{]/);
    const cuerpo = code.slice(inicio).replace(/[\s;]+$/, '');
    let json = true;
    try {
      JSON.parse(cuerpo);
    } catch (e) {
      json = false;
    }
    lines.push('Cuerpo es JSON válido: ' + (json ? 'sí' : 'no (literal JS)'));
  }

  const ls = code.split(/\r?\n/);
  const sangrias = countBy(
    ls.filter((l) => /^\s+\S/.test(l)).map((l) => {
      const mm = l.match(/^(\s+)/)[1];
      return mm.includes('\t') ? 'tab' : mm.length + ' espacios';
    })
  );
  lines.push('Sangrías más comunes: ' + (sangrias.length ? listCounts(sangrias, 4) : 'sin sangría (compacto)'));
  lines.push('Número de líneas: ' + ls.length);
  return lines;
}

// ---------- Descripcion de un conjunto de valores ----------
function estadisticaFechas(values) {
  const fechas = [];
  let noParseables = 0;
  for (const v of values) {
    if (isEmpty(v)) continue;
    const d = parseDate(v);
    if (d) fechas.push(d);
    else noParseables++;
  }
  if (!fechas.length) return;
  let min = fechas[0];
  let max = fechas[0];
  for (const d of fechas) {
    if (d < min) min = d;
    if (d > max) max = d;
  }
  const limite = new Date(HOY.getTime() + DIAS_PROXIMA * 86400000);
  const vencidas = fechas.filter((d) => d < HOY).length;
  const hoy = fechas.filter((d) => d.getTime() === HOY.getTime()).length;
  const proximas = fechas.filter((d) => d > HOY && d <= limite).length;
  const vigentes = fechas.filter((d) => d > limite).length;
  console.log('    fechas: mín=' + fmtDate(min) + ' máx=' + fmtDate(max) + ' (referencia hoy=' + fmtDate(HOY) + ')');
  console.log(
    '    respecto de hoy: vencidas(<hoy)=' + vencidas + ', hoy=' + hoy +
    ', próximas(1-' + DIAS_PROXIMA + ' días)=' + proximas +
    ', vigentes(>' + DIAS_PROXIMA + ' días)=' + vigentes +
    (noParseables ? ', no interpretables=' + noParseables : '')
  );
}

function distribucion(nombreBase, values) {
  if (!DIST_RE.test(nombreBase)) return;
  if (values.some((v) => v !== null && v !== undefined && typeof v === 'object')) return;
  const claves = values.map((v) => (isEmpty(v) ? '(vacío)' : String(v).trim()));
  const entradas = countBy(claves);
  const largo = Math.max(0, ...entradas.map(([k]) => k.length));
  if (entradas.length > MAX_DISTINTOS_DIST || largo > MAX_LARGO_DIST) {
    console.log('    distribución omitida por seguridad (' + entradas.length + ' valores distintos, largo máx ' + largo + ')');
    return;
  }
  console.log('    distribución: ' + entradas.map(([k, n]) => k + '=' + n).join(', '));
}

function describir(label, nombreBase, values) {
  const total = values.length;
  const vacios = values.filter(isEmpty).length;
  const tipos = countBy(values.map(typeName));
  const noVacios = values.filter((v) => !isEmpty(v));
  const formatos = countBy(noVacios.map(formatOf));
  const distintos = new Set(noVacios.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v)))).size;

  console.log('  ' + label);
  console.log('    vacío/null: ' + vacios + ' (' + pct(vacios, total) + ') | tipos: ' + listCounts(tipos, 5) + ' | distintos: ' + distintos);
  if (formatos.length) console.log('    formato: ' + listCounts(formatos, 6));

  const fechasDetectadas = noVacios.filter((v) => FORMATOS_FECHA.has(formatOf(v).replace(' +espacios sobrantes', ''))).length;
  if (noVacios.length && (fechasDetectadas / noVacios.length >= 0.5 || /fecha|date/i.test(nombreBase))) {
    estadisticaFechas(values);
  }
  distribucion(nombreBase, values);
}

function subclavesDe(items) {
  const claves = [];
  for (const it of items) if (isPlainObject(it)) for (const k of Object.keys(it)) if (!claves.includes(k)) claves.push(k);
  return claves;
}

function perfilCampo(campo, values) {
  if (values.some(Array.isArray)) {
    const lens = countBy(values.map((v) => (Array.isArray(v) ? v.length : -1))).sort((a, b) => a[0] - b[0]);
    console.log('  ' + campo + ' (arreglo)');
    console.log('    largo del arreglo: ' + lens.map(([l, n]) => (l === -1 ? 'no-arreglo' : 'largo ' + l) + '=' + n).join(', '));
    const maxLen = Math.min(20, Math.max(0, ...values.map((v) => (Array.isArray(v) ? v.length : 0))));
    for (let i = 0; i < maxLen; i++) {
      const items = values.map((v) => (Array.isArray(v) ? v[i] : undefined));
      const conContenido = items.filter((x) => !isEmpty(x)).length;
      console.log('    posición [' + i + ']: ' + conContenido + ' registros con contenido (' + pct(conContenido, values.length) + ')');
      if (items.some(isPlainObject)) {
        for (const k of subclavesDe(items)) {
          describir(campo + '[' + i + '].' + k, k, items.map((it) => (isPlainObject(it) ? it[k] : undefined)));
        }
      } else if (conContenido) {
        describir(campo + '[' + i + ']', campo, items);
      }
    }
    return;
  }

  if (values.some(isPlainObject)) {
    describir(campo + ' (objeto, resumen)', campo, values);
    for (const k of subclavesDe(values)) {
      describir(campo + '.' + k, k, values.map((it) => (isPlainObject(it) ? it[k] : undefined)));
    }
    return;
  }

  describir(campo, campo, values);
}

// ---------- Secciones ----------
function seccion(titulo) {
  console.log('\n==== ' + titulo + ' ====');
}

function seccionDni(campos, regs, total) {
  seccion('DNI');
  const dniCampos = campos.filter((c) => /dni|documento|nro_doc|num_doc/i.test(c));
  if (!dniCampos.length) console.log('No se detectó campo de DNI.');
  for (const c of dniCampos) {
    const vals = regs.map((r) => r[c]).filter((v) => !isEmpty(v)).map((v) => String(v).trim());
    const grupos = countBy(vals);
    const repetidos = grupos.filter(([, n]) => n > 1);
    const compartidos = repetidos.reduce((s, [, n]) => s + n, 0);
    console.log('Campo ' + c + ':');
    console.log('  registros con valor: ' + vals.length + ' de ' + total + ', sin valor: ' + (total - vals.length));
    console.log('  DNI únicos (distintos): ' + grupos.length);
    console.log('  DNI repetidos (aparecen más de una vez): ' + repetidos.length);
    console.log('  registros que comparten un DNI: ' + compartidos);
    const hist = countBy(repetidos.map(([, n]) => n)).sort((a, b) => a[0] - b[0]);
    console.log('  tamaño de grupo -> cantidad de DNI: ' + (hist.map(([t, n]) => t + '->' + n).join(', ') || 'ninguno'));
  }
}

function seccionTelefonos(campos, regs, total) {
  seccion('TELÉFONOS');
  // Coincidencia por palabra completa: evita captar "fila_excel" por contener "cel"
  const TOKENS_TEL = ['tel', 'telefono', 'teléfono', 'celular', 'cel', 'fono', 'phone', 'movil', 'móvil'];
  const telCampos = campos.filter((c) => c.toLowerCase().split(/[^a-záéíóúñ0-9]+/).some((t) => TOKENS_TEL.includes(t)));
  if (!telCampos.length) console.log('No se detectó campo de teléfono.');
  for (const c of telCampos) {
    const vacios = regs.filter((r) => isEmpty(r[c])).length;
    const largos = countBy(regs.filter((r) => !isEmpty(r[c])).map((r) => String(r[c]).replace(/\D/g, '').length));
    console.log('Campo ' + c + ': vacíos=' + vacios + ' (' + pct(vacios, total) + '); largo en dígitos -> ' + listCounts(largos, 6));
  }
  if (telCampos.length > 1) {
    const sinNinguno = regs.filter((r) => telCampos.every((c) => isEmpty(r[c]))).length;
    console.log('Registros sin ningún teléfono: ' + sinNinguno);
  }
}

function seccionCoordenadas(campos, regs) {
  seccion('COORDENADAS');
  const latC = campos.filter((c) => /^lat/i.test(c));
  const lonC = campos.filter((c) => /^(lon|lng)/i.test(c));
  if (!latC.length || !lonC.length) {
    console.log('No se detectaron campos lat/lon separados. Candidatos: ' + (campos.filter((c) => /coord|ubic|geo|gps/i.test(c)).join(', ') || 'ninguno'));
    return;
  }
  const lc = latC[0];
  const oc = lonC[0];
  const num = (v) => {
    if (isEmpty(v)) return NaN;
    if (typeof v === 'number') return v;
    return parseFloat(String(v).replace(',', '.'));
  };
  const sinLat = regs.filter((r) => Number.isNaN(num(r[lc]))).length;
  const sinLon = regs.filter((r) => Number.isNaN(num(r[oc]))).length;
  const sinAmbas = regs.filter((r) => Number.isNaN(num(r[lc])) && Number.isNaN(num(r[oc]))).length;
  const conAmbas = regs.filter((r) => !Number.isNaN(num(r[lc])) && !Number.isNaN(num(r[oc])));
  const fuera = conAmbas.filter((r) => {
    const la = num(r[lc]);
    const lo = num(r[oc]);
    return la < BBOX.latMin || la > BBOX.latMax || lo < BBOX.lonMin || lo > BBOX.lonMax;
  }).length;
  const ceros = conAmbas.filter((r) => num(r[lc]) === 0 && num(r[oc]) === 0).length;
  console.log('Campos usados: ' + lc + ', ' + oc);
  console.log('Caja de Huarmey: lat [' + BBOX.latMin + ', ' + BBOX.latMax + '], lon [' + BBOX.lonMin + ', ' + BBOX.lonMax + ']');
  console.log('Sin latitud: ' + sinLat + ' | sin longitud: ' + sinLon + ' | sin ninguna de las dos: ' + sinAmbas);
  console.log('Con ambas: ' + conAmbas.length + ' | fuera de la caja de Huarmey: ' + fuera + ' | exactamente 0,0: ' + ceros);
  if (conAmbas.length) {
    const las = conAmbas.map((r) => num(r[lc]));
    const los = conAmbas.map((r) => num(r[oc]));
    console.log('Rango lat: ' + Math.min(...las).toFixed(4) + ' a ' + Math.max(...las).toFixed(4) + ' | rango lon: ' + Math.min(...los).toFixed(4) + ' a ' + Math.max(...los).toFixed(4));
    const decs = countBy(conAmbas.map((r) => (String(r[lc]).split('.')[1] || '').length));
    console.log('Decimales en latitud -> ' + listCounts(decs, 5));
  }
}

function seccionFechas(campos, regs) {
  seccion('FECHAS (CAMPOS DE PRIMER NIVEL)');
  let hay = false;
  for (const c of campos) {
    const vals = regs.map((r) => r[c]).filter((v) => !isEmpty(v) && typeof v !== 'object');
    if (!vals.length) continue;
    const nFecha = vals.filter((v) => parseDate(v)).length;
    if (nFecha / vals.length >= 0.5 || /fecha|date/i.test(c)) {
      hay = true;
      console.log('Campo ' + c + ':');
      estadisticaFechas(regs.map((r) => r[c]));
    }
  }
  if (!hay) console.log('No se detectaron campos de fecha de primer nivel.');
  console.log('(Las fechas dentro de arreglos de citas/observaciones están en PERFIL POR CAMPO.)');
}

function main() {
  console.log('Perfil del padrón (solo agregados, sin valores de pacientes)');
  console.log('Hoy de referencia: ' + fmtDate(HOY));

  const { code, candidatos } = cargar(ruta);
  if (!candidatos.length) {
    console.log('No se encontró un arreglo de objetos en window ni en el contexto global.');
    process.exit(2);
  }
  const elegido = candidatos[0];
  const regs = elegido.datos;
  const total = regs.length;

  seccion('ESTRUCTURA DEL ARCHIVO');
  for (const l of describirEnvoltorio(code, elegido)) console.log('  ' + l);
  if (candidatos.length > 1) {
    console.log('  Otros arreglos de objetos: ' + candidatos.slice(1).map((c) => c.origen + '.' + c.nombre + ' (' + c.datos.length + ')').join(', '));
  }

  seccion('REGISTROS Y CAMPOS');
  const campos = [];
  for (const r of regs) for (const k of Object.keys(r)) if (!campos.includes(k)) campos.push(k);
  console.log('Registros: ' + total);
  console.log('Campos distintos (unión): ' + campos.length);
  console.log('Campos por registro: ' + countBy(regs.map((r) => Object.keys(r).length)).map(([n, c]) => n + ' campos=' + c + ' registros').join(', '));
  console.log('Lista de campos (nombre: registros que lo tienen):');
  for (const c of campos) {
    const tiene = regs.filter((r) => Object.prototype.hasOwnProperty.call(r, c)).length;
    console.log('  ' + c + ': ' + tiene);
  }

  seccion('PERFIL POR CAMPO');
  for (const c of campos) perfilCampo(c, regs.map((r) => r[c]));

  seccionDni(campos, regs, total);
  seccionTelefonos(campos, regs, total);
  seccionCoordenadas(campos, regs);
  seccionFechas(campos, regs);
}

try {
  main();
} catch (err) {
  // Solo el mensaje: el stack podria incluir lineas del archivo con datos.
  console.error('Error: ' + (err && err.message ? err.message : String(err)));
  process.exit(1);
}
