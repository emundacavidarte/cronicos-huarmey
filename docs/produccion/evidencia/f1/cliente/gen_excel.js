// Genera un Excel v4 con datos INVENTADOS (usa el exportador del repo para respetar el formato exacto).
const XLSX = require('/home/user/cronicos-huarmey/client/libs/xlsx.full.min.js');
const exp = require('/home/user/cronicos-huarmey/client/js/data/padronExportV4.js');
const fs = require('fs');
const H = 'Hospital de Apoyo Huarmey (00001741, II-1)';
function base(dni, nombre, extra) {
  return Object.assign({
    tipo_documento: 'DNI', nro_documento: dni, apellidos_nombres: nombre, sexo: 'Femenino', fecha_nacimiento: '1960-05-10',
    seguro_salud: 'SIS', sector: 'Sector I – Centro', direccion: 'Jr. Prueba 123', establecimiento_adscripcion: H, establecimiento_control: H,
    cie10_hta: 'I10.X – Hipertensión esencial (primaria)', pas_oct: 150, pad_oct: 95, fecha_ultimo_control: '2026-10-20', proxima_cita: '2026-11-25',
    estado_paciente: 'Activo', consentimiento: 'Sí, firmado'
  }, extra || {});
}
const X = (n) => `<img src=x onerror=window.__xss_${n}=1>`;
const rows = [
  base('70000001', '<img src=x onerror=window.__xss=1>', { direccion: X('dir'), historia_clinica: X('hc'), telefono: '<img src=x onerror=window.__xss_tel=123456>' }),
  base('70000002', 'PRUEBA UNO SIMULADO', { cie10_hta: X('hta') }),
  base('70000003', 'PRUEBA DOS SIMULADO', { cie10_dm: X('dm'), tratamiento_hta: X('trat'), observaciones: X('obs'), actualizado_por: X('act') }),
  base('70000004', 'PRUEBA TRES SIMULADO'),
  base('70000004', 'PRUEBA CUATRO SIMULADO DUPLICADO'),
  base('70000006', 'PRUEBA CINCO FECHA CALENDARIO INVALIDO', { fecha_nacimiento: '31/02/1960' }),
  base('70000007', 'PRUEBA SEIS FECHA TEXTO', { fecha_nacimiento: 'no-es-fecha' }),
  base('70000008', 'PRUEBA SIETE PA ABSURDA', { pas_oct: '12abc', pad_oct: 95 }),
  base('70000009', 'PRUEBA OCHO NUMERICOS CON HTML', {
    pas_oct: '150' + X('pas'), pad_oct: '95' + X('pad'), peso: '70' + X('peso'), talla: '1.60' + X('talla'), glucosa: '110' + X('glu'),
    hba1c: '6.5' + X('a1c'), creatinina: '1.0' + X('cr'), colesterol_ldl: '120' + X('ldl')
  })
];
const wb = exp.construirLibro(XLSX, rows);
fs.writeFileSync(__dirname + '/invented_padron.xlsx', XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
console.log('ok', rows.length);
