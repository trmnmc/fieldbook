import { h } from './dom.js';
import { CHAIN, nearestMoonEvent, moonPhase, fmtTime } from '../astro.js';
import { conditionsAt } from '../weather.js';
import { snapshot, startTrip, addEvent, endTrip, setOutcome, rates, verifySpots, tripTimeline } from '../log.js';
import { downscaleImage, savePhoto } from '../photos.js';

const astro = { nearest: d => nearestMoonEvent(d, CHAIN.lat, CHAIN.lon, CHAIN.tz), phase: d => moonPhase(d) };
const opt = (vals, cur) => vals.map(v => h('option', { value: v, selected: v === cur ? true : null }, v));
const field = (label, el) => h('div', {}, h('label', {}, label), el);

async function geo() { return new Promise(res => { if (!navigator.geolocation) return res(null); navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lon: p.coords.longitude }), () => res(null), { enableHighAccuracy: true, timeout: 8000 }); }); }

async function currentCond(app, trip) {
  const base = trip.cond || {};
  const fc = app.forecast ? conditionsAt(app.forecast, new Date().toISOString().slice(0, 16)) : null;
  return { ...base, pressureInHg: fc?.pressureInHg ?? base.pressureInHg ?? null, pressureTrend: fc?.trend ?? base.pressureTrend ?? null, windMph: fc?.windMph ?? base.windMph ?? null, windCompass: fc?.windCompass ?? base.windCompass ?? null, sky: base.sky || fc?.sky || null, forecastAgeMin: fc?.forecastAgeMin ?? null };
}

