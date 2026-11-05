/**
 * Evidencia Fase 3 — sondas del motor clínico del cliente (sin servidor, sin datos reales).
 * Carga los módulos tal como los usa el navegador y los somete a casos con fechas relativas a «hoy».
 * Uso:  TZ=America/Lima node C1_motor_clinico_sondas.js    y    TZ=UTC node C1_motor_clinico_sondas.js
 *   OK        = el módulo hace lo que dice su base.
 *   DISCREPA  = el módulo no hace lo que dice su base (guía, otro módulo del mismo sistema, o error técnico).
 *   PREGUNTA  = hay un comportamiento que solo la licenciada de crónicos puede dar por bueno o malo; se muestra qué hace.
 */
const path = require('path');
const R = path.resolve(__dirname, '../../../../client/js');
const sem = require(R + '/clinical/semaforo.js');
const hearts = require(R + '/clinical/heartsEngine.js');
const calc = require(R + '/clinical/padronCalculadora.js');
const ind = require(R + '/clinical/indicadoresConvenio.js');
const wa = require(R + '/clinical/whatsappNotifier.js');
const hosix = require(R + '/data/hosixParser.js');

const p2 = n => String(n).padStart(2, '0');
function ymd(off) { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }
let disc = 0, ok = 0, preg = 0;
const J = x => JSON.stringify(x);
function chk(id, desc, esperado, observado, base) {
  const bien = J(esperado) === J(observado);
  bien ? ok++ : disc++;
  console.log(`${bien ? 'OK      ' : 'DISCREPA'} ${id}  ${desc}\n           esperado=${J(esperado)}  observado=${J(observado)}  [base: ${base}]`);
}
function q(id, desc, observado, pregunta) {
  preg++;
  console.log(`PREGUNTA ${id}  ${desc}\n           observado=${J(observado)}\n           → ${pregunta}`);
}
const sec = t => console.log(`\n=== ${t} ===`);

console.log(`Zona horaria del proceso: ${process.env.TZ || '(del sistema)'}  ·  hoy local=${ymd(0)}  ·  ${process.version}`);

sec('A. Fechas: «AAAA-MM-DD» leída como UTC corre un día en Lima (semaforo.js lo hace bien; otros módulos no)');
chk('A1', 'padronCalculadora.evaluarCita: cita HOY debe ser amarilla («Cita hoy»)', 'amarillo', calc.evaluarCita(ymd(0)).semaforo, 'semaforo.js: día 0 = amarillo');
chk('A2', 'padronCalculadora.evaluarCita: cita a +8 días debe ser verde (> 7)', 'verde', calc.evaluarCita(ymd(8)).semaforo, 'guía §3: verde si faltan > 7 días');
chk('A3', 'padronCalculadora.evaluarCita: cita de ayer = 1 día de atraso', 1, calc.evaluarCita(ymd(-1)).diasAtraso, 'guía §3: rojo ≥ 1 día de vencimiento');
chk('A4', 'semaforo.js (control): cita a +8 días = 8 días restantes, verde', [8, 'green'], [sem.calcularSemaforo({ appointments: [{ fecha_cita: ymd(8) }] }).dias_restantes, sem.calcularSemaforo({ appointments: [{ fecha_cita: ymd(8) }] }).semaforo], 'guía §3');
const hA = hearts.evaluatePatient({ appointments: [{ fecha_cita: ymd(8) }] });
chk('A5', 'heartsEngine: cita a +8 días = 8 días restantes y verde', [8, 'green'], [hA.dias_restantes, hA.semaforo], 'guía §3 y semaforo.js');
chk('A6', 'heartsEngine: fecha_limite devuelta = la fecha de la cita', ymd(8), hA.fecha_limite, 'misma fecha que se le dio');
chk('A7', 'medicación hasta: último control 2026-09-01 + 3 meses (90 días)', '2026-11-30', calc.calcularPadron({ fecha_ultimo_control: '2026-09-01', meses_medicacion: '3' }).medicacion_hasta, 'GUIA §2: receta trimestral = 90 días');

