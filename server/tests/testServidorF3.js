/**
 * testServidorF3.js
 * Fase 4b, parte del servidor: correcciones de los hallazgos de la Fase 3 (docs/produccion/F3_cliente_clinica.md).
 *   K3-02  «Fallecido» (lo único que envía la interfaz) fija fallecido=true y deja de contar como desertor
 *   P3-06  pérdida de datos: dos usuarios que guardan una atención del mismo paciente con listas distintas
 *   P3-09  rótulo del diagnóstico según el CÓDIGO y fecha de diagnóstico original conservada
 *   P3-13  un coordinador de un establecimiento no puede sacar a su paciente de su alcance
 *   P3-12  guardar revela que el documento existe en otra red (aceptado: se documenta con una prueba)
 *   K3-04  frecuencia_hearts por omisión en /patients/geo
 *   C3-01  nota_duplicado_padron rechaza < y >
 *   C3-05  Referrer-Policy: strict-origin-when-cross-origin (los mosaicos de terceros solo reciben el origen; no-referrer rompería OSM)
 * Servidor REAL en el puerto 3141, con store.json bloqueado (blockDisk.js). Pacientes y usuarios inventados (DNI 96…).
 * Ejecutar: node server/tests/testServidorF3.js
 */

const assert = require('assert');
const { startServer } = require('./helpers/realServer');
const fechaLima = require('../../client/js/utils/fechaLima');

const PORT = 3141;
const ADMIN_PASS = 'clave-admin-de-prueba-f3s';
const SECRET = 'f3-' + 'q7Wm2Kx9Lp4Rt8Vz1Nc6Hb3Jd5Fs0Gy'.repeat(2);
const DNI_SYSTEM = 'urn:oid:2.16.840.1.113883.4.904';
const HOY = fechaLima.hoy();
const dia = n => fechaLima.hoy(n);

let passed = 0;
let failed = 0;
let BASE = '';

async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  OK    ' + name);
  } catch (e) {
    failed++;
    console.log('  FALLA ' + name + '\n        ' + e.message);
  }
}

async function call(method, url, { token, body } = {}) {
  const h = { 'X-Forwarded-For': '10.31.0.1' };
  if (token) h.Authorization = 'Bearer ' + token;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* no era JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}

async function login(username, password) {
  const r = await call('POST', '/api/auth/login', { body: { username, password } });
  assert.strictEqual(r.status, 200, r.text);
  return r.json.token;
}

async function crearUsuario(admin, username, red, extra) {
  const password = 'clave-de-' + username + '-123';
  const r = await call('POST', '/api/users', { token: admin, body: Object.assign({ username, nombre: 'USUARIO ' + username.toUpperCase(), correo: username + '@prueba.example', role: 'COORDINADOR', red, password }, extra || {}) });
  assert.strictEqual(r.status, 201, r.text);
  return login(username, password);
}

/** Paciente inventado listo para /api/padron/importar-lote. */
function pac(dni, extra) {
  return Object.assign({
    id: 'pac-f3-' + dni, dni, tipo_documento: 'DNI', apellidos_nombres: 'PACIENTE INVENTADO ' + dni,
    red_salud: 'PACIFICO SUR', sexo: 'Femenino', fecha_nacimiento: '1962-04-10', latitud: -10.0478, longitud: -78.1548
  }, extra || {});
}

const guardar = (token, registro) => call('POST', '/api/padron/importar-lote', { token, body: { patients: [registro] } });
const cronicos = async token => (await call('GET', '/api/cronicos', { token })).json;
const buscar = async (token, dni) => (await cronicos(token)).find(p => String(p.dni) === dni);
const geo = async (token, dni) => {
  const r = await call('GET', '/api/patients/geo', { token });
  const f = (r.json.features || []).find(x => String(x.properties.dni) === dni);
  return f ? f.properties : null;
};
const alertas = async token => (await call('GET', '/api/alerts/summary', { token })).json.alertas;
const valores = lista => lista.map(o => `${o.pa_sistolica}/${o.pa_diastolica}`).sort();

