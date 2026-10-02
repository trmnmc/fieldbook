import { fmtTime, localDayBounds, CHAIN } from './astro.js';

export const LUNGE_LOG_COLUMNS = ['Date', 'Time', 'Water Body', 'State', 'Length (in)', 'Girth (in)', 'Est Weight (lb)', 'Lure Type', 'Lure Color', 'Lure Size (in)', 'Sky', 'Water Clarity', 'Water Temp (F)', 'Water Depth (ft)', 'Fish Depth (ft)', 'Weed Type', 'Bottom Type', 'Barometric Pressure (inHg)', 'Pressure Trend', 'Moon Phase', 'Released', 'Notes'];

export function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const line = cells => cells.map(csvEscape).join(',');

export function catchesToCsv({ events, trips, lakes, lures }) {
  const tripById = Object.fromEntries(trips.map(t => [t.id, t])), lakeById = Object.fromEntries(lakes.map(l => [l.id, l])), lureById = Object.fromEntries(lures.map(l => [l.id, l]));
  const rows = events.filter(e => e.kind === 'catch').sort((a, b) => new Date(a.at) - new Date(b.at)).map(e => {
    const trip = tripById[e.tripId] || {}, lake = lakeById[trip.lakeId] || {}, lure = lureById[e.lureId] || {}, s = e.snapshot || {};
    const d = new Date(e.at);
    return [localDayBounds(d, CHAIN.tz).ymd, fmtTime(d, CHAIN.tz), lake.name || '', (lake.states || []).join('/'), e.lengthIn, e.girthIn, e.estWeightLb, lure.family || e.lureId || '', e.color, lure.sizeIn, s.sky, s.clarity, s.waterTempF, e.depthUnderBoatFt, e.fishDepthFt, e.weedType, e.bottom, s.pressureInHg, s.pressureTrend, s.moonPhase, e.released === false ? 'no' : 'yes', e.notes];
  });
  return [line(LUNGE_LOG_COLUMNS), ...rows.map(line)].join('\n') + '\n';
}

export function eventsToCsv({ events, trips }) {
  const tripById = Object.fromEntries(trips.map(t => [t.id, t]));
  const flat = events.map(e => {
    const o = { lakeId: tripById[e.tripId]?.lakeId || '' };
    for (const [k, v] of Object.entries(e)) { if (k === 'snapshot') { for (const [sk, sv] of Object.entries(v || {})) o['snap_' + sk] = typeof sv === 'object' && sv ? JSON.stringify(sv) : sv; } else if (k === 'adjustment') { o.adj_what = v?.what; o.adj_why = v?.why; o.adj_outcome = v?.outcome; } else if (typeof v !== 'object' || v === null) o[k] = v; }
    return o;
  });
  const cols = [...new Set(flat.flatMap(Object.keys))].sort((a, b) => (a === 'at' ? -1 : b === 'at' ? 1 : a.localeCompare(b)));
  return [line(cols), ...flat.sort((a, b) => new Date(a.at) - new Date(b.at)).map(o => line(cols.map(c => o[c])))].join('\n') + '\n';
}

export async function toBackupJson(db) {
  return { kind: 'backup', version: 1, exportedAt: new Date().toISOString(), trips: await db.all('trips'), events: await db.all('events'), spots: await db.all('spots'), settings: await db.all('settings') };
}

export async function importJson(db, obj) {
  const r = { added: 0, updated: 0, skipped: 0 };
  if (obj?.kind === 'backup') {
    for (const store of ['trips', 'events', 'spots', 'settings']) for (const rec of obj[store] || []) {
      const cur = await db.get(store, rec.id);
      if (cur && cur.updatedAt && (!rec.updatedAt || cur.updatedAt >= rec.updatedAt)) { r.skipped++; continue; } // the phone's copy is at least as new: keep it
      await db.put(store, rec); cur ? r.updated++ : r.added++;
    }
    return r;
  }
  if (obj?.kind === 'spots-pack') {
    for (const s of obj.spots || []) {
      const cur = await db.get('spots', s.id);
      if (cur && (cur.addedBy !== 'seed' || cur.verified === true)) { r.skipped++; continue; }
      await db.put('spots', { ...s, addedBy: 'seed', verified: false }); cur ? r.updated++ : r.added++;
    }
    return r;
  }
  throw new Error('not a backup or spots pack');
}
