export const NWS_HOURLY_URL = 'https://api.weather.gov/gridpoints/MQT/86,54/forecast/hourly';
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function hpaToInHg(hpa) { return hpa == null ? null : Math.round(hpa * 0.02953 * 100) / 100; }
export function degToCompass(deg) { if (deg == null) return ''; return COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]; }
const compassToDeg = s => { const i = COMPASS.indexOf(s); return i < 0 ? null : i * 22.5; };

export function buildForecastUrl({ lat, lon, pastDays = 2, forecastDays = 3 }) {
  const q = new URLSearchParams({
    latitude: lat, longitude: lon,
    hourly: 'temperature_2m,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,precipitation,weather_code',
    past_days: pastDays, forecast_days: forecastDays, timezone: 'America/Chicago',
    wind_speed_unit: 'mph', temperature_unit: 'fahrenheit', precipitation_unit: 'inch',
  });
  return 'https://api.open-meteo.com/v1/forecast?' + q.toString();
}

const num = v => (v === null || v === undefined || Number.isNaN(+v)) ? null : +v;

export function parseOpenMeteo(json) {
  const h = json.hourly || {};
  const hourly = (h.time || []).map((time, i) => ({
    time,
    tempF: num(h.temperature_2m?.[i]),
    pressureHpa: num(h.pressure_msl?.[i]),
    windMph: num(h.wind_speed_10m?.[i]),
    windDir: num(h.wind_direction_10m?.[i]),
    gustMph: num(h.wind_gusts_10m?.[i]),
    cloudPct: num(h.cloud_cover?.[i]),
    precipIn: num(h.precipitation?.[i]),
    code: num(h.weather_code?.[i]),
  }));
  return { source: 'open-meteo', fetchedAt: new Date().toISOString(), hourly };
}

export function parseNws(json) {
  const periods = json?.properties?.periods || [];
  const hourly = periods.map(p => {
    const mph = (p.windSpeed || '').match(/(\d+)\s*mph\s*$/);
    const sf = (p.shortForecast || '').toLowerCase();
    const cloudPct = /sunny|clear/.test(sf) && !/mostly cloudy|partly/.test(sf) ? 10 : /partly|mostly sunny/.test(sf) ? 45 : /cloudy|overcast|rain|snow|fog/.test(sf) ? 90 : null;
    return {
      time: p.startTime.slice(0, 16),
      tempF: num(p.temperature), pressureHpa: null,
      windMph: mph ? +mph[1] : null, windDir: compassToDeg(p.windDirection), gustMph: null,
      cloudPct, precipIn: null, code: null,
    };
  });
  return { source: 'nws', fetchedAt: new Date().toISOString(), hourly };
}

function idx(hourly, timeIso) {
  const key = timeIso.slice(0, 13);
  let best = -1;
  for (let i = 0; i < hourly.length; i++) if (hourly[i].time.slice(0, 13) <= key) best = i;
  return best;
}

export function pressureTrend(hourly, timeIso, hours = 3) {
  const i = idx(hourly, timeIso);
  if (i < 0) return { deltaHpa: null, label: 'unknown' };
  const now = hourly[i].pressureHpa ?? hourly[i - 1]?.pressureHpa ?? null;
  const j = i - hours;
  if (j < 0) return { deltaHpa: null, label: 'unknown' };
  const then = hourly[j].pressureHpa ?? hourly[j - 1]?.pressureHpa ?? hourly[j + 1]?.pressureHpa ?? null;
  if (now == null || then == null) return { deltaHpa: null, label: 'unknown' };
  const delta = Math.round((now - then) * 10) / 10;
  return { deltaHpa: delta, label: delta <= -1 ? 'falling' : delta >= 1 ? 'rising' : 'steady' };
}

export function hoursSinceFront(hourly, timeIso) {
  const i = idx(hourly, timeIso);
  if (i < 12) return null;
  const p = k => hourly[k]?.pressureHpa ?? null;
  for (let m = i; m >= 6; m--) {
    const pm = p(m);
    if (pm == null) continue;
    if (pm > (p(m - 1) ?? pm) || pm > (p(m + 1) ?? pm)) continue; // only a local minimum is a front
    let fell = false, rose = false;
    for (let k = m - 1; k >= Math.max(0, m - 12); k--) { const v = p(k); if (v != null && v - pm >= 4) { fell = true; break; } }
    for (let k = m + 1; k <= Math.min(i, m + 6); k++) { const v = p(k); if (v != null && v - pm >= 2) { rose = true; break; } }
    if (fell && rose) return i - m;
  }
  return null;
}

export function conditionsAt(forecast, timeIso) {
  const hourly = forecast.hourly;
  const i = idx(hourly, timeIso);
  // null when the time is before the first row or more than an hour past the last: there is no forecast for it
  if (i < 0 || (i === hourly.length - 1 && timeIso.slice(0, 13) > hourly[i].time.slice(0, 13))) return null;
  const h = hourly[i];
  const trend = pressureTrend(hourly, timeIso);
  const cloud = h.cloudPct;
  return {
    tempF: h.tempF ?? null,
    pressureHpa: h.pressureHpa ?? null, pressureInHg: hpaToInHg(h.pressureHpa ?? null), trend: trend.label, pressureDeltaHpa: trend.deltaHpa,
    windMph: h.windMph ?? null, windDir: h.windDir ?? null, windCompass: degToCompass(h.windDir), gustMph: h.gustMph ?? null,
    cloudPct: cloud ?? null, sky: cloud == null ? 'partly' : cloud < 30 ? 'sun' : cloud < 70 ? 'partly' : 'overcast',
    precipIn: h.precipIn ?? null,
    hoursSinceFront: hoursSinceFront(hourly, timeIso),
    forecastAgeMin: Math.max(0, Math.round((Date.now() - new Date(forecast.fetchedAt).getTime()) / 60000)),
  };
}

export async function fetchForecast(fetchFn, { lat, lon }) {
  try {
    const r = await fetchFn(buildForecastUrl({ lat, lon }));
    if (r.ok) return parseOpenMeteo(await r.json());
  } catch (e) { /* fall through to NWS */ }
  const r2 = await fetchFn(NWS_HOURLY_URL, { headers: { 'User-Agent': 'fieldbook (trmnmc@gmail.com)', Accept: 'application/geo+json' } });
  if (!r2.ok) throw new Error('weather unavailable');
  return parseNws(await r2.json());
}
