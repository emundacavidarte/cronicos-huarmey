#!/usr/bin/env node
'use strict';

/*
 * consolidar_dni.js
 * Une las filas del padrón que comparten el mismo DNI (una persona con varias filas del Excel)
 * y deja un registro por persona, sin perder ninguna atención.
 *
 * Uso (desde la raíz del proyecto, con el servidor DETENIDO para --aplicar):
 *   node tools/consolidar_dni.js [--hoy=yyyy-mm-dd]
 *       Simulacro. No escribe nada. Imprime solo conteos y números de fila del Excel (nunca DNI ni nombres).
 *   node tools/consolidar_dni.js --aplicar --respaldo=<carpeta FUERA de OneDrive> [--hoy=yyyy-mm-dd]
 *       Copia server/db/store.json y server/db/padron_inicial.js al respaldo y los reescribe.
 *
 * Reglas:
 *  1. Solo se unen filas con el MISMO documento e identidad compatible (nombre, sexo y fecha de nacimiento
 *     sin contradicción). Si no, no se unen y se informan (p. ej. DNI repetido por error de digitación).
 *  2. Fila vigente = la del control más reciente: primero el mes del control (SIN FECHA < ENE-MAR < ... < OCTUBRE),
 *     luego la fecha y luego el número de fila. No se usa solo la fecha: el padrón imputó el día 15 en muchos
 *     controles y hay controles de octubre fechados en agosto.
 *  3. Los datos actuales (PA, peso, tratamiento, estado, cita, coordenadas) son los de la fila vigente.
 *     Si la vigente tiene un campo vacío y otra fila lo tiene, se completa.
 *  4. Atenciones: se conservan TODAS las distintas. Solo se eliminan copias exactas.
 *  5. Cita: la de la fila vigente. Las de las otras filas quedan en fusion_dni.citas_descartadas.
 *  6. Diagnósticos: unión de los de todas las filas.
 *  7. Lo que difiere en las filas no vigentes queda en fusion_dni (trazabilidad; permite deshacer).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Semaforo = require('../client/js/clinical/semaforo');

const RAIZ = path.join(__dirname, '..');
const RUTA_STORE = path.join(RAIZ, 'server', 'db', 'store.json');
const RUTA_SAMPLE = path.join(RAIZ, 'server', 'db', 'padron_inicial.js');

const args = process.argv.slice(2);
const opt = (n) => { const a = args.find((x) => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : undefined; };
const APLICAR = args.includes('--aplicar');
const RESPALDO = opt('respaldo');
const HOY = (() => {
  const d = opt('hoy') ? Semaforo.parseFechaLocal(opt('hoy')) : null;
  if (d) return d;
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
})();
const HOY_TXT = HOY.getFullYear() + '-' + String(HOY.getMonth() + 1).padStart(2, '0') + '-' + String(HOY.getDate()).padStart(2, '0');

const J = JSON.stringify;
const clonar = (x) => JSON.parse(J(x));
const norm = (t) => String(t === null || t === undefined ? '' : t)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const vacio = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const sinIdPid = (o) => { const { id, patient_id, ...r } = o; return J(r); };
const sinPid = (o) => { const { patient_id, ...r } = o; return J(r); };

const RANGO_MES = {
  'SIN FECHA': 0, 'ENE-MAR': 1, ABRIL: 2, MAYO: 3, JUNIO: 4, JULIO: 5, AGOSTO: 6,
  SETIEMBRE: 7, SEPTIEMBRE: 7, OCTUBRE: 8, NOVIEMBRE: 9, DICIEMBRE: 10
};
const esSinFecha = (o) => norm(o.mes_control) === 'SIN FECHA';
const rangoObs = (o) => (esSinFecha(o) ? 0 : (RANGO_MES[norm(o.mes_control)] || 0));
const fechaObs = (o) => (esSinFecha(o) ? '' : String(o.fecha_registro || '').slice(0, 10));

// Se manejan aparte (no se completan ni se comparan) y se recalculan en cada carga (no se guardan como diferencia)
const MANEJADOS = new Set(['id', 'fila_excel', 'appointments', 'observations', 'conditions', 'diagnosticos', 'nota_duplicado_padron', 'fusion_dni']);
const DERIVADOS = new Set(['semaforo', 'semaforo_guardado', 'dias_restantes', 'dias_vencido', 'recomendacion']);

function indexar(lista) {
  const m = new Map();
  for (const x of lista || []) {
    const k = String(x.patient_id);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

function agruparPor(patients, claveDe) {
  const m = new Map();
  for (const p of patients) {
    const k = claveDe(p);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(p);
  }
  return [...m.values()].filter((g) => g.length > 1);
}
const agruparPorDni = (patients) => agruparPor(patients, (p) => (p.dni === null || p.dni === undefined ? '' : String(p.dni).trim()));

function mismaIdentidad(rows) {
  const a = rows[0];
  return rows.every((r) => {
    if (norm(r.apellidos_nombres) !== norm(a.apellidos_nombres)) return false;
    if (!vacio(r.sexo) && !vacio(a.sexo) && r.sexo !== a.sexo) return false;
    if (!vacio(r.fecha_nacimiento) && !vacio(a.fecha_nacimiento) && r.fecha_nacimiento !== a.fecha_nacimiento) return false;
    return true;
  });
}

/** Control más reciente de una fila (mes y, dentro del mes, fecha). */
function controlDe(obs) {
  let mejor = { rango: 0, fecha: '' };
  for (const o of obs) {
    const rango = rangoObs(o);
    const fecha = fechaObs(o);
    if (rango > mejor.rango || (rango === mejor.rango && fecha > mejor.fecha)) mejor = { rango, fecha };
  }
  return mejor;
}

