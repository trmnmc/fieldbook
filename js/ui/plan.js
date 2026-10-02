import { h } from './dom.js';
import { CHAIN, windows, sunTimes, moonPhase, fmtTime, localDayBounds } from '../astro.js';
import { conditionsAt } from '../weather.js';
import { plan as runPlan } from '../engine.js';
import { logStatsForPlanner } from '../log.js';

const SKIES = ['sun', 'partly', 'overcast'], CLARITY = ['clear', 'stained', 'dirty'], PRES = ['any', 'casting', 'trolling', 'suckers'];
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export async function planView(app) {
  if (app.forecastReady) await Promise.race([app.forecastReady, new Promise(r => setTimeout(r, 2500))]);
  const lakes = app.content.lakes;
  const saved = (await app.settings.get('planInputs')) || {};
  const lakeId = saved.lakeId || 'thousand-island';
  const todayYmd = localDayBounds(new Date(), CHAIN.tz).ymd;
  const inputs = { dateYmd: saved.dateYmd && saved.dateYmd >= todayYmd ? saved.dateYmd : todayYmd, lakeId, waterTempF: (await app.settings.get('waterTemp:' + lakeId)) ?? '', sky: saved.sky || '', windMph: saved.windMph ?? '', windCompass: saved.windCompass || '', pressureTrend: saved.pressureTrend || '', clarity: saved.clarity || 'clear', presentation: saved.presentation || 'any', hoursSinceFront: '' };
  const fcFor = () => app.forecast ? conditionsAt(app.forecast, inputs.dateYmd + 'T12:00') : null; // null past the forecast horizon
  let fc = fcFor();
  const fcText = () => fc ? `Forecast ${app.forecast.source}, ${fc.forecastAgeMin} min old: ${fc.tempF ?? '?'}°F air, wind ${fc.windMph ?? '?'} mph from ${fc.windCompass || '?'}, pressure ${fc.pressureInHg ?? '?'} inHg ${fc.trend}. Blank fields use it.` : app.forecast ? 'No forecast for this date. Fill the fields from what you see.' : 'No forecast. Fill the fields from what you see.';
  const fcLine = h('p', { class: 'reason' }, fcText());
  const results = h('div');
  const field = (label, el) => h('div', {}, h('label', {}, label), el);
  const sel = (name, opts, val, labels = {}) => h('select', { name, onchange: e => { inputs[name] = e.target.value; } }, opts.map(o => h('option', { value: o, selected: o === val ? true : null }, labels[o] || o || 'from forecast')));
  const num = (name, val, ph) => h('input', { name, type: 'number', inputmode: 'decimal', placeholder: ph, value: val, oninput: e => { inputs[name] = e.target.value === '' ? '' : Number(e.target.value); } });

  const form = h('div', { class: 'card' },
    h('h2', {}, 'Plan an outing'),
    field('Lake', h('select', { onchange: async e => { inputs.lakeId = e.target.value; inputs.waterTempF = (await app.settings.get('waterTemp:' + inputs.lakeId)) ?? ''; form.querySelector('[name=waterTempF]').value = inputs.waterTempF; } }, lakes.map(l => h('option', { value: l.id, selected: l.id === inputs.lakeId ? true : null }, l.name + (l.boundaryWater ? ' (boundary, 50")' : ''))))),
    field('Date', h('input', { type: 'date', value: inputs.dateYmd, onchange: e => { inputs.dateYmd = e.target.value; fc = fcFor(); fcLine.textContent = fcText(); } })),
    field('Water temperature °F, from the fish finder', num('waterTempF', inputs.waterTempF, 'e.g. 62')),
    h('div', { class: 'grid2' },
      field('Sky', sel('sky', ['', ...SKIES], inputs.sky, { sun: 'sun', partly: 'partly cloudy', overcast: 'overcast' })),
      field('Wind mph', num('windMph', inputs.windMph, fc?.windMph ?? 'forecast')),
      field('Wind from', sel('windCompass', ['', ...COMPASS], inputs.windCompass)),
      field('Pressure', sel('pressureTrend', ['', 'falling', 'steady', 'rising'], inputs.pressureTrend)),
      field('Clarity', sel('clarity', CLARITY, inputs.clarity)),
      field('Presentation', sel('presentation', PRES, inputs.presentation)),
    ),
    fcLine,
    h('button', { onclick: () => build() }, 'Build the plan'),
  );

  async function build() {
    fc = fcFor();
    const date = new Date(inputs.dateYmd + 'T12:00:00');
    const lake = app.index.lakeById[inputs.lakeId];
    const cond = {
      lakeId: inputs.lakeId, lakeCharacter: lake.character, dateIso: inputs.dateYmd, month: +inputs.dateYmd.slice(5, 7),
      waterTempF: inputs.waterTempF === '' ? null : inputs.waterTempF,
      sky: inputs.sky || fc?.sky || null, windMph: inputs.windMph === '' ? fc?.windMph ?? null : inputs.windMph,
      windCompass: inputs.windCompass || fc?.windCompass || null,
      pressureTrend: inputs.pressureTrend || (fc?.trend && fc.trend !== 'unknown' ? fc.trend : null), hoursSinceFront: fc?.hoursSinceFront ?? null,
      clarity: inputs.clarity, presentation: inputs.presentation, moonPhaseName: moonPhase(date).name,
      pressureInHg: fc?.pressureInHg ?? null, forecastAgeMin: fc?.forecastAgeMin ?? null,
    };
    await app.settings.set('planInputs', { ...inputs });
    if (cond.waterTempF != null) await app.settings.set('waterTemp:' + inputs.lakeId, cond.waterTempF);
    const spots = await app.getSpots();
    const stats = logStatsForPlanner(await app.db.all('events'), await app.db.all('trips'));
    const aw = windows(date, CHAIN.lat, CHAIN.lon, CHAIN.tz), sun = sunTimes(date, CHAIN.lat, CHAIN.lon, CHAIN.tz);
    const p = runPlan({ content: app.content, spots, cond, astroWindows: aw, sun, logStats: stats });
    await app.settings.set('lastPlan', { cond, plan: { windows: p.windows.map(w => ({ kind: w.window.kind, label: w.window.label, start: w.window.start, end: w.window.end, score: w.score })), spots: p.spots.map(s => ({ id: s.spot.id, name: s.spot.name, score: s.score })), lures: p.lures.map(l => ({ id: l.lure.id, score: l.score })), watchFor: p.watchFor } });
    render(p, cond, lake, spots.filter(s => s.lakeId === cond.lakeId).length);
  }

  function reasons(list) { return list.slice(0, 3).flatMap(r => [h('p', { class: 'reason' }, r.pro), h('p', { class: 'job' }, 'Your job: ' + r.yourJob)]); }

  function render(p, cond, lake, spotCount) {
    results.replaceChildren(...[
      p.errors.length ? h('div', { class: 'card unverified' }, h('h3', {}, 'Fix the inputs'), p.errors.map(e => h('p', {}, e))) : null,
      !p.errors.length ? h('div', { class: 'card' }, h('h3', {}, lake.name), h('p', { class: 'reason' }, `Rule here: ${app.index.rulesForLake(lake.id).minSizeIn}" minimum. ${app.index.rulesForLake(lake.id).season}`), h('p', { class: 'eyebrow' }, 'Watch for'), h('p', { class: 'lead' }, p.watchFor), h('a', { class: 'link', href: '#lakes/' + lake.id }, 'Lake notes')) : null,
      !p.errors.length ? h('div', { class: 'card' }, h('h3', {}, 'Windows'), p.windows.filter(w => w.score > 0).slice(0, 5).map(w => h('div', { class: 'item' }, h('p', { class: 'big' }, `${fmtTime(w.window.start)} to ${fmtTime(w.window.end)}  ${w.window.label}`), w.stacks.length ? h('p', { class: 'reason' }, 'Stacks with ' + w.stacks.join(', ')) : null, reasons(w.reasons)))) : null,
      !p.errors.length ? h('div', { class: 'card' }, h('h3', {}, 'Spots'), spotCount === 0 ? h('p', {}, 'No spots on this lake yet. Import the spots pack in Settings or add spots from a trip.') : p.spots.map(s => h('div', { class: s.spot.verified ? 'item verified' : 'item unverified' }, h('p', { class: 'big' }, s.spot.name, h('span', { class: 'badge' }, app.index.spotTypeById[s.spot.type]?.name || s.spot.type), s.spot.verified ? null : h('span', { class: 'badge warn' }, 'unverified')), reasons(s.reasons)))) : null,
      !p.errors.length ? h('div', { class: 'card' }, h('h3', {}, 'Lures'), p.lures.map(l => h('div', { class: 'item' }, h('p', { class: 'big' }, l.lure.example), h('p', {}, l.lure.retrieve), reasons(l.reasons)))) : null,
      !p.errors.length ? h('button', { onclick: () => { location.hash = '#trip/new'; } }, 'Start trip with this plan') : null,
    ].filter(Boolean));
  }
  return h('div', {}, form, results);
}
