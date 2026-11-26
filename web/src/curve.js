/* Smooth curves through the stations of a route: centripetal Catmull-Rom (no loops or overshoot at uneven spacing).
 * The same curve draws the line and moves the vehicle, so the train always stays on the drawn line. */
const EPS = 1e-6;
const d2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/* point at t (0..1) between p1 and p2, with p0 before and p3 after */
export function cr(p0, p1, p2, p3, t) {
  const k1 = Math.max(Math.sqrt(d2(p0, p1)), EPS), k2 = Math.max(Math.sqrt(d2(p1, p2)), EPS), k3 = Math.max(Math.sqrt(d2(p2, p3)), EPS);
  const t0 = 0, t1 = t0 + k1, t2 = t1 + k2, t3 = t2 + k3, u = t1 + (t2 - t1) * t;
  const mix = (a, b, ta, tb) => [(a[0] * (tb - u) + b[0] * (u - ta)) / (tb - ta), (a[1] * (tb - u) + b[1] * (u - ta)) / (tb - ta)];
  const A1 = mix(p0, p1, t0, t1), A2 = mix(p1, p2, t1, t2), A3 = mix(p2, p3, t2, t3);
  const B1 = mix(A1, A2, t0, t2), B2 = mix(A2, A3, t1, t3);
  return mix(B1, B2, t1, t2);
}

/* the four control points around segment i (the ends are mirrored so the curve leaves the first and last station straight) */
export function around(pts, i) {
  const n = pts.length, p1 = pts[i], p2 = pts[i + 1];
  const p0 = i > 0 ? pts[i - 1] : [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]], p3 = i + 2 < n ? pts[i + 2] : [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]];
  return [p0, p1, p2, p3];
}

/* position and direction (radians) at float index idx along the stations */
export function curveAt(pts, idx) {
  let i = Math.floor(idx); if (i >= pts.length - 1) i = pts.length - 2; if (i < 0) i = 0;
  const t = Math.min(1, Math.max(0, idx - i)), c = around(pts, i), p = cr(c[0], c[1], c[2], c[3], t);
  const a = cr(c[0], c[1], c[2], c[3], Math.max(0, t - 0.03)), b = cr(c[0], c[1], c[2], c[3], Math.min(1, t + 0.03));
  return { x: p[0], y: p[1], ang: Math.atan2(b[1] - a[1], b[0] - a[0]), i };
}

/* dense polyline through the stations, plus where every station index sits in it */
export function smoothPath(pts, per = 10) {
  const out = [], ix = [];
  if (pts.length < 3) return { pts: pts.slice(), ix: pts.map((_, i) => i) };
  for (let i = 0; i < pts.length - 1; i++) {
    const c = around(pts, i); ix.push(out.length);
    for (let k = 0; k < per; k++) out.push(k === 0 ? pts[i] : cr(c[0], c[1], c[2], c[3], k / per));
  }
  ix.push(out.length); out.push(pts[pts.length - 1]);
  return { pts: out, ix };
}
