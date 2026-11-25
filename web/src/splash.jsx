import React, { useEffect, useRef } from 'react';
import { NET, R, ST } from './net.js';
import { project } from './geo.js';
import TRAM from './modes-tram.json';
import { Logo } from './ui.jsx';
import { tr } from './i18n.js';

/* Start clip, 6.5 seconds: "The line that finds you".
 * A flat dark map of Berlin: street grid and S-Bahn ring, the lines draw themselves (U blue, S green, tram red, bus purple),
 * a yellow route leaves the "you are here" dot, changes lines with a ping at each transfer, a time pill counts down,
 * alternatives flicker and vanish, the destination pin drops, the route morphs into the Bearline ring and the name fades in.
 * Everything is drawn on one canvas as a function of time, so a slow phone can skip straight to the last frame. */
const T_END = 6.5, NAVY = '#0B1020';
const C = { U: '#3b8cff', S: '#3fbf63', T: '#ef5a4a', B: '#a66bff', Y: '#ffd400', G: 'rgba(255,255,255,' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const outBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const outBounce = (x) => { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; };
const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();

/* ---- scene data, built once ---- */
function build() {
  const longest = (L) => L.v.reduce((a, b) => (b.length > a.length ? b : a), L.v[0]);
  const items = [];
  const pushLine = (pts, kind, w, st) => {
    let tot = 0; const cum = [0];
    for (let i = 1; i < pts.length; i++) { tot += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(tot); }
    items.push({ pts, cum, tot: tot || 1, kind, w, st });
  };
  const names = Object.keys(NET.lines);
  const ring = names.filter((n) => n === 'S41' || n === 'S42'), sl = names.filter((n) => /^S/.test(n) && ring.indexOf(n) < 0), ul = names.filter((n) => /^U/.test(n));
  ring.concat(sl).forEach((n) => { const v = longest(NET.lines[n]); pushLine(v.map((i) => [ST[i].x, ST[i].y]), 'S', n === 'S41' || n === 'S42' ? 2.6 : 2.2, v); });
  ul.forEach((n) => { const v = longest(NET.lines[n]); pushLine(v.map((i) => [ST[i].x, ST[i].y]), 'U', 2.4, v); });
  const tp = TRAM.s.map((s) => { const p = project(s[1], s[2]); return [p.x, p.y]; });
  Object.keys(TRAM.l).forEach((n) => { const v = longest(TRAM.l[n]); pushLine(v.map((i) => tp[i]), 'T', 1.5, null); });
  // bus: a few long purple curves through the middle of the city
  const mid = ST.filter((s) => Math.hypot(s.x, s.y) < 7); const used = {};
  for (let k = 0; k < 7; k++) {
    let cur = mid[Math.floor(rnd() * mid.length)], pts = [[cur.x, cur.y]], ang = rnd() * 6.28;
    for (let h = 0; h < 7; h++) {
      let best = null, bd = 1e9;
      mid.forEach((s) => { if (used[s.i]) return; const dx = s.x - cur.x, dy = s.y - cur.y, d = Math.hypot(dx, dy); if (d < 0.8 || d > 3.2) return; const a = Math.atan2(dy, dx), turn = Math.abs(((a - ang + 9.42) % 6.283) - 3.14); if (turn < 1.0 && d + turn < bd) { bd = d + turn; best = s; } });
      if (!best) break; ang = Math.atan2(best.y - cur.y, best.x - cur.x); used[best.i] = 1; cur = best; pts.push([cur.x, cur.y]);
    }
    if (pts.length > 3) pushLine(pts, 'B', 1.4, null);
  }
  // route: S then U (found with the app's own router), then a short tram hop to the destination
  let route = null;
  for (const pair of [['Charlottenburg', 'Schönhauser Allee'], ['Zoologischer Garten', 'Frankfurter Allee'], ['Schöneberg', 'Hauptbahnhof']]) {
    const a = R.byName(pair[0]), b = R.byName(pair[1]); if (!a || !b) continue;
    const rs = R.routes(a.i, b.i); if (rs.length && rs[0].legs.length >= 2) { route = rs[0]; break; }
  }
  const pts = [], cuts = [];
  if (route) {
    route.legs.forEach((lg, li) => { lg.stations.forEach((s, k) => { if (li > 0 && k === 0) return; pts.push([ST[s].x, ST[s].y]); }); cuts.push(pts.length - 1); });
    const e = pts[pts.length - 1]; pts.push([e[0] + 1.0, e[1] - 0.5], [e[0] + 2.0, e[1] - 1.5], [e[0] + 2.9, e[1] - 2.6]); cuts.push(pts.length - 1);
  } else { for (let i = 0; i < 12; i++) pts.push([-4 + i * 0.8, 2 - i * 0.6]); cuts.push(5, 11); }
  let tot = 0; const cum = [0]; for (let i = 1; i < pts.length; i++) { tot += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(tot); }
  const landmarks = [];
  const tv = R.byName('Alexanderplatz'), bg = R.byName('Brandenburger Tor');
  if (tv) landmarks.push({ k: 'tv', x: tv.x + 0.25, y: tv.y - 0.15 }); if (bg) landmarks.push({ k: 'gate', x: bg.x, y: bg.y + 0.1 });
  // sparkles and node network around the route
  const spark = [], nodes = [];
  for (let i = 0; i < 22; i++) { const f = rnd(), a = rnd() * 6.28, r = 0.35 + rnd() * 1.1; spark.push({ f, a, r, ph: rnd() * 9, s: 2.5 + rnd() * 4 }); }
  for (let i = 0; i < 14; i++) { const f = i / 13, a = rnd() * 6.28, r = 0.5 + rnd() * 1.0; nodes.push({ f, a, r, ph: rnd() * 9 }); }
  const alts = [0, 1].map((k) => ({ off: k ? -1 : 1, amp: 0.5 + k * 0.35, ph: rnd() * 5 }));
  return { items, route: { pts, cum, tot: tot || 1, cuts, legs: route ? route.legs.length + 1 : 3 }, landmarks, spark, nodes, alts };
}
let SCENE = null;

function sampleAt(route, f) { // point on the route polyline at fraction f
  const d = clamp(f, 0, 1) * route.tot; let i = 1; while (i < route.cum.length - 1 && route.cum[i] < d) i++;
  const seg = route.cum[i] - route.cum[i - 1] || 1, u = clamp((d - route.cum[i - 1]) / seg, 0, 1), a = route.pts[i - 1], b = route.pts[i];
  return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, i };
}

