#!/usr/bin/env node
'use strict';

/*
 * auditar_padron.js
 * Uso: node tools/auditar_padron.js <ruta a sampleDataset.js> [--hoy=yyyy-mm-dd]
 * Imprime SOLO conteos agregados (nunca valores de pacientes).
 * Mide: semaforo guardado vs recalculado con las fechas, dias_restantes guardado vs recalculado,
 * citas huerfanas, grupos de DNI repetidos y edad vs fecha de nacimiento.
 */

const fs = require('fs');
const vm = require('vm');

const args = process.argv.slice(2);
const ruta = args.find((a) => !a.startsWith('--'));
const optHoy = (args.find((a) => a.startsWith('--hoy=')) || '').split('=')[1];
if (!ruta) {
  console.error('Uso: node tools/auditar_padron.js <ruta a sampleDataset.js> [--hoy=yyyy-mm-dd]');
  process.exit(1);
}

const DIA = 86400000;

function localDate(s) {
  const m = typeof s === 'string' && s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

const HOY = (() => {
  const d = optHoy ? localDate(optHoy) : null;
  if (d) return d;
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
})();

function cargar() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(ruta, 'utf8'), sandbox, { timeout: 15000 });
  const arr = Object.values(sandbox.window).find((v) => Array.isArray(v) && v.length && typeof v[0] === 'object');
  if (!arr) throw new Error('No se encontró el arreglo de pacientes');
  return arr;
}

