import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../js/store.js';
import { EVENT_KINDS, snapshot, startTrip, addEvent, setOutcome, endTrip, effortBySpot, rates, verifySpots, tripTimeline, logStatsForPlanner } from '../js/log.js';

const cond = { lakeId: 'thousand-island', waterTempF: 62, sky: 'partly', windMph: 12, windCompass: 'W', pressureTrend: 'falling', pressureInHg: 29.85, clarity: 'clear', forecastAgeMin: 30 };
const astro = { nearest: () => ({ kind: 'underfoot', minutes: 10 }), phase: () => ({ name: 'Waning Gibbous', fraction: 0.6 }) };
const T = h => new Date(Date.UTC(2026, 9, 2, 22 + h, 0)).toISOString(); // 5pm CDT + h hours

async function seed() {
  const db = createMemoryStore();
  await db.put('spots', { id: 'a', lakeId: 'thousand-island', name: 'North flat', lat: 46.24, lon: -89.39, type: 'weed_flat', addedBy: 'seed', verified: false, source: 'x' });
  const trip = await startTrip(db, { lakeId: 'thousand-island', plan: { windows: [] }, cond, presentation: 'casting' });
  trip.startedAt = T(0); await db.put('trips', trip);
  const snap = at => snapshot({ at, lat: 46.24, lon: -89.39, cond, astro });
  await addEvent(db, trip.id, { kind: 'here', spotId: 'a', at: T(0) }, snap(T(0)));
  await addEvent(db, trip.id, { kind: 'follow', spotId: 'a', at: T(0.5), lureId: 'topwater-walker', color: 'black', sizeEstimateIn: 42, heat: 'hot', seen: 'boat side', speed: 'medium', position: 'edge', depthUnderBoatFt: 6 }, snap(T(0.5)));
  await addEvent(db, trip.id, { kind: 'note', at: T(0.75), text: 'Switched to glider', adjustment: { what: 'lure', why: 'Hot follow turned away on the 8; wanted a pause', outcome: null } }, snap(T(0.75)));
  await addEvent(db, trip.id, { kind: 'follow', spotId: 'a', at: T(1), lureId: 'glider-10', color: 'perch', sizeEstimateIn: 40, heat: 'lazy', seen: 'mid-retrieve', speed: 'slow', position: 'edge', depthUnderBoatFt: 7 }, snap(T(1)));
  await addEvent(db, trip.id, { kind: 'catch', spotId: 'a', at: T(1.5), lureId: 'glider-10', color: 'perch', lengthIn: 44, girthIn: 20, hitWhere: 'on the 8', fishDepthFt: 4, depthUnderBoatFt: 7, hookLocation: 'corner of jaw', releaseSeconds: 70, marks: 'scar left flank' }, snap(T(1.5)));
  return { db, trip };
}

test('snapshot carries the twelve facts', () => {
  const s = snapshot({ at: T(0), lat: 1, lon: 2, cond, astro });
  for (const k of ['at', 'lat', 'lon', 'moonPhase', 'moonFraction', 'moonEvent', 'pressureInHg', 'pressureTrend', 'windMph', 'windCompass', 'sky', 'waterTempF', 'clarity', 'forecastAgeMin']) assert.ok(k in s, k);
  assert.equal(s.moonEvent.kind, 'underfoot');
});

test('addEvent rejects unknown kinds and bad lengths', async () => {
  const { db, trip } = await seed();
  await assert.rejects(addEvent(db, trip.id, { kind: 'bogus', at: T(2) }, {}));
  await assert.rejects(addEvent(db, trip.id, { kind: 'catch', at: T(2), lengthIn: 0 }, {}));
  await assert.rejects(addEvent(db, trip.id, { kind: 'catch', at: T(2), lengthIn: 75 }, {}));
  assert.deepEqual(EVENT_KINDS, ['here', 'follow', 'strike', 'catch', 'note', 'bait']);
});

test('effort and rates: 2 follows and 1 catch in 2 hours on spot a', async () => {
  const { db, trip } = await seed();
  const ended = await endTrip(db, trip.id, { rating: 4, worked: 'glider after a hot follow', notes: '' });
  ended.endedAt = T(2); await db.put('trips', ended);
  const events = (await db.all('events')).filter(e => e.tripId === trip.id);
  const eff = effortBySpot(events, ended);
  assert.ok(Math.abs(eff.a - 2) < 0.01);
  const r = rates(events, ended);
  assert.equal(r.bySpot.a.follows, 2); assert.equal(r.bySpot.a.catches, 1); assert.ok(Math.abs(r.bySpot.a.followsPerHour - 1) < 0.01);
  assert.equal(r.byLure['glider-10'].follows, 1); assert.equal(r.byLure['glider-10'].catches, 1);
  assert.ok(Math.abs(r.total.hours - 2) < 0.01);
});

test('a trip with no Here still computes per-hour rates from trip duration', async () => {
  const db = createMemoryStore();
  const trip = await startTrip(db, { lakeId: 'cisco', plan: {}, cond, presentation: 'any' });
  trip.startedAt = T(0); trip.endedAt = T(4); await db.put('trips', trip);
  await addEvent(db, trip.id, { kind: 'follow', at: T(1), lureId: 'x', heat: 'lazy' }, {});
  await addEvent(db, trip.id, { kind: 'follow', at: T(3), lureId: 'x', heat: 'lazy' }, {});
  const events = await db.all('events');
  const r = rates(events, trip);
  assert.equal(r.total.hours, 4);
  assert.equal(r.total.followsPerHour, 0.5);
  assert.equal(r.bySpot.none.follows, 2);
  assert.ok(Number.isFinite(r.bySpot.none.followsPerHour));
});

test('adjustment notes keep why and outcome and sit in the timeline', async () => {
  const { db, trip } = await seed();
  const events = await db.all('events');
  const note = events.find(e => e.kind === 'note');
  assert.equal(note.adjustment.what, 'lure');
  await setOutcome(db, note.id, 'Lazy follow then a 44 on the glider');
  assert.equal((await db.get('events', note.id)).adjustment.outcome, 'Lazy follow then a 44 on the glider');
  const tl = tripTimeline(await db.all('events'));
  assert.deepEqual(tl.map(e => e.kind), ['here', 'follow', 'note', 'follow', 'catch']);
});

test('verifySpots flips seeded spots that were fished, and planner stats aggregate across trips', async () => {
  const { db, trip } = await seed();
  const flipped = await verifySpots(db, await db.all('events'));
  assert.deepEqual(flipped, ['a']);
  assert.equal((await db.get('spots', 'a')).verified, true);
  trip.endedAt = T(2); await db.put('trips', trip);
  const stats = logStatsForPlanner(await db.all('events'), await db.all('trips'));
  assert.equal(stats.a.follows, 2); assert.ok(Math.abs(stats.a.followsPerHour - 1) < 0.01);
});
