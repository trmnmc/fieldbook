import { h } from './dom.js';

export function learnView(app, lessonId) {
  const { lessons } = app.content;
  if (!lessonId) return h('div', {}, h('div', { class: 'intro' }, h('h2', {}, 'Lessons'), h('p', { class: 'reason' }, 'Pro text is for Dad. "Your job" lines are for you.')), lessons.sort((a, b) => a.order - b.order).map(l => h('a', { href: '#learn/' + l.id, class: 'card' }, h('h3', {}, `${l.order}. ${l.title}`), h('span', { class: 'badge' }, l.track))));
  const l = app.index.lessonById[lessonId];
  if (!l) return h('div', { class: 'card' }, 'No such lesson.');
  return h('div', {}, h('a', { class: 'link back', href: '#learn' }, '← Lessons'), h('h2', {}, l.title), l.sections.map(s => h('div', { class: 'card' }, h('h3', {}, s.heading), s.pro.split('\n\n').map(p => h('p', {}, p)), h('p', { class: 'job' }, 'Your job: ' + s.yourJob), s.sources?.length ? h('p', { class: 'reason' }, 'Sources: ', s.sources.map(id => h('a', { href: app.index.sourceById[id]?.url, target: '_blank', class: 'link' }, app.index.sourceById[id]?.publisher || id))) : h('p', { class: 'reason' }, 'Reasoning, not sourced.'), (s.links || []).map(id => h('a', { class: 'link', href: '#learn/' + id }, 'See: ' + (app.index.lessonById[id]?.title || id))))));
}

export function lakesView(app, lakeId) {
  const lakes = app.content.lakes;
  if (!lakeId) return h('div', {}, h('div', { class: 'intro' }, h('h2', {}, 'The Cisco Chain'), h('p', { class: 'reason' }, '15 lakes, about 4,000 acres. Three cross into Wisconsin and carry the 50-inch rule.')), lakes.map(l => h('a', { href: '#lakes/' + l.id, class: 'card' }, h('h3', {}, l.name, l.boundaryWater ? h('span', { class: 'badge warn' }, 'boundary 50"') : null), h('p', { class: 'reason' }, [l.acres ? l.acres + ' ac' : null, l.maxDepthFt ? l.maxDepthFt + ' ft max' : null, l.character.replace(/_/g, ' ')].filter(Boolean).join(' · ')))));
  const l = app.index.lakeById[lakeId];
  if (!l) return h('div', { class: 'card' }, 'No such lake.');
  const r = app.index.rulesForLake(l.id);
  const row = (k, v) => v == null || v === '' ? null : h('p', {}, h('b', {}, k + ': '), String(v));
  return h('div', {}, h('a', { class: 'link back', href: '#lakes' }, '← Lakes'), h('h2', {}, l.name),
    h('div', { class: 'card' }, row('States', l.states.join(', ')), row('Acres', l.acres + (l.acresNote ? ` (${l.acresNote})` : '')), row('Max depth', l.maxDepthFt ? l.maxDepthFt + ' ft' + (l.maxDepthNote ? ` (${l.maxDepthNote})` : '') : null), row('Clarity', l.secchiFt ? l.secchiFt + ' ft Secchi' : null), row('Thermocline', l.thermoclineFt ? l.thermoclineFt.join(' to ') + ' ft in summer' : null), row('Character', l.character.replace(/_/g, ' ')), row('Structure', l.structureSummary), row('Forage', l.forage.join(', ')), row('Connections', l.connections.map(c => `${c.kind} ${app.index.lakeById[c.to]?.name}`).join('; '))),
    h('div', { class: 'card' }, h('h3', {}, 'Musky status'), row('Wisconsin class', l.muskyStatus.wiClass ? `${l.muskyStatus.wiClass}, category ${l.muskyStatus.wiCategory}` : null), row('Michigan stocking', l.muskyStatus.miStocking), row('Notes', l.muskyStatus.notes)),
    h('div', { class: 'card' }, h('h3', {}, 'Rules: ' + r.name), row('Minimum size', r.minSizeIn + ' inches'), row('Season', r.season), row('Limit', r.limit), row('Registration', r.registration), row('License', r.license), row('Pike', r.pike), h('p', { class: 'reason' }, 'Verified ' + r.verified)),
    l.launches.length ? h('div', { class: 'card' }, h('h3', {}, 'Launches'), l.launches.map(x => h('p', {}, h('b', {}, x.name), x.surface ? ` (${x.surface})` : '', x.notes ? '. ' + x.notes : ''))) : null,
    l.mapImage ? h('div', { class: 'card' }, h('h3', {}, 'Depth map'), h('img', { src: l.mapImage, class: 'map', alt: l.name + ' depth map' })) : h('p', { class: 'reason' }, 'No depth map on file yet.'),
    h('p', { class: 'reason' }, 'Sources: ' + l.sources.map(id => app.index.sourceById[id]?.publisher || id).join('; ')));
}
