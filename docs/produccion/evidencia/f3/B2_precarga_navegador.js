// Evidencia Fase 3 (B2) — precarga por documento en Registro Clínico con la interfaz real (Chromium), por rol, red y establecimiento.
// Solo datos inventados y la semilla de 20 pacientes simulados. Lo corre B0_ejecutar.sh (claves al azar, puerto 3262).
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const C = require('./B0_comun');
const { api, DOCS, H, LV, resumen, sleep } = C;

const lineas = [];
const p = (s = '') => { lineas.push(s); console.log(s); };
const pad = (s, n) => String(s).padEnd(n);
const EVID = process.env.EVIDENCIA || __dirname;

const { abrir, leer, buscar, llenarNuevo, guardar } = require('./B0_ui');

const corto = (v, n = 34) => resumen(v, n);
function describe(c) {
  if (/Paciente Encontrado/.test(c.alerta)) {
    return `ENCONTRADO · ${corto(c.alerta.replace('Paciente Encontrado:', '').replace(/✓.*$/, ''), 70)}\n        precarga: sexo=«${c.sexo}» nac=${c.nac || '∅'} seguro=${c.seguro} sector=«${c.sector}» EESS-control=«${corto(c.ctrl, 30)}» HTA=«${corto(c.hta, 12)}» DM=«${corto(c.dm, 12)}» tto-HTA=«${corto(c.thta, 22)}» meses=${c.meses || '∅'} PAS/PAD hoy=${c.pas || '∅'}/${c.pad || '∅'} consentimiento=${c.consentVisible ? 'se pregunta' : 'ya registrado: ' + c.consent}`;
  }
  if (/Paciente Nuevo/.test(c.alerta)) return `«Paciente Nuevo» (tipo sugerido: ${c.tipo}) · formulario vacío con valores por defecto: sexo=${c.sexo} seguro=${c.seguro} sector=«${c.sector}» EESS=«${corto(c.ctrl, 22)}»`;
  return `«${corto(c.alerta, 110)}»`;
}

