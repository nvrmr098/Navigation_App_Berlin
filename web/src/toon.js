/* Original 3D kid + dog mascot: toy-like rounded shapes, toon shading with thick outlines, five colors.
 * Everything is built from primitives and animated by joint angles, so no model files are needed. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const COL = { yel: 0xFFC93C, blu: 0x3A86FF, cor: 0xFF6B6B, tan: 0xF7B267, skin: 0xFFD3B6, out: 0x22305A, wht: 0xFFFFFF, hair: 0x35447F, tan2: 0xE3A157, cor2: 0xE85A5A };
const S = Math.sin, K = Math.cos, MX = Math.max, TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

let GRAD = null;
const grad = () => { if (GRAD) return GRAD; const d = new Uint8Array([150, 150, 150, 255, 205, 205, 205, 255, 255, 255, 255, 255]); GRAD = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat); GRAD.minFilter = GRAD.magFilter = THREE.NearestFilter; GRAD.needsUpdate = true; return GRAD; };
const toon = (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: grad() });
const OUTM = new Map();
const outlineMat = (th) => { const key = th.toFixed(4); if (OUTM.has(key)) return OUTM.get(key); const m = new THREE.MeshBasicMaterial({ color: COL.out, side: THREE.BackSide }); m.onBeforeCompile = (s) => { s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(normal) * ${th.toFixed(5)};`); }; m.customProgramCacheKey = () => 'ol' + key; OUTM.set(key, m); return m; };
function part(geo, color, o = {}) {
  const m = new THREE.Mesh(geo, o.mat || toon(color));
  if (o.p) m.position.set(o.p[0], o.p[1], o.p[2]); if (o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]); if (o.s) m.scale.set(o.s[0], o.s[1], o.s[2]);
  if (o.out !== 0) { const sc = o.s ? (o.s[0] + o.s[1] + o.s[2]) / 3 : 1; m.add(new THREE.Mesh(geo, outlineMat((o.out || 0.013) / sc))); }
  return m;
}
const G = {
  sph: (r) => new THREE.SphereGeometry(r, 28, 18),
  cap: (r, L) => new THREE.CapsuleGeometry(r, Math.max(0.001, L - 2 * r), 6, 14),
  box: (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 4, r),
  tor: (R, r, arc = TAU) => new THREE.TorusGeometry(R, r, 10, 28, arc),
};
const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); if (parent) parent.add(g); return g; };

/* ------------------------------------------------ KID ------------------------------------------------ */
export function buildKid() {
  const root = new THREE.Group(), J = { root };
  const pelvis = J.pelvis = grp(root, 0, 0.415, 0);
  const spine = J.spine = grp(pelvis);
  pelvis.add(part(G.box(0.2, 0.1, 0.15, 0.04), COL.blu, { p: [0, 0.02, 0] }));
  for (const [n, s] of [['L', 1], ['R', -1]]) {
    const hip = J['hip' + n] = grp(pelvis, 0.075 * s, 0, 0); hip.add(part(G.cap(0.058, 0.2), COL.blu, { p: [0, -0.1, 0] }));
    const knee = J['knee' + n] = grp(hip, 0, -0.2, 0); knee.add(part(G.cap(0.052, 0.17), COL.blu, { p: [0, -0.085, 0] }));
    const foot = J['foot' + n] = grp(knee, 0, -0.17, 0);
    foot.add(part(G.box(0.11, 0.075, 0.2, 0.034), COL.cor, { p: [0, -0.002, 0.04] }));
    foot.add(part(G.box(0.116, 0.022, 0.21, 0.01), COL.wht, { p: [0, -0.042, 0.04], out: 0.009 }));
  }
  // torso: rain jacket
  const torso = J.torso = grp(spine, 0, 0, 0);
  torso.add(part(G.cap(0.15, 0.34), COL.yel, { p: [0, 0.17, 0], s: [1, 1, 0.86] }));
  torso.add(part(G.box(0.014, 0.28, 0.012, 0.006), COL.out, { p: [0.01, 0.16, 0.131], out: 0 }));
  torso.add(part(G.box(0.07, 0.05, 0.02, 0.01), COL.yel, { p: [-0.07, 0.09, 0.128], r: [0, 0, 0.1], out: 0.008 }));
  torso.add(part(G.tor(0.105, 0.038), COL.yel, { p: [0, 0.335, 0], r: [Math.PI / 2, 0, 0] }));
  torso.add(part(G.sph(0.1), COL.yel, { p: [0, 0.33, -0.1], s: [1.15, 0.95, 0.7] }));
  // backpack
  const pack = J.pack = grp(torso, 0, 0.18, -0.2);
  pack.add(part(G.box(0.27, 0.31, 0.13, 0.055), COL.cor, {}));
  pack.add(part(G.box(0.17, 0.12, 0.05, 0.025), COL.cor2, { p: [0, -0.07, -0.08] }));
  pack.add(part(G.tor(0.035, 0.009, Math.PI), COL.out, { p: [0, 0.16, 0], out: 0 }));
  for (const s of [1, -1]) torso.add(part(G.box(0.03, 0.27, 0.02, 0.008), COL.cor2, { p: [0.09 * s, 0.2, 0.13], r: [0.1, 0, 0.08 * s], out: 0.009 }));
  // arms
  for (const [n, s] of [['L', 1], ['R', -1]]) {
    const sh = J['sh' + n] = grp(torso, 0.18 * s, 0.29, 0); sh.add(part(G.sph(0.058), COL.yel, {}));
    sh.add(part(G.cap(0.047, 0.16), COL.yel, { p: [0, -0.08, 0] }));
    const el = J['el' + n] = grp(sh, 0, -0.16, 0); el.add(part(G.cap(0.044, 0.14), COL.yel, { p: [0, -0.07, 0] }));
    const hand = J['hand' + n] = grp(el, 0, -0.145, 0); hand.add(part(G.sph(0.05), COL.skin, {}));
  }
  // head
  const neck = grp(torso, 0, 0.35, 0.0), head = J.head = grp(neck, 0, 0.17, 0.015);
  const SKIN2 = 0xF2B496, HAIR2 = 0x4A5BA8;
  head.add(part(G.sph(0.21), COL.skin, { s: [1, 0.97, 1] }));
  // neat short boy cut: smooth cap with a high hairline, side-part fringe swept to one side, short tapered sides
  head.add(part(new THREE.SphereGeometry(0.218, 36, 24, 0, TAU, 0, 1.9), COL.hair, { r: [-0.7, 0, 0], p: [0, 0.006, -0.012], out: 0.012 }));
  const hair = J.hair = grp(head, 0, 0.02, 0);
  J.lockL = grp(hair); J.lockR = grp(hair);
  for (const [x, y, z, rz, sx] of [[-0.08, 0.14, 0.155, 0.5, 1.0], [0.0, 0.15, 0.165, 0.2, 1.0], [0.08, 0.14, 0.16, -0.2, 0.9], [0.14, 0.1, 0.12, -0.5, 0.7]]) head.add(part(G.sph(0.07), COL.hair, { p: [x, y, z], s: [sx * 1.15, 0.55, 0.65], r: [0.7, 0, rz], out: 0.01 }));
  J.eyes = [];
  for (const s of [1, -1]) {
    const e = grp(head, 0.082 * s, 0.002, 0.2); e.add(part(G.sph(0.04), COL.out, { s: [0.85, 1.2, 0.5], out: 0 }));
    e.add(part(G.sph(0.0125), COL.wht, { p: [-0.009 * s, 0.02, 0.016], out: 0 })); e.add(part(G.sph(0.0065), COL.wht, { p: [0.012 * s, -0.016, 0.016], out: 0 }));
    J.eyes.push(e);
    // soft brows
    head.add(part(G.cap(0.008, 0.06), HAIR2, { p: [0.083 * s, 0.062, 0.2], r: [0.12, 0, Math.PI / 2 + 0.12 * s], out: 0 }));
    head.add(part(G.sph(0.03), COL.cor, { p: [0.126 * s, -0.04, 0.157], s: [1, 0.7, 0.4], r: [0, 0.6 * s, 0], mat: new THREE.MeshToonMaterial({ color: COL.cor, gradientMap: grad(), transparent: true, opacity: 0.55 }), out: 0 }));
    head.add(part(G.sph(0.04), COL.skin, { p: [0.205 * s, -0.01, -0.01], s: [0.5, 1, 0.9], out: 0.01 }));
  }
  head.add(part(G.sph(0.014), SKIN2, { p: [0, -0.03, 0.208], s: [1.1, 0.8, 0.8], out: 0 }));
  // big friendly smile (a U arc under the nose) plus cheek dimples
  J.smile = part(G.tor(0.052, 0.0075, Math.PI * 0.82), COL.out, { p: [0, -0.04, 0.2], r: [0.1, 0, Math.PI + Math.PI * 0.09], out: 0 }); head.add(J.smile);
  for (const s of [1, -1]) head.add(part(G.sph(0.008), COL.out, { p: [0.062 * s, -0.052, 0.195], s: [0.6, 1.4, 0.4], r: [0, 0, 0.5 * s], out: 0 }));
  J.mouth = part(G.sph(0.04), COL.out, { p: [0, -0.07, 0.196], s: [1, 0.01, 0.5], out: 0 }); head.add(J.mouth);
  J.tongue = part(G.sph(0.022), COL.cor, { p: [0, -0.082, 0.2], s: [1, 0.01, 0.6], out: 0 }); head.add(J.tongue);
  return J;
}
/* p holds angles in radians, "forward" positive: legs hip/knee (knee flex), arms sh/el, lean spine, look head */
export function poseKid(J, p) {
  const d = Object.assign({ hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, shL: 0.05, elL: 0.12, shR: 0.05, elR: 0.12, abd: 0.1, spine: 0, twist: 0, headX: 0, headY: 0, headZ: 0, y: 0, breath: 0, eye: 1, open: 0, smile: 1, tongue: 0, pack: 0, sway: 0, lean: 0 }, p);
  J.pelvis.position.y = 0.415 + d.y; J.pelvis.rotation.set(0, d.twist * 0.5, d.sway);
  J.spine.rotation.set(d.spine, d.twist * -0.5, -d.sway * 0.6);
  J.torso.scale.set(1, 1 + d.breath * 0.025, 1 + d.breath * 0.02);
  J.hipL.rotation.x = -d.hipL; J.hipR.rotation.x = -d.hipR; J.kneeL.rotation.x = d.kneeL; J.kneeR.rotation.x = d.kneeR;
  J.footL.rotation.x = -(-d.hipL + d.kneeL) * 0.35; J.footR.rotation.x = -(-d.hipR + d.kneeR) * 0.35;
  J.shL.rotation.set(-d.shL, 0, d.abd); J.shR.rotation.set(-d.shR, 0, -d.abd); J.elL.rotation.x = -d.elL; J.elR.rotation.x = -d.elR;
  J.head.rotation.set(d.headX, d.headY, d.headZ);
  J.hair.rotation.set(-d.headX * 0.7 - d.spine * 0.6 + d.y * 2.5, -d.headY * 0.3, -d.headZ * 0.5); J.lockL.rotation.z = -0.05 + d.y * 1.5 - d.headZ * 0.3; J.lockR.rotation.z = 0.05 - d.y * 1.5 - d.headZ * 0.3;
  J.eyes.forEach((e) => { e.scale.y = Math.max(0.08, d.eye); });
  J.smile.visible = d.open < 0.08; J.mouth.scale.set(1 + d.open * 0.2, 0.01 + d.open * 1.1, 0.5); J.mouth.visible = d.open >= 0.08;
  J.tongue.scale.set(1, 0.01 + d.tongue * 0.6, 0.6); J.tongue.visible = d.tongue > 0.02 && d.open >= 0.08;
  J.pack.position.y = 0.18 + d.pack; J.pack.rotation.x = d.pack * 3;
}

