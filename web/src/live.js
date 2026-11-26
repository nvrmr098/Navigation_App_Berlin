/* Live data from the public VBB transport.rest API (community HAFAS mirror, no key, 100 requests per minute).
 * Everything here fails soft: callers get an error state and show the timetable estimate instead. */
import { getLang } from './i18n.js';

export const API = 'https://v6.vbb.transport.rest';
const PRODUCTS = 'suburban=true&subway=true&bus=false&tram=false&ferry=false&express=false&regional=false';
const PRODUCTS_ALL = 'suburban=true&subway=true&bus=true&tram=true&ferry=false&express=false&regional=true';
const cache = new Map();      // url -> { t, data }
const inflight = new Map();   // url -> promise
const staleHits = new Map(); // url -> time of the saved copy that was used because the network failed

async function getJson(path, ttl) {
  const url = API + path, hit = cache.get(url);
  if (hit && Date.now() - hit.t < ttl) return hit.data;
  if (inflight.has(url)) return inflight.get(url);
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 9000);
  const p = fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((d) => { cache.set(url, { t: Date.now(), data: d }); staleHits.delete(url); try { if (path.indexOf('/journeys') < 0) localStorage.setItem('bl_c:' + path.slice(0, 180), JSON.stringify({ t: Date.now(), d })); } catch (e) { /* storage full */ } return d; })
    .catch((err) => { try { const o = JSON.parse(localStorage.getItem('bl_c:' + path.slice(0, 180)) || 'null'); if (o && Date.now() - o.t < 24 * 3600 * 1000) { cache.set(url, { t: Date.now() - ttl + 5000, data: o.d }); staleHits.set(url, o.t); return o.d; } } catch (e2) { /* none */ } throw err; })
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

export async function stationId(name, at) {
  if (at) {
    // bus and tram stops share names, so pick the stop closest to the given coordinates
    const key = name + '@' + at.lat.toFixed(3) + ',' + at.lng.toFixed(3); if (ids[key]) return ids[key];
    const list = await getJson('/locations?query=' + encodeURIComponent(name) + '&results=10&stops=true&addresses=false&poi=false&language=' + getLang(), 6 * 3600 * 1000);
    const stops = (Array.isArray(list) ? list : []).filter((x) => x && x.type === 'stop' && x.id);
    const d = (x) => x.location ? (x.location.latitude - at.lat) ** 2 + (x.location.longitude - at.lng) ** 2 : 1e9;
    stops.sort((a, b) => d(a) - d(b));
    if (!stops.length) throw new Error('no station');
    ids[key] = stops[0].id;
    try { localStorage.setItem(idKey, JSON.stringify(ids)); } catch (e) { /* ignore */ }
    return ids[key];
  }
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
    platform: d.platform || d.plannedPlatform || '', cancelled: !!d.cancelled || (!d.when && !!d.plannedWhen), tripId: d.tripId || '',
  };
};

/* board: kind 'departures' | 'arrivals'. opts: { when: Date|ms, duration, results } */
export async function board(name, kind, opts) {
  const o = opts || {}, id = await stationId(name, o.at);
  let q = '/stops/' + id + '/' + kind + '?' + (o.all ? PRODUCTS_ALL : PRODUCTS) + '&remarks=false&results=' + (o.results || 12) + '&duration=' + (o.duration || 60) + '&language=' + getLang();
  if (o.when) q += '&when=' + encodeURIComponent(new Date(o.when).toISOString());
  const d = await getJson(q, 15000);
  const list = Array.isArray(d) ? d : (d && (d.departures || d.arrivals)) || [];
  const rows = list.map((x) => mapRow(x, kind === 'arrivals')).filter((x) => x.line && x.when).sort((a, b) => a.when - b.when);
  rows.staleAt = staleHits.get(API + q) || 0; // set when the rows come from the saved copy (offline)
  return rows;
}

