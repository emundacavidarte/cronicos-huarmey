// loginburst.js <K> [--bad] [--path /api/auth/login] [--xff] [--probe cronicosgz]
// Dispara K logins a la vez (K sockets) y mide el tiempo de cada uno; en paralelo sondea /health cada 20 ms (y /api/cronicos gzip cada 100 ms si --probe cronicosgz)
const http = require('http'); const { performance } = require('perf_hooks'); const fs = require('fs');
const K = parseInt(process.argv[2], 10); const A = {}; for (let i=3;i<process.argv.length;i++){ if(process.argv[i].startsWith('--')){ const k=process.argv[i].slice(2); const n=process.argv[i+1]; if(n===undefined||n.startsWith('--')) A[k]=true; else {A[k]=n;i++;} } }
const agent = new http.Agent({ keepAlive: true, maxSockets: K }); const pa = new http.Agent({ keepAlive: true, maxSockets: 256 });
const token = A.token || '';
const P = A.path || '/api/auth/login'; const PASS = A.pass || process.env.ADMIN_PASSWORD;
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))].toFixed(1); };
function probe(path, hdr, store, ms) {
  const iv = setInterval(() => { const s = performance.now(); const r = http.request({ host: '127.0.0.1', port: 3220, path, method: 'GET', agent: pa, headers: hdr }, res => { res.resume(); res.on('end', () => store.push(performance.now() - s)); }); r.on('error', () => store.push(-1)); r.end(); }, ms);
  return iv;
}
(async () => {
  const hl = [], cl = [];
  const i1 = probe('/health', {}, hl, 20);
  const i2 = A.probe === 'cronicosgz' ? probe('/api/cronicos', { Authorization: 'Bearer ' + token, 'Accept-Encoding': 'gzip', 'X-Forwarded-For': '10.250.250.250' }, cl, 100) : null;
  await new Promise(r => setTimeout(r, 600)); // linea base de sondas
  const baseH = hl.length, baseC = cl.length;
  const t0 = performance.now(); const lat = []; const st = {};
  await Promise.all(Array.from({ length: K }, (_, i) => new Promise(res => {
    const body = JSON.stringify({ username: A.bad ? `usuario${i}${Date.now() % 100000}` : 'admin', password: A.bad ? 'incorrecta-123456' : PASS });
    const h = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
    if (A.xff) h['X-Forwarded-For'] = `10.77.${Math.floor(i / 250)}.${i % 250 + 1}`;
    const s = performance.now();
    const r = http.request({ host: '127.0.0.1', port: 3220, path: P, method: 'POST', agent, headers: h }, resp => { resp.resume(); resp.on('end', () => { lat.push(performance.now() - s); st[resp.statusCode] = (st[resp.statusCode] || 0) + 1; res(); }); });
    r.on('error', e => { st[e.code] = (st[e.code] || 0) + 1; res(); }); r.write(body); r.end();
  })));
  const wall = performance.now() - t0;
  await new Promise(r => setTimeout(r, 300));
  clearInterval(i1); if (i2) clearInterval(i2);
  const hb = hl.slice(0, baseH), hd = hl.slice(baseH), cb = cl.slice(0, baseC), cd = cl.slice(baseC);
  console.log(JSON.stringify({ K, path: P, bad: !!A.bad, status: st, wall_ms: +wall.toFixed(0), login_ms: { p50: pct(lat, 50), p95: pct(lat, 95), max: pct(lat, 100) },
    health_base: { n: hb.length, p50: pct(hb, 50), max: pct(hb, 100) }, health_durante: { n: hd.length, p50: pct(hd, 50), p95: pct(hd, 95), max: pct(hd, 100) },
    cronicosgz_base: cb.length ? { n: cb.length, p50: pct(cb, 50), max: pct(cb, 100) } : undefined, cronicosgz_durante: cd.length ? { n: cd.length, p50: pct(cd, 50), p95: pct(cd, 95), max: pct(cd, 100) } : undefined }));
  agent.destroy(); pa.destroy();
})();
