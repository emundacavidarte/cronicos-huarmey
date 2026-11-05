#!/usr/bin/env node
/**
 * bench.js - generador de carga propio (node:http, keepAlive).
 * Uso: node bench.js --url http://127.0.0.1:3220/api/cronicos --conns 50 --duration 20 [opciones]
 *  --token T            Authorization: Bearer T
 *  --xff                X-Forwarded-For distinto en cada peticion (10.a.b.c)
 *  --gzip               Accept-Encoding: gzip (la respuesta NO se descomprime)
 *  --inm ETAG           If-None-Match
 *  --method POST --body fhir|hosix|login|loginbad|loginbadvar  (cuerpo generado, DNI ficticios 9xxxxxxx)
 *  --dnibase N          desplazamiento de DNI (para no repetir entre corridas)
 *  --user admin --pass X (para body login)
 *  --pid PID            pid del servidor: mide su CPU% en la corrida
 *  --probe-ms 100       sondeo de /health cada N ms durante la corrida (latencia del bucle de eventos)
 *  --probe-path /health camino del sondeo
 *  --label texto
 * Salida: una linea JSON (tambien se agrega a results.jsonl).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

function parse(argv) {
  const o = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const nxt = argv[i + 1];
      if (nxt === undefined || nxt.startsWith('--')) o[k] = true;
      else { o[k] = nxt; i++; }
    }
  }
  return o;
}
const A = parse(process.argv);
const url = new URL(A.url);
const conns = parseInt(A.conns || '10', 10);
const durationS = parseFloat(A.duration || '20');
const method = (A.method || 'GET').toUpperCase();
const dnibase = parseInt(A.dnibase || '0', 10);
const probeMs = A['probe-ms'] ? parseInt(A['probe-ms'], 10) : 0;
const probePath = A['probe-path'] || '/health';
const label = A.label || '';

const agent = new http.Agent({ keepAlive: true, maxSockets: conns, maxFreeSockets: conns });
// v2: el sondeo no hace cola en el agente (antes maxSockets:1 inflaba la latencia medida cuando la respuesta tardaba > intervalo)
const probeAgent = new http.Agent({ keepAlive: true, maxSockets: 256 });

let seq = 0;
function ipFor(n) {
  const x = n + 1;
  return `10.${(x >>> 16) & 255}.${(x >>> 8) & 255}.${x & 255}`;
}
let ipCounter = (dnibase % 16000000);

function mkBody(kind, n) {
  const dni = String(90000000 + dnibase + n);
  if (kind === 'fhir') {
    const pid = `pac-00001741-${dni}`;
    return JSON.stringify({
      resourceType: 'Bundle', type: 'transaction',
      entry: [
        { resource: { resourceType: 'Patient', id: pid,
          identifier: [{ system: 'urn:oid:2.16.840.1.113883.4.904', value: dni }, { system: 'http://hospitalhuarmey.gob.pe/fhir/sid/historia-clinica', value: `HC${dni}` }],
          name: [{ text: `PRUEBA CARGA ${dni}` }], gender: 'female', birthDate: '1960-05-05',
          telecom: [{ system: 'phone', value: '900000000' }],
          address: [{ text: 'DIRECCION SIMULADA 123', district: 'Huarmey' }],
          managingOrganization: { reference: 'Organization/00001741' } } },
        { resource: { resourceType: 'Condition', id: `cond-${dni}`, subject: { reference: `Patient/${pid}` }, code: { coding: [{ code: 'I10', display: 'Hipertension' }] } } },
        { resource: { resourceType: 'Observation', id: `obs-${dni}`, subject: { reference: `Patient/${pid}` }, effectiveDateTime: '2026-10-30',
          component: [
            { code: { coding: [{ code: '8480-6' }] }, valueQuantity: { value: 150 } },
            { code: { coding: [{ code: '8462-4' }] }, valueQuantity: { value: 95 } }] } }
      ]
    });
  }
  if (kind === 'hosix') {
    return JSON.stringify({ NRO_DOCUMENTO: dni, PACIENTE: `PRUEBA CARGA ${dni}`, HISTORIA_CLINICA: `HC${dni}`, DIRECCION: 'DIRECCION SIMULADA 123', CIE10_COD: 'I10', PA_SISTOLICA: 150, PA_DIASTOLICA: 95, FEC_ULTIMA_ATENCION: '2026-10-30', FEC_PROXIMA_CITA: '2026-12-01' });
  }
  if (kind === 'login') return JSON.stringify({ username: A.user || 'admin', password: A.pass });
  if (kind === 'loginbad') return JSON.stringify({ username: A.user || 'admin', password: 'clave-incorrecta-123' });
  if (kind === 'loginbadvar') return JSON.stringify({ username: `usuario${dnibase + n}`, password: 'clave-incorrecta-123' });
  if (kind === 'precita') return JSON.stringify({ patient_id: A.pid || 'x', comentario: 'carga' });
  throw new Error('body desconocido ' + kind);
}

const lat = [];
const status = {};
const errors = {};
let bytes = 0, total = 0, accepted2xx = 0;
const samples = [];
let stop = false;
let inflight = 0;
const t0 = performance.now();
let tEndIssue = t0 + durationS * 1000;

function oneRequest(done) {
  const n = seq++;
  const headers = {};
  if (A.token) headers['Authorization'] = 'Bearer ' + A.token;
  if (A.xff) headers['X-Forwarded-For'] = ipFor(ipCounter++);
  if (A.gzip) headers['Accept-Encoding'] = 'gzip';
  if (A.inm) headers['If-None-Match'] = A.inm;
  let body = null;
  if (method !== 'GET') {
    body = mkBody(A.body, n);
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(body);
  }
  const start = performance.now();
  const req = http.request({ host: url.hostname, port: url.port, path: url.pathname + url.search, method, headers, agent, timeout: 60000 }, res => {
    let len = 0;
    const keep = samples.length < 3 && res.statusCode >= 400 ? [] : null;
    res.on('data', c => { len += c.length; if (keep && keep.join('').length < 300) keep.push(c.toString('utf8')); });
    res.on('end', () => {
      const ms = performance.now() - start;
      lat.push(ms);
      status[res.statusCode] = (status[res.statusCode] || 0) + 1;
      if (res.statusCode >= 200 && res.statusCode < 300) accepted2xx++;
      bytes += len; total++;
      if (keep) samples.push({ status: res.statusCode, body: keep.join('').slice(0, 250) });
      done();
    });
  });
  req.on('timeout', () => { req.destroy(new Error('timeout')); });
  req.on('error', e => {
    errors[e.code || e.message] = (errors[e.code || e.message] || 0) + 1;
    total++;
    done();
  });
  if (body) req.write(body);
  req.end();
}

function loop() {
  if (performance.now() >= tEndIssue || stop) { inflight--; if (inflight === 0) finish(); return; }
  oneRequest(loop);
}

// sondeo (latencia de /health y RSS)
const probeLat = [];
const mem = [];
let probeTimer = null;
function probeOnce() {
  const s = performance.now();
  const req = http.request({ host: url.hostname, port: url.port, path: probePath, method: 'GET', agent: probeAgent, timeout: 30000 }, res => {
    let b = '';
    res.on('data', c => b += c);
    res.on('end', () => {
      probeLat.push(performance.now() - s);
      if (probePath === '/health') { try { mem.push(JSON.parse(b).memory_rss_mb); } catch (_) {} }
    });
  });
  req.on('error', () => probeLat.push(-1));
  req.end();
}
function readCpu(pid) {
  try {
    const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(' ');
    return (parseInt(st[13], 10) + parseInt(st[14], 10)) / 100; // segundos
  } catch (_) { return null; }
}
const srvCpu0 = A.pid ? readCpu(A.pid) : null;
const selfCpu0 = process.cpuUsage();

function pct(arr, p) {
  if (!arr.length) return null;
  const s = Float64Array.from(arr).sort();
  return +(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]).toFixed(2);
}

function maxOf(a) { let m = -Infinity; for (const x of a) if (x > m) m = x; return m; }

function finish() {
  const elapsed = (performance.now() - t0) / 1000;
  if (probeTimer) clearInterval(probeTimer);
  const srvCpu1 = A.pid ? readCpu(A.pid) : null;
  const selfCpu = process.cpuUsage(selfCpu0);
  const out = {
    label, url: A.url, method, conns, duration_s: durationS, elapsed_s: +elapsed.toFixed(2),
    gzip: !!A.gzip, xff: !!A.xff, total, rps: +(total / elapsed).toFixed(1),
    status, errors,
    lat_ms: { p50: pct(lat, 50), p95: pct(lat, 95), p99: pct(lat, 99), max: lat.length ? +maxOf(lat).toFixed(1) : null },
    avg_resp_bytes: total ? Math.round(bytes / Math.max(1, lat.length)) : 0,
    cpu_server_pct: (srvCpu0 !== null && srvCpu1 !== null) ? +(((srvCpu1 - srvCpu0) / elapsed) * 100).toFixed(0) : null,
    cpu_generator_pct: +((((selfCpu.user + selfCpu.system) / 1e6) / elapsed) * 100).toFixed(0),
    accepted_2xx: accepted2xx,
    samples_non2xx: samples
  };
  if (probeMs) {
    out.probe = { n: probeLat.length, p50: pct(probeLat, 50), p95: pct(probeLat, 95), p99: pct(probeLat, 99), max: probeLat.length ? +maxOf(probeLat).toFixed(1) : null, failed: probeLat.filter(x => x < 0).length };
    if (mem.length) out.rss_mb = { first: mem[0], max: Math.max(...mem), last: mem[mem.length - 1], n: mem.length };
  }
  const line = JSON.stringify(out);
  console.log(line);
  try { fs.appendFileSync(path.join(__dirname, '..', 'results.jsonl'), line + '\n'); } catch (_) {}
  agent.destroy(); probeAgent.destroy();
  process.exit(0);
}

if (probeMs) probeTimer = setInterval(probeOnce, probeMs);
inflight = conns;
for (let i = 0; i < conns; i++) loop();