/* the stops of one train run with their times (to know where a train goes and when it reaches the end of your leg) */
export async function tripStops(id) {
  const d = await getJson('/trips/' + encodeURIComponent(id) + '?stopovers=true&remarks=false&polylines=false&language=' + getLang(), 20000);
  const t = (d && d.trip) || d || {};
  return (t.stopovers || []).filter((x) => x && x.stop && !x.cancelled).map((x) => ({
    id: x.stop.id || '', name: cleanName(x.stop.name), arr: Date.parse(x.arrival || x.plannedArrival || ''), dep: Date.parse(x.departure || x.plannedDeparture || ''),
  }));
}

// next trains of one line towards one terminus (used for the route cards)
export function pickTrains(all, line, toward) {
  const same = all.filter((x) => x.line === line);
  const t = norm(toward), hit = same.filter((x) => { const dn = norm(x.dir); return dn && (dn === t || dn.indexOf(t) > -1 || t.indexOf(dn) > -1); });
  return hit.length ? hit : same;
}

/* ---------- service updates (S-Bahn, U-Bahn, tram, bus, regional trains) ---------- */
const HUBS = ['Alexanderplatz', 'Hauptbahnhof', 'Friedrichstr.', 'Zoologischer Garten', 'Ostkreuz', 'Südkreuz', 'Gesundbrunnen', 'Westkreuz', 'Jannowitzbrücke', 'Hermannplatz'];
// busy tram, bus and regional stops: warnings ride along with their departures
const HUBS_OTHER = ['Rathaus Pankow', 'Warschauer Str.', 'Walther-Schreiber-Platz', 'Rathaus Spandau', 'Ostbahnhof', 'Potsdam Hauptbahnhof', 'Flughafen BER', 'Hackescher Markt'];
export const PROD_GROUPS = { S: ['suburban'], U: ['subway'], tram: ['tram'], bus: ['bus'], RE: ['regional', 'express'] };

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
  // 1) the generic remarks list when the API offers it (all local modes and regional trains)
  try {
    const d = await getJson('/remarks?results=300&' + PRODUCTS_ALL + '&language=' + lang, 4 * 60000);
    const list = Array.isArray(d) ? d : (d && d.remarks) || [];
    list.forEach((r) => {
      const p = r.products || {}, on = Object.keys(p).filter((k) => p[k]);
      if (on.length) on.forEach((k) => addRemark(map, r, '', k)); else addRemark(map, r, '', '');
    });
    if (list.length) okCount++;
  } catch (e) { /* not available, use the station boards below */ }
  // 2) warnings that ride along with departures at the big hubs, all modes
  const jobs = HUBS.concat(HUBS_OTHER).map(async (h) => {
    try {
      const id = await stationId(h);
      const d = await getJson('/stops/' + id + '/departures?' + PRODUCTS_ALL + '&remarks=true&results=40&duration=60&language=' + lang, 4 * 60000);
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
    lines: [...e.lines].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).slice(0, 12),
    prods: [...e.prods].filter(Boolean),
  })).filter((e) => e.title || e.text);
  out.sort((a, b) => b.priority - a.priority || (Date.parse(b.from) || 0) - (Date.parse(a.from) || 0));
  return { items: out, cancelled, at: Date.now() };
}


/* a place for a journey request: a name, or { id } (a VBB stop id), or { name, lat, lng } */
async function placeId(x) {
  if (!x) throw new Error('no place');
  if (typeof x === 'string') return stationId(x);
  if (x.id) return x.id;
  return stationId(x.name, x.lat != null ? { lat: x.lat, lng: x.lng } : undefined);
}
const posOf = (x) => (x && x.location && x.location.latitude != null ? { lat: x.location.latitude, lng: x.location.longitude } : x && x.latitude != null ? { lat: x.latitude, lng: x.longitude } : null);
export const MODE_OF = { suburban: 'S', subway: 'U', tram: 'tram', bus: 'bus', ferry: 'ferry', express: 'RE', regional: 'RE' };

