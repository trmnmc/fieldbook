const COMPASS_GROUP = { N: ['N', 'NNE', 'NNW'], NE: ['NE', 'NNE', 'ENE'], E: ['E', 'ENE', 'ESE'], SE: ['SE', 'ESE', 'SSE'], S: ['S', 'SSE', 'SSW'], SW: ['SW', 'SSW', 'WSW'], W: ['W', 'WSW', 'WNW'], NW: ['NW', 'WNW', 'NNW'] };
const inBand = (v, bands) => v != null && Array.isArray(bands) && bands.some(([lo, hi]) => v >= lo && v <= hi);
const reason = p => ({ patternId: p.id, pro: p.pro, yourJob: p.yourJob });

export function validateInputs(cond) {
  const errs = [];
  if (!cond.lakeId) errs.push('Pick a lake.');
  if (cond.waterTempF != null && (cond.waterTempF < 32 || cond.waterTempF > 90)) errs.push(`Water temperature ${cond.waterTempF} is outside 32 to 90 °F. Read it in Fahrenheit off the fish finder.`);
  if (cond.windMph != null && (cond.windMph < 0 || cond.windMph > 60)) errs.push('Wind speed must be 0 to 60 mph.');
  return errs;
}

function matchOne(when, cond) {
  for (const [k, v] of Object.entries(when)) {
    const c = cond[k === 'tempF' ? 'waterTempF' : k === 'frontHoursAgo' ? 'hoursSinceFront' : k === 'months' ? 'month' : k];
    if (c === null || c === undefined) return false;
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && ['tempF', 'windMph', 'frontHoursAgo'].includes(k)) { if (c < v[0] || c > v[1]) return false; }
    else if (Array.isArray(v)) { if (!v.includes(c)) return false; }
    else if (v !== c) return false;
  }
  return true;
}

export function matchPatterns(patterns, cond) { return patterns.filter(p => matchOne(p.when || {}, cond)); }

export function dayWindows(astroWindows, sun) {
  const out = astroWindows.map(w => ({ ...w, stacks: [] }));
  if (sun?.solarNoon) { const n = sun.solarNoon.getTime(); out.push({ kind: 'midday', label: 'Midday', anchor: sun.solarNoon, start: new Date(n - 7200000), end: new Date(n + 7200000), stacks: [] }); }
  if (sun?.dusk) { const d = sun.dusk.getTime(); const e = new Date(d); e.setHours(23, 0, 0, 0); if (e > sun.dusk) out.push({ kind: 'night', label: 'After dark', anchor: sun.dusk, start: sun.dusk, end: e, stacks: [] }); }
  for (const a of out) for (const b of out) if (a !== b && a.kind !== 'midday' && b.kind !== 'midday' && a.kind !== 'night' && b.kind !== 'night' && a.start < b.end && b.start < a.end) a.stacks.push(b.label);
  return out.sort((a, b) => a.start - b.start);
}

export function scoreWindows(windows, matched) {
  return windows.map(window => {
    let score = 0; const reasons = [];
    for (const p of matched) { const w = p.favor?.windows?.[window.kind] || 0; if (w > 0) { score += w; reasons.push(reason(p)); } }
    if (window.stacks.length) score += 2;
    return { window, score, reasons, stacks: window.stacks };
  }).sort((a, b) => b.score - a.score || a.window.start - b.window.start);
}

export function scoreSpots(spots, matched, cond, logStats = {}) {
  const group = COMPASS_GROUP[(cond.windCompass || '').slice(0, 2)] || COMPASS_GROUP[(cond.windCompass || '').slice(0, 1)] || [];
  return spots.filter(s => s.lakeId === cond.lakeId).map(spot => {
    let score = 0; const reasons = [];
    for (const p of matched) { const w = p.favor?.spotTypes?.[spot.type] || 0; if (w > 0) { score += w; reasons.push(reason(p)); } }
    if ((spot.bestWind || []).some(d => d === cond.windCompass || group.includes(d))) { score += 2; reasons.push({ patternId: 'wind-fit', pro: `Wind from the ${cond.windCompass} is on this spot.`, yourJob: 'Keep the boat upwind of it.' }); }
    if (inBand(cond.waterTempF, spot.tempBandsF)) { score += 2; reasons.push({ patternId: 'temp-fit', pro: `${cond.waterTempF}°F is inside this spot's band.`, yourJob: 'Confirm the temperature when we arrive.' }); }
    if ((spot.months || []).includes(cond.month)) score += 1;
    const st = logStats[spot.id];
    if (st && st.followsPerHour > 0) { const b = Math.min(3, Math.round(st.followsPerHour * 2)); score += b; reasons.push({ patternId: 'your-log', pro: `Your log: ${st.follows} follows in ${st.hours.toFixed(1)} hours here.`, yourJob: 'Repeat what worked last time; it is in the trip log.' }); }
    if (spot.verified === false) reasons.push({ patternId: 'unverified', pro: 'Unverified: read from a map or report, not fished yet.', yourJob: 'Mark it verified from the trip once you fish it.' });
    return { spot, score, reasons };
  }).sort((a, b) => b.score - a.score || a.spot.name.localeCompare(b.spot.name));
}

export function scoreLures(lures, matched, cond) {
  const pres = cond.presentation || 'any';
  return lures.filter(l => pres === 'any' || (pres === 'trolling' ? l.trollOk : pres === 'suckers' ? l.family === 'sucker' : l.family !== 'sucker')).map(lure => {
    let score = 0; const reasons = [];
    for (const p of matched) { const w = p.favor?.lureFamilies?.[lure.family] || 0; if (w > 0) { score += w; reasons.push(reason(p)); } }
    if (cond.waterTempF != null) { if (inBand(cond.waterTempF, lure.tempBandsF)) score += 3; else { score -= 5; reasons.push({ patternId: 'temp-miss', pro: `${cond.waterTempF}°F is outside this lure's band. ${lure.whenNot}`, yourJob: 'Leave it in the box today.' }); } }
    if (cond.sky && (lure.light || []).includes(cond.sky)) score += 1;
    if (cond.windMph != null && lure.windMph && cond.windMph >= lure.windMph[0] && cond.windMph <= lure.windMph[1]) score += 1;
    return { lure, score, reasons };
  }).sort((a, b) => b.score - a.score || a.lure.id.localeCompare(b.lure.id));
}

function watchLine(matched, cond) {
  const t = cond.waterTempF;
  const top = [...matched].sort((a, b) => Object.values(b.favor?.windows || {}).reduce((x, y) => x + y, 0) - Object.values(a.favor?.windows || {}).reduce((x, y) => x + y, 0))[0];
  const sign = t == null ? 'Enter the water temperature from the fish finder.' : t > 58 ? 'Watch for bait on the flats and wakes behind the lure.' : t > 50 ? 'Watch the weeds: green means stay, brown means move to the edge. Follows count.' : 'Watch the float and the sonar; the fish are deep and slow.';
  return (top ? top.name + '. ' : '') + sign;
}

export function plan({ content, spots, cond, astroWindows, sun, logStats = {} }) {
  const errors = validateInputs(cond);
  if (errors.length) return { windows: [], spots: [], lures: [], watchFor: errors.join(' '), matched: [], errors };
  const matched = matchPatterns(content.patterns, cond);
  return {
    windows: scoreWindows(dayWindows(astroWindows, sun), matched),
    spots: scoreSpots(spots, matched, cond, logStats).slice(0, 5),
    lures: scoreLures(content.lures, matched, cond).slice(0, 3),
    watchFor: watchLine(matched, cond), matched, errors,
  };
}
