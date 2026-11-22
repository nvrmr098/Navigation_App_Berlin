/* Live data from the public VBB transport.rest API (community HAFAS mirror, no key, 100 requests per minute).
 * Everything here fails soft: callers get an error state and show the timetable estimate instead. */
import { getLang } from './i18n.js';

export const API = 'https://v6.vbb.transport.rest';
const PRODUCTS = 'suburban=true&subway=true&bus=false&tram=false&ferry=false&express=false&regional=false';
const cache = new Map();      // url -> { t, data }
const inflight = new Map();   // url -> promise

async function getJson(path, ttl) {
  const url = API + path, hit = cache.get(url);
  if (hit && Date.now() - hit.t < ttl) return hit.data;
  if (inflight.has(url)) return inflight.get(url);
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 9000);
  const p = fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((d) => { cache.set(url, { t: Date.now(), data: d }); return d; })
    .finally(() => { clearTimeout(timer); inflight.delete(url); });
  inflight.set(url, p);
  return p;
}

const norm = (n) => String(n || '').toLowerCase().replace(/^(s\+u|s|u)\s+/, '').replace(/\s*\(berlin\)\s*/g, '').replace(/straße|strasse/g, 'str.').replace(/[^a-z0-9äöüß.]/g, '');
export const cleanName = (n) => String(n || '').replace(/^(S\+U|S|U)\s+/, '').replace(/\s*\(Berlin\)/, '');

// station name (as in our data) -> VBB station id, remembered on the device
const idKey = 'bl_ids';
let ids = {};
try { ids = JSON.parse(localStorage.getItem(idKey) || '{}'); } catch (e) { ids = {}; }

export async function stationId(name) {
  if (ids[name]) return ids[name];
  const q = '/locations?query=' + encodeURIComponent(name) + '&results=6&stops=true&addresses=false&poi=false&language=' + getLang();
  const list = await getJson(q, 6 * 3600 * 1000);
  const want = norm(name);
  const stops = (Array.isArray(list) ? list : []).filter((x) => x && x.type === 'stop' && x.id);
  const best = stops.find((x) => norm(x.name) === want) || stops.find((x) => norm(x.name).indexOf(want) === 0) || stops[0];
  if (!best) throw new Error('no station');
  ids[name] = best.id;
  try { localStorage.setItem(idKey, JSON.stringify(ids)); } catch (e) { /* ignore */ }
  return best.id;
}

const mapRow = (d, arrival) => {
  const when = Date.parse(d.when || d.plannedWhen || ''), planned = Date.parse(d.plannedWhen || d.when || '');
  const line = (d.line && d.line.name) || '';
  return {
    line: line.replace(/\s+/g, ''), product: d.line && d.line.product, // 'suburban' | 'subway'
    dir: cleanName(arrival ? (d.provenance || d.origin || '') : (d.direction || '')),
    when, planned, delay: typeof d.delay === 'number' ? Math.round(d.delay / 60) : (when && planned ? Math.round((when - planned) / 60000) : 0),
    platform: d.platform || d.plannedPlatform || '', cancelled: !!d.cancelled || (!d.when && !!d.plannedWhen),
  };
};

/* board: kind 'departures' | 'arrivals'. opts: { when: Date|ms, duration, results } */
export async function board(name, kind, opts) {
  const id = await stationId(name), o = opts || {};
  let q = '/stops/' + id + '/' + kind + '?' + PRODUCTS + '&remarks=false&results=' + (o.results || 12) + '&duration=' + (o.duration || 60) + '&language=' + getLang();
  if (o.when) q += '&when=' + encodeURIComponent(new Date(o.when).toISOString());
  const d = await getJson(q, 15000);
  const list = Array.isArray(d) ? d : (d && (d.departures || d.arrivals)) || [];
  return list.map((x) => mapRow(x, kind === 'arrivals')).filter((x) => x.line && x.when).sort((a, b) => a.when - b.when);
}

// next trains of one line towards one terminus (used for the route cards)
export function pickTrains(all, line, toward) {
  const same = all.filter((x) => x.line === line);
  const t = norm(toward), hit = same.filter((x) => { const dn = norm(x.dir); return dn && (dn === t || dn.indexOf(t) > -1 || t.indexOf(dn) > -1); });
  return hit.length ? hit : same;
}

/* ---------- service updates ---------- */
const HUBS = ['Alexanderplatz', 'Hauptbahnhof', 'Friedrichstr.', 'Zoologischer Garten', 'Ostkreuz', 'Südkreuz', 'Gesundbrunnen', 'Westkreuz', 'Jannowitzbrücke', 'Hermannplatz'];

const addRemark = (map, r, line, product) => {
  if (!r || (r.type !== 'status' && r.type !== 'warning')) return;
  const key = r.id || (r.summary || '') + (r.text || '');
  if (!key) return;
  const e = map.get(key) || { id: key, summary: r.summary || '', text: r.text || '', from: r.validFrom || '', to: r.validUntil || '', priority: r.priority || 0, lines: new Set(), prods: new Set() };
  if (line) e.lines.add(line);
  if (product) e.prods.add(product);
  map.set(key, e);
};
const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export async function disruptions() {
  const map = new Map(); let cancelled = 0, okCount = 0;
  const lang = getLang();
  // 1) the generic remarks list when the API offers it
  try {
    const d = await getJson('/remarks?results=250&suburban=true&subway=true&bus=false&tram=false&ferry=false&express=false&regional=false&language=' + lang, 4 * 60000);
    const list = Array.isArray(d) ? d : (d && d.remarks) || [];
    list.forEach((r) => {
      const p = r.products || {};
      if (p && (p.suburban || p.subway || (!('suburban' in p) && !('subway' in p)))) addRemark(map, r, '', p.suburban ? 'suburban' : p.subway ? 'subway' : '');
    });
    if (list.length) okCount++;
  } catch (e) { /* not available, use the station boards below */ }
  // 2) warnings that ride along with departures at the big hubs
  const jobs = HUBS.map(async (h) => {
    try {
      const id = await stationId(h);
      const d = await getJson('/stops/' + id + '/departures?' + PRODUCTS + '&remarks=true&results=30&duration=60&language=' + lang, 4 * 60000);
      const list = Array.isArray(d) ? d : (d && d.departures) || [];
      okCount++;
      list.forEach((x) => {
        const ln = x.line && x.line.name ? x.line.name.replace(/\s+/g, '') : '';
        if (x.cancelled) cancelled++;
        (x.remarks || []).forEach((r) => addRemark(map, r, ln, x.line && x.line.product));
      });
    } catch (e) { /* skip this hub */ }
  });
  await Promise.all(jobs);
  if (!okCount) throw new Error('offline');
  const out = [...map.values()].map((e) => ({
    id: e.id, title: strip(e.summary) || strip(e.text).slice(0, 80), text: strip(e.text), from: e.from, to: e.to, priority: e.priority,
    lines: [...e.lines].filter((l) => /^[SU]\d/.test(l)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
    prods: [...e.prods],
  })).filter((e) => e.title || e.text);
  out.sort((a, b) => b.priority - a.priority || (Date.parse(b.from) || 0) - (Date.parse(a.from) || 0));
  return { items: out, cancelled, at: Date.now() };
}

