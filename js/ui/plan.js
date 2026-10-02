import { h } from './dom.js';
import { CHAIN, windows, sunTimes, moonPhase, fmtTime, localDayBounds } from '../astro.js';
import { conditionsAt } from '../weather.js';
import { plan as runPlan } from '../engine.js';
import { logStatsForPlanner } from '../log.js';
import { forecastKey, fillConditions, forecastIsStale } from '../plan-fill.js';
import { lakeAt, offsetText, appleMapsUrl } from '../geo.js';

const SKIES = ['sun', 'partly', 'overcast'], CLARITY = ['clear', 'stained', 'dirty'], PRES = ['any', 'casting', 'trolling', 'suckers'];
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const FILLED = ['sky', 'windMph', 'windCompass', 'pressureTrend'];

function geo() {
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lon: p.coords.longitude, at: Date.now() }), () => res(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
  });
}

export async function planView(app) {
  // wait briefly for the boot fetch; refresh when the last forecast is old
  if (app.forecastReady) await Promise.race([app.forecastReady, new Promise(r => setTimeout(r, 2500))]);
  if (forecastIsStale(app.forecast)) await Promise.race([app.refreshForecast(), new Promise(r => setTimeout(r, 2500))]);
  const lakes = app.content.lakes;
  const saved = (await app.settings.get('planInputs')) || {};
  const lakeId = saved.lakeId || 'thousand-island';
  const todayYmd = localDayBounds(new Date(), CHAIN.tz).ymd;
  const perLake = async id => ({ waterTempF: (await app.settings.get('waterTemp:' + id)) ?? '', clarity: (await app.settings.get('clarity:' + id)) || 'clear' });
  // inputs hold only what Truman typed; blank means "use the forecast"
  const inputs = { dateYmd: saved.dateYmd && saved.dateYmd >= todayYmd ? saved.dateYmd : todayYmd, lakeId, ...await perLake(lakeId), sky: saved.sky || '', windMph: saved.windMph ?? '', windCompass: saved.windCompass || '', pressureTrend: saved.pressureTrend || '', presentation: saved.presentation || 'any' };
  const fcFor = () => app.forecast ? conditionsAt(app.forecast, forecastKey(inputs.dateYmd)) : null; // null past the forecast horizon
  let fc = fcFor();
  const fcText = () => {
    if (fc) return `Forecast ${app.forecast.source}, ${fc.forecastAgeMin} min old, for ${inputs.dateYmd === todayYmd ? 'this hour' : 'noon that day'}: ${fc.tempF ?? '?'}°F air, wind ${fc.windMph != null ? Math.round(fc.windMph) : '?'} mph from ${fc.windCompass || '?'}, pressure ${fc.pressureInHg ?? '?'} inHg ${fc.trend}. Boxes marked "forecast" use it; type over any of them.`;
    return app.forecast ? 'No forecast for this date. Fill the boxes from what you see.' : 'No forecast. Fill the boxes from what you see.';
  };
  const fcLine = h('p', { class: 'reason' }, fcText());
  const results = h('div');
  const tags = {};
  const field = (label, el, name) => { const tag = name ? (tags[name] = h('span', { class: 'badge' })) : null; return h('div', {}, h('label', {}, label, tag), el); };
  const sel = (name, opts, val, labels = {}) => h('select', { name, onchange: e => { inputs[name] = e.target.value; applyFill(); } }, opts.map(o => h('option', { value: o, selected: o === val ? true : null }, labels[o] || o || 'from forecast')));
  const num = (name, val, ph) => h('input', { name, type: 'number', inputmode: 'decimal', placeholder: ph, value: val, oninput: e => { inputs[name] = e.target.value === '' ? '' : Number(e.target.value); if (FILLED.includes(name)) applyFill(e.target); }, onchange: () => { if (FILLED.includes(name)) applyFill(); } });

  // show the forecast value in every blank box, and say where each value came from
  function applyFill(skipEl) {
    fc = fcFor();
    fcLine.textContent = fcText();
    const fill = fillConditions(inputs, fc);
    for (const name of FILLED) {
      const el = form.querySelector(`[name=${name}]`), f = fill[name];
      if (el && el !== skipEl) el.value = f.value ?? '';
      tags[name].textContent = f.source || '';
    }
  }

  const gpsLine = h('p', { class: 'reason' }, app.pos ? 'GPS position kept from your last tap.' : '');
  async function useLocation() {
    gpsLine.textContent = 'Finding you…';
    const pos = await geo();
    if (!pos) { gpsLine.textContent = 'No GPS. Allow location for this site in Settings, or pick the lake.'; return; }
    app.pos = pos;
    const r = lakeAt(app.content.lakeOutlines, lakes, pos);
    if (!r.lakeId) { gpsLine.textContent = 'GPS: you are outside the chain. Lake unchanged.'; return; }
    inputs.lakeId = r.lakeId;
    Object.assign(inputs, await perLake(r.lakeId));
    form.querySelector('[name=lakeId]').value = r.lakeId;
    form.querySelector('[name=waterTempF]').value = inputs.waterTempF;
    form.querySelector('[name=clarity]').value = inputs.clarity;
    const name = app.index.lakeById[r.lakeId].name;
    gpsLine.textContent = r.inside ? `GPS: ${name}.` : `GPS: near ${name}, ${Math.round(r.distanceM * 3.28084)} ft off the water.`;
  }

  const form = h('div', { class: 'card' },
    h('h2', {}, 'Plan an outing'),
    field('Lake', h('select', { name: 'lakeId', onchange: async e => { inputs.lakeId = e.target.value; Object.assign(inputs, await perLake(inputs.lakeId)); form.querySelector('[name=waterTempF]').value = inputs.waterTempF; form.querySelector('[name=clarity]').value = inputs.clarity; } }, lakes.map(l => h('option', { value: l.id, selected: l.id === inputs.lakeId ? true : null }, l.name + (l.boundaryWater ? ' (boundary, 50")' : ''))))),
    h('button', { class: 'secondary', onclick: useLocation }, 'Use my location'),
    gpsLine,
    field('Date', h('input', { type: 'date', value: inputs.dateYmd, onchange: e => { inputs.dateYmd = e.target.value; applyFill(); } })),
    field('Water temperature °F, from the fish finder', num('waterTempF', inputs.waterTempF, 'e.g. 62')),
    h('div', { class: 'grid2' },
      field('Sky', sel('sky', ['', ...SKIES], inputs.sky, { sun: 'sun', partly: 'partly cloudy', overcast: 'overcast' }), 'sky'),
      field('Wind mph', num('windMph', inputs.windMph, ''), 'windMph'),
      field('Wind from', sel('windCompass', ['', ...COMPASS], inputs.windCompass), 'windCompass'),
      field('Pressure', sel('pressureTrend', ['', 'falling', 'steady', 'rising'], inputs.pressureTrend), 'pressureTrend'),
      field('Clarity', sel('clarity', CLARITY, inputs.clarity)),
      field('Presentation', sel('presentation', PRES, inputs.presentation)),
    ),
    fcLine,
    h('button', { onclick: () => build() }, 'Build the plan'),
  );
  applyFill();

  async function build() {
    fc = fcFor();
    const fill = fillConditions(inputs, fc);
    const date = new Date(inputs.dateYmd + 'T12:00:00');
    const lake = app.index.lakeById[inputs.lakeId];
    const cond = {
      lakeId: inputs.lakeId, lakeCharacter: lake.character, dateIso: inputs.dateYmd, month: +inputs.dateYmd.slice(5, 7),
      waterTempF: inputs.waterTempF === '' ? null : inputs.waterTempF,
      sky: fill.sky.value, windMph: fill.windMph.value, windCompass: fill.windCompass.value, pressureTrend: fill.pressureTrend.value,
      hoursSinceFront: fc?.hoursSinceFront ?? null,
      clarity: inputs.clarity, presentation: inputs.presentation, moonPhaseName: moonPhase(date).name,
      pressureInHg: fc?.pressureInHg ?? null, forecastAgeMin: fc?.forecastAgeMin ?? null,
    };
    await app.settings.set('planInputs', { ...inputs });
    if (cond.waterTempF != null) await app.settings.set('waterTemp:' + inputs.lakeId, cond.waterTempF);
    await app.settings.set('clarity:' + inputs.lakeId, inputs.clarity);
    const spots = await app.getSpots();
    const stats = logStatsForPlanner(await app.db.all('events'), await app.db.all('trips'));
    const aw = windows(date, CHAIN.lat, CHAIN.lon, CHAIN.tz), sun = sunTimes(date, CHAIN.lat, CHAIN.lon, CHAIN.tz);
    const p = runPlan({ content: app.content, spots, cond, astroWindows: aw, sun, logStats: stats });
    await app.settings.set('lastPlan', { cond, plan: { windows: p.windows.map(w => ({ kind: w.window.kind, label: w.window.label, start: w.window.start, end: w.window.end, score: w.score })), spots: p.spots.map(s => ({ id: s.spot.id, name: s.spot.name, score: s.score })), lures: p.lures.map(l => ({ id: l.lure.id, score: l.score })), watchFor: p.watchFor } });
    render(p, cond, lake, spots.filter(s => s.lakeId === cond.lakeId).length);
  }

  function reasons(list) { return list.slice(0, 3).flatMap(r => [h('p', { class: 'reason' }, r.pro), h('p', { class: 'job' }, 'Your job: ' + r.yourJob)]); }

  // where the spot is: distance and direction from the last GPS tap, and a pin in Apple Maps
  function whereIs(spot) {
    if (spot.lat == null || spot.lon == null) return null;
    return h('p', { class: 'reason' }, app.pos ? offsetText(app.pos, spot) + ' · ' : null, h('a', { class: 'link', href: appleMapsUrl(spot), target: '_blank', rel: 'noopener' }, 'Open in Maps'));
  }

  function render(p, cond, lake, spotCount) {
    results.replaceChildren(...[
      p.errors.length ? h('div', { class: 'card unverified' }, h('h3', {}, 'Fix the inputs'), p.errors.map(e => h('p', {}, e))) : null,
      !p.errors.length ? h('div', { class: 'card' }, h('h3', {}, lake.name), h('p', { class: 'reason' }, `Rule here: ${app.index.rulesForLake(lake.id).minSizeIn}" minimum. ${app.index.rulesForLake(lake.id).season}`), h('p', { class: 'eyebrow' }, 'Watch for'), h('p', { class: 'lead' }, p.watchFor), h('a', { class: 'link', href: '#lakes/' + lake.id }, 'Lake notes')) : null,
      !p.errors.length ? h('div', { class: 'card' }, h('h3', {}, 'Windows'), p.windows.filter(w => w.score > 0).slice(0, 5).map(w => h('div', { class: 'item' }, h('p', { class: 'big' }, `${fmtTime(w.window.start)} to ${fmtTime(w.window.end)}  ${w.window.label}`), w.stacks.length ? h('p', { class: 'reason' }, 'Stacks with ' + w.stacks.join(', ')) : null, reasons(w.reasons)))) : null,
      !p.errors.length ? h('div', { class: 'card' }, h('h3', {}, 'Spots'), spotCount === 0 ? h('p', {}, 'No spots on this lake yet. Import the spots pack in Settings or add spots from a trip.') : p.spots.map(s => h('div', { class: s.spot.verified ? 'item verified' : 'item unverified' }, h('p', { class: 'big' }, s.spot.name, h('span', { class: 'badge' }, app.index.spotTypeById[s.spot.type]?.name || s.spot.type), s.spot.verified ? null : h('span', { class: 'badge warn' }, 'unverified')), whereIs(s.spot), reasons(s.reasons)))) : null,
      !p.errors.length ? h('div', { class: 'card' }, h('h3', {}, 'Lures'), p.lures.map(l => h('div', { class: 'item' }, h('p', { class: 'big' }, l.lure.example), h('p', {}, l.lure.retrieve), reasons(l.reasons)))) : null,
      !p.errors.length ? h('button', { onclick: () => { location.hash = '#trip/new'; } }, 'Start trip with this plan') : null,
    ].filter(Boolean));
  }
  return h('div', {}, form, results);
}
