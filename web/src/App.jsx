import React, { useCallback, useEffect, useRef, useState } from 'react';
import { R, ST, clamp, pointAt } from './net.js';
import { MapEngine } from './mapEngine.js';
import { GpsTracker, project, distKm, nearestStation, snapToRoute, geoAt, getPositionOnce, haptic, keepAwake } from './geo.js';
import { Badge, SearchBox, Ico, Splash, BerlinClock } from './ui.jsx';
import { NavPage, MorePage, NearbyPage, ModalContent, StartSheet } from './pages.jsx';
import { setLang, tr, cnt, fmtTime } from './i18n.js';

const loadStore = () => {
  const base = { theme: 'auto', lang: 'en', home: '', work: '', fav: [], rec: [], lbl: true, step: false, real3d: true, awake: true, haptics: true };
  try {
    const raw = localStorage.getItem('br1') || localStorage.getItem('bl1');
    if (raw) { const o = JSON.parse(raw); Object.assign(base, o); if (o.dark && !o.theme) base.theme = 'dark'; }
  } catch (e) { /* storage may be unavailable */ }
  return base;
};
const fmtDist = (km) => (km < 1 ? Math.round(km * 1000 / 10) * 10 + ' m' : km.toFixed(1) + ' km');
const PAGES = ['pMap', 'pNav', 'pNear', 'pMore'];

