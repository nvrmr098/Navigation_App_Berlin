/* Five stylised toon vehicles (RE double-decker, bus, S-Bahn, U-Bahn, tram) built from primitives. Nose points to -z like the old vehicles. */
import * as THREE from 'three';
import { part, G, grp, COL, toon } from './toon.js';

const GL = 0x2B4F7E, GLH = 0x9FD0F7, DARK = 0x3A4466, RED = 0xE5483F, RED2 = 0xC93A33, WHITE = 0xFAFBFF, CREAM = 0xFFF1D6, YEL = 0xFFC93C, YEL2 = 0xF2AE1F, STEEL = 0x8C97B2;
const basic = (c) => new THREE.MeshBasicMaterial({ color: c });
const rbox = (w, h, d, r) => G.box(w, h, d, Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002));

/* helpers ---------------------------------------------------------------- */
function addWheel(v, x, z, r, w = 0.09) {
  const g = grp(v.body, x, r, z); const cyl = part(new THREE.CylinderGeometry(r, r, w, 22), DARK, { r: [Math.PI / 2, 0, 0], out: 0.012 }); g.add(cyl);
  const hub = part(new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.01, 14), STEEL, { r: [Math.PI / 2, 0, 0], out: 0 }); g.add(hub);
  const sp = part(G.box(r * 1.5, r * 0.22, 0.012, 0.01), 0xFFFFFF, { p: [0, 0, (w + 0.01) / 2 + 0.004], out: 0 }); g.add(sp);
  const sp2 = sp.clone(); sp2.position.z = -(w + 0.01) / 2 - 0.004; g.add(sp2);
  v.wheels.push({ g, r }); return g;
}
function addWindows(v, xs, y, w, h, zHalf, color = GL, depth = 0.02) {
  for (const x of xs) for (const s of [1, -1]) { v.body.add(part(rbox(w, h, depth, 0.03), color, { p: [x, y, s * zHalf], out: 0.007 })); v.body.add(part(rbox(w * 0.78, h * 0.18, depth + 0.004, 0.01), GLH, { p: [x - w * 0.06, y + h * 0.26, s * (zHalf + 0.004)], out: 0 })); }
}
function addDoors(v, xs, y, w, h, zHalf, color) {
  for (const x of xs) for (const s of [1, -1]) {
    v.body.add(part(rbox(w, h, 0.02, 0.02), 0x1F2A4A, { p: [x, y, s * (zHalf + 0.002)], out: 0.006 }));
    const a = part(rbox(w / 2 - 0.004, h, 0.024, 0.02), color, { p: [x - w / 4, y, s * (zHalf + 0.014)], out: 0.007 }), b = part(rbox(w / 2 - 0.004, h, 0.024, 0.02), color, { p: [x + w / 4, y, s * (zHalf + 0.014)], out: 0.007 });
    a.add(part(rbox(w * 0.3, h * 0.46, 0.012, 0.01), GL, { p: [0, h * 0.14, 0.008 * s], out: 0 })); b.add(part(rbox(w * 0.3, h * 0.46, 0.012, 0.01), GL, { p: [0, h * 0.14, 0.008 * s], out: 0 }));
    v.body.add(a, b); v.doors.push({ a, b, ax: a.position.x, bx: b.position.x, w });
  }
}
function addLights(v, x, y, z, r = 0.05) {
  for (const s of [1, -1]) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), basic(0xFFF4B0)); m.position.set(x, y, s * z); const o = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color: COL.out, side: THREE.BackSide })); o.scale.setScalar(1.22); m.add(o); v.body.add(m); v.lights.push(m); }
}
function addTail(v, x, y, z, r = 0.035) { for (const s of [1, -1]) v.body.add(part(G.sph(r), 0xFF4D4D, { p: [x, y, s * z], s: [0.6, 1, 1], out: 0 })); }
function addPanto(v, x, y, hgt = 0.34, wide = 0.5) {
  const g = grp(v.body, x, y, 0); v.panto = g;
  g.add(part(rbox(0.5, 0.045, 0.34, 0.015), DARK, { p: [0, 0.02, 0], out: 0.008 }));
  for (const s of [1, -1]) { g.add(part(G.cap(0.018, hgt * 1.16), DARK, { p: [0.09 * 0 + 0.0, hgt * 0.5, s * 0.1], r: [0, 0, 0.0], out: 0.008 })); }
  const arm1 = part(G.cap(0.016, hgt * 1.18), DARK, { p: [0.12, hgt * 0.5 + 0.03, 0], r: [0, 0, 0.62], out: 0.008 }); g.add(arm1);
  const arm2 = part(G.cap(0.016, hgt * 1.18), DARK, { p: [-0.12, hgt * 0.5 + 0.03, 0], r: [0, 0, -0.62], out: 0.008 }); g.add(arm2);
  g.add(part(G.box(0.04, 0.025, wide, 0.01), STEEL, { p: [0, hgt + 0.04, 0], out: 0.008 }));
  for (const s of [1, -1]) g.add(part(G.cap(0.014, 0.09), DARK, { p: [0.1 * 0, hgt * 0.6, s * 0.08], out: 0 })); 
}
function noseGlass(v, xFront, y, h, w) { v.body.add(part(rbox(0.04, h, w, 0.04), GL, { p: [xFront - 0.01, y, 0], out: 0.007 })); v.body.add(part(rbox(0.02, h * 0.2, w * 0.7, 0.01), GLH, { p: [xFront + 0.012, y + h * 0.28, 0], out: 0 })); }

