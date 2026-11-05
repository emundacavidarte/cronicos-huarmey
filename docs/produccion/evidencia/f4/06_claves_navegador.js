// Evidencia Fase 4 — correo obligatorio, recuperar la contraseña con un código y cambiarla, en Chromium con el cliente real.
// Usa un proveedor de correo FALSO local (puerto 3299) que guarda lo recibido: no se envía ningún correo real.
// Uso: el servidor se levanta con
//   EXTRA_ENV="MAIL_PROVIDER=resend MAIL_API_KEY=falsa MAIL_FROM=no-responder@prueba.example MAIL_API_URL=http://127.0.0.1:3299/emails" ./srv.sh start
//   ADMIN_PASSWORD=<clave> BASE=http://127.0.0.1:3255 node 06_claves_navegador.js
const { chromium } = require('playwright');
const http = require('http');
const BASE = process.env.BASE || 'http://127.0.0.1:3255';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = [];
const anota = (n, ok, d = '') => res.push(`${ok ? 'OK   ' : 'FALLA'} ${n}${d ? ' — ' + d : ''}`);

const correos = [];
const falso = http.createServer((req, r) => {
  let d = '';
  req.on('data', x => { d += x; });
  req.on('end', () => { try { correos.push(JSON.parse(d)); } catch (e) { /* */ } r.writeHead(200, { 'Content-Type': 'application/json' }); r.end('{"id":"x"}'); });
});