async function main() {
  console.log('Fase 4b, servidor: correcciones de los hallazgos de la Fase 3\n');
  const srv = await startServer({
    port: PORT,
    env: { NODE_ENV: 'production', AUTH_SECRET: SECRET, ADMIN_USER: 'admin', ADMIN_PASSWORD: ADMIN_PASS, ADMIN_RESET: '', TRUST_PROXY: 'true', CORS_ORIGINS: '' }
  });
  BASE = srv.base;
  try {
    const admin = await login('admin', ADMIN_PASS);
    const coordPs = await crearUsuario(admin, 'f3.coord.ps', '156');
    const coordPn = await crearUsuario(admin, 'f3.coord.pn', '157');
    const coordE44 = await crearUsuario(admin, 'f3.coord.e44', '156', { establecimiento_id: '00001744' });
    const coordS6 = await crearUsuario(admin, 'f3.coord.s6', '156', { sector_sanitario: 'Sector 6' });

    // ------------------------------------------------------------------------------------------------ K3-02
    await step('K3-02 «Fallecido» sin la bandera: fallecido=true, sale negro y suma en fallecidos (no en desertores)', async () => {
      assert.strictEqual((await guardar(admin, pac('96310001', { estado_paciente: 'Activo', appointments: [{ fecha_cita: dia(-20), estado: 'booked' }] }))).status, 200);
      const antes = await alertas(admin);
      const r = await guardar(admin, pac('96310002', { estado_paciente: 'Fallecido', appointments: [{ fecha_cita: dia(-20), estado: 'booked' }] }));
      assert.strictEqual(r.status, 200, r.text);
      const despues = await alertas(admin);
      assert.strictEqual(despues.fallecidos_negro, antes.fallecidos_negro + 1, 'fallecidos: ' + JSON.stringify({ antes, despues }));
      assert.strictEqual(despues.desertores_rojo, antes.desertores_rojo, 'desertores: ' + JSON.stringify({ antes, despues }));
      assert.strictEqual((await geo(admin, '96310002')).semaforo, 'black');
      assert.strictEqual((await geo(admin, '96310001')).semaforo, 'red', 'el activo con la misma cita vencida sigue siendo desertor');
      const p = await buscar(admin, '96310002');
      assert.strictEqual(p.fallecido, true);
      assert.strictEqual(p.estado_paciente, 'Fallecido');
    });
    await step('K3-02 el estado se reconoce con mayúsculas o espacios («  FALLECIDO »)', async () => {
      assert.strictEqual((await guardar(admin, pac('96310006', { estado_paciente: '  FALLECIDO ' }))).status, 200);
      assert.strictEqual((await buscar(admin, '96310006')).fallecido, true);
      assert.strictEqual((await geo(admin, '96310006')).semaforo, 'black');
    });
    await step('K3-02 una bandera explícita se respeta (fallecido:true con estado «Activo» sigue fallecido)', async () => {
      assert.strictEqual((await guardar(admin, pac('96310003', { estado_paciente: 'Activo', fallecido: true }))).status, 200);
      assert.strictEqual((await buscar(admin, '96310003')).fallecido, true);
      assert.strictEqual((await geo(admin, '96310003')).semaforo, 'black');
    });
    await step('K3-02 un texto «true»/«false» se normaliza a booleano y un valor sin sentido se rechaza con 400', async () => {
      assert.strictEqual((await guardar(admin, pac('96310007', { fallecido: 'true' }))).status, 200);
      assert.strictEqual((await buscar(admin, '96310007')).fallecido, true);
      const r = await guardar(admin, pac('96310008', { fallecido: 'tal vez' }));
      assert.strictEqual(r.status, 400, r.text);
      assert.ok(/fallecido/.test(r.text), r.text);
    });
    await step('K3-02 lectura de un registro contradictorio (fallecido:false pero estado «Fallecido»): cuenta como fallecido', async () => {
      assert.strictEqual((await guardar(admin, pac('96310004', { estado_paciente: 'Fallecido', fallecido: false, appointments: [{ fecha_cita: dia(-30), estado: 'booked' }] }))).status, 200);
      assert.strictEqual((await geo(admin, '96310004')).semaforo, 'black');
      assert.strictEqual((await buscar(admin, '96310004')).fallecido, true);
    });
    await step('K3-02 volver a «Activo» (sin bandera explícita) quita la marca de fallecido; sin estado no se toca', async () => {
      assert.strictEqual((await guardar(admin, pac('96310005', { estado_paciente: 'Fallecido' }))).status, 200);
      assert.strictEqual((await buscar(admin, '96310005')).fallecido, true);
      // Un guardado que no informa el estado no cambia la marca
      assert.strictEqual((await guardar(admin, pac('96310005', { telefono: '911222333' }))).status, 200);
      assert.strictEqual((await buscar(admin, '96310005')).fallecido, true);
      // El estado «Activo» informado por el usuario la corrige
      assert.strictEqual((await guardar(admin, pac('96310005', { estado_paciente: 'Activo' }))).status, 200);
      assert.strictEqual((await buscar(admin, '96310005')).fallecido, false);
    });
    await step('K3-02 FHIR: el paciente fallecido sale con deceasedBoolean=true y active=false', async () => {
      const p = await buscar(admin, '96310002');
      const b = (await call('GET', '/fhir/Patient/' + encodeURIComponent(p.id), { token: admin })).json;
      const patient = b.entry[0].resource;
      assert.strictEqual(patient.deceasedBoolean, true);
      assert.strictEqual(patient.active, false);
    });

    // ------------------------------------------------------------------------------------------------ P3-06
    await step('P3-06 (D9) dos usuarios guardan una atención del mismo paciente con listas distintas: sobreviven las dos', async () => {
      const ID = 'pac-f3-96320001';
      const viejo = { fecha_registro: dia(-15), pa_sistolica: 122, pa_diastolica: 76, estado_control: 'Controlado' };
      assert.strictEqual((await guardar(admin, pac('96320001', { observations: [viejo], appointments: [{ fecha_cita: dia(30), estado: 'booked' }] }))).status, 200);
      // A y B abren al paciente con la misma lista (la que devolvió el servidor)
      const listaA = await buscar(coordPs, '96320001');
      const listaB = await buscar(admin, '96320001');
      assert.strictEqual(listaA.observations.length, 1);
      // B guarda 111/71 y una cita; el cliente pone lo nuevo al principio de la lista
      const rb = await guardar(admin, pac('96320001', {
        observations: [{ fecha_registro: HOY, pa_sistolica: 111, pa_diastolica: 71, estado_control: 'Controlado' }, ...listaB.observations],
        appointments: [{ fecha_cita: dia(25), estado: 'booked' }, ...listaB.appointments]
      }));
      assert.strictEqual(rb.status, 200, rb.text);
      // A, con la lista vieja (sin la atención de B), guarda 133/83 el mismo día y otra cita
      const ra = await guardar(coordPs, pac('96320001', {
        observations: [{ fecha_registro: HOY, pa_sistolica: 133, pa_diastolica: 83, estado_control: 'No Controlado' }, ...listaA.observations],
        appointments: [{ fecha_cita: dia(20), estado: 'booked' }, ...listaA.appointments]
      }));
      assert.strictEqual(ra.status, 200, ra.text);
      const fin = await buscar(admin, '96320001');
      assert.strictEqual(fin.id, ID);
      assert.deepStrictEqual(valores(fin.observations), ['111/71', '122/76', '133/83'], 'controles: ' + JSON.stringify(fin.observations));
      assert.deepStrictEqual(fin.appointments.map(a => a.fecha_cita).sort(), [dia(20), dia(25), dia(30)].sort(), 'citas: ' + JSON.stringify(fin.appointments));
    });
    await step('P3-06 idempotencia: guardar dos veces el mismo registro, o devolver lo que el servidor entregó, no duplica', async () => {
      const cuerpo = pac('96320002', {
        observations: [{ fecha_registro: HOY, pa_sistolica: 150, pa_diastolica: 95, hba1c: 7.4, estado_control: 'No Controlado' }, { fecha_registro: dia(-40), pa_sistolica: 140, pa_diastolica: 90 }],
        appointments: [{ fecha_cita: dia(30), estado: 'booked' }]
      });
      assert.strictEqual((await guardar(admin, cuerpo)).status, 200);
      assert.strictEqual((await guardar(admin, cuerpo)).status, 200);
      let p = await buscar(admin, '96320002');
      assert.strictEqual(p.observations.length, 2, JSON.stringify(p.observations));
      assert.strictEqual(p.appointments.length, 1, JSON.stringify(p.appointments));
      // El cliente devuelve la lista tal cual la recibió (con ids y patient_id) más una atención nueva
      assert.strictEqual((await guardar(admin, pac('96320002', {
        observations: [{ fecha_registro: dia(1), pa_sistolica: 128, pa_diastolica: 82 }, ...p.observations],
        appointments: p.appointments
      }))).status, 200);
      p = await buscar(admin, '96320002');
      assert.strictEqual(p.observations.length, 3, JSON.stringify(p.observations));
      assert.strictEqual(p.appointments.length, 1);
      // Y otra vez lo mismo
      assert.strictEqual((await guardar(admin, pac('96320002', { observations: p.observations, appointments: p.appointments }))).status, 200);
      p = await buscar(admin, '96320002');
      assert.strictEqual(p.observations.length, 3);
      assert.strictEqual(p.appointments.length, 1);
    });
    await step('P3-06 lo guardado no se borra por omisión: una lista que solo trae lo nuevo conserva lo anterior', async () => {
      assert.strictEqual((await guardar(admin, pac('96320002', { observations: [{ fecha_registro: dia(2), pa_sistolica: 118, pa_diastolica: 76 }], appointments: [{ fecha_cita: dia(60), estado: 'booked' }] }))).status, 200);
      const p = await buscar(admin, '96320002');
      assert.strictEqual(p.observations.length, 4, JSON.stringify(p.observations));
      assert.strictEqual(p.appointments.length, 2, JSON.stringify(p.appointments));
      assert.ok(p.observations.some(o => o.pa_sistolica === 150 && o.hba1c === 7.4), 'la atención con HbA1c sigue');
      // Sin la clave observations (o vacía) tampoco se borra nada
      assert.strictEqual((await guardar(admin, pac('96320002', { observations: [], appointments: [] }))).status, 200);
      assert.strictEqual((await guardar(admin, pac('96320002', { telefono: '911000222' }))).status, 200);
      const q = await buscar(admin, '96320002');
      assert.strictEqual(q.observations.length, 4);
      assert.strictEqual(q.appointments.length, 2);
    });
    await step('P3-06 dos atenciones del mismo día con valores distintos se conservan; la misma con otro estado se actualiza', async () => {
      assert.strictEqual((await guardar(admin, pac('96320003', { observations: [{ fecha_registro: HOY, pa_sistolica: 160, pa_diastolica: 100, estado_control: 'No Controlado' }] }))).status, 200);
      assert.strictEqual((await guardar(admin, pac('96320003', { observations: [{ fecha_registro: HOY, pa_sistolica: 120, pa_diastolica: 78, estado_control: 'Controlado' }] }))).status, 200);
      // La misma medición (misma fecha y valores) con otra etiqueta no es otra atención
      assert.strictEqual((await guardar(admin, pac('96320003', { observations: [{ fecha_registro: HOY, pa_sistolica: 120, pa_diastolica: 78, estado_control: 'Sin Datos de Control en Padrón' }] }))).status, 200);
      const p = await buscar(admin, '96320003');
      assert.deepStrictEqual(valores(p.observations), ['120/78', '160/100'], JSON.stringify(p.observations));
    });
    await step('P3-06 un coordinador de otra red no puede tocar los controles de un paciente ajeno por este camino', async () => {
      const r = await guardar(coordPn, pac('96320001', { red_salud: 'PACIFICO NORTE', observations: [{ fecha_registro: HOY, pa_sistolica: 90, pa_diastolica: 60 }] }));
      assert.strictEqual(r.status, 403, r.text);
      const p = await buscar(admin, '96320001');
      assert.ok(!p.observations.some(o => o.pa_sistolica === 90));
    });

    await step('P3-06 datos antiguos (solo dentro del registro del paciente): al agregar el primer registro nuevo no se esconden', async () => {
      // La semilla y los datos anteriores a las tablas guardan sus controles, citas y diagnósticos DENTRO del paciente.
      // Se prueba en el mismo proceso (base en memoria, sin disco) con las rutas reales de Express en un puerto libre.
      const { db, resetDb, closeDb } = require('./helpers/memoryDb');
      const express = require('express');
      const apiRoutes = require('../routes/apiRoutes');
      resetDb();
      db.upsertPatient({
        id: 'pac-f3-antiguo', dni: '96370001', apellidos_nombres: 'PACIENTE INVENTADO ANTIGUO', red_salud: 'PACIFICO SUR', puerta_entrada_id: '00001741',
        observations: [{ id: 'obs-sim-1', patient_id: 'pac-f3-antiguo', fecha_registro: dia(-20), pa_sistolica: 122, pa_diastolica: 76, estado_control: 'Controlado' }],
        appointments: [{ id: 'app-sim-1', patient_id: 'pac-f3-antiguo', fecha_cita: dia(30), estado: 'booked' }],
        conditions: [{ cie10_cod: 'I10', diagnostico: 'Hipertensión Arterial Primaria' }]
      });
      assert.strictEqual(db.getPatientByDni('96370001').observations.length, 1);
      const app = express();
      app.use(express.json());
      app.use((req, res, next) => { req.user = { username: 'f3.proceso', role: 'ADMIN' }; req.auditContext = { actor: 'f3.proceso', ip: '127.0.0.1' }; next(); });
      app.use('/api', apiRoutes.router);
      const http = await new Promise(resolve => { const h = app.listen(0, '127.0.0.1', () => resolve(h)); });
      try {
        const r = await fetch(`http://127.0.0.1:${http.address().port}/api/padron/importar-lote`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patients: [{
            dni: '96370001', id: 'pac-f3-antiguo', red_salud: 'PACIFICO SUR',
            observations: [{ fecha_registro: HOY, pa_sistolica: 111, pa_diastolica: 71 }],
            appointments: [{ fecha_cita: dia(20), estado: 'booked' }],
            conditions: [{ cie10_cod: 'E11', diagnostico: 'Diabetes Mellitus Tipo 2' }]
          }] })
        });
        assert.strictEqual(r.status, 200, await r.text());
        const p = db.getPatientByDni('96370001');
        assert.deepStrictEqual(valores(p.observations), ['111/71', '122/76'], JSON.stringify(p.observations));
        assert.deepStrictEqual(p.appointments.map(a => a.fecha_cita).sort(), [dia(20), dia(30)].sort(), JSON.stringify(p.appointments));
        assert.deepStrictEqual(p.conditions.map(c => c.cie10_cod).sort(), ['E11', 'I10'], JSON.stringify(p.conditions));
        // Y reenviar lo que devolvió el servidor no duplica nada
        const r2 = await fetch(`http://127.0.0.1:${http.address().port}/api/padron/importar-lote`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patients: [{ dni: '96370001', id: 'pac-f3-antiguo', red_salud: 'PACIFICO SUR', observations: p.observations, appointments: p.appointments, conditions: p.conditions }] })
        });
        assert.strictEqual(r2.status, 200, await r2.text());
        const q = db.getPatientByDni('96370001');
        assert.strictEqual(q.observations.length, 2);
        assert.strictEqual(q.appointments.length, 2);
        assert.strictEqual(q.conditions.length, 2);
      } finally {
        await new Promise(resolve => http.close(resolve));
        resetDb();
        closeDb();
      }
    });

    // ------------------------------------------------------------------------------------------------ P3-09
    await step('P3-09 un diagnóstico antiguo conserva su fecha y su rótulo sale del código (E10 = Tipo 1, N18 = renal)', async () => {
      const ref = 'Patient/pac-00001741-96330001';
      const bundle = { resourceType: 'Bundle', type: 'transaction', entry: [
        { resource: { resourceType: 'Patient', id: 'pac-00001741-96330001', identifier: [{ system: DNI_SYSTEM, value: '96330001' }], name: [{ text: 'PACIENTE INVENTADO DX ANTIGUO' }], gender: 'male', birthDate: '1958-05-10' } },
        { resource: { resourceType: 'Condition', id: 'cond-f3-i10', code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'I10', display: 'Hipertensión Arterial' }] }, subject: { reference: ref }, onsetDateTime: '2019-03-01' } },
        { resource: { resourceType: 'Condition', id: 'cond-f3-e10', code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'E10', display: 'Diabetes mellitus tipo 1' }] }, subject: { reference: ref }, onsetDateTime: '2019-03-01' } }
      ] };
      assert.strictEqual((await call('POST', '/fhir/Bundle', { token: admin, body: bundle })).status, 200);
      // Lo que envía el Registro Clínico al guardar sin tocar: todo código de diabetes con el rótulo «Tipo 2»
      const r = await guardar(admin, { id: 'pac-00001741-96330001', dni: '96330001', red_salud: 'PACIFICO SUR', conditions: [
        { cie10_cod: 'I10', diagnostico: 'Hipertensión Arterial' },
        { cie10_cod: 'E10', diagnostico: 'Diabetes Mellitus Tipo 2' }
      ] });
      assert.strictEqual(r.status, 200, r.text);
      const p = await buscar(admin, '96330001');
      const e10 = p.conditions.find(c => c.cie10_cod === 'E10');
      const i10 = p.conditions.find(c => c.cie10_cod === 'I10');
      assert.strictEqual(p.conditions.length, 2, JSON.stringify(p.conditions));
      assert.strictEqual(e10.diagnostico, 'Diabetes Mellitus Tipo 1');
      assert.strictEqual(e10.fecha_diagnostico, '2019-03-01');
      assert.strictEqual(i10.fecha_diagnostico, '2019-03-01');
      assert.strictEqual(i10.diagnostico, 'Hipertensión Arterial');
    });
    await step('P3-09 un diagnóstico nuevo: E11 = Tipo 2, N18.3 = renal, código desconocido = el propio código; fecha de hoy', async () => {
      const r = await guardar(admin, { id: 'pac-00001741-96330001', dni: '96330001', red_salud: 'PACIFICO SUR', conditions: [
        { cie10_cod: 'E11', diagnostico: 'Diabetes Mellitus Tipo 2' },
        { cie10_cod: 'N18.3', diagnostico: 'Diabetes Mellitus Tipo 2' },
        { cie10_cod: 'J45', diagnostico: 'Diabetes Mellitus Tipo 2' }
      ] });
      assert.strictEqual(r.status, 200, r.text);
      const p = await buscar(admin, '96330001');
      const por = c => p.conditions.find(x => x.cie10_cod === c);
      assert.strictEqual(por('E11').diagnostico, 'Diabetes Mellitus Tipo 2');
      assert.strictEqual(por('N18.3').diagnostico, 'Enfermedad Renal Crónica');
      assert.strictEqual(por('J45').diagnostico, 'J45');
      for (const c of ['E11', 'N18.3', 'J45']) assert.strictEqual(por(c).fecha_diagnostico, HOY, c);
      // Los anteriores siguen con su fecha
      assert.strictEqual(por('E10').fecha_diagnostico, '2019-03-01');
      // Guardar otra vez no la mueve
      assert.strictEqual((await guardar(admin, { id: 'pac-00001741-96330001', dni: '96330001', red_salud: 'PACIFICO SUR', conditions: [{ cie10_cod: 'E11', diagnostico: 'Diabetes Mellitus Tipo 2' }] })).status, 200);
      assert.strictEqual((await buscar(admin, '96330001')).conditions.find(x => x.cie10_cod === 'E11').fecha_diagnostico, HOY);
    });

    // ------------------------------------------------------------------------------------------------ P3-13 y P3-12
    await step('P3-13 el coordinador de un establecimiento no puede mover a su paciente a otro (403) ni por el texto del control', async () => {
      assert.strictEqual((await guardar(admin, pac('96340001', { puerta_entrada_id: '00001744' }))).status, 200);
      assert.strictEqual((await buscar(admin, '96340001')).puerta_entrada_id, '00001744');
      const mover = await guardar(coordE44, pac('96340001', { puerta_entrada_id: '00001741' }));
      assert.strictEqual(mover.status, 403, mover.text);
      const porTexto = await guardar(coordE44, pac('96340001', { establecimiento_control: 'Hospital de Apoyo Huarmey (00001741, II-1)' }));
      assert.strictEqual(porTexto.status, 403, porTexto.text);
      const p = await buscar(admin, '96340001');
      assert.strictEqual(p.puerta_entrada_id, '00001744', 'el paciente no debe haberse movido');
      assert.ok((await cronicos(coordE44)).some(x => String(x.dni) === '96340001'), 'sigue en su alcance');
    });
    await step('P3-13 sin moverlo, el coordinador del establecimiento sigue guardando a su paciente (200)', async () => {
      const r = await guardar(coordE44, pac('96340001', { puerta_entrada_id: '00001744', telefono: '911000333' }));
      assert.strictEqual(r.status, 200, r.text);
      const r2 = await guardar(coordE44, pac('96340001', { telefono: '911000444' }));
      assert.strictEqual(r2.status, 200, r2.text);
      assert.strictEqual((await buscar(admin, '96340001')).telefono, '911000444');
    });
    await step('P3-13 el coordinador de red (sin establecimiento) sí puede moverlo dentro de su red; el ADMIN también', async () => {
      const r = await guardar(coordPs, pac('96340001', { puerta_entrada_id: '00001741' }));
      assert.strictEqual(r.status, 200, r.text);
      assert.strictEqual((await buscar(admin, '96340001')).puerta_entrada_id, '00001741');
      assert.strictEqual((await guardar(admin, pac('96340001', { puerta_entrada_id: '00001744' }))).status, 200);
      assert.strictEqual((await buscar(admin, '96340001')).puerta_entrada_id, '00001744');
    });
    await step('P3-13 lo mismo con el sector: el coordinador de un sector no lo saca de su sector (403); el de red sí', async () => {
      assert.strictEqual((await guardar(admin, pac('96340002', { sector_sanitario: 'Sector 6' }))).status, 200);
      const mover = await guardar(coordS6, pac('96340002', { sector_sanitario: 'Sector 62' }));
      assert.strictEqual(mover.status, 403, mover.text);
      assert.strictEqual((await buscar(admin, '96340002')).sector_sanitario, 'Sector 6');
      assert.strictEqual((await guardar(coordS6, pac('96340002', { sector_sanitario: 'Sector 6', telefono: '911000555' }))).status, 200);
      assert.strictEqual((await guardar(coordPs, pac('96340002', { sector_sanitario: 'Sector 62' }))).status, 200);
    });
    await step('P3-13 un coordinador de otra red no puede mover pacientes hacia su red ni fuera de la suya (sigue 403)', async () => {
      const r = await guardar(coordPs, pac('96340001', { red_salud: 'PACIFICO NORTE' }));
      assert.strictEqual(r.status, 403, r.text);
      assert.strictEqual((await buscar(admin, '96340001')).red_salud, 'PACIFICO SUR');
    });
    await step('P3-12 ACEPTADO: el documento de otra red responde 403 sin datos del paciente; uno inexistente se crea (200)', async () => {
      const existente = await guardar(coordPn, pac('96340001', { red_salud: 'PACIFICO NORTE', apellidos_nombres: 'OTRO NOMBRE' }));
      assert.strictEqual(existente.status, 403, existente.text);
      // El 403 no revela nada del paciente ajeno: ni su nombre, ni su red, ni su establecimiento
      assert.ok(!/INVENTADO|PACIFICO SUR|00001744|96340001/i.test(existente.text), existente.text);
      const nuevo = await guardar(coordPn, pac('96340099', { red_salud: 'PACIFICO NORTE' }));
      assert.strictEqual(nuevo.status, 200, nuevo.text);
      // La lectura sigue sin distinguir: otra red = inexistente (404 idéntico)
      const a = await call('GET', '/api/patients/96340001/eventos', { token: coordPn });
      const b = await call('GET', '/api/patients/96999999/eventos', { token: coordPn });
      assert.strictEqual(a.status, 404);
      assert.strictEqual(b.status, 404);
      assert.strictEqual(a.text, b.text);
    });

    // ------------------------------------------------------------------------------------------------ K3-04
    await step('K3-04 frecuencia_hearts por omisión: 90 solo si está «Controlado» Y estable; antes bastaba con «Controlado»', async () => {
      const obsC = [{ fecha_registro: dia(-10), pa_sistolica: 120, pa_diastolica: 70, estado_control: 'Controlado' }];
      const obsN = [{ fecha_registro: dia(-10), pa_sistolica: 170, pa_diastolica: 100, estado_control: 'No Controlado' }];
      const cita = [{ fecha_cita: dia(30), estado: 'booked' }];
      const casos = [
        ['96350001', { observations: obsC, appointments: cita, controlado_estable: 'No' }, 30],
        ['96350002', { observations: obsC, appointments: cita, controlado_estable: 'Sí' }, 90],
        ['96350003', { observations: obsN, appointments: cita, controlado_estable: 'Sí' }, 30],
        ['96350004', { observations: obsC, appointments: cita }, 30]
      ];
      for (const [dni, extra, esperado] of casos) {
        assert.strictEqual((await guardar(admin, pac(dni, extra))).status, 200);
        const g = await geo(admin, dni);
        assert.strictEqual(g.frecuencia_hearts, esperado, `${dni}: ${JSON.stringify(g)}`);
      }
    });
    await step('K3-04 el valor ya guardado del paciente no cambia (60 sigue en 60; 90 sigue en 90)', async () => {
      const obsC = [{ fecha_registro: dia(-10), pa_sistolica: 120, pa_diastolica: 70, estado_control: 'Controlado' }];
      assert.strictEqual((await guardar(admin, pac('96350005', { observations: obsC, frecuencia_hearts: 60, controlado_estable: 'No' }))).status, 200);
      assert.strictEqual((await guardar(admin, pac('96350006', { observations: obsC, frecuencia_hearts: 90, controlado_estable: 'No' }))).status, 200);
      assert.strictEqual((await geo(admin, '96350005')).frecuencia_hearts, 60);
      assert.strictEqual((await geo(admin, '96350006')).frecuencia_hearts, 90);
    });

    // ------------------------------------------------------------------------------------------------ C3-01
    await step('C3-01 nota_duplicado_padron rechaza < y > con 400; un texto normal pasa', async () => {
      for (const nota of ['<img src=x onerror=1>', 'a > b', '<button data-accion="btn-logout">x</button>']) {
        const r = await guardar(admin, pac('96360001', { nota_duplicado_padron: nota }));
        assert.strictEqual(r.status, 400, nota + ' → ' + r.text);
        assert.ok(/nota_duplicado_padron/.test(r.text), r.text);
      }
      const ok = await guardar(admin, pac('96360001', { nota_duplicado_padron: 'Duplicado con la historia HC-3011 (revisado en Admisión)' }));
      assert.strictEqual(ok.status, 200, ok.text);
      assert.strictEqual((await buscar(admin, '96360001')).nota_duplicado_padron, 'Duplicado con la historia HC-3011 (revisado en Admisión)');
    });
    await step('C3-01 los textos libres siguen aceptando < y > (por ejemplo «PA < 140»)', async () => {
      const r = await guardar(admin, pac('96360002', { observaciones: 'Meta PA < 140/90 y glucosa > 70' }));
      assert.strictEqual(r.status, 200, r.text);
      assert.strictEqual((await buscar(admin, '96360002')).observaciones, 'Meta PA < 140/90 y glucosa > 70');
    });

    // ------------------------------------------------------------------------------------------------ C3-05
    await step('C3-05 Referrer-Policy: strict-origin-when-cross-origin (solo el origen; nunca unsafe-url) en la página, en los estáticos y en la API', async () => {
      for (const url of ['/health', '/', '/js/main.js']) {
        const r = await call('GET', url);
        assert.strictEqual(r.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', url + ': ' + r.headers.get('referrer-policy'));
      }
      const api = await call('GET', '/api/alerts/summary', { token: admin });
      assert.strictEqual(api.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
      const sinSesion = await call('GET', '/api/cronicos');
      assert.strictEqual(sinSesion.status, 401);
      assert.strictEqual(sinSesion.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    });
  } finally {
    await srv.stop();
  }

  console.log(`\nResultado Servidor F3: ${passed} correctas, ${failed} con falla`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
