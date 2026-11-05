const XLSX = require('/home/user/cronicos-huarmey/client/libs/xlsx.full.min.js');
const exp = require('/home/user/cronicos-huarmey/client/js/data/padronExportV4.js');
const fs = require('fs');
const H = 'Hospital de Apoyo Huarmey (00001741, II-1)';
function base(dni, nombre, extra) {
  return Object.assign({
    tipo_documento: 'DNI', nro_documento: dni, apellidos_nombres: nombre, sexo: 'Femenino', fecha_nacimiento: '1960-05-10',
    seguro_salud: 'SIS', sector: 'Sector I – Centro', direccion: 'Jr. Bolognesi 123', establecimiento_adscripcion: H, establecimiento_control: H,
    cie10_hta: 'I10.X – Hipertensión esencial (primaria)', pas_oct: 150, pad_oct: 95, fecha_ultimo_control: '2026-10-20', proxima_cita: '2026-11-25',
    estado_paciente: 'Activo', consentimiento: 'Sí, firmado'
  }, extra || {});
}
const rows = [
  base('70000021', 'PRUEBA EDAD DICIEMBRE', { fecha_nacimiento: '1966-12-25' }),   // edad real al 2026-11-05: 59
  base('70000022', 'PRUEBA EDAD ENERO', { fecha_nacimiento: '1966-01-01' }),        // 60
  base('70000023', 'PRUEBA SIN GEO', { direccion: 'Calle Inventada 999' })
];
fs.writeFileSync(__dirname + '/invented_padron3.xlsx', XLSX.write(exp.construirLibro(XLSX, rows), { type: 'buffer', bookType: 'xlsx' }));
