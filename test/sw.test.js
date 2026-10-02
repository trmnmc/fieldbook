import { test } from 'node:test';
import assert from 'node:assert/strict';

// Minimal worker globals so sw.js can register its handlers in Node. No network: fetch throws.
const listeners = {};
globalThis.self = { addEventListener: (k, fn) => { listeners[k] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
globalThis.caches = { open: async () => ({ addAll: async () => {}, put: async () => {} }), keys: async () => [], delete: async () => true, match: async () => undefined };
globalThis.location = { origin: 'https://example.test' };
globalThis.fetch = async () => { throw new Error('no network in tests'); };
await import('../sw.js');

const fetchEvent = url => { const ev = { request: { url }, responded: false, respondWith(p) { this.responded = true; Promise.resolve(p).catch(() => {}); } }; listeners.fetch(ev); return ev; };

test('the worker leaves weather requests to the network so the app keeps one dated copy', () => {
  assert.equal(fetchEvent('https://api.open-meteo.com/v1/forecast?latitude=46.22').responded, false);
  assert.equal(fetchEvent('https://api.weather.gov/gridpoints/MQT/86,54/forecast/hourly').responded, false);
});

test('the worker answers same-origin requests and ignores other origins', () => {
  assert.equal(fetchEvent('https://example.test/js/app.js').responded, true);
  assert.equal(fetchEvent('https://cdn.example.org/x.js').responded, false);
});
