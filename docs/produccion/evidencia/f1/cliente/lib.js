// Utilidades comunes de la Fase 1 (cliente). Solo lectura sobre el repo.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

if (!process.env.ADMIN_PASSWORD || !process.env.CLAVE_PRUEBA) { console.error('Defina ADMIN_PASSWORD (la del servidor de prueba) y CLAVE_PRUEBA (10+ caracteres, para los usuarios de prueba que se crean).'); process.exit(2); }
const W = __dirname;
const BASE = 'http://localhost:3210';
const ADMIN = { username: 'admin', password: process.env.ADMIN_PASSWORD };
const COORD = { username: 'coord1', password: process.env.CLAVE_PRUEBA };
const DIRE = { username: 'direct1', password: process.env.CLAVE_PRUEBA };
const KEY = 'maxime_cronicos_sesion_v1';

async function launch(opts = {}) {
  let browser;
  try {
    browser = await chromium.launch(opts.launch || {});
  } catch (e) {
    browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  }
  return browser;
}

// Colector de red y consola para una página
function instrument(page, bag) {
  bag.requests = [];
  bag.responses = [];
  bag.console = [];
  bag.pageErrors = [];
  bag.failed = [];
  const t0 = Date.now();
  bag.t0 = t0;
  page.on('request', r => bag.requests.push({ t: Date.now() - t0, method: r.method(), url: r.url(), type: r.resourceType() }));
  page.on('response', async r => {
    const o = { t: Date.now() - t0, status: r.status(), url: r.url(), fromSW: r.fromServiceWorker(), method: r.request().method() };
    try {
      const h = r.headers();
      o.len = parseInt(h['content-length'] || '0', 10);
      o.enc = h['content-encoding'] || '';
    } catch (e) {}
    bag.responses.push(o);
  });
  page.on('console', m => bag.console.push({ type: m.type(), text: m.text().slice(0, 300), loc: (m.location() || {}).url }));
  page.on('pageerror', e => bag.pageErrors.push(String(e.message || e).slice(0, 300)));
  page.on('requestfailed', r => bag.failed.push({ url: r.url(), err: r.failure() && r.failure().errorText }));
}

async function apiLogin(u) {
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(u) });
  return await r.json();
}

async function uiLogin(page, u) {
  await page.fill('#login-username', u.username);
  await page.fill('#login-password', u.password);
  await page.click('#login-submit');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isOwn = url => url.startsWith(BASE);
const host = url => { try { return new URL(url).host; } catch (e) { return url; } };

module.exports = { chromium, launch, instrument, apiLogin, uiLogin, sleep, isOwn, host, W, BASE, ADMIN, COORD, DIRE, KEY, path, fs };