/* ------------------------------------------------ DOG ------------------------------------------------ */
export function buildDog() {
  const root = new THREE.Group(), J = { root };
  const FUR = 0xF2A24A, FUR2 = 0xFFD7A1, FUR3 = 0xD9822C;
  const body = J.body = grp(root, 0, 0.255, 0);
  body.add(part(G.sph(0.13), FUR, { s: [1, 0.95, 1.45], out: 0.011 }));
  body.add(part(G.sph(0.1), FUR, { p: [0, -0.005, 0.12], out: 0.01 }));
  body.add(part(G.sph(0.1), FUR, { p: [0, 0.0, -0.13], out: 0.01 }));
  body.add(part(G.sph(0.09), FUR2, { p: [0, -0.07, 0.07], s: [0.9, 0.7, 1.3], out: 0.009 }));
  const neck = grp(body, 0, 0.07, 0.19), head = J.head = grp(neck, 0, 0.05, 0.05);
  // modest chest ruff
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; neck.add(part(G.sph(0.038), FUR2, { p: [Math.sin(a) * 0.085, -0.035 + Math.cos(a) * 0.06, -0.01], out: 0.008 })); }
  neck.add(part(G.sph(0.07), FUR2, { p: [0, -0.08, 0.04], s: [1.1, 0.9, 0.9], out: 0.009 }));
  // round head with a clear snout
  head.add(part(G.sph(0.105), FUR, { s: [1.05, 1, 1.0], out: 0.01 }));
  for (const s of [1, -1]) head.add(part(G.sph(0.04), FUR2, { p: [0.04 * s, -0.045, 0.085], out: 0.009 }));
  head.add(part(G.sph(0.05), FUR2, { p: [0, -0.04, 0.115], s: [1, 0.85, 1.2], out: 0.009 }));
  head.add(part(G.sph(0.022), COL.out, { p: [0, -0.012, 0.178], s: [1.2, 0.85, 0.9], out: 0 }));
  head.add(part(G.tor(0.022, 0.004, Math.PI), COL.out, { p: [0, -0.052, 0.168], r: [0.2, 0, Math.PI], out: 0 }));
  J.eyes = [];
  for (const s of [1, -1]) {
    const e = grp(head, 0.045 * s, 0.03, 0.09); e.add(part(G.sph(0.0225), COL.out, { s: [0.9, 1.15, 0.7], out: 0 })); e.add(part(G.sph(0.008), COL.wht, { p: [-0.005 * s, 0.01, 0.013], out: 0 })); J.eyes.push(e);
    const ear = J['ear' + (s > 0 ? 'L' : 'R')] = grp(head, 0.06 * s, 0.085, -0.005);
    ear.add(part(G.sph(0.036), FUR3, { p: [0, 0.035, 0], s: [0.85, 1.4, 0.5], out: 0.01 }));
    ear.add(part(G.sph(0.022), COL.cor2, { p: [0, 0.03, 0.013], s: [0.8, 1.2, 0.4], out: 0 }));
  }
  J.tongue = part(G.sph(0.02), COL.cor, { p: [0, -0.068, 0.15], s: [1, 0.4, 1.6], out: 0.007 }); head.add(J.tongue);
  const collar = part(G.tor(0.09, 0.014), COL.cor, { p: [0, -0.02, 0.0], r: [Math.PI / 2 - 0.5, 0, 0], out: 0.008 }); neck.add(collar);
  J.collar = grp(neck, 0, -0.085, 0.07); J.collar.add(part(G.sph(0.019), COL.yel, { s: [1, 1, 0.5], out: 0.007 }));
  J.legs = [];
  for (const [fx, fz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const up = grp(body, 0.065 * fx, -0.05, 0.115 * fz); up.add(part(G.cap(0.036, 0.1), FUR, { p: [0, -0.042, 0], out: 0.009 }));
    const lo = grp(up, 0, -0.088, 0); lo.add(part(G.cap(0.03, 0.09), FUR, { p: [0, -0.04, 0], out: 0.009 }));
    const paw = grp(lo, 0, -0.082, 0); paw.add(part(G.sph(0.038), FUR2, { p: [0, 0.0, 0.012], s: [1, 0.75, 1.3], out: 0.008 }));
    J.legs.push({ up, lo, paw, front: fz > 0 });
  }
  // tail curled over the back
  const t1 = J.tail1 = grp(body, 0, 0.07, -0.2);
  t1.add(part(G.sph(0.06), FUR, { p: [0, 0.03, 0], out: 0.009 }));
  const t2 = J.tail2 = grp(t1, 0, 0.07, 0);
  t2.add(part(G.sph(0.075), FUR2, { p: [0, 0.03, 0.0], s: [1.1, 1, 1.1], out: 0.009 }));
  t2.add(part(G.sph(0.06), FUR2, { p: [0, 0.07, 0.05], out: 0.009 }));
  return J;
}
export function poseDog(J, p) {
  const d = Object.assign({ y: 0, pitch: 0, yaw: 0, roll: 0, headX: 0, headY: 0, headZ: 0, ear: 0.2, earSwing: 0, tail: 0, tailUp: 0.9, tongue: 0, eye: 1, legs: [[0, 0.1], [0, 0.1], [0, 0.1], [0, 0.1]], chest: 0 }, p);
  J.body.position.y = 0.255 + d.y; J.body.rotation.set(d.pitch, d.yaw, d.roll); J.body.scale.set(1, 1 + (d.breath || 0) * 0.035, 1 + (d.breath || 0) * 0.02);
  J.head.rotation.set(d.headX, d.headY, d.headZ);
  J.earL.rotation.set(d.ear, 0, -0.35 + d.earSwing); J.earR.rotation.set(d.ear, 0, 0.35 - d.earSwing);
  J.eyes.forEach((e) => { e.scale.y = Math.max(0.1, d.eye); });
  J.tongue.scale.set(1, 0.01 + d.tongue * 0.45, 1 + d.tongue * 0.6); J.tongue.visible = d.tongue > 0.03;
  d.legs.forEach((a, i) => { const L = J.legs[i]; L.up.rotation.x = -a[0]; L.lo.rotation.x = a[1]; L.paw.rotation.x = -(-a[0] + a[1]) * 0.3; });
  J.tail1.rotation.set(-d.tailUp, 0, d.tail); J.tail2.rotation.set(-0.5, 0, d.tail * 0.6);
}

