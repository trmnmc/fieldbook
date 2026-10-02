import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadContent } from '../js/content.js';
import { windows, sunTimes, CHAIN } from '../js/astro.js';
import { validateInputs, matchPatterns, dayWindows, scoreWindows, scoreSpots, scoreLures, plan } from '../js/engine.js';

const fetchFn = async url => ({ ok: true, json: async () => JSON.parse(await readFile(new URL('../' + url, import.meta.url), 'utf8')) });
const content = await loadContent(fetchFn);
const oct2 = new Date('2026-10-02T12:00:00-05:00');
const aw = windows(oct2, CHAIN.lat, CHAIN.lon, CHAIN.tz), sun = sunTimes(oct2, CHAIN.lat, CHAIN.lon, CHAIN.tz);

const spots = [
  { id: 'a', lakeId: 'thousand-island', name: 'North flat', lat: 46.24, lon: -89.39, type: 'weed_flat', bestWind: ['W', 'SW', 'NW'], tempBandsF: [[58, 72]], months: [9, 10], addedBy: 'seed', verified: false, source: 'x' },
  { id: 'b', lakeId: 'thousand-island', name: 'East break', lat: 46.23, lon: -89.38, type: 'break', bestWind: ['E'], tempBandsF: [[36, 55]], months: [10, 11], addedBy: 'seed', verified: false, source: 'x' },
  { id: 'c', lakeId: 'cisco', name: 'Dam end', lat: 46.24, lon: -89.45, type: 'outlet', bestWind: [], tempBandsF: [[40, 70]], months: [], addedBy: 'seed', verified: false, source: 'x' },
];
const warm = { lakeId: 'thousand-island', lakeCharacter: 'deep_basin', dateIso: '2026-10-02', month: 10, waterTempF: 62, sky: 'partly', windMph: 12, windCompass: 'W', pressureTrend: 'falling', hoursSinceFront: null, clarity: 'clear', presentation: 'any', moonPhaseName: 'Waning Gibbous' };
const cold = { ...warm, dateIso: '2026-11-07', month: 11, waterTempF: 45, sky: 'sun', windMph: 3, windCompass: 'N', pressureTrend: 'rising', hoursSinceFront: 12 };

test('validateInputs refuses water temperature outside 32 to 90', () => {
  assert.deepEqual(validateInputs(warm), []);
  assert.ok(validateInputs({ ...warm, waterTempF: 12 }).some(e => /32/.test(e) && /90/.test(e)));
  assert.ok(validateInputs({ ...warm, waterTempF: 212 }).length > 0);
  assert.ok(validateInputs({ ...warm, lakeId: null }).length > 0);
});

test('matchPatterns: warm early fall matches the flats rule, not the sucker rule', () => {
  const ids = matchPatterns(content.patterns, warm).map(p => p.id);
  assert.ok(ids.includes('fall-warm-flats') && ids.includes('pre-front') && ids.includes('wind-loaded'));
  assert.ok(!ids.includes('fall-cold-suckers') && !ids.includes('post-front'));
});

test('matchPatterns: a pattern with a condition the inputs lack does not match', () => {
  const ids = matchPatterns(content.patterns, { ...warm, hoursSinceFront: null, sky: 'sun', pressureTrend: 'rising' }).map(p => p.id);
  assert.ok(!ids.includes('post-front'));
  const ids2 = matchPatterns(content.patterns, cold).map(p => p.id);
  assert.ok(ids2.includes('post-front') && ids2.includes('fall-cold-suckers'));
});

test('dayWindows adds midday and night and flags the dusk/underfoot stack on Oct 2', () => {
  const w = dayWindows(aw, sun);
  assert.ok(w.some(x => x.kind === 'midday') && w.some(x => x.kind === 'night'));
  const dusk = w.find(x => x.kind === 'dusk');
  assert.ok(dusk.stacks.some(s => /underfoot/i.test(s)), JSON.stringify(dusk.stacks));
});

test('scoreWindows puts dusk first in warm early fall with reasons', () => {
  const m = matchPatterns(content.patterns, warm);
  const s = scoreWindows(dayWindows(aw, sun), m);
  assert.equal(s[0].window.kind, 'dusk');
  assert.ok(s[0].reasons.length > 0 && s[0].reasons[0].pro.length > 20 && s[0].reasons[0].yourJob.length > 5);
});

test('scoreSpots filters to the lake, rewards wind and temperature fit, and uses the log bonus', () => {
  const m = matchPatterns(content.patterns, warm);
  const s = scoreSpots(spots, m, warm);
  assert.deepEqual(s.map(x => x.spot.id), ['a', 'b']);
  assert.ok(s[0].reasons.some(r => /wind/i.test(r.pro)));
  const boosted = scoreSpots(spots, m, warm, { b: { followsPerHour: 3, follows: 6, hours: 2 } });
  const bBefore = s.find(x => x.spot.id === 'b').score, bAfter = boosted.find(x => x.spot.id === 'b').score;
  assert.ok(bAfter > bBefore, `log bonus ${bBefore} -> ${bAfter}`);
  assert.ok(boosted.find(x => x.spot.id === 'b').reasons.some(r => /your log/i.test(r.pro)));
});

test('scoreLures: warm favors topwater and bucktail; cold favors sucker and rubber; presentation filters', () => {
  const warmTop = scoreLures(content.lures, matchPatterns(content.patterns, warm), warm).slice(0, 3).map(x => x.lure.family);
  assert.ok(warmTop.includes('topwater') || warmTop.includes('bucktail'));
  assert.ok(!warmTop.includes('sucker'));
  const coldTop = scoreLures(content.lures, matchPatterns(content.patterns, cold), cold).slice(0, 3).map(x => x.lure.family);
  assert.ok(coldTop.includes('sucker') || coldTop.includes('rubber'));
  const troll = scoreLures(content.lures, matchPatterns(content.patterns, cold), { ...cold, presentation: 'trolling' });
  assert.ok(troll.every(x => x.lure.trollOk));
  const cast = scoreLures(content.lures, matchPatterns(content.patterns, cold), { ...cold, presentation: 'casting' });
  assert.ok(cast.every(x => x.lure.family !== 'sucker'));
});

test('plan returns the three lists, a watchFor line, and is deterministic', () => {
  const a = plan({ content, spots, cond: warm, astroWindows: aw, sun });
  const b = plan({ content, spots, cond: warm, astroWindows: aw, sun });
  assert.deepEqual(a.windows.map(x => x.window.kind), b.windows.map(x => x.window.kind));
  assert.ok(a.windows.length >= 4 && a.spots.length === 2 && a.lures.length >= 3);
  assert.ok(typeof a.watchFor === 'string' && a.watchFor.length > 10);
  assert.deepEqual(a.errors, []);
  const bad = plan({ content, spots, cond: { ...warm, waterTempF: 5 }, astroWindows: aw, sun });
  assert.ok(bad.errors.length > 0 && bad.spots.length === 0);
});
