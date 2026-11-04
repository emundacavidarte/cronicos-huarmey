/**
 * latestRecord.js
 * Devuelve el registro con la fecha más reciente de una lista (citas u observaciones).
 * Las citas/observaciones nuevas se agregan al FINAL de la lista, por lo que [0] NO es la más reciente.
 * Reglas: fecha válida más alta gana; ante empate (o fechas inválidas) gana el último agregado.
 */

function toTime(value) {
  if (value === null || value === undefined || value === '') return NaN;
  return new Date(value).getTime();
}

function getLatestByDate(list, dateField) {
  if (!Array.isArray(list) || list.length === 0) return undefined;

  let best = list[0];
  let bestTime = toTime(best && best[dateField]);

  for (let i = 1; i < list.length; i++) {
    const item = list[i];
    const time = toTime(item && item[dateField]);
    const bestValid = !isNaN(bestTime);
    const timeValid = !isNaN(time);

    // Una fecha válida siempre le gana a una inválida; con empate gana el posterior en la lista
    if ((timeValid && !bestValid) || (timeValid && bestValid && time >= bestTime) || (!timeValid && !bestValid)) {
      best = item;
      bestTime = time;
    }
  }
  return best;
}

const getLatestAppointment = list => getLatestByDate(list, 'fecha_cita');
const getLatestObservation = list => getLatestByDate(list, 'fecha_registro');

module.exports = { getLatestByDate, getLatestAppointment, getLatestObservation };