sec('B. Semáforo (semaforo.js) frente a la guía §3');
chk('B1', 'fallecido marcado solo como estado_paciente="Fallecido" → negro', 'black', sem.calcularSemaforo({ estado_paciente: 'Fallecido', appointments: [{ fecha_cita: ymd(-20) }] }).semaforo, 'padronCalculadora.js:342 e indicadoresConvenio.js:137 sí lo reconocen');
const asistio = sem.calcularSemaforo({ appointments: [{ fecha_cita: ymd(-10) }], observations: [{ fecha_registro: ymd(-10), pa_sistolica: 120, pa_diastolica: 80 }] });
q('B2', 'paciente que ASISTIÓ en la fecha de su cita (control registrado ese día) y aún no tiene otra cita', { semaforo: asistio.semaforo, dias_vencido: asistio.dias_vencido }, '¿«Rojo» debe significar «pasó la fecha de la cita» o «no vino»? El semáforo no mira los controles registrados: un paciente que sí vino aparece como desertor hasta que alguien programe otra cita.');
const lejana = sem.calcularSemaforo({ appointments: [{ fecha_cita: ymd(200) }], observations: [{ fecha_registro: ymd(-1), pa_sistolica: 170, pa_diastolica: 100, estado_control: 'No Controlado' }] });
q('B3', 'NO controlado (170/100) con la próxima cita a 200 días', { semaforo: lejana.semaforo, dias_restantes: lejana.dias_restantes }, 'La guía §2 manda cita a 30 días al no controlado. El sistema no compara la fecha de la cita con 30/90 días: queda verde. ¿Se debe avisar cuando la cita excede el intervalo?');
q('B4', 'cita exactamente HOY', sem.calcularSemaforo({ appointments: [{ fecha_cita: ymd(0) }] }).semaforo, 'La guía §3 define amarillo = «entre 1 y 7 días»; el día 0 no está definido (el código lo pone amarillo). ¿Se confirma?');

