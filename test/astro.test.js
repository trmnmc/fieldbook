import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAIN, tzOffsetMinutes, localDayBounds, sunTimes, moonPhase, moonEvents, windows, nearestMoonEvent, fmtTime } from '../js/astro.js';
import * as astroMod from '../js/astro.js';

const { lat, lon, tz } = CHAIN;
const minutesOff = (d, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  const hh = +p.find(x => x.type === 'hour').value, mm = +p.find(x => x.type === 'minute').value;
  return Math.abs((hh * 60 + mm) - (h * 60 + m));
};

test('timezone offset is CDT before and CST after 2026-11-01', () => {
  assert.equal(tzOffsetMinutes(new Date('2026-10-31T17:00:00Z')), -300);
  assert.equal(tzOffsetMinutes(new Date('2026-11-01T18:00:00Z')), -360);
});

test('local day bounds on the DST change day span 25 hours', () => {
  const b = localDayBounds(new Date('2026-11-01T18:00:00Z'), tz);
  assert.equal(b.ymd, '2026-11-01');
  assert.equal((b.end - b.start) / 3600000, 25);
});

test('sunrise and sunset on 2026-10-01 match Open-Meteo within 3 minutes', () => {
  const s = sunTimes(new Date('2026-10-01T12:00:00-05:00'), lat, lon, tz);
  assert.ok(minutesOff(s.sunrise, '06:56') <= 3);
  assert.ok(minutesOff(s.sunset, '18:37') <= 3);
  assert.ok(s.dawn < s.sunrise && s.sunset < s.dusk);
});

test('moon phase names the known 2026 full and new moons', () => {
  assert.ok(moonPhase(new Date('2026-10-26T12:00:00Z')).fraction > 0.97);
  assert.equal(moonPhase(new Date('2026-10-26T12:00:00Z')).name, 'Full Moon');
  assert.ok(moonPhase(new Date('2026-10-10T12:00:00Z')).fraction < 0.03);
  assert.equal(moonPhase(new Date('2026-10-10T12:00:00Z')).name, 'New Moon');
  assert.ok(moonPhase(new Date('2026-11-24T12:00:00Z')).fraction > 0.97);
});

test('moon events on 2026-10-02 include underfoot near 6:20 pm', () => {
  const ev = moonEvents(new Date('2026-10-02T12:00:00-05:00'), lat, lon, tz);
  const kinds = ev.map(e => e.kind);
  assert.ok(kinds.includes('underfoot') && kinds.includes('moonrise') && kinds.includes('moonset'));
  const under = ev.find(e => e.kind === 'underfoot');
  assert.ok(minutesOff(under.at, '18:20') <= 5);
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].at >= ev[i - 1].at);
});

test('windows are sorted, each 60 or 120 minutes, and include dawn and dusk', () => {
  const w = windows(new Date('2026-10-02T12:00:00-05:00'), lat, lon, tz);
  assert.ok(w.some(x => x.kind === 'dawn') && w.some(x => x.kind === 'dusk'));
  for (const x of w) {
    const len = (x.end - x.start) / 60000;
    assert.ok(len === 60 || len === 120, `window ${x.kind} is ${len} min`);
    assert.ok(x.label.length > 0);
  }
  for (let i = 1; i < w.length; i++) assert.ok(w[i].start >= w[i - 1].start);
});

test('windows on the DST day are not duplicated', () => {
  const w = windows(new Date('2026-11-01T18:00:00Z'), lat, lon, tz);
  const keys = w.map(x => x.kind + ':' + x.anchor.toISOString());
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(w.filter(x => x.kind === 'dawn').length, 1);
});

test('nearestMoonEvent is signed and finds events across midnight', () => {
  const at = new Date('2026-10-02T18:30:00-05:00'); // 10 min after underfoot
  const n = nearestMoonEvent(at, lat, lon, tz);
  assert.equal(n.kind, 'underfoot');
  assert.ok(n.minutes >= 5 && n.minutes <= 15, `got ${n.minutes}`);
  const late = new Date('2026-10-02T23:50:00-05:00'); // moonrise 10:18 pm this day; next day's events are also candidates
  const n2 = nearestMoonEvent(late, lat, lon, tz);
  assert.ok(Math.abs(n2.minutes) < 120);
});

test('fmtTime renders local time', () => {
  assert.equal(fmtTime(new Date('2026-10-02T23:20:00Z'), tz), '6:20 pm');
});

test('localKey renders an instant as the chain wall-clock key the forecast rows use', () => {
  assert.equal(astroMod.localKey(new Date('2026-10-03T23:30:00Z')), '2026-10-03T18:30'); // CDT
  assert.equal(astroMod.localKey(new Date('2026-12-03T23:30:00Z')), '2026-12-03T17:30'); // CST
  assert.equal(astroMod.localKey(new Date('2026-10-04T03:10:00Z')), '2026-10-03T22:10'); // the UTC date has already rolled over
});

test('fmtDate gives the local calendar date, not the UTC one', () => {
  assert.equal(astroMod.fmtDate(new Date('2026-10-04T01:00:00Z')), '2026-10-03'); // 8 pm CDT on Oct 3
  assert.equal(astroMod.fmtDate(new Date('2026-10-03T12:00:00Z')), '2026-10-03');
});

test('moon events on DST days are neither skipped nor duplicated and stay inside the local day', () => {
  // 2027-11-07 is a 25-hour day; the moon sets at 12:46 am CDT, inside the hour a 24-hour scan from CST midnight misses
  const long = new Date('2027-11-07T18:00:00Z');
  const set = moonEvents(long, lat, lon, tz).find(e => e.kind === 'moonset');
  assert.ok(set, 'moonset skipped');
  assert.equal(set.at.toISOString().slice(0, 16), '2027-11-07T05:46');
  for (const d of [long, new Date('2026-11-01T18:00:00Z'), new Date('2027-03-14T18:00:00Z')]) {
    const { start, end } = localDayBounds(d, tz);
    const list = moonEvents(d, lat, lon, tz);
    for (const e of list) assert.ok(e.at >= start && e.at < end, `${e.kind} outside ${d.toISOString().slice(0, 10)}`);
    const keys = list.map(e => e.kind + ':' + Math.round(e.at.getTime() / 60000));
    assert.equal(new Set(keys).size, keys.length, 'duplicated on ' + d.toISOString().slice(0, 10));
  }
});
