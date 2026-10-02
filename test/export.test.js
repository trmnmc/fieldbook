import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../js/store.js';
import { LUNGE_LOG_COLUMNS, csvEscape, catchesToCsv, eventsToCsv, toBackupJson, importJson } from '../js/export.js';
import { startTrip, addEvent, endTrip, setOutcome, verifySpots } from '../js/log.js';

const lakes = [{ id: 'thousand-island', name: 'Thousand Island Lake', states: ['MI'] }];
const lures = [{ id: 'glider-10', family: 'glider', example: '10 inch glider', sizeIn: 10 }];
const trip = { id: 't1', lakeId: 'thousand-island', startedAt: '2026-10-02T22:00:00.000Z', endedAt: '2026-10-03T00:00:00.000Z' };
const snap = { at: '2026-10-02T23:30:00.000Z', sky: 'partly', clarity: 'clear', waterTempF: 62, pressureInHg: 29.85, pressureTrend: 'falling', moonPhase: 'Waning Gibbous' };
const catchEv = { id: 'e1', tripId: 't1', kind: 'catch', at: '2026-10-02T23:30:00.000Z', spotId: 'a', lureId: 'glider-10', color: 'perch, "natural"', lengthIn: 44, girthIn: 20, estWeightLb: 22, fishDepthFt: 4, depthUnderBoatFt: 7, weedType: 'cabbage', bottom: 'sand', released: true, notes: 'on the 8', snapshot: snap };
const followEv = { id: 'e2', tripId: 't1', kind: 'follow', at: '2026-10-02T22:30:00.000Z', spotId: 'a', lureId: 'glider-10', heat: 'hot', snapshot: snap };

test('csvEscape quotes commas, quotes, and newlines', () => {
  assert.equal(csvEscape('plain'), 'plain');
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape(null), '');
});

test('catchesToCsv emits Lunge Log columns in order with local date and time', () => {
  const csv = catchesToCsv({ events: [catchEv, followEv], trips: [trip], lakes, lures });
  const [head, row, ...rest] = csv.trim().split('\n');
  assert.equal(head, LUNGE_LOG_COLUMNS.join(','));
  assert.equal(rest.length, 0);
  const cells = row.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map(c => c.replace(/,$/, ''));
  assert.equal(cells[0], '2026-10-02'); assert.equal(cells[1], '6:30 pm');
  assert.equal(cells[2], 'Thousand Island Lake'); assert.equal(cells[3], 'MI');
  assert.equal(cells[4], '44'); assert.equal(cells[5], '20'); assert.equal(cells[6], '22');
  assert.equal(cells[7], 'glider'); assert.equal(cells[8], '"perch, ""natural"""');
  assert.equal(cells[14], '4'); assert.equal(cells[17], '29.85'); assert.equal(cells[19], 'Waning Gibbous'); assert.equal(cells[20], 'yes');
});

test('eventsToCsv includes every event and snapshot columns', () => {
  const csv = eventsToCsv({ events: [catchEv, followEv], trips: [trip] });
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].includes('snap_waterTempF') && lines[0].includes('kind') && lines[0].includes('heat'));
});

test('backup round-trips through importJson and merges by id', async () => {
  const db = createMemoryStore();
  await db.put('trips', trip); await db.put('events', catchEv); await db.put('spots', { id: 'a', name: 'North flat', addedBy: 'truman', verified: true, lakeId: 'thousand-island', lat: 1, lon: 1, type: 'weed_flat' });
  await db.put('settings', { id: 'units', value: 'us' });
  const b = await toBackupJson(db);
  assert.equal(b.kind, 'backup'); assert.equal(b.events.length, 1); assert.ok(!('photos' in b));
  const db2 = createMemoryStore();
  const r = await importJson(db2, b);
  assert.equal(r.added, 4);
  assert.equal((await db2.get('events', 'e1')).lengthIn, 44);
  const r2 = await importJson(db2, b);
  assert.equal(r2.added, 0); assert.equal(r2.updated, 4);
});

test('spots pack never overwrites a user-edited or verified spot', async () => {
  const db = createMemoryStore();
  await db.put('spots', { id: 'a', name: 'North flat (Dad)', addedBy: 'dad', verified: true, lakeId: 'thousand-island', lat: 1, lon: 1, type: 'weed_flat' });
  await db.put('spots', { id: 'b', name: 'Old seed', addedBy: 'seed', verified: false, lakeId: 'thousand-island', lat: 1, lon: 1, type: 'point', notes: 'v1' });
  const pack = { kind: 'spots-pack', spots: [
    { id: 'a', name: 'North flat', addedBy: 'seed', verified: false, lakeId: 'thousand-island', lat: 1, lon: 1, type: 'weed_flat', source: 'map' },
    { id: 'b', name: 'Old seed', addedBy: 'seed', verified: false, lakeId: 'thousand-island', lat: 1, lon: 1, type: 'point', notes: 'v2', source: 'map' },
    { id: 'c', name: 'New', addedBy: 'seed', verified: false, lakeId: 'cisco', lat: 1, lon: 1, type: 'neck', source: 'map' },
  ] };
  const r = await importJson(db, pack);
  assert.deepEqual(r, { added: 1, updated: 1, skipped: 1 });
  assert.equal((await db.get('spots', 'a')).name, 'North flat (Dad)');
  assert.equal((await db.get('spots', 'b')).notes, 'v2');
  await assert.rejects(importJson(db, { kind: 'nope' }));
});

test('an older backup never reverts a trip ended, an outcome added, or a spot verified since it was taken', async () => {
  const db = createMemoryStore();
  const t = await startTrip(db, { lakeId: 'thousand-island', plan: {}, cond: {}, presentation: 'any' });
  await db.put('spots', { id: 'a', name: 'North flat', addedBy: 'seed', verified: false, lakeId: 'thousand-island', lat: 1, lon: 1, type: 'weed_flat' });
  const follow = await addEvent(db, t.id, { kind: 'follow', spotId: 'a', heat: 'lazy' }, {});
  const note = await addEvent(db, t.id, { kind: 'note', text: 'x', adjustment: { what: 'lure', why: 'y', outcome: null } }, {});
  const old = await toBackupJson(db); // taken before the trip ended
  await new Promise(r => setTimeout(r, 5));
  await endTrip(db, t.id, { rating: 4 });
  await setOutcome(db, note.id, 'it worked');
  await verifySpots(db, await db.all('events'));
  const r = await importJson(db, old);
  assert.equal(r.added, 0); assert.equal(r.updated, 0);
  assert.ok((await db.get('trips', t.id)).endedAt, 'the trip was reopened');
  assert.equal((await db.get('events', note.id)).adjustment.outcome, 'it worked');
  assert.equal((await db.get('spots', 'a')).verified, true);
  assert.equal((await db.get('events', follow.id)).heat, 'lazy');
});
