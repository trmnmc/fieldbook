import { PRECACHE, VERSION } from './js/precache-manifest.js';
const CACHE = 'fieldbook-' + VERSION;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', ...PRECACHE.map(p => './' + p)])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  // weather requests go straight to the network: the app stores the last good forecast in IndexedDB
  // with its real fetchedAt, so an offline fallback here would only hide the forecast's age
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
