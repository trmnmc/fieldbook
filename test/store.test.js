import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore, STORES, newId } from '../js/store.js';

test('memory store put/get/all/del/clear', async () => {
  const db = createMemoryStore();
  await db.put('spots', { id: 's1', name: 'A' });
  await db.put('spots', { id: 's2', name: 'B' });
  assert.equal((await db.get('spots', 's1')).name, 'A');
  assert.equal((await db.all('spots')).length, 2);
  await db.del('spots', 's1');
  assert.equal(await db.get('spots', 's1'), undefined);
  await db.clear('spots');
  assert.equal((await db.all('spots')).length, 0);
  await assert.rejects(db.put('nope', { id: 'x' }));
  await assert.rejects(db.put('spots', { name: 'no id' }));
});

test('STORES and newId', () => {
  assert.deepEqual(STORES, ['trips', 'events', 'spots', 'photos', 'forecasts', 'settings']);
  const a = newId('evt'), b = newId('evt');
  assert.ok(a.startsWith('evt_') && a !== b);
});