export async function tripView(app, param) {
  const trips = (await app.db.all('trips')).sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  const open = trips.find(t => !t.endedAt);
  if (param === 'new') {
    if (open) { location.hash = '#trip/' + open.id; return h('div'); }
    const last = await app.settings.get('lastPlan');
    if (!last) { location.hash = '#plan'; return h('div'); }
    const t = await startTrip(app.db, { lakeId: last.cond.lakeId, plan: last.plan, cond: last.cond, presentation: last.cond.presentation });
    location.hash = '#trip/' + t.id; return h('div');
  }
  if (!param) return h('div', {}, open ? h('a', { class: 'btn', href: '#trip/' + open.id, style: 'display:block;text-align:center' }, 'Continue trip') : h('a', { class: 'btn', href: '#plan', style: 'display:block;text-align:center' }, 'Plan first, then start a trip'), h('div', { class: 'card' }, h('h2', {}, 'Past trips'), trips.filter(t => t.endedAt).map(t => h('a', { href: '#trip/' + t.id, style: 'display:block;padding:8px 0' }, `${t.startedAt.slice(0, 10)} ${app.index.lakeById[t.lakeId]?.name || t.lakeId}`, t.rating ? h('span', { class: 'badge' }, '★ ' + t.rating) : null))));
  const trip = await app.db.get('trips', param);
  if (!trip) return h('div', { class: 'card' }, 'No such trip.');
  const spots = (await app.getSpots()).filter(s => s.lakeId === trip.lakeId);
  const lures = app.content.lures;
  const events = tripTimeline((await app.db.all('events')).filter(e => e.tripId === trip.id));
  const lastWith = k => [...events].reverse().find(e => e[k])?.[k] || '';
  const live = !trip.endedAt;
  const root = h('div');
  const rerender = () => { location.hash = '#trip/' + trip.id; app.navigate(location.hash); };

  async function log(kind, fields) {
    const pos = await geo();
    const snap = snapshot({ at: new Date().toISOString(), lat: pos?.lat ?? null, lon: pos?.lon ?? null, cond: await currentCond(app, trip), astro });
    const spotId = fields.spotId || (pos && spots.length ? nearest(spots, pos).id : null) || lastWith('spotId') || null;
    const ev = await addEvent(app.db, trip.id, { kind, spotId, ...fields }, snap);
    if (fields.photoFile) await savePhoto(app.db, ev.id, await downscaleImage(fields.photoFile), 'catch');
    if (fields.marksFile) await savePhoto(app.db, ev.id, await downscaleImage(fields.marksFile), 'marks');
    rerender();
  }
  const nearest = (list, p) => list.reduce((b, s) => { const d = (s.lat - p.lat) ** 2 + (s.lon - p.lon) ** 2; return !b || d < b.d ? { ...s, d } : b; }, null);

  const spotSel = cur => h('select', { name: 'spotId' }, h('option', { value: '' }, 'nearest / unknown'), spots.map(s => h('option', { value: s.id, selected: s.id === cur ? true : null }, s.name)));
  const lureSel = cur => h('select', { name: 'lureId' }, lures.map(l => h('option', { value: l.id, selected: l.id === cur ? true : null }, l.example)));
  const read = form => Object.fromEntries([...form.querySelectorAll('[name]')].map(el => [el.name, el.type === 'file' ? el.files[0] || null : el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value || null]));
  const sheet = (title, kind, fields) => { const f = h('div', { class: 'card' }, h('h3', {}, title), fields, h('button', { onclick: () => log(kind, read(f)).catch(e => alert(e.message)) }, 'Save'), h('button', { class: 'secondary', onclick: () => f.remove() }, 'Cancel')); root.prepend(f); f.scrollIntoView(); };

  const buttons = live ? h('div', { class: 'grid2' },
    h('button', { onclick: () => sheet('I am here', 'here', [field('Spot', spotSel(lastWith('spotId')))]) }, 'Here'),
    h('button', { onclick: () => sheet('Follow', 'follow', [field('Size estimate in', h('input', { name: 'sizeEstimateIn', type: 'number', inputmode: 'numeric', value: 40 })), field('Heat', h('select', { name: 'heat' }, opt(['lazy', 'hot', 'hit the 8'], 'lazy'))), field('Seen', h('select', { name: 'seen' }, opt(['boat side', 'mid-retrieve'], 'boat side'))), field('Lure', lureSel(lastWith('lureId'))), field('Color', h('input', { name: 'color', value: lastWith('color') })), field('Speed', h('select', { name: 'speed' }, opt(['slow', 'medium', 'fast', 'burn'], lastWith('speed') || 'medium'))), field('Position', h('select', { name: 'position' }, opt(['on top', 'edge', 'off the break', 'inside turn'], lastWith('position') || 'edge'))), field('Depth under boat ft', h('input', { name: 'depthUnderBoatFt', type: 'number', inputmode: 'decimal', value: lastWith('depthUnderBoatFt') })), field('Spot', spotSel(lastWith('spotId')))]) }, 'Follow'),
    h('button', { onclick: () => sheet('Strike', 'strike', [field('Result', h('select', { name: 'result' }, opt(['missed', 'hooked and lost'], 'missed'))), field('On the 8?', h('select', { name: 'hitWhere' }, opt(['on the retrieve', 'on the 8'], 'on the retrieve'))), field('Lure', lureSel(lastWith('lureId'))), field('Color', h('input', { name: 'color', value: lastWith('color') })), field('Speed', h('select', { name: 'speed' }, opt(['slow', 'medium', 'fast', 'burn'], lastWith('speed') || 'medium'))), field('Depth under boat ft', h('input', { name: 'depthUnderBoatFt', type: 'number', inputmode: 'decimal' })), field('Spot', spotSel(lastWith('spotId')))]) }, 'Strike'),
    h('button', { onclick: () => sheet('Catch', 'catch', [h('p', { class: 'reason' }, 'Measure in the boat on a board, lower jaw tip to tail tip. Fish stays in the net in the water until the tools are in hand.'), field('Length in', h('input', { name: 'lengthIn', type: 'number', inputmode: 'decimal' })), field('Girth in', h('input', { name: 'girthIn', type: 'number', inputmode: 'decimal' })), field('Lure', lureSel(lastWith('lureId'))), field('Color', h('input', { name: 'color', value: lastWith('color') })), field('Retrieve', h('input', { name: 'retrieve', value: lastWith('speed') })), field('Hit where', h('select', { name: 'hitWhere' }, opt(['on the retrieve', 'on the 8'], 'on the retrieve'))), field('Depth fish hit at ft', h('input', { name: 'fishDepthFt', type: 'number', inputmode: 'decimal' })), field('Depth under boat ft', h('input', { name: 'depthUnderBoatFt', type: 'number', inputmode: 'decimal' })), field('Weed type', h('select', { name: 'weedType' }, opt(['cabbage', 'coontail', 'milfoil', 'mixed', 'none'], 'cabbage'))), field('Bottom', h('select', { name: 'bottom' }, opt(['sand', 'gravel', 'rock', 'muck', 'peat', 'unknown'], 'unknown'))), field('Hook location', h('input', { name: 'hookLocation' })), field('Seconds to release', h('input', { name: 'releaseSeconds', type: 'number', inputmode: 'numeric' })), field('Marks for recapture', h('input', { name: 'marks' })), field('Photo', h('input', { name: 'photoFile', type: 'file', accept: 'image/*', capture: 'environment' })), field('Marks photo', h('input', { name: 'marksFile', type: 'file', accept: 'image/*', capture: 'environment' })), field('Spot', spotSel(lastWith('spotId'))), field('Notes', h('textarea', { name: 'notes' }))]) }, 'Catch'),
    h('button', { class: 'secondary', onclick: () => { const adj = h('div', { hidden: true }, field('What changed', h('select', { name: 'what' }, opt(['depth', 'retrieve', 'lure', 'boat_position', 'location'], 'lure'))), field('Why (Dad\'s words)', h('textarea', { name: 'why' }))); const f = h('div', { class: 'card' }, h('h3', {}, 'Note'), field('Text', h('textarea', { name: 'text' })), h('label', {}, h('input', { type: 'checkbox', style: 'width:auto;min-height:0', onchange: e => { adj.hidden = !e.target.checked; } }), ' This is an adjustment'), adj, h('button', { onclick: () => { const v = read(f); const a = adj.hidden ? null : { what: v.what, why: v.why, outcome: null }; log('note', { text: v.text, adjustment: a }).catch(e => alert(e.message)); } }, 'Save'), h('button', { class: 'secondary', onclick: () => f.remove() }, 'Cancel')); root.prepend(f); } }, 'Note'),
    h('button', { class: 'secondary', onclick: () => sheet('Bait seen', 'bait', [field('What', h('select', { name: 'bait' }, opt(['cisco', 'perch', 'sucker', 'bait ball on sonar', 'other'], 'perch'))), field('Depth ft', h('input', { name: 'depthFt', type: 'number', inputmode: 'decimal' }))]) }, 'Bait'),
  ) : null;

  const r = rates(events, trip);
  const perHour = v => v.hours >= 0.25 ? v.followsPerHour.toFixed(2) : '–';
  const summary = h('div', { class: 'card' }, h('h3', {}, `${app.index.lakeById[trip.lakeId]?.name} · ${trip.startedAt.slice(0, 10)}`), h('p', {}, `${r.total.hours.toFixed(1)} h · ${r.total.follows} follows · ${r.total.catches} catches · ${perHour(r.total)} follows/h`), Object.entries(r.bySpot).map(([id, v]) => h('p', { class: 'reason' }, `${spots.find(s => s.id === id)?.name || 'no spot'}: ${v.hours.toFixed(1)} h, ${v.follows} follows, ${v.catches} catches, ${perHour(v)}/h`)), Object.entries(r.byLure).map(([id, v]) => h('p', { class: 'reason' }, `${lures.find(l => l.id === id)?.example || id}: ${v.follows} follows, ${v.strikes} strikes, ${v.catches} catches`)));

  const planCard = trip.plan ? h('div', { class: 'card' }, h('h3', {}, 'The plan said'), h('p', {}, trip.plan.watchFor), (trip.plan.windows || []).filter(w => w.score > 0).slice(0, 3).map(w => h('p', { class: 'reason' }, `${fmtTime(new Date(w.start))} to ${fmtTime(new Date(w.end))} ${w.label}`)), (trip.plan.spots || []).slice(0, 3).map(s => h('p', { class: 'reason' }, 'Spot: ' + s.name)), (trip.plan.lures || []).map(l => h('p', { class: 'reason' }, 'Lure: ' + (lures.find(x => x.id === l.id)?.example || l.id)))) : null;

  const timeline = h('div', { class: 'card' }, h('h3', {}, 'Timeline'), events.length ? events.map(e => h('div', { style: 'padding:6px 0;border-top:1px solid rgba(255,255,255,.08)' }, h('b', {}, fmtTime(new Date(e.at)) + ' ' + e.kind), e.kind === 'catch' ? ` ${e.lengthIn}" ${e.estWeightLb ? '~' + e.estWeightLb + ' lb' : ''} on ${lures.find(l => l.id === e.lureId)?.example || ''} ${e.hitWhere || ''}` : e.kind === 'follow' ? ` ~${e.sizeEstimateIn}" ${e.heat} ${e.seen} on ${lures.find(l => l.id === e.lureId)?.example || ''} at ${e.speed}` : e.kind === 'note' ? ' ' + (e.text || '') : e.kind === 'bait' ? ` ${e.bait} ${e.depthFt ? e.depthFt + ' ft' : ''}` : e.kind === 'here' ? ' ' + (spots.find(s => s.id === e.spotId)?.name || '') : '', e.adjustment ? h('div', { class: 'job' }, `Adjusted ${e.adjustment.what.replace('_', ' ')}: ${e.adjustment.why || ''}`, h('div', {}, 'Outcome: ', e.adjustment.outcome || h('button', { class: 'secondary', style: 'width:auto;min-height:36px;padding:4px 10px', onclick: () => { const o = prompt('What happened after the change?'); if (o) setOutcome(app.db, e.id, o).then(rerender); } }, 'add'))) : null, e.snapshot ? h('div', { class: 'reason' }, [e.snapshot.waterTempF != null ? e.snapshot.waterTempF + '°F' : null, e.snapshot.moonEvent ? `${e.snapshot.moonEvent.kind} ${e.snapshot.moonEvent.minutes >= 0 ? '+' : ''}${e.snapshot.moonEvent.minutes} min` : null, e.snapshot.pressureInHg ? `${e.snapshot.pressureInHg} inHg ${e.snapshot.pressureTrend}` : null, e.snapshot.windMph != null ? `wind ${e.snapshot.windMph} ${e.snapshot.windCompass || ''}` : null, e.snapshot.sky].filter(Boolean).join(' · ')) : null)) : h('p', { class: 'reason' }, 'No events yet. Tap Here when you reach the first spot.'));

  const endCard = live ? h('div', { class: 'card' }, h('h3', {}, 'End trip'), field('Rating 1 to 5', h('input', { name: 'rating', type: 'number', inputmode: 'numeric', min: 1, max: 5 })), field('What worked', h('textarea', { name: 'worked' })), field('Notes', h('textarea', { name: 'notes' })), h('button', { class: 'danger', onclick: async e => { const v = read(e.target.parentElement); await endTrip(app.db, trip.id, { rating: v.rating, worked: v.worked || '', notes: v.notes || '' }); await verifySpots(app.db, events); rerender(); } }, 'End trip')) : h('div', { class: 'card' }, h('h3', {}, 'Rated ' + (trip.rating ?? '–')), h('p', {}, trip.worked), h('p', { class: 'reason' }, trip.notes));

  root.append(...[buttons, summary, planCard, timeline, endCard].filter(Boolean));
  return root;
}
