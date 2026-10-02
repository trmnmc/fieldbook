import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pointInRing, lakeAt, distanceM, offsetText, appleMapsUrl } from '../js/geo.js';

const lakes = JSON.parse(await readFile(new URL('../content/lakes.json', import.meta.url), 'utf8'));
const outlines = JSON.parse(await readFile(new URL('../content/lake-outlines.json', import.meta.url), 'utf8'));

test('lake-outlines.json has one outline per lake, and every lake center is inside its own outline', () => {
  assert.equal(outlines.kind, 'lake-outlines');
  assert.equal(outlines.source, 'osm-geometry');
  assert.equal(outlines.lakes.length, lakes.length);
  for (const l of lakes) {
    const o = outlines.lakes.find(x => x.id === l.id);
    assert.ok(o, l.id);
    assert.ok(o.rings.some(r => pointInRing([l.lon, l.lat], r)), l.id + ' center outside its outline');
  }
});

test('pointInRing: inside, outside, and the ring need not repeat its first point', () => {
  const square = [[0, 0], [1, 0], [1, 1], [0, 1]];
  assert.equal(pointInRing([0.5, 0.5], square), true);
  assert.equal(pointInRing([1.5, 0.5], square), false);
});

test('lakeAt: a point in the middle of West Bay is inside West Bay', () => {
  const r = lakeAt(outlines, lakes, { lat: 46.2036, lon: -89.4282 });
  assert.equal(r.lakeId, 'west-bay');
  assert.equal(r.inside, true);
});

test('lakeAt: a point on shore near a lake is near that lake, not inside', () => {
  // 300 m east of the Fishhawk center, past its east shore
  const r = lakeAt(outlines, lakes, { lat: 46.2164, lon: -89.4141 + 0.012 });
  assert.equal(r.inside, false);
  assert.ok(r.lakeId, 'names the nearest lake');
  assert.ok(r.distanceM > 0 && r.distanceM < 800, String(r.distanceM));
});

test('lakeAt: a point far from the chain returns no lake', () => {
  const r = lakeAt(outlines, lakes, { lat: 45.0, lon: -89.4 });
  assert.equal(r.lakeId, null);
  assert.equal(r.inside, false);
});

test('distanceM and offsetText: one km due north reads as 0.6 mi N', () => {
  const from = { lat: 46.2, lon: -89.4 }, to = { lat: 46.2 + 1000 / 111320, lon: -89.4 };
  assert.ok(Math.abs(distanceM(from, to) - 1000) < 5);
  assert.equal(offsetText(from, to), '0.6 mi N of you');
});

test('offsetText: under a tenth of a mile reads in feet', () => {
  const from = { lat: 46.2, lon: -89.4 }, to = { lat: 46.2, lon: -89.4 + 60 / (111320 * Math.cos(46.2 * Math.PI / 180)) };
  assert.equal(offsetText(from, to), '200 ft E of you');
});

test('appleMapsUrl pins the spot with its name', () => {
  assert.equal(appleMapsUrl({ lat: 46.2036, lon: -89.4282, name: 'North weed edge' }), 'https://maps.apple.com/?ll=46.2036,-89.4282&q=North%20weed%20edge');
});
