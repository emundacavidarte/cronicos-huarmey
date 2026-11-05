// Un usuario real abre la app: [login] + GET /auth/me + GET /cronicos + GET /indicadores/convenio
// uso: node appuser.js --token T [--login --user admin --pass X] [--loads N] [--xff 10.1.1.1] [--label x]
const http = require('http');
const A = {}; for (let i=2;i<process.argv.length;i++){ if(process.argv[i].startsWith('--')){ const k=process.argv[i].slice(2); const n=process.argv[i+1]; if(n===undefined||n.startsWith('--')) A[k]=true; else {A[k]=n;i++;} } }
const agent = new http.Agent({ keepAlive: true });
function call(method, path, token, body) {
  return new Promise(res => {
    const h = {}; if (token) h.Authorization = 'Bearer ' + token; if (A.xff) h['X-Forwarded-For'] = A.xff;
    if (body) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(body); }
    const s = Date.now();
    const r = http.request({ host: '127.0.0.1', port: 3220, path, method, headers: h, agent }, resp => {
      let b = ''; resp.on('data', c => b += c); resp.on('end', () => res({ status: resp.statusCode, ms: Date.now() - s, retryAfter: resp.headers['retry-after'] || null, body: b }));
    });
    r.on('error', e => res({ status: 'ERR ' + e.code, ms: Date.now() - s, body: '' }));
    if (body) r.write(body); r.end();
  });
}
(async () => {
  const loads = parseInt(A.loads || '1', 10);
  const out = [];
  let ok = 0, firstFail = null;
  for (let i = 0; i < loads; i++) {
    let token = A.token; const st = [];
    if (A.login) {
      const r = await call('POST', '/api/auth/login', null, JSON.stringify({ username: A.user || 'admin', password: A.pass }));
      st.push('login=' + r.status);
      if (r.status === 200) token = JSON.parse(r.body).token;
    }
    let allOk = !A.login || st[0] === 'login=200';
    for (const p of ['/api/auth/me', '/api/cronicos', '/api/indicadores/convenio']) {
      const r = await call('GET', p, token);
      st.push(p.replace('/api/', '') + '=' + r.status + (r.retryAfter ? '(RA ' + r.retryAfter + ')' : '') + '/' + r.ms + 'ms');
      if (r.status !== 200) allOk = false;
    }
    if (allOk) ok++; else if (firstFail === null) firstFail = i + 1;
    if (loads <= 3) out.push(st.join(' '));
  }
  console.log(JSON.stringify({ label: A.label || '', loads, loads_completas_ok: ok, primera_carga_fallida: firstFail, detalle: out }));
  agent.destroy();
})();
