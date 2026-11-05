// Prueba 4 (parte A): exportar a Excel desde la UI, abrir con xlsx del repo, contar columnas/filas.
const L = require('./lib');
const XLSX = require('/home/user/cronicos-huarmey/client/libs/xlsx.full.min.js');
(async () => {
  const browser = await L.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const bag = {};
  L.instrument(page, bag);
  const out = {};
  await page.goto(L.BASE + '/'); await page.waitForSelector('#login-overlay.active');
  await L.uiLogin(page, L.ADMIN);
  await page.waitForFunction(() => window.app.patients.length > 0); await L.sleep(1000);
  await page.click('#rail-tab-padron'); await L.sleep(500);
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('#btn-export-padron')
  ]);
  const file = L.W + '/export_padron.xlsx';
  await dl.saveAs(file);
  out.suggestedFilename = dl.suggestedFilename();
  out.size = L.fs.statSync(file).size;
  out.toast = await page.evaluate(() => [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent.trim()));
  const wb = XLSX.read(L.fs.readFileSync(file), { type: 'buffer', cellDates: true });
  out.sheets = wb.SheetNames;
  const ws = wb.Sheets['Padrón'];
  const range = XLSX.utils.decode_range(ws['!ref']);
  out.ref = ws['!ref'];
  out.cols = range.e.c + 1;
  out.rows = range.e.r + 1;
  const hdr = [];
  for (let c = 0; c <= range.e.c; c++) { const cell = ws[XLSX.utils.encode_cell({ r: 6, c })]; hdr.push(cell ? String(cell.v) : ''); }
  out.headerCount = hdr.filter(Boolean).length;
  out.firstHeaders = hdr.slice(0, 6);
  // columnas con formula vs escritas
  let formulaCols = 0;
  for (let c = 0; c <= range.e.c; c++) { const cell = ws[XLSX.utils.encode_cell({ r: 7, c })]; if (cell && cell.f) formulaCols++; }
  out.columnasConFormulaFila8 = formulaCols;
  out.columnasSinFormula = out.cols - formulaCols;
  out.pacientesEnHoja = range.e.r + 1 - 7;
  out.calcPr = wb.Workbook && wb.Workbook.CalcPr;
  // importar de vuelta con el parser del repo (modo Node)
  const parser = require('/home/user/cronicos-huarmey/client/js/data/padronExcelParser.js');
  const schema = require('/home/user/cronicos-huarmey/client/js/data/padronSchema.js');
  const buf = L.fs.readFileSync(file);
  global.XLSX = XLSX;
  try {
    const parsed = await parser.parseWorkbook(new Uint8Array(buf).buffer);
    out.roundTripRows = parsed.patients.length;
    const v = schema.validateBatch(parsed.patients);
    out.roundTripValid = { totalErrors: v.totalErrors, rowsWithErrors: v.rowsWithErrors, percent: v.percent };
    out.roundTripFirstErrors = v.rowResults.map((r, i) => r.isValid ? null : (i + 1) + ':' + Object.keys(r.errors).join('|')).filter(Boolean).slice(0, 10);
  } catch (e) { out.roundTripErr = e.message; }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
