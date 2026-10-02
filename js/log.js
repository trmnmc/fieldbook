import { newId } from './store.js';

export const EVENT_KINDS = ['here', 'follow', 'strike', 'catch', 'note', 'bait'];
const HOUR = 3600000;

export function snapshot({ at, lat, lon, cond = {}, astro }) {
  const d = new Date(at);
  const ev = astro?.nearest ? astro.nearest(d) : null;
  const ph = astro?.phase ? astro.phase(d) : null;
  return {
    at: d.toISOString(), lat: lat ?? null, lon: lon ?? null,
    moonPhase: ph?.name ?? null, moonFraction: ph?.fraction ?? null,
    moonEvent: ev ? { kind: ev.kind, minutes: ev.minutes } : null,
    pressureInHg: cond.pressureInHg ?? null, pressureTrend: cond.pressureTrend ?? null,
    windMph: cond.windMph ?? null, windCompass: cond.windCompass ?? null, sky: cond.sky ?? null,
    waterTempF: cond.waterTempF ?? null, clarity: cond.clarity ?? null, forecastAgeMin: cond.forecastAgeMin ?? null,
  };
}

export async function startTrip(db, { lakeId, plan, cond, presentation = 'any' }) {
  const now = new Date().toISOString();
  const trip = { id: newId('trip'), lakeId, startedAt: now, endedAt: null, plan: plan ?? null, cond: cond ?? null, presentation, rating: null, worked: '', notes: '', updatedAt: now };
  await db.put('trips', trip);
  return trip;
}

export async function addEvent(db, tripId, fields, snap) {
  if (!EVENT_KINDS.includes(fields.kind)) throw new Error('unknown event kind ' + fields.kind);
  if (fields.kind === 'catch' && !(fields.lengthIn > 0 && fields.lengthIn <= 70)) throw new Error('length must be 1 to 70 inches');
  if (fields.kind === 'note' && fields.adjustment && !['depth', 'retrieve', 'lure', 'boat_position', 'location'].includes(fields.adjustment.what)) throw new Error('unknown adjustment');
  const event = { id: newId('evt'), tripId, at: fields.at || new Date().toISOString(), spotId: fields.spotId ?? null, snapshot: snap ?? null, ...fields, updatedAt: new Date().toISOString() };
  for (const [k, v] of Object.entries(event)) if (typeof Blob !== 'undefined' && v instanceof Blob) delete event[k]; // photos live in the photos store, never inside the event
  if (event.kind === 'catch' && event.lengthIn && event.girthIn) event.estWeightLb = Math.round((event.lengthIn * event.girthIn * event.girthIn) / 800 * 10) / 10;
  await db.put('events', event);
  return event;
}

export async function setOutcome(db, eventId, outcome) {
  const e = await db.get('events', eventId);
  if (!e || !e.adjustment) throw new Error('not an adjustment note');
  e.adjustment = { ...e.adjustment, outcome };
  e.updatedAt = new Date().toISOString();
  await db.put('events', e);
  return e;
}

export async function endTrip(db, tripId, { rating = null, worked = '', notes = '' } = {}) {
  const t = await db.get('trips', tripId);
  if (!t) throw new Error('no trip ' + tripId);
  const now = new Date().toISOString();
  Object.assign(t, { endedAt: now, rating, worked, notes, updatedAt: now });
  await db.put('trips', t);
  return t;
}

export function tripTimeline(events) { return [...events].sort((a, b) => new Date(a.at) - new Date(b.at)); }

export function effortBySpot(events, trip) {
  const end = new Date(trip.endedAt || Date.now()).getTime();
  const heres = tripTimeline(events).filter(e => e.kind === 'here');
  const out = {};
  let cursor = new Date(trip.startedAt).getTime(), current = 'none';
  for (const h of heres) { const t = new Date(h.at).getTime(); out[current] = (out[current] || 0) + Math.max(0, t - cursor) / HOUR; cursor = t; current = h.spotId || 'none'; }
  out[current] = (out[current] || 0) + Math.max(0, end - cursor) / HOUR;
  return out;
}

export function rates(events, trip) {
  const effort = effortBySpot(events, trip);
  const bySpot = {}, byLure = {};
  const bump = (o, k, f) => { o[k] = o[k] || { hours: 0, follows: 0, strikes: 0, catches: 0 }; o[k][f] += 1; };
  for (const e of events) {
    if (!['follow', 'strike', 'catch'].includes(e.kind)) continue;
    const f = e.kind === 'follow' ? 'follows' : e.kind === 'strike' ? 'strikes' : 'catches';
    bump(bySpot, e.spotId || 'none', f);
    if (e.lureId) bump(byLure, e.lureId, f);
  }
  for (const [k, v] of Object.entries(bySpot)) { v.hours = effort[k] || 0; v.followsPerHour = v.hours > 0 ? v.follows / v.hours : 0; }
  const hours = Object.values(effort).reduce((a, b) => a + b, 0);
  const follows = Object.values(bySpot).reduce((a, v) => a + v.follows, 0), catches = Object.values(bySpot).reduce((a, v) => a + v.catches, 0);
  return { bySpot, byLure, total: { hours, follows, catches, followsPerHour: hours > 0 ? follows / hours : 0 } };
}

export async function verifySpots(db, events) {
  const fished = new Set(events.filter(e => e.spotId).map(e => e.spotId));
  const flipped = [];
  for (const id of fished) { const s = await db.get('spots', id); if (s && s.verified === false) { const now = new Date().toISOString(); s.verified = true; s.verifiedAt = now; s.updatedAt = now; await db.put('spots', s); flipped.push(id); } }
  return flipped.sort();
}

const EARTH_M = 6371000;
export function distanceM(a, b) {
  const rad = d => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(s));
}

// the closest spot within maxM metres of pos, or null: a follow in open water belongs to no spot
export function nearestSpot(spots, pos, maxM = 250) {
  let best = null, bestD = Infinity;
  for (const s of spots) { if (s.lat == null || s.lon == null) continue; const d = distanceM(pos, s); if (d < bestD) { best = s; bestD = d; } }
  return best && bestD <= maxM ? best : null;
}

export function logStatsForPlanner(allEvents, trips) {
  const out = {};
  for (const trip of trips) {
    const ev = allEvents.filter(e => e.tripId === trip.id);
    const r = rates(ev, trip);
    for (const [spotId, v] of Object.entries(r.bySpot)) { if (spotId === 'none') continue; out[spotId] = out[spotId] || { follows: 0, hours: 0 }; out[spotId].follows += v.follows; out[spotId].hours += v.hours; }
  }
  for (const v of Object.values(out)) v.followsPerHour = v.hours > 0 ? v.follows / v.hours : 0;
  return out;
}
