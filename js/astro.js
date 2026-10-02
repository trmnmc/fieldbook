import { getTimes, getMoonTimes, getMoonIllumination } from './vendor/suncalc.js';

export const CHAIN = { lat: 46.22, lon: -89.41, tz: 'America/Chicago' };
const MIN = 60000;

function parts(date, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const o = {};
  for (const p of f.formatToParts(date)) if (p.type !== 'literal') o[p.type] = +p.value;
  if (o.hour === 24) o.hour = 0;
  return o;
}

export function tzOffsetMinutes(date, tz = CHAIN.tz) {
  const p = parts(date, tz);
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime()) / MIN);
}

function pad(n) { return String(n).padStart(2, '0'); }

export function localDayBounds(date, tz = CHAIN.tz) {
  const p = parts(date, tz);
  const ymd = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  // local midnight: guess UTC midnight, correct by the offset at that instant, correct once more for DST edges
  let start = new Date(Date.UTC(p.year, p.month - 1, p.day));
  start = new Date(start.getTime() - tzOffsetMinutes(start, tz) * MIN);
  start = new Date(Date.UTC(p.year, p.month - 1, p.day) - tzOffsetMinutes(start, tz) * MIN);
  let end = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  end = new Date(end.getTime() - tzOffsetMinutes(end, tz) * MIN);
  end = new Date(Date.UTC(p.year, p.month - 1, p.day + 1) - tzOffsetMinutes(end, tz) * MIN);
  return { start, end, ymd };
}

export function fmtTime(date, tz = CHAIN.tz) {
  if (!date) return '';
  const s = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
  return s.replace(' AM', ' am').replace(' PM', ' pm');
}

// wall-clock key in the chain zone, the same shape Open-Meteo rows use (YYYY-MM-DDTHH:MM)
export function localKey(date, tz = CHAIN.tz) {
  const p = parts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function fmtDate(date, tz = CHAIN.tz) {
  const p = parts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function noonOf(date, tz) {
  const { start } = localDayBounds(date, tz);
  return new Date(start.getTime() + 12 * 60 * MIN);
}

export function sunTimes(date, lat = CHAIN.lat, lon = CHAIN.lon, tz = CHAIN.tz) {
  const noon = noonOf(date, tz);
  const t = getTimes(noon, lat, lon, 0, tzOffsetMinutes(noon, tz));
  return { dawn: t.dawn || null, sunrise: t.sunrise || null, sunset: t.sunset || null, dusk: t.dusk || null, solarNoon: t.solarNoon || null };
}

const PHASE_NAMES = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];

export function moonPhase(date) {
  const i = getMoonIllumination(date);
  return { phase: i.phase, fraction: i.fraction, waxing: i.waxing, name: PHASE_NAMES[Math.round(i.phase * 8) % 8] };
}

const MOON_KEYS = [['rise', 'moonrise'], ['set', 'moonset'], ['transit', 'overhead'], ['lowerTransit', 'underfoot']];

export function moonEvents(date, lat = CHAIN.lat, lon = CHAIN.lon, tz = CHAIN.tz) {
  // scan from local midnight with the offset in force at that instant; a 25-hour day gets a second
  // scan from 24 h later so its last hour is covered; keep only events inside [start, end)
  const { start, end } = localDayBounds(date, tz);
  const anchors = [start];
  if (end - start > 24 * 60 * MIN) anchors.push(new Date(start.getTime() + 24 * 60 * MIN));
  const seen = new Map();
  for (const anchor of anchors) {
    const m = getMoonTimes(anchor, lat, lon, tzOffsetMinutes(anchor, tz));
    for (const [key, kind] of MOON_KEYS) {
      const at = m[key];
      if (!at || at < start || at >= end) continue;
      const k = kind + ':' + Math.round(at.getTime() / MIN);
      if (!seen.has(k)) seen.set(k, { kind, at });
    }
  }
  return [...seen.values()].sort((a, b) => a.at - b.at);
}

const LABEL = { moonrise: 'Moonrise', moonset: 'Moonset', overhead: 'Moon overhead', underfoot: 'Moon underfoot' };

export function windows(date, lat = CHAIN.lat, lon = CHAIN.lon, tz = CHAIN.tz) {
  const s = sunTimes(date, lat, lon, tz);
  const out = [];
  const mk = (kind, label, anchor, halfMin) => {
    if (!anchor) return;
    out.push({ kind, label, anchor, start: new Date(anchor.getTime() - halfMin * MIN), end: new Date(anchor.getTime() + halfMin * MIN) });
  };
  mk('dawn', 'Dawn', s.sunrise, 60);
  mk('dusk', 'Dusk', s.sunset, 60);
  for (const e of moonEvents(date, lat, lon, tz)) {
    if (e.kind === 'overhead' || e.kind === 'underfoot') mk('major', LABEL[e.kind] + ' (major)', e.at, 60);
    else mk('minor', LABEL[e.kind] + ' (minor)', e.at, 30);
  }
  return out.sort((a, b) => a.start - b.start);
}

export function nearestMoonEvent(at, lat = CHAIN.lat, lon = CHAIN.lon, tz = CHAIN.tz) {
  const day = 24 * 60 * MIN;
  const cands = [-1, 0, 1].flatMap(d => moonEvents(new Date(at.getTime() + d * day), lat, lon, tz));
  const seen = new Set();
  let best = null;
  for (const e of cands) {
    const key = e.kind + e.at.getTime();
    if (seen.has(key)) continue;
    seen.add(key);
    const minutes = Math.round((at - e.at) / MIN);
    if (!best || Math.abs(minutes) < Math.abs(best.minutes)) best = { kind: e.kind, at: e.at, minutes };
  }
  return best;
}
