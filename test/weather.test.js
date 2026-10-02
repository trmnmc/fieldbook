import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildForecastUrl, parseOpenMeteo, parseNws, pressureTrend, hoursSinceFront, conditionsAt, hpaToInHg, degToCompass, fetchForecast } from '../js/weather.js';

const times = [];
for (let h = 0; h < 48; h++) times.push(`2026-10-0${1 + Math.floor(h / 24)}T${String(h % 24).padStart(2, '0')}:00`);
const fixture = {
  timezone: 'America/Chicago',
  hourly: {
    time: times,
    temperature_2m: times.map((_, i) => 60 + (i % 10)),
    pressure_msl: times.map((_, i) => i < 24 ? 1012 - i * 0.5 : 1000 + (i - 24) * 0.6), // falls 12 hPa over day 1, rises on day 2
    surface_pressure: times.map(() => 990),
    wind_speed_10m: times.map((_, i) => 5 + (i % 7)),
    wind_direction_10m: times.map((_, i) => (i * 15) % 360),
    wind_gusts_10m: times.map((_, i) => 8 + (i % 7)),
    cloud_cover: times.map((_, i) => (i * 10) % 101),
    precipitation: times.map(() => 0),
    weather_code: times.map(() => 1),
  },
};

test('buildForecastUrl asks for the fields the planner needs, in US units', () => {
  const u = buildForecastUrl({ lat: 46.22, lon: -89.41 });
  for (const k of ['latitude=46.22', 'longitude=-89.41', 'pressure_msl', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'cloud_cover', 'precipitation', 'weather_code', 'temperature_2m', 'past_days=2', 'forecast_days=3', 'timezone=America%2FChicago', 'wind_speed_unit=mph', 'temperature_unit=fahrenheit', 'precipitation_unit=inch']) {
    assert.ok(u.includes(k), 'missing ' + k);
  }
});

test('parseOpenMeteo normalizes hourly rows', () => {
  const f = parseOpenMeteo(fixture);
  assert.equal(f.source, 'open-meteo');
  assert.equal(f.hourly.length, 48);
  assert.equal(f.hourly[0].time, '2026-10-01T00:00');
  assert.equal(f.hourly[0].pressureHpa, 1012);
  assert.equal(f.hourly[3].windMph, 8);
  assert.ok(typeof f.fetchedAt === 'string');
});

test('pressureTrend labels falling, rising, steady, and unknown', () => {
  const f = parseOpenMeteo(fixture);
  assert.equal(pressureTrend(f.hourly, '2026-10-01T12:00').label, 'falling');
  assert.equal(pressureTrend(f.hourly, '2026-10-02T12:00').label, 'rising');
  const flat = f.hourly.map(h => ({ ...h, pressureHpa: 1010 }));
  assert.equal(pressureTrend(flat, '2026-10-01T12:00').label, 'steady');
  assert.equal(pressureTrend(f.hourly, '2026-10-01T01:00').label, 'unknown'); // not enough history
});

test('pressureTrend and hoursSinceFront skip null holes and never return NaN', () => {
  const f = parseOpenMeteo(fixture);
  const holey = f.hourly.map((h, i) => (i % 4 === 0 ? { ...h, pressureHpa: null } : h));
  const t = pressureTrend(holey, '2026-10-01T12:00');
  assert.ok(!Number.isNaN(t.deltaHpa));
  assert.equal(t.label, 'falling');
  const hs = hoursSinceFront(holey, '2026-10-02T12:00');
  assert.ok(hs === null || (typeof hs === 'number' && !Number.isNaN(hs)));
});

test('hoursSinceFront finds the pressure minimum after a 12 hPa fall', () => {
  const f = parseOpenMeteo(fixture);
  const hs = hoursSinceFront(f.hourly, '2026-10-02T12:00');
  // minimum is at 2026-10-02T00:00 (1000 hPa), 12 hours before
  assert.equal(hs, 12);
  assert.equal(hoursSinceFront(f.hourly, '2026-10-01T06:00'), null);
});

test('conditionsAt converts units and classifies sky', () => {
  const f = parseOpenMeteo(fixture);
  const c = conditionsAt(f, '2026-10-01T12:00');
  assert.equal(c.tempF, 62);
  assert.equal(c.windCompass, degToCompass(180));
  assert.ok(Math.abs(c.pressureInHg - hpaToInHg(1006)) < 0.001);
  assert.ok(['sun', 'partly', 'overcast'].includes(c.sky));
  assert.ok(typeof c.forecastAgeMin === 'number');
});

test('hpaToInHg and degToCompass', () => {
  assert.ok(Math.abs(hpaToInHg(1013.25) - 29.92) < 0.01);
  assert.equal(degToCompass(0), 'N');
  assert.equal(degToCompass(292), 'WNW');
  assert.equal(degToCompass(359), 'N');
});

test('parseNws reads temperature, wind, and sky, with pressure null', () => {
  const nws = { properties: { periods: [
    { startTime: '2026-10-01T12:00:00-05:00', temperature: 61, temperatureUnit: 'F', windSpeed: '10 mph', windDirection: 'NW', shortForecast: 'Mostly Cloudy', probabilityOfPrecipitation: { value: 20 } },
    { startTime: '2026-10-01T13:00:00-05:00', temperature: 62, temperatureUnit: 'F', windSpeed: '5 to 10 mph', windDirection: 'W', shortForecast: 'Sunny', probabilityOfPrecipitation: { value: null } },
  ] } };
  const f = parseNws(nws);
  assert.equal(f.source, 'nws');
  assert.equal(f.hourly[0].time, '2026-10-01T12:00');
  assert.equal(f.hourly[0].pressureHpa, null);
  assert.equal(f.hourly[1].windMph, 10);
  assert.equal(f.hourly[0].windDir, 315);
  assert.equal(conditionsAt(f, '2026-10-01T13:00').sky, 'sun');
  assert.equal(conditionsAt(f, '2026-10-01T13:00').trend, 'unknown');
});

test('fetchForecast falls back to NWS when Open-Meteo fails', async () => {
  const calls = [];
  const fetchFn = async url => {
    calls.push(url);
    if (url.includes('open-meteo')) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, json: async () => ({ properties: { periods: [] } }) };
  };
  const f = await fetchForecast(fetchFn, { lat: 46.22, lon: -89.41 });
  assert.equal(f.source, 'nws');
  assert.equal(calls.length, 2);
  await assert.rejects(fetchForecast(async () => ({ ok: false, status: 500 }), { lat: 1, lon: 1 }));
});