(async () => {
  p('# B2 — Precarga por documento en Registro Clínico, interfaz real (Chromium) (Fase 3)');
  p(`Servidor ${C.BASE} · ${new Date().toISOString()} · solo datos inventados + semilla de 20 pacientes simulados`);
  const A = await C.preparar();
  const browser = await chromium.launch();
  const clave = process.env.CLAVE_USUARIOS;

  const planes = [
    { u: 'admin', clave: process.env.ADMIN_PASSWORD, casos: [
      ['a  propio (hospital)', 'H1'], ['a  propio (La Victoria)', 'LV1'], ['a  CE propio', 'PSCE', true], ['a  pasaporte propio', 'PSPA', true],
      ['b  otra red (PN, DNI)', 'PN1'], ['b  otra red (CE)', 'PNCE', true], ['b  otra red (pasaporte)', 'PNPA', true],
      ['c  inexistente (DNI)', 'NX'], ['c  inexistente (CE)', 'NXCE', true], ['c  inexistente (pasaporte)', 'NXPA', true],
      ['d  datos incompletos (SUR)', '96400001'], ['d  datos incompletos (NORTE)', '96400003']] },
    { u: 'f3.coord.ps', clave, casos: [
      ['a  propio (hospital)', 'H1'], ['a  propio (La Victoria)', 'LV1'], ['a  CE propio', 'PSCE', true], ['a  pasaporte propio', 'PSPA', true],
      ['b  otra red (PN, DNI)', 'PN1'], ['b  otra red (CE)', 'PNCE', true], ['b  otra red (pasaporte)', 'PNPA', true],
      ['c  inexistente (DNI)', 'NX'], ['c  inexistente (CE)', 'NXCE', true], ['c  inexistente (pasaporte)', 'NXPA', true],
      ['d  datos incompletos', '96400001'], ['d  datos incompletos de otra red', '96400003']] },
    { u: 'f3.coord.lv', clave, casos: [
      ['a  propio (La Victoria)', 'LV1'], ['b  misma red, OTRO establecimiento (hospital)', 'H1'], ['b  otra red (PN)', 'PN1'],
      ['c  inexistente', 'NX'], ['d  incompleto del hospital (otro establecimiento)', '96400001']] },
    { u: 'f3.coord.pn', clave, casos: [
      ['a  propio (PN, DNI)', 'PN1'], ['a  CE propio', 'PNCE', true], ['a  pasaporte propio', 'PNPA', true],
      ['b  otra red (SUR, DNI)', 'H1'], ['b  otra red (CE)', 'PSCE', true], ['c  inexistente', 'NX'], ['d  datos incompletos', '96400003'], ['d  incompleto de otra red', '96400001']] },
    { u: 'f3.dir.ps', clave, casos: [['a/b  (DIRECTOR) documento de su propia red', 'H1'], ['c  (DIRECTOR) inexistente', 'NX']] }
  ];
  const lookup = k => (DOCS[k] ? DOCS[k].doc : k);

  p('\n## 1. Precarga por rol');
  const verEstadoSesion = {};
  for (const plan of planes) {
    const { ctx, page } = await abrir(browser, plan.u, plan.clave);
    const info = await page.evaluate(() => ({
      lista: window.app && Array.isArray(window.app.patients) ? window.app.patients.length : -1,
      chip: (document.getElementById('user-chip-role') || {}).textContent
    }));
    info.boton = await page.isVisible('#btn-top-nuevo-registro');
    info.fab = await page.isVisible('#rail-btn-nuevo');
    verEstadoSesion[plan.u] = info;
    p(`\n### ${plan.u} — chip «${info.chip}» · pacientes que cargó el cliente al iniciar sesión (GET /api/cronicos): ${info.lista} · botón superior «Registro Clínico» visible: ${info.boton} · botón lateral «Nueva atención» visible: ${info.fab}`);
    if (plan.u === 'f3.dir.ps') p('    (El DIRECTOR no tiene los botones; se abre el modal desde la consola solo para ver qué haría.)');
    for (const [etq, k, enter] of plan.casos) {
      const c = await buscar(page, lookup(k), enter);
      p(`  [${plan.u.replace('f3.', '')}] ${pad(etq, 50)} ${pad(lookup(k), 11)} /api durante la búsqueda: ${c.api}\n      ${describe(c)}`);
      if (plan.u === 'f3.coord.ps' && k === 'H1') await page.screenshot({ path: path.join(EVID, 'B2_encontrado.png') });
      if (plan.u === 'f3.coord.ps' && k === 'PN1') await page.screenshot({ path: path.join(EVID, 'B2_otra_red_paciente_nuevo.png') });
    }
    if (page.errores.length) p('    errores de página: ' + page.errores.join(' · '));
    await ctx.close();
  }

  p('\n### ¿«No encontrado» es igual para «existe en otra red» y «no existe»?');
  {
    const { ctx, page } = await abrir(browser, 'f3.coord.ps', clave);
    const b = await buscar(page, lookup('PN1'));
    const c = await buscar(page, lookup('NX'));
    p(`  coord.ps · PN1 (existe en PACIFICO NORTE): «${b.alerta}» · badge ${b.badge}`);
    p(`  coord.ps · NX  (no existe)               : «${c.alerta}» · badge ${c.badge}`);
    p(`  → idénticos: ${b.alerta.replace(lookup('PN1'), 'X') === c.alerta.replace(lookup('NX'), 'X') && b.badge === c.badge ? 'SÍ (la pantalla no revela que existe en otra red)' : 'NO'}`);
    await ctx.close();
  }

  p('\n## 2. Guardar como «Paciente Nuevo» un documento que SÍ existe en otra red / otro establecimiento, y guardar con el formulario por defecto');
  const verServidor = async doc => { const r = await api('GET', '/api/cronicos?q=' + encodeURIComponent(doc), A); return (r.json || []).find(x => String(x.dni) === doc); };
  {
    const { ctx, page } = await abrir(browser, 'f3.coord.ps', clave);
    for (const [etq, k, enter] of [['S1 DNI que existe en otra red', 'PN1'], ['S1b carné de extranjería que existe en otra red', 'PNCE', true], ['S1c pasaporte que existe en otra red', 'PNPA', true], ['S2 documento que no existe (DNI)', 'NX'], ['S2b documento que no existe (CE)', 'NXCE', true]]) {
      const antes = await verServidor(lookup(k));
      const c = await buscar(page, lookup(k), enter);
      await llenarNuevo(page, 'INTENTO DESDE LA INTERFAZ ' + k);
      const msg = await guardar(page);
      const despues = await verServidor(lookup(k));
      p(`  [coord.ps] ${pad(etq, 50)} pantalla: ${/Nuevo/.test(c.alerta) ? '«Paciente Nuevo»' : corto(c.alerta, 40)} → al Guardar: «${resumen(msg, 150)}»`);
      p(`      servidor antes: ${antes ? `existe «${antes.apellidos_nombres}»` : 'no existe'} · después: ${despues ? `«${despues.apellidos_nombres}» red=${despues.red_salud} EESS=${despues.puerta_entrada_id}` : 'no existe'}${antes && despues && antes.apellidos_nombres === despues.apellidos_nombres ? ' (sin cambios: no sobrescribió, no duplicó)' : ''}`);
    }
    await ctx.close();
  }
  {
    const { ctx, page } = await abrir(browser, 'f3.coord.lv', clave);
    let c = await buscar(page, lookup('H1'));
    await llenarNuevo(page, 'INTENTO LV SOBRE H1');
    let msg = await guardar(page);
    p(`  [coord.lv] S3 DNI del hospital (misma red, otro establecimiento): pantalla ${/Nuevo/.test(c.alerta) ? '«Paciente Nuevo»' : corto(c.alerta, 40)} → «${resumen(msg, 150)}»`);
    c = await buscar(page, '96999998');
    await llenarNuevo(page, 'PACIENTE INVENTADO LV UI');
    msg = await guardar(page);
    p(`  [coord.lv] S4 documento nuevo con el EESS por defecto del formulario (Hospital): «${resumen(msg, 150)}»`);
    await page.evaluate(() => window.RegistroClinicoModal.open());
    c = await buscar(page, '96999998');
    await llenarNuevo(page, 'PACIENTE INVENTADO LV UI');
    await page.selectOption('#reg-eess-control', LV);
    await page.selectOption('#reg-eess-adscripcion', LV);
    msg = await guardar(page);
    const sv = await verServidor('96999998');
    p(`  [coord.lv] S4b mismo documento eligiendo «C. S. La Victoria» en ambos EESS: «${resumen(msg, 100)}» · servidor: ${sv ? 'creado, EESS ' + sv.puerta_entrada_id : 'no existe'}`);
    await ctx.close();
  }
  {
    const { ctx, page } = await abrir(browser, 'f3.coord.pn', clave);
    const opciones = await page.evaluate(() => { window.RegistroClinicoModal.open(); return [...document.querySelectorAll('#reg-eess-control option')].map(o => o.value); });
    p(`  [coord.pn] opciones de «EESS que lo controla hoy» que ofrece el formulario: ${opciones.length} → ${opciones.map(o => resumen(o, 30)).join(' | ')}`);
    for (const opcion of opciones) {
      const c = await buscar(page, '96999997');
      await llenarNuevo(page, 'PACIENTE INVENTADO PN UI');
      await page.selectOption('#reg-eess-control', opcion);
      const msg = await guardar(page);
      p(`  [coord.pn] S5 documento nuevo con EESS «${resumen(opcion, 36)}» → «${resumen(msg, 140)}»`);
    }
    const sv = await verServidor('96999997');
    p(`  [coord.pn] S5 resultado en el servidor: ${sv ? 'creado' : 'NO se creó ningún paciente: un COORDINADOR de PACIFICO NORTE no puede registrar desde la interfaz'}`);
    await ctx.close();
  }
  {
    // DIRECTOR: abre el modal por consola y guarda
    const { ctx, page } = await abrir(browser, 'f3.dir.ps', clave);
    await buscar(page, '96999996');
    await llenarNuevo(page, 'INTENTO DIRECTOR');
    const msg = await guardar(page);
    p(`  [dir.ps] guardar desde la consola (el botón no existe): «${resumen(msg, 150)}» · servidor: ${(await verServidor('96999996')) ? 'creado' : 'sin cambios'}`);
    await ctx.close();
  }

  await browser.close();
  p('\nFin de B2.');
})().catch(e => { console.log('ERROR B2:', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e); process.exit(1); });