sec('C. Motor HEARTS (heartsEngine.js) frente a la guía §2');
const c1 = hearts.evaluatePatient({ observations: [{ fecha_registro: ymd(-1), estado_control: 'Controlado', pa_sistolica: 190, pa_diastolica: 110 }], appointments: [] });
chk('C1', 'etiqueta guardada «Controlado» con PA 190/110: ¿gana la etiqueta o la cifra?', 'No Controlado', c1.estado_control, 'guía §2: controlado = PA < 140/90');
const dm = (extra) => hearts.evaluatePatient({ conditions: [{ cie10_cod: 'E11.9' }], observations: [], appointments: [], ...extra });
q('C2', 'DM2 con HbA1c exactamente 7,0 % y PA 120/70', dm({ pa_sistolica: 120, pa_diastolica: 70, hba1c: 7.0 }).estado_control, 'La guía interna del repo (§2) dice «HbA1c ≤ 7,0 %»; la vía HEARTS dice < 7 % (skill de dominio, ref. 02, corte 12-oct-2026); el código usa < 7,0 como la vía. La guía interna es la que no coincide: hay que corregirla o confirmar con la licenciada.');
q('C3', 'DM2 con HbA1c 6,5 % y glucosa 140 mg/dL', dm({ pa_sistolica: 120, pa_diastolica: 70, hba1c: 6.5, glucosa: 140 }).estado_control, 'La guía §2 y el PP 0018 2026 (ref. 02) dicen HbA1c < 7 % «o» dos glucemias de 70 a 130; el código exige AMBAS cuando hay las dos (más estricto), y no distingue glucosa en ayunas de al azar.');
q('C4', 'DM2 con HbA1c 6,0 % y glucosa 65 mg/dL', dm({ pa_sistolica: 120, pa_diastolica: 70, hba1c: 6.0, glucosa: 65 }).estado_control, 'El 70–130 coincide con la definición del PP 0018 2026 (ref. 02) y no está en la guía interna. Pero ahí es «dos glucemias de 70 a 130 O HbA1c < 7 %»: con HbA1c 6,0 % el diabético cumple. ¿Una sola glucosa baja debe volver «No controlado» a quien tiene HbA1c en meta?');
const hta = c => hearts.evaluatePatient({ conditions: [{ cie10_cod: c }], observations: [], appointments: [] }).hasHta;
const dmx = c => hearts.evaluatePatient({ conditions: [{ cie10_cod: c }], observations: [], appointments: [] }).hasDm2;
chk('C5', 'HTA reconocida para I10, I11.9, I12.9, I13.0, I15.1 (el padrón admite I10–I15)', [true, true, true, true, true], ['I10', 'I11.9', 'I12.9', 'I13.0', 'I15.1'].map(hta), 'padronSchema.js:96 y indicadoresConvenio.js esHta()');
chk('C6', 'DM reconocida para E11.9, E10.9, E13, E14 (el padrón admite E10–E14)', [true, true, true, true], ['E11.9', 'E10.9', 'E13', 'E14'].map(dmx), 'padronSchema.js:97 e indicadoresConvenio.js esDm()');
q('C6b', 'texto «Diabetes mellitus tipo 1» sin código', hearts.evaluatePatient({ conditions: [{ diagnostico: 'Diabetes mellitus tipo 1' }], observations: [], appointments: [] }).hasDm2, 'El motor busca la palabra «diabet» y lo cuenta como DM2. ¿El programa de crónicos incluye DM1?');
const obsOrig = [{ fecha_registro: '2026-01-01', pa_sistolica: 150 }, { fecha_registro: '2026-06-01', pa_sistolica: 120 }];
const pac = { observations: obsOrig, appointments: [] }; hearts.evaluatePatient(pac);
chk('C7', 'evaluatePatient no debe reordenar la lista de observaciones del paciente', ['2026-01-01', '2026-06-01'], pac.observations.map(o => o.fecha_registro), 'efecto secundario: sort() in situ (hallazgo F20 de HALLAZGOS_AUDITORIA_PADRON.md)');
let lanza = false; try { hearts.evaluatePatient({ appointments: [{ fecha_cita: 'no-es-fecha' }] }); } catch (e) { lanza = e.name; }
chk('C8', 'una cita con fecha inválida no debe lanzar excepción', false, lanza, 'F20: toISOString() de una fecha inválida lanza RangeError');
const c9 = hearts.evaluatePatient({ conditions: [{ cie10_cod: 'I10' }], observations: [{ fecha_registro: ymd(-1), pa_sistolica: 120, pa_diastolica: 70 }], appointments: [] });
q('C9', 'hipertenso con UNA sola medición en meta', { estado: c9.estado_control, frecuencia_hearts: c9.frecuencia_hearts }, 'La guía §2 exige «3 o más controles estables»; el manual HIS 2025 dice «mensual hasta llegar a la meta y trimestral con tres controles en meta» (ref. 02, línea 85). El motor lo da por controlado con una sola medición y le asigna 90 días.');

