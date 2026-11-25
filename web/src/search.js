/* One search over everything a person can type: S/U stations, regional train (RE/RB), tram and bus stops (local VBB data,
 * works offline) and streets, addresses and places (Photon / OpenStreetMap, needs internet). */
import { R, ST } from './net.js';
import { loadStops } from './modestops.js';
import { geocode } from './walk.js';
import { distKm } from './geo.js';

const CENTER = { lat: 52.5208, lng: 13.4095 };
const nrm = (s) => R.norm(s || '');
const normd = new WeakMap();
const nOf = (o) => { let n = normd.get(o); if (n == null) { n = nrm(o.name); normd.set(o, n); } return n; };

function score(n, qn, toks) {
  if (n === qn) return 200;
  if (n.indexOf(qn) === 0) return 120;
  const ws = n.split(' '); let sc = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (ws.some((w) => w.indexOf(t) === 0)) sc += 40; else if (n.indexOf(t) > -1) sc += 15; else return 0;
  }
  return sc;
}

const KIND_ORDER = ['re', 'tram', 'bus'];
let stopsReady = null;
export function preloadStops() {
  if (!stopsReady) stopsReady = Promise.all(KIND_ORDER.map((k) => loadStops(k).then((l) => [k, l]))).then((a) => { const o = {}; a.forEach(([k, l]) => { o[k] = l; }); return o; }).catch(() => ({}));
  return stopsReady;
}

/* search the local stop lists. returns { re: [], tram: [], bus: [] } */
export async function searchStops(q, limit) {
  const qn = nrm(q); if (qn.length < 2) return { re: [], tram: [], bus: [] };
  const toks = qn.split(' '), all = await preloadStops(), out = {};
  KIND_ORDER.forEach((k) => {
    const res = [], seen = {};
    (all[k] || []).forEach((s) => {
      const sc = score(nOf(s), qn, toks); if (!sc) return;
      res.push([sc - distKm(CENTER.lat, CENTER.lng, s.lat, s.lng) * 0.15, s]);
    });
    res.sort((a, b) => b[0] - a[0]);
    out[k] = [];
    for (let i = 0; i < res.length && out[k].length < (limit || 3); i++) {
      const s = res[i][1], key = s.name; if (seen[key]) continue; seen[key] = 1;
      out[k].push({ place: true, kind: k, name: s.name, lat: s.lat, lng: s.lng, lines: s.lines, sub: s.lines.slice(0, 5).join(' ') });
    }
  });
  return out;
}

export async function searchStreets(q) {
  if (q.trim().length < 3) return [];
  const g = await geocode(q); return g.map((p) => ({ ...p, kind: 'street' }));
}

/* everything at once for the resolver of the voice assistant: best match wins (station, stop or place) */
export async function resolveText(text) {
  const n = nrm(text); if (!n) return null;
  const hit = ST.find((s) => s.n === n) || ST.find((s) => s.n.indexOf(n) === 0) || ST.find((s) => s.n.indexOf(n) > -1);
  if (hit) return { st: hit };
  const fz = fuzzyStation(n); if (fz) return { st: fz };
  const stops = await searchStops(text, 1);
  const first = stops.re[0] || stops.tram[0] || stops.bus[0];
  if (first && nOf(first) === n) return { st: nearest(first), place: first };
  try { const g = await geocode(text); if (g[0]) return { st: nearest(g[0]), place: g[0] }; } catch (e) { /* offline */ }
  if (first) return { st: nearest(first), place: first };
  return null;
}
export function nearest(p) {
  let best = null, bd = 1e9; ST.forEach((s) => { const d = distKm(p.lat, p.lng, s.lat, s.lng); if (d < bd) { bd = d; best = s; } }); return best;
}

/* small typos and speech mistakes: "aleanxanderplatz" -> Alexanderplatz */
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length, n = b.length, d = [];
  for (let i = 0; i <= m; i++) { d[i] = [i]; }
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
export function fuzzyStation(n) {
  const q = n.replace(/ /g, ''); if (q.length < 4) return null;
  const max = Math.max(1, Math.floor(q.length * 0.22)); let best = null, bd = max + 1;
  ST.forEach((s) => {
    const t = s.n.replace(/ /g, ''), d = Math.min(lev(q, t, max), lev(q, t.slice(0, q.length), max) + 1);
    if (d < bd || (d === bd && best && s.w > best.w)) { bd = d; best = s; }
  });
  return bd <= max ? best : null;
}
