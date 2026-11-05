/**
 * Evidencia Fase 3 — ¿un paciente marcado «Fallecido» deja de contar como desertor?
 * Servidor real (ver ../f4/srv.sh), datos inventados (DNI 96…). Variables: BASE, ADMIN_PASSWORD.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:3263';
const p2 = n => String(n).padStart(2, '0');
const ymd = off => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
async function api(method, url, token, body) {
  const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { status: r.status, json: j };
}
(async () => {
  const T = (await api('POST', '/api/auth/login', null, { username: 'admin', password: process.env.ADMIN_PASSWORD })).json.token;
  const resumen = async () => (await api('GET', '/api/alerts/summary', T)).json.alertas;
  const antes = await resumen();
  console.log('Antes:  desertores_rojo=%s fallecidos_negro=%s', antes.desertores_rojo, antes.fallecidos_negro);

  const base = (dni, extra) => ({ patients: [{ id: 'pac-00001741-' + dni, dni, tipo_documento: 'DNI', apellidos_nombres: 'PACIENTE INVENTADO ' + dni, latitud: -10.0478, longitud: -78.1548,
    appointments: [{ fecha_cita: ymd(-20), estado: 'booked' }], ...extra }] });

  // 1) Lo que hace la interfaz (Registro Clínico y cuadrícula): estado_paciente = «Fallecido», sin el campo «fallecido»
  const r1 = await api('POST', '/api/padron/importar-lote', T, base('96000011', { estado_paciente: 'Fallecido' }));
  console.log('POST estado_paciente="Fallecido"      → HTTP', r1.status);
  // 2) ¿Se puede mandar fallecido:true por la API de importación?
  const r2 = await api('POST', '/api/padron/importar-lote', T, base('96000012', { estado_paciente: 'Fallecido', fallecido: true }));
  console.log('POST fallecido:true (importar-lote)   → HTTP', r2.status, r2.status >= 400 ? JSON.stringify(r2.json).slice(0, 160) : '');
  // 3) Control: paciente activo con la misma cita vencida
  const r3 = await api('POST', '/api/padron/importar-lote', T, base('96000013', { estado_paciente: 'Activo' }));
  console.log('POST activo con cita vencida (control)→ HTTP', r3.status);

  const geo = (await api('GET', '/api/patients/geo', T)).json.features.map(f => f.properties);
  const cron = (await api('GET', '/api/cronicos', T)).json;
  for (const dni of ['96000011', '96000012', '96000013']) {
    const g = geo.find(x => x.dni === dni), c = cron.find(x => x.dni === dni);
    console.log(`DNI ${dni}: /patients/geo semaforo=${g ? g.semaforo : '(no está)'} · /cronicos estado_paciente=${c && c.estado_paciente} fallecido=${c && c.fallecido} semaforo=${c && c.semaforo}`);
  }
  const despues = await resumen();
  console.log('Después: desertores_rojo=%s fallecidos_negro=%s', despues.desertores_rojo, despues.fallecidos_negro);
  console.log('Diferencia: +%s desertores, +%s fallecidos (hay 3 pacientes nuevos: 1 «Fallecido» por la vía de la interfaz, 1 con fallecido:true si el servidor lo admite, 1 activo)', despues.desertores_rojo - antes.desertores_rojo, despues.fallecidos_negro - antes.fallecidos_negro);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
