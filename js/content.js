export const CHAIN_BBOX = { latMin: 46.15, latMax: 46.30, lonMin: -89.50, lonMax: -89.33 };
const FILES = ['sources', 'rules', 'lakes', 'spot-types', 'lures', 'patterns', 'lessons'];

export async function loadContent(fetchFn, base = 'content/') {
  const out = {};
  for (const f of FILES) {
    const r = await fetchFn(base + f + '.json');
    if (!r.ok) throw new Error('content load failed: ' + f);
    out[f === 'spot-types' ? 'spotTypes' : f] = await r.json();
  }
  return out;
}

const byId = arr => Object.fromEntries((arr || []).map(x => [x.id, x]));

export function indexContent(c) {
  const lakeById = byId(c.lakes), ruleById = byId(c.rules?.rulebooks || []);
  return {
    lakeById, lureById: byId(c.lures), lessonById: byId(c.lessons), patternById: byId(c.patterns), sourceById: byId(c.sources), spotTypeById: byId(c.spotTypes),
    rulesForLake: lakeId => ruleById[lakeById[lakeId]?.rulesId],
  };
}

export function validateContent(c, spots = []) {
  const errs = [];
  const src = new Set((c.sources || []).map(s => s.id));
  const needSources = (rec, label) => {
    if (!Array.isArray(rec.sources) || rec.sources.length === 0) {
      if (!(rec.reasoning === true)) errs.push(`${label} has no sources and is not marked reasoning`);
    } else for (const s of rec.sources) if (!src.has(s)) errs.push(`${label} cites unknown source ${s}`);
  };
  for (const s of c.sources || []) for (const k of ['id', 'title', 'publisher', 'url']) if (!s[k]) errs.push(`source ${s.id} missing ${k}`);
  const rb = new Set((c.rules?.rulebooks || []).map(r => r.id));
  for (const r of c.rules?.rulebooks || []) { for (const k of ['id', 'name', 'minSizeIn', 'season', 'verified']) if (r[k] === undefined) errs.push(`rulebook ${r.id} missing ${k}`); needSources(r, 'rulebook ' + r.id); }
  const lakeIds = new Set();
  for (const l of c.lakes || []) {
    lakeIds.add(l.id);
    for (const k of ['id', 'name', 'states', 'boundaryWater', 'lat', 'lon', 'rulesId']) if (l[k] === undefined) errs.push(`lake ${l.id} missing ${k}`);
    if (!rb.has(l.rulesId)) errs.push(`lake ${l.id} has unknown rulesId ${l.rulesId}`);
    needSources(l, 'lake ' + l.id);
  }
  const types = new Set((c.spotTypes || []).map(t => t.id));
  for (const t of c.spotTypes || []) if (!t.pro || !t.yourJob) errs.push(`spot type ${t.id} missing pro or yourJob`);
  for (const l of c.lures || []) { for (const k of ['id', 'family', 'example', 'tempBandsF', 'retrieve', 'speed', 'yourJob']) if (l[k] === undefined) errs.push(`lure ${l.id} missing ${k}`); }
  for (const p of c.patterns || []) { for (const k of ['id', 'name', 'when', 'favor', 'pro', 'yourJob']) if (p[k] === undefined) errs.push(`pattern ${p.id} missing ${k}`); needSources(p, 'pattern ' + p.id); }
  const lessonIds = new Set((c.lessons || []).map(l => l.id));
  for (const l of c.lessons || []) {
    for (const k of ['id', 'order', 'title', 'track', 'sections']) if (l[k] === undefined) errs.push(`lesson ${l.id} missing ${k}`);
    for (const s of l.sections || []) { if (!s.heading || !s.pro || !s.yourJob) errs.push(`lesson ${l.id} section "${s.heading}" missing heading, pro, or yourJob`); needSources(s, `lesson ${l.id} section "${s.heading}"`); for (const ref of s.links || []) if (!lessonIds.has(ref)) errs.push(`lesson ${l.id} links to unknown lesson ${ref}`); }
  }
  for (const s of spots) {
    for (const k of ['id', 'lakeId', 'name', 'lat', 'lon', 'type', 'addedBy', 'verified']) if (s[k] === undefined) errs.push(`spot ${s.id} missing ${k}`);
    if (!lakeIds.has(s.lakeId)) errs.push(`spot ${s.id} has unknown lake ${s.lakeId}`);
    if (!types.has(s.type)) errs.push(`spot ${s.id} has unknown type ${s.type}`);
    if (s.lat < CHAIN_BBOX.latMin || s.lat > CHAIN_BBOX.latMax || s.lon < CHAIN_BBOX.lonMin || s.lon > CHAIN_BBOX.lonMax) errs.push(`spot ${s.id} is outside the chain`);
    if (s.addedBy === 'seed' && !s.source) errs.push(`seed spot ${s.id} has no source`);
  }
  return errs;
}