export { part, G, grp, toon, grad };

/* ------------------------------------------------ BIKE ------------------------------------------------ */
const tube = (a, b, r, color, out) => { // capsule between two points in the y,z plane
  const dz = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dz, dy), m = part(G.cap(r, L + 2 * r), color, { out: out || 0.009 });
  m.position.set(0, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2); m.rotation.x = Math.atan2(dz, dy); return m;
};
export const BIKE = { R: 0.26, rear: -0.36, front: 0.44, bb: [0.08, 0.22], crank: 0.09, seat: [-0.03, 0.55], bar: [0.37, 0.78] };
export function buildBike() {
  const root = new THREE.Group(), B = { root, wheels: [] }, FR = 0x3A86FF, FR2 = 0x2A6BE0, TIRE = 0x2B3556;
  const wheel = (parent, z) => {
    const g = grp(parent, 0, BIKE.R, z); const spin = grp(g);
    spin.add(part(G.tor(BIKE.R - 0.03, 0.03), TIRE, { r: [0, Math.PI / 2, 0], out: 0.01 }));
    spin.add(part(G.tor(BIKE.R - 0.075, 0.008), 0xFFFFFF, { r: [0, Math.PI / 2, 0], out: 0 }));
    for (let i = 0; i < 4; i++) spin.add(part(G.box(0.01, BIKE.R * 1.6, 0.012, 0.004), 0xFFFFFF, { r: [(i * Math.PI) / 4, 0, 0], out: 0 }));
    spin.add(part(G.sph(0.03), 0xFFC93C, { out: 0.007 })); B.wheels.push(spin); return g;
  };
  wheel(root, BIKE.rear);
  const fork = grp(root, 0, 0, 0); B.fork = fork; // steers around the head tube
  const head0 = [0.37, 0.72], fz = BIKE.front;
  const fw = wheel(fork, fz);
  for (const s of [1, -1]) { const t = tube([head0[0], head0[1]], [fz, BIKE.R], 0.011, 0x8C97B2, 0.006); t.position.x = 0.04 * s; fork.add(t); }
  fork.add(tube([head0[0], head0[1]], [BIKE.bar[0], BIKE.bar[1]], 0.016, FR2));
  const bar = part(G.cap(0.016, 0.38), 0x2B3556, { p: [0, BIKE.bar[1], BIKE.bar[0]], r: [0, 0, Math.PI / 2], out: 0.008 }); fork.add(bar);
  for (const s of [1, -1]) fork.add(part(G.cap(0.02, 0.1), COL.cor, { p: [0.17 * s, BIKE.bar[1], BIKE.bar[0]], r: [0, 0, Math.PI / 2], out: 0.007 }));
  fork.add(part(G.sph(0.03), COL.yel, { p: [0, BIKE.bar[1] + 0.03, BIKE.bar[0] + 0.05], s: [1.1, 0.9, 0.8], out: 0.006 })); // bell
  const bb = BIKE.bb, st = BIKE.seat, ra = [BIKE.rear, BIKE.R], ht = head0;
  root.add(tube(bb, st, 0.017, FR), tube(st, [ht[0] - 0.02, ht[1] - 0.02], 0.017, FR), tube(bb, [ht[0] - 0.02, ht[1] - 0.06], 0.019, FR), tube(bb, ra, 0.012, FR2, 0.007), tube(st, ra, 0.012, FR2, 0.007), tube([st[0], st[1]], [st[0] - 0.01, st[1] + 0.07], 0.012, 0x8C97B2, 0.006));
  root.add(part(G.box(0.1, 0.035, 0.2, 0.016), 0x2B3556, { p: [0, st[1] + 0.09, st[0] - 0.02] }));
  const crank = B.crank = grp(root, 0, bb[1], bb[0]); crank.add(part(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16), 0x8C97B2, { r: [0, 0, Math.PI / 2], p: [0.04, 0, 0], out: 0.007 }));
  B.pedals = [];
  for (const s of [1, -1]) { const arm = grp(crank, 0.07 * s, 0, 0); arm.add(part(G.box(0.014, BIKE.crank * 2, 0.02, 0.006), 0x8C97B2, { out: 0.006 })); const pd = grp(root, 0.09 * s, bb[1], bb[0]); pd.add(part(G.box(0.07, 0.016, 0.1, 0.008), 0x2B3556, { out: 0.007 })); B.pedals.push({ arm, pd, s }); }
  return B;
}
/* theta: pedal angle (0 = right pedal forward), wheel: wheel angle, steer: small handlebar turn. Returns the pedal ankle targets (y, z) for the legs. */
export function poseBike(B, theta, wheel, steer = 0) {
  B.wheels.forEach((w) => { w.rotation.x = wheel; });
  B.fork.rotation.y = steer; B.crank.rotation.x = theta * 0 + 0;
  const out = [];
  B.pedals.forEach((p, i) => { const a = theta + (i ? Math.PI : 0), z = BIKE.bb[0] + BIKE.crank * Math.cos(a), y = BIKE.bb[1] + BIKE.crank * Math.sin(a); p.pd.position.set(0.09 * p.s, y, z); p.arm.parent.rotation.x = -theta; out.push([y, z]); });
  return out;
}
/* two bone leg or arm solver in the y,z plane. Returns [upper angle, bend] with "forward" positive. leg = true: the lower part trails back at the knee. */
export function solve2(hip, target, L1, L2, leg = true) {
  let dz = target[1] - hip[1], dy = target[0] - hip[0]; const d0 = Math.hypot(dz, dy), d = Math.min(d0, L1 + L2 - 0.002, Math.max(d0, Math.abs(L1 - L2) + 0.002));
  const k = Math.acos(Math.max(-1, Math.min(1, (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2)))), phi = Math.atan2(dz, -dy), beta = Math.atan2(L2 * Math.sin(k), L1 + L2 * Math.cos(k));
  return leg ? [phi + beta, k] : [phi - beta, k];
}