/** { orden, por }: orden > 0 si a es más reciente que b; por = criterio que decidió. */
function compararControl(a, b) {
  if (a.control.rango !== b.control.rango) return { orden: a.control.rango - b.control.rango, por: 'mes' };
  if (a.control.fecha !== b.control.fecha) return { orden: a.control.fecha > b.control.fecha ? 1 : -1, por: 'fecha' };
  return { orden: (Number(a.row.fila_excel) || 0) - (Number(b.row.fila_excel) || 0), por: 'fila' };
}

// Campos de identidad y contacto que se pueden completar desde otra fila si la vigente los tiene vacíos.
// Los clínicos (laboratorio, PA, tratamiento) NO se mezclan entre filas: quedan con la fila vigente.
const COMPLETABLES = ['sexo', 'edad', 'fecha_nacimiento', 'telefono', 'direccion', 'direccion_dnt', 'direccion_hosix',
  'sector_padron', 'distrito', 'historia_clinica', 'financiador'];

function obsPropias(row, topPorPaciente) {
  const vistos = new Set();
  const salida = [];
  for (const o of [].concat(topPorPaciente.get(String(row.id)) || [], (row.observations || []).filter((x) => String(x.patient_id) === String(row.id)))) {
    const k = J(o);
    if (!vistos.has(k)) { vistos.add(k); salida.push(o); }
  }
  return salida;
}

function citasPropias(row, topPorPaciente) {
  const vistos = new Set();
  const salida = [];
  for (const c of [].concat(topPorPaciente.get(String(row.id)) || [], (row.appointments || []).filter((x) => String(x.patient_id) === String(row.id)))) {
    const k = J(c);
    if (!vistos.has(k)) { vistos.add(k); salida.push(c); }
  }
  return salida;
}

