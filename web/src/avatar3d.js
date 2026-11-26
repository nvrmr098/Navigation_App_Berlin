/* Small 3D actors drawn on a transparent canvas that sits on top of the map:
 *   - a man (stands, walks, runs, turns to the direction your phone faces) for walking mode
 *   - trains, trams, buses and regional trains riding along the route on the 2D map
 * Plain three.js primitives, no model files. Camera looks down at a fixed angle, the actor is rotated to the heading on screen. */
import * as THREE from 'three';

const M = (c, o) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.06, ...(o || {}) });
const rad = Math.PI / 180;
const angDiff = (a, b) => ((b - a + 540) % 360) - 180;

export class Stage3D {
  constructor(canvas, o) {
    const opt = { size: 120, pitch: 56, fov: 28, ...(o || {}) };
    this.size = opt.size; this.fov = opt.fov;
    this.r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); this.r.setSize(opt.size, opt.size, false);
    this.r.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(opt.fov, 1, 0.1, 80);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x7f8db3, 1.05));
    const sun = new THREE.DirectionalLight(0xffffff, 1.25); sun.position.set(2.5, 5, 3); this.scene.add(sun);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.pitch = opt.pitch; this.center = new THREE.Vector3(0, 0.9, 0); this.radius = 1.5; this.heading = 0; this.cur = 0; this.actor = null; this.ground = null;
    this.layout();
  }
  layout() {
    const d = this.radius / Math.sin(this.fov * rad / 2) * 1.04, p = this.pitch * rad;
    this.cam.position.set(this.center.x, this.center.y + d * Math.sin(p), this.center.z + d * Math.cos(p));
    this.cam.lookAt(this.center);
  }
  setPitch(deg) { this.pitch = Math.max(35, Math.min(80, deg)); this.layout(); }
  set(actor, groundObj) {
    if (this.actor) this.root.remove(this.actor.root);
    if (this.ground) this.root.remove(this.ground);
    this.actor = actor; this.root.add(actor.root); this.ground = groundObj || null; if (groundObj) this.root.add(groundObj);
    const box = new THREE.Box3().setFromObject(actor.root), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    this.center.copy(c); this.radius = Math.max(0.9, Math.hypot(s.x, s.z) / 2 + 0.05, s.y / 2 + 0.2); this.layout();
  }
  /* degrees on screen, 0 = up. snap = no smoothing */
  setHeading(deg, snap) { this.heading = deg; if (snap) this.cur = deg; }
  frame(dt, state) {
    this.cur += angDiff(this.cur, this.heading) * Math.min(1, dt * 7);
    this.root.rotation.y = -this.cur * rad;
    if (this.actor) this.actor.update(dt, state || {});
    this.r.render(this.scene, this.cam);
  }
  destroy() { try { this.r.dispose(); this.r.forceContextLoss(); } catch (e) { /* ignore */ } }
}

/* ---------------------------------------------------------------- man */
function limb(len, r, mat) { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 4, 10), mat); m.position.y = -len / 2; return m; }

