import { h } from './dom.js';
import { toBackupJson, importJson, catchesToCsv, eventsToCsv } from '../export.js';
import { photosToFiles } from '../photos.js';

async function share(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  const a = h('a', { href: URL.createObjectURL(file), download: name }); document.body.appendChild(a); a.click(); a.remove();
}

export async function settingsView(app) {
  const events = await app.db.all('events'), trips = await app.db.all('trips'), spots = await app.getSpots(), photos = await app.db.all('photos');
  const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
  const lastExport = await app.settings.get('lastExport');
  const stale = !lastExport || Date.now() - new Date(lastExport) > 30 * 86400000;
  const msg = h('p', { class: 'reason' });
  const exportMsg = h('p', { class: 'reason' });
  const importInput = h('input', { type: 'file', accept: 'application/json,.json', onchange: async e => { try { const obj = JSON.parse(await e.target.files[0].text()); const r = await importJson(app.db, obj); msg.textContent = `Imported: ${r.added} added, ${r.updated} updated, ${r.skipped} kept as yours.`; } catch (err) { msg.textContent = 'Import failed: ' + err.message; } } });
  const stamp = () => app.settings.set('lastExport', new Date().toISOString());
  const spotForm = (() => { const f = h('div', {}, h('label', {}, 'Name'), h('input', { name: 'name' }), h('label', {}, 'Lake'), h('select', { name: 'lakeId' }, app.content.lakes.map(l => h('option', { value: l.id }, l.name))), h('label', {}, 'Type'), h('select', { name: 'type' }, app.content.spotTypes.map(t => h('option', { value: t.id }, t.name))), h('label', {}, 'Added by'), h('select', { name: 'addedBy' }, ['dad', 'truman'].map(v => h('option', { value: v }, v))), h('label', {}, 'Notes'), h('textarea', { name: 'notes' }), h('button', { onclick: async () => { const v = Object.fromEntries([...f.querySelectorAll('[name]')].map(el => [el.name, el.value])); const pos = await new Promise(res => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lon: p.coords.longitude }), () => res(null)) : res(null)); const lake = app.index.lakeById[v.lakeId]; await app.db.put('spots', { id: 'spot_' + Date.now(), lakeId: v.lakeId, name: v.name, lat: pos?.lat ?? lake.lat, lon: pos?.lon ?? lake.lon, type: v.type, notes: v.notes, addedBy: v.addedBy, verified: true, bestWind: [], tempBandsF: [], months: [], updatedAt: new Date().toISOString() }); msg.textContent = 'Spot saved' + (pos ? ' at your position.' : ' at the lake center (no GPS).'); } }, 'Save spot')); return f; })();
  return h('div', {},
    stale ? h('div', { class: 'card unverified' }, h('h3', {}, 'Export reminder'), h('p', {}, 'No export in the last 30 days. The log lives only on this phone.')) : null,
    h('div', { class: 'card' }, h('h3', {}, 'Your data'), h('p', {}, `${trips.length} trips · ${events.length} events · ${spots.length} spots (${spots.filter(s => s.verified).length} verified) · ${photos.length} photos`), est ? h('p', { class: 'reason' }, `Storage ${(est.usage / 1048576).toFixed(1)} MB of ${(est.quota / 1048576).toFixed(0)} MB. Persistent: ${await app.settings.get('persisted')}`) : null),
    h('div', { class: 'card' }, h('h3', {}, 'Export'), h('button', { onclick: async () => { await share('fieldbook-backup.json', JSON.stringify(await toBackupJson(app.db), null, 1), 'application/json'); stamp(); } }, 'Backup JSON'), h('button', { class: 'secondary', onclick: async () => { await share('lunge-log.csv', catchesToCsv({ events, trips, lakes: app.content.lakes, lures: app.content.lures }), 'text/csv'); stamp(); } }, 'Catches CSV (Lunge Log order)'), h('button', { class: 'secondary', onclick: async () => { await share('events.csv', eventsToCsv({ events, trips }), 'text/csv'); stamp(); } }, 'All events CSV'), h('button', { class: 'secondary', onclick: async () => { const files = photosToFiles(photos); if (!files.length) { exportMsg.textContent = 'No photos yet.'; return; } if (!navigator.canShare?.({ files })) { exportMsg.textContent = 'This browser cannot share these photos.'; return; } try { await navigator.share({ files, title: 'Cisco Musky photos' }); exportMsg.textContent = `Shared ${files.length} photos.`; } catch (err) { if (err.name !== 'AbortError') exportMsg.textContent = 'Share failed: ' + err.message; } } }, `Share photos (${photos.length})`), exportMsg),
    h('div', { class: 'card' }, h('h3', {}, 'Import'), h('p', { class: 'reason' }, 'A backup JSON, or the spots pack file. Your edited and verified spots are never overwritten.'), importInput, msg),
    h('div', { class: 'card' }, h('h3', {}, 'Add a spot by hand'), h('p', { class: 'reason' }, 'Dad\'s spots go here with his name on them.'), spotForm),
    h('div', { class: 'card' }, h('h3', {}, 'About'), h('p', { class: 'reason' }, 'Cisco Musky. Content sources are listed on each lesson and lake. Rules verified 2026-10-01. The 46-inch figure some sites show is a Master Angler award size, not a rule.')),
  );
}