/** Fusiona un grupo de filas con el mismo DNI. Devuelve { merged, topObs, topCit, topCon, info }. */
function fusionarGrupo(rows, top) {
  const filas = rows.map((row) => ({ row, obs: obsPropias(row, top.obs), cit: citasPropias(row, top.cit) }));
  filas.forEach((f) => { f.control = controlDe(f.obs); });

  // Fila vigente: la de control más reciente
  const ordenadas = filas.slice().sort((a, b) => compararControl(b, a).orden);
  const vig = ordenadas[0];
  const segunda = ordenadas[1];
  const decide = compararControl(vig, segunda);
  const otras = ordenadas.slice(1);

  // Confianza: se pide revisión si falta el mes del control, si decidió el desempate por fila o si el orden por fecha sola contradice
  const sinMes = filas.some((f) => f.control.rango === 0);
  const fechaSola = (a, b) => (a.control.fecha === b.control.fecha ? 0 : a.control.fecha > b.control.fecha ? 1 : -1);
  const contradice = otras.some((o) => fechaSola(vig, o) < 0);
  const motivos = [];
  if (sinMes) motivos.push('un control sin mes («SIN FECHA»): su fecha es imputada');
  if (decide.por === 'fila') motivos.push('empate de mes y fecha; decidió el número de fila');
  if (contradice) motivos.push('la fecha sola indicaría otra fila');
  const confianza = motivos.length ? 'revisar' : 'alta';

  const merged = clonar(vig.row);
  const idVig = String(vig.row.id);

  // Datos de identidad/contacto vacíos en la vigente, completados desde las otras filas (de la más reciente a la más antigua)
  const completados = [];
  for (const k of COMPLETABLES) {
    if (!vacio(merged[k])) continue;
    for (const o of otras) {
      if (!vacio(o.row[k])) { merged[k] = clonar(o.row[k]); completados.push(k); break; }
    }
  }

  // Atenciones: todas las distintas. Solo se quitan copias exactas.
  const candidatas = [];
  for (const f of [vig].concat(otras)) for (const o of f.obs) candidatas.push(o);
  // las embebidas de todas las filas también cuentan (cada fila trae la atención de la otra)
  for (const f of filas) for (const o of f.row.observations || []) candidatas.push(o);
  const porContenido = new Map();
  const idsUsados = new Set();
  let copiasExactas = 0;
  let copiasOtroId = 0;
  let idsReasignados = 0;
  const obs = [];
  for (const o of candidatas) {
    const completo = J(Object.assign({}, o, { patient_id: idVig }));
    const clave = sinIdPid(o);
    if (porContenido.has(clave)) {
      if (porContenido.get(clave) === o.id) copiasExactas++; else copiasOtroId++;
      continue;
    }
    const nuevo = Object.assign({}, clonar(o), { patient_id: idVig });
    if (idsUsados.has(nuevo.id)) { nuevo.id = nuevo.id + '-u' + (++idsReasignados); }
    idsUsados.add(nuevo.id);
    porContenido.set(clave, o.id);
    obs.push(nuevo);
    void completo;
  }
  obs.sort((a, b) => (rangoObs(a) - rangoObs(b)) || String(fechaObs(a)).localeCompare(String(fechaObs(b))));

  // Cita: la de la fila vigente (si no tiene ninguna, la más reciente de las otras)
  let citas = vig.cit.map((c) => Object.assign({}, clonar(c), { patient_id: idVig }));
  let citaDeOtraFila = false;
  if (citas.length === 0) {
    const todas = otras.flatMap((o) => o.cit);
    const ult = Semaforo.ultimaPorFecha(todas, 'fecha_cita');
    if (ult) { citas = [Object.assign({}, clonar(ult), { patient_id: idVig })]; citaDeOtraFila = true; }
  }
  const fechasConservadas = new Set(citas.map((c) => String(c.fecha_cita)));
  const descartadas = [];
  for (const f of otras) {
    for (const c of f.cit) {
      if (!fechasConservadas.has(String(c.fecha_cita))) descartadas.push({ fila_excel: f.row.fila_excel, id: c.id, fecha_cita: c.fecha_cita, estado: c.estado });
    }
  }
  const citaDescartadaMasTardia = descartadas.some((c) => citas[0] && String(c.fecha_cita) > String(citas[0].fecha_cita));

  // Diagnósticos: unión de los de todas las filas
  const conds = [];
  const codigos = new Set();
  for (const f of [vig].concat(otras)) {
    const lista = [].concat(top.con.get(String(f.row.id)) || [], f.row.conditions || []);
    for (const c of lista) {
      if (!codigos.has(c.cie10_cod)) { codigos.add(c.cie10_cod); const { patient_id, ...resto } = clonar(c); conds.push(resto); }
    }
  }
  const diag = [];
  for (const f of [vig].concat(otras)) for (const d of f.row.diagnosticos || []) if (!diag.includes(d)) diag.push(d);
  const diagnosticosAgregados = diag.length > (vig.row.diagnosticos || []).length || conds.length > (vig.row.conditions || []).length;

  // Diferencias de las filas no vigentes (trazabilidad)
  const diferencias = {};
  for (const o of otras) {
    const dif = {};
    for (const k of new Set(Object.keys(o.row).concat(Object.keys(merged)))) {
      if (MANEJADOS.has(k) || DERIVADOS.has(k)) continue;
      if (!vacio(o.row[k]) && J(o.row[k]) !== J(merged[k])) dif[k] = clonar(o.row[k]);
    }
    diferencias['fila_' + o.row.fila_excel] = dif;
  }

  const filasExcel = filas.map((f) => f.row.fila_excel).sort((a, b) => a - b);
  merged.appointments = citas;
  merged.observations = obs;
  merged.conditions = conds;
  merged.diagnosticos = diag;
  merged.nota_duplicado_padron = 'Paciente unificado desde ' + rows.length + ' filas del Excel Padrón DNT (Filas ' + filasExcel.join(', ') +
    '); datos vigentes de la fila ' + vig.row.fila_excel + ' (control más reciente).';
  merged.fusion_dni = {
    fecha: HOY_TXT,
    filas_excel: filasExcel,
    id_vigente: idVig,
    ids_anteriores: rows.map((r) => r.id).filter((i) => String(i) !== idVig),
    criterio: decide.por,
    confianza,
    motivos_revision: motivos,
    citas_descartadas: descartadas,
    campos_completados: completados,
    diferencias
  };

  return {
    merged,
    topObs: obs,
    topCit: citas,
    topCon: conds.map((c) => Object.assign({ patient_id: idVig }, c)),
    info: { filas: filasExcel, vigente: vig.row.fila_excel, criterio: decide.por, confianza, motivos, copiasExactas, copiasOtroId,
      idsReasignados, descartadas: descartadas.length, citaDescartadaMasTardia, citaDeOtraFila, diagnosticosAgregados, completados,
      obsAntes: new Set(candidatas.map((o) => J(o))).size, obsDespues: obs.length }
  };
}