export function buildMan(accent) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const skin = M('#f0c7a3'), jacket = M(accent || '#4f6bff'), pants = M('#2a3050'), shoe = M('#f6f7fb', { roughness: 0.4 }), hair = M('#2a2119'), pack = M('#ffb020'), cap = M('#1f2540');
  const legs = [], arms = [];
  [-1, 1].forEach((sd) => {
    const hip = new THREE.Group(); hip.position.set(sd * 0.1, 0.94, 0); body.add(hip);
    hip.add(limb(0.47, 0.078, pants));
    const knee = new THREE.Group(); knee.position.y = -0.47; hip.add(knee);
    knee.add(limb(0.46, 0.066, pants));
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.075, 0.27), shoe); foot.position.set(0, -0.485, -0.045); knee.add(foot);
    legs.push({ hip, knee, sd });
    const sh = new THREE.Group(); sh.position.set(sd * 0.225, 1.45, 0); body.add(sh);
    sh.add(limb(0.32, 0.052, jacket));
    const el = new THREE.Group(); el.position.y = -0.32; sh.add(el);
    el.add(limb(0.3, 0.046, jacket));
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skin); hand.position.y = -0.33; el.add(hand);
    arms.push({ sh, el, sd });
  });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 6, 14), jacket); torso.position.y = 1.2; torso.scale.set(1.05, 1, 0.72); body.add(torso);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.168, 0.05, 16), pants); belt.position.y = 0.99; belt.scale.set(1.05, 1, 0.72); body.add(belt);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 10), skin); neck.position.y = 1.6; body.add(neck);
  const head = new THREE.Group(); head.position.y = 1.72; body.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 14), skin));
  const domeG = new THREE.SphereGeometry(0.128, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55); const dome = new THREE.Mesh(domeG, cap); dome.position.y = 0.012; head.add(dome);
  const bill = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.018, 0.1), cap); bill.position.set(0, 0.035, -0.135); head.add(bill);
  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.35), hair); hairBack.position.set(0, -0.01, 0.025); head.add(hairBack);
  [-1, 1].forEach((sd) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), M('#111')); e.position.set(sd * 0.045, 0.0, -0.112); head.add(e); });
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.34, 0.13), pack); bag.position.set(0, 1.27, 0.2); body.add(bag);
  const t = { ph: 0, wk: 0, rn: 0, id: 1, time: 0 };
  return {
    root,
    update(dt, st) {
      const mode = st.mode || 'idle', sp = st.speed || 0; t.time += dt;
      const kw = Math.min(1, dt * 5);
      t.wk += ((mode === 'walk' ? 1 : 0) - t.wk) * kw; t.rn += ((mode === 'run' ? 1 : 0) - t.rn) * kw; t.id += ((mode === 'idle' ? 1 : 0) - t.id) * kw;
      const cad = mode === 'run' ? 1.45 + Math.min(0.5, (sp - 2.4) * 0.12) : 0.85 + Math.min(0.5, sp * 0.18);
      t.ph += dt * cad * Math.PI * 2 * (t.wk + t.rn > 0.05 ? 1 : 0);
      const swing = 0.52 * t.wk + 0.98 * t.rn, armSw = 0.5 * t.wk + 1.0 * t.rn;
      legs.forEach((l) => {
        const p = t.ph + (l.sd > 0 ? 0 : Math.PI);
        l.hip.rotation.x = Math.sin(p) * swing;
        l.knee.rotation.x = -Math.max(0, Math.sin(p + 1.25)) * (0.42 * t.wk + 1.0 * t.rn) - 0.02;
      });
      arms.forEach((a) => {
        const p = t.ph + (a.sd > 0 ? Math.PI : 0), idle = Math.sin(t.time * 1.3 + a.sd) * 0.04 * t.id;
        a.sh.rotation.x = Math.sin(p) * armSw + idle; a.sh.rotation.z = a.sd * (0.07 + 0.03 * t.id);
        a.el.rotation.x = 0.25 * t.wk + (0.95 + 0.2 * Math.max(0, Math.sin(p))) * t.rn + 0.08 * t.id;
      });
      body.position.y = Math.abs(Math.sin(t.ph)) * (0.026 * t.wk + 0.07 * t.rn);
      body.rotation.x = -(0.035 * t.wk + 0.2 * t.rn);
      body.rotation.z = Math.sin(t.ph) * (0.02 * t.wk + 0.03 * t.rn);
      torso.scale.y = 1 + 0.014 * Math.sin(t.time * 2.1) * t.id;
      head.rotation.y = Math.sin(t.time * 0.55) * 0.35 * t.id + Math.sin(t.ph) * 0.05 * (t.wk + t.rn);
      head.rotation.x = Math.sin(t.time * 0.8) * 0.04 * t.id;
    },
  };
}

/* flat view cone on the ground in front of the man: shows which way the phone faces */
export function buildCone(color) {
  const g = new THREE.Group();
  const sec = new THREE.CircleGeometry(1.5, 28, Math.PI / 2 - 0.62, 1.24); sec.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(sec, new THREE.MeshBasicMaterial({ color: color || '#4f6bff', transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })); m.position.y = 0.012; g.add(m);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.44, 28), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.014; g.add(ring);
  const sh = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.008; g.add(sh);
  return g;
}

/* ---------------------------------------------------------------- vehicles: the toon models live in vehicles-toon.js */
export { buildVehicle } from './vehicles-toon.js';
/* what kind of vehicle rides a line: S and U trains, M/number trams, bus lines, RE/RB regional trains */
export const vehicleKind = (line, prod) => (prod === 'U' || /^U\d/.test(line) ? 'U' : prod === 'S' || /^S\d/.test(line) ? 'S' : /^(RE|RB|FEX)/.test(line) ? 're' : /^(M?\d{1,2}|M\d)$/.test(line) && !/^\d{3}$/.test(line) ? 'tram' : 'bus');
