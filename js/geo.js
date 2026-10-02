// Geometry for GPS: which lake a position is on, and how far a spot is from the boat.
// Outline rings are [lon, lat] pairs, open (the last point does not repeat the first).

const R = 6371000;
const rad = d => d * Math.PI / 180;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distanceM(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function bearingCompass(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  const deg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8];
}

// nearest vertex of a ring; close enough for "near this lake" at the chain's scale
function ringDistanceM(pos, ring) {
  let best = Infinity;
  for (const [lon, lat] of ring) { const d = distanceM(pos, { lat, lon }); if (d < best) best = d; }
  return best;
}

export function lakeAt(outlines, lakes, pos, nearM = 800) {
  let nearest = null, nearestD = Infinity;
  for (const o of outlines.lakes) {
    if (!lakes.some(l => l.id === o.id)) continue;
    for (const ring of o.rings) {
      if (pointInRing([pos.lon, pos.lat], ring)) return { lakeId: o.id, inside: true, distanceM: 0 };
      const d = ringDistanceM(pos, ring);
      if (d < nearestD) { nearestD = d; nearest = o.id; }
    }
  }
  if (nearest && nearestD <= nearM) return { lakeId: nearest, inside: false, distanceM: Math.round(nearestD) };
  return { lakeId: null, inside: false, distanceM: nearest ? Math.round(nearestD) : null };
}

export function offsetText(from, to) {
  const m = distanceM(from, to), dir = bearingCompass(from, to);
  const mi = m / 1609.344;
  if (mi < 0.1) return `${Math.round(m * 3.28084 / 10) * 10} ft ${dir} of you`;
  return `${mi.toFixed(1)} mi ${dir} of you`;
}

export function appleMapsUrl({ lat, lon, name }) {
  return `https://maps.apple.com/?ll=${lat},${lon}&q=${encodeURIComponent(name || 'Spot')}`;
}