/* the five vehicles -------------------------------------------------------- */
function blank(name) { const root = new THREE.Group(), body = grp(root); return { name, root, body, wheels: [], doors: [], lights: [], lines: [], panto: null, track: 'rail' }; }

function buildRE() { // regional express, double-decker, red and white, with pantograph
  const v = blank('RE regional express'); v.L = 4.5; v.W = 0.92; const L = v.L, W = v.W, y0 = 0.2;
  v.body.add(part(rbox(L, 0.14, W * 0.8, 0.04), DARK, { p: [0, y0 + 0.04, 0] }));
  v.body.add(part(rbox(L, 0.62, W, 0.14), RED, { p: [0, y0 + 0.4, 0] }));
  v.body.add(part(rbox(L - 0.02, 0.6, W * 0.98, 0.16), WHITE, { p: [0, y0 + 1.0, 0] }));
  v.body.add(part(rbox(L - 0.02, 0.05, W * 1.01, 0.02), RED2, { p: [0, y0 + 0.7, 0], out: 0.008 }));
  v.body.add(part(rbox(L * 0.92, 0.06, W * 0.7, 0.03), STEEL, { p: [0, y0 + 1.33, 0] }));
  addWindows(v, [-1.7, -1.2, -0.7, -0.2, 0.3, 0.8, 1.3, 1.75], y0 + 1.02, 0.34, 0.26, W / 2 + 0.002);
  addWindows(v, [-1.5, -0.95, -0.45, 0.05, 0.55, 1.05], y0 + 0.44, 0.3, 0.2, W / 2 + 0.002);
  addDoors(v, [-1.95, 1.62], y0 + 0.32, 0.34, 0.5, W / 2 + 0.0, WHITE);
  noseGlass(v, L / 2, y0 + 0.98, 0.32, W * 0.7); addLights(v, L / 2 - 0.01, y0 + 0.36, 0.3); addTail(v, -L / 2, y0 + 0.36, 0.3);
  v.body.add(part(rbox(0.04, 0.2, 0.5, 0.02), 0x1F2A4A, { p: [L / 2 + 0.005, y0 + 0.62, 0], out: 0.006 }));
  addPanto(v, -1.2, y0 + 1.36, 0.4, 0.55);
  for (const x of [-1.5, -1.12, 1.12, 1.5]) addWheel(v, x, W * 0.3, 0.17); for (const x of [-1.5, -1.12, 1.12, 1.5]) addWheel(v, x, -W * 0.3, 0.17);
  v.icon = 'M3 11V6.5a1.5 1.5 0 0 1 1.5-1.5h15A1.5 1.5 0 0 1 21 6.5V11M3 11h18v6.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V11ZM3 11H21M6 8h3M11 8h3M16 8h3M6 14h3M11 14h3M16 14h3M7 21h.01M17 21h.01';
  return v;
}
function buildBus() { // yellow rounded bus with a blank front display
  const v = blank('Bus'); v.L = 2.7; v.W = 0.92; v.track = 'road'; const L = v.L, W = v.W, y0 = 0.14;
  v.body.add(part(rbox(L, 0.92, W, 0.24), YEL, { p: [0, y0 + 0.52, 0] }));
  v.body.add(part(rbox(L + 0.01, 0.1, W + 0.01, 0.04), YEL2, { p: [0, y0 + 0.14, 0], out: 0.008 }));
  v.body.add(part(rbox(L * 0.9, 0.05, W * 0.8, 0.02), 0xFFFFFF, { p: [0, y0 + 1.0, 0] }));
  addWindows(v, [-0.9, -0.42, 0.06, 0.54], y0 + 0.66, 0.4, 0.3, W / 2 + 0.002);
  addDoors(v, [0.98], y0 + 0.4, 0.34, 0.6, W / 2, YEL);
  noseGlass(v, L / 2, y0 + 0.6, 0.4, W * 0.82);
  v.body.add(part(rbox(0.03, 0.12, W * 0.6, 0.03), 0x151B33, { p: [L / 2 + 0.006, y0 + 0.9, 0], out: 0.006 })); // blank display
  addLights(v, L / 2 - 0.01, y0 + 0.2, 0.3, 0.055); addTail(v, -L / 2, y0 + 0.24, 0.32);
  for (const x of [-0.85, 0.86]) for (const s of [1, -1]) addWheel(v, x, s * W * 0.5, 0.2, 0.12);
  v.icon = 'M4 5h16a1.5 1.5 0 0 1 1.5 1.5V17a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1V6.5A1.5 1.5 0 0 1 4 5ZM2.5 12h19M7 5v7M12 5v7M17 5v7M6 21h.01M18 21h.01';
  return v;
}
function buildS() { // S-Bahn, red and cream
  const v = blank('S-Bahn'); v.L = 4.6; v.W = 0.9; const L = v.L, W = v.W, y0 = 0.2;
  v.body.add(part(rbox(L, 0.1, W * 0.8, 0.03), DARK, { p: [0, y0 + 0.02, 0] }));
  v.body.add(part(rbox(L, 0.46, W, 0.2), RED, { p: [0, y0 + 0.3, 0] }));
  v.body.add(part(rbox(L - 0.01, 0.5, W * 0.99, 0.22), CREAM, { p: [0, y0 + 0.7, 0] }));
  v.body.add(part(rbox(L * 0.94, 0.05, W * 0.7, 0.025), STEEL, { p: [0, y0 + 0.97, 0] }));
  for (const x of [-1.4, 0, 1.4]) v.body.add(part(rbox(0.5, 0.08, 0.4, 0.03), STEEL, { p: [x, y0 + 1.02, 0] }));
  addWindows(v, [-1.7, -1.05, -0.4, 0.25, 0.9, 1.55], y0 + 0.72, 0.4, 0.28, W / 2 + 0.002);
  addDoors(v, [-1.38, -0.05, 1.28], y0 + 0.4, 0.4, 0.6, W / 2, CREAM);
  noseGlass(v, L / 2, y0 + 0.7, 0.3, W * 0.74); addLights(v, L / 2 - 0.01, y0 + 0.28, 0.3); addTail(v, -L / 2, y0 + 0.28, 0.3);
  for (const x of [-1.5, -1.15, 1.15, 1.5]) for (const s of [1, -1]) addWheel(v, x, s * W * 0.3, 0.17);
  v.icon = 'M2 15V8.5C2 7 3 6 4.5 6H17c2.5 0 5 3 5 6v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1ZM2 12h20M7 6v6M12 6v6M17.5 6.5 19 12M6 19.5h.01M17 19.5h.01';
  return v;
}
function buildU() { // U-Bahn in a tunnel, compact and yellow
  const v = blank('U-Bahn'); v.L = 3.4; v.W = 0.84; v.tunnel = true; const L = v.L, W = v.W, y0 = 0.16;
  v.body.add(part(rbox(L, 0.1, W * 0.8, 0.03), DARK, { p: [0, y0 + 0.02, 0] }));
  v.body.add(part(rbox(L, 0.84, W, 0.3), YEL, { p: [0, y0 + 0.5, 0] }));
  v.body.add(part(rbox(L + 0.005, 0.07, W + 0.005, 0.03), YEL2, { p: [0, y0 + 0.2, 0], out: 0.008 }));
  v.body.add(part(rbox(L * 0.9, 0.05, W * 0.7, 0.02), STEEL, { p: [0, y0 + 0.95, 0] }));
  addWindows(v, [-1.1, -0.55, 0, 0.55, 1.05], y0 + 0.68, 0.42, 0.3, W / 2 + 0.002);
  addDoors(v, [-0.82, 0.82], y0 + 0.4, 0.36, 0.55, W / 2, YEL);
  noseGlass(v, L / 2, y0 + 0.66, 0.34, W * 0.76); addLights(v, L / 2 - 0.01, y0 + 0.24, 0.27); addTail(v, -L / 2, y0 + 0.24, 0.28);
  for (const x of [-1.05, -0.7, 0.7, 1.05]) for (const s of [1, -1]) addWheel(v, x, s * W * 0.3, 0.14);
  v.icon = 'M3.5 19.5v-6a8.5 8.5 0 0 1 17 0v6M7 17.5V12a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v5.5ZM7 14.5h10M9.5 20.5h.01M14.5 20.5h.01M12 4.5v2';
  return v;
}
function buildTram() { // low-floor tram, red and white, rails and pantograph
  const v = blank('Tram'); v.L = 4.8; v.W = 0.78; v.track = 'street'; const L = v.L, W = v.W, y0 = 0.14;
  v.body.add(part(rbox(L, 0.08, W * 0.8, 0.03), DARK, { p: [0, y0 + 0.02, 0] }));
  v.body.add(part(rbox(L, 0.3, W, 0.14), RED, { p: [0, y0 + 0.22, 0] }));
  v.body.add(part(rbox(L - 0.01, 0.58, W * 0.99, 0.26), WHITE, { p: [0, y0 + 0.62, 0] }));
  v.body.add(part(rbox(L - 0.02, 0.07, W * 1.005, 0.03), RED2, { p: [0, y0 + 0.44, 0], out: 0.007 }));
  v.body.add(part(rbox(L * 0.9, 0.05, W * 0.7, 0.02), STEEL, { p: [0, y0 + 0.93, 0] }));
  v.body.add(part(rbox(0.5, 0.1, 0.4, 0.04), STEEL, { p: [1.3, y0 + 0.98, 0] }));
  addWindows(v, [-1.85, -1.3, -0.75, -0.2, 0.9, 1.5], y0 + 0.68, 0.46, 0.34, W / 2 + 0.002);
  addDoors(v, [-1.1, 0.35], y0 + 0.4, 0.4, 0.66, W / 2, WHITE);
  noseGlass(v, L / 2, y0 + 0.66, 0.4, W * 0.82); addLights(v, L / 2 - 0.01, y0 + 0.2, 0.26); addTail(v, -L / 2, y0 + 0.22, 0.26);
  addPanto(v, -0.2, y0 + 0.96, 0.4, 0.5);
  for (const x of [-1.55, -1.25, 1.25, 1.55]) for (const s of [1, -1]) addWheel(v, x, s * W * 0.36, 0.12);
  v.icon = 'M5 8h14a1.5 1.5 0 0 1 1.5 1.5V17a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V9.5A1.5 1.5 0 0 1 5 8ZM3.5 13h17M8 8v5M12 8v5M16 8v5M9 8l3-4 3 4M4 21h16M7.5 18.5v2M16.5 18.5v2';
  return v;
}

const BUILD = { re: buildRE, bus: buildBus, S: buildS, U: buildU, tram: buildTram };
export const buildVehicle = (kind) => {
  const v = (BUILD[kind] || BUILD.S)(); const holder = new THREE.Group(); v.root.rotation.y = Math.PI / 2; holder.add(v.root);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, v.L * 1.2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.13, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.004; holder.add(sh);
  let t = 0;
  return { root: holder, update(dt, st) { t += dt; const spin = (st && st.speed != null ? st.speed : 6) * 0.5; v.wheels.forEach((w) => { w.g.rotation.z -= dt * spin / w.r; }); v.body.position.y = Math.sin(t * 17) * 0.006; v.body.rotation.z = Math.sin(t * 5.3) * 0.012; if (v.panto) v.panto.rotation.z = Math.sin(t * 9) * 0.012; v.lights.forEach((l) => l.material.color.setHex(0xFFF4B0)); } };
};