function count(arr, fn) {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

const fmt = (entries) => entries.map(([k, n]) => k + '=' + n).join(', ');

function ultimaCita(p) {
  let best = null;
  for (const a of p.appointments || []) {
    const d = localDate(a && a.fecha_cita);
    if (d && (!best || d >= best)) best = d;
  }
  return best;
}

function semaforoCalculado(p) {
  if (p.fuente === 'HOSIX') return 'purple';
  const d = ultimaCita(p);
  if (!d) return 'sin_cita';
  const dias = Math.round((d.getTime() - HOY.getTime()) / DIA);
  return dias > 7 ? 'green' : dias >= 0 ? 'yellow' : 'red';
}

function seccionSemaforo(regs, total) {
  console.log('\n== 1. Semáforo guardado vs recalculado con la última cita ==');
  for (const [k, n] of count(regs, (p) => 'guardado=' + p.semaforo + ' -> calculado=' + semaforoCalculado(p))) {
    console.log('  ' + k + ': ' + n);
  }
  const coinciden = regs.filter((p) => p.semaforo === semaforoCalculado(p)).length;
  console.log('  Coinciden: ' + coinciden + ' | No coinciden: ' + (total - coinciden));

  console.log('\n== 2. dias_restantes guardado vs recalculado ==');
  const difs = [];
  let sinCita = 0;
  for (const p of regs) {
    const d = ultimaCita(p);
    if (!d) { sinCita++; continue; }
    const calc = Math.round((d.getTime() - HOY.getTime()) / DIA);
    difs.push(Number(p.dias_restantes) - calc);
  }
  console.log('  Con cita: ' + difs.length + ' | sin cita: ' + sinCita);
  const etiqueta = (x) => (x === 0 ? '0' : x > 0 ? '+' + Math.min(x, 30) : String(Math.max(x, -30)));
  console.log('  Diferencia guardado-recalculado (días, tope ±30) -> ' + fmt(count(difs, etiqueta).slice(0, 14)));

  console.log('\n== 3. fecha_limite vs fecha de la última cita ==');
  const fl = { igual: 0, distinta: 0, sinFechaLimite: 0 };
  for (const p of regs) {
    const d = ultimaCita(p);
    const l = localDate(p.fecha_limite);
    if (!l) { fl.sinFechaLimite++; continue; }
    if (d && d.getTime() === l.getTime()) fl.igual++; else fl.distinta++;
  }
  console.log('  igual a la última cita=' + fl.igual + ', distinta=' + fl.distinta + ', sin fecha_limite interpretable=' + fl.sinFechaLimite);

  console.log('\n== 4. Fuente vs citas y semáforo ==');
  console.log('  ' + fmt(count(regs, (p) => p.fuente + ' | citas=' + (p.appointments || []).length + ' | semáforo=' + p.semaforo)));

  console.log('\n== 5. Fallecidos ==');
  const fall = regs.filter((p) => p.fallecido === true);
  console.log('  fallecido=true: ' + fall.length + ' | semáforo: ' + fmt(count(fall, (p) => p.semaforo)) + ' | estado_control: ' + fmt(count(fall, (p) => p.estado_control)));
}

function seccionIntegridad(regs) {
  console.log('\n== 6. diagnosticos[] vs conditions[] ==');
  const difLargo = regs.filter((p) => (p.diagnosticos || []).length !== (p.conditions || []).length).length;
  console.log('  Registros con distinto número de elementos: ' + difLargo);
  console.log('  Código en conditions[0] distinto del de diagnosticos[0]: ' +
    regs.filter((p) => (p.conditions || [])[0] && (p.diagnosticos || [])[0] && p.conditions[0].cie10_cod !== p.diagnosticos[0]).length);

  console.log('\n== 7. Integridad de ids ==');
  let huerf = 0;
  let citasTotal = 0;
  for (const p of regs) for (const a of p.appointments || []) { citasTotal++; if (a.patient_id !== p.id) huerf++; }
  console.log('  Citas: ' + citasTotal + ' | con patient_id distinto del id del registro: ' + huerf);
  console.log('  ids distintos: ' + new Set(regs.map((p) => p.id)).size + ' de ' + regs.length);

  console.log('\n== 8. DNI repetidos ==');
  const porDni = new Map();
  for (const p of regs) { const k = String(p.dni).trim(); porDni.set(k, (porDni.get(k) || []).concat(p)); }
  const grupos = [...porDni.values()].filter((g) => g.length > 1);
  console.log('  Grupos repetidos: ' + grupos.length + ' (registros implicados: ' + grupos.reduce((s, g) => s + g.length, 0) + ')');
  console.log('  Composición de fuentes por grupo -> ' + fmt(count(grupos, (g) => g.map((p) => p.fuente).sort().join('+'))));
  console.log('  Grupos con mismo id en sus registros: ' + grupos.filter((g) => new Set(g.map((p) => p.id)).size < g.length).length);
  console.log('  Grupos con distinto semáforo entre sus registros: ' + grupos.filter((g) => new Set(g.map((p) => p.semaforo)).size > 1).length);
  console.log('  Grupos con distinto nombre entre sus registros: ' + grupos.filter((g) => new Set(g.map((p) => p.apellidos_nombres)).size > 1).length);
  console.log('  Registros con nota_duplicado_padron: ' + regs.filter((p) => p.nota_duplicado_padron).length);

  console.log('\n== 9. Formato de DNI ==');
  const fdni = (p) => (/^\d{8}$/.test(String(p.dni)) ? '8 dígitos' : /^\d+$/.test(String(p.dni)) ? String(p.dni).length + ' dígitos' : 'no numérico');
  console.log('  ' + fmt(count(regs, fdni)));
}

function seccionContacto(regs) {
  console.log('\n== 10. Edad vs fecha de nacimiento ==');
  let ok = 0;
  let mal = 0;
  let sin = 0;
  for (const p of regs) {
    const n = localDate(p.fecha_nacimiento);
    if (!n || p.edad == null) { sin++; continue; }
    let e = HOY.getFullYear() - n.getFullYear();
    if (HOY < new Date(HOY.getFullYear(), n.getMonth(), n.getDate())) e--;
    if (Math.abs(e - p.edad) <= 1) ok++; else mal++;
  }
  console.log('  coherentes (±1 año)=' + ok + ', incoherentes=' + mal + ', sin dato para comparar=' + sin);

  console.log('\n== 11. Coordenadas ==');
  const repetidas = count(regs, (p) => p.latitud + ',' + p.longitud).filter(([, n]) => n > 1);
  console.log('  Pares lat/lon repetidos: ' + repetidas.length + ' (registros: ' + repetidas.reduce((s, [, n]) => s + n, 0) + ')');
  const enCaja = (p) => p.latitud > -10.2 && p.latitud < -9.95 && p.longitud > -78.25 && p.longitud < -78.05;
  const otroDistrito = regs.filter((p) => p.distrito !== 'Huarmey');
  console.log('  Distrito distinto de Huarmey: ' + otroDistrito.length + ' | de ellos con coordenadas dentro de la caja de Huarmey: ' + otroDistrito.filter(enCaja).length);
  console.log('  Distrito Huarmey pero coordenadas fuera de la caja: ' + regs.filter((p) => p.distrito === 'Huarmey' && !enCaja(p)).length);

  console.log('\n== 12. Teléfono ==');
  const tel = regs.map((p) => String(p.telefono || '').replace(/\D/g, '')).filter(Boolean);
  const compartidos = count(tel, (t) => t).filter(([, n]) => n > 1).reduce((s, [, n]) => s + n, 0);
  console.log('  Con teléfono: ' + tel.length + ' | no empiezan con 9: ' + tel.filter((t) => t[0] !== '9').length + ' | registros que comparten teléfono: ' + compartidos);
}

function main() {
  const regs = cargar();
  console.log('Auditoría del padrón (solo conteos). Hoy de referencia: ' + HOY.toISOString().slice(0, 10));
  console.log('Registros: ' + regs.length);
  seccionSemaforo(regs, regs.length);
  seccionIntegridad(regs);
  seccionContacto(regs);
}

try {
  main();
} catch (err) {
  console.error('Error: ' + (err && err.message ? err.message : String(err)));
  process.exit(1);
}
