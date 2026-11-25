import React, { useEffect, useRef, useState } from 'react';
import { tr } from './i18n.js';
import { Ico } from './ui.jsx';
import { walkRoute, along, meters, walkMin, bearing, lookAhead, instruction } from './walk.js';
import { STYLE_URL, tuneMap, mockLiberty } from './mapstyle.js';
import { addFootImages, addFootLayer, stepPoints } from './footsteps.js';
import { entrancesAround, nearestTo, entranceLabel } from './entrances.js';
import { applyPos, applyHeading, setOffsetFrom, setCompass, resetCalib, offsetMeters, hasCalib } from './calibrate.js';

const BLANK = (dark) => ({ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': dark ? '#1b2335' : '#eef0f6' } }] });
const fmtM = (m) => (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m / 10) * 10 + ' m');
const MAN_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4.5" r="1.9" fill="currentColor"/><path d="M9 21l2-6-2-3 2-5 3 2 2 3M13 9l-4 3"/></svg>';
const PITCH3D = 62, AV = 128;

/* Street map walking view.
 *  - 3D city by default (tilt 62 degrees), 2D with one tap
 *  - a 3D man stands at your position: still when you stand, walking when you move, running when you move fast, turning where the phone faces
 *  - footsteps along the route instead of dots
 *  - quick fly-in over the route when it opens
 *  - toStation: walk to the nearest entrance (OpenStreetMap) and hand over to train navigation within 50 m of the station */
export default function WalkView({ from, to, title, dark, onClose, onArrive, toStation, say }) {
  const box = useRef(null), map = useRef(null), me = useRef(null), route = useRef(null), prev = useRef(null), offCount = useRef(0), follow = useRef(true), arrived = useRef(false);
  const dest = useRef({ lat: to.lat, lng: to.lng });
  const [r, setR] = useState(null);
  const [rem, setRem] = useState(null);
  const [ins, setIns] = useState(null);
  const posRef = useRef({ lat: from.lat, lng: from.lng }), rawRef = useRef(null), hdgRef = useRef({ move: null, gps: null, compass: null, t: 0, fixT: 0 });
  const [gps, setGps] = useState('searching');
  const [live, setLive] = useState(null);
  const [headUp, setHeadUp] = useState(false), headUpRef = useRef(false), near = useRef(0);
  const [mode3d, setMode3d] = useState(true), mode3dRef = useRef(true);
  const [intro, setIntro] = useState(false), introRef = useRef({ done: false, running: false });
  const [ents, setEnts] = useState([]), [pick, setPick] = useState(null);
  const [calib, setCalibUi] = useState('closed'), calibRef = useRef('closed');
  const [mapReady, setMapReady] = useState(false);
  const av = useRef({ stage: null, canvas: null, pos: { lat: from.lat, lng: from.lng }, speed: 0, mode: 'idle', lastFix: 0, lastPos: null, lastT: 0 });
  const cvRef = useRef(null), markers = useRef([]);

  const setPickBoth = (p) => { setPick(p); if (p) dest.current = { lat: p.lat, lng: p.lng }; };

  const drawSteps = (x, doneIdx) => {
    const m = map.current; if (!m || !m.getSource || !m.isStyleLoaded()) return;
    const data = stepPoints(x.pts, 11, doneIdx || 0);
    const src = m.getSource('steps'); if (src) src.setData(data); else { addFootImages(m, dark ? '#a9b8ff' : '#3a55ef'); addFootLayer(m, data, dark); }
    const l = m.getSource('walk'); if (l) l.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: x.pts } });
  };
  const fetchRoute = async (a) => { const x = await walkRoute(a, dest.current); route.current = x; setR(x); setRem(x.m); drawSteps(x, 0); return x; };

  useEffect(() => { fetchRoute(from); /* eslint-disable-next-line */ }, []);

  // entrances of the station we walk to: choose the one nearest to where we come from
  useEffect(() => {
    if (!toStation) return undefined;
    let dead = false;
    entrancesAround(to.lat, to.lng, 260).then((list) => {
      if (dead || !list.length) return;
      setEnts(list);
      const n = nearestTo(list, from);
      if (n && n.m < 230) { setPickBoth({ ...n.e, label: entranceLabel(n.e, tr) }); fetchRoute(from); }
    }).catch(() => {});
    return () => { dead = true; };
    // eslint-disable-next-line
  }, []);

  // map
  useEffect(() => {
    let dead = false, m = null;
    (async () => {
      const ml = await import('maplibre-gl');
      const worker = (await import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url')).default;
      await import('maplibre-gl/dist/maplibre-gl.css');
      if (ml.setWorkerUrl) ml.setWorkerUrl(worker);
      if (dead) return;
      const sOver = window.__walkStyle === 'mock' ? mockLiberty(from.lng, from.lat) : window.__walkStyle; // automated test only: offline style
      m = new ml.Map({ container: box.current, style: sOver || STYLE_URL, center: [from.lng, from.lat], zoom: 16.4, pitch: PITCH3D, maxPitch: 78, attributionControl: false, fadeDuration: 0, canvasContextAttributes: { antialias: true } });
      map.current = m;
      m.addControl(new ml.AttributionControl({ compact: true, customAttribution: 'OpenFreeMap, OpenStreetMap' }), 'bottom-left');
      let ready = false;
      const setup = () => {
        if (ready || dead) return; ready = true;
        try { tuneMap(m, dark); } catch (e) { /* style differs, keep default colours */ }
        const x = route.current;
        m.addSource('walk', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: x ? x.pts : [[from.lng, from.lat], [dest.current.lng, dest.current.lat]] } } });
        m.addLayer({ id: 'walk-case', type: 'line', source: 'walk', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': dark ? '#0b1020' : '#ffffff', 'line-width': 8, 'line-opacity': 0.55 } });
        m.addLayer({ id: 'walk-line', type: 'line', source: 'walk', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': dark ? '#7e92ff' : '#4f6bff', 'line-width': 3.2, 'line-opacity': 0.5 } });
        if (x) drawSteps(x, 0); else { addFootImages(m, dark ? '#a9b8ff' : '#3a55ef'); addFootLayer(m, { type: 'FeatureCollection', features: [] }, dark); }
        const el = document.createElement('div'); el.className = 'wk-dest'; el.innerHTML = '<b></b>';
        new ml.Marker({ element: el }).setLngLat([to.lng, to.lat]).addTo(m);
        const mm = document.createElement('div'); mm.className = 'man3'; mm.style.display = 'none'; mm.innerHTML = '<u></u><span>' + MAN_SVG + '</span>';
        me.current = new ml.Marker({ element: mm }).setLngLat([from.lng, from.lat]).addTo(m);
        m.resize(); setMapReady(true);
      };
      m.on('load', setup);
      m.on('error', () => { if (!ready && !dead) { m.setStyle(BLANK(dark)); m.once('idle', setup); } });
      setTimeout(() => { if (!ready && !dead) { m.setStyle(BLANK(dark)); m.once('idle', setup); } }, 7000);
      m.on('dragstart', () => { follow.current = false; });
    })();
    return () => { dead = true; if (m) m.remove(); map.current = null; };
    // eslint-disable-next-line
  }, []);

  // entrance markers
  useEffect(() => {
    if (!mapReady || !map.current) return undefined;
    let gone = false;
    import('maplibre-gl').then((ml) => {
      if (gone) return;
      markers.current.forEach((k) => k.remove()); markers.current = [];
      ents.slice(0, 12).forEach((e) => {
        const el = document.createElement('div'); el.className = 'wk-ent' + (pick && pick.lat === e.lat && pick.lng === e.lng ? ' on' : '') + (e.wheelchair === 'yes' ? ' sf' : '');
        el.innerHTML = '<i></i>' + (e.ref ? '<b>' + String(e.ref).replace(/</g, '') + '</b>' : '');
        markers.current.push(new ml.Marker({ element: el }).setLngLat([e.lng, e.lat]).addTo(map.current));
      });
    });
    return () => { gone = true; };
  }, [ents, pick, mapReady]);

  // the 3D man
  useEffect(() => {
    if (!mapReady) return undefined;
    let dead = false, raf = 0, last = performance.now();
    (async () => {
      let stage = null;
      try {
        const A = await import('./avatar3d.js');
        if (dead) return;
        stage = new A.Stage3D(cvRef.current, { size: AV, pitch: 56 });
        stage.set(A.buildMan('#4f6bff'), A.buildCone('#4f6bff'));
        av.current.stage = stage; av.current.pos = { ...posRef.current };
      } catch (e) { if (me.current) me.current.getElement().style.display = 'grid'; return; }
      const loop = (now) => {
        if (dead || !cvRef.current) return; // the view was closed while a frame was still queued
        const dt = Math.min(0.06, (now - last) / 1000); last = now;
        const a = av.current, m = map.current; if (!m || !stage) { raf = requestAnimationFrame(loop); return; }
        const tgt = posRef.current, k = Math.min(1, dt * 2.6);
        a.pos.lat += (tgt.lat - a.pos.lat) * k; a.pos.lng += (tgt.lng - a.pos.lng) * k;
        const h = hdgRef.current, moving = Date.now() - h.t < 6000;
        let hd = moving ? (h.gps != null ? h.gps : h.move) : (h.compass != null ? h.compass : null);
        if (hd == null && route.current) { const p = route.current.pts; hd = bearing({ lat: p[0][1], lng: p[0][0] }, { lat: p[Math.min(2, p.length - 1)][1], lng: p[Math.min(2, p.length - 1)][0] }); }
        const bear = m.getBearing(), pitch = m.getPitch();
        stage.setHeading(((hd || 0) - bear), a.firstFrame !== true); a.firstFrame = true;
        stage.setPitch(Math.max(50, Math.min(72, pitch < 5 ? 56 : 40 + pitch * 0.45)));
        const pt = m.project([a.pos.lng, a.pos.lat]);
        cvRef.current.style.transform = 'translate(' + Math.round(pt.x - AV / 2) + 'px,' + Math.round(pt.y - AV * 0.64) + 'px)';
        // idle / walk / run from the speed of the last fixes
        const stale = Date.now() - a.lastFix > 5000;
        const sp = stale ? 0 : a.speed;
        const want = sp > 2.3 ? 'run' : sp > 0.45 ? 'walk' : 'idle';
        if (want !== a.mode && !(a.mode === 'run' && sp > 1.9) && !(a.mode === 'walk' && sp > 0.3 && want === 'idle')) a.mode = want;
        if (window.__avatarMode) a.mode = window.__avatarMode;
        stage.frame(dt, { mode: a.mode, speed: sp });
        a.lastMode = a.mode;
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();
    return () => { dead = true; cancelAnimationFrame(raf); if (av.current.stage) { av.current.stage.destroy(); av.current.stage = null; } };
  }, [mapReady]);

  // quick 3D fly-in over the route, once
  useEffect(() => {
    const m = map.current; if (!mapReady || !r || !m || introRef.current.done || introRef.current.running) return undefined;
    const ml = window.maplibregl; // not used, bounds built by hand
    introRef.current.running = true; setIntro(true);
    const pts = r.pts, a = pts[0], b = pts[Math.min(pts.length - 1, 4)], brg = bearing({ lat: a[1], lng: a[0] }, { lat: b[1], lng: b[0] });
    let minLng = 1e9, maxLng = -1e9, minLat = 1e9, maxLat = -1e9;
    pts.forEach((p) => { minLng = Math.min(minLng, p[0]); maxLng = Math.max(maxLng, p[0]); minLat = Math.min(minLat, p[1]); maxLat = Math.max(maxLat, p[1]); });
    const finish = () => { if (introRef.current.done) return; introRef.current.done = true; introRef.current.running = false; setIntro(false); follow.current = true; };
    try {
      const cam = m.cameraForBounds([[minLng, minLat], [maxLng, maxLat]], { padding: { top: 200, bottom: 160, left: 50, right: 50 }, maxZoom: 16.2 });
      m.jumpTo({ center: cam ? cam.center : [from.lng, from.lat], zoom: Math.max(13.2, (cam ? cam.zoom : 15) - 0.4), pitch: 0, bearing: 0 });
      setTimeout(() => { if (introRef.current.done) return; m.easeTo({ pitch: 52, bearing: brg * 0.5, duration: 1500, easing: (t) => t * (2 - t) }); }, 350);
      setTimeout(() => { if (introRef.current.done) return; m.flyTo({ center: [from.lng, from.lat], zoom: 17.5, pitch: mode3dRef.current ? PITCH3D : 0, bearing: headUpRef.current ? brg : 0, duration: 2300, essential: true, padding: { top: Math.round((box.current ? box.current.clientHeight : 700) * 0.28), bottom: 0, left: 0, right: 0 } }); }, 1900);
      setTimeout(finish, 4400);
    } catch (e) { finish(); }
    return () => { /* the timers end on their own */ };
    // eslint-disable-next-line
  }, [mapReady, r]);
  const skipIntro = () => { const m = map.current; if (m) m.stop(); introRef.current.done = true; setIntro(false); follow.current = true; if (m) m.easeTo({ center: [posRef.current.lng, posRef.current.lat], zoom: 17.4, pitch: mode3dRef.current ? PITCH3D : 0, duration: 500, padding: { top: Math.round((box.current ? box.current.clientHeight : 700) * 0.28), bottom: 0, left: 0, right: 0 } }); };

  // which way you face: recent movement or GPS heading, otherwise the compass
  const recompute = () => {
    const x = route.current, pos = posRef.current; if (!x || !pos) return;
    const h = hdgRef.current, moving = Date.now() - h.t < 6000;
    const heading = moving ? (h.gps != null ? h.gps : h.move) : (h.compass != null ? h.compass : null);
    if (heading == null) { setIns({ key: 'wait', rel: 0, state: 'turn' }); return; }
    const a = along(x.pts, pos), tgt = lookAhead(x.pts, a.i, pos, 25);
    setIns(instruction(heading, bearing(pos, tgt)));
    const mp = map.current;
    if (mp && headUpRef.current) { try { mp.easeTo({ bearing: heading, duration: 500 }); } catch (e) { /* map not ready */ } }
  };
  useEffect(() => {
    const onOri = (e) => { const c = e.webkitCompassHeading != null ? e.webkitCompassHeading : (e.absolute || e.type === 'deviceorientationabsolute') && e.alpha != null ? (360 - e.alpha) % 360 : null; if (c != null) { hdgRef.current.compass = applyHeading(c); hdgRef.current.rawCompass = c; } };
    window.addEventListener('deviceorientationabsolute', onOri, true); window.addEventListener('deviceorientation', onOri, true);
    const t = setInterval(recompute, 700);
    return () => { window.removeEventListener('deviceorientationabsolute', onOri, true); window.removeEventListener('deviceorientation', onOri, true); clearInterval(t); };
    // eslint-disable-next-line
  }, []);

  // live position
  useEffect(() => {
    const onFix = (c) => {
      if (arrived.current) return;
      rawRef.current = { lat: c.latitude, lng: c.longitude };
      const pos = applyPos(rawRef.current); setLive(pos); setGps(c.accuracy > 80 ? 'weak' : 'ok');
      const a = av.current, now = Date.now();
      // speed in m/s: from the device or from the last two fixes
      let sp = c.speed != null && !Number.isNaN(c.speed) ? c.speed : null;
      if (sp == null && a.lastPos) { const dt = (now - a.lastT) / 1000; if (dt > 0.3) sp = meters(a.lastPos, pos) / dt; }
      if (sp != null) a.speed = a.speed * 0.5 + sp * 0.5;
      a.lastPos = pos; a.lastT = now; a.lastFix = now;
      posRef.current = pos;
      const x = route.current; if (!x) return;
      const al = along(x.pts, pos); setRem(Math.round(al.rem)); drawSteps(x, al.i);
      const h = hdgRef.current;
      if (prev.current) { if (meters(prev.current, pos) >= 6) { h.move = bearing(prev.current, pos); h.t = Date.now(); prev.current = pos; } } else prev.current = pos;
      if (c.heading != null && !Number.isNaN(c.heading) && (c.speed == null || c.speed > 0.8)) {
        h.gps = c.heading; h.t = Date.now();
        // the compass drifts: learn the offset from real movement while walking steadily
        if (h.rawCompass != null && a.speed > 1) { const off = ((c.heading - h.rawCompass + 540) % 360) - 180; h.offEma = h.offEma == null ? off : h.offEma * 0.9 + off * 0.1; }
      }
      recompute();
      // within 50 m of the station (or 22 m of the entrance): leave walking mode and start the train navigation (two fixes in a row)
      const radius = toStation ? 50 : 35;
      near.current = meters(pos, to) < radius || (toStation && meters(pos, dest.current) < 22) ? near.current + 1 : 0;
      if (near.current >= (toStation ? 2 : 1)) { arrived.current = true; setIns(null); onArrive && onArrive(); return; }
      offCount.current = al.d > 45 ? offCount.current + 1 : 0;
      if (offCount.current >= 3) { offCount.current = 0; fetchRoute(pos); }
      if (follow.current && map.current && introRef.current.done && calibRef.current !== 'pin') map.current.easeTo({ center: [pos.lng, pos.lat], duration: 600, padding: { top: Math.round((box.current ? box.current.clientHeight : 700) * (mode3dRef.current ? 0.28 : 0.1)), bottom: 0, left: 0, right: 0 } });
    };
    window.__walkFix = (lat, lng, heading, speed) => { if (heading != null) { hdgRef.current.compass = heading; } onFix({ latitude: lat, longitude: lng, accuracy: 10, speed: speed != null ? speed : null }); };
    if (!navigator.geolocation) { setGps('unavailable'); return undefined; }
    const id = navigator.geolocation.watchPosition((p) => onFix(p.coords), (e) => setGps(e.code === 1 ? 'denied' : 'searching'), { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
    return () => { navigator.geolocation.clearWatch(id); delete window.__walkFix; };
    // eslint-disable-next-line
  }, []);

  const padTop = () => Math.round((box.current ? box.current.clientHeight : 700) * (mode3dRef.current ? 0.28 : 0.1));
  const toggle3d = () => {
    const v = !mode3dRef.current; mode3dRef.current = v; setMode3d(v);
    const m = map.current; if (m) m.easeTo({ pitch: v ? PITCH3D : 0, duration: 700, padding: { top: padTop(), bottom: 0, left: 0, right: 0 } });
  };
  const openCalib = (v) => { calibRef.current = v; setCalibUi(v); };
  const confirmPin = () => {
    const m = map.current, raw = rawRef.current; if (!m) return;
    const c = m.unproject([m.getContainer().clientWidth / 2, m.getContainer().clientHeight / 2 + 0]);
    const truth = { lat: c.lat, lng: c.lng };
    // the crosshair sits at the middle of the screen: that is the real position
    if (raw) setOffsetFrom(raw, truth); else setOffsetFrom(posRef.current, truth);
    posRef.current = truth; av.current.pos = { ...truth }; av.current.lastFix = Date.now();
    follow.current = true; openCalib('closed'); say && say(tr('calibDone', { m: offsetMeters() }));
  };
  const calibCompass = () => {
    const h = hdgRef.current, x = route.current; if (!x) return;
    if (h.rawCompass == null) { say && say(tr('calibNoCompass')); return; }
    const a = along(x.pts, posRef.current), tgt = lookAhead(x.pts, a.i, posRef.current, 25), want = bearing(posRef.current, tgt);
    setCompass(want - h.rawCompass); h.compass = applyHeading(h.rawCompass); openCalib('closed'); say && say(tr('calibCompassDone'));
  };

  return (
    <div className={'walkview' + (calib === 'pin' ? ' pinning' : '')}>
      <div ref={box} className="wk-map" />
      <canvas ref={cvRef} className="avatar3d" width={AV} height={AV} style={{ width: AV, height: AV }} />
      {calib === 'pin' && <div className="wk-cross"><i /><span>{tr('calibPinHint')}</span></div>}
      <div className="wk-top glass">
        <button className="wk-back" aria-label={tr('back')} onClick={onClose}><Ico n="back" /></button>
        <div className="wk-tt">
          <small><Ico n="walk" />{tr('walkTo')}</small>
          <h3>{title || to.name}</h3>
          <div className="wk-meta">
            <b>{rem != null ? fmtM(rem) : '...'}</b><span>{rem != null ? walkMin(rem) + ' ' + tr('min') : ''}</span>
            {r && r.est && <span className="wk-est">{tr('walkEst')}</span>}
          </div>
        </div>
      </div>
      {toStation && pick && (
        <div className="wk-entry glass"><Ico n="door" /><span><b>{tr('entUse')}: {pick.label}</b><small>{pick.wheelchair === 'yes' ? tr('entStepFree') : pick.wheelchair === 'no' ? tr('entStairs') : tr('entFrom', { m: pick.m })}</small></span></div>
      )}
      {gps !== 'ok' && <div className={'wk-gps glass ' + gps}>{gps === 'denied' ? tr('locDenied') : gps === 'unavailable' ? tr('gps_unavailable') : tr('searchingGps')}</div>}
      {ins && calib === 'closed' && !intro && (
        <div className={'wk-ins ' + ins.state}>
          {ins.key === 'wait' ? <span className="arr"><Ico n="walk" /></span> : <span className="arr" style={{ transform: 'rotate(' + Math.round(ins.rel) + 'deg)' }}><Ico n="arrowup" /></span>}
          <b>{tr('ins_' + ins.key)}</b>
        </div>
      )}
      {intro && <button className="btn alt wk-skip glass" onClick={skipIntro}><Ico n="next" />{tr('skip')}</button>}
      <div className="wk-side">
        <button className={'fab glass' + (mode3d ? ' on' : '')} aria-label="2D / 3D" onClick={toggle3d}><Ico n={mode3d ? 'flat' : 'cube'} /><small>{mode3d ? '2D' : '3D'}</small></button>
        <button className={'fab glass' + (headUp ? ' on' : '')} aria-label={tr('headUp')} onClick={() => { const v = !headUpRef.current; headUpRef.current = v; setHeadUp(v); if (!v && map.current) map.current.easeTo({ bearing: 0, duration: 400 }); }}><Ico n="compass" /></button>
        <button className={'fab glass' + (hasCalib() ? ' on' : '')} aria-label={tr('calibrate')} onClick={() => openCalib(calib === 'menu' ? 'closed' : 'menu')}><Ico n="crosshair" /></button>
      </div>
      {calib === 'menu' && (
        <div className="wk-calib glass">
          <b>{tr('calibrate')}</b>
          <button className="opt" onClick={() => openCalib('pin')}><span className="ico"><Ico n="crosshair" /></span><span><b>{tr('calibPos')}</b><span>{tr('calibPosSub')}</span></span></button>
          <button className="opt" onClick={calibCompass}><span className="ico"><Ico n="compass" /></span><span><b>{tr('calibCompass')}</b><span>{tr('calibCompassSub')}</span></span></button>
          <div className="eight" aria-hidden="true"><svg viewBox="0 0 120 60"><path d="M60 30C48 10 14 10 14 30s34 20 46 0 46-20 46 0-34 20-46 0z" /><circle r="4" cx="60" cy="30"><animateMotion dur="3s" repeatCount="indefinite" path="M60 30C48 10 14 10 14 30s34 20 46 0 46-20 46 0-34 20-46 0z" /></circle></svg><small>{tr('calibEight')}</small></div>
          <div className="acts"><button className="btn alt sm" onClick={() => { resetCalib(); hdgRef.current.compass = hdgRef.current.rawCompass != null ? hdgRef.current.rawCompass : hdgRef.current.compass; openCalib('closed'); say && say(tr('calibReset')); }}><Ico n="refresh" />{tr('calibResetBtn')}</button><button className="btn alt sm" onClick={() => openCalib('closed')}>{tr('close')}</button></div>
        </div>
      )}
      <div className="wk-bot">
        {calib === 'pin'
          ? <><button className="btn alt" onClick={() => openCalib('closed')}>{tr('cancel')}</button><button className="btn" onClick={confirmPin}><Ico n="check" />{tr('calibConfirm')}</button></>
          : <>
            {live && <button className="btn alt" onClick={() => { follow.current = true; if (map.current) map.current.easeTo({ center: [live.lng, live.lat], zoom: 17.4, duration: 500, padding: { top: padTop(), bottom: 0, left: 0, right: 0 } }); }}><Ico n="locate" />{tr('recenter')}</button>}
            <button className="btn" onClick={() => { arrived.current = true; onArrive && onArrive(); }}><Ico n="check" />{tr('imHere')}</button>
          </>}
      </div>
    </div>
  );
}
