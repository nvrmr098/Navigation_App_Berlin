/* Street part of a trip: address search and walking routes.
 * Address search: Photon (photon.komoot.io), OpenStreetMap data (ODbL).
 * Walking routes: OpenStreetMap Germany routing (routing.openstreetmap.de), OpenStreetMap data (ODbL).
 * Both are public services. If they are not reachable the app falls back to a straight line estimate. */
import { getLang } from './i18n.js';

export const toRad = (d) => d * Math.PI / 180;
export function meters(a, b) {
  const dl = toRad(b.lat - a.lat), dn = toRad(b.lng - a.lng);
  const x = Math.sin(dl / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dn / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(x));
}
export function bearing(a, b) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
export const angDiff = (a, b) => ((b - a + 540) % 360) - 180;
export const walkMin = (m) => Math.max(1, Math.round(m / 80));

async function getJson(url, ms) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms || 8000);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error('http ' + r.status); return await r.json(); } finally { clearTimeout(t); }
}

const cache = {};
export async function geocode(q) {
  const key = q.trim().toLowerCase(); if (cache[key]) return cache[key];
  const lang = ['de', 'en', 'fr', 'it'].indexOf(getLang()) > -1 ? getLang() : 'en';
  const j = await getJson('https://photon.komoot.io/api/?q=' + encodeURIComponent(q.trim()) + '&limit=5&lat=52.52&lon=13.405&bbox=13.08,52.33,13.78,52.68&lang=' + lang, 7000);
  const out = (j.features || []).map((f) => {
    const p = f.properties || {}, c = f.geometry.coordinates;
    const street = p.street ? p.street + (p.housenumber ? ' ' + p.housenumber : '') : '';
    const name = p.name || street || p.city || '';
    const sub = [p.name && street ? street : '', p.district || p.locality || '', p.postcode || ''].filter(Boolean).join(', ');
    return { place: true, name, sub, lat: c[1], lng: c[0] };
  }).filter((x) => x.name);
  cache[key] = out; return out;
}

/* walking route; pts are [lng, lat]. est = true when only a straight line estimate was possible */
export async function walkRoute(a, b) {
  try {
    const j = await getJson('https://routing.openstreetmap.de/routed-foot/route/v1/foot/' + a.lng + ',' + a.lat + ';' + b.lng + ',' + b.lat + '?overview=full&geometries=geojson', 8000);
    const r = j.routes && j.routes[0]; if (!r) throw new Error('none');
    return { pts: r.geometry.coordinates, m: Math.round(r.distance), min: Math.max(1, Math.round(r.duration / 60)), est: false };
  } catch (e) {
    const m = Math.round(meters(a, b) * 1.25);
    return { pts: [[a.lng, a.lat], [b.lng, b.lat]], m, min: walkMin(m), est: true };
  }
}

/* nearest point of a polyline: index of the vertex, distance in metres, remaining metres to the end */
export function along(pts, pos) {
  let bi = 0, bd = 1e12;
  for (let i = 0; i < pts.length; i++) { const d = meters(pos, { lat: pts[i][1], lng: pts[i][0] }); if (d < bd) { bd = d; bi = i; } }
  let rem = 0;
  for (let i = bi; i < pts.length - 1; i++) rem += meters({ lat: pts[i][1], lng: pts[i][0] }, { lat: pts[i + 1][1], lng: pts[i + 1][0] });
  return { i: bi, d: bd, rem };
}

/* direction check while walking: compares the way you move with the way the route goes */
export function checkDirection(pts, idx, from, to) {
  const moved = meters(from, to); if (moved < 6) return null;
  const mv = bearing(from, to), j = Math.min(pts.length - 1, idx + 3), i0 = Math.min(idx, pts.length - 2);
  const rb = bearing({ lat: pts[i0][1], lng: pts[i0][0] }, { lat: pts[j][1], lng: pts[j][0] });
  const diff = angDiff(mv, rb), a = Math.abs(diff);
  return { state: a < 55 ? 'ok' : a > 115 ? 'bad' : 'turn', rel: diff };
}

/* point about `ahead` metres further along the route from the nearest vertex (steadier than the next vertex) */
export function lookAhead(pts, idx, pos, ahead) {
  let acc = meters(pos, { lat: pts[idx][1], lng: pts[idx][0] });
  let j = idx;
  while (acc < ahead && j < pts.length - 1) { acc += meters({ lat: pts[j][1], lng: pts[j][0] }, { lat: pts[j + 1][1], lng: pts[j + 1][0] }); j++; }
  return { lat: pts[j][1], lng: pts[j][0] };
}

/* instruction from the way you face (heading) and the bearing to the point ahead */
export function instruction(heading, targetBearing) {
  const rel = angDiff(heading, targetBearing), a = Math.abs(rel);
  const side = rel < 0 ? 'left' : 'right';
  if (a < 22) return { key: 'straight', rel, state: 'ok' };
  if (a < 60) return { key: 'slight_' + side, rel, state: 'ok' };
  if (a < 135) return { key: 'turn_' + side, rel, state: 'turn' };
  return { key: 'back', rel, state: 'bad' };
}
