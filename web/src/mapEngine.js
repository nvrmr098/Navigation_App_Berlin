/* Canvas 2D map: network drawing, labels, route overlay, pan and zoom. React owns the state, this class owns the pixels. */
import { R, ST, INFO, edges, rank, BB, clamp, pointAt } from './net.js';

const FONT = '"Inter Variable", Inter, system-ui, sans-serif';

export class MapEngine {
  constructor(cv, cb) {
    this.cv = cv; this.ctx = cv.getContext('2d'); this.cb = cb;
    this.W = 0; this.H = 0; this.dpr = 1;
    this.view = { cx: 1.5, cy: -0.5, z: 15 }; this.z0 = 15;
    this.filter = 'both'; this.selected = -1; this.overlay = null; this.lbl = true; this.user = null;
    this.needs = false; this.hit = []; this.ptrs = {}; this.down = null; this.lastPinch = 0; this.inited = false;
    this.css = {};
    this.onDown = (e) => {
      cv.setPointerCapture(e.pointerId); this.ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      this.down = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false };
      if (Object.keys(this.ptrs).length === 2) {
        const p = Object.values(this.ptrs); this.lastPinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); this.down.moved = true;
      }
      this.cb.onManual && this.cb.onManual();
    };
    this.onMove = (e) => {
      const p = this.ptrs[e.pointerId]; if (!p) return;
      const ids = Object.keys(this.ptrs), r = cv.getBoundingClientRect(), v = this.view;
      if (ids.length === 1) {
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        if (Math.abs(e.clientX - this.down.x) + Math.abs(e.clientY - this.down.y) > 6) this.down.moved = true;
        v.cx -= dx / v.z; v.cy -= dy / v.z;
      } else if (ids.length === 2) {
        const o = this.ptrs[ids[0] === String(e.pointerId) ? ids[1] : ids[0]], nx = { x: e.clientX, y: e.clientY };
        const d = Math.hypot(nx.x - o.x, nx.y - o.y);
        if (this.lastPinch) this.zoomAt((nx.x + o.x) / 2 - r.left, (nx.y + o.y) / 2 - r.top, d / this.lastPinch);
        this.lastPinch = d;
      }
      p.x = e.clientX; p.y = e.clientY; this.schedule();
    };
    this.onUp = (e) => {
      const had = this.ptrs[e.pointerId]; delete this.ptrs[e.pointerId]; this.lastPinch = 0;
      if (had && this.down && !this.down.moved && Date.now() - this.down.t < 450 && !Object.keys(this.ptrs).length) this.tap(e.clientX, e.clientY);
    };
    this.onCancel = (e) => { delete this.ptrs[e.pointerId]; this.lastPinch = 0; };
    this.onWheel = (e) => {
      e.preventDefault(); const r = cv.getBoundingClientRect();
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
      this.cb.onManual && this.cb.onManual();
    };
    cv.addEventListener('pointerdown', this.onDown); cv.addEventListener('pointermove', this.onMove);
    cv.addEventListener('pointerup', this.onUp); cv.addEventListener('pointercancel', this.onCancel);
    cv.addEventListener('wheel', this.onWheel, { passive: false });
  }
  destroy() {
    const cv = this.cv;
    cv.removeEventListener('pointerdown', this.onDown); cv.removeEventListener('pointermove', this.onMove);
    cv.removeEventListener('pointerup', this.onUp); cv.removeEventListener('pointercancel', this.onCancel);
    cv.removeEventListener('wheel', this.onWheel);
  }
  showLine(l) { return this.filter === 'both' || INFO[l].p === this.filter; }
  sx(x) { return (x - this.view.cx) * this.view.z + this.W / 2; }
  sy(y) { return (y - this.view.cy) * this.view.z + this.H / 2; }
  schedule() { if (this.needs) return; this.needs = true; requestAnimationFrame(() => { this.needs = false; this.draw(); }); }

  resize() {
    const r = this.cv.getBoundingClientRect(); if (!r.width) return false;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2); this.W = r.width; this.H = r.height;
    this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr);
    this.z0 = Math.min((this.W - 8) / (BB.x1 - BB.x0 + 1.4), (this.H - 150) / (BB.y1 - BB.y0 + 1.4));
    if (!this.inited) { this.view.z = this.z0; this.fitAll(); this.inited = true; }
    this.schedule(); return true;
  }
  fitAll() { this.view.cx = (BB.x0 + BB.x1) / 2; this.view.cy = (BB.y0 + BB.y1) / 2 + 0.3; this.view.z = this.z0; this.schedule(); }
  fitPoints(pts, padTop, padBottom) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    pts.forEach((p) => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
    const w = Math.max(x1 - x0, 1.5), h = Math.max(y1 - y0, 1.5), availH = this.H - padTop - padBottom, v = this.view;
    v.z = clamp(Math.min((this.W - 110) / w, availH / h), this.z0 * 0.8, this.z0 * 9);
    v.cx = (x0 + x1) / 2; v.cy = (y0 + y1) / 2 + (padBottom - padTop) / 2 / v.z; this.schedule();
  }
  zoomAt(px, py, f) {
    const v = this.view, nz = clamp(v.z * f, this.z0 * 0.6, this.z0 * 14);
    const wx = (px - this.W / 2) / v.z + v.cx, wy = (py - this.H / 2) / v.z + v.cy;
    v.z = nz; v.cx = wx - (px - this.W / 2) / nz; v.cy = wy - (py - this.H / 2) / nz; this.schedule();
  }
  zoomBy(f) { this.view.z = clamp(this.view.z * f, this.z0 * 0.6, this.z0 * 14); this.schedule(); }
  centerOn(s, zoomMin, lift) {
    const v = this.view; v.cx = s.x; v.cy = s.y - lift / Math.max(v.z, this.z0 * 4); v.z = Math.max(v.z, this.z0 * zoomMin); this.schedule();
  }
  tap(cx, cy) {
    const r = this.cv.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
    let best = null, bd = 26;
    this.hit.forEach((v) => { const d = Math.hypot(v.x - x, v.y - y); if (d < bd) { bd = d; best = v.s; } });
    this.cb.onTap && this.cb.onTap(best ? best.i : -1);
  }
  readCss() {
    const cs = getComputedStyle(document.body);
    this.css = { map: cs.getPropertyValue('--map').trim() || '#eef1f9', map2: cs.getPropertyValue('--map2').trim() || '#ffffff', accent: cs.getPropertyValue('--accent').trim() || '#4f6bff' };
    this.dark = document.body.classList.contains('dark');
  }

  draw() {
    const { ctx, W, H } = this; if (!W) return;
    this.readCss(); const dark = this.dark, view = this.view, overlay = this.overlay;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(W / 2, H * 0.46, 10, W / 2, H * 0.46, Math.max(W, H) * 0.75);
    g.addColorStop(0, this.css.map2); g.addColorStop(1, this.css.map); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const k = view.z / this.z0, dim = overlay ? 0.2 : 1;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const lw = clamp(3.2 * Math.sqrt(k), 2.4, 7.5);
    ['S', 'U'].forEach((prod) => {
      edges.forEach((e) => {
        const ls = e.lines.filter((l) => this.showLine(l) && INFO[l].p === prod); if (!ls.length) return;
        const a = ST[e.a], b = ST[e.b], x1 = this.sx(a.x), y1 = this.sy(a.y), x2 = this.sx(b.x), y2 = this.sy(b.y);
        if ((x1 < -50 && x2 < -50) || (x1 > W + 50 && x2 > W + 50) || (y1 < -50 && y2 < -50) || (y1 > H + 50 && y2 > H + 50)) return;
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, n = ls.length, gap = lw;
        ls.forEach((l, i) => {
          const off = (i - (n - 1) / 2) * gap;
          ctx.beginPath(); ctx.moveTo(x1 + nx * off, y1 + ny * off); ctx.lineTo(x2 + nx * off, y2 + ny * off);
          if (prod === 'U') { ctx.strokeStyle = dark ? '#111' : '#fff'; ctx.globalAlpha = dim; ctx.lineWidth = lw + 2.2; ctx.stroke(); }
          ctx.strokeStyle = INFO[l].c; ctx.lineWidth = prod === 'U' ? lw : lw * 0.92; ctx.globalAlpha = dim; ctx.stroke();
        });
      });
    });
    ctx.globalAlpha = 1;
    if (overlay) this.drawRoute(k);

    const visible = [];
    ST.forEach((s) => {
      const ls = s.lines.filter((l) => this.showLine(l)); if (!ls.length) return;
      const x = this.sx(s.x), y = this.sy(s.y); if (x < -20 || x > W + 20 || y < -20 || y > H + 20) return;
      const tr = ls.length > 1, r = (tr ? 4.4 : 2.7) * clamp(Math.sqrt(k), 0.8, 1.6);
      ctx.globalAlpha = overlay ? 0.35 : 1;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = dark ? '#171a27' : '#fff'; ctx.fill();
      ctx.lineWidth = tr ? 2.4 : 1.7; ctx.strokeStyle = dark ? '#e9ecf5' : '#12162a'; ctx.stroke();
      visible.push({ s, x, y, r });
    });
    ctx.globalAlpha = 1;
    this.drawLabels(visible, k, dark);
    if (this.selected >= 0) {
      const s = ST[this.selected], x = this.sx(s.x), y = this.sy(s.y);
      ctx.beginPath(); ctx.arc(x, y, 13, 0, 6.2832); ctx.strokeStyle = this.css.accent; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 4, 0, 6.2832); ctx.fillStyle = this.css.accent; ctx.fill();
    }
    if (overlay && overlay.marker != null) this.drawMarker();
    if (this.user) this.drawUser();
    this.hit = visible;
  }

  drawLabels(vis, k, dark) {
    const { ctx, W, H } = this, overlay = this.overlay;
    const maxN = this.lbl ? Math.round(14 * Math.pow(k, 2.3)) : Math.round(6 * Math.pow(k, 2));
    const placed = [], force = {}, onRoute = {};
    if (overlay) {
      overlay.path.pts.forEach((p) => { onRoute[p.st] = 1; });
      overlay.path.legs.forEach((L) => { force[overlay.path.pts[L.a].st] = 1; force[overlay.path.pts[L.b].st] = 1; });
    }
    if (this.selected >= 0) force[this.selected] = 1;
    vis.sort((a, b) => (force[b.s.i] ? 1e6 : 0) - (force[a.s.i] ? 1e6 : 0) || rank[a.s.i] - rank[b.s.i]);
    ctx.font = '600 ' + (k > 3 ? 13 : 11.5) + 'px ' + FONT; ctx.textBaseline = 'middle';
    const ink = dark ? '#eef0f8' : '#12162a', halo = this.css.map; let n = 0;
    for (let i = 0; i < vis.length; i++) {
      const v = vis[i], f = force[v.s.i];
      if (!f && !onRoute[v.s.i] && n >= maxN) break;
      if (overlay && !f && !onRoute[v.s.i]) continue;
      const w = ctx.measureText(v.s.name).width, h = 14, pad = v.r + 4;
      const cands = [[v.x + pad, v.y - h / 2], [v.x - pad - w, v.y - h / 2], [v.x - w / 2, v.y - pad - h], [v.x - w / 2, v.y + pad]];
      let done = false;
      for (let c = 0; c < cands.length && !done; c++) {
        const bx = cands[c][0], by = cands[c][1];
        let ok = bx > 2 && bx + w < W - 2 && by > 60 && by + h < H - 2;
        if (ok) for (let j = 0; j < placed.length; j++) { const p = placed[j]; if (bx < p[2] && bx + w > p[0] && by < p[3] && by + h > p[1]) { ok = false; break; } }
        if (!ok && !f) continue;
        placed.push([bx, by, bx + w, by + h]);
        ctx.lineWidth = 3.5; ctx.strokeStyle = halo; ctx.lineJoin = 'round'; ctx.strokeText(v.s.name, bx, by + h / 2);
        ctx.fillStyle = ink; ctx.fillText(v.s.name, bx, by + h / 2); done = true;
      }
      if (done) n++;
    }
  }

  drawPortion(pts, a, b, frac) {
    const ctx = this.ctx; let tot = 0, i;
    for (i = a; i < b; i++) tot += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    const lim = tot * frac; let acc = 0, tip = pts[a], ang = 0;
    ctx.beginPath(); ctx.moveTo(pts[a][0], pts[a][1]);
    for (i = a; i < b; i++) {
      const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], d = Math.hypot(dx, dy);
      if (acc + d <= lim) { ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); acc += d; tip = pts[i + 1]; ang = Math.atan2(dy, dx); }
      else { const t = (lim - acc) / (d || 1); tip = [pts[i][0] + dx * t, pts[i][1] + dy * t]; ctx.lineTo(tip[0], tip[1]); ang = Math.atan2(dy, dx); break; }
    }
    return { tip, ang };
  }
  arrow(x, y, ang, size, col) {
    const ctx = this.ctx; ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.beginPath();
    ctx.moveTo(size, 0); ctx.lineTo(-size * 0.7, -size * 0.8); ctx.lineTo(-size * 0.7, size * 0.8); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke(); ctx.restore();
  }
  drawRoute(k) {
    const ctx = this.ctx, o = this.overlay, pts = o.path.pts.map((p) => [this.sx(p.x), this.sy(p.y)]), w = clamp(7 * Math.sqrt(k), 6, 13);
    o.route.legs.forEach((lg, li) => {
      const seg = o.path.legs[li], frac = o.reveal ? o.reveal[li] : 1; if (frac <= 0) return;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const r = this.drawPortion(pts, seg.a, seg.b, frac); ctx.strokeStyle = '#fff'; ctx.lineWidth = w + 4; ctx.globalAlpha = 1; ctx.stroke();
      this.drawPortion(pts, seg.a, seg.b, frac); ctx.strokeStyle = lg.c; ctx.lineWidth = w; ctx.stroke();
      let tot = 0, i; for (i = seg.a; i < seg.b; i++) tot += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      const step = 70; let d = step / 2, acc = 0;
      for (i = seg.a; i < seg.b; i++) {
        const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], L = Math.hypot(dx, dy);
        while (d < acc + L && d <= tot * frac) { const t = (d - acc) / (L || 1); this.arrow(pts[i][0] + dx * t, pts[i][1] + dy * t, Math.atan2(dy, dx), 5.2, lg.c); d += step; }
        acc += L;
      }
      if (o.reveal && frac < 1) this.arrow(r.tip[0], r.tip[1], r.ang, 9, lg.c);
    });
    o.path.pts.forEach((p, i) => {
      const li = p.leg, frac = o.reveal ? o.reveal[li] : 1; if (frac <= 0) return;
      const first = i === 0, last = i === o.path.pts.length - 1, x = pts[i][0], y = pts[i][1];
      const isEnd = o.path.legs.some((L) => L.a === i || L.b === i);
      ctx.beginPath(); ctx.arc(x, y, isEnd ? 8 : 4.2, 0, 6.2832); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = o.route.legs[li].c; ctx.stroke();
      if (first || last) {
        ctx.beginPath(); ctx.arc(x, y, 11, 0, 6.2832); ctx.fillStyle = first ? this.css.accent : '#e5231b'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = '700 12px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(first ? 'A' : 'B', x, y + 0.5); ctx.textAlign = 'left';
      }
    });
  }
  drawUser() {
    const ctx = this.ctx, u = this.user, x = this.sx(u.x), y = this.sy(u.y), pul = 16 + 5 * Math.sin(Date.now() / 300);
    ctx.beginPath(); ctx.arc(x, y, pul, 0, 6.2832); ctx.fillStyle = 'rgba(34,196,255,.22)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 8, 0, 6.2832); ctx.fillStyle = '#22a6ff'; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    if (this.userAnim) this.schedule();
  }
  drawMarker() {
    const ctx = this.ctx, o = this.overlay, m = pointAt(o, o.marker), x = this.sx(m.x), y = this.sy(m.y);
    const col = o.route.legs[clamp(R.legAt(o.path, o.marker), 0, o.route.legs.length - 1)].c, pul = 14 + 4 * Math.sin(Date.now() / 220);
    ctx.beginPath(); ctx.arc(x, y, pul, 0, 6.2832); ctx.fillStyle = 'rgba(10,108,255,.2)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.2832); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = col; ctx.stroke();
    this.arrow(x + Math.cos(m.ang) * 15, y + Math.sin(m.ang) * 15, m.ang, 6, col);
  }
}