sec('D. Misma persona, tres módulos, tres criterios de meta de PA');
const d = { cie10_dm: 'E11.9', cie10_hta: 'I10', pas_oct: '135', pad_oct: '85', hba1c: '6.5', fecha_nacimiento: '1960-01-01' };
const dPad = calc.calcularPadron(d);
const dHe = hearts.evaluatePatient({ conditions: [{ cie10_cod: 'I10' }, { cie10_cod: 'E11.9' }], observations: [], appointments: [], pa_sistolica: 135, pa_diastolica: 85, hba1c: 6.5 });
const dIn = ind.calcular([{ diagnosticos: ['I10', 'E11'], pas_oct: '135', pad_oct: '85', puerta_entrada_id: 'X' }]).total.hearts;
q('D1', 'DM2 + HTA con 135/85 y HbA1c 6,5 %', { padronCalculadora_pa_en_meta: dPad.pa_en_meta + ' (' + dPad.meta_presion + ')', heartsEngine: dHe.estado_control, indicadoresConvenio_hta_en_meta: dIn.hta_en_meta + ' de ' + dIn.hta_con_medicion }, 'Una misma lectura es «NO en meta» (ficha del paciente, 130/80 por DM), «controlado» (motor HEARTS, 140/90) y «en meta» (tablero, 140/90). ¿Qué meta rige para el paciente y cuál para el indicador del convenio?');
const d2 = calc.calcularPadron({ riesgo_cv_porcentaje: '25', pas_oct: '150', pad_oct: '95' });
chk('D2', 'riesgo CV 25 % (muy alto) sin DM/ERC/ECV: meta de PA', 130, d2.meta_presion.includes('130') ? 130 : 140, 'guía §2 (<130/80 en alto riesgo) y vía HEARTS (sistólica <130 si ECV, DM, ERC o riesgo ≥10 %, ref. 02): el código solo mira DM/ERC/ECV, no el riesgo ≥10 %');

sec('E. Valores por defecto y derivados en la ficha (padronCalculadora.js)');
const e1 = calc.calcularPadron({ creatinina: '1.4', sexo: 'Femenino' });
chk('E1', 'TFGe sin fecha de nacimiento: debe ser «Sin dato» (no se conoce la edad)', null, e1.tfge, 'edad || 50 en calcularPadron (línea 312)');
console.log(`           (con edad supuesta 50 → TFGe ${e1.tfge} «${e1.estadio_erc}»; la misma creatinina a los 80 años daría ${calc.calcularTfge('1.4', 80, 'Femenino').tfge} «${calc.calcularTfge('1.4', 80, 'Femenino').estadio}»)`);
chk('E2', 'medicación hasta sin «meses de medicación»: no debe suponer 1 mes', 'Sin fecha de entrega', calc.calcularPadron({ fecha_ultimo_control: '2026-09-01' }).medicacion_hasta, 'parseInt(mesesMed) || 1 (línea 273)');
const base = { apellidos_nombres: 'X', direccion: 'Y', establecimiento_adscripcion: 'Z' };
chk('E3', 'carné de extranjería válido (9 dígitos) no debe alertar «DNI no tiene 8 dígitos»', 'Dato conforme', calc.calcularPadron({ ...base, tipo_documento: 'Carné de extranjería', nro_documento: '001234567' }).alerta_del_dato, 'decisión de Edward 05/11/2026: CE y pasaporte son documentos válidos');
chk('E4', 'pasaporte válido (AB123456) no debe alertar «DNI no tiene 8 dígitos»', 'Dato conforme', calc.calcularPadron({ ...base, tipo_documento: 'Pasaporte', nro_documento: 'AB123456' }).alerta_del_dato, 'ídem');
const e5 = calc.calcularPadron({ cie10_dm: 'E11', hba1c: '8.1', fecha_hba1c: '2022-03-01', creatinina: '1', albuminuria: '10', colesterol_ldl: '90', fecha_evaluacion_pie: '2022-01-01', proxima_cita: ymd(30) });
chk('E5', 'HbA1c y examen de pies de HACE MÁS DE 4 AÑOS: ¿«al día»?', true, /HbA1c anual/.test(e5.que_le_falta), 'la HbA1c es «anual» (la lógica solo mira si hay valor, no su fecha); el tablero del convenio sí mira fechas');
console.log(`           (observado «Qué le falta»: ${e5.que_le_falta})`);
for (const v of ['-', 'No', 'Ninguno']) {
  chk('E6', `cie10_dm="${v}" no debe contarse como diabetes`, 'Bajo (< 5%)', calc.calcularPadron({ cie10_dm: v }).nivel_riesgo_cv, 'tieneDm = !!p.cie10_dm (cualquier texto cuenta)');
}
q('E7', 'una sola PA registrada y en meta', calc.calcularPadron({ pas_oct: '120', pad_oct: '70' }).controlado_estable, 'Se muestra «Sí (Parcial)». ¿Debe mostrarse «Controlado y estable» con menos de 3 controles?');
q('E8', 'riesgo CV: 12 % → «Alto», alto riesgo = Sí → meta de LDL < 70', { nivel: calc.calcularPadron({ riesgo_cv_porcentaje: '12', colesterol_ldl: '85' }).nivel_riesgo_cv, ldl_en_meta: calc.calcularPadron({ riesgo_cv_porcentaje: '12', colesterol_ldl: '85' }).ldl_en_meta }, 'Cortes <5 / 5–9 / 10–19 / ≥20 y metas de LDL 70 y 100: la guía HEARTS del repo no los trae. ¿Qué tabla de riesgo usa el programa y quién la aprobó?');
q('E10', 'DM2 de 75 años con HbA1c 7,5 %', calc.calcularPadron({ cie10_dm: 'E11', fecha_nacimiento: '1950-01-01', hba1c: '7.5' }).hba1c_en_meta, 'El código usa < 7,0 % para todos. La vía HEARTS fija < 8 % en adultos mayores o con comorbilidad grave y la GPC del IETSI 2025, 7,5–8,5 % desde los 65 (ref. 02 y 04). ¿Desde qué edad y con qué meta se individualiza?');
q('E9', 'IMC en adulto mayor (80 años, IMC 27)', calc.calcularImc(70, 1.61).valoracion, 'Se clasifica con los cortes de adulto joven (sobrepeso 25–29,9). ¿La valoración nutricional del adulto mayor usa otros cortes? [PENDIENTE: norma de valoración nutricional del adulto mayor]');

