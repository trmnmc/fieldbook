import { h, clear } from './ui/dom.js';
import { createIndexedDBStore } from './store.js';
import { loadContent, indexContent, validateContent } from './content.js';
import { fetchForecast } from './weather.js';
import { CHAIN } from './astro.js';
import { planView } from './ui/plan.js';
import { learnView, lakesView } from './ui/learn.js';
import { tripView } from './ui/trip.js';
import { settingsView } from './ui/settings.js';

const app = { db: null, content: null, index: null, forecast: null, views: {} };

app.settings = {
  async get(key, def = null) { const r = await app.db.get('settings', key); return r ? r.value : def; },
  async set(key, value) { await app.db.put('settings', { id: key, value, updatedAt: new Date().toISOString() }); },
};
app.getSpots = () => app.db.all('spots');

app.refreshForecast = async () => {
  try {
    const f = await fetchForecast((u, o) => fetch(u, o), CHAIN);
    app.forecast = f;
    await app.db.put('forecasts', { id: 'latest', ...f });
    status(`forecast ${f.source} just now`);
  } catch (e) {
    const cached = await app.db.get('forecasts', 'latest');
    if (cached) { app.forecast = cached; status(`forecast ${Math.round((Date.now() - new Date(cached.fetchedAt)) / 60000)} min old`); }
    else status('no forecast; enter conditions');
  }
};

function status(msg) { const el = document.getElementById('status'); if (el) el.textContent = msg; }

export function navigate(hash) {
  const [name, param] = (hash || '#plan').replace('#', '').split('/');
  const view = document.getElementById('view');
  clear(view);
  const fn = app.views[name] || app.views.plan;
  Promise.resolve(fn(app, param)).then(el => { clear(view); view.appendChild(el); }).catch(err => { clear(view); view.appendChild(h('div', { class: 'card' }, h('h2', {}, 'Something broke'), h('pre', {}, String(err?.stack || err)))); });
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + (name || 'plan')));
}
app.navigate = navigate;

async function boot() {
  app.views = { plan: planView, trip: tripView, learn: learnView, lakes: lakesView, settings: settingsView };
  app.db = await createIndexedDBStore();
  app.content = await loadContent(u => fetch(u));
  const errs = validateContent(app.content);
  if (errs.length) console.warn('content problems', errs);
  app.index = indexContent(app.content);
  if (navigator.storage?.persist) navigator.storage.persist().then(ok => app.settings.set('persisted', ok));
  window.addEventListener('hashchange', () => navigate(location.hash));
  app.forecastReady = app.refreshForecast();
  navigate(location.hash);
  if ('serviceWorker' in navigator) {
    document.getElementById('reload').onclick = () => location.reload();
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) document.getElementById('banner').hidden = false; }); });
    } catch (e) { console.warn('service worker not registered', e.message); }
  }
}
window.app = app;
boot();
