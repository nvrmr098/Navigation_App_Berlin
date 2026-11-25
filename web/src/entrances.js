/* Entrances and exits of a station: OpenStreetMap nodes (railway=subway_entrance, train_station_entrance) through the public Overpass API.
 * Data (c) OpenStreetMap contributors, ODbL. Names and numbers are only there where mappers added them, so everything is optional. */
import { meters } from './walk.js';

const HOSTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const mem = new Map();

async function ask(q) {
  let err;
  for (const h of HOSTS) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 9000);
    try { const r = await fetch(h + '?data=' + encodeURIComponent(q), { signal: ctl.signal }); if (!r.ok) throw new Error('http ' + r.status); return await r.json(); } catch (e) { err = e; } finally { clearTimeout(t); }
  }
  throw err;
}

/* entrances around a point, nearest first. radius in metres */
export async function entrancesAround(lat, lng, radius) {
  const r = radius || 260, key = lat.toFixed(4) + ',' + lng.toFixed(4) + ',' + r;
  if (mem.has(key)) return mem.get(key);
  try { const o = JSON.parse(localStorage.getItem('bl_en:' + key) || 'null'); if (o && Date.now() - o.t < 7 * 864e5) { mem.set(key, o.d); return o.d; } } catch (e) { /* none */ }
  const q = '[out:json][timeout:9];(node["railway"="subway_entrance"](around:' + r + ',' + lat + ',' + lng + ');node["railway"="train_station_entrance"](around:' + r + ',' + lat + ',' + lng + ');node["entrance"]["public_transport"](around:' + r + ',' + lat + ',' + lng + '););out body;';
  const j = await ask(q);
  const seen = {};
  const list = (j.elements || []).filter((e) => e.type === 'node' && e.lat != null).map((e) => {
    const t = e.tags || {}, lo = e.lon != null ? e.lon : e.lng; // Overpass writes lon
    return { lat: e.lat, lng: lo, ref: t.ref || '', name: t.name || t['name:de'] || '', wheelchair: t.wheelchair || '', level: t.level || '', desc: t.description || '', m: Math.round(meters({ lat, lng }, { lat: e.lat, lng: lo })) };
  }).filter((e) => { const k = e.lat.toFixed(5) + e.lng.toFixed(5); if (seen[k]) return false; seen[k] = 1; return true; }).sort((a, b) => a.m - b.m);
  mem.set(key, list);
  try { localStorage.setItem('bl_en:' + key, JSON.stringify({ t: Date.now(), d: list })); } catch (e) { /* storage full */ }
  return list;
}

/* the entrance closest to a person (arriving) or a place (leaving), optionally step free only */
export function nearestTo(list, p, stepFree) {
  let best = null, bd = 1e9;
  list.forEach((e) => { if (stepFree && e.wheelchair === 'no') return; const d = meters(p, e); if (d < bd) { bd = d; best = e; } });
  return best ? { e: best, m: Math.round(bd) } : null;
}
export const entranceLabel = (e, t) => (e.name || (e.ref ? t('entRef', { r: e.ref }) : t('entUnnamed')));
