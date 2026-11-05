// Segundo Excel INVENTADO: nombre con entidades (sobrevive a toUpperCase) y token en cie10_erc / cie10_dm
const XLSX = require('/home/user/cronicos-huarmey/client/libs/xlsx.full.min.js');
const exp = require('/home/user/cronicos-huarmey/client/js/data/padronExportV4.js');
const fs = require('fs');
const H = 'Hospital de Apoyo Huarmey (00001741, II-1)';
const ent = s => [...s].map(c => '&#' + c.charCodeAt(0) + ';').join('');
function base(dni, nombre, extra) {
  return Object.assign({
    tipo_documento: 'DNI', nro_documento: dni, apellidos_nombres: nombre, sexo: 'Femenino', fecha_nacimiento: '1960-05-10',
    seguro_salud: 'SIS', sector: 'Sector I – Centro', direccion: 'Jr. Prueba 123', establecimiento_adscripcion: H, establecimiento_control: H,
    cie10_hta: 'I10.X – Hipertensión esencial (primaria)', pas_oct: 150, pad_oct: 95, fecha_ultimo_control: '2026-10-20', proxima_cita: '2026-11-25',
    estado_paciente: 'Activo', consentimiento: 'Sí, firmado'
  }, extra || {});
}
const rows = [
  base('70000011', '<img src=x onerror=' + ent('window.__xss_nm=1') + '>', { direccion: '<img src=x onerror=' + ent('window.__xss_dir2=1') + '>' }),
  base('70000012', 'PRUEBA TOKEN SIMULADO', { cie10_erc: "<img src=x onerror=window.__xss_tok=sessionStorage.getItem('maxime_cronicos_sesion_v1').length>" })
];
fs.writeFileSync(__dirname + '/invented_padron2.xlsx', XLSX.write(exp.construirLibro(XLSX, rows), { type: 'buffer', bookType: 'xlsx' }));
console.log('ok');
