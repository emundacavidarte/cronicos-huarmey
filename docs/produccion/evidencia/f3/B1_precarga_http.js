// Evidencia Fase 3 (B1) — precarga por documento vista desde HTTP: mapa de roles, matriz rol × documento, oráculo de existencia,
// tiempos, tokens inválidos y escrituras fuera del alcance. Solo datos inventados y la semilla de 20 pacientes simulados.
// Uso: lo corre B0_ejecutar.sh (genera las claves al azar y levanta el servidor en el puerto 3262).
'use strict';
const C = require('./B0_comun');
const { api, DOCS, EXISTEN, INEXISTENTES, VISIBLES, H, LV, resumen, mediana, pct } = C;

const out = [];
const p = (s = '') => { out.push(s); console.log(s); };
const pad = (s, n) => String(s).padEnd(n);
const hoy = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const en30 = new Date(Date.now() - 5 * 3600 * 1000 + 30 * 86400000).toISOString().slice(0, 10);
const cod = eess => ((/\((\d{8})\b/.exec(eess) || [])[1]);

/** Cuerpo que arma Registro Clínico al guardar (registroClinicoModal.js:1088-1153), con lo mínimo obligatorio. */
function cuerpoFormulario(doc, tipo, nombres, extra) {
  const eess = (extra && extra.eess) || H;
  const sector = (extra && extra.sector) || 'Sector I – Centro';
  const pt = Object.assign({
    tipo_documento: tipo === 'CE' ? 'Carné de extranjería' : tipo === 'PAS' ? 'Pasaporte' : 'DNI',
    nro_documento: doc, dni: doc, id: `pac-00001741-${doc}`, historia_clinica: '', apellidos_nombres: nombres, sexo: 'Femenino',
    fecha_nacimiento: '1960-05-10', seguro_salud: 'SIS', telefono: '', sector, sector_sanitario: sector, direccion: 'Jr. Prueba 100 Huarmey',
    establecimiento_adscripcion: H, establecimiento_control: eess, puerta_entrada: eess, puerta_entrada_id: cod(eess),
    estado_paciente: 'Activo', consentimiento: 'No', fecha_ultimo_control: hoy, proxima_cita: en30,
    conditions: [], observations: [], appointments: [{ fecha_cita: en30, estado: 'booked' }]
  }, (extra && extra.campos) || {});
  return { patients: [pt] };
}

(async () => {
  p('# B1 — Precarga por documento, vista HTTP (Fase 3)');
  p(`Servidor ${C.BASE} · ${new Date().toISOString()} · solo datos inventados + semilla de 20 pacientes simulados`);
  const A = await C.preparar();
  const tokens = { admin: A };
  for (const u of Object.keys(C.USUARIOS)) tokens[u] = await C.loginUsuario(u);

  // ---------------------------------------------------------------- 1. Mapa de roles
  p('\n## 1. Roles reales y qué puede hacer cada uno (código: auth.js:15, apiRoutes.js:33-36, scope.js, session.js:23-27)');
  p('Roles: ADMIN, COORDINADOR, DIRECTOR (los únicos de auth.ROLES). Alcance: ADMIN sin límite; COORDINADOR y DIRECTOR por RED (obligatoria, una de las 7 RIS);');
  p('COORDINADOR puede además llevar establecimiento (RENIPRESS de 8 dígitos de su red) y/o sector sanitario (texto exacto, solo por API: el modal de usuarios no lo ofrece).');
  p('Usuarios creados por la prueba:');
  p(`  ${pad('admin', 14)} ADMIN, sin red (ve todas)`);
  for (const [u, pf] of Object.entries(C.USUARIOS)) p(`  ${pad(u, 14)} ${pf.nota}`);

  p('\nCódigos HTTP por rol y recurso (200 = permitido; 403 = rol sin privilegio; filas = pacientes que devuelve):');
  const recursos = [
    ['GET /api/cronicos (lista = lo que precarga el cliente)', t => api('GET', '/api/cronicos', t)],
    ['GET /api/patients', t => api('GET', '/api/patients', t)],
    ['GET /api/patients/geo', t => api('GET', '/api/patients/geo', t)],
    ['GET /fhir/Bundle', t => api('GET', '/fhir/Bundle', t)],
    ['GET /api/establishments', t => api('GET', '/api/establishments', t)],
    ['GET /api/alerts/summary (agregados)', t => api('GET', '/api/alerts/summary', t)],
    ['GET /api/indicadores/convenio (agregados)', t => api('GET', '/api/indicadores/convenio', t)],
    ['POST /api/padron/importar-lote (lote vacío)', t => api('POST', '/api/padron/importar-lote', t, { patients: [] })],
    ['POST /api/webhooks/hosix (cuerpo vacío)', t => api('POST', '/api/webhooks/hosix', t, {})],
    ['GET /api/users', t => api('GET', '/api/users', t)],
    ['GET /api/security/audit-logs', t => api('GET', '/api/security/audit-logs?limit=1', t)]
  ];
  const cols = ['admin', ...Object.keys(C.USUARIOS)];
  p(pad('recurso', 56) + cols.map(c => pad(c.replace('f3.', ''), 11)).join(''));
  for (const [nombre, fn] of recursos) {
    const celdas = [];
    for (const c of cols) {
      const r = await fn(tokens[c]);
      let n = '';
      if (r.status === 200) {
        const j = r.json;
        const filas = Array.isArray(j) ? j.length : (j && Array.isArray(j.data) ? j.data.length : (j && Array.isArray(j.features) ? j.features.length : (j && Array.isArray(j.entry) ? j.entry.length : null)));
        if (filas !== null) n = ' (' + filas + ')';
      }
      celdas.push(pad(r.status + n, 11));
    }
    p(pad(nombre, 56) + celdas.join(''));
  }

  p('\nEscribir (crear / editar) con la misma carga que arma el formulario, un usuario por rol, DNI inventado:');
  const escrituras = [];
  for (const [u, doc] of [['admin', '96500001'], ['f3.coord.ps', '96500002'], ['f3.coord.pn', '96500003'], ['f3.dir.ps', '96500004']]) {
    const extra = u === 'f3.coord.pn' ? { campos: { red_salud: 'PACIFICO NORTE' }, eess: 'Fuera del distrito (se anota cuál en Observaciones)' } : {};
    const cuerpo = cuerpoFormulario(doc, 'DNI', 'PACIENTE INVENTADO ' + u.toUpperCase(), extra);
    if (u === 'f3.coord.pn') { delete cuerpo.patients[0].puerta_entrada_id; cuerpo.patients[0].puerta_entrada = ''; cuerpo.patients[0].establecimiento_control = ''; cuerpo.patients[0].establecimiento_adscripcion = ''; }
    const crear = await api('POST', '/api/padron/importar-lote', tokens[u], cuerpo);
    cuerpo.patients[0].apellidos_nombres += ' EDITADO';
    const editar = await api('POST', '/api/padron/importar-lote', tokens[u], cuerpo);
    escrituras.push(`  ${pad(u, 14)} crear → ${crear.status} ${resumen(crear.json && (crear.json.message || (crear.json.issue && crear.json.issue[0].diagnostics)), 90)}\n  ${pad('', 14)} editar → ${editar.status}`);
  }
  escrituras.forEach(l => p(l));
  p('  (COORDINADOR de PACIFICO NORTE por API sí puede escribir con red_salud explícita; la interfaz no se lo permite: ver B2.)');

  // ---------------------------------------------------------------- 2. Matriz rol × documento
  p('\n## 2. Matriz rol × documento — «buscar por documento»');
  p('El cliente NO llama a un endpoint dedicado: filtra la lista que trajo GET /api/cronicos al iniciar sesión (main.js:943-957; registroClinicoModal.js:760-766).');
  const dedicado = [];
  for (const ruta of ['/api/patients/10000001', '/api/cronicos/10000001', '/api/patients/search?dni=10000001', '/api/pacientes/10000001']) {
    const r = await api('GET', ruta, tokens['f3.coord.ps']);
    dedicado.push(`${ruta} → ${r.status}`);
  }
  p('Rutas «buscar por DNI» probadas con un COORDINADOR (todas deberían ser inexistentes): ' + dedicado.join(' · '));

  p('\nDocumentos de la prueba:');
  for (const k of [...EXISTEN, ...INEXISTENTES]) p(`  ${pad(k, 5)} ${pad(DOCS[k].doc, 11)} ${DOCS[k].nota}`);

  const vehiculos = {
    'V1 GET /api/patients/:doc/eventos': (t, d) => api('GET', `/api/patients/${encodeURIComponent(d)}/eventos`, t),
    'V2 GET /fhir/Patient/:doc': (t, d) => api('GET', `/fhir/Patient/${encodeURIComponent(d)}`, t),
    'V3 GET /api/cronicos?q=:doc': (t, d) => api('GET', `/api/cronicos?q=${encodeURIComponent(d)}`, t),
    'V4 POST /api/appointments/pre-cita': (t, d) => api('POST', '/api/appointments/pre-cita', t, { patient_id: d, fecha_sugerida: en30 }),
    'V5 PUT /api/patients/:doc/consentimiento (valor inválido)': (t, d) => api('PUT', `/api/patients/${encodeURIComponent(d)}/consentimiento`, t, { consentimiento: 'invalido' }),
    'V6 POST /api/patients/:doc/eventos (tipo inválido)': (t, d) => api('POST', `/api/patients/${encodeURIComponent(d)}/eventos`, t, { tipo: 'invalido' })
  };
  const usuarios = ['admin', 'f3.coord.ps', 'f3.coord.lv', 'f3.coord.sec', 'f3.coord.pn', 'f3.dir.ps', 'f3.dir.pn'];
  const claves = [...EXISTEN, ...INEXISTENTES];
  const resultados = {}; // vehiculo -> usuario -> clave -> {status, forma}
  const forma = (v, r) => {
    if (v.startsWith('V3')) {
      const filas = Array.isArray(r.json) ? r.json : [];
      return r.status === 200 ? `filas=${filas.length}` : `${r.status}`;
    }
    return String(r.status);
  };
  for (const [vn, fn] of Object.entries(vehiculos)) {
    resultados[vn] = {};
    for (const u of usuarios) {
      resultados[vn][u] = {};
      for (const k of claves) {
        const r = await fn(tokens[u], DOCS[k].doc);
        resultados[vn][u][k] = { status: r.status, celda: forma(vn, r), cuerpo: r.text, exactas: vn.startsWith('V3') && Array.isArray(r.json) ? r.json.filter(x => String(x.dni) === DOCS[k].doc).length : null };
      }
    }
  }

  for (const [vn] of Object.entries(vehiculos)) {
    p(`\n### ${vn}`);
    p(pad('documento', 16) + usuarios.map(u => pad(u.replace('f3.', ''), 10)).join(''));
    for (const k of claves) {
      const celdas = usuarios.map(u => {
        const x = resultados[vn][u][k];
        return pad(vn.startsWith('V3') ? (x.status === 200 ? `200 n=${x.exactas}` : String(x.status)) : String(x.status), 10);
      });
      p(pad(`${k} ${DOCS[k].doc}`, 16) + celdas.join(''));
    }
  }

  // Contraste con lo esperado por el código de scope.js
  p('\n### Contraste con el alcance esperado (scope.js)');
  let discrepancias = 0;
  for (const u of usuarios) {
    const dir = u.startsWith('f3.dir');
    for (const k of claves) {
      const visible = VISIBLES[u].includes(k);
      const v1 = resultados['V1 GET /api/patients/:doc/eventos'][u][k].status;
      const v2 = resultados['V2 GET /fhir/Patient/:doc'][u][k].status;
      const v3 = resultados['V3 GET /api/cronicos?q=:doc'][u][k];
      const esperado = dir ? 403 : (visible ? 200 : 404);
      const v3ok = dir ? v3.status === 403 : (visible ? (v3.status === 200 && v3.exactas === 1) : (v3.status === 200 && v3.exactas === 0));
      if (v1 !== esperado || v2 !== esperado || !v3ok) { discrepancias++; p(`  DISCREPANCIA ${u} ${k}: V1=${v1} V2=${v2} V3=${v3.status}/n=${v3.exactas}; esperado ${esperado}`); }
    }
  }
  p(discrepancias === 0 ? '  Sin discrepancias: cada usuario ve exactamente lo que su rol, red, establecimiento y sector permiten (en V1, V2 y V3).' : `  ${discrepancias} discrepancias.`);

  // Oráculo de existencia: fuera de alcance vs inexistente
  p('\n### Oráculo de existencia: «existe pero fuera de mi alcance» frente a «no existe» (código y cuerpo idénticos)');
  let hayOraculo = false;
  for (const [vn] of Object.entries(vehiculos)) {
    for (const u of usuarios.filter(x => x !== 'admin' && !x.startsWith('f3.dir'))) {
      const fuera = claves.filter(k => EXISTEN.includes(k) && !VISIBLES[u].includes(k));
      const firmas = new Map();
      for (const k of [...fuera, ...INEXISTENTES]) {
        const x = resultados[vn][u][k];
        const firma = vn.startsWith('V3') ? `${x.status} filas-exactas=${x.exactas}` : `${x.status} ${x.cuerpo}`;
        if (!firmas.has(firma)) firmas.set(firma, []);
        firmas.get(firma).push(k);
      }
      const veredicto = firmas.size === 1 ? 'INDISTINGUIBLES' : 'DISTINGUIBLES';
      if (firmas.size !== 1) hayOraculo = true;
      p(`  ${pad(vn.split(' ').slice(0, 3).join(' '), 46)} ${pad(u.replace('f3.', ''), 10)} ${veredicto}${firmas.size === 1 ? '' : ' → ' + [...firmas.entries()].map(([f, ks]) => `${ks.join('/')}: ${resumen(f, 70)}`).join(' | ')}`);
    }
  }
  const ejemplo = resultados['V1 GET /api/patients/:doc/eventos']['f3.coord.ps'].PN1;
  const ejemplo2 = resultados['V1 GET /api/patients/:doc/eventos']['f3.coord.ps'].NX;
  p(`  Ejemplo V1 (coord.ps): PN1 (existe en otra red) → ${ejemplo.status} ${ejemplo.cuerpo}`);
  p(`  Ejemplo V1 (coord.ps): NX  (no existe)          → ${ejemplo2.status} ${ejemplo2.cuerpo}`);
  p(hayOraculo ? '  >> HAY oráculo en alguna vía de lectura.' : '  >> Lectura sin oráculo: fuera de alcance e inexistente dan el mismo código y el mismo cuerpo en V1 a V6 (V5/V6 devuelven 404 igual; en alcance llegan a la validación, 400).');

  // Tiempos
  p('\n### Tiempo de respuesta (coord.pn; fuera de alcance = H1, inexistente = NX; 80 muestras intercaladas por vía, loopback)');
  for (const [nombre, fn] of [['V1 eventos', d => api('GET', `/api/patients/${d}/eventos`, tokens['f3.coord.pn'])], ['V2 fhir/Patient', d => api('GET', `/fhir/Patient/${d}`, tokens['f3.coord.pn'])]]) {
    const a = [], b = [];
    for (let i = 0; i < 80; i++) { a.push((await fn(DOCS.H1.doc)).ms); b.push((await fn(DOCS.NX.doc)).ms); }
    const f = x => x.toFixed(3);
    p(`  ${pad(nombre, 16)} fuera de alcance: mediana ${f(mediana(a))} ms, p90 ${f(pct(a, 0.9))} ms · inexistente: mediana ${f(mediana(b))} ms, p90 ${f(pct(b, 0.9))} ms · diferencia de medianas ${f(mediana(a) - mediana(b))} ms`);
  }
  p('  (Diferencias de décimas de milisegundo o menos, dentro del ruido de una conexión local: no sirven para distinguir.)');

  // ---------------------------------------------------------------- 3. Tokens
  p('\n## 3. Sin sesión, token alterado y token vencido');
  const secret = process.env.AUTH_SECRET;
  const ahora = Date.now();
  // Usuario desechable para desactivarlo y cambiarle la clave
  await api('POST', '/api/users', A, { username: 'f3.tmp1', nombre: 'Desechable uno', correo: 'f3-tmp1@prueba.example', role: 'COORDINADOR', red: '156', password: process.env.CLAVE_USUARIOS });
  await api('POST', '/api/users', A, { username: 'f3.tmp2', nombre: 'Desechable dos', correo: 'f3-tmp2@prueba.example', role: 'COORDINADOR', red: '156', password: process.env.CLAVE_USUARIOS });
  const tTmp1 = await C.loginUsuario('f3.tmp1');
  const tTmp2 = await C.loginUsuario('f3.tmp2');
  await new Promise(r => setTimeout(r, 30));
  const buenoPs = tokens['f3.coord.ps'];
  const [cuerpoB, firmaB] = buenoPs.split('.');
  const payloadB = JSON.parse(Buffer.from(cuerpoB, 'base64url').toString());
  const casos = [];
  casos.push(['sin encabezado Authorization', null, {}]);
  casos.push(['Bearer vacío', null, { Authorization: 'Bearer ' }]);
  casos.push(['Bearer con basura (abc)', null, { Authorization: 'Bearer abc' }]);
  casos.push(['esquema Basic', null, { Authorization: 'Basic YWRtaW46eA==' }]);
  casos.push(['firma con el último carácter cambiado', buenoPs.slice(0, -1) + (buenoPs.slice(-1) === 'A' ? 'B' : 'A'), null]);
  const alterado = Buffer.from(JSON.stringify(Object.assign({}, payloadB, { sub: 'admin' })), 'utf8').toString('base64url');
  casos.push(['contenido cambiado a «admin» con la firma original', alterado + '.' + firmaB, null]);
  const extendido = Buffer.from(JSON.stringify(Object.assign({}, payloadB, { exp: payloadB.exp + 30 * 86400000 })), 'utf8').toString('base64url');
  casos.push(['vigencia extendida +30 días con la firma original', extendido + '.' + firmaB, null]);
  casos.push(['firma vacía (cuerpo + «.»)', cuerpoB + '.', null]);
  casos.push(['solo el contenido, sin firma', cuerpoB, null]);
  casos.push(['VENCIDO auténtico (firmado con el secreto real, exp hace 1 h)', C.firmarToken({ sub: 'f3.coord.ps', iat: ahora - 9 * 3600e3, exp: ahora - 3600e3 }, secret), null]);
  casos.push(['firmado con OTRO secreto (vigente)', C.firmarToken({ sub: 'f3.coord.ps', iat: ahora, exp: ahora + 3600e3 }, 'otro-secreto-distinto-' + 'x'.repeat(30)), null]);
  casos.push(['usuario inexistente, firmado con el secreto real', C.firmarToken({ sub: 'fantasma', iat: ahora, exp: ahora + 3600e3 }, secret), null]);
  await api('PATCH', '/api/users/f3.tmp1', A, { activo: false });
  casos.push(['usuario DESACTIVADO después de iniciar sesión', tTmp1, null]);
  const cc = await api('POST', '/api/auth/cambiar-clave', tTmp2, { clave_actual: process.env.CLAVE_USUARIOS, clave_nueva: process.env.CLAVE_USUARIOS + 'x' });
  casos.push(['token emitido ANTES de cambiar la clave (cambio: ' + cc.status + ')', tTmp2, null]);
  p(pad('caso', 70) + pad('lista', 16) + pad('eventos', 16) + 'WWW-Authenticate / mensaje');
  let tokensMal = 0;
  for (const [nombre, tok, hdr] of casos) {
    const headers = hdr || {};
    const r1 = await api('GET', '/api/cronicos?q=10000001', tok, undefined, headers);
    const r2 = await api('GET', '/api/patients/10000001/eventos', tok, undefined, headers);
    const r3 = await api('GET', '/api/patients/96999999/eventos', tok, undefined, headers);
    const msg = r1.json && r1.json.issue ? r1.json.issue[0].diagnostics : r1.text;
    if (r1.status !== 401 || r2.status !== 401 || r3.status !== 401 || r2.text !== r3.text) tokensMal++;
    p(pad(nombre, 70) + pad(`${r1.status}`, 16) + pad(`${r2.status}`, 16) + `${r1.www ? 'sí' : 'NO'} · ${resumen(msg, 70)}`);
  }
  p(tokensMal === 0 ? '  >> Todos los casos dan 401, con el mismo cuerpo exista o no el documento (una sesión inválida no deja buscar nada).' : `  >> ${tokensMal} casos NO dieron 401 uniforme.`);

  // ---------------------------------------------------------------- 4. Escrituras
  p('\n## 4. Guardar una atención fuera del alcance (POST /api/padron/importar-lote con la carga del formulario)');
  const W = [];
  const intenta = async (etiqueta, usuario, cuerpo) => {
    const r = await api('POST', '/api/padron/importar-lote', tokens[usuario], cuerpo);
    const msg = r.json && r.json.issue ? r.json.issue[0].diagnostics : (r.json && (r.json.message || r.json.error)) || r.text;
    W.push([etiqueta, usuario, r.status, msg]);
    p(`  ${pad(etiqueta, 78)} ${pad(usuario.replace('f3.', ''), 9)} → ${r.status} ${resumen(msg, 95)}`);
    return r;
  };
  const wNx = await intenta('W1 documento NUEVO (no existe) en la propia red', 'f3.coord.ps', cuerpoFormulario('96510001', 'DNI', 'PACIENTE INVENTADO NUEVO PS'));
  await intenta('W2 DNI que YA existe en OTRA red (PN1) escrito como paciente nuevo', 'f3.coord.ps', cuerpoFormulario(DOCS.PN1.doc, 'DNI', 'INTENTO DE SOBRESCRIBIR'));
  await intenta('W2b carné de extranjería que existe en otra red (PNCE)', 'f3.coord.ps', cuerpoFormulario(DOCS.PNCE.doc, 'CE', 'INTENTO DE SOBRESCRIBIR'));
  await intenta('W2c pasaporte que existe en otra red (PNPA)', 'f3.coord.ps', cuerpoFormulario(DOCS.PNPA.doc, 'PAS', 'INTENTO DE SOBRESCRIBIR'));
  await intenta('W2d documento inexistente (CE) en la propia red, para comparar con W2b', 'f3.coord.ps', cuerpoFormulario('009651002', 'CE', 'PACIENTE INVENTADO NUEVO CE'));
  await intenta('W3 DNI de la propia red pero OTRO establecimiento (coord.lv escribe H1)', 'f3.coord.lv', cuerpoFormulario(DOCS.H1.doc, 'DNI', 'INTENTO DE SOBRESCRIBIR', { eess: LV }));
  // Con un establecimiento del catálogo en el formulario, el servidor DERIVA la red del establecimiento (apiRoutes.js:643-651) y descarta la red_salud enviada
  const reas = await intenta('W4 reasignar un paciente propio (RE1) a otra red enviando red_salud PN + el EESS por defecto', 'f3.coord.ps', cuerpoFormulario('96310007', 'DNI', 'PACIENTE INVENTADO REASIGNAR', { campos: { red_salud: 'PACIFICO NORTE' } }));
  const reasVer = await api('GET', '/api/cronicos?q=96310007', A);
  p(`      → red_salud de RE1 en el servidor: ${reasVer.json[0].red_salud} (la red enviada se ignoró: se deriva del establecimiento)`);
  const sinCodigo = cuerpoFormulario('96310007', 'DNI', 'PACIENTE INVENTADO REASIGNAR', { campos: { red_salud: 'PACIFICO NORTE' } });
  Object.assign(sinCodigo.patients[0], { establecimiento_control: '', establecimiento_adscripcion: '', puerta_entrada: '' }); delete sinCodigo.patients[0].puerta_entrada_id;
  await intenta('W4b reasignar RE1 a otra red enviando red_salud PN SIN código de establecimiento (solo por API)', 'f3.coord.ps', sinCodigo);
  await intenta('W5 paciente NUEVO con red_salud de otra red + el EESS por defecto (la red se deriva del EESS)', 'f3.coord.ps', cuerpoFormulario('96510002', 'DNI', 'PACIENTE INVENTADO RED AJENA', { campos: { red_salud: 'PACIFICO NORTE' } }));
  const nuevoPn = cuerpoFormulario('96510011', 'DNI', 'PACIENTE INVENTADO RED AJENA SIN EESS', { campos: { red_salud: 'PACIFICO NORTE' } });
  Object.assign(nuevoPn.patients[0], { establecimiento_control: '', establecimiento_adscripcion: '', puerta_entrada: '' }); delete nuevoPn.patients[0].puerta_entrada_id;
  await intenta('W5b paciente NUEVO con red_salud PN sin código de establecimiento (solo por API)', 'f3.coord.ps', nuevoPn);
  await intenta('W6 paciente nuevo con un establecimiento que no está en el catálogo de la red', 'f3.coord.ps', cuerpoFormulario('96510003', 'DNI', 'PACIENTE INVENTADO EESS AJENO', { eess: 'P. S. Ajeno (00009999, I-1)' }));
  await intenta('W7 id de un paciente de otra red con un documento nuevo (secuestro del id)', 'f3.coord.ps', cuerpoFormulario('96510004', 'DNI', 'INTENTO DE SECUESTRO', { campos: { id: 'pac-00001741-' + DOCS.PN1.doc } }));
  await intenta('W8 coord.lv crea paciente nuevo con el EESS por defecto del formulario (Hospital)', 'f3.coord.lv', cuerpoFormulario('96510005', 'DNI', 'PACIENTE INVENTADO LV HOSPITAL'));
  await intenta('W9 coord.lv crea paciente nuevo en su establecimiento (La Victoria)', 'f3.coord.lv', cuerpoFormulario('96510006', 'DNI', 'PACIENTE INVENTADO LV PROPIO', { eess: LV }));
  const wMover = await intenta('W10 coord.lv MUEVE un paciente suyo (LV2) al Hospital (otro establecimiento de su red)', 'f3.coord.lv', cuerpoFormulario(DOCS.LV2.doc, 'DNI', 'PACIENTE INVENTADO LA VICTORIA DOS', { eess: H, campos: { id: 'pac-00001741-' + DOCS.LV2.doc } }));
  const trasMover = await api('GET', `/api/cronicos?q=${DOCS.LV2.doc}`, tokens['f3.coord.lv']);
  p(`      → tras W10, ¿coord.lv sigue viendo a LV2? ${trasMover.json && trasMover.json.length ? 'sí' : 'NO: el paciente salió de su establecimiento'}`);
  await intenta('W11 coord.pn crea paciente con el EESS por defecto del formulario (Hospital)', 'f3.coord.pn', cuerpoFormulario('96510007', 'DNI', 'PACIENTE INVENTADO PN HOSPITAL'));
  const sinEess = cuerpoFormulario('96510008', 'DNI', 'PACIENTE INVENTADO PN FUERA', { eess: 'Fuera del distrito (se anota cuál en Observaciones)' });
  await intenta('W12 coord.pn crea paciente con «Fuera del distrito» (sin código)', 'f3.coord.pn', sinEess);
  await intenta('W13 DIRECTOR intenta guardar', 'f3.dir.ps', cuerpoFormulario('96510009', 'DNI', 'PACIENTE INVENTADO DIRECTOR'));
  await intenta('W14 sin sesión', 'f3.__sin__', cuerpoFormulario('96510010', 'DNI', 'PACIENTE INVENTADO SIN SESION')).catch(() => { });
  // Sector: vocabulario del formulario frente al alcance por sector (paciente nuevo S62, sector «Sector 62», visible para coord.sec)
  const antesSec = await api('GET', '/api/cronicos?q=96310006', tokens['f3.coord.sec']);
  await intenta('W15 coord.sec (sector «Sector 62») guarda a S62 con el sector que envía el formulario («Sector I – Centro»)', 'f3.coord.sec', cuerpoFormulario('96310006', 'DNI', 'PACIENTE INVENTADO SECTOR 62', { campos: { id: 'pac-00001741-96310006' } }));
  const despSec = await api('GET', '/api/cronicos?q=96310006', tokens['f3.coord.sec']);
  p(`      → coord.sec veía a S62 antes: ${antesSec.json.length ? 'sí' : 'no'}; después: ${despSec.json.length ? 'sí' : 'NO (el paciente salió de su sector al guardar desde el formulario)'}`);
  const verS62 = await api('GET', '/api/cronicos?q=96310006', A);
  p(`      → sector_sanitario de S62 en el servidor ahora: «${verS62.json[0].sector_sanitario}» (antes «Sector 62»)`);
  const nuevoSec = await intenta('W16 coord.sec crea un paciente nuevo (el formulario envía «Sector I – Centro»)', 'f3.coord.sec', cuerpoFormulario('96510012', 'DNI', 'PACIENTE INVENTADO SECTOR NUEVO'));
  const verSec = await api('GET', '/api/cronicos?q=96510012', tokens['f3.coord.sec']);
  p(`      → coord.sec ve al paciente que acaba de crear: ${verSec.json.length ? 'sí' : 'NO (queda fuera de su propio alcance)'}`);

  // El paciente de otra red no cambió
  const pn1 = await api('GET', '/api/cronicos?q=' + DOCS.PN1.doc, A);
  p(`\nComprobación: PN1 en el servidor sigue siendo «${pn1.json[0].apellidos_nombres}» (red_salud ${pn1.json[0].red_salud}) → los intentos W2/W2b/W2c no sobrescribieron nada.`);
  const nx = await api('GET', '/api/cronicos?q=96510001', A);
  p(`Comprobación: W1 creó «${nx.json[0] && nx.json[0].apellidos_nombres}» con red_salud ${nx.json[0] && nx.json[0].red_salud}, puerta_entrada_id ${nx.json[0] && nx.json[0].puerta_entrada_id}.`);

  p('\n### Lectura de W1 frente a W2');
  p('  W1 (documento que no existe) responde 200 y crea al paciente; W2/W2b/W2c (documento que existe en otra red) responden 403 «No puede modificar pacientes fuera de su alcance.»');
  p('  → por la vía de GUARDAR sí se distingue «existe en otra red» de «no existe» (oráculo residual de F2-04, que F2 dejó anotado para la Fase 5).');
  p('\nFin de B1.');
})().catch(e => { console.log('ERROR B1:', e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e); process.exit(1); });
