/**
 * testSemaforo.js
 * Pruebas de client/js/clinical/semaforo.js (única fuente de verdad del semáforo).
 * Usa solo pacientes inventados; no lee store.json ni client/js/data.
 * Ejecutar: node server/tests/testSemaforo.js
 */

const assert = require('assert');
const S = require('../../client/js/clinical/semaforo');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  OK    ' + name);
  } catch (e) {
    failed++;
    console.log('  FALLA ' + name + '\n        ' + e.message);
  }
}

const HOY = new Date(2026, 9, 21, 15, 30); // 21/10/2026 a media tarde (hora local)
const conCita = (fecha, extra) => Object.assign({ appointments: [{ fecha_cita: fecha }] }, extra || {});

console.log('Semáforo HEARTS unificado');

test('cita a más de 7 días -> verde', () => {
  const r = S.calcularSemaforo(conCita('2026-11-15'), HOY);
  assert.strictEqual(r.semaforo, 'green');
  assert.strictEqual(r.dias_restantes, 25);
});

test('cita en 7 días exactos -> amarillo; en 8 -> verde', () => {
  assert.strictEqual(S.calcularSemaforo(conCita('2026-10-28'), HOY).semaforo, 'yellow');
  assert.strictEqual(S.calcularSemaforo(conCita('2026-10-29'), HOY).semaforo, 'green');
});

test('cita hoy -> amarillo con 0 días (no rojo), aunque la hora ya pasó', () => {
  const r = S.calcularSemaforo(conCita('2026-10-21'), HOY);
  assert.strictEqual(r.semaforo, 'yellow');
  assert.strictEqual(r.dias_restantes, 0);
});

test('cita ayer -> rojo con 1 día vencido', () => {
  const r = S.calcularSemaforo(conCita('2026-10-20'), HOY);
  assert.strictEqual(r.semaforo, 'red');
  assert.strictEqual(r.dias_vencido, 1);
});

test('fecha yyyy-mm-dd se lee como fecha LOCAL (sin desfase de un día)', () => {
  const d = S.parseFechaLocal('2026-10-22');
  assert.strictEqual(d.getDate(), 22);
  assert.strictEqual(d.getHours(), 0);
});

test('fallecido -> negro, nunca rojo, aunque tenga cita vencida o no tenga cita', () => {
  assert.strictEqual(S.calcularSemaforo(conCita('2026-01-01', { fallecido: true }), HOY).semaforo, 'black');
  assert.strictEqual(S.calcularSemaforo({ fallecido: true }, HOY).semaforo, 'black');
});

test('fuente HOSIX -> morado', () => {
  assert.strictEqual(S.calcularSemaforo({ fuente: 'HOSIX' }, HOY).semaforo, 'purple');
});

test('sin cita o con fecha inválida -> gris', () => {
  assert.strictEqual(S.calcularSemaforo({ appointments: [] }, HOY).semaforo, 'gray');
  assert.strictEqual(S.calcularSemaforo(conCita('no-es-fecha'), HOY).semaforo, 'gray');
  assert.strictEqual(S.calcularSemaforo(null, HOY).semaforo, 'gray');
});

test('usa la cita más reciente por fecha, sin importar el orden, y no reordena la lista', () => {
  const p = { appointments: [{ fecha_cita: '2026-12-01', id: 'a' }, { fecha_cita: '2026-01-01', id: 'b' }] };
  assert.strictEqual(S.calcularSemaforo(p, HOY).semaforo, 'green');
  assert.strictEqual(p.appointments[0].id, 'a');
});

test('aplicarSemaforo recalcula, conserva el valor guardado y cuenta los cambios', () => {
  const lista = [
    conCita('2026-11-15', { semaforo: 'yellow', dias_restantes: 3 }),
    conCita('2026-11-15', { semaforo: 'green' }),
    { fallecido: true, semaforo: 'red' }
  ];
  const cambios = S.aplicarSemaforo(lista, HOY);
  assert.strictEqual(cambios, 2);
  assert.strictEqual(lista[0].semaforo, 'green');
  assert.strictEqual(lista[0].semaforo_guardado, 'yellow');
  assert.strictEqual(lista[0].dias_restantes, 25);
  assert.strictEqual(lista[1].semaforo_guardado, undefined);
  assert.strictEqual(lista[2].semaforo, 'black');
});

console.log('\nResultado: ' + passed + ' correctas, ' + failed + ' con falla');
process.exit(failed === 0 ? 0 : 1);
