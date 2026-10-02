import { newId } from './store.js';

export function fitWithin(w, h, maxEdge) {
  const s = Math.min(1, maxEdge / Math.max(w, h));
  return { w: Math.round(w * s), h: Math.round(h * s) };
}

export async function downscaleImage(file, maxEdge = 1600, quality = 0.7) {
  const bmp = await createImageBitmap(file);
  const { w, h } = fitWithin(bmp.width, bmp.height, maxEdge);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  return new Promise(res => c.toBlob(res, 'image/jpeg', quality));
}

// one named File per stored photo, so the share sheet gets them all in a single call
export function photosToFiles(photos) {
  return photos.map(p => new File([p.blob], `${p.eventId}-${p.role}.jpg`, { type: 'image/jpeg' }));
}

export async function savePhoto(db, eventId, blob, role = 'catch') {
  const rec = { id: newId('photo'), eventId, role, blob, createdAt: new Date().toISOString() };
  await db.put('photos', rec);
  return rec;
}