sec('F. Indicadores del convenio (indicadoresConvenio.js)');
const f1 = ind.calcular([{ diagnosticos: ['I10'], creatinina: '1.0', fecha_creatinina: '2026-03-10', puerta_entrada_id: 'X' }]).total;
q('F1', 'hipertenso con SOLO un examen en el periodo (sin ningún control): ¿entra al denominador de IP04?', { ip04_denominador: f1.ip04.denominador }, 'La cabecera del módulo dice «Atendido = al menos un control en el periodo», pero el código también cuenta un examen (HbA1c, creatinina o albuminuria) como atención. ¿Cuál es la definición de «atendido» del convenio? [PENDIENTE: ficha IP04 del convenio; corpus no conectado]');
const f2 = ind.calcular([
  { diagnosticos: ['I10'], pas_mar: '120', pad_mar: '70', pas_jun: '122', pad_jun: '72', puerta_entrada_id: 'X' },
  { diagnosticos: ['I10'], estado_paciente: 'Cambió de residencia', pas_mar: '120', pad_mar: '70', pas_jun: '122', pad_jun: '72', puerta_entrada_id: 'X' }
]).total.hearts;
q('F2', 'paciente que «Cambió de residencia» (o «Abandono») sigue en el padrón de HTA', { hta_padron: f2.hta_padron, hta_con_medicion: f2.hta_con_medicion }, 'Solo el fallecido sale de los denominadores. ¿Los que se mudaron o abandonaron deben salir del denominador de control?');
q('F3', 'I15.0 (hipertensión renovascular) y el límite de periodo', { esHta_I150: ind.esHta('I15.0'), esHta_I151: ind.esHta('I15.1') }, 'El módulo deja fuera I15.0 «según el Anexo 04 del convenio»; el padrón admite I10–I15. [PENDIENTE: contrastar la lista de CIE-10 con el Anexo 04 del convenio; el corpus no está conectado a esta sesión]');