const cuenta = (arr, fn) => { const m = new Map(); for (const x of arr) { const k = fn(x); m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].map(([k, n]) => k + '=' + n).join(', ') || '(ninguno)'; };

function leerSample() {
  const txt = fs.readFileSync(RUTA_SAMPLE, 'utf8');
  const m = txt.match(/^([\s\S]*?const SAMPLE_PATIENTS = )(\[[\s\S]*?\n\]);(\r?\n[\s\S]*)$/);
  if (!m) throw new Error('No se reconoció la estructura de sampleDataset.js');
  return { cabeza: m[1], arreglo: JSON.parse(m[2]), cola: m[3] };
}

function escribirAtomico(ruta, contenido) {
  const tmp = ruta + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, contenido, 'utf8');
  fs.renameSync(tmp, ruta);
}

function validar(antes, despues, store, grupos) {
  const errores = [];
  const unidas = grupos.reduce((s, g) => s + g.length - 1, 0);
  if (despues.patients.length !== antes.patients.length - unidas) errores.push('Total de pacientes inesperado');
  const ids = despues.patients.map((p) => p.id);
  if (new Set(ids).size !== ids.length) errores.push('Hay ids de paciente repetidos');
  const dnis = despues.patients.map((p) => String(p.dni || '').trim()).filter(Boolean);
  const repetidosRestantes = [...new Set(dnis.filter((d, i) => dnis.indexOf(d) !== i))];
  const idsSet = new Set(ids);
  for (const [nombre, lista] of [['observations', despues.observations], ['appointments', despues.appointments], ['conditions', despues.conditions]]) {
    const huerf = lista.filter((x) => !idsSet.has(String(x.patient_id))).length;
    if (huerf) errores.push(nombre + ': ' + huerf + ' registros huérfanos');
  }
  const oid = despues.observations.map((o) => o.id);
  if (new Set(oid).size !== oid.length) errores.push('Hay ids de atención repetidos');
  // Cada atención distinta de antes sigue existiendo después (por contenido, ignorando id y paciente)
  // Comparación estricta: id + contenido (sin el paciente, que cambia al unificar). Incluye lo embebido en cada paciente.
  const antesSet = new Set();
  for (const o of antes.observations) antesSet.add(sinPid(o));
  for (const p of antes.patients) for (const o of p.observations || []) antesSet.add(sinPid(o));
  const despuesSet = new Set(despues.observations.map(sinPid));
  const perdidas = [...antesSet].filter((k) => !despuesSet.has(k)).length;
  if (perdidas) errores.push('Se perdieron ' + perdidas + ' atenciones distintas');
  // Lo embebido coincide con lo de nivel superior
  const topObs = indexar(despues.observations); const topCit = indexar(despues.appointments); const topCon = indexar(despues.conditions);
  let incoh = 0;
  for (const p of despues.patients) {
    const id = String(p.id);
    if ((p.observations || []).length !== (topObs.get(id) || []).length) incoh++;
    if ((p.appointments || []).length !== (topCit.get(id) || []).length) incoh++;
    if ((p.conditions || []).length !== (topCon.get(id) || []).length) incoh++;
  }
  if (incoh) errores.push(incoh + ' pacientes con datos embebidos distintos de los de nivel superior');
  return { errores, perdidas, repetidosRestantes: repetidosRestantes.length, atencionesAntes: antesSet.size, atencionesDespues: despuesSet.size };
}