/* the stop closest to a position (used to build a new route from where you are) */
export async function nearbyStop(lat, lng) {
  const d = await getJson('/locations/nearby?latitude=' + lat + '&longitude=' + lng + '&results=3&distance=800&stops=true&poi=false&language=' + getLang(), 60000);
  const s = (Array.isArray(d) ? d : []).find((x) => x && x.id && x.type === 'stop');
  if (!s) throw new Error('no stop');
  return { id: s.id, name: cleanName(s.name), lat: s.location && s.location.latitude, lng: s.location && s.location.longitude };
}

/* whole journeys between two places (alternatives, step-free routes, faster combinations with bus, tram and regional trains).
 * o: { results, stepFree, when (departure), arrive (arrival), stopovers, products: 'rail' for S and U only } */
export async function journeys(fromName, toName, o) {
  const [a, b] = await Promise.all([placeId(fromName), placeId(toName)]);
  let q = '/journeys?from=' + a + '&to=' + b + '&results=' + ((o && o.results) || 4) + '&stopovers=' + (o && o.stopovers ? 'true' : 'false') + '&remarks=true&language=' + getLang();
  if (o && o.stepFree) q += '&accessibility=complete';
  if (o && o.products === 'rail') q += '&' + PRODUCTS;
  if (o && o.arrive) q += '&arrival=' + encodeURIComponent(new Date(o.arrive).toISOString());
  else if (o && o.when) q += '&departure=' + encodeURIComponent(new Date(o.when).toISOString());
  const d = await getJson(q, 30000);
  return ((d && d.journeys) || []).map((j) => {
    const legs = (j.legs || []).map((l) => {
      const so = (l.stopovers || []).filter((x) => x && x.stop && !x.cancelled && posOf(x.stop)).map((x) => ({ id: x.stop.id || '', name: cleanName(x.stop.name), ...posOf(x.stop), arr: Date.parse(x.arrival || x.plannedArrival || ''), dep: Date.parse(x.departure || x.plannedDeparture || '') }));
      return {
        walk: !!l.walking, line: l.line ? String(l.line.name || '').replace(/\s+/g, '') : '', product: l.line && l.line.product, mode: l.line ? MODE_OF[l.line.product] || 'bus' : '',
        from: cleanName(l.origin && l.origin.name), to: cleanName(l.destination && l.destination.name),
        fromId: (l.origin && l.origin.id) || '', toId: (l.destination && l.destination.id) || '', fromAt: posOf(l.origin), toAt: posOf(l.destination), stopovers: so,
        dep: Date.parse(l.departure || l.plannedDeparture || ''), arr: Date.parse(l.arrival || l.plannedArrival || ''),
        delay: typeof l.departureDelay === 'number' ? Math.round(l.departureDelay / 60) : 0, cancelled: !!l.cancelled,
        dist: l.distance || 0, dir: cleanName(l.direction || ''),
        arrDelay: typeof l.arrivalDelay === 'number' ? Math.round(l.arrivalDelay / 60) : 0,
        depPlatform: l.departurePlatform || l.plannedDeparturePlatform || '', arrPlatform: l.arrivalPlatform || l.plannedArrivalPlatform || '',
        planArr: Date.parse(l.plannedArrival || l.arrival || ''), planDep: Date.parse(l.plannedDeparture || l.departure || ''),
        load: l.loadFactor || '',
      };
    });
    const lifts = (j.remarks || []).map((r) => strip(r.summary || r.text || '')).filter((t) => /aufzug|fahrstuhl|elevator|lift\b|rolltreppe|escalator/i.test(t));
    const warn = (j.remarks || []).some((r) => r.type === 'warning' || r.type === 'status' && /stör|ausfall|sperr|disrupt|cancel|closure/i.test(r.summary || r.text || '')) || legs.some((l) => l.cancelled);
    return { legs, dep: legs.length ? legs[0].dep : 0, arr: legs.length ? legs[legs.length - 1].arr : 0, warn, lifts: lifts.slice(0, 3) };
  }).filter((j) => j.legs.length);
}