function drawFrame(g, W, H, t, S, snd) {
  const route = S.route;
  // camera: fit the route, slow push in
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; route.pts.forEach((p) => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
  const base = Math.min(W * 0.6 / Math.max(2, x1 - x0), H * 0.5 / Math.max(2, y1 - y0));
  const push = 1 + 0.05 * ease(clamp((t - 1) / 1.5, 0, 1)), out = 1 - 0.2 * ease(clamp((t - 5) / 1, 0, 1)), sc = base * push * out;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 - 0.15, ox = W / 2, oy = H * 0.46;
  const X = (x) => ox + (x - cx) * sc, Y = (y) => oy + (y - cy) * sc;
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = NAVY; g.fillRect(0, 0, W, H);
  const vg = g.createRadialGradient(W / 2, H * 0.4, 20, W / 2, H * 0.45, Math.max(W, H) * 0.7); vg.addColorStop(0, 'rgba(40,58,120,.28)'); vg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);

  // 0.0-1.0 street grid and ring fade in
  const fadeIn = ease(clamp(t / 0.9, 0, 1)), dimK = 1 - 0.7 * ease(clamp((t - 2.5) / 0.4, 0, 1));
  g.save(); g.translate(ox, oy); g.rotate(0.21); g.scale(push * out, push * out); g.strokeStyle = C.G + (0.12 * fadeIn) + ')'; g.lineWidth = 0.8;
  const sp = 34; g.beginPath(); for (let i = -14; i <= 14; i++) { g.moveTo(i * sp, -H); g.lineTo(i * sp, H); g.moveTo(-W, i * sp * 1.15); g.lineTo(W, i * sp * 1.15); } g.stroke();
  g.strokeStyle = C.G + (0.09 * fadeIn) + ')'; g.beginPath(); g.moveTo(-W, -80); g.lineTo(W, 120); g.moveTo(-W * 0.2, -H); g.lineTo(W * 0.5, H); g.stroke(); g.restore();

  // landmarks as tiny line icons
  const lmA = ease(clamp((t - 0.3) / 0.8, 0, 1)) * dimK * 0.9;
  g.save(); g.strokeStyle = C.G + (0.5 * lmA) + ')'; g.lineWidth = 1.3; g.lineCap = 'round'; g.lineJoin = 'round';
  S.landmarks.forEach((l) => {
    const x = X(l.x), y = Y(l.y);
    if (l.k === 'tv') { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 22); g.moveTo(x, y - 30); g.lineTo(x, y - 40); g.stroke(); g.beginPath(); g.arc(x, y - 26, 4.2, 0, 6.3); g.stroke(); }
    else { g.beginPath(); g.moveTo(x - 12, y); g.lineTo(x + 12, y); g.moveTo(x - 13, y - 14); g.lineTo(x + 13, y - 14); g.moveTo(x - 13, y - 17); g.lineTo(x + 13, y - 17); for (let k = -2; k <= 2; k++) { g.moveTo(x + k * 5, y); g.lineTo(x + k * 5, y - 14); } g.stroke(); }
  });
  g.restore();

  // 1.0-2.5 lines draw themselves, staggered; stations pop
  const n = S.items.length, win = 1.1, len = 0.42;
  g.lineCap = 'round'; g.lineJoin = 'round';
  S.items.forEach((it, k) => {
    const start = 1.0 + (k / Math.max(1, n - 1)) * win, p = ease(clamp((t - start) / len, 0, 1)); if (p <= 0) return;
    const col = C[it.kind], lim = it.tot * p; let acc = 0;
    g.globalAlpha = (it.kind === 'S' || it.kind === 'U' ? 0.95 : 0.7) * dimK;
    g.strokeStyle = col; g.lineWidth = it.w * (sc / 30 > 1.3 ? 1.3 : 1); g.beginPath(); g.moveTo(X(it.pts[0][0]), Y(it.pts[0][1]));
    for (let i = 1; i < it.pts.length; i++) {
      const a = it.pts[i - 1], b = it.pts[i], d = it.cum[i] - it.cum[i - 1];
      if (it.cum[i] <= lim) g.lineTo(X(b[0]), Y(b[1])); else { const u = (lim - it.cum[i - 1]) / (d || 1); g.lineTo(X(a[0] + (b[0] - a[0]) * u), Y(a[1] + (b[1] - a[1]) * u)); break; }
      acc = it.cum[i];
    }
    g.stroke();
    if (it.st) {
      it.st.forEach((si, j) => {
        const f = it.cum[j] / it.tot, k2 = clamp((p - f) / 0.18, 0, 1); if (k2 <= 0) return;
        const r = 2.6 * outBack(k2); g.fillStyle = NAVY; g.beginPath(); g.arc(X(ST[si].x), Y(ST[si].y), Math.max(0, r + 1.2), 0, 6.3); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(X(ST[si].x), Y(ST[si].y), Math.max(0, r), 0, 6.3); g.fill();
      });
    }
  });
  g.globalAlpha = 1;

  // "you are here": pulsing dot at the start of the route from the very beginning
  const sx = X(route.pts[0][0]), sy = Y(route.pts[0][1]), hereA = ease(clamp((t - 0.2) / 0.5, 0, 1));
  if (hereA > 0) {
    const pu = (t * 0.9) % 1; g.globalAlpha = hereA * (1 - pu) * 0.7; g.strokeStyle = C.Y; g.lineWidth = 2; g.beginPath(); g.arc(sx, sy, 6 + pu * 26, 0, 6.3); g.stroke(); g.globalAlpha = hereA;
    g.fillStyle = C.Y; g.beginPath(); g.arc(sx, sy, 6.5 * outBack(clamp((t - 0.2) / 0.5, 0, 1)), 0, 6.3); g.fill(); g.lineWidth = 3; g.strokeStyle = NAVY; g.stroke(); g.globalAlpha = 1;
  }

  // 2.5-4.0 the smart route
  const rp = ease(clamp((t - 2.5) / 1.5, 0, 1)), rp2 = clamp((t - 2.5) / 1.5, 0, 1);
  const px = route.pts.map((p) => [X(p[0]), Y(p[1])]);
  const polyUpTo = (f, arr) => { const out = [arr[0]]; const d = f * route.tot; for (let i = 1; i < arr.length; i++) { if (route.cum[i] <= d) out.push(arr[i]); else { const u = (d - route.cum[i - 1]) / ((route.cum[i] - route.cum[i - 1]) || 1); out.push([arr[i - 1][0] + (arr[i][0] - arr[i - 1][0]) * u, arr[i - 1][1] + (arr[i][1] - arr[i - 1][1]) * u]); break; } } return out; };
  let morph = ease(clamp((t - 5.0) / 0.9, 0, 1));
  if (t >= 2.5) {
    const poly = polyUpTo(rp, px);
    // ring target for the morph into the logo
    const Ls = Math.min(W * 0.56, 230), lcx = W / 2, lcy = H * 0.42, erx = Ls * 0.45, ery = Ls * 0.35;
    let drawPoly = poly;
    if (morph > 0) {
      const N = 140, res = [], total = route.cum[route.cum.length - 1], full = polyUpTo(1, px);
      // resample the whole route to N points by arc length
      const ps = [0]; for (let i = 1; i < full.length; i++) ps.push(ps[i - 1] + Math.hypot(full[i][0] - full[i - 1][0], full[i][1] - full[i - 1][1]));
      for (let k = 0; k < N; k++) {
        const d = ps[ps.length - 1] * k / (N - 1); let i = 1; while (i < ps.length - 1 && ps[i] < d) i++;
        const u = (d - ps[i - 1]) / ((ps[i] - ps[i - 1]) || 1), a = full[i - 1], b = full[i], rx = a[0] + (b[0] - a[0]) * u, ry = a[1] + (b[1] - a[1]) * u;
        const th = Math.PI + (k / (N - 1)) * 6.2832, ex = lcx + erx * Math.cos(th), ey = lcy + ery * Math.sin(th), m = ease(clamp((morph * 1.35 - 0.35 * k / N), 0, 1));
        res.push([rx + (ex - rx) * m, ry + (ey - ry) * m]);
      }
      drawPoly = res;
    }
    const alt = ease(clamp((t - 4.0) / 0.6, 0, 1)) * (1 - ease(clamp((t - 4.7) / 0.35, 0, 1)));
    // ghost alternatives (4.0-5.0): the app weighing options
    if (alt > 0) {
      S.alts.forEach((al) => {
        g.save(); g.globalAlpha = 0.45 * alt; g.strokeStyle = '#cdd6ff'; g.lineWidth = 1.6; g.setLineDash([5, 7]); g.beginPath();
        const m = polyUpTo(clamp((t - 4.0) / 0.6, 0, 1), px).map((p, i, a) => { const nx = a[Math.min(a.length - 1, i + 1)][1] - a[Math.max(0, i - 1)][1], ny = -(a[Math.min(a.length - 1, i + 1)][0] - a[Math.max(0, i - 1)][0]), L = Math.hypot(nx, ny) || 1, o = al.off * sc * al.amp * Math.sin(i / Math.max(1, a.length - 1) * 3.14) * 1.2; return [p[0] + nx / L * o, p[1] + ny / L * o]; });
        m.forEach((p, i) => { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.stroke(); g.restore();
      });
    }
    // the yellow route with glow
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    const grad = g.createLinearGradient(lcx - erx, lcy, lcx + erx, lcy), mk = morph;
    const mix = (a, b, k) => { const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)], pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)]; return 'rgb(' + pa.map((v, i) => Math.round(v + (pb[i] - v) * k)).join(',') + ')'; };
    grad.addColorStop(0, mix('#ffd400', '#6d7cff', mk)); grad.addColorStop(1, mix('#ffd400', '#22c4ff', mk));
    g.strokeStyle = mk > 0 ? grad : C.Y; g.shadowColor = 'rgba(255,212,0,' + (0.8 * (1 - mk) + 0.4 * mk) + ')'; g.shadowBlur = 16;
    g.lineWidth = (5 + 1.5 * mk) * (1 + 0.1 * Math.sin(t * 6) * (1 - mk)); g.globalAlpha = 1;
    g.beginPath(); drawPoly.forEach((p, i) => { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.stroke(); g.restore();
    // ripple pings at the transfers
    route.cuts.slice(0, -1).forEach((ci) => {
      const f = route.cum[ci] / route.tot, tt = 2.5 + f * 1.5; const k = (t - tt) / 0.75; if (k < 0 || k > 1 || morph > 0.1) return;
      if (snd && !snd.fired['p' + ci]) { snd.fired['p' + ci] = 1; snd.ping(); }
      [0, 0.25].forEach((dl) => { const kk = clamp(k - dl, 0, 1); if (!kk) return; g.globalAlpha = (1 - kk) * 0.9; g.strokeStyle = '#fff6b8'; g.lineWidth = 2.5; g.beginPath(); g.arc(px[ci][0], px[ci][1], 8 + kk * 34, 0, 6.3); g.stroke(); });
      g.globalAlpha = 1; g.fillStyle = '#fff'; g.beginPath(); g.arc(px[ci][0], px[ci][1], 5, 0, 6.3); g.fill(); g.strokeStyle = C.Y; g.lineWidth = 3; g.stroke();
    });
    // time pill riding the head of the route
    if (t < 5.0) {
      const head = poly[poly.length - 1], left = Math.max(1, Math.ceil(12 * (1 - rp2))), label = (t >= 4.0 ? 1 : left) + ' min', w = 64, h = 26, op = 1 - ease(clamp((t - 4.4) / 0.5, 0, 1));
      g.globalAlpha = op * ease(clamp((t - 2.5) / 0.25, 0, 1)); const bx = Math.max(10, Math.min(W - w - 10, head[0] + 12)), by = Math.max(10, head[1] - 38);
      g.fillStyle = '#fff'; g.beginPath(); if (g.roundRect) g.roundRect(bx, by, w, h, 13); else g.rect(bx, by, w, h); g.fill();
      g.beginPath(); g.moveTo(bx + 8, by + h - 1); g.lineTo(head[0] + 3, head[1] - 8); g.lineTo(bx + 20, by + h - 1); g.fill();
      g.fillStyle = NAVY; g.font = '700 13px "Inter Variable",Inter,system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, bx + w / 2, by + h / 2 + 0.5); g.globalAlpha = 1;
    }
    // 4.0-5.0 sparkles and node network
    const ai = ease(clamp((t - 3.95) / 0.3, 0, 1)) * (1 - ease(clamp((t - 4.75) / 0.4, 0, 1)));
    if (ai > 0) {
      const nodes = S.nodes.map((nd) => { const q = sampleAt(route, nd.f); return [X(q.x) + Math.cos(nd.a) * nd.r * sc, Y(q.y) + Math.sin(nd.a) * nd.r * sc, nd.ph]; });
      g.lineWidth = 1; for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { const d = Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]); if (d < sc * 2.2) { g.globalAlpha = ai * 0.3 * (0.5 + 0.5 * Math.sin(t * 7 + nodes[i][2])); g.strokeStyle = '#bfc9ff'; g.beginPath(); g.moveTo(nodes[i][0], nodes[i][1]); g.lineTo(nodes[j][0], nodes[j][1]); g.stroke(); } }
      nodes.forEach((nd) => { g.globalAlpha = ai * (0.4 + 0.5 * Math.sin(t * 8 + nd[2])); g.fillStyle = '#e8ecff'; g.beginPath(); g.arc(nd[0], nd[1], 2, 0, 6.3); g.fill(); });
      S.spark.forEach((sp2) => {
        const q = sampleAt(route, sp2.f), x = X(q.x) + Math.cos(sp2.a) * sp2.r * sc * 0.5, y = Y(q.y) + Math.sin(sp2.a) * sp2.r * sc * 0.5, a = Math.max(0, Math.sin(t * 9 + sp2.ph)), s2 = sp2.s * a;
        if (a < 0.05) return; g.globalAlpha = ai * a; g.fillStyle = '#fff6c4'; g.beginPath(); g.moveTo(x, y - s2); g.quadraticCurveTo(x, y, x + s2, y); g.quadraticCurveTo(x, y, x, y + s2); g.quadraticCurveTo(x, y, x - s2, y); g.quadraticCurveTo(x, y, x, y - s2); g.fill();
      }); g.globalAlpha = 1;
    }
    // destination pin drops in with a soft bounce (4.2-4.9)
    const pk = clamp((t - 4.2) / 0.7, 0, 1);
    if (pk > 0 && morph < 0.6) {
      const e = px[px.length - 1], drop = (1 - outBounce(pk)) * 70, a = (1 - ease(clamp((morph - 0.1) / 0.4, 0, 1)));
      g.globalAlpha = a; g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(e[0], e[1] + 2, 9 * (0.4 + 0.6 * pk), 3.2, 0, 0, 6.3); g.fill();
      g.save(); g.translate(e[0], e[1] - drop); g.fillStyle = '#fff'; g.strokeStyle = C.Y; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-18, -17, -13, -37, 0, -37); g.bezierCurveTo(13, -37, 18, -17, 0, 0); g.fill(); g.stroke(); g.fillStyle = NAVY; g.beginPath(); g.arc(0, -24, 5, 0, 6.3); g.fill(); g.restore(); g.globalAlpha = 1;
    }
  }
}

