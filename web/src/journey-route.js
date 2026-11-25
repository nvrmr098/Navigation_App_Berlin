/* Turns a live journey (VBB, from the Alternatives list) into the app's own route format so it can be previewed and started.
 * Works when every ride is an S-Bahn or U-Bahn line of our network (walking legs are fine, they are left out of the map route).
 * Returns { route } or { reason: 'modes' | 'stations' | 'empty' } when it cannot be navigated on the rail map. */
import { NET, R, ST, INFO } from './net.js';

/* VBB names differ from ours ("S+U Berlin Hauptbahnhof", "S Ostkreuz Bhf (Berlin)"): compare a simplified form, only among the stations of that line */
const nz = (n) => String(n || '').toLowerCase().replace(/\(berlin\)/g, ' ').replace(/straße|strasse/g, 'str').replace(/\b(bhf|hbf|berlin)\b/g, ' ').replace(/[^a-z0-9äöüß]/g, '');
function stationFor(name, line) {
  const L = NET.lines[line], want = nz(name);
  if (L && want) {
    const set = new Set(); L.v.forEach((seq) => seq.forEach((i) => set.add(i)));
    let exact = null, near = null;
    set.forEach((i) => { const n = nz(ST[i].name); if (n === want) exact = ST[i]; else if (!near && Math.min(n.length, want.length) >= 5 && (n.indexOf(want) === 0 || want.indexOf(n) === 0)) near = ST[i]; });
    if (exact || near) return exact || near;
  }
  const cands = R.search(name, 6);
  return cands.find((s) => s.lines.indexOf(line) > -1) || null;
}
// stations between a and b along the line, in the travel direction
function sliceOn(line, a, b) {
  const L = NET.lines[line]; if (!L) return null; let best = null;
  L.v.forEach((seq) => {
    const ia = seq.indexOf(a), ib = seq.indexOf(b); if (ia < 0 || ib < 0 || ia === ib) return;
    const part = ia < ib ? seq.slice(ia, ib + 1) : seq.slice(ib, ia + 1).reverse();
    const toward = ia < ib ? seq[seq.length - 1] : seq[0];
    if (!best || part.length < best.stations.length) best = { stations: part, toward };
  });
  return best;
}

export function journeyToRoute(j) {
  const rides = j.legs.filter((l) => !l.walk);
  if (!rides.length) return { reason: 'empty' };
  if (rides.some((l) => !INFO[l.line])) return { reason: 'modes' };
  const legs = [];
  for (let k = 0; k < rides.length; k++) {
    const l = rides[k], a = stationFor(l.from, l.line), b = stationFor(l.to, l.line);
    if (!a || !b) return { reason: 'stations' };
    const sl = sliceOn(l.line, a.i, b.i); if (!sl) return { reason: 'stations' };
    const info = INFO[l.line], prev = rides[k - 1];
    const ride = l.arr && l.dep ? Math.max(1, (l.arr - l.dep) / 60000) : sl.stations.length * 1.6;
    const wait = prev && prev.arr && l.dep ? Math.max(1, (l.dep - prev.arr) / 60000) : (k === 0 ? 3 : 4);
    // the same stop twice in a row (changing platforms) is merged into one leg by the router, keep them separate here
    legs.push({ line: l.line, p: info.p, c: info.c, stations: sl.stations, toward: ST[sl.toward].name, rideMin: ride, waitMin: wait, stops: sl.stations.length - 1 });
  }
  const first = rides[0], last = rides[rides.length - 1];
  const minutes = first.dep && last.arr ? Math.max(1, Math.round((last.arr - first.dep) / 60000)) : Math.round(legs.reduce((t, l) => t + l.rideMin + l.waitMin, 0));
  return { route: { legs, minutes, transfers: legs.length - 1, from: legs[0].stations[0], to: legs[legs.length - 1].stations[legs[legs.length - 1].stations.length - 1], key: 'fastest', alt: true } };
}
