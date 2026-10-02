import { PRECACHE, VERSION } from './js/precache-manifest.js';
const CACHE = 'fieldbook-' + VERSION;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', ...PRECACHE.map(p => './' + p)])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.hostname.includes('open-meteo') || url.hostname.includes('weather.gov')) {
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE + '-weather').then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
