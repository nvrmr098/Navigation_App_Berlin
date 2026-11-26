/* Turns a live journey (VBB) into the app's own route format so it can be previewed and started.
 * Every kind of transport works: S, U, tram, bus, regional trains and ferries. Walking between stops is kept as a hint on the next leg.
 *   - only S and U lines of our network: a rail route on the schematic map (stations from our data)
 *   - anything else: a "generic" route on the real street map; stops that are not in our data become virtual stops (R.virt)
 * Returns { route }, or { walk } when the journey is only a walk, or { reason } when nothing can be built. */
import { NET, R, ST, INFO, lineInfo } from './net.js';
import { project } from './geo.js';

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

const mins = (a, b) => Math.max(0, (b - a) / 60000);
const P = { S: 'S', U: 'U', tram: 'T', bus: 'B', RE: 'R', ferry: 'F' };
const TOL = { S: 0.35, U: 0.35, tram: 0.45, bus: 0.45, RE: 2.5, ferry: 2.5 }; // km away from the stop-to-stop line before "off route"

function railRoute(rides) {
  if (rides.some((l) => !INFO[l.line])) return null;
  const legs = [];
  for (let k = 0; k < rides.length; k++) {
    const l = rides[k], a = stationFor(l.from, l.line), b = stationFor(l.to, l.line);
    if (!a || !b) return null;
    const sl = sliceOn(l.line, a.i, b.i); if (!sl) return null;
    const info = INFO[l.line], prev = rides[k - 1];
    const ride = l.arr && l.dep ? Math.max(1, mins(l.dep, l.arr)) : sl.stations.length * 1.6;
    const wait = prev && prev.arr && l.dep ? Math.max(1, mins(prev.arr, l.dep)) : (k === 0 ? 3 : 4);
    legs.push({ line: l.line, p: info.p, c: info.c, stations: sl.stations, toward: ST[sl.toward].name, rideMin: ride, waitMin: wait, stops: sl.stations.length - 1, mode: info.p });
  }
  return legs;
}

/* a stop of a leg as a station index: our own station when it is one of ours (S/U), else a virtual stop */
function stopIndex(s, line, mode) {
  if (mode === 'S' || mode === 'U') { const st = stationFor(s.name, line); if (st) return st.i; }
  const pr = project(s.lat, s.lng);
  return R.virt({ vid: s.id, name: s.name, lat: s.lat, lng: s.lng, x: pr.x, y: pr.y });
}

function genericRoute(j, rides) {
  const legs = [];
  let walkBefore = null;
  const all = j.legs;
  for (let k = 0; k < rides.length; k++) {
    const l = rides[k], at = all.indexOf(l);
    // walking legs between the previous ride and this one
    let m = 0, w = 0;
    for (let q = at - 1; q >= 0 && all[q].walk; q--) { m += all[q].dist || 0; w += mins(all[q].dep, all[q].arr); }
    if (k === 0) walkBefore = m ? { m, min: Math.round(w) } : null;
    // stop list: origin, every stop on the way, destination
    let list = (l.stopovers || []).slice();
    if (!l.fromAt || !l.toAt) return { reason: 'coords' };
    const o = { id: l.fromId, name: l.from, ...l.fromAt }, d = { id: l.toId, name: l.to, ...l.toAt };
    if (!list.length || (list[0].id && o.id && list[0].id !== o.id)) list.unshift(o);
    if (list.length < 2 || (list[list.length - 1].id && d.id && list[list.length - 1].id !== d.id)) list.push(d);
    const stations = [];
    list.forEach((s) => { const i = stopIndex(s, l.line, l.mode); if (stations[stations.length - 1] !== i) stations.push(i); });
    if (stations.length < 2) return { reason: 'stops' };
    const info = lineInfo(l.line, l.product), prev = rides[k - 1];
    const lastSt = ST[stations[stations.length - 1]];
    legs.push({
      line: l.line, p: P[l.mode] || 'B', c: info.c, stations, toward: l.dir || lastSt.name,
      rideMin: Math.max(1, mins(l.dep, l.arr)), waitMin: prev ? Math.max(0, mins(prev.arr, l.dep)) : 0, stops: stations.length - 1,
      mode: l.mode, generic: true, dep: l.dep, arr: l.arr, planDep: l.planDep, platform: l.depPlatform || '', delay: l.delay || 0, cancelled: !!l.cancelled,
      walkIn: k > 0 && m && legs[k - 1].stations[legs[k - 1].stations.length - 1] !== stations[0] ? { m, min: Math.max(1, Math.round(w)) } : null, tol: TOL[l.mode] || 0.5,
    });
  }
  return { legs, walkBefore };
}

export function journeyToRoute(j) {
  const rides = j.legs.filter((l) => !l.walk);
  if (!rides.length) {
    const a = j.legs[0] && j.legs[0].fromAt, b = j.legs[j.legs.length - 1] && j.legs[j.legs.length - 1].toAt;
    return a && b ? { walk: { from: a, to: { ...b, name: j.legs[j.legs.length - 1].to } } } : { reason: 'empty' };
  }
  const first = rides[0], last = rides[rides.length - 1];
  const minutes = first.dep && last.arr ? Math.max(1, Math.round(mins(first.dep, last.arr))) : 0;
  const base = { dep: first.dep, arr: last.arr, lead: Math.max(0, Math.round(mins(Date.now(), first.dep))), warn: !!j.warn, key: 'fastest', alt: true };

  const rail = railRoute(rides);
  if (rail) {
    const m = minutes || Math.round(rail.reduce((t, l) => t + l.rideMin + l.waitMin, 0));
    return { route: { ...base, legs: rail, minutes: m, transfers: rail.length - 1, from: rail[0].stations[0], to: rail[rail.length - 1].stations[rail[rail.length - 1].stations.length - 1], modes: [] } };
  }
  const g = genericRoute(j, rides);
  if (g.reason) return g;
  const legs = g.legs, lastLeg = legs[legs.length - 1];
  const modes = []; legs.forEach((l) => { if (l.mode !== 'S' && l.mode !== 'U' && modes.indexOf(l.mode) < 0) modes.push(l.mode); });
  return { route: { ...base, legs, minutes: minutes || Math.round(legs.reduce((t, l) => t + l.rideMin + l.waitMin, 0)), transfers: legs.length - 1, from: legs[0].stations[0], to: lastLeg.stations[lastLeg.stations.length - 1], generic: true, modes, walkStart: g.walkBefore } };
}
