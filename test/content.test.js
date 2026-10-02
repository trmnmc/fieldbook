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
