/* Ride state while navigating with GPS: has the person reached the first stop, are they on a train, and which train is it.
 *  - reached: the person was at the first stop. From then on the app never sends them back "to walk to the station".
 *  - boarded: after waiting at a stop the person moved away at train speed.
 *  - train: the real train, found from the live departure board by the time the person started moving. It can be an earlier
 *    train than the planned one, or another line that runs the same way. */
import { ST } from './net.js';
import { distKm } from './geo.js';
import { board, tripStops } from './live.js';

const norm = (n) => String(n || '').toLowerCase().replace(/^(s\+u|s|u)\s+/, '').replace(/\s*\(berlin\)\s*/g, '').replace(/straße|strasse/g, 'str.').replace(/[^a-z0-9äöüß.]/g, '');
const sameName = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.indexOf(y) === 0 || y.indexOf(x) === 0); };

export const initRide = () => ({ reached: false, boarded: false, spd: null, prev: null, dwell: -1, identLi: -1, stillT: 0, train: null });

/* the stop where the ride of a leg starts (after the walk to it, if the leg begins with one) */
export const boardStop = (o, li) => { const seg = o.path.legs[li], lg = o.route.legs[li]; return ST[o.path.pts[Math.min(o.path.pts.length - 1, seg.a + (lg.walkIn ? 1 : 0))].st]; };

/* Called with every GPS fix (f has lat, lng and may have speed in m/s and t in ms; sn is the snap onto the route).
 * Keeps the ride state in L and returns { li, departT } once, when the person has just left a boarding stop on a vehicle. */
export function noteRide(L, o, f, sn) {
  const now = f.t || Date.now();
  let sp = f.speed != null && !Number.isNaN(f.speed) ? f.speed : null;
  if (sp == null && L.prev && now - L.prev.t > 700) sp = distKm(L.prev.lat, L.prev.lng, f.lat, f.lng) * 1000 / ((now - L.prev.t) / 1000);
  if (sp != null) L.spd = L.spd == null ? sp : L.spd * 0.55 + sp * 0.45;
  L.prev = { lat: f.lat, lng: f.lng, t: now };
  const li = Math.max(0, Math.min(o.route.legs.length - 1, L.leg >= 0 ? L.leg : 0)), b = boardStop(o, li), dB = distKm(f.lat, f.lng, b.lat, b.lng) * 1000;
  if (li === 0 && dB < 130) L.reached = true;
  if (dB < 130) { L.dwell = li; if (L.spd == null || L.spd < 1.2) L.stillT = now; }
  if (L.reached && !L.boarded && sn && sn.idx > 0.7 && sn.km < 0.25 && L.spd != null && L.spd > 3) L.boarded = true;
  if (L.dwell === li && L.identLi !== li && dB > 70 && L.spd != null && L.spd > 3.2) {
    L.identLi = li; L.boarded = true; L.reached = true;
    return { li, departT: L.stillT || now - 15000 };
  }
  return null;
}

/* walking back to the first stop is only for someone who never got there */
export const mayWalkBack = (L) => !L.reached && !L.boarded && (L.spd == null || L.spd < 2.5);

/* Which train did the person get on? Looks at the departures of the boarding stop around the time they started moving. */
export async function identifyTrain(o, li, departT) {
  const lg = o.route.legs[li], b = boardStop(o, li), seg = o.path.legs[li], end = ST[o.path.pts[seg.b].st];
  const rows = await board(b.name, 'departures', { when: departT - 6 * 60000, duration: 14, results: 40, all: true, at: { lat: b.lat, lng: b.lng } });
  const cand = rows.filter((r) => !r.cancelled && Math.abs(r.when - departT) <= 150000).sort((x, y) => Math.abs(x.when - departT) - Math.abs(y.when - departT));
  const dirOk = (r) => { const a = norm(r.dir), t = norm(lg.toward); return !!a && !!t && (a === t || a.indexOf(t) > -1 || t.indexOf(a) > -1); };
  let pick = cand.find((r) => r.line === lg.line && dirOk(r)) || null, other = false, stops = null;
  if (!pick) {
    // another line: only when its stop list really reaches the end of this leg
    for (const r of cand.filter((x) => x.line !== lg.line && x.tripId).slice(0, 3)) {
      try {
        const ss = await tripStops(r.tripId), bi = ss.findIndex((x) => sameName(x.name, b.name)), ei = ss.findIndex((x, k) => k > bi && sameName(x.name, end.name));
        if (bi > -1 && ei > -1) { pick = r; other = true; stops = ss; break; }
      } catch (e) { /* try the next one */ }
    }
  }
  if (!pick) return { li, line: '', unknown: true };
  let endArr = 0;
  try {
    if (!stops && pick.tripId) stops = await tripStops(pick.tripId);
    const e = stops && stops.find((x) => sameName(x.name, end.name)); if (e) endArr = e.arr || 0;
  } catch (e) { /* no stop list: keep the plan estimate */ }
  return { li, line: pick.line, dir: pick.dir, when: pick.when, planned: pick.planned, delay: pick.delay, diffMin: lg.dep ? Math.round((lg.dep - pick.when) / 60000) : 0, other, endArr, tripId: pick.tripId || '' };
}
