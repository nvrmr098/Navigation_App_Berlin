import React, { useCallback, useEffect, useRef, useState } from 'react';
import { R, ST, clamp, pointAt } from './net.js';
import { MapEngine } from './mapEngine.js';
import { GpsTracker, project, distKm, nearestStation, snapToRoute, geoAt, getPositionOnce, haptic, keepAwake } from './geo.js';
import { Badge, SearchBox, Ico, BerlinClock, BackBtn } from './ui.jsx';
import Splash from './splash.jsx';
const ModeMap = React.lazy(() => import('./modemap.jsx'));
const WalkView = React.lazy(() => import('./walkview.jsx'));
import { meters } from './walk.js';
import { beep } from './geo.js';
import { SHARE_API, VOICE_ASSISTANT } from './config.js';
import { POPULAR } from './popular.js';
import { NavPage, MorePage, NearbyPage, ModalContent } from './pages.jsx';
import { EntrancesModal, CalibModal, RouteNotes } from './extras.jsx';
import { applyPos, hasCalib, offsetMeters, askMotion } from './calibrate.js';
import { noteRide, mayWalkBack, identifyTrain, initRide } from './ride.js';
import { bgTrack } from './bgloc.js';
import { Vehicle2D } from './vehicle2d.js';
import { vehicleKind } from './avatar3d.js';
import { setLang, tr, cnt, fmtTime } from './i18n.js';
import { TripLive } from './trip-ui.jsx';
import { journeys, nearbyStop } from './live.js';
import { journeyToRoute } from './journey-route.js';
import { placeOf } from './trip.js';

const loadStore = () => {
  const base = { theme: 'auto', skin: 'classic', lang: 'en', home: '', work: '', homeAt: null, workAt: null, fav: [], rec: [], lbl: true, step: false, real3d: true, awake: true, haptics: true, bike: false, reduceMotion: false };
  try {
    const raw = localStorage.getItem('br1') || localStorage.getItem('bl1');
    if (raw) { const o = JSON.parse(raw); Object.assign(base, o); if (o.dark && !o.theme) base.theme = 'dark'; }
  } catch (e) { /* storage may be unavailable */ }
  return base;
};
const fmtDist = (km) => (km < 1 ? Math.round(km * 1000 / 10) * 10 + ' m' : km.toFixed(1) + ' km');
const PAGES = ['pMap', 'pNav', 'pNear', 'pMore'];
const mixKeyOf = (nav, when) => (nav.from && nav.to && when.mode !== 'arr' ? nav.from.i + '>' + nav.to.i + '|' + when.mode + '|' + (when.mode === 'now' ? '' : when.ts) : '');
const MODE_WORD = { RE: 'modeRE', bus: 'modeBus', tram: 'modeTram', ferry: 'modeFerry' };