(async () => {
  await new Promise(r => falso.listen(3299, '127.0.0.1', r));
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 800 } })).newPage();
  page.setDefaultTimeout(10000);
  const problemas = [];
  page.on('console', m => { if (/Content Security Policy/i.test(m.text())) problemas.push(m.text().slice(0, 120)); });
  page.on('pageerror', e => problemas.push('pageerror: ' + e.message.slice(0, 120)));
  page.on('dialog', d => d.accept());
  const entrar = async (u, p) => {
    await page.fill('#login-username', u);
    await page.fill('#login-password', p);
    await page.click('#login-submit');
    await page.waitForFunction(() => !document.getElementById('login-overlay').classList.contains('active'), null, { timeout: 15000 });
    await sleep(800);
  };

  await page.goto(BASE + '/');
  await page.waitForSelector('#login-overlay.active');
  await entrar('admin', process.env.ADMIN_PASSWORD);

  // 1) Alta de usuario: el correo es obligatorio
  await page.click('#btn-usuarios');
  await page.waitForSelector('#modal-usuarios.active');
  await page.fill('#nuevo-usuario-login', 'lucia.f4');
  await page.fill('#nuevo-usuario-nombre', 'LUCIA DE PRUEBA');
  await page.selectOption('#nuevo-usuario-rol', 'DIRECTOR');
  await page.selectOption('#nuevo-usuario-red', { index: 1 });
  await page.fill('#nuevo-usuario-clave', 'clave-inicial-lucia');
  await page.click('#nuevo-usuario-guardar');
  await sleep(500);
  const sinCorreo = await page.textContent('#usuarios-msg');
  anota('alta sin correo: la pantalla lo pide', /correo/.test(sinCorreo), sinCorreo.trim().slice(0, 80));
  await page.fill('#nuevo-usuario-correo', 'lucia.f4@prueba.example');
  await page.click('#nuevo-usuario-guardar');
  await sleep(1200);
  const lista = await page.textContent('#usuarios-lista');
  anota('alta con correo: el usuario queda registrado y la lista muestra su correo', lista.includes('lucia.f4@prueba.example'));
  await page.click('#usuarios-cerrar');
  await page.click('#btn-logout');
  await sleep(500);

  // 2) ¿Olvidó su contraseña? → código por correo → restablecer
  await page.click('#login-olvido');
  await page.fill('#recuperar-usuario', 'lucia.f4');
  await page.click('#recuperar-enviar');
  await page.waitForSelector('#recuperar-paso2:not(.oculto)');
  for (let i = 0; i < 40 && !correos.length; i++) await sleep(100);
  const ultimo = correos[correos.length - 1];
  const codigo = ultimo && (/(\d{6})/.exec(ultimo.text) || [])[1];
  anota('el código llega al correo registrado', !!codigo && ultimo.to[0] === 'lucia.f4@prueba.example', ultimo ? `para ${ultimo.to[0]} · «${ultimo.subject}»` : 'sin correo');
  await page.fill('#recuperar-codigo', '000000' === codigo ? '111111' : '000000');
  await page.fill('#recuperar-clave', 'clave-recuperada-lucia');
  await page.fill('#recuperar-clave2', 'clave-recuperada-lucia');
  await page.click('#recuperar-restablecer');
  await sleep(600);
  anota('un código equivocado se rechaza', /inválido o vencido/.test(await page.textContent('#recuperar-msg')), (await page.textContent('#recuperar-msg')).trim());
  await page.fill('#recuperar-codigo', codigo);
  await page.click('#recuperar-restablecer');
  await page.waitForSelector('#login-form:not(.oculto)');
  anota('con el código correcto vuelve al acceso con aviso', /restablecida/.test(await page.textContent('#login-error')), (await page.textContent('#login-error')).trim());
  await entrar('lucia.f4', 'clave-recuperada-lucia');
  anota('entra con la contraseña restablecida', await page.evaluate(() => window.app.session.getUser().username) === 'lucia.f4');

  // 3) Cambiar mi contraseña (con sesión): la sesión sigue con el token nuevo
  await page.click('#btn-mi-clave');
  await page.waitForSelector('#modal-mi-clave.active');
  await page.fill('#mi-clave-actual', 'clave-recuperada-lucia');
  await page.fill('#mi-clave-nueva', 'clave-cambiada-lucia-2');
  await page.fill('#mi-clave-nueva2', 'clave-cambiada-lucia-2');
  await page.click('#mi-clave-guardar');
  await sleep(800);
  anota('cambiar mi contraseña: aviso de éxito', /Contraseña cambiada/.test(await page.textContent('#mi-clave-msg')), (await page.textContent('#mi-clave-msg')).trim());
  const sigue = await page.evaluate(async () => (await window.app.session.authFetch('/api/auth/me')).status);
  anota('la sesión sigue activa con el token nuevo', sigue === 200, 'GET /api/auth/me → ' + sigue);
  await sleep(1000);
  await page.click('#btn-logout');
  await sleep(400);
  await entrar('lucia.f4', 'clave-cambiada-lucia-2');
  anota('entra con la contraseña nueva', await page.evaluate(() => window.app.session.getUser().username) === 'lucia.f4');

  // 4) Móvil: el botón de la llave cabe en la pantalla
  const movil = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await movil.goto(BASE + '/');
  await movil.waitForSelector('#login-overlay.active');
  await movil.fill('#login-username', 'lucia.f4');
  await movil.fill('#login-password', 'clave-cambiada-lucia-2');
  await movil.click('#login-submit');
  await movil.waitForFunction(() => !document.getElementById('login-overlay').classList.contains('active'));
  await sleep(600);
  const llave = await movil.evaluate(() => { const b = document.getElementById('btn-mi-clave').getBoundingClientRect(); return { x: Math.round(b.x), der: Math.round(b.right), vis: b.width > 0 }; });
  const ancho = await movil.evaluate(() => document.querySelector('.georis-header').scrollWidth);
  anota('móvil: el botón «Cambiar mi contraseña» se ve y el encabezado cabe en 390 px', llave.vis && llave.der <= 390 && ancho <= 390, JSON.stringify(llave) + ` · encabezado ${ancho}`);

  anota('sin violaciones de la CSP ni errores de página', problemas.length === 0, problemas.slice(0, 2).join(' | '));
  console.log(res.join('\n'));
  console.log(`\n${res.filter(r => r.startsWith('OK')).length} correctas, ${res.filter(r => r.startsWith('FALLA')).length} con falla`);
  await browser.close();
  falso.close();
})().catch(e => { console.error('ERROR', e.message.split('\n')[0]); console.log(res.join('\n')); process.exit(1); });
