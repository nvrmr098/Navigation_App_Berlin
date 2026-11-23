import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { tr } from './i18n.js';
import { Ico } from './ui.jsx';

/* Separate maps for tram, bus and regional trains (RE/RB). Drawn from VBB open data (CC BY 3.0),
 * positions are real (latitude and longitude). The drawing itself is original. */
const loaders = {
  tram: () => import('./modes-tram.json'),
  bus: () => import('./modes-bus.json'),
  re: () => import('./modes-re.json'),
};
const LAT0 = 52.52, LON0 = 13.405, KX = 111.32 * Math.cos(LAT0 * Math.PI / 180), KY = 110.57;
const proj = (lat, lng) => [(lng - LON0) * KX, -(lat - LAT0) * KY];
const rankOf = (n) => (/^M/.test(n) ? 0 : /^X/.test(n) ? 1 : /^N/.test(n) ? 3 : 2);
const nice = (n) => n.replace(/,\s*(Bahnhof|Bf)$/, '').replace(/,\s*(Hbf|Hauptbahnhof)$/, ' Hbf');
const natural = (a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b, 'en', { numeric: true });

export default function ModeMap({ kind, dark, lang, onBoard }) {
  const cv = useRef(null), box = useRef(null);
  const [data, setData] = useState(null);
  const [sel, setSel] = useState('');
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(null);
  const view = useRef({ cx: 0, cy: 0, k: 20 });
  const draw = useRef(null);

  useEffect(() => {
    let dead = false; setData(null); setSel(''); setPick(null); setQ('');
    loaders[kind]().then((m) => { if (!dead) setData(m.default || m); });
    return () => { dead = true; };
  }, [kind]);

  const model = useMemo(() => {
    if (!data) return null;
    const P = data.s.map((s) => proj(s[1], s[2]));
    const lineNames = Object.keys(data.l).sort(natural);
    const stopLines = data.s.map(() => []);
    lineNames.forEach((n) => { const seen = {}; data.l[n].v.forEach((v) => v.forEach((i) => { if (!seen[i]) { seen[i] = 1; stopLines[i].push(n); } })); });
    const term = {};
    lineNames.forEach((n) => data.l[n].v.forEach((v) => { term[v[0]] = 1; term[v[v.length - 1]] = 1; }));
    return { P, lineNames, stopLines, term };
  }, [data]);

  const fit = useCallback((idx) => {
    if (!model || !box.current) return;
    const W = box.current.clientWidth, H = box.current.clientHeight;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    const xs = idx.map((i) => model.P[i][0]).sort((a, b) => a - b), ys = idx.map((i) => model.P[i][1]).sort((a, b) => a - b), cut = idx.length > 80 ? Math.floor(idx.length * 0.03) : 0;
    x0 = xs[cut]; x1 = xs[xs.length - 1 - cut]; y0 = ys[cut]; y1 = ys[ys.length - 1 - cut];
    const top = 170, bot = 120;
    const k = Math.min((W - 40) / Math.max(0.5, x1 - x0), (H - top - bot) / Math.max(0.5, y1 - y0));
    const k2 = k * 0.82; view.current = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 + (bot - top) / 2 / k2, k: k2 };
    draw.current && draw.current();
  }, [model]);

  // initial and selection fit
  useEffect(() => {
    if (!model) return;
    if (sel) { const ids = []; data.l[sel].v.forEach((v) => v.forEach((i) => ids.push(i))); fit(ids); return; }
    const ids = [];
    model.P.forEach((p, i) => { if (kind === 're') ids.push(i); else if (kind === 'tram' ? (p[0] > -12 && p[0] < 16 && p[1] > -17 && p[1] < 17) : (Math.abs(p[0]) < 24 && Math.abs(p[1]) < 26)) ids.push(i); });
    fit(ids.length ? ids : model.P.map((p, i) => i));
  }, [model, sel, kind, fit, data]);

  // drawing
  useEffect(() => {
    if (!model) return undefined;
    const c = cv.current, ctx = c.getContext('2d');
    const ink = dark ? '#f3f5fb' : '#0d1020', halo = dark ? '#090b12' : '#f2f4fa';
    const render = () => {
      const W = box.current.clientWidth, H = box.current.clientHeight, dpr = window.devicePixelRatio || 1;
      if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px'; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const { cx, cy, k } = view.current, X = (p) => (p[0] - cx) * k + W / 2, Y = (p) => (p[1] - cy) * k + H / 2;
      const base = kind === 'bus' ? Math.max(0.9, Math.min(2.2, k / 40)) : kind === 'tram' ? 2.6 : 3.2;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const names = sel ? [sel] : model.lineNames;
      const order = sel ? model.lineNames.filter((n) => n !== sel).concat(sel) : names;
      order.forEach((n) => {
        const L = data.l[n], on = !sel || n === sel;
        ctx.strokeStyle = L.c; ctx.globalAlpha = on ? (kind === 'bus' && !sel ? 0.7 : 0.95) : 0.12; ctx.lineWidth = on && sel ? base * 2 : base;
        L.v.forEach((v) => { ctx.beginPath(); v.forEach((i, j) => { const x = X(model.P[i]), y = Y(model.P[i]); if (!j) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke(); });
      });
      ctx.globalAlpha = 1;
      const showDots = kind !== 'bus' || k > 70 || sel;
      const label = (i, bold) => {
        const x = X(model.P[i]), y = Y(model.P[i]); if (x < -40 || x > W + 40 || y < -20 || y > H + 20) return;
        ctx.font = (bold ? '600 ' : '500 ') + '11.5px Inter, system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = halo; ctx.fillStyle = ink;
        const t = nice(data.s[i][0]), right = x < W - 120; ctx.textAlign = right ? 'left' : 'right';
        ctx.strokeText(t, x + (right ? 7 : -7), y); ctx.fillText(t, x + (right ? 7 : -7), y);
      };
      const ids = [];
      if (sel) { const seen = {}; data.l[sel].v.forEach((v) => v.forEach((i) => { if (!seen[i]) { seen[i] = 1; ids.push(i); } })); }
      else if (showDots) model.P.forEach((p, i) => ids.push(i));
      ids.forEach((i) => {
        const x = X(model.P[i]), y = Y(model.P[i]); if (x < -10 || x > W + 10 || y < -10 || y > H + 10) return;
        const big = model.term[i] || model.stopLines[i].length > 2, rs = Math.max(1.1, Math.min(1, k / 14));
        ctx.beginPath(); ctx.arc(x, y, sel ? 4 : (big ? 3.4 : 2.1) * Math.min(1, Math.max(0.4, k / 25)), 0, 7); ctx.fillStyle = dark ? '#161a27' : '#fff'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = sel ? data.l[sel].c : ink; ctx.stroke();
      });
      if (sel) { const seen = {}; let n = 0; data.l[sel].v.forEach((v) => v.forEach((i) => { if (!seen[i]) { seen[i] = 1; n++; } })); ids.forEach((i) => { if (n < 30 || k > 60 || model.term[i]) label(i, model.term[i]); }); }
      else if (kind === 're') Object.keys(model.term).forEach((i) => { const p = model.P[i]; if (Math.hypot(p[0], p[1]) > 32 || k > 14) label(+i, true); });
      else if (kind === 'tram') Object.keys(model.term).forEach((i) => { if (k > 22) label(+i, true); });
      else if (k > 160) ids.forEach((i) => { if (model.stopLines[i].length > 3) label(i, true); });
      if (pick != null) { const x = X(model.P[pick]), y = Y(model.P[pick]); ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.lineWidth = 3; ctx.strokeStyle = '#4f6bff'; ctx.stroke(); }
    };
    draw.current = render; render();
    const ro = new ResizeObserver(render); ro.observe(box.current);
    return () => ro.disconnect();
  }, [model, sel, dark, kind, data, pick]);

  // gestures
  useEffect(() => {
    const el = box.current; if (!el) return undefined;
    const ptr = {}; let last = null, moved = 0, down = 0;
    const pts = () => Object.values(ptr);
    const zoomAt = (f, sx, sy) => { const v = view.current, W = el.clientWidth, H = el.clientHeight; const wx = (sx - W / 2) / v.k + v.cx, wy = (sy - H / 2) / v.k + v.cy; v.k = Math.max(3, Math.min(4000, v.k * f)); v.cx = wx - (sx - W / 2) / v.k; v.cy = wy - (sy - H / 2) / v.k; draw.current(); };
    const pd = (e) => { if (e.target.closest('.mm-ui')) return; el.setPointerCapture && el.setPointerCapture(e.pointerId); ptr[e.pointerId] = { x: e.clientX, y: e.clientY }; last = null; moved = 0; down = performance.now(); };
    const pm = (e) => {
      if (!ptr[e.pointerId]) return; const old = { ...ptr[e.pointerId] }; ptr[e.pointerId] = { x: e.clientX, y: e.clientY };
      const a = pts(); const r = el.getBoundingClientRect();
      if (a.length === 1) { const v = view.current; v.cx -= (e.clientX - old.x) / v.k; v.cy -= (e.clientY - old.y) / v.k; moved += Math.abs(e.clientX - old.x) + Math.abs(e.clientY - old.y); draw.current(); }
      else if (a.length === 2) { const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); if (last) zoomAt(d / last, (a[0].x + a[1].x) / 2 - r.left, (a[0].y + a[1].y) / 2 - r.top); last = d; moved += 10; }
    };
    const pu = (e) => {
      const was = ptr[e.pointerId]; delete ptr[e.pointerId]; last = null;
      if (was && moved < 8 && performance.now() - down < 500 && model) {
        const r = el.getBoundingClientRect(), W = el.clientWidth, H = el.clientHeight, v = view.current;
        let best = -1, bd = 22 * 22;
        model.P.forEach((p, i) => { const x = (p[0] - v.cx) * v.k + W / 2 + r.left, y = (p[1] - v.cy) * v.k + H / 2 + r.top, d = (x - e.clientX) ** 2 + (y - e.clientY) ** 2; if (d < bd) { bd = d; best = i; } });
        setPick(best >= 0 ? best : null);
      }
    };
    const wh = (e) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left, e.clientY - r.top); };
    el.addEventListener('pointerdown', pd); el.addEventListener('pointermove', pm); el.addEventListener('pointerup', pu); el.addEventListener('pointercancel', pu); el.addEventListener('wheel', wh, { passive: false });
    el._zoom = zoomAt;
    return () => { el.removeEventListener('pointerdown', pd); el.removeEventListener('pointermove', pm); el.removeEventListener('pointerup', pu); el.removeEventListener('pointercancel', pu); el.removeEventListener('wheel', wh); };
  }, [model]);

  const chips = model ? model.lineNames.filter((n) => !q || n.toLowerCase().startsWith(q.trim().toLowerCase())).slice(0, 60) : [];
  const zoom = (f) => box.current && box.current._zoom(f, box.current.clientWidth / 2, box.current.clientHeight / 2);
  const here = pick != null && model ? { name: data.s[pick][0], lines: model.stopLines[pick] } : null;
  return (
    <div className="mmap" ref={box}>
      <canvas ref={cv} />
      {!model && <div className="loading3d glass"><span className="spin" />{tr('loading')}</div>}
      <div className="mm-ui mm-bar">
        <div className="mm-q glass"><Ico n="search" /><input value={q} placeholder={tr('lineSearch')} onChange={(e) => setQ(e.target.value)} inputMode="search" /></div>
        <div className="mm-chips">
          <button className={'lchip' + (!sel ? ' on' : '')} onClick={() => setSel('')}>{tr('all')}</button>
          {chips.map((n) => <button key={n} className={'lchip' + (sel === n ? ' on' : '')} style={{ '--lc': data.l[n].c }} onClick={() => { setSel(sel === n ? '' : n); setPick(null); }}><i />{n}</button>)}
        </div>
      </div>
      <div className="mm-ui mm-zoom">
        <button className="fab glass" aria-label="+" onClick={() => zoom(1.5)}>+</button>
        <button className="fab glass" aria-label="-" onClick={() => zoom(1 / 1.5)}>&minus;</button>
      </div>
      {here && (
        <div className="mm-ui mm-card glass">
          <button className="x" aria-label={tr('close')} onClick={() => setPick(null)}><Ico n="close" /></button>
          <h3>{here.name}</h3>
          <div className="mm-lines">{here.lines.slice(0, 14).map((n) => <button key={n} className="lchip on" style={{ '--lc': data.l[n].c }} onClick={() => { setSel(n); setPick(null); }}><i />{n}</button>)}</div>
          {onBoard && <button className="btn alt sm wide" onClick={() => onBoard(here.name)}><Ico n="train" />{tr('liveDepArr')}</button>}
        </div>
      )}
      <div className="mm-note">{tr('modeCredit')}</div>
    </div>
  );
}
