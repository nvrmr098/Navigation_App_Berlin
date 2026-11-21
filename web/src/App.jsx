import React, { useCallback, useEffect, useRef, useState } from 'react';
import { R, ST, NET, clamp, pointAt } from './net.js';
import { MapEngine } from './mapEngine.js';
import { Badge, Badges, SearchBox } from './ui.jsx';
import { NavPage, MorePage, ModalContent } from './pages.jsx';

const loadStore = () => {
  const base = { dark: false, fav: [], rec: [], lbl: true, step: false };
  try { const raw = localStorage.getItem('br1'); if (raw) Object.assign(base, JSON.parse(raw)); } catch (e) { /* storage may be unavailable */ }
  return base;
};

export default function App() {
  const [store, setStore] = useState(loadStore);
  const [page, setPage] = useState('pMap');
  const [filter, setFilter] = useState('both');
  const [selected, setSelected] = useState(-1);
  const [mq, setMq] = useState('');
  const [nav, setNav] = useState({ from: null, to: null, routes: [], sel: 0 });
  const [fq, setFq] = useState('');
  const [tq, setTq] = useState('');
  const [mode, setMode] = useState('idle'); // idle | show | intro | live
  const [info, setInfo] = useState({ lines: [], title: '', sub: '', pct: 0, hud: '', intro: null });
  const [is3d, setIs3d] = useState(false);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');

  const cvRef = useRef(null), glRef = useRef(null), eng = useRef(null), scene = useRef(null);
  const ov = useRef(null), live = useRef({ on: false, phase: 'idle', p: 0, target: 0, play: true, follow: true, t0: 0, last: 0, adv: null });
  const is3dRef = useRef(false), lastInfo = useRef(''), toastT = useRef(0), storeRef = useRef(store);
  storeRef.current = store;

  const say = useCallback((t) => { setToast(t); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(''), 2200); }, []);

  // persist and theme
  useEffect(() => {
    try { localStorage.setItem('br1', JSON.stringify(store)); } catch (e) { /* ignore */ }
    document.body.classList.toggle('dark', !!store.dark);
    const tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.content = store.dark ? '#262624' : '#ffffff';
    if (eng.current) { eng.current.lbl = !!store.lbl; eng.current.schedule(); }
    if (is3dRef.current && scene.current && ov.current) { scene.current.build(ov.current, !!store.dark); }
  }, [store]);

  // map engine
  useEffect(() => {
    const e = new MapEngine(cvRef.current, {
      onTap: (i) => setSelected(i),
      onManual: () => { live.current.follow = false; },
    });
    eng.current = e; e.lbl = !!storeRef.current.lbl;
    const onResize = () => {
      e.resize();
      if (scene.current) scene.current.resize(e.W, e.H, e.dpr);
    };
    window.addEventListener('resize', onResize); onResize();
    return () => { window.removeEventListener('resize', onResize); e.destroy(); live.current.on = false; };
  }, []);
  useEffect(() => { const e = eng.current; if (!e) return; e.filter = filter; e.selected = selected; e.schedule(); }, [filter, selected]);
  useEffect(() => { if (page === 'pMap' && eng.current) { eng.current.resize(); } }, [page]);

  // ---------- helpers ----------
  const filterFor = (s) => { if (!s.lines.some((l) => filter === 'both' || NET.lines[l].p === filter)) setFilter('both'); };
  const selectStation = (i, center) => {
    setSelected(i);
    if (center && eng.current) eng.current.centerOn(ST[i], 3.2, eng.current.H * 0.12);
  };
  const remember = (r) => {
    const a = ST[r.from].name, b = ST[r.to].name;
    setStore((s) => ({ ...s, rec: [[a, b], ...s.rec.filter((x) => !(x[0] === a && x[1] === b))].slice(0, 6) }));
  };
  const computeRoutes = (from, to) => {
    if (from && to && from === to) { say('Start and destination are the same'); return []; }
    return from && to ? R.routes(from.i, to.i) : [];
  };
  const setFrom = (s) => { setNav((n) => ({ ...n, from: s, routes: computeRoutes(s, n.to), sel: 0 })); setFq(s ? s.name : ''); };
  const setTo = (s) => { setNav((n) => ({ ...n, to: s, routes: computeRoutes(n.from, s), sel: 0 })); setTq(s ? s.name : ''); };
  const clearRoutes = (key) => setNav((n) => ({ ...n, [key]: null, routes: [], sel: 0 }));
  const swap = () => {
    setNav((n) => ({ ...n, from: n.to, to: n.from, routes: computeRoutes(n.to, n.from), sel: 0 }));
    setFq(tq); setTq(fq);
  };
  const shareRoute = (r) => {
    const t = 'Berlin Route: ' + ST[r.from].name + ' to ' + ST[r.to].name + ', ' + r.minutes + ' min. ' + r.legs.map((l) => l.line + ' towards ' + l.toward + ' (' + l.stops + ' stops)').join(', then ') + '.';
    if (navigator.share) navigator.share({ text: t }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => say('Route copied'), () => say('Sharing not available'));
    else say('Sharing not available');
  };

  // ---------- route on map and navigation ----------
  const pushInfo = (o) => { const s = JSON.stringify(o); if (s !== lastInfo.current) { lastInfo.current = s; setInfo(o); } };
  const makeOverlay = (r) => ({ route: r, path: R.routePath(r), reveal: null, marker: null });
  const resetView3d = () => { is3dRef.current = false; setIs3d(false); };

  const showOnMap = (r) => {
    remember(r); const o = makeOverlay(r); ov.current = o; eng.current.overlay = o; setFilter('both');
    live.current.on = false; live.current.phase = 'idle'; resetView3d(); setPaused(false); setFinished(false);
    setPage('pMap'); setSelected(-1); setMode('show');
    pushInfo({ lines: r.legs.map((l) => l.line), title: r.minutes + ' min', sub: ST[r.from].name + ' to ' + ST[r.to].name, pct: 0, hud: '', intro: null });
    setTimeout(() => { eng.current.resize(); eng.current.fitPoints(o.path.pts, 90, 130); }, 30);
  };

  const endNav = () => {
    const L = live.current; L.on = false; L.phase = 'idle';
    ov.current = null; eng.current.overlay = null; resetView3d(); setMode('idle'); setPaused(false); setFinished(false);
    eng.current.fitAll();
  };

  const tick = useCallback((now) => {
    const L = live.current; if (!L.on) return;
    const o = ov.current, e = eng.current, r = o.route, n = r.legs.length, dt = Math.min(0.05, (now - (L.last || now)) / 1000); L.last = now;
    const last = o.path.pts.length - 1;
    if (L.phase === 'intro') {
      const t = (now - L.t0) / 1000, per = n === 1 ? 1.6 : Math.min(1.3, 3.2 / n), runStart = per * n + 0.3, runLen = 1.6;
      o.reveal = r.legs.map((_, i) => clamp((t - i * per) / per, 0, 1));
      const li = clamp(Math.floor(t / per), 0, n - 1);
      if (t < per * n) { o.marker = null; pushInfo({ lines: [], title: 'Your route', sub: ST[r.from].name + ' to ' + ST[r.to].name, pct: 0, hud: '', intro: { first: li === 0, line: r.legs[li].line, toward: r.legs[li].toward } }); }
      else if (t < runStart + runLen) {
        let f = clamp((t - runStart) / runLen, 0, 1); f = f * f * (3 - 2 * f); o.marker = f * last * 0.999;
        pushInfo({ lines: [], title: 'Your route', sub: ST[r.from].name + ' to ' + ST[r.to].name, pct: 0, hud: '', intro: { text: 'Off we go' } });
      } else { L.phase = 'live'; L.p = 0; L.target = 0; o.marker = 0; L.follow = true; setMode('live'); }
    }
    if (L.phase === 'live') {
      if (L.adv != null) { L.p = L.target = Math.min(last, L.adv); L.adv = null; L.play = false; setPaused(true); }
      if (L.play && L.target < last && Math.abs(L.p - L.target) < 0.001) L.target = Math.min(last, Math.floor(L.p + 0.0001) + 1);
      const spd = Math.abs(L.target - L.p) > 1.2 ? 2.6 : 0.45;
      if (L.p < L.target) L.p = Math.min(L.target, L.p + spd * dt);
      o.marker = L.p;
      if (L.follow && !is3dRef.current) {
        const m = pointAt(o, L.p), v = e.view, tz = e.z0 * 5.5; v.z += (tz - v.z) * 0.08; v.cx += (m.x - v.cx) * 0.12; v.cy += (m.y - v.cy) * 0.12;
      }
      // text for the top card
      const p = L.p, li = clamp(R.legAt(o.path, Math.min(p, last - 0.001)), 0, n - 1), lg = r.legs[li], seg = o.path.legs[li];
      const left = seg.b - Math.floor(p + 0.0001), nextSt = ST[o.path.pts[Math.min(last, Math.floor(p + 0.0001) + 1)].st], endSt = ST[o.path.pts[seg.b].st];
      const fin = p >= last - 0.001, lastLeg = li === n - 1, nl = r.legs[li + 1];
      let title, sub, hud;
      if (fin) { title = 'You have arrived'; sub = ST[r.to].name; hud = ST[r.to].name; }
      else {
        title = lg.line + ' towards ' + lg.toward;
        sub = left <= 1 ? (lastLeg ? 'Get off at ' + endSt.name : 'Get off at ' + endSt.name + ', change to ' + nl.line + ' towards ' + nl.toward) : 'Next: ' + nextSt.name + '. ' + left + ' stops until ' + endSt.name;
        hud = 'Next: ' + nextSt.name;
      }
      pushInfo({ lines: [lg.line], title, sub, pct: Math.round(100 * p / last), hud, intro: null });
      if (fin && L.play) { L.play = false; setPaused(true); setFinished(true); }
      if (is3dRef.current && scene.current) scene.current.render(o, p);
    }
    e.schedule();
    requestAnimationFrame(tick);
  }, []);

  const startNav = (r) => {
    remember(r); const o = makeOverlay(r); o.reveal = r.legs.map(() => 0); ov.current = o; eng.current.overlay = o;
    const L = live.current; Object.assign(L, { on: true, phase: 'intro', p: 0, target: 0, play: true, follow: true, t0: performance.now(), last: 0, adv: null });
    setFilter('both'); resetView3d(); setPaused(false); setFinished(false); setPage('pMap'); setSelected(-1); setMode('intro');
    lastInfo.current = '';
    setTimeout(() => { eng.current.resize(); eng.current.fitPoints(o.path.pts, 110, 150); }, 30);
    requestAnimationFrame(tick);
  };

  const toggle3d = async () => {
    if (is3dRef.current) { resetView3d(); live.current.follow = true; eng.current.schedule(); return; }
    if (!scene.current) {
      const { Scene3D } = await import('./scene3d.js');
      scene.current = new Scene3D(glRef.current);
    }
    const e = eng.current; scene.current.resize(e.W, e.H, e.dpr);
    scene.current.build(ov.current, !!storeRef.current.dark); scene.current.place(ov.current, live.current.p);
    is3dRef.current = true; setIs3d(true);
  };

  const onPlay = () => {
    const L = live.current, last = ov.current.path.pts.length - 1;
    if (finished) { L.p = 0; L.target = 0; L.play = true; L.follow = true; setPaused(false); setFinished(false); return; }
    L.play = !L.play; setPaused(!L.play);
    if (L.play && L.target >= last) { /* nothing to do */ }
  };
  const onNext = () => { const L = live.current, last = ov.current.path.pts.length - 1; L.target = Math.min(last, Math.floor(L.p + 0.0001) + 1); L.follow = true; };

  // ---------- test hook: #from=A&to=B&act=show|start&p=pNav&f=S&sel=Name&zoom=2&skip=1&adv=3&d3=300&dark=1 ----------
  useEffect(() => {
    const h = location.hash.slice(1); if (!h) return;
    const q = {}; h.split('&').forEach((kv) => { const a = kv.split('='); q[a[0]] = decodeURIComponent(a[1] || ''); });
    let from = q.from ? R.byName(q.from) : null, to = q.to ? R.byName(q.to) : null, routes = [];
    if (q.dark) setStore((s) => ({ ...s, dark: true }));
    if (q.f) setFilter(q.f);
    if (from) setFrom(from); if (to) setTo(to);
    if (from && to) routes = R.routes(from.i, to.i);
    setTimeout(() => {
      if (q.sel) selectStation(R.byName(q.sel).i, true);
      if (q.zoom && eng.current) { eng.current.view.z = eng.current.z0 * +q.zoom; eng.current.schedule(); }
      if (q.act === 'show' && routes.length) showOnMap(routes[+(q.r || 0)]);
      if (q.act === 'start' && routes.length) {
        startNav(routes[+(q.r || 0)]);
        if (q.skip) live.current.t0 -= 1e5;
        if (q.adv) live.current.adv = +q.adv;
        if (q.d3) setTimeout(() => toggle3d(), +q.d3);
      }
      if (q.p) setPage(q.p);
    }, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- render ----------
  const navActive = mode !== 'idle';
  const sel = selected >= 0 ? ST[selected] : null;
  const isFav = sel && store.fav.indexOf(sel.name) >= 0;
  const openModal = (k) => { if (k === 'share') { const t = 'Berlin Route: an easier way to understand the Berlin S-Bahn and U-Bahn.'; if (navigator.share) navigator.share({ text: t }).catch(() => {}); else say('Sharing not available here'); return; } setModal(k); };

  return (
    <div id="app">
      <section className={'page' + (page === 'pMap' ? ' on' : '')} id="pMap">
        <canvas id="cv" ref={cvRef} style={{ display: is3d ? 'none' : 'block' }} />
        <canvas id="gl" ref={glRef} style={{ display: is3d ? 'block' : 'none' }} />

        <div id="top" style={{ display: navActive ? 'none' : 'flex' }}>
          <div className="sbox" id="mapSearch">
            <svg className="ic" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
            <SearchBox value={mq} onChange={setMq} store={store} ddTop={50} placeholder="Search a station"
              onPick={(s) => { setMq(s.name); filterFor(s); selectStation(s.i, true); }} />
            <button className="clr" style={{ display: mq ? 'block' : 'none' }} aria-label="Clear" onClick={() => setMq('')}>&times;</button>
          </div>
          <div className="chips" id="filters">
            <button className={'chip' + (filter === 'both' ? ' on' : '')} onClick={() => setFilter('both')}>S + U</button>
            <button className={'chip' + (filter === 'S' ? ' on' : '')} onClick={() => setFilter('S')}><span className="bdg S" style={{ background: '#3d8c40' }}>S</span> S-Bahn</button>
            <button className={'chip' + (filter === 'U' ? ' on' : '')} onClick={() => setFilter('U')}><span className="bdg U" style={{ background: '#0a62a6' }}>U</span> U-Bahn</button>
          </div>
        </div>

        {navActive && (
          <div id="navbar" style={{ display: 'block' }}>
            <div className="l1"><span>{info.lines.map((l) => <React.Fragment key={l}><Badge line={l} />{' '}</React.Fragment>)}</span><span>{info.title}</span></div>
            <div className="l2">{info.sub}</div>
            <div className="bar"><i style={{ width: info.pct + '%' }} /></div>
          </div>
        )}

        {!navActive && (
          <div id="legend">
            {filter !== 'U' && <span><i />S-Bahn</span>}
            {filter !== 'S' && <span><i className="u" />U-Bahn</span>}
          </div>
        )}

        <div id="fabs" style={sel ? { bottom: 178 } : undefined}>
          {mode === 'live' && <button className="fab" id="viewsw" style={{ display: 'flex' }} aria-label="Switch 2D or 3D" onClick={toggle3d}>{is3d ? '2D' : '3D'}</button>}
          <button className="fab" aria-label="Zoom in" onClick={() => { live.current.follow = false; eng.current.zoomBy(1.5); }}>+</button>
          <button className="fab" aria-label="Zoom out" onClick={() => { live.current.follow = false; eng.current.zoomBy(1 / 1.5); }}>&minus;</button>
          <button className="fab" aria-label="Show whole network" onClick={() => { live.current.follow = false; if (ov.current) eng.current.fitPoints(ov.current.path.pts, 120, 120); else eng.current.fitAll(); }}>
            <svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
          </button>
        </div>

        {mode === 'intro' && info.intro && (
          <div id="intro" style={{ display: 'block' }}>
            <span>{info.intro.text ? info.intro.text : <>{info.intro.first ? 'Take ' : 'Then '}<Badge line={info.intro.line} /> towards {info.intro.toward}</>}</span>
          </div>
        )}
        {mode === 'live' && <div id="hud" style={{ display: 'block' }}><span>{info.hud}</span></div>}

        {(mode === 'live' || mode === 'show') && (
          <div id="navctl" style={{ display: 'flex' }}>
            {mode === 'live' && <button className="btn alt" onClick={onPlay}>{finished ? 'Replay' : paused ? 'Resume' : 'Pause'}</button>}
            {mode === 'live' && <button className="btn" onClick={onNext}>Next stop</button>}
            <button className="btn alt" style={mode === 'show' ? { flex: 1 } : undefined} onClick={endNav}>{mode === 'show' ? 'Close route' : 'End'}</button>
          </div>
        )}

        <div className={'sheet' + (sel && !navActive ? ' on' : '')}>
          <button className="x" onClick={() => setSelected(-1)}>&times;</button>
          <h3>{sel ? sel.name : ''}</h3>
          <div className="row">{sel && <Badges s={sel} />}</div>
          <div className="acts">
            <button className="btn alt" onClick={() => { setFrom(sel); setSelected(-1); setPage('pNav'); }}>From here</button>
            <button className="btn" onClick={() => { setTo(sel); setSelected(-1); setPage('pNav'); }}>Go here</button>
            <button className="btn alt" style={{ flex: '0 0 46px', padding: 0 }} onClick={() => {
              const n = sel.name, has = store.fav.indexOf(n) >= 0;
              setStore((s) => ({ ...s, fav: has ? s.fav.filter((x) => x !== n) : [n, ...s.fav] })); say(has ? 'Removed from favorites' : 'Added to favorites');
            }}>{isFav ? '★' : '☆'}</button>
          </div>
        </div>
      </section>

      <NavPage on={page === 'pNav'} nav={nav} fq={fq} tq={tq} store={store}
        setFq={(v) => { setFq(v); if (nav.from) clearRoutes('from'); }} setTq={(v) => { setTq(v); if (nav.to) clearRoutes('to'); }}
        onPickFrom={(s) => { setFrom(s); if (!nav.to) setTimeout(() => document.querySelectorAll('#pNav .fld input')[1]?.focus(), 50); }} onPickTo={setTo}
        onSwap={swap} onSelect={(i) => setNav((n) => ({ ...n, sel: i }))} onShow={showOnMap} onStart={startNav} onShare={shareRoute}
        onChipStation={(name) => { const s = R.byName(name); if (!nav.from) setFrom(s); else setTo(s); }}
        onChipTrip={(r) => { const a = R.byName(r[0]), b = R.byName(r[1]); setNav({ from: a, to: b, routes: R.routes(a.i, b.i), sel: 0 }); setFq(a.name); setTq(b.name); }}
        onStepInfo={() => say('Step-free routing is planned for a later version')} />
      <MorePage on={page === 'pMore'} store={store} setStore={setStore} open={openModal} toast={say} />

      <nav id="footer">
        <button className={page === 'pMap' ? 'on' : ''} onClick={() => setPage('pMap')}><svg viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14" /></svg>Map</button>
        <button className={page === 'pNav' ? 'on' : ''} onClick={() => setPage('pNav')}><svg viewBox="0 0 24 24"><path d="M12 3l7 17-7-4-7 4z" /></svg>Navigate</button>
        <button className={page === 'pMore' ? 'on' : ''} onClick={() => setPage('pMore')}><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></svg>More</button>
      </nav>

      <div className={'modal' + (modal ? ' on' : '')} onPointerDown={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
        <div className="box">
          <ModalContent kind={modal} store={store}
            onFav={(n) => { setModal(null); setPage('pMap'); const s = R.byName(n); if (s) { filterFor(s); selectStation(s.i, true); } }}
            onTrip={(r) => { setModal(null); const a = R.byName(r[0]), b = R.byName(r[1]); setNav({ from: a, to: b, routes: R.routes(a.i, b.i), sel: 0 }); setFq(a.name); setTq(b.name); setPage('pNav'); }} />
          <div style={{ marginTop: 14 }}><button className="btn alt" style={{ width: '100%' }} onClick={() => setModal(null)}>Close</button></div>
        </div>
      </div>
      <div className="toast" style={{ display: toast ? 'block' : 'none' }}>{toast}</div>
    </div>
  );
}
