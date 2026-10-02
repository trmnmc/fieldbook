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
