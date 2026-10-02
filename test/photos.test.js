import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitWithin } from '../js/photos.js';
test('fitWithin scales the long edge to maxEdge and keeps small images', () => {
  assert.deepEqual(fitWithin(4000, 3000, 1600), { w: 1600, h: 1200 });
  assert.deepEqual(fitWithin(3000, 4000, 1600), { w: 1200, h: 1600 });
  assert.deepEqual(fitWithin(800, 600, 1600), { w: 800, h: 600 });
});
