export const STORES = ['trips', 'events', 'spots', 'photos', 'forecasts', 'settings'];

export function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function check(store, record) {
  if (!STORES.includes(store)) throw new Error('unknown store ' + store);
  if (record && (record.id === undefined || record.id === null)) throw new Error('record needs id');
}

export function createMemoryStore() {
  const maps = Object.fromEntries(STORES.map(s => [s, new Map()]));
  return {
    async get(store, id) { check(store); return maps[store].get(id); },
    async put(store, record) { check(store, record); maps[store].set(record.id, structuredClone(record)); return record; },
    async del(store, id) { check(store); maps[store].delete(id); },
    async all(store) { check(store); return [...maps[store].values()].map(v => structuredClone(v)); },
    async clear(store) { check(store); maps[store].clear(); },
  };
}

export function createIndexedDBStore(name = 'fieldbook', version = 1) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => { const db = req.result; for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' }); };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = (store, mode, fn) => new Promise((res, rej) => {
        check(store);
        const t = db.transaction(store, mode); const r = fn(t.objectStore(store));
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      resolve({
        get: (s, id) => tx(s, 'readonly', o => o.get(id)),
        put: (s, rec) => { check(s, rec); return tx(s, 'readwrite', o => o.put(rec)).then(() => rec); },
        del: (s, id) => tx(s, 'readwrite', o => o.delete(id)),
        all: s => tx(s, 'readonly', o => o.getAll()),
        clear: s => tx(s, 'readwrite', o => o.clear()),
      });
    };
  });
}