export default function App() {
  const [store, setStore] = useState(loadStore);
  setLang(store.lang);
  const [booted, setBooted] = useState(false);
  const [mult, setMult] = useState(1);
  const [net, setNet] = useState('rail');
  const [walk, setWalk] = useState(null);
  const [boardOpts, setBoardOpts] = useState(null);
  const [share, setShare] = useState(null); // { id, key, url } while live sharing is on
  const shareRef = useRef(null);
  useEffect(() => {
    if (!share) return undefined;
    const t = setInterval(() => { if (shareRef.current) sendPos(shareRef.current); }, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [share]);
  const [when, setWhen] = useState({ mode: 'now', ts: 0 });
  const [boardName, setBoardName] = useState('');
  const [page, setPage] = useState('pMap');
  const [filter, setFilter] = useState('both');
  const [optOpen, setOptOpen] = useState(false);
  const [selected, setSelected] = useState(-1);
  const [mq, setMq] = useState('');
  const [nav, setNav] = useState({ from: null, to: null, routes: [], sel: 0 });
  const [fq, setFq] = useState('');
  const [tq, setTq] = useState('');
  const [mode, setMode] = useState('idle'); // idle | show | intro | live
  const [info, setInfo] = useState({ lines: [], title: '', sub: '', pct: 0, hud: '', intro: null, off: null });
  const [view, setView] = useState('2d'); // 2d | generic | real
  const [loading3d, setLoading3d] = useState(false);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const [source, setSource] = useState('demo');
  const [gpsStatus, setGpsStatus] = useState('idle');
  const [locateOn, setLocateOn] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [entInfo, setEntInfo] = useState(null);
  const [calibOn, setCalibOn] = useState(false);
  const [tilt, setTilt] = useState(false); // street map in navigation: false = flat 2D, true = tilted 3D
  const [mix, setMix] = useState(null); // a faster route that combines S/U with bus, tram or regional trains
  const fromPageRef = useRef('pMap'), vehRef = useRef(null), histRef = useRef({ pushed: 0, ignore: 0 }), closeTopRef = useRef(null), mapHost = useRef(null);

  const cvRef = useRef(null), glRef = useRef(null), realDiv = useRef(null), eng = useRef(null), scene = useRef(null), real = useRef(null), trk = useRef(null);
  const ov = useRef(null);
  const live = useRef({ on: false, phase: 'idle', source: 'demo', p: 0, target: 0, play: true, follow: true, t0: 0, last: 0, adv: null, fix: null, lastFixAt: 0, gpsIdx: 0, offKm: 0, offSince: 0, alerted: '', leg: -1, done: false });
  live.current.mult = mult;
  const viewRef = useRef('2d'), loadingRef = useRef(false), lastInfo = useRef(''), toastT = useRef(0), storeRef = useRef(store);
  const locateRef = useRef(false), locateFirst = useRef(false), navRef = useRef(nav);
  storeRef.current = store; navRef.current = nav;

  const say = useCallback((t) => { setToast(t); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(''), 2400); }, []);

  // which train is it: look at the departure board around the time the person left the stop
  const startIdent = (li, departT) => {
    const o = ov.current; if (!o) return;
    identifyTrain(o, li, departT).then((t) => { if (live.current.on && ov.current === o && t) live.current.train = t; }).catch(() => { /* no live data: the plan stays */ });
  };
  // the position is also wanted while the app is in the background (Android service)
  const releaseBg = () => { const L = live.current; if (L.bg) { L.bg = false; bgTrack(false); } };

  // routes as shown: a clearly faster combination with bus, tram or regional trains goes first (the S/U-only routes stay below it)
  const mixKey = mixKeyOf(nav, when);
  const navV = mix && mix.key === mixKey ? { ...nav, routes: [mix.route, ...nav.routes] } : nav;
  useEffect(() => {
    setMix(null); if (!mixKey) return undefined;
    let dead = false; const a = nav.from.name, b = nav.to.name;
    (async () => {
      try {
        const o = { results: 5, stopovers: true }; o.when = when.mode === 'dep' ? when.ts : Date.now();
        const [all, rail] = await Promise.all([journeys(a, b, o), journeys(a, b, { when: o.when, results: 3, products: 'rail' })]);
        const live = (j) => !j.legs.some((l) => l.cancelled);
        const cands = all.filter(live).map((j) => ({ j, c: journeyToRoute(j) })).filter((x) => x.c.route && x.c.route.generic && x.c.route.modes.length).sort((x, y) => x.j.arr - y.j.arr);
        if (!cands.length) return;
        const railArr = rail.filter(live).map((j) => j.arr).sort((x, y) => x - y)[0] || (Date.now() + ((R.routes(nav.from.i, nav.to.i)[0] || { minutes: 999 }).minutes * 60000));
        const save = Math.round((railArr - cands[0].j.arr) / 60000);
        if (save >= 2 && !dead) { setMix({ key: mixKey, route: { ...cands[0].c.route, key: 'faster', save } }); setNav((n) => (n.sel > 0 ? { ...n, sel: n.sel + 1 } : n)); }
      } catch (e) { /* no live answer: the S/U routes stay as they are */ }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line
  }, [mixKey]);

  // reduce motion and bike mode steer the mascot in the walking view
  useEffect(() => { document.body.classList.toggle('rm', !!store.reduceMotion); document.body.classList.toggle('bike', !!store.bike); }, [store.reduceMotion, store.bike]);
  // ---------- persistence and theme ----------
  useEffect(() => { try { localStorage.setItem('bl1', JSON.stringify(store)); } catch (e) { /* ignore */ } if (eng.current) { eng.current.lbl = !!store.lbl; eng.current.schedule(); } }, [store]);
  useEffect(() => {
    const mqd = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = store.theme === 'dark' || (store.theme === 'auto' && mqd.matches);
      document.body.classList.toggle('dark', dark);
      document.body.classList.toggle('skin-neon', store.skin === 'neon'); document.body.classList.toggle('skin-modern', store.skin === 'modern');
      const tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.content = getComputedStyle(document.body).getPropertyValue('--bg').trim() || (dark ? '#090b12' : '#f2f4fa');
      try { window.AndroidBridge && window.AndroidBridge.setTheme && window.AndroidBridge.setTheme(dark); } catch (e) { /* not in the app */ }
      if (eng.current) eng.current.schedule();
      if (viewRef.current === 'generic' && scene.current && ov.current) scene.current.build(ov.current, dark);
    };
    apply(); mqd.addEventListener('change', apply); return () => mqd.removeEventListener('change', apply);
  }, [store.theme, store.skin]);

  useEffect(() => { document.documentElement.lang = store.lang; }, [store.lang]);

  // ---------- map engine and GPS tracker ----------
  useEffect(() => {
    const e = new MapEngine(cvRef.current, { onTap: (i) => setSelected(i), onManual: () => { live.current.follow = false; } });
    eng.current = e; e.lbl = !!storeRef.current.lbl;
    const onResize = () => { e.resize(); if (scene.current) scene.current.resize(e.W, e.H, e.dpr); if (real.current) real.current.resize(); };
    window.addEventListener('resize', onResize); onResize();

    trk.current = new GpsTracker((f0) => {
      const L = live.current; L.raw = f0; const f = applyPos(f0); L.fix = f; L.lastFixAt = Date.now();
      const pr = project(f.lat, f.lng);
      if (locateRef.current || (L.on && L.source === 'gps')) { e.user = { x: pr.x, y: pr.y }; e.userAnim = true; e.schedule(); }
      if (locateFirst.current) {
        locateFirst.current = false;
        const near = nearestStation(f.lat, f.lng);
        if (near.km > 45) { say(tr('outsideBerlin')); }
        else { e.view.cx = pr.x; e.view.cy = pr.y; e.view.z = Math.max(e.view.z, e.z0 * 3); e.schedule(); }
      }
      if (L.on && L.source === 'gps' && ov.current) {
        const sn = snapToRoute(ov.current, f.lat, f.lng, L.phase === 'live' ? L.gpsIdx : null);
        L.gpsIdx = sn.idx; L.offKm = sn.km;
        const rt = ov.current.route, tol = (rt.legs[clamp(R.legAt(ov.current.path, Math.min(sn.idx, ov.current.path.pts.length - 1.001)), 0, rt.legs.length - 1)] || {}).tol || 0.35;
        if (sn.km > tol) { if (!L.offSince) L.offSince = Date.now(); } else L.offSince = 0;
        const ev = noteRide(L, ov.current, f, sn);
        if (ev) startIdent(ev.li, ev.departT);
      }
    }, (s) => setGpsStatus(s));
    return () => { window.removeEventListener('resize', onResize); e.destroy(); live.current.on = false; releaseBg(); trk.current.stop(); if (real.current) real.current.destroy(); };
  }, [say]);
  useEffect(() => { const e = eng.current; if (!e) return; e.filter = filter; e.selected = selected; e.schedule(); }, [filter, selected]);
  useEffect(() => { if (page === 'pMap' && eng.current) eng.current.resize(); }, [page]);
  useEffect(() => { if (gpsStatus === 'denied' && live.current.on && live.current.source === 'gps' && ov.current) { const r = ov.current.route; live.current.on = false; showOnMap(r); say(tr('permOff')); } // eslint-disable-next-line
  }, [gpsStatus, say]);

  // ---------- helpers ----------
  const filterFor = (s) => { if (!s.lines.some((l) => filter === 'both' || (filter === 'S' ? /^S/.test(l) : /^U/.test(l)))) setFilter('both'); };
  const showPlace = (pl) => {
    const n = nearestStation(pl.lat, pl.lng); setMq(pl.name); filterFor(n.st); selectStation(n.st.i, true);
    say(pl.name + ': ' + tr('nearest') + ' ' + n.st.name + ' (' + fmtDist(n.km) + ')');
  };
  const selectStation = (i, center) => { setSelected(i); if (center && eng.current) eng.current.centerOn(ST[i], 3.2, eng.current.H * 0.12); };
  const remember = (r) => {
    const a = ST[r.from].name, b = ST[r.to].name;
    setStore((s) => ({ ...s, rec: [[a, b], ...s.rec.filter((x) => !(x[0] === a && x[1] === b))].slice(0, 6) }));
  };
  const computeRoutes = (from, to) => {
    if (from && to && from === to) { say(tr('sameStation')); return []; }
    return from && to ? R.routes(from.i, to.i) : [];
  };
  const setFrom = (s, pl) => { setNav((n) => ({ ...n, from: s, fromPlace: pl || null, routes: computeRoutes(s, n.to), sel: 0 })); setFq(s ? s.name : ''); };
  const setTo = (s, pl) => { setNav((n) => ({ ...n, to: s, toPlace: pl || null, routes: computeRoutes(n.from, s), sel: 0 })); setTq(s ? s.name : ''); };
  const pickPlace = (kind, pl) => { const st = nearestStation(pl.lat, pl.lng).st; if (kind === 'from') { setFrom(st, pl); setFq(pl.name); } else { setTo(st, pl); setTq(pl.name); } };
  const clearRoutes = (key) => setNav((n) => ({ ...n, [key]: null, [key + 'Place']: null, routes: [], sel: 0 }));
  const swap = () => { setNav((n) => ({ ...n, from: n.to, to: n.from, routes: computeRoutes(n.to, n.from), sel: 0 })); setFq(tq); setTq(fq); };
  const shareRoute = (r) => {
    const t = 'Bearline: ' + ST[r.from].name + ' ' + tr('to') + ' ' + ST[r.to].name + ', ' + r.minutes + ' ' + tr('min') + '. ' + r.legs.map((l) => l.line + ' ' + tr('towards') + ' ' + l.toward + ' (' + cnt('stop', l.stops) + ')').join(' > ') + '.';
    if (navigator.share) navigator.share({ text: t }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => say(tr('routeCopied')), () => say(tr('shareNA')));
    else say(tr('shareNA'));
  };
  const useMyLocation = async () => {
    say(tr('finding'));
    try {
      const p = await getPositionOnce(); const n = nearestStation(p.lat, p.lng);
      if (n.km > 6) { say(tr('noStation6')); return; }
      setFrom(n.st, { me: true, name: tr('yourLocation'), lat: p.lat, lng: p.lng }); say(tr('nearest') + ' ' + n.st.name + ' (' + fmtDist(n.km) + ')');
    } catch (err) { say(err && err.code === 1 ? tr('locDenied') : tr('gpsFail')); }
  };
  const toggleLocate = () => {
    const e = eng.current;
    if (locateOn) { locateRef.current = false; setLocateOn(false); if (!live.current.on) { e.user = null; trk.current.stop(); } e.schedule(); return; }
    locateRef.current = true; setLocateOn(true); locateFirst.current = true; trk.current.start();
    if (trk.current.last) { const f = trk.current.last, pr = project(f.lat, f.lng); e.user = { x: pr.x, y: pr.y }; e.view.cx = pr.x; e.view.cy = pr.y; e.schedule(); }
  };

  // ---------- route on map and navigation ----------
  const pushInfo = (o) => { const s = JSON.stringify(o); if (s !== lastInfo.current) { lastInfo.current = s; setInfo(o); } };
  const makeOverlay = (r) => ({ route: r, path: R.routePath(r), reveal: null, marker: null });
  const destroyReal = () => { if (real.current) { real.current.destroy(); real.current = null; } loadingRef.current = false; setLoading3d(false); };
  const resetView = () => { destroyReal(); viewRef.current = '2d'; setView('2d'); };

  const showOnMap = (r) => {
    fromPageRef.current = page; // closing the preview goes back to where it was opened
    if (!r.alt) remember(r); const o = makeOverlay(r); ov.current = o; eng.current.overlay = o; eng.current.navMode = false; setFilter('both');
    live.current.on = false; live.current.phase = 'idle'; setPaused(false); setFinished(false);
    if (r.generic) { destroyReal(); viewRef.current = 'real'; setView('real'); setTilt(false); } else resetView();
    setPage('pMap'); setSelected(-1); setMode('show');
    pushInfo({ lines: r.legs.map((l) => l.line), title: r.minutes + ' min', sub: ST[r.from].name + ' ' + tr('to') + ' ' + ST[r.to].name, pct: 0, hud: '', intro: null, off: null });
    setTimeout(() => { eng.current.resize(); eng.current.fitPoints(o.path.pts, 130, 230); if (r.generic) openReal({ fit: { top: 150, bottom: 260 } }); }, 30);
  };

  const ensureVehicle = () => { if (!vehRef.current && mapHost.current) vehRef.current = new Vehicle2D(mapHost.current, 120); };
  const dropVehicle = () => { if (vehRef.current) { vehRef.current.destroy(); vehRef.current = null; } if (eng.current) eng.current.vehicle3d = false; };
  const endNav = () => {
    const ret = mode === 'show' && fromPageRef.current !== 'pMap' ? fromPageRef.current : null;
    dropVehicle();
    if (shareRef.current) { const sh = shareRef.current; sendPos(sh, true).finally(() => stopShare(true)); }
    const L = live.current; L.on = false; L.phase = 'idle'; releaseBg();
    ov.current = null; eng.current.overlay = null; eng.current.navMode = false; resetView(); setMode('idle'); setPaused(false); setFinished(false);
    keepAwake(false);
    if (!locateRef.current) { eng.current.user = null; trk.current.stop(); }
    eng.current.fitAll();
    if (ret) setPage(ret);
  };

  /* the 3D vehicle that rides along the route in the 2D view */
  const driveVehicle = (o, p, lg, dt) => {
    const e = eng.current, v = vehRef.current;
    if (!v || viewRef.current !== '2d' || p == null) { if (v) v.hide(); e.vehicle3d = false; return; }
    const m = pointAt(o, p), kind = vehicleKind(lg.line, lg.p), ok = v.update(e.sx(m.x), e.sy(m.y), m.ang, kind, lg.c, dt);
    e.vehicle3d = ok;
  };
  const tick = useCallback((now) => {
    const L = live.current; if (!L.on) return;
    const o = ov.current, e = eng.current, r = o.route, n = r.legs.length, dt = Math.min(0.05, (now - (L.last || now)) / 1000); L.last = now;
    const last = o.path.pts.length - 1, gps = L.source === 'gps';
    if (L.phase === 'intro') {
      driveVehicle(o, o.marker, r.legs[0], dt);
      const t = (now - L.t0) / 1000, per = n === 1 ? 1.6 : Math.min(1.3, 3.2 / n), runStart = per * n + 0.3, runLen = 1.6;
      o.reveal = r.legs.map((_, i) => clamp((t - i * per) / per, 0, 1));
      const li = clamp(Math.floor(t / per), 0, n - 1), base = { lines: [], title: tr('yourRoute'), sub: ST[r.from].name + ' ' + tr('to') + ' ' + ST[r.to].name, pct: 0, hud: '', off: null };
      if (t < per * n) { o.marker = null; pushInfo({ ...base, intro: { first: li === 0, line: r.legs[li].line, toward: r.legs[li].toward } }); }
      else if (t < runStart + runLen) {
        let f = clamp((t - runStart) / runLen, 0, 1); f = f * f * (3 - 2 * f); o.marker = f * last * 0.999;
        pushInfo({ ...base, intro: { text: tr('offWeGo') } });
      } else { L.phase = 'live'; L.p = 0; L.target = 0; o.marker = 0; L.follow = true; setMode('live'); }
    }
    if (L.phase === 'live') {
      let est = false;
      if (gps) {
        // no GPS for a while (for example in a U-Bahn tunnel): keep going with the timetable estimate
        if (L.lastFixAt && Date.now() - L.lastFixAt > 12000 && L.gpsIdx < last) {
          const li0 = clamp(R.legAt(o.path, Math.min(L.gpsIdx, last - 0.001)), 0, n - 1), g0 = r.legs[li0];
          let rate = g0.stops / Math.max(60, g0.rideMin * 60);
          // underground: pace the train so it reaches the end of the leg at the live arrival time
          if (L.legEnd && L.legEndLi === li0 && L.legEnd - Date.now() > 5000) rate = Math.min(0.5, Math.max(0, o.path.legs[li0].b - L.gpsIdx) / ((L.legEnd - Date.now()) / 1000));
          L.gpsIdx = Math.min(last, L.gpsIdx + rate * dt); est = true;
        }
        L.p += (L.gpsIdx - L.p) * Math.min(1, dt * 2.5); L.target = L.p;
        const nowMs = Date.now(); L.hist = L.hist || []; L.hist.push([nowMs, L.gpsIdx]); while (L.hist.length && nowMs - L.hist[0][0] > 30000) L.hist.shift();
        const h0 = L.hist[0], moving = L.fix && (L.fix.speed == null || L.fix.speed > 0.8);
        if (nowMs - h0[0] > 12000 && L.offKm < 0.35 && moving) { const dI = L.gpsIdx - h0[1]; L.dir = dI < -0.3 ? 'bad' : dI > 0.12 ? 'ok' : null; } else if (!moving) L.dir = null;
      } else {
        if (L.adv != null) { L.p = L.target = Math.min(last, L.adv); L.adv = null; L.play = false; setPaused(true); }
        if (L.play && L.target < last && Math.abs(L.p - L.target) < 0.001) L.target = Math.min(last, Math.floor(L.p + 0.0001) + 1);
        const spd = (Math.abs(L.target - L.p) > 1.2 ? 2.6 : 0.9) * (L.mult || 1);
        if (L.p < L.target) L.p = Math.min(L.target, L.p + spd * dt);
      }
      o.marker = L.p;
      const p = L.p, li = clamp(R.legAt(o.path, Math.min(p, last - 0.001)), 0, n - 1), lg = r.legs[li], seg = o.path.legs[li];
      driveVehicle(o, p, lg, dt);
      if (L.follow && viewRef.current === '2d') {
        const m = pointAt(o, p), v = e.view, tz = e.z0 * 5.5; v.z += (tz - v.z) * 0.08; v.cx += (m.x - v.cx) * 0.12; v.cy += (m.y - v.cy) * 0.12;
      }
      const at0 = Math.floor(p + 0.03), nextPt = o.path.pts[Math.min(last, at0 + 1)], nextSt = ST[nextPt.st], endSt = ST[o.path.pts[seg.b].st];
      const walking = !!(lg.walkIn && p < seg.a + 0.97), left = walking ? lg.stops : seg.b - at0;
      const fin = p >= last - 0.03, lastLeg = li === n - 1, nl = r.legs[li + 1];
      let title, sub, hud, off = null;
      if (walking && !fin) {
        // between two stops: walk to the next boarding stop
        const dKm = L.fix && gps ? distKm(L.fix.lat, L.fix.lng, nextSt.lat, nextSt.lng) : lg.walkIn.m / 1000, dW = fmtDist(dKm);
        const near = dKm < 0.03;
        title = tr(near ? 'atStop' : 'walkToStop', { name: nextSt.name }); sub = tr(near ? 'atStopSub' : 'walkToStopSub', { d: dW, line: lg.line, toward: lg.toward, t: lg.dep ? ', ' + fmtTime(lg.dep) : '' }); hud = tr('nextHud', { next: nextSt.name });
        L.alerted = '';
      } else if (fin) {
        title = tr('arrived'); sub = ST[r.to].name; hud = ST[r.to].name;
        if (!L.done) { L.done = true; releaseBg(); if (storeRef.current.haptics) haptic([300, 120, 300]); setFinished(true); }
      } else {
        L.done = false;
        const dNext = L.fix && gps ? ' · ' + fmtDist(distKm(L.fix.lat, L.fix.lng, nextSt.lat, nextSt.lng)) : '';
        title = lg.line + ' ' + tr('towards') + ' ' + lg.toward;
        sub = left <= 1 ? (lastLeg ? tr('getOff', { end: endSt.name }) : tr('getOffChange', { end: endSt.name, line: nl.line, toward: nl.toward })) : tr('nextLine', { next: nextSt.name, d: dNext, n: left, end: endSt.name });
        if (left <= 1 && (lg.mode === 'bus' || lg.mode === 'tram')) sub += '. ' + tr('pressStop');
        hud = tr('nextHud', { next: nextSt.name });
        if (left <= 1 && L.alerted !== 'leg' + li) { L.alerted = 'leg' + li; if (storeRef.current.haptics) haptic([180, 90, 180]); if (gps) beep(); }
        if (left > 1 && L.alerted === 'leg' + li) L.alerted = '';
      }
      if (gps && L.fix && L.gpsIdx < 0.4 && L.offKm * 1000 > 80 && !fin && mayWalkBack(L)) {
        L.farSince = L.farSince || Date.now();
        if (Date.now() - L.farSince > 6000) { // walked away from the first station: back to walking mode
          dropVehicle(); releaseBg(); const sA = ST[o.path.pts[0].st], f0 = L.fix; L.on = false; L.farSince = 0; ov.current = null; e.overlay = null; e.navMode = false; resetView(); setMode('idle');
          setWalk({ from: { lat: f0.lat, lng: f0.lng }, to: { lat: sA.lat, lng: sA.lng, name: sA.name }, title: tr('walkToStation', { st: sA.name }), route: r }); return;
        }
      } else L.farSince = 0;
      if (gps && L.fix && L.offSince && Date.now() - L.offSince > 5000 && !fin) off = { atStart: L.gpsIdx < 0.4 && !L.reached && !L.boarded, fast: !!(L.boarded && L.spd != null && L.spd > 5), m: Math.round(L.offKm * 1000), name: ST[o.path.pts[0].st].name };
      const tn = L.train && L.train.li === li && L.train.line ? { line: L.train.line, dir: L.train.dir, left: fmtTime(L.train.when), diff: L.train.diffMin, other: !!L.train.other, same: L.train.line === lg.line } : null;
      pushInfo({ lines: [lg.line], title, sub, pct: Math.round(100 * p / last), hud, intro: null, off, est, train: gps ? tn : null, dir: gps ? L.dir || null : null, alert: !fin && !walking && left <= 1 ? endSt.name : null, li, left, nextName: nextSt.name, nextIdx: nextPt.st, endName: endSt.name, fin, walking });
      const legKey = li + (walking ? 'w' : '');
      if (L.legKey !== legKey) { L.legKey = legKey; L.leg = li; if (real.current) real.current.setLeg(o, li, walking); }
      if (viewRef.current === 'generic' && scene.current) scene.current.render(o, p);
    }
    if ((viewRef.current === 'real' || loadingRef.current) && real.current) { real.current.setPosition(o, L.p, now); if (gps) real.current.setUser(L.fix); }
    e.schedule();
    requestAnimationFrame(tick);
  }, []);

  const beginGps = async (r) => {
    const sA = ST[r.legs[0].stations[0]]; let pos = nav.fromPlace && !nav.fromPlace.me ? nav.fromPlace : null;
    try { const f = applyPos(trk.current.last || await getPositionOnce()); pos = { lat: f.lat, lng: f.lng }; } catch (e) { /* no position */ }
    if (pos && meters(pos, sA) > 50) { setModal(null); setPage('pMap'); setWalk({ from: pos, to: { lat: sA.lat, lng: sA.lng, name: sA.name }, title: tr('walkToStation', { st: sA.name }), route: r }); return; }
    startNav(r, 'gps', !!pos);
  };
  const startNav = (r, src, reached) => {
    if (!r.alt) remember(r); const o = makeOverlay(r); o.reveal = r.legs.map(() => 0); ov.current = o; eng.current.overlay = o; eng.current.navMode = true;
    const gen = !!r.generic;
    const L = live.current; Object.assign(L, { on: true, phase: gen ? 'live' : 'intro', source: src, p: 0, target: 0, play: true, follow: true, t0: performance.now(), last: 0, adv: null, gpsIdx: 0, offKm: 0, offSince: 0, lastFixAt: 0, alerted: '', leg: -1, legKey: '', done: false, farSince: 0, ...initRide() });
    if (reached) L.reached = true;
    if (src === 'gps' && !L.bg) { L.bg = true; bgTrack(true, ST[r.from].name + ' > ' + ST[r.to].name, ''); }
    setSource(src); setFilter('both'); setPaused(false); setFinished(false); setPage('pMap'); setSelected(-1); setModal(null);
    if (gen) {
      // no intro animation on the street map: go straight to live guidance
      dropVehicle(); if (!(real.current && real.current.route === r)) destroyReal();
      viewRef.current = 'real'; setView('real'); setTilt(false); setMode('live'); o.marker = 0;
      if (real.current) { real.current.follow = true; real.current.setTilt(false); }
    } else { ensureVehicle(); resetView(); setMode('intro'); }
    lastInfo.current = '';
    if (src === 'gps') trk.current.start();
    if (storeRef.current.awake) keepAwake(true);
    setTimeout(() => { eng.current.resize(); eng.current.fitPoints(o.path.pts, 150, 190); if (gen) openReal({}); }, 30);
    requestAnimationFrame(tick);
  };

  /* street map as the base view (flat 2D, tilt for 3D) for routes that are not only S and U */
  const openReal = async (opts) => {
    const o = ov.current; if (!o) return;
    if (real.current && real.current.route === o.route) return;
    destroyReal(); loadingRef.current = true; setLoading3d(true);
    const { RealMap3D } = await import('./realmap.js');
    const { mockLiberty } = await import('./mapstyle.js');
    if (ov.current !== o) { if (!real.current) { loadingRef.current = false; setLoading3d(false); } return; }
    const g0 = geoAt(o, 0);
    const rm = new RealMap3D(realDiv.current, {
      dark: document.body.classList.contains('dark'), flat: !(opts && opts.tilt), fit: opts && opts.fit, styleOverride: /mock=1/.test(location.hash) ? mockLiberty(g0.lng, g0.lat) : undefined,
      onReady: () => { if (real.current !== rm) return; loadingRef.current = false; setLoading3d(false); viewRef.current = 'real'; setView('real'); rm.resize(); rm.setLeg(o, Math.max(0, live.current.leg)); if (live.current.on) rm.follow = true; },
      onFail: () => { if (real.current !== rm) return; rm.destroy(); real.current = null; loadingRef.current = false; setLoading3d(false); viewRef.current = '2d'; setView('2d'); say(tr('mapFail')); if (eng.current) eng.current.fitPoints(o.path.pts, 150, 190); },
      onUserMove: () => { live.current.follow = false; },
    });
    rm.route = o.route; real.current = rm; rm.init(o);
  };

  const openGeneric = async () => {
    if (!scene.current) { const { Scene3D } = await import('./scene3d.js'); scene.current = new Scene3D(glRef.current); }
    const e = eng.current, dark = document.body.classList.contains('dark');
    scene.current.resize(e.W, e.H, e.dpr); scene.current.build(ov.current, dark); scene.current.place(ov.current, live.current.p);
    viewRef.current = 'generic'; setView('generic');
  };
  const toggle3d = async (opts) => {
    if (ov.current && ov.current.route.generic) { const t = !tilt; setTilt(t); if (real.current) real.current.setTilt(t); return; }
    if (viewRef.current !== '2d' || loadingRef.current) { resetView(); live.current.follow = true; eng.current.schedule(); return; }
    const wantReal = storeRef.current.real3d && navigator.onLine !== false;
    if (!wantReal) { if (!storeRef.current.real3d) say(tr('simple3dOff')); else say(tr('simple3dOffline')); await openGeneric(); return; }
    loadingRef.current = true; setLoading3d(true);
    const { RealMap3D } = await import('./realmap.js');
    const { mockLiberty } = await import('./mapstyle.js');
    const o = ov.current, g0 = geoAt(o, 0);
    const rm = new RealMap3D(realDiv.current, {
      dark: document.body.classList.contains('dark'), styleOverride: opts && opts.mock ? mockLiberty(g0.lng, g0.lat) : undefined,
      onReady: () => { if (real.current !== rm) return; loadingRef.current = false; setLoading3d(false); viewRef.current = 'real'; setView('real'); rm.resize(); rm.setLeg(o, Math.max(0, live.current.leg)); },
      onFail: () => { if (real.current !== rm) return; rm.destroy(); real.current = null; loadingRef.current = false; setLoading3d(false); say(tr('city3dFail')); openGeneric(); },
      onUserMove: () => { live.current.follow = false; },
    });
    real.current = rm; rm.init(o);
  };

  const startWalkOnly = async (w) => {
    let from = w.from;
    try { const f = applyPos(trk.current.last || await getPositionOnce()); from = { lat: f.lat, lng: f.lng }; } catch (e) { /* use the start of the journey */ }
    setPage('pMap'); setWalk({ from, to: w.to, title: w.to.name || tr('walkTo2s', { place: '' }) });
  };

  const onPlay = () => {
    const L = live.current;
    if (finished && L.source === 'demo') { L.p = 0; L.target = 0; L.play = true; L.follow = true; setPaused(false); setFinished(false); return; }
    L.play = !L.play; setPaused(!L.play);
  };
  const onNext = () => { const L = live.current, last = ov.current.path.pts.length - 1; L.target = Math.min(last, Math.floor(L.p + 0.0001) + 1); L.follow = true; };
  const onRecenter = () => { live.current.follow = true; if (real.current) real.current.recenter(); };
  const reroute = async () => {
    const L = live.current, f = L.fix, dest = ov.current.route.to; if (!f) return;
    if (ov.current.route.generic) {
      try {
        const a = await nearbyStop(f.lat, f.lng), d = placeOf(ST[dest]) || ST[dest].name;
        const list = await journeys(a, d, { results: 3, stopovers: true, when: Date.now() });
        const hit = list.map((j) => journeyToRoute(j)).find((c) => c.route);
        if (!hit) { say(tr('noRouteHere')); return; }
        L.on = false; startNav(hit.route, 'gps'); say(tr('newRouteFrom') + ' ' + a.name);
      } catch (e) { say(tr('noRouteHere')); }
      return;
    }
    const n = nearestStation(f.lat, f.lng).st;
    if (n.i === dest) { say(tr('alreadyThere')); return; }
    const rs = R.routes(n.i, dest); if (!rs.length) { say(tr('noRouteHere')); return; }
    L.on = false; startNav(rs[0], 'gps'); say(tr('newRouteFrom') + ' ' + n.name);
  };

  // automatic calibration while navigating: the averaged GPS position moves onto the route when it is close to it (always when riding fast)
  const calibAuto = {
    getRaw: () => live.current.raw,
    snap: (A, moving) => { const o = ov.current; if (!o) return null; const sn = snapToRoute(o, A.lat, A.lng, null), g = geoAt(o, sn.idx); return { lat: g.lat, lng: g.lng, m: sn.km * 1000, max: moving ? 160 : 35 }; },
  };

  // ---------- test hook: #from=A&to=B&act=show|start&gps=1&p=pNav&f=S&sel=Name&zoom=2&skip=1&adv=3&d3=300&mock=1&dark=1 ----------
  useEffect(() => {
    const h = location.hash.slice(1); if (!h) return;
    const q = {}; h.split('&').forEach((kv) => { const a = kv.split('='); q[a[0]] = decodeURIComponent(a[1] || ''); });
    const from = q.from ? R.byName(q.from) : null, to = q.to ? R.byName(q.to) : null; let routes = [];
    if (q.dark) setStore((s) => ({ ...s, theme: 'dark' })); if (q.light) setStore((s) => ({ ...s, theme: 'light' }));
    if (q.f) setFilter(q.f);
    if (from) setFrom(from); if (to) setTo(to);
    if (from && to) routes = R.routes(from.i, to.i);
    setTimeout(() => {
      if (q.sel) selectStation(R.byName(q.sel).i, true);
      if (q.zoom && eng.current) { eng.current.view.z = eng.current.z0 * +q.zoom; eng.current.schedule(); }
      if (q.act === 'show' && routes.length) showOnMap(routes[+(q.r || 0)]);
      if (q.act === 'start' && routes.length) {
        startNav(routes[+(q.r || 0)], q.gps ? 'gps' : 'demo');
        if (q.skip) live.current.t0 -= 1e5;
        if (q.adv) live.current.adv = +q.adv;
        if (q.d3) setTimeout(() => toggle3d({ mock: !!q.mock }), +q.d3);
      }
      if (q.locate) toggleLocate();
      if (q.modal) { if (q.bn) setBoardName(q.bn); setModal(q.modal); }
      if (q.lang) setStore((o) => ({ ...o, lang: q.lang }));
      if (q.home) setStore((o) => ({ ...o, home: q.home, work: q.work || '', fav: q.fav ? q.fav.split('|') : o.fav }));
      if (q.nosplash) setBooted(true);
      if (q.net) setNet(q.net);
      if (q.walk) { const [a, b, c, d] = q.walk.split(',').map(Number); setPage('pMap'); setWalk({ from: { lat: a, lng: b }, to: { lat: c, lng: d, name: 'Test place' }, title: 'Test place' }); }
      if (q.when) setWhen({ mode: q.when, ts: Date.now() + (+q.wm || 30) * 60000 });
      if (q.p) setPage(q.p);
    }, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- render ----------
  const navActive = mode !== 'idle';
  const gen = !!(navActive && ov.current && ov.current.route.generic); // the route uses bus, tram or regional trains: street map instead of the schematic map
  const sel = selected >= 0 ? ST[selected] : null;
  const isFav = !!(sel && store.fav.indexOf(sel.name) >= 0);
  const gpsNav = mode === 'live' || mode === 'intro';
  const openModal = (k) => { if (k === 'trip') { shareTrip(); return; } if (k === 'share') { const t = 'Bearline: ' + tr('tagline'); if (navigator.share) navigator.share({ text: t }).catch(() => {}); else say(tr('shareNA')); return; } setModal(k); };
  const nearName = (() => { try { const f = live.current.fix || trk.current.last; return f ? nearestStation(f.lat, f.lng).st.name : ''; } catch (e) { return ''; } })();
  const assistGo = (f, t) => {
    if (f) { if (f.place) pickPlace('from', f.place); else setFrom(f.st); }
    if (t.place) pickPlace('to', t.place); else setTo(t.st);
    setModal(null); setPage('pNav');
  };
  const onCmd = (it) => {
    if (it.type === 'theme') { setStore((o) => ({ ...o, theme: it.theme })); closeModal(); say(tr(it.theme === 'dark' ? 'asDark' : 'asLight')); return; }
    if (it.type === 'page') { closeModal(); setPage(it.page); return; }
    if (it.type === 'departures') { closeModal(); setTimeout(() => openBoard(it.name), 120); return; }
    if (it.type === 'start') {
      closeModal();
      if (ov.current && mode === 'show') { beginGps(ov.current.route); return; }
      const r = navV.routes && navV.routes[navV.sel || 0]; if (r) showOnMap(r); else say(tr('asNoRoute'));
    }
  };
  const openExits = (name, lat, lng, dest) => { setEntInfo({ name, lat, lng, dest: dest || null }); setModal('ent'); };
  const sendPos = async (sh, ended) => {
    const f = live.current.fix || trk.current.last;
    if (!f && !ended) return;
    const last = sh.last;
    if (!ended && last && meters(last, f) < 25 && Date.now() - last.t < 120000) return;
    try {
      await fetch(SHARE_API + '/api/trip/' + sh.id, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-key': sh.key }, body: JSON.stringify({ lat: f && f.lat, lng: f && f.lng, acc: f && f.acc, label: sh.label, ended: !!ended }) });
      if (f) sh.last = { lat: f.lat, lng: f.lng, t: Date.now() };
    } catch (e) { /* offline, try again next tick */ }
  };
  const stopShare = (silent) => {
    const sh = shareRef.current; if (!sh) return;
    fetch(SHARE_API + '/api/trip/' + sh.id, { method: 'DELETE', headers: { 'x-key': sh.key } }).catch(() => {});
    shareRef.current = null; setShare(null); try { localStorage.removeItem('bl_share'); } catch (e) { /* ignore */ }
    if (!silent) say(tr('shareLiveOff'));
  };
  const startShare = async () => {
    const r = navV.routes && navV.routes[navV.sel || 0];
    try {
      const j = await (await fetch(SHARE_API + '/api/trip', { method: 'POST' })).json(); if (!j.id) throw new Error('x');
      const sh = { id: j.id, key: j.key, url: SHARE_API + '/t/' + j.id, label: r ? ST[r.from].name + ' > ' + ST[r.to].name : 'Bearline', last: null };
      shareRef.current = sh; setShare(sh); try { localStorage.setItem('bl_share', JSON.stringify({ id: sh.id, key: sh.key, t: Date.now() })); } catch (e) { /* ignore */ }
      sendPos(sh);
      const t = tr('shareLiveText') + ' ' + sh.url;
      if (navigator.share) navigator.share({ text: t, url: sh.url }).catch(() => {}); else if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => say(tr('routeCopied')), () => {});
    } catch (e) { say(tr('shareLiveFail')); }
  };
  const shareTrip = () => {
    if (SHARE_API) { if (shareRef.current) { const u = shareRef.current.url; if (navigator.share) navigator.share({ text: tr('shareLiveText') + ' ' + u, url: u }).catch(() => {}); return; } startShare(); return; }
    const r = navV.routes && navV.routes[navV.sel || 0], f = live.current.fix || trk.current.last;
    const base = 'https://nvrmr098.github.io/Navigation_App_Berlin/';
    let t = 'Bearline';
    if (r) t += ': ' + ST[r.from].name + ' ' + tr('to') + ' ' + ST[r.to].name + ', ' + r.minutes + ' ' + tr('min') + '.\n' + base + '#nosplash=1&from=' + encodeURIComponent(ST[r.from].name) + '&to=' + encodeURIComponent(ST[r.to].name);
    if (f) t += '\n' + tr('shareNow') + ': https://www.openstreetmap.org/?mlat=' + f.lat.toFixed(5) + '&mlon=' + f.lng.toFixed(5) + '#map=17/' + f.lat.toFixed(5) + '/' + f.lng.toFixed(5);
    if (!r && !f) { say(tr('tkNoRoute')); return; }
    if (navigator.share) navigator.share({ text: t }).catch(() => {}); else if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => say(tr('routeCopied')), () => say(tr('shareNA'))); else say(tr('shareNA'));
  };
  const openBoard = (name, at, all) => { setBoardName(name); setBoardOpts(at ? { at, all: !!all } : null); setModal('board'); };
  const setDest = (name) => {
    const s = R.byName(name);
    if (s) { setTo(s); setPage('pNav'); return; }
    const k = name === store.home ? 'home' : name === store.work ? 'work' : '', at = k && store[k + 'At'];
    if (at) { pickPlace('to', { place: true, name, lat: at.lat, lng: at.lng }); setPage('pNav'); }
  };
  const saveAs = (k) => {
    const pl = nav.toPlace, nm = pl ? pl.name : nav.to && nav.to.name; if (!nm) return;
    const has = store[k] === nm;
    setStore((o) => ({ ...o, [k]: has ? '' : nm, [k + 'At']: has ? null : pl ? { lat: pl.lat, lng: pl.lng } : null })); say(has ? tr('removed') : tr('savedAsMsg', { k: tr(k), n: nm }));
  };
  const saveCommute = () => {
    if (!nav.from || !nav.to) return; const a = nav.from.name, b = nav.to.name;
    const has = (store.commutes || []).some((c) => c[0] === a && c[1] === b);
    setStore((o) => ({ ...o, commutes: has ? (o.commutes || []).filter((c) => !(c[0] === a && c[1] === b)) : [[a, b], ...(o.commutes || [])].slice(0, 4) })); say(has ? tr('removed') : tr('commuteSaved'));
  };
  const resetNav = () => { setNav({ from: null, to: null, routes: [], sel: 0 }); setFq(''); setTq(''); setWhen({ mode: 'now', ts: 0 }); };
  const toggleFavSel = () => { const nme = sel.name, has = store.fav.indexOf(nme) >= 0; setStore((s) => ({ ...s, fav: has ? s.fav.filter((x) => x !== nme) : [nme, ...s.fav] })); say(has ? tr('favRemoved') : tr('favAdded')); };
  const setPlace = (k) => { const nme = sel.name; setStore((s) => ({ ...s, [k]: s[k] === nme ? '' : nme })); say(store[k] === nme ? tr('removed') : tr(k) + ': ' + nme); };
  const modalOpen = !!modal;
  const closeModal = () => setModal(null);

  // layers: tab page, route preview or navigation, walking view, sheet. Every layer is one history entry, so the phone's back key closes the top one.
  const depth = (page !== 'pMap' ? 1 : 0) + (navActive ? 1 : 0) + (walk ? 1 : 0) + (modalOpen ? 1 : 0);
  closeTopRef.current = () => {
    const L = live.current;
    if (modalOpen) { closeModal(); return; }
    if (walk) { setWalk(null); return; }
    if (navActive && page === 'pMap') {
      if (mode === 'show') { endNav(); return; }
      const now = Date.now();
      if (L.backAt && now - L.backAt < 2500) { L.backAt = 0; endNav(); return; }
      L.backAt = now; say(tr('backAgain')); try { history.pushState({ bl: 'k' }, ''); histRef.current.pushed++; } catch (e) { /* ignore */ }
      return;
    }
    if (page !== 'pMap') { setPage('pMap'); return; }
    if (navActive) endNav();
  };
  const [popTick, setPopTick] = useState(0); // a back press can close a layer and open another one at the same depth: the history needs a fresh entry then
  useEffect(() => {
    const h = histRef.current;
    try {
      if (depth > h.pushed) { for (let i = h.pushed; i < depth; i++) history.pushState({ bl: i + 1 }, ''); h.pushed = depth; }
      else if (depth < h.pushed) { const n = h.pushed - depth; h.ignore += n; h.pushed = depth; history.go(-n); }
    } catch (e) { /* history not available */ }
  }, [depth, popTick]);
  useEffect(() => {
    const onPop = () => { const h = histRef.current; if (h.ignore > 0) { h.ignore--; return; } if (h.pushed > 0) h.pushed--; if (closeTopRef.current) closeTopRef.current(); setPopTick((t) => t + 1); };
    window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop);
  }, []);

  const mineChips = [];
  if (store.home) mineChips.push(['home', store.home]);
  if (store.work) mineChips.push(['work', store.work]);
  store.fav.forEach((n) => mineChips.push(['star', n]));

  return (
    <div id="app" className={VOICE_ASSISTANT ? 'withmic' : ''}>
      <section className={'page' + (page === 'pMap' ? ' on' : '')} id="pMap" ref={mapHost}>
        <canvas id="cv" ref={cvRef} style={{ display: view === '2d' ? 'block' : 'none' }} />
        <canvas id="gl" ref={glRef} style={{ display: view === 'generic' ? 'block' : 'none' }} />
        <div id="real" ref={realDiv} style={{ display: view === 'real' || loading3d ? 'block' : 'none', visibility: view === 'real' ? 'visible' : 'hidden' }} />

        {net !== 'rail' && (
          <React.Suspense fallback={null}>
            <ModeMap kind={net} dark={document.body.classList.contains('dark')} lang={store.lang} onBoard={openBoard} />
          </React.Suspense>
        )}
        <div id="top" className={navActive ? 'hide' : ''}>
          {net === 'rail' && (
            <div className="sbox">
              <Ico n="search" className="ic" />
              <SearchBox value={mq} onChange={setMq} store={store} ddTop={58} placeholder={tr('searchStation')} places
                onPick={(s) => { if (s.place) { showPlace(s); return; } setMq(s.name); filterFor(s); selectStation(s.i, true); }} />
              {mq && <button className="clr" aria-label={tr('clear')} onClick={() => setMq('')}><Ico n="close" /></button>}
            </div>
          )}
          <div className="trow2">
            {net === 'rail' ? (
              <div className="sbox">
                <Ico n="search" className="ic" />
                <SearchBox value={mq} onChange={setMq} store={store} ddTop={58} placeholder={tr('searchStation')} places
                  onPick={(s) => { if (s.place) { showPlace(s); return; } setMq(s.name); filterFor(s); selectStation(s.i, true); }} />
                {mq && <button className="clr" aria-label={tr('clear')} onClick={() => setMq('')}><Ico n="close" /></button>}
              </div>
            ) : <div className="netname glass">{tr({ tram: 'netTram', bus: 'netBus', re: 'netRe' }[net])}</div>}
            <button className={'optbtn glass' + (net !== 'rail' || filter !== 'both' ? ' dot' : '') + (optOpen ? ' on' : '')} aria-label={tr('mapOpts')} aria-expanded={optOpen} onClick={() => setOptOpen((o) => !o)}><Ico n="sliders" /></button>
            <BerlinClock lang={store.lang} />
          </div>
          {optOpen && (
            <div className="optpop glass" role="group" aria-label={tr('mapOpts')}>
              <small>{tr('mapNetwork')}</small>
              <div className="seg netseg">
                {[['rail', 'netRail'], ['tram', 'netTram'], ['bus', 'netBus'], ['re', 'netRe']].map((n) => <button key={n[0]} className={net === n[0] ? 'on' : ''} onClick={() => { setNet(n[0]); setSelected(-1); if (n[0] !== 'rail') setOptOpen(false); }}>{tr(n[1])}</button>)}
              </div>
              {net === 'rail' && (<>
                <small>{tr('mapLines')}</small>
                <div className="seg" id="filters">
                  <button className={filter === 'both' ? 'on' : ''} onClick={() => setFilter('both')}>S + U</button>
                  <button className={filter === 'S' ? 'on' : ''} onClick={() => setFilter('S')}><span className="bdg S" style={{ background: '#3d9a4a' }}>S</span><span className="fl">S-Bahn</span></button>
                  <button className={filter === 'U' ? 'on' : ''} onClick={() => setFilter('U')}><span className="bdg U" style={{ background: '#1670b8' }}>U</span><span className="fl">U-Bahn</span></button>
                </div>
              </>)}
            </div>
          )}
          {net === 'rail' && !navActive && !optOpen && (
            <div className="pinrow one">
              {mineChips.map((m) => <button key={m[0] + m[1]} className="chip glass" onClick={() => { const s = R.byName(m[1]), at = (m[0] === 'home' || m[0] === 'work') && store[m[0] + 'At']; if (s) { filterFor(s); selectStation(s.i, true); } else if (at) showPlace({ name: m[1], lat: at.lat, lng: at.lng }); }}><Ico n={m[0]} className="s" />{m[1]}</button>)}
              {POPULAR.map((pl) => <button key={pl.name} className="chip glass" onClick={() => showPlace(pl)}><Ico n="pinmark" className="s" />{pl.name}</button>)}
            </div>
          )}
        </div>

        {navActive && (
          <div id="navbar" className="glass">
            <div className="l1"><span>{info.lines.map((l) => <React.Fragment key={l}><Badge line={l} big />{' '}</React.Fragment>)}</span><span>{info.title}</span></div>
            <div className="l2">{info.sub}</div>
            <div className="bar"><i style={{ width: info.pct + '%' }} /></div>
          </div>
        )}
        {mode === 'show' && ov.current && <RouteNotes lat={ST[ov.current.route.from].lat} lng={ST[ov.current.route.from].lng} />}
        {mode === 'live' && source === 'gps' && !info.fin && info.nextName && ov.current && (
          <TripLive info={info} route={ov.current.route} onData={(st, li) => { const L = live.current; L.legEnd = (L.train && L.train.li === li && L.train.endArr) || (st.trip ? st.trip.legEnd : 0); L.legEndLi = li; }} />
        )}
        {gpsNav && (
          <div className={'gpschip glass ' + (source === 'gps' ? (info.est ? 'weak' : gpsStatus) : 'demo')}><i />{source === 'gps' ? (info.est ? tr('noGpsEst') : tr('chip_' + gpsStatus)) : tr('demoRide')}</div>
        )}
        {share && (
          <div className="sharebar glass"><span className="rdot" /><span>{tr('shareLiveOn')}</span><button onClick={() => { sendPos(shareRef.current, true).finally(() => stopShare()); }}>{tr('shareLiveStop')}</button></div>
        )}
        {mode === 'live' && info.alert && (
          <div className="offbanner glass"><Ico n="bell" /><span>{tr('getoffBanner', { st: info.alert })}</span></div>
        )}
        {mode === 'live' && info.train && !info.off && (
          <div className="trainchip glass" data-testid="trainchip">
            <Badge line={info.train.line} />
            <span className="tcx"><b>{tr('trainOn', { line: info.train.line, dir: info.train.dir })}</b>
              <small>{tr('trainLeft', { t: info.train.left })}{info.train.diff >= 1 ? ' · ' + tr('trainEarlier', { n: info.train.diff }) : info.train.diff <= -1 ? ' · ' + tr('trainLater', { n: -info.train.diff }) : ''}{info.train.other ? ' · ' + tr('trainOther') : ''}</small></span>
          </div>
        )}
        {mode === 'live' && info.dir && !info.off && (
          <div className={'dirchip ' + info.dir}><Ico n={info.dir === 'ok' ? 'check' : 'uturn'} /><span>{info.dir === 'ok' ? tr('dirOk') : tr('dirBadTrain')}</span></div>
        )}
        {loading3d && <div className="loading3d glass"><span className="spin" />{tr('loading3d')}</div>}

        {info.off && mode === 'live' && (
          <div className="alert glass">
            {info.off.atStart
              ? <><b>{tr('headTo', { name: info.off.name })}</b><span>{tr('fromStart', { d: fmtDist(info.off.m / 1000) })}</span></>
              : <><b>{tr('offRoute')}</b><span>{tr(info.off.fast ? 'offTrainSub' : 'offRouteSub', { d: fmtDist(info.off.m / 1000) })}</span><button className="btn sm" onClick={reroute}><Ico n="nav" />{tr('newRouteHere')}</button></>}
          </div>
        )}


        <div id="fabs" hidden={net !== 'rail'} style={sel ? { bottom: 'calc(var(--dock) + 296px)' } : navActive ? { bottom: 'calc(var(--dock) + 100px)' } : undefined}>
          {mode === 'live' && <button className="fab glass lg" aria-label="2D / 3D" onClick={() => toggle3d()}><Ico n={(gen ? !tilt : view === '2d') ? 'cube' : 'flat'} />{(gen ? !tilt : view === '2d') ? '3D' : '2D'}</button>}
          {!navActive && <button className={'fab glass' + (locateOn ? ' on' : '')} aria-label={tr('myLocation')} onClick={toggleLocate}><Ico n="locate" /></button>}
          {(view === '2d' || (gen && view === 'real')) && <button className="fab glass" aria-label="+" onClick={() => { if (gen && real.current) { real.current.zoomBy(1); return; } live.current.follow = false; eng.current.zoomBy(1.6); }}>+</button>}
          {(view === '2d' || (gen && view === 'real')) && <button className="fab glass" aria-label="-" onClick={() => { if (gen && real.current) { real.current.zoomBy(-1); return; } live.current.follow = false; eng.current.zoomBy(1 / 1.6); }}>&minus;</button>}
          {(view === '2d' || (gen && view === 'real')) && <button className="fab glass" aria-label={tr('wholeNetwork')} onClick={() => { live.current.follow = false; if (gen && real.current) { real.current.follow = false; real.current.fit(ov.current, { top: 150, bottom: 260 }); return; } if (ov.current) eng.current.fitPoints(ov.current.path.pts, 150, 190); else eng.current.fitAll(); }}><Ico n="map" /></button>}
        </div>

        {mode === 'intro' && info.intro && (
          <div id="intro"><span className="glass">{info.intro.text ? info.intro.text : <>{info.intro.first ? tr('take') : tr('then')} <Badge line={info.intro.line} big /> {tr('towards')} {info.intro.toward}</>}</span></div>
        )}
        {mode === 'live' && !info.off && !finished && <div id="hud"><span>{info.hud}</span></div>}

        {mode === 'live' && finished && source === 'gps' && !(gen && /^(bus|tram|ferry)$/.test(ov.current.route.legs[ov.current.route.legs.length - 1].mode)) && (
          <button className="btn alt endexit" onClick={() => { const sB = ST[ov.current.route.to]; openExits(sB.name, sB.lat, sB.lng, nav.toPlace || null); }}><Ico n="door" />{tr('entTitle')}</button>
        )}
        {mode === 'live' && finished && source === 'gps' && nav.toPlace && (
          <button className="btn endwalk" onClick={() => { const f = live.current.fix, o = ov.current, sB = ST[o.route.to]; setWalk({ from: f ? { lat: f.lat, lng: f.lng } : { lat: sB.lat, lng: sB.lng }, to: nav.toPlace, title: nav.toPlace.name }); }}><Ico n="walk" />{tr('walkTo2s', { place: nav.toPlace.name })}</button>
        )}
        {(mode === 'live' || mode === 'show') && (
          <div id="navctl">
            {mode === 'live' && source === 'demo' && <button className="btn alt" onClick={onPlay}><Ico n={finished || paused ? 'play' : 'pause'} />{finished ? tr('replay') : paused ? tr('resume') : tr('pause')}</button>}
            {mode === 'live' && source === 'demo' && <button className="btn alt sq2" aria-label="Speed" onClick={() => setMult((m) => (m >= 4 ? 1 : m * 2))}>{mult}x</button>}
            {mode === 'live' && source === 'demo' && <button className="btn" onClick={onNext}><Ico n="next" />{tr('nextShort')}</button>}
            {mode === 'live' && source === 'gps' && <button className={'btn alt sq2' + (hasCalib() ? ' on' : '')} aria-label={tr('calibrate')} onClick={() => { askMotion(); setModal('calib'); }}><Ico n="crosshair" /></button>}
            {mode === 'live' && source === 'gps' && <button className="btn alt sq2" aria-label={tr('shareTrip')} onClick={shareTrip}><Ico n="share" /></button>}
            {mode === 'live' && source === 'gps' && <button className="btn" onClick={onRecenter}><Ico n="locate" />{tr('recenter')}</button>}
            {mode === 'show' && <button className="btn" style={{ flex: 2 }} onClick={() => beginGps(ov.current.route)}><Ico n="nav" />{tr('startNav')}</button>}
            <button className="btn alt" style={mode === 'show' ? { flex: 1 } : undefined} onClick={endNav}><Ico n="close" />{mode === 'show' ? tr('closeRoute') : tr('end')}</button>
          </div>
        )}

        <div className={'sheet glass' + (sel && !navActive && net === 'rail' ? ' on' : '')}>
          <button className="x" aria-label={tr('close')} onClick={() => setSelected(-1)}><Ico n="close" /></button>
          <h3>{sel ? sel.name : ''}</h3>
          <div className="row">{sel && sel.lines.map((l) => <Badge key={l} line={l} />)}</div>
          <div className="acts">
            <button className="btn alt" onClick={() => { setFrom(sel); setSelected(-1); setPage('pNav'); }}>{tr('fromHere')}</button>
            <button className="btn" onClick={() => { setTo(sel); setSelected(-1); setPage('pNav'); }}>{tr('goHere')}</button>
          </div>
          <div className="acts sub">
            <button className={'btn alt sm' + (sel && store.home === sel.name ? ' on' : '')} onClick={() => setPlace('home')}><Ico n="home" />{tr('home')}</button>
            <button className={'btn alt sm' + (sel && store.work === sel.name ? ' on' : '')} onClick={() => setPlace('work')}><Ico n="work" />{tr('work')}</button>
            <button className={'btn alt sm' + (isFav ? ' on' : '')} onClick={toggleFavSel}><Ico n="star" />{tr('favourite')}</button>
          </div>
          <div className="acts sub">
            <button className="btn alt sm" onClick={() => openBoard(sel.name, null, true)}><Ico n="train" />{tr('liveDepArr')}</button>
            <button className="btn alt sm" onClick={() => openExits(sel.name, sel.lat, sel.lng)}><Ico n="door" />{tr('entTitle')}</button>
          </div>
        </div>
      </section>

      <NavPage on={page === 'pNav'} nav={navV} fq={fq} tq={tq} store={store} when={when}
        setFq={(v) => { setFq(v); if (nav.from) clearRoutes('from'); }} setTq={(v) => { setTq(v); if (nav.to) clearRoutes('to'); }}
        onPickFrom={(s) => { if (s.place) { pickPlace('from', s); return; } setFrom(s); if (!navRef.current.to) setTimeout(() => document.querySelectorAll('#pNav .fld input')[1]?.focus(), 60); }} onPickTo={(s) => (s.place ? pickPlace('to', s) : setTo(s))}
        onSwap={swap} onSelect={(i) => setNav((n) => ({ ...n, sel: i }))} onShow={showOnMap} onStart={showOnMap} onWalk={startWalkOnly} onShare={shareRoute} onBack={() => setPage('pMap')} onReset={resetNav} onSaveAs={saveAs} onSaveCommute={saveCommute} onModal={setModal}
        onTime={() => setModal('time')} onBoard={openBoard} onPlaces={() => setModal('places')} onSetDest={setDest} onPickPlace={(pl) => pickPlace('to', pl)}
        onChipStation={(name) => { const s = R.byName(name); if (!nav.from) setFrom(s); else setTo(s); }}
        onChipTrip={(r) => { const a = R.byName(r[0]), b = R.byName(r[1]); setNav({ from: a, to: b, routes: R.routes(a.i, b.i), sel: 0 }); setFq(a.name); setTq(b.name); }}
        onLocate={useMyLocation} />
      <NearbyPage on={page === 'pNear'} store={store} setStore={setStore} say={say} onBoard={openBoard}
        onGo={(s) => { setTo(s); setPage('pNav'); }} onOnMap={(i) => { setPage('pMap'); selectStation(i, true); }}
        onGoPlace={(pl) => { pickPlace('to', pl); setPage('pNav'); }} onModeMap={(k) => { setNet(k); setPage('pMap'); }} onModal={setModal} onBack={() => setPage('pMap')} />
      <MorePage on={page === 'pMore'} store={store} setStore={setStore} open={openModal} toast={say} gpsStatus={gpsStatus} onBack={() => setPage('pMap')} />
      {VOICE_ASSISTANT && <button className="fab glass micg" aria-label={tr('asTitle')} onClick={() => setModal('assistmic')}><Ico n="mic" /></button>}

      <nav id="dock" className="glass">
        <span className="thumb" style={{ transform: 'translateX(' + PAGES.indexOf(page) * 100 + '%)' }} />
        <button className={page === 'pMap' ? 'on' : ''} onClick={() => setPage('pMap')}><Ico n="map" />{tr('map')}</button>
        <button className={page === 'pNav' ? 'on' : ''} onClick={() => setPage('pNav')}><Ico n="nav" />{tr('navigate')}</button>
        <button className={page === 'pNear' ? 'on' : ''} onClick={() => setPage('pNear')}><Ico n="radar" />{tr('nearby')}</button>
        <button className={page === 'pMore' ? 'on' : ''} onClick={() => setPage('pMore')}><Ico n="more" />{tr('more')}</button>
      </nav>

      <div className={'modal' + (modalOpen ? ' on' : '')} onPointerDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
        <div className="box">
          <div className="grab" />
          <div className="mhead"><BackBtn onClick={closeModal} /></div>
          {modal === 'ent' && entInfo
            ? <EntrancesModal name={entInfo.name} lat={entInfo.lat} lng={entInfo.lng} dest={entInfo.dest} onWalk={(en) => { const f = live.current.fix || trk.current.last; if (!f) { say(tr('gpsFail')); return; } closeModal(); setPage('pMap'); setWalk({ from: { lat: f.lat, lng: f.lng }, to: { lat: en.lat, lng: en.lng, name: entInfo.name }, title: entInfo.name }); }} />
            : modal === 'calib'
              ? <CalibModal route={ov.current && ov.current.route} raw={live.current.raw} fix={live.current.fix} auto={calibAuto} onDone={(msg) => { const L = live.current; if (L.raw) { L.fix = applyPos(L.raw); if (ov.current) { const sn = snapToRoute(ov.current, L.fix.lat, L.fix.lng, null); L.gpsIdx = sn.idx; L.offKm = sn.km; L.offSince = 0; } } closeModal(); say(msg); }} />
              : <ModalContent kind={modal} store={store} setStore={setStore} board={boardName} boardOpts={boardOpts} when={when} say={say} nav={navV} stNames={[nav.from && nav.from.name, nav.to && nav.to.name, nearName].filter((x, i, a) => x && a.indexOf(x) === i)} onAssist={assistGo} onCmd={onCmd} onModal={setModal}
              onFav={(n, at) => { closeModal(); setPage('pMap'); const s = R.byName(n); if (s) { filterFor(s); selectStation(s.i, true); } else if (at) showPlace({ name: n, lat: at.lat, lng: at.lng }); }}
              onLang={(id) => { setStore((o) => ({ ...o, lang: id })); closeModal(); }}
              onApplyTime={(w) => { setWhen(w); closeModal(); }}
              onTrip={(r) => { closeModal(); const a = R.byName(r[0]), b = R.byName(r[1]); setNav({ from: a, to: b, routes: R.routes(a.i, b.i), sel: 0 }); setFq(a.name); setTq(b.name); setPage('pNav'); }} />}
          <div style={{ marginTop: 16 }}><button className="btn alt" style={{ width: '100%' }} onClick={closeModal}>{tr('close')}</button></div>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
      {walk && (
        <React.Suspense fallback={null}>
          <WalkView key={walk.title} say={say} toStation={!!walk.route} from={walk.from} to={walk.to} title={walk.title} dark={document.body.classList.contains('dark')}
            onClose={() => setWalk(null)} onArrive={() => { const w = walk; setWalk(null); if (w.route) startNav(w.route, 'gps', true); }} />
        </React.Suspense>
      )}
      {!booted && <Splash onDone={() => setBooted(true)} />}
    </div>
  );
}
