import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forecastKey, fillConditions, forecastIsStale, compass8 } from '../js/plan-fill.js';

const TZ = 'America/Chicago';

test('forecastKey: today uses the current hour in chain time', () => {
  const now = new Date('2026-10-02T15:40:00-05:00'); // 3:40 pm CDT
  assert.equal(forecastKey('2026-10-02', now, TZ), '2026-10-02T15:00');
});

test('forecastKey: another date uses noon', () => {
  const now = new Date('2026-10-02T15:40:00-05:00');
  assert.equal(forecastKey('2026-10-04', now, TZ), '2026-10-04T12:00');
});

test('forecastKey: late evening UTC is still today in chain time', () => {
  const now = new Date('2026-10-03T02:10:00Z'); // 9:10 pm CDT on Oct 2
  assert.equal(forecastKey('2026-10-02', now, TZ), '2026-10-02T21:00');
});

const fc = { windMph: 12.4, windDir: 203, windCompass: 'SSW', sky: 'overcast', trend: 'falling', pressureInHg: 29.81 };

test('fillConditions: blank inputs take the forecast and say so', () => {
  const f = fillConditions({ windMph: '', windCompass: '', sky: '', pressureTrend: '' }, fc);
  assert.deepEqual(f.windMph, { value: 12, source: 'forecast' });
  assert.deepEqual(f.windCompass, { value: 'SW', source: 'forecast' });
  assert.deepEqual(f.sky, { value: 'overcast', source: 'forecast' });
  assert.deepEqual(f.pressureTrend, { value: 'falling', source: 'forecast' });
});

test('fillConditions: a typed value wins and is marked yours', () => {
  const f = fillConditions({ windMph: 5, windCompass: 'N', sky: '', pressureTrend: 'rising' }, fc);
  assert.deepEqual(f.windMph, { value: 5, source: 'yours' });
  assert.deepEqual(f.windCompass, { value: 'N', source: 'yours' });
  assert.deepEqual(f.sky, { value: 'overcast', source: 'forecast' });
  assert.deepEqual(f.pressureTrend, { value: 'rising', source: 'yours' });
});

test('fillConditions: no forecast leaves blanks as null with no source', () => {
  const f = fillConditions({ windMph: '', windCompass: '', sky: '', pressureTrend: '' }, null);
  for (const k of ['windMph', 'windCompass', 'sky', 'pressureTrend']) assert.deepEqual(f[k], { value: null, source: null }, k);
});

test('fillConditions: an unknown pressure trend is not a forecast value', () => {
  const f = fillConditions({ windMph: '', windCompass: '', sky: '', pressureTrend: '' }, { ...fc, trend: 'unknown' });
  assert.deepEqual(f.pressureTrend, { value: null, source: null });
});

test('compass8 folds a 16-point direction onto the form\'s 8 points', () => {
  assert.equal(compass8('NNE'), 'NE');
  assert.equal(compass8('ENE'), 'E');
  assert.equal(compass8('W'), 'W');
  assert.equal(compass8('NNW'), 'N');
  assert.equal(compass8(''), '');
});

test('forecastIsStale: older than 30 minutes is stale, newer is not', () => {
  const now = new Date('2026-10-02T15:40:00Z');
  assert.equal(forecastIsStale({ fetchedAt: '2026-10-02T15:00:00Z' }, now), true);
  assert.equal(forecastIsStale({ fetchedAt: '2026-10-02T15:20:00Z' }, now), false);
  assert.equal(forecastIsStale(null, now), true);
});