export default function Splash({ onDone }) {
  const cv = useRef(null), logo = useRef(null), name = useRef(null), wrap = useRef(null);
  useEffect(() => {
    if (!SCENE) SCENE = build();
    const S = SCENE, c = cv.current, g = c.getContext('2d');
    let W = 0, H = 0, raf = 0, t0 = performance.now(), done = false, frames = 0, slow = 0, skipAt = null, last = t0, ac = null;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const size = () => { const dpr = Math.min(window.devicePixelRatio || 1, 2); W = c.clientWidth; H = c.clientHeight; c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.scale(1, 1); return dpr; };
    let dpr = size();
    // soft sound: swell, pings at the transfers, a short chime when the logo lands. Plays only where the browser allows audio without a tap.
    const snd = { fired: {}, ping() {}, };
    try {
      const AC = window.AudioContext || window.webkitAudioContext; let on = true; try { on = JSON.parse(localStorage.getItem('bl1') || '{}').sound !== false; } catch (e) { /* ignore */ }
      if (AC && on && !reduce) {
        ac = new AC(); if (ac.state === 'suspended') ac.resume().catch(() => {});
        const tone = (f, at, dur, vol, type) => { const o = ac.createOscillator(), gn = ac.createGain(); o.type = type || 'sine'; o.frequency.value = f; o.connect(gn); gn.connect(ac.destination); const t = ac.currentTime + at; gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(vol, t + 0.03); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.start(t); o.stop(t + dur + 0.05); return o; };
        const sw = ac.createOscillator(), sg = ac.createGain(); sw.type = 'triangle'; sw.frequency.setValueAtTime(110, ac.currentTime); sw.frequency.exponentialRampToValueAtTime(330, ac.currentTime + 4); sw.connect(sg); sg.connect(ac.destination);
        sg.gain.setValueAtTime(0.0001, ac.currentTime); sg.gain.exponentialRampToValueAtTime(0.045, ac.currentTime + 3.6); sg.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 4.4); sw.start(); sw.stop(ac.currentTime + 4.5);
        snd.ping = () => tone(880, 0, 0.35, 0.05); setTimeout(() => { if (!done && ac) { tone(660, 0, 0.9, 0.06); tone(990, 0.08, 1.0, 0.045); } }, 5300);
      }
    } catch (e) { ac = null; }

    const finish = () => { if (done) return; done = true; if (wrap.current) wrap.current.classList.add('out'); setTimeout(onDone, 420); };
    const apply = (t) => {
      drawFrame(g, W, H, t, S, t === window.__splashT ? null : snd);
      const b = ease(clamp((t - 4.95) / 0.9, 0, 1));
      c.style.filter = b > 0 ? 'blur(' + (b * 9).toFixed(1) + 'px)' : ''; c.style.opacity = String(1 - 0.78 * ease(clamp((t - 5.25) / 0.7, 0, 1)));
      const lk = ease(clamp((t - 5.35) / 0.5, 0, 1)), nk = ease(clamp((t - 5.55) / 0.5, 0, 1));
      if (logo.current) { logo.current.style.opacity = String(lk); logo.current.style.transform = 'translate(-50%,-50%) scale(' + (0.86 + 0.14 * outBack(clamp((t - 5.35) / 0.55, 0, 1))).toFixed(3) + ')'; }
      if (name.current) { name.current.style.opacity = String(nk); name.current.style.transform = 'translate(-50%,' + ((1 - nk) * 10).toFixed(1) + 'px)'; }
    };
    if (window.__splashT != null) { apply(window.__splashT); return () => {}; }
    if (reduce) { apply(T_END); const id = setTimeout(finish, 900); return () => clearTimeout(id); }
    const loop = (now) => {
      let t = (now - t0) / 1000; const dt = now - last; last = now;
      if (skipAt != null) { t = Math.max(t, skipAt + (now - skipT) / 1000); }
      frames++; if (frames > 6 && frames < 40 && dt > 70) slow++;
      if (slow > 14 && skipAt == null) { skipAt = 5.6; skipT = now; }
      apply(Math.min(t, T_END));
      if (t >= T_END) { finish(); return; }
      raf = requestAnimationFrame(loop);
    };
    let skipT = 0;
    const onSkip = () => { if (skipAt == null && !done) { skipAt = Math.max(5.4, (performance.now() - t0) / 1000); skipT = performance.now(); } };
    wrap.current.addEventListener('pointerdown', onSkip);
    const onResize = () => { dpr = size(); };
    window.addEventListener('resize', onResize);
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); try { ac && ac.close(); } catch (e) { /* closed */ } };
    // eslint-disable-next-line
  }, []);
  const Ls = typeof window !== 'undefined' ? Math.min(window.innerWidth * 0.56, 230) : 200;
  return (
    <div className="splash2" ref={wrap} role="status" aria-label="Bearline">
      <canvas ref={cv} className="s2cv" />
      <div ref={logo} className="s2logo" style={{ top: '42%' }}><Logo size={Ls} id="s2l" /></div>
      <div ref={name} className="s2name" style={{ top: 'calc(42% + ' + Math.round(Ls * 0.62) + 'px)' }}><h1>Bearline</h1><p>{tr('splashTag')}</p></div>
    </div>
  );
}
