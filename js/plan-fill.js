// Pure logic behind the Plan form: which forecast hour to read, and which value each box shows.
import { CHAIN, fmtDate, localKey } from './astro.js';

const C16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const C8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// today reads the current hour; any other date reads noon
export function forecastKey(dateYmd, now = new Date(), tz = CHAIN.tz) {
  if (dateYmd === fmtDate(now, tz)) return localKey(now, tz).slice(0, 13) + ':00';
  return dateYmd + 'T12:00';
}

export function compass8(c16) {
  const i = C16.indexOf(c16);
  return i < 0 ? '' : C8[Math.round(i / 2) % 8];
}

const typed = v => v !== '' && v !== null && v !== undefined;
const pick = (yours, forecast) => typed(yours) ? { value: yours, source: 'yours' } : typed(forecast) ? { value: forecast, source: 'forecast' } : { value: null, source: null };

export function fillConditions(inputs, fc) {
  return {
    windMph: pick(inputs.windMph, fc?.windMph == null ? null : Math.round(fc.windMph)),
    windCompass: pick(inputs.windCompass, compass8(fc?.windCompass) || null),
    sky: pick(inputs.sky, fc?.sky ?? null),
    pressureTrend: pick(inputs.pressureTrend, fc?.trend && fc.trend !== 'unknown' ? fc.trend : null),
  };
}

export function forecastIsStale(forecast, now = new Date(), maxMin = 30) {
  if (!forecast?.fetchedAt) return true;
  return now.getTime() - new Date(forecast.fetchedAt).getTime() > maxMin * 60000;
}
