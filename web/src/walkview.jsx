import React, { useEffect, useRef, useState } from 'react';
import { tr } from './i18n.js';
import { Ico } from './ui.jsx';
import { walkRoute, along, meters, walkMin, bearing, lookAhead, instruction } from './walk.js';

const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';
const BLANK = (dark) => ({ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': dark ? '#0f1626' : '#eef0f6' } }] });
const fmtM = (m) => (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m / 10) * 10 + ' m');

/* Street map walking view: live position, route line, direction check (green right way, red wrong way). */
export default function WalkView({ from, to, title, dark, onClose, onArrive }) {
  const box = useRef(null), map = useRef(null), me = useRef(null), route = useRef(null), prev = useRef(null), offCount = useRef(0), follow = useRef(true), arrived = useRef(false);
  const [r, setR] = useState(null);
  const [rem, setRem] = useState(null);
  const [ins, setIns] = useState(null);
  const posRef = useRef(null), hdgRef = useRef({ move: null, gps: null, compass: null, t: 0 });
  const [gps, setGps] = useState('searching');
  const [live, setLive] = useState(null);

  const fetchRoute = async (a) => { const x = await walkRoute(a, to); route.current = x; setR(x); setRem(x.m); const src = map.current && map.current.getSource && map.current.getSource('walk'); if (src) src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: x.pts } }); return x; };

  useEffect(() => { fetchRoute(from); /* eslint-disable-next-line */ }, []);

  // map
  useEffect(() => {
    let dead = false, m = null;
    (async () => {
      const ml = await import('maplibre-gl');
      const worker = (await import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url')).default;
      await import('maplibre-gl/dist/maplibre-gl.css');
      if (ml.setWorkerUrl) ml.setWorkerUrl(worker);
      if (dead) return;
      m = new ml.Map({ container: box.current, style: dark ? STYLE_DARK : STYLE_LIGHT, center: [from.lng, from.lat], zoom: 16.3, attributionControl: false, fadeDuration: 0 });
      map.current = m;
      m.addControl(new ml.AttributionControl({ compact: true, customAttribution: 'OpenFreeMap, OpenStreetMap' }), 'bottom-left');
      let ready = false;
      const setup = () => {
        if (ready || dead) return; ready = true;
        const x = route.current;
        m.addSource('walk', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: x ? x.pts : [[from.lng, from.lat], [to.lng, to.lat]] } } });
        m.addLayer({ id: 'walk-case', type: 'line', source: 'walk', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': dark ? '#0a0f1c' : '#ffffff', 'line-width': 11 } });
        m.addLayer({ id: 'walk-line', type: 'line', source: 'walk', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#4f6bff', 'line-width': 6, 'line-dasharray': [0.2, 1.6] } });
        const el = document.createElement('div'); el.className = 'wk-dest'; el.innerHTML = '<b></b>';
        new ml.Marker({ element: el }).setLngLat([to.lng, to.lat]).addTo(m);
        const mm = document.createElement('div'); mm.className = 'me3'; mm.innerHTML = '<i></i><b></b>';
        me.current = new ml.Marker({ element: mm }).setLngLat([from.lng, from.lat]).addTo(m);
        const b = new ml.LngLatBounds([from.lng, from.lat], [from.lng, from.lat]); b.extend([to.lng, to.lat]);
        m.resize();
        try { m.fitBounds(b, { padding: { top: 190, bottom: 180, left: 50, right: 50 }, maxZoom: 17, duration: 0 }); } catch (e) { m.fitBounds(b, { padding: 30, maxZoom: 17, duration: 0 }); }
      };
      m.on('load', setup);
      m.on('error', () => { if (!ready && !dead) { m.setStyle(BLANK(dark)); m.once('idle', setup); } });
      setTimeout(() => { if (!ready && !dead) { m.setStyle(BLANK(dark)); m.once('idle', setup); } }, 6000);
      m.on('dragstart', () => { follow.current = false; });
    })();
    return () => { dead = true; if (m) m.remove(); map.current = null; };
    // eslint-disable-next-line
  }, []);

  // which way you face: recent movement or GPS heading, otherwise the compass
  const recompute = () => {
    const x = route.current, pos = posRef.current; if (!x || !pos) return;
    const h = hdgRef.current, moving = Date.now() - h.t < 6000;
    const heading = moving ? (h.gps != null ? h.gps : h.move) : (h.compass != null ? h.compass : null);
    if (heading == null) { setIns({ key: 'wait', rel: 0, state: 'turn' }); return; }
    const a = along(x.pts, pos), tgt = lookAhead(x.pts, a.i, pos, 25);
    setIns(instruction(heading, bearing(pos, tgt)));
  };
  useEffect(() => {
    const onOri = (e) => { const c = e.webkitCompassHeading != null ? e.webkitCompassHeading : (e.absolute || e.type === 'deviceorientationabsolute') && e.alpha != null ? (360 - e.alpha) % 360 : null; if (c != null) hdgRef.current.compass = c; };
    window.addEventListener('deviceorientationabsolute', onOri, true); window.addEventListener('deviceorientation', onOri, true);
    const t = setInterval(recompute, 700);
    return () => { window.removeEventListener('deviceorientationabsolute', onOri, true); window.removeEventListener('deviceorientation', onOri, true); clearInterval(t); };
    // eslint-disable-next-line
  }, []);

  // live position
  useEffect(() => {
    const onFix = (c) => {
      if (arrived.current) return;
      const pos = { lat: c.latitude, lng: c.longitude }; setLive(pos); setGps(c.accuracy > 80 ? 'weak' : 'ok');
      if (me.current) me.current.setLngLat([pos.lng, pos.lat]);
      const x = route.current; if (!x) return;
      const a = along(x.pts, pos); setRem(Math.round(a.rem));
      const h = hdgRef.current;
      if (prev.current) { if (meters(prev.current, pos) >= 6) { h.move = bearing(prev.current, pos); h.t = Date.now(); prev.current = pos; } } else prev.current = pos;
      if (c.heading != null && !Number.isNaN(c.heading) && (c.speed == null || c.speed > 0.8)) { h.gps = c.heading; h.t = Date.now(); }
      posRef.current = pos; recompute();
      if (meters(pos, to) < 35) { arrived.current = true; setIns(null); onArrive && onArrive(); return; }
      offCount.current = a.d > 45 ? offCount.current + 1 : 0;
      if (offCount.current >= 3) { offCount.current = 0; fetchRoute(pos); }
      if (follow.current && map.current) map.current.easeTo({ center: [pos.lng, pos.lat], duration: 600 });
    };
    window.__walkFix = (lat, lng, heading) => { if (heading != null) hdgRef.current.compass = heading; onFix({ latitude: lat, longitude: lng, accuracy: 10 }); };
    if (!navigator.geolocation) { setGps('unavailable'); return undefined; }
    const id = navigator.geolocation.watchPosition((p) => onFix(p.coords), (e) => setGps(e.code === 1 ? 'denied' : 'searching'), { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
    return () => { navigator.geolocation.clearWatch(id); delete window.__walkFix; };
    // eslint-disable-next-line
  }, []);

  return (
    <div className="walkview">
      <div ref={box} className="wk-map" />
      <div className="wk-top glass">
        <button className="x" aria-label={tr('close')} onClick={onClose}><Ico n="close" /></button>
        <small><Ico n="walk" />{tr('walkTo')}</small>
        <h3>{title || to.name}</h3>
        <div className="wk-meta">
          <b>{rem != null ? fmtM(rem) : '...'}</b><span>{rem != null ? walkMin(rem) + ' ' + tr('min') : ''}</span>
          {r && r.est && <span className="wk-est">{tr('walkEst')}</span>}
        </div>
      </div>
      {gps !== 'ok' && <div className={'wk-gps glass ' + gps}>{gps === 'denied' ? tr('locDenied') : gps === 'unavailable' ? tr('gps_unavailable') : tr('searchingGps')}</div>}
      {ins && (
        <div className={'wk-ins ' + ins.state}>
          {ins.key === 'wait' ? <span className="arr"><Ico n="walk" /></span> : <span className="arr" style={{ transform: 'rotate(' + Math.round(ins.rel) + 'deg)' }}><Ico n="arrowup" /></span>}
          <b>{tr('ins_' + ins.key)}</b>
        </div>
      )}
      <div className="wk-bot">
        {live && <button className="btn alt" onClick={() => { follow.current = true; if (map.current) map.current.easeTo({ center: [live.lng, live.lat], zoom: 17, duration: 500 }); }}><Ico n="locate" />{tr('recenter')}</button>}
        <button className="btn" onClick={() => { arrived.current = true; onArrive && onArrive(); }}><Ico n="check" />{tr('imHere')}</button>
      </div>
    </div>
  );
}
