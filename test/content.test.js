import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { loadContent, indexContent, validateContent, CHAIN_BBOX } from '../js/content.js';

const fetchFn = async url => ({ ok: true, json: async () => JSON.parse(await readFile(new URL('../' + url, import.meta.url), 'utf8')) });

test('spot-types.json loads and has the vocabulary from the spec', async () => {
  const c = await loadContent(fetchFn);
  const ids = c.spotTypes.map(t => t.id);
  for (const t of ['weed_flat', 'weed_edge', 'point', 'inside_turn', 'saddle', 'hump', 'break', 'neck', 'inlet', 'outlet', 'rock', 'wood', 'island', 'shoal']) assert.ok(ids.includes(t), t);
});

test('validateContent reports a spot outside the chain and a missing source', async () => {
  const c = await loadContent(fetchFn);
  const errs = validateContent(c, [{ id: 'x', lakeId: c.lakes[0]?.id || 'thousand-island', name: 'Far', lat: 45.0, lon: -89.4, type: 'point', addedBy: 'seed', verified: false, source: 'nope' }]);
  assert.ok(errs.some(e => e.includes('outside')), errs.join('\n'));
  assert.ok(CHAIN_BBOX.latMin < CHAIN_BBOX.latMax);
});

test('private spots seed validates when present', async () => {
  const p = new URL('../private/spots-seed.json', import.meta.url);
  if (!existsSync(p)) return;
  const c = await loadContent(fetchFn);
  const pack = JSON.parse(await readFile(p, 'utf8'));
  assert.equal(pack.kind, 'spots-pack');
  assert.deepEqual(validateContent(c, pack.spots), []);
});

test('rules: 15 lakes map to two rulebooks with the verified sizes', async () => {
  const c = await loadContent(fetchFn);
  assert.equal(c.lakes.length, 15);
  const ix = indexContent(c);
  assert.equal(ix.rulesForLake('thousand-island').minSizeIn, 42);
  assert.equal(ix.rulesForLake('fishhawk').minSizeIn, 42);
  for (const id of ['big', 'mamie', 'west-bay']) { assert.equal(ix.rulesForLake(id).minSizeIn, 50); assert.equal(ix.lakeById[id].boundaryWater, true); }
  assert.equal(c.lakes.filter(l => l.boundaryWater).length, 3);
  assert.ok(c.rules.rulebooks.every(r => r.minSizeIn !== 46), 'the 46 inch Master Angler figure must never be a rule');
  assert.ok(JSON.stringify(c.rules.notes).includes('Master Angler'));
});

test('lakes: every lake sits inside the bounding box and cites sources', async () => {
  const c = await loadContent(fetchFn);
  for (const l of c.lakes) {
    assert.ok(l.lat > CHAIN_BBOX.latMin && l.lat < CHAIN_BBOX.latMax && l.lon > CHAIN_BBOX.lonMin && l.lon < CHAIN_BBOX.lonMax, l.id);
    assert.ok(l.sources.length > 0, l.id);
  }
  assert.deepEqual(validateContent(c), []);
});

test('no content file contains a spot location', async () => {
  const c = await loadContent(fetchFn);
  assert.ok(!('spots' in c));
  for (const l of c.lakes) assert.ok(!('spots' in l), l.id);
});

test('lures cover every family and carry temperature bands', async () => {
  const c = await loadContent(fetchFn);
  const fams = new Set(c.lures.map(l => l.family));
  for (const f of ['bucktail', 'topwater', 'glider', 'jerkbait', 'crankbait', 'rubber', 'spinnerbait', 'sucker']) assert.ok(fams.has(f), f);
  for (const l of c.lures) { assert.ok(Array.isArray(l.tempBandsF) && l.tempBandsF.every(b => b.length === 2 && b[0] < b[1]), l.id); assert.ok(['slow', 'medium', 'fast', 'burn'].includes(l.speed), l.id); }
});

test('patterns: at least 12 fall rules, each with pro, yourJob, and sources or reasoning', async () => {
  const c = await loadContent(fetchFn);
  const fall = c.patterns.filter(p => (p.when.months || [10]).some(m => m === 10 || m === 11));
  assert.ok(fall.length >= 12, 'fall patterns: ' + fall.length);
  for (const p of c.patterns) {
    assert.ok(p.pro.length > 40 && p.yourJob.length > 10, p.id);
    for (const k of Object.keys(p.favor)) assert.ok(['windows', 'spotTypes', 'lureFamilies', 'speed'].includes(k), p.id + ' favor ' + k);
    for (const [k, v] of Object.entries(p.favor.lureFamilies || {})) assert.ok(c.lures.some(l => l.family === k) && Number.isInteger(v) && v >= 1 && v <= 5, p.id + ' ' + k);
    for (const k of Object.keys(p.favor.spotTypes || {})) assert.ok(c.spotTypes.some(t => t.id === k), p.id + ' spot type ' + k);
  }
  assert.deepEqual(validateContent(c), []);
});

test('lessons: twelve chapters in order, fall and next at full depth', async () => {
  const c = await loadContent(fetchFn);
  assert.deepEqual(c.lessons.map(l => l.id), ['fish', 'chain', 'seasons', 'clock', 'weather', 'structure', 'lures', 'presentation', 'gear', 'rules', 'first-mate', 'next']);
  assert.deepEqual(c.lessons.map(l => l.order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const words = s => s.split(/\s+/).length;
  const depth = id => c.lessons.find(l => l.id === id).sections.reduce((n, s) => n + words(s.pro), 0);
  assert.ok(depth('seasons') >= 900, 'seasons words ' + depth('seasons'));
  assert.ok(depth('chain') >= 600, 'chain words ' + depth('chain'));
  assert.ok(depth('next') >= 500, 'next words ' + depth('next'));
  for (const l of c.lessons) { assert.ok(l.sections.length >= 2, l.id); for (const s of l.sections) assert.ok(words(s.pro) >= 60, `${l.id} / ${s.heading} is thin`); }
  const rulesText = JSON.stringify(c.lessons.find(l => l.id === 'rules'));
  assert.ok(rulesText.includes('42') && rulesText.includes('50'));
  if (/46/.test(rulesText)) assert.ok(/Master Angler/.test(rulesText), '46 may appear only as the Master Angler award size');
  assert.deepEqual(validateContent(c), []);
});