sec('G. Recordatorio por WhatsApp (whatsappNotifier.js)');
const tel = { telefono: '987654321', consentimiento: 'Sí, firmado', puerta_entrada: 'Hospital', fecha_limite: ymd(5) };
chk('G1', 'paciente fallecido (fallecido:true) con consentimiento previo: no debe generar enlace', null, wa.generateLink({ ...tel, fallecido: true }) ? 'ENLACE GENERADO' : null, 'ética y guía §3: negro = excluir de la programación');
chk('G2', 'paciente con estado_paciente="Fallecido": no debe generar enlace', null, wa.generateLink({ ...tel, estado_paciente: 'Fallecido' }) ? 'ENLACE GENERADO' : null, 'ídem');

sec('H. Parser de CSV de HOSIX (hosixParser.js, usado en main.js:2250)');
const hp = hosix.processRecords([{ PACIENTE: 'prueba uno', FEC_ULTIMA_ATENCION: ymd(-3) }])[0];
chk('H1', 'fila sin diagnóstico: no debe inventar «I10 / Hipertensión Arterial»', [], hp.conditions, 'documento y diagnóstico no inventados (decisión «documento obligatorio»)');
chk('H2', 'fila sin documento: no debe inventar un «DNI-n»', null, /^DNI-\d+$/.test(hp.dni) ? hp.dni : null, 'ídem');
chk('H3', 'código N18.3 (ERC) no debe rotularse «Diabetes Mellitus Tipo 2»', false, /Diabetes/.test(hosix.processRecords([{ DNI: '96000001', PACIENTE: 'x', CIE10_COD: 'N18.3', FEC_ULTIMA_ATENCION: ymd(-3) }])[0].conditions[0].diagnostico), 'el rótulo debe corresponder al código (hosixParser.js:114: todo código que no empiece con I se rotula DM2)');
const h4 = hosix.processRecords([{ DNI: '96000002', PACIENTE: 'x', CIE10_COD: 'E11', HBA1C: '11', FEC_ULTIMA_ATENCION: ymd(-3) }])[0];
chk('H4', 'DM2 con HbA1c 11 % y sin PA: no debe quedar «Controlado»', 'No Controlado', h4.estado_control, 'guía §2: HbA1c ≤ 7 → controlado');

sec('I. Expresión de estado_control del Registro Clínico (registroClinicoModal.js:1117), copiada tal cual');
const estadoRC = (pas, pad) => (pas >= 140 || pad >= 90) ? 'No Controlado' : 'Controlado';
chk('I1', 'solo HbA1c 11 % (sin PA): estado que se guarda', 'No Controlado', estadoRC(null, null), 'guía §2: HbA1c ≤ 7 → controlado');
const i2 = hearts.evaluatePatient({ conditions: [{ cie10_cod: 'E11.9' }], appointments: [], observations: [{ fecha_registro: ymd(-1), hba1c: 11, pa_sistolica: null, pa_diastolica: null, estado_control: estadoRC(null, null) }] });
chk('I2', 'el motor, con esa etiqueta, asigna 90 días al diabético con HbA1c 11 %', 30, i2.frecuencia_hearts, 'guía §2: no controlado = 30 días');
q('I3', 'misma expresión: PA 135/85 en un diabético', { se_guarda_como: estadoRC(135, 85), la_ficha_dice_pa_en_meta: calc.calcularPadron({ cie10_dm: 'E11', pas_oct: '135', pad_oct: '85' }).pa_en_meta }, 'La atención usa 140/90 para todos; la ficha del mismo formulario usa 130/80 si hay DM/ERC/ECV. Es la misma pregunta D1: ¿qué meta rige?');

console.log(`\nResumen: ${ok} OK · ${disc} DISCREPA · ${preg} PREGUNTA (zona horaria ${process.env.TZ || 'del sistema'})`);