export default function App() {
  const [store, setStore] = useState(loadStore);
  setLang(store.lang);
  const [booted, setBooted] = useState(false);
  const [when, setWhen] = useState({ mode: 'now', ts: 0 });
  const [boardName, setBoardName] = useState('');
  const [page, setPage] = useState('pMap');
  const [filter, setFilter] = useState('both');
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
  const [startOffer, setStartOffer] = useState(null);
  const [toast, setToast] = useState('');

  const cvRef = useRef(null), glRef = useRef(null), realDiv = useRef(null), eng = useRef(null), scene = useRef(null), real = useRef(null), trk = useRef(null);
  const ov = useRef(null);
  const live = useRef({ on: false, phase: 'idle', source: 'demo', p: 0, target: 0, play: true, follow: true, t0: 0, last: 0, adv: null, fix: null, lastFixAt: 0, gpsIdx: 0, offKm: 0, offSince: 0, alerted: '', leg: -1, done: false });
  const viewRef = useRef('2d'), loadingRef = useRef(false), lastInfo = useRef(''), toastT = useRef(0), storeRef = useRef(store);
  const locateRef = useRef(false), locateFirst = useRef(false), navRef = useRef(nav);
  storeRef.current = store; navRef.current = nav;

  const say = useCallback((t) => { setToast(t); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(''), 2400); }, []);

  // ---------- persistence and theme ----------
  useEffect(() => { try { localStorage.setItem('bl1', JSON.stringify(store)); } catch (e) { /* ignore */ } if (eng.current) { eng.current.lbl = !!store.lbl; eng.current.schedule(); } }, [store]);
  useEffect(() => {
    const mqd = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = store.theme === 'dark' || (store.theme === 'auto' && mqd.matches);
      document.body.classList.toggle('dark', dark);
      const tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.content = dark ? '#090b12' : '#f2f4fa';
      try { window.AndroidBridge && window.AndroidBridge.setTheme && window.AndroidBridge.setTheme(dark); } catch (e) { /* not in the app */ }
      if (eng.current) eng.current.schedule();
      if (viewRef.current === 'generic' && scene.current && ov.current) scene.current.build(ov.current, dark);
    };
    apply(); mqd.addEventListener('change', apply); return () => mqd.removeEventListener('change', apply);
  }, [store.theme]);

  useEffect(() => { document.documentElement.lang = store.lang; }, [store.lang]);

  // ---------- map engine and GPS tracker ----------
  useEffect(() => {
    const e = new MapEngine(cvRef.current, { onTap: (i) => setSelected(i), onManual: () => { live.current.follow = false; } });
    eng.current = e; e.lbl = !!storeRef.current.lbl;
    const onResize = () => { e.resize(); if (scene.current) scene.current.resize(e.W, e.H, e.dpr); if (real.current) real.current.resize(); };
    window.addEventListener('resize', onResize); onResize();

    trk.current = new GpsTracker((f) => {
      const L = live.current; L.fix = f; L.lastFixAt = Date.now();
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
        if (sn.km > 0.35) { if (!L.offSince) L.offSince = Date.now(); } else L.offSince = 0;
      }
    }, (s) => setGpsStatus(s));
    return () => { window.removeEventListener('resize', onResize); e.destroy(); live.current.on = false; trk.current.stop(); if (real.current) real.current.destroy(); };
  }, [say]);
  useEffect(() => { const e = eng.current; if (!e) return; e.filter = filter; e.selected = selected; e.schedule(); }, [filter, selected]);
  useEffect(() => { if (page === 'pMap' && eng.current) eng.current.resize(); }, [page]);
  useEffect(() => { if (gpsStatus === 'denied' && live.current.on && live.current.source === 'gps') { live.current.source = 'demo'; setSource('demo'); say(tr('permDemo')); } }, [gpsStatus, say]);

  // ---------- helpers ----------
  const filterFor = (s) => { if (!s.lines.some((l) => filter === 'both' || (filter === 'S' ? /^S/.test(l) : /^U/.test(l)))) setFilter('both'); };
  const selectStation = (i, center) => { setSelected(i); if (center && eng.current) eng.current.centerOn(ST[i], 3.2, eng.current.H * 0.12); };
  const remember = (r) => {
    const a = ST[r.from].name, b = ST[r.to].name;
    setStore((s) => ({ ...s, rec: [[a, b], ...s.rec.filter((x) => !(x[0] === a && x[1] === b))].slice(0, 6) }));
  };
  const computeRoutes = (from, to) => {
    if (from && to && from === to) { say(tr('sameStation')); return []; }
    return from && to ? R.routes(from.i, to.i) : [];
  };
  const setFrom = (s) => { setNav((n) => ({ ...n, from: s, routes: computeRoutes(s, n.to), sel: 0 })); setFq(s ? s.name : ''); };
  const setTo = (s) => { setNav((n) => ({ ...n, to: s, routes: computeRoutes(n.from, s), sel: 0 })); setTq(s ? s.name : ''); };
  const clearRoutes = (key) => setNav((n) => ({ ...n, [key]: null, routes: [], sel: 0 }));
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
      setFrom(n.st); say(tr('nearest') + ' ' + n.st.name + ' (' + fmtDist(n.km) + ')');
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
    remember(r); const o = makeOverlay(r); ov.current = o; eng.current.overlay = o; setFilter('both');
    live.current.on = false; live.current.phase = 'idle'; resetView(); setPaused(false); setFinished(false);
    setPage('pMap'); setSelected(-1); setMode('show');
    pushInfo({ lines: r.legs.map((l) => l.line), title: r.minutes + ' min', sub: ST[r.from].name + ' ' + tr('to') + ' ' + ST[r.to].name, pct: 0, hud: '', intro: null, off: null });
    setTimeout(() => { eng.current.resize(); eng.current.fitPoints(o.path.pts, 130, 190); }, 30);
  };

  const endNav = () => {
    const L = live.current; L.on = false; L.phase = 'idle';
    ov.current = null; eng.current.overlay = null; resetView(); setMode('idle'); setPaused(false); setFinished(false);
    keepAwake(false);
    if (!locateRef.current) { eng.current.user = null; trk.current.stop(); }
    eng.current.fitAll();
  };

  const tick = useCallback((now) => {
    const L = live.current; if (!L.on) return;
    const o = ov.current, e = eng.current, r = o.route, n = r.legs.length, dt = Math.min(0.05, (now - (L.last || now)) / 1000); L.last = now;
    const last = o.path.pts.length - 1, gps = L.source === 'gps';
    if (L.phase === 'intro') {
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
          const g0 = r.legs[clamp(R.legAt(o.path, Math.min(L.gpsIdx, last - 0.001)), 0, n - 1)];
          L.gpsIdx = Math.min(last, L.gpsIdx + (g0.stops / Math.max(60, g0.rideMin * 60)) * dt); est = true;
        }
        L.p += (L.gpsIdx - L.p) * Math.min(1, dt * 2.5); L.target = L.p;
      } else {
        if (L.adv != null) { L.p = L.target = Math.min(last, L.adv); L.adv = null; L.play = false; setPaused(true); }
        if (L.play && L.target < last && Math.abs(L.p - L.target) < 0.001) L.target = Math.min(last, Math.floor(L.p + 0.0001) + 1);
        const spd = Math.abs(L.target - L.p) > 1.2 ? 2.6 : 0.45;
        if (L.p < L.target) L.p = Math.min(L.target, L.p + spd * dt);
      }
      o.marker = L.p;
      const p = L.p, li = clamp(R.legAt(o.path, Math.min(p, last - 0.001)), 0, n - 1), lg = r.legs[li], seg = o.path.legs[li];
      if (L.follow && viewRef.current === '2d') {
        const m = pointAt(o, p), v = e.view, tz = e.z0 * 5.5; v.z += (tz - v.z) * 0.08; v.cx += (m.x - v.cx) * 0.12; v.cy += (m.y - v.cy) * 0.12;
      }
      const left = seg.b - Math.floor(p + 0.03), nextSt = ST[o.path.pts[Math.min(last, Math.floor(p + 0.03) + 1)].st], endSt = ST[o.path.pts[seg.b].st];
      const fin = p >= last - 0.03, lastLeg = li === n - 1, nl = r.legs[li + 1];
      let title, sub, hud, off = null;
      if (fin) {
        title = tr('arrived'); sub = ST[r.to].name; hud = ST[r.to].name;
        if (!L.done) { L.done = true; if (storeRef.current.haptics) haptic([300, 120, 300]); setFinished(true); }
      } else {
        L.done = false;
        const dNext = L.fix && gps ? ' · ' + fmtDist(distKm(L.fix.lat, L.fix.lng, nextSt.lat, nextSt.lng)) : '';
        title = lg.line + ' ' + tr('towards') + ' ' + lg.toward;
        sub = left <= 1 ? (lastLeg ? tr('getOff', { end: endSt.name }) : tr('getOffChange', { end: endSt.name, line: nl.line, toward: nl.toward })) : tr('nextLine', { next: nextSt.name, d: dNext, n: left, end: endSt.name });
        hud = tr('nextHud', { next: nextSt.name });
        if (left <= 1 && L.alerted !== 'leg' + li) { L.alerted = 'leg' + li; if (storeRef.current.haptics) haptic([180, 90, 180]); }
        if (left > 1 && L.alerted === 'leg' + li) L.alerted = '';
      }
      if (gps && L.fix && L.offSince && Date.now() - L.offSince > 5000 && !fin) off = { atStart: L.gpsIdx < 0.4, m: Math.round(L.offKm * 1000), name: ST[o.path.pts[0].st].name };
      pushInfo({ lines: [lg.line], title, sub, pct: Math.round(100 * p / last), hud, intro: null, off, est });
      if (L.leg !== li) { L.leg = li; if (real.current) real.current.setLeg(o, li); }
      if (viewRef.current === 'generic' && scene.current) scene.current.render(o, p);
    }
    if ((viewRef.current === 'real' || loadingRef.current) && real.current) { real.current.setPosition(o, L.p, now); if (gps) real.current.setUser(L.fix); }
    e.schedule();
    requestAnimationFrame(tick);
  }, []);

  const startNav = (r, src) => {
    remember(r); const o = makeOverlay(r); o.reveal = r.legs.map(() => 0); ov.current = o; eng.current.overlay = o;
    const L = live.current; Object.assign(L, { on: true, phase: 'intro', source: src, p: 0, target: 0, play: true, follow: true, t0: performance.now(), last: 0, adv: null, gpsIdx: 0, offKm: 0, offSince: 0, lastFixAt: 0, alerted: '', leg: -1, done: false });
    setSource(src); setFilter('both'); resetView(); setPaused(false); setFinished(false); setPage('pMap'); setSelected(-1); setMode('intro'); setStartOffer(null); setModal(null);
    lastInfo.current = '';
    if (src === 'gps') trk.current.start();
    if (storeRef.current.awake) keepAwake(true);
    setTimeout(() => { eng.current.resize(); eng.current.fitPoints(o.path.pts, 150, 190); }, 30);
    requestAnimationFrame(tick);
  };

  const openGeneric = async () => {
    if (!scene.current) { const { Scene3D } = await import('./scene3d.js'); scene.current = new Scene3D(glRef.current); }
    const e = eng.current, dark = document.body.classList.contains('dark');
    scene.current.resize(e.W, e.H, e.dpr); scene.current.build(ov.current, dark); scene.current.place(ov.current, live.current.p);
    viewRef.current = 'generic'; setView('generic');
  };
  const toggle3d = async (opts) => {
    if (viewRef.current !== '2d' || loadingRef.current) { resetView(); live.current.follow = true; eng.current.schedule(); return; }
    const wantReal = storeRef.current.real3d && navigator.onLine !== false;
    if (!wantReal) { if (!storeRef.current.real3d) say(tr('simple3dOff')); else say(tr('simple3dOffline')); await openGeneric(); return; }
    loadingRef.current = true; setLoading3d(true);
    const { RealMap3D, mockStyle } = await import('./realmap.js');
    const o = ov.current, g0 = geoAt(o, 0);
    const rm = new RealMap3D(realDiv.current, {
      dark: document.body.classList.contains('dark'), styleOverride: opts && opts.mock ? mockStyle(g0.lng, g0.lat) : undefined,
      onReady: () => { if (real.current !== rm) return; loadingRef.current = false; setLoading3d(false); viewRef.current = 'real'; setView('real'); rm.resize(); rm.setLeg(o, Math.max(0, live.current.leg)); },
      onFail: () => { if (real.current !== rm) return; rm.destroy(); real.current = null; loadingRef.current = false; setLoading3d(false); say(tr('city3dFail')); openGeneric(); },
      onUserMove: () => { live.current.follow = false; },
    });
    real.current = rm; rm.init(o);
  };

  const onPlay = () => {
    const L = live.current;
    if (finished && L.source === 'demo') { L.p = 0; L.target = 0; L.play = true; L.follow = true; setPaused(false); setFinished(false); return; }
    L.play = !L.play; setPaused(!L.play);
  };
  const onNext = () => { const L = live.current, last = ov.current.path.pts.length - 1; L.target = Math.min(last, Math.floor(L.p + 0.0001) + 1); L.follow = true; };
  const onRecenter = () => { live.current.follow = true; if (real.current) real.current.recenter(); };
  const reroute = () => {
    const L = live.current, f = L.fix, dest = ov.current.route.to; if (!f) return;
    const n = nearestStation(f.lat, f.lng).st;
    if (n.i === dest) { say(tr('alreadyThere')); return; }
    const rs = R.routes(n.i, dest); if (!rs.length) { say(tr('noRouteHere')); return; }
    L.on = false; startNav(rs[0], 'gps'); say(tr('newRouteFrom') + ' ' + n.name);
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
      if (q.offer && routes.length) setStartOffer(routes[0]);
      if (q.locate) toggleLocate();
      if (q.modal) { if (q.bn) setBoardName(q.bn); setModal(q.modal); }
      if (q.lang) setStore((o) => ({ ...o, lang: q.lang }));
      if (q.home) setStore((o) => ({ ...o, home: q.home, work: q.work || '', fav: q.fav ? q.fav.split('|') : o.fav }));
      if (q.nosplash) setBooted(true);
      if (q.when) setWhen({ mode: q.when, ts: Date.now() + (+q.wm || 30) * 60000 });
      if (q.p) setPage(q.p);
    }, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- render ----------
  const navActive = mode !== 'idle';
  const sel = selected >= 0 ? ST[selected] : null;
  const isFav = !!(sel && store.fav.indexOf(sel.name) >= 0);
  const gpsNav = mode === 'live' || mode === 'intro';
  const openModal = (k) => { if (k === 'share') { const t = 'Bearline: ' + tr('tagline'); if (navigator.share) navigator.share({ text: t }).catch(() => {}); else say(tr('shareNA')); return; } setModal(k); };
  const openBoard = (name) => { setBoardName(name); setStartOffer(null); setModal('board'); };
  const setDest = (name) => { const s = R.byName(name); if (s) { setTo(s); setPage('pNav'); } };
  const toggleFavSel = () => { const nme = sel.name, has = store.fav.indexOf(nme) >= 0; setStore((s) => ({ ...s, fav: has ? s.fav.filter((x) => x !== nme) : [nme, ...s.fav] })); say(has ? tr('favRemoved') : tr('favAdded')); };
  const setPlace = (k) => { const nme = sel.name; setStore((s) => ({ ...s, [k]: s[k] === nme ? '' : nme })); say(store[k] === nme ? tr('removed') : tr(k) + ': ' + nme); };
  const modalOpen = !!modal || !!startOffer;
  const closeModal = () => { setModal(null); setStartOffer(null); };

  const mineChips = [];
  if (store.home) mineChips.push(['home', store.home]);
  if (store.work) mineChips.push(['work', store.work]);
  store.fav.forEach((n) => mineChips.push(['star', n]));

  return (
    <div id="app">
      <section className={'page' + (page === 'pMap' ? ' on' : '')} id="pMap">
        <canvas id="cv" ref={cvRef} style={{ display: view === '2d' ? 'block' : 'none' }} />
        <canvas id="gl" ref={glRef} style={{ display: view === 'generic' ? 'block' : 'none' }} />
        <div id="real" ref={realDiv} style={{ display: view === 'real' || loading3d ? 'block' : 'none', visibility: view === 'real' ? 'visible' : 'hidden' }} />

        <div id="top" className={navActive ? 'hide' : ''}>
          <div className="sbox">
            <Ico n="search" className="ic" />
            <SearchBox value={mq} onChange={setMq} store={store} ddTop={58} placeholder={tr('searchStation')}
              onPick={(s) => { setMq(s.name); filterFor(s); selectStation(s.i, true); }} />
            {mq && <button className="clr" aria-label={tr('clear')} onClick={() => setMq('')}><Ico n="close" /></button>}
          </div>
          <div className="trow">
            <div className="seg glass" id="filters">
              <button className={filter === 'both' ? 'on' : ''} onClick={() => setFilter('both')}>S + U</button>
              <button className={filter === 'S' ? 'on' : ''} onClick={() => setFilter('S')}><span className="bdg S" style={{ background: '#3d9a4a' }}>S</span><span className="fl">S-Bahn</span></button>
              <button className={filter === 'U' ? 'on' : ''} onClick={() => setFilter('U')}><span className="bdg U" style={{ background: '#1670b8' }}>U</span><span className="fl">U-Bahn</span></button>
            </div>
            <BerlinClock lang={store.lang} />
          </div>
          {mineChips.length > 0 && (
            <div className="pinrow">
              {mineChips.map((m) => <button key={m[0] + m[1]} className="chip glass" onClick={() => { const s = R.byName(m[1]); if (s) { filterFor(s); selectStation(s.i, true); } }}><Ico n={m[0]} className="s" />{m[1]}</button>)}
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
        {gpsNav && (
          <div className={'gpschip glass ' + (source === 'gps' ? (info.est ? 'weak' : gpsStatus) : 'demo')}><i />{source === 'gps' ? (info.est ? tr('noGpsEst') : tr('chip_' + gpsStatus)) : tr('demoRide')}</div>
        )}
        {loading3d && <div className="loading3d glass"><span className="spin" />{tr('loading3d')}</div>}

        {info.off && mode === 'live' && (
          <div className="alert glass">
            {info.off.atStart
              ? <><b>{tr('headTo', { name: info.off.name })}</b><span>{tr('fromStart', { d: fmtDist(info.off.m / 1000) })}</span></>
              : <><b>{tr('offRoute')}</b><span>{tr('offRouteSub', { d: fmtDist(info.off.m / 1000) })}</span><button className="btn sm" onClick={reroute}><Ico n="nav" />{tr('newRouteHere')}</button></>}
          </div>
        )}

        {!navActive && (
          <div id="legend" className="glass">
            {filter !== 'U' && <span><i />S-Bahn</span>}
            {filter !== 'S' && <span><i className="u" />U-Bahn</span>}
          </div>
        )}

        <div id="fabs" style={sel ? { bottom: 'calc(var(--dock) + 296px)' } : navActive ? { bottom: 'calc(var(--dock) + 100px)' } : undefined}>
          {mode === 'live' && <button className="fab glass lg" aria-label="2D / 3D" onClick={() => toggle3d()}><Ico n={view === '2d' ? 'cube' : 'flat'} />{view === '2d' ? '3D' : '2D'}</button>}
          {!navActive && <button className={'fab glass' + (locateOn ? ' on' : '')} aria-label={tr('myLocation')} onClick={toggleLocate}><Ico n="locate" /></button>}
          {view === '2d' && <button className="fab glass" aria-label="+" onClick={() => { live.current.follow = false; eng.current.zoomBy(1.5); }}>+</button>}
          {view === '2d' && <button className="fab glass" aria-label="-" onClick={() => { live.current.follow = false; eng.current.zoomBy(1 / 1.5); }}>&minus;</button>}
          {view === '2d' && <button className="fab glass" aria-label={tr('wholeNetwork')} onClick={() => { live.current.follow = false; if (ov.current) eng.current.fitPoints(ov.current.path.pts, 150, 190); else eng.current.fitAll(); }}><Ico n="map" /></button>}
        </div>

        {mode === 'intro' && info.intro && (
          <div id="intro"><span className="glass">{info.intro.text ? info.intro.text : <>{info.intro.first ? tr('take') : tr('then')} <Badge line={info.intro.line} big /> {tr('towards')} {info.intro.toward}</>}</span></div>
        )}
        {mode === 'live' && !info.off && <div id="hud"><span>{info.hud}</span></div>}

        {(mode === 'live' || mode === 'show') && (
          <div id="navctl">
            {mode === 'live' && source === 'demo' && <button className="btn alt" onClick={onPlay}><Ico n={finished || paused ? 'play' : 'pause'} />{finished ? tr('replay') : paused ? tr('resume') : tr('pause')}</button>}
            {mode === 'live' && source === 'demo' && <button className="btn" onClick={onNext}><Ico n="next" />{tr('nextShort')}</button>}
            {mode === 'live' && source === 'gps' && <button className="btn" onClick={onRecenter}><Ico n="locate" />{tr('recenter')}</button>}
            <button className="btn alt" style={mode === 'show' ? { flex: 1 } : undefined} onClick={endNav}><Ico n="close" />{mode === 'show' ? tr('closeRoute') : tr('end')}</button>
          </div>
        )}

        <div className={'sheet glass' + (sel && !navActive ? ' on' : '')}>
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
          <button className="btn alt sm wide" onClick={() => openBoard(sel.name)}><Ico n="train" />{tr('liveDepArr')}</button>
        </div>
      </section>

      <NavPage on={page === 'pNav'} nav={nav} fq={fq} tq={tq} store={store} when={when}
        setFq={(v) => { setFq(v); if (nav.from) clearRoutes('from'); }} setTq={(v) => { setTq(v); if (nav.to) clearRoutes('to'); }}
        onPickFrom={(s) => { setFrom(s); if (!navRef.current.to) setTimeout(() => document.querySelectorAll('#pNav .fld input')[1]?.focus(), 60); }} onPickTo={setTo}
        onSwap={swap} onSelect={(i) => setNav((n) => ({ ...n, sel: i }))} onShow={showOnMap} onStart={(r) => setStartOffer(r)} onShare={shareRoute}
        onTime={() => setModal('time')} onBoard={openBoard} onPlaces={() => setModal('places')} onSetDest={setDest}
        onChipStation={(name) => { const s = R.byName(name); if (!nav.from) setFrom(s); else setTo(s); }}
        onChipTrip={(r) => { const a = R.byName(r[0]), b = R.byName(r[1]); setNav({ from: a, to: b, routes: R.routes(a.i, b.i), sel: 0 }); setFq(a.name); setTq(b.name); }}
        onLocate={useMyLocation} />
      <NearbyPage on={page === 'pNear'} store={store} setStore={setStore} say={say} onBoard={openBoard}
        onGo={(s) => { setTo(s); setPage('pNav'); }} onOnMap={(i) => { setPage('pMap'); selectStation(i, true); }} />
      <MorePage on={page === 'pMore'} store={store} setStore={setStore} open={openModal} toast={say} gpsStatus={gpsStatus} />

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
          {startOffer
            ? <StartSheet route={startOffer} onGps={() => startNav(startOffer, 'gps')} onDemo={() => startNav(startOffer, 'demo')} />
            : <ModalContent kind={modal} store={store} setStore={setStore} board={boardName} when={when} say={say}
              onFav={(n) => { closeModal(); setPage('pMap'); const s = R.byName(n); if (s) { filterFor(s); selectStation(s.i, true); } }}
              onLang={(id) => { setStore((o) => ({ ...o, lang: id })); closeModal(); }}
              onApplyTime={(w) => { setWhen(w); closeModal(); }}
              onTrip={(r) => { closeModal(); const a = R.byName(r[0]), b = R.byName(r[1]); setNav({ from: a, to: b, routes: R.routes(a.i, b.i), sel: 0 }); setFq(a.name); setTq(b.name); setPage('pNav'); }} />}
          <div style={{ marginTop: 16 }}><button className="btn alt" style={{ width: '100%' }} onClick={closeModal}>{startOffer ? tr('cancel') : tr('close')}</button></div>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
      {!booted && <Splash onDone={() => setBooted(true)} />}
    </div>
  );
}
