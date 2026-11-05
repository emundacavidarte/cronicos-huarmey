const XLSX = require('/home/user/cronicos-huarmey/client/libs/xlsx.full.min.js');
const exp = require('/home/user/cronicos-huarmey/client/js/data/padronExportV4.js');
const fs = require('fs');
const H = 'Hospital de Apoyo Huarmey (00001741, II-1)';
const rows = [{
  tipo_documento: 'DNI', nro_documento: '70000031', apellidos_nombres: 'PRUEBA TOOLTIP SIMULADO', sexo: 'Femenino', fecha_nacimiento: '1960-05-10',
  seguro_salud: 'SIS', sector: 'Sector I – Centro', direccion: 'Jr. Bolognesi 123', establecimiento_adscripcion: H, establecimiento_control: H,
  cie10_hta: "<img src=x onerror=window.__xss_tip=1>", pas_oct: 150, pad_oct: 95, fecha_ultimo_control: '2026-10-20', proxima_cita: '2026-11-25', estado_paciente: 'Activo', consentimiento: 'Sí, firmado'
}];
fs.writeFileSync(__dirname + '/invented_padron4.xlsx', XLSX.write(exp.construirLibro(XLSX, rows), { type: 'buffer', bookType: 'xlsx' }));
