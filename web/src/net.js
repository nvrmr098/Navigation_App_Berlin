import NET from './data.json';
import { createRouter } from './route.js';

export { NET };
export const R = createRouter(NET);
export const ST = R.ST;
export const INFO = R.INFO;

// unique edges, with the lines that share them (used for parallel bundles on the map)
const edgeMap = {};
Object.keys(NET.lines).forEach((l) => {
  NET.lines[l].v.forEach((seq) => {
    for (let i = 0; i < seq.length - 1; i++) {
      const a = seq[i], b = seq[i + 1], k = a < b ? a + '|' + b : b + '|' + a;
      const e = edgeMap[k] || (edgeMap[k] = { a: Math.min(a, b), b: Math.max(a, b), lines: [] });
      if (e.lines.indexOf(l) < 0) e.lines.push(l);
    }
  });
});
export const edges = Object.keys(edgeMap).map((k) => {
  const e = edgeMap[k];
  e.lines.sort((x, y) => x.localeCompare(y, 'en', { numeric: true }));
  return e;
});

const byWeight = ST.slice().sort((a, b) => b.w - a.w);
export const rank = {};
byWeight.forEach((s, i) => { rank[s.i] = i; });

export const BB = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
ST.forEach((s) => {
  BB.x0 = Math.min(BB.x0, s.x); BB.x1 = Math.max(BB.x1, s.x);
  BB.y0 = Math.min(BB.y0, s.y); BB.y1 = Math.max(BB.y1, s.y);
});

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function lum(hex) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// position on the route path for a float station index
export function pointAt(overlay, idx) {
  const p = overlay.path.pts;
  let i = Math.floor(idx);
  if (i >= p.length - 1) i = p.length - 2;
  if (i < 0) i = 0;
  const t = idx - i;
  return {
    x: p[i].x + (p[i + 1].x - p[i].x) * t,
    y: p[i].y + (p[i + 1].y - p[i].y) * t,
    ang: Math.atan2(p[i + 1].y - p[i].y, p[i + 1].x - p[i].x),
    i,
  };
}
