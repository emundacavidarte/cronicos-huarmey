// killtest.js <srcDataDir> <SIGTERM|SIGKILL> <delayMs> <trials> [tag]
// Por intento: copia datos, arranca server (puerto 3220), login, POST /fhir/Bundle (paciente ficticio), espera delayMs tras la respuesta, envia senal,
// espera la salida y revisa si el DNI esta en store.json.
const { spawn } = require('child_process'); const http = require('http'); const fs = require('fs'); const path = require('path'); const { performance } = require('perf_hooks');
const [,, SRC, SIG, DELAY, TRIALS, TAG] = process.argv;
const W = path.resolve(__dirname, '..');
const delay = parseInt(DELAY, 10), trials = parseInt(TRIALS, 10);
function req(method, p, token, body) {
  return new Promise((res, rej) => {
    const h = {}; if (token) h.Authorization = 'Bearer ' + token;
    if (body) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(body); }
    const r = http.request({ host: '127.0.0.1', port: 3220, path: p, method, headers: h, agent: false }, resp => { let b = ''; resp.on('data', c => b += c); resp.on('end', () => res({ status: resp.statusCode, body: b })); });
    r.on('error', rej); if (body) r.write(body); r.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function bundle(dni) {
  const pid = `pac-00001741-${dni}`;
  return JSON.stringify({ resourceType: 'Bundle', type: 'transaction', entry: [
    { resource: { resourceType: 'Patient', id: pid, identifier: [{ system: 'urn:oid:2.16.840.1.113883.4.904', value: dni }], name: [{ text: 'PRUEBA CIERRE ' + dni }], gender: 'male', birthDate: '1955-01-01', address: [{ text: 'DIR SIM', district: 'Huarmey' }], managingOrganization: { reference: 'Organization/00001741' } } } ] });
}
(async () => {
  const results = [];
  for (let i = 0; i < trials; i++) {
    const D = path.join(W, `run_kill_${TAG || SIG}`); fs.rmSync(D, { recursive: true, force: true }); fs.cpSync(SRC, D, { recursive: true });
    const log = fs.openSync(path.join(W, `srv_kill_${TAG || SIG}.log`), 'a');
    const env = { ...process.env, DATA_DIR: D, PORT: '3220', NODE_ENV: 'development', ADMIN_USER: 'admin', ADMIN_PASSWORD: process.env.ADMIN_PASSWORD, AUTH_SECRET: process.env.AUTH_SECRET };
    const child = spawn('node', ['server/server.js'], { cwd: '/home/user/cronicos-huarmey', env, stdio: ['ignore', log, log] });
    const exited = new Promise(r => child.on('exit', (code, sig) => r({ code, sig })));
    for (let k = 0; k < 100; k++) { try { await req('GET', '/health'); break; } catch (_) { await sleep(100); } }
    const lg = await req('POST', '/api/auth/login', null, JSON.stringify({ username: 'admin', password: process.env.ADMIN_PASSWORD }));
    const token = JSON.parse(lg.body).token;
    await sleep(600); // que el login/auditoria previos ya esten en disco (para aislar el ultimo registro)
    const dni = String(98000000 + Math.floor(Math.random() * 999999));
    const t0 = performance.now();
    const r = await req('POST', '/fhir/Bundle', token, bundle(dni));
    const tResp = performance.now() - t0;
    if (delay > 0) await sleep(delay);
    const tk = performance.now();
    child.kill(SIG);
    const ex = await exited;
    const exitMs = performance.now() - tk;
    let present = null, valid = null, size = null;
    try { const raw = fs.readFileSync(path.join(D, 'store.json'), 'utf8'); size = raw.length; const s = JSON.parse(raw); valid = true; present = s.patients.some(p => p.dni === dni); } catch (e) { valid = false; }
    results.push({ status: r.status, delay_ms: delay, sig: SIG, exit: ex, exit_ms: +exitMs.toFixed(0), registro_presente: present, store_valido: valid, store_bytes: size, resp_ms: +tResp.toFixed(1) });
  }
  const lost = results.filter(x => x.registro_presente === false).length, corrupt = results.filter(x => x.store_valido === false).length;
  console.log(JSON.stringify({ tag: TAG || SIG, sig: SIG, delay_ms: delay, trials, perdidos: lost, store_corrupto: corrupt, ejemplo: results[0] }));
})();