function construir(store) {
  const top = { obs: indexar(store.observations), cit: indexar(store.appointments), con: indexar(store.conditions) };
  const todos = agruparPorDni(store.patients);
  const grupos = [];
  const noUnidos = [];
  for (const g of todos) { if (mismaIdentidad(g)) grupos.push(g); else noUnidos.push(g); }

  const resultados = grupos.map((g) => fusionarGrupo(g, top));
  const idsFuera = new Set();
  const porPrimerId = new Map();
  grupos.forEach((g, i) => { g.forEach((r) => idsFuera.add(String(r.id))); porPrimerId.set(String(g[0].id), resultados[i]); });

  const patients = [];
  for (const p of store.patients) {
    const id = String(p.id);
    if (porPrimerId.has(id)) { patients.push(porPrimerId.get(id).merged); continue; }
    if (idsFuera.has(id)) continue;
    patients.push(p);
  }
  Semaforo.aplicarSemaforo(resultados.map((r) => r.merged), HOY);

  const sacar = (lista) => lista.filter((x) => !idsFuera.has(String(x.patient_id)));
  const nuevo = Object.assign({}, store, {
    patients,
    observations: sacar(store.observations).concat(resultados.flatMap((r) => r.topObs)),
    appointments: sacar(store.appointments).concat(resultados.flatMap((r) => r.topCit)),
    conditions: sacar(store.conditions).concat(resultados.flatMap((r) => r.topCon))
  });
  return { nuevo, grupos, noUnidos, resultados };
}

