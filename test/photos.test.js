import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitWithin } from '../js/photos.js';
import * as photosMod from '../js/photos.js';
test('fitWithin scales the long edge to maxEdge and keeps small images', () => {
  assert.deepEqual(fitWithin(4000, 3000, 1600), { w: 1600, h: 1200 });
  assert.deepEqual(fitWithin(3000, 4000, 1600), { w: 1200, h: 1600 });
  assert.deepEqual(fitWithin(800, 600, 1600), { w: 800, h: 600 });
});

test('photosToFiles makes one named File per photo so they share in a single call', () => {
  const files = photosMod.photosToFiles([{ eventId: 'evt_1', role: 'catch', blob: new Blob(['a'], { type: 'image/jpeg' }) }, { eventId: 'evt_1', role: 'marks', blob: new Blob(['b'], { type: 'image/jpeg' }) }]);
  assert.equal(files.length, 2);
  assert.deepEqual(files.map(f => f.name), ['evt_1-catch.jpg', 'evt_1-marks.jpg']);
  assert.ok(files.every(f => f instanceof File && f.type === 'image/jpeg'));
});