function main() {
  const store = JSON.parse(fs.readFileSync(RUTA_STORE, 'utf8'));
  const sample = leerSample();
  const mismoSample = J(sample.arreglo) === J(store.patients);

  console.log('Consolidación de DNI repetidos (' + (APLICAR ? 'APLICAR' : 'SIMULACRO, no escribe nada') + '). Hoy de referencia: ' + HOY_TXT);
  console.log('Registros antes: ' + store.patients.length + ' | atenciones: ' + store.observations.length + ' | citas: ' + store.appointments.length);
  console.log('store.json y sampleDataset.js tienen los mismos pacientes: ' + (mismoSample ? 'SÍ' : 'NO (se detiene: no es seguro unificar dos fuentes distintas)'));
  if (!mismoSample) process.exit(2);

  const { nuevo, grupos, noUnidos, resultados } = construir(store);
  const infos = resultados.map((r) => r.info);
  const v = validar(store, nuevo, store, grupos);

  console.log('\n== Grupos ==');
  console.log('  DNI repetidos: ' + (grupos.length + noUnidos.length) + ' | unidos: ' + grupos.length + ' | no unidos por identidad distinta: ' + noUnidos.length);
  console.log('  Tamaño de los grupos unidos -> ' + cuenta(grupos, (g) => g.length + ' filas'));
  console.log('\n== Quién queda como vigente ==');
  console.log('  Criterio que decidió -> ' + cuenta(infos, (i) => i.criterio));
  console.log('  Confianza -> ' + cuenta(infos, (i) => i.confianza));
  const rev = infos.filter((i) => i.confianza === 'revisar');
  for (const i of rev) console.log('  REVISAR filas ' + i.filas.join(' y ') + ' (vigente: fila ' + i.vigente + '): ' + i.motivos.join('; '));
  console.log('\n== Atenciones (lo que usted pidió vigilar) ==');
  console.log('  Atenciones distintas antes: ' + v.atencionesAntes + ' | después: ' + v.atencionesDespues + ' | perdidas: ' + v.perdidas);
  console.log('  Filas de atención en store.json antes: ' + store.observations.length + ' | después: ' + nuevo.observations.length + ' (copias exactas eliminadas: ' + (store.observations.length - nuevo.observations.length) + ')');
  console.log('  Atenciones por persona unida (cada fila aportaba la suya) -> ' + cuenta(infos, (i) => i.obsDespues + ' atenciones'));
  console.log('  Copias con otro id y mismo contenido eliminadas: ' + infos.reduce((s, i) => s + i.copiasOtroId, 0) + ' | ids reasignados: ' + infos.reduce((s, i) => s + i.idsReasignados, 0));
  const mismoDia = grupos.filter((g) => { const f = g.map((r) => new Set((r.observations || []).filter((o) => String(o.patient_id) === String(r.id)).map((o) => o.fecha_registro))); return [...f[0]].some((x) => f[1] && f[1].has(x)); }).length;
  console.log('  Personas cuyas dos filas traen un control con la MISMA fecha pero valores distintos (se conservan ambos): ' + mismoDia);
  console.log('\n== Citas ==');
  console.log('  Citas descartadas (de filas no vigentes): ' + infos.reduce((s, i) => s + i.descartadas, 0) + ' | grupos donde la descartada era posterior a la conservada: ' + infos.filter((i) => i.citaDescartadaMasTardia).length);
  console.log('  Grupos donde la vigente no tenía cita y se tomó la de otra fila: ' + infos.filter((i) => i.citaDeOtraFila).length);
  const citaPosterior = infos.filter((i) => i.citaDescartadaMasTardia);
  if (citaPosterior.length) console.log('  Filas del Excel con cita descartada posterior (revisar si el paciente ya tiene otra cita): ' + citaPosterior.map((i) => i.filas.join('/')).join(', '));
  console.log('\n== Diagnósticos ==');
  console.log('  Grupos donde se sumaron diagnósticos de la otra fila: ' + infos.filter((i) => i.diagnosticosAgregados).length);
  console.log('\n== Resultado ==');
  console.log('  Registros después: ' + nuevo.patients.length + ' | DNI repetidos que quedan: ' + v.repetidosRestantes);
  console.log('  Semaforo (recalculado con hoy) -> ' + cuenta(nuevo.patients.filter((p) => p.fusion_dni), (p) => p.semaforo));
  console.log('  Validaciones: ' + (v.errores.length ? 'FALLAN -> ' + v.errores.join(' | ') : 'todas correctas (sin huérfanos, sin ids repetidos, embebido = nivel superior, 0 atenciones perdidas)'));
  if (v.errores.length) process.exit(3);

  if (!APLICAR) { console.log('\nSimulacro terminado. Para escribir: --aplicar --respaldo=<carpeta fuera de OneDrive>'); return; }

  if (!RESPALDO) { console.error('Falta --respaldo=<carpeta>. No se escribió nada.'); process.exit(4); }
  const rutaResp = path.resolve(RESPALDO);
  if (/onedrive/i.test(rutaResp)) { console.error('El respaldo no debe estar dentro de OneDrive (datos reales, Ley 29733). No se escribió nada.'); process.exit(4); }
  fs.mkdirSync(rutaResp, { recursive: true });
  const sello = new Date().toISOString().replace(/[:.]/g, '-');
  const copias = [[RUTA_STORE, 'store.json'], [RUTA_SAMPLE, 'padron_inicial.js']].map(([o, n]) => {
    const dest = path.join(rutaResp, sello + '_' + n);
    fs.copyFileSync(o, dest);
    const h = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    if (h(o) !== h(dest)) throw new Error('La copia de respaldo de ' + n + ' no coincide');
    return dest;
  });
  console.log('\nRespaldo verificado (SHA-256) en: ' + rutaResp);
  copias.forEach((c) => console.log('  ' + path.basename(c)));

  nuevo.audit_logs = (nuevo.audit_logs || []).concat([{
    id: Date.now(),
    sistema_origen: 'CONSOLIDACION_DNI',
    evento: 'UNIFICACION_DNI_REPETIDOS',
    registros_antes: store.patients.length,
    registros_despues: nuevo.patients.length,
    grupos_unidos: grupos.length,
    atenciones_perdidas: v.perdidas,
    fecha: new Date().toISOString()
  }]);

  const conCRLF = (s) => s.replace(/\r?\n/g, '\r\n');
  escribirAtomico(RUTA_STORE, conCRLF(J(nuevo, null, 2)));

  let cabeza = sample.cabeza;
  cabeza = cabeza.replace(/(Padrón Nominal DNT Octubre 2026: )\d+ registros/, '$1' + (477 - grupos.reduce((s, g) => s + g.length - 1, 0)) + ' personas (477 filas del Excel)');
  cabeza = cabeza.replace(/(TOTAL PACIENTES GEORREFERENCIADOS: )\d+/, '$1' + nuevo.patients.length + ' (614 filas originales; ' + grupos.length + ' DNI unificados el ' + HOY_TXT + ')');
  escribirAtomico(RUTA_SAMPLE, cabeza + conCRLF(J(nuevo.patients, null, 2)) + ';' + sample.cola);
  console.log('Escrito: server/db/store.json y server/db/padron_inicial.js (' + nuevo.patients.length + ' registros).');
}

try {
  main();
} catch (err) {
  console.error('Error: ' + (err && err.message ? err.message : String(err)));
  process.exit(1);
}
