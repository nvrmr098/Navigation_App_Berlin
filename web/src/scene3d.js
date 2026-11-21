/* 3D navigation view: identical generic buildings, S-Bahn elevated, U-Bahn underground, follow camera. */
import * as THREE from 'three';
import { R, clamp, pointAt } from './net.js';

const HS = 0.34, HU = -0.2;
const h3 = (prod) => (prod === 'S' ? HS : HU);
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

function makeTrain(prod) {
  const g = new THREE.Group(), n = prod === 'S' ? 3 : 2, len = prod === 'S' ? 0.2 : 0.17;
  for (let i = 0; i < n; i++) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.095), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    body.position.x = -i * (len + 0.015); body.userData.body = 1; g.add(body);
    const win = new THREE.Mesh(new THREE.BoxGeometry(len * 0.8, 0.032, 0.1), new THREE.MeshLambertMaterial({ color: 0x1f2a36 }));
    win.position.set(-i * (len + 0.015), 0.025, 0); g.add(win);
  }
  return g;
}

export class Scene3D {
  constructor(canvas) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(50, 1, 0.05, 80);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8d887c, 2.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(3, 6, 2); this.scene.add(sun);
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.camPos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.curLeg = -1;
  }
  resize(W, H, dpr) { this.r.setPixelRatio(dpr); this.r.setSize(W, H, false); this.cam.aspect = W / H; this.cam.updateProjectionMatrix(); }
  clear() {
    const kill = (g) => {
      while (g.children.length) {
        const c = g.children.pop(); if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose && c.material.dispose();
        if (c.children && c.children.length) kill(c);
      }
    };
    kill(this.group);
  }
  dispose() { this.clear(); this.r.dispose(); }

  build(overlay, dark) {
    const T = this, route = overlay.route, path = overlay.path, pts = path.pts;
    this.clear();
    const sky = dark ? 0x141416 : 0xdfe9f2;
    T.scene.background = new THREE.Color(sky); T.scene.fog = new THREE.Fog(sky, 5, 15);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    pts.forEach((p) => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.y); z1 = Math.max(z1, p.y); });
    const pad = 4, bx0 = x0 - pad, bx1 = x1 + pad, bz0 = z0 - pad, bz1 = z1 + pad, gw = bx1 - bx0, gd = bz1 - bz0;
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), new THREE.MeshLambertMaterial({ color: dark ? 0x2a2a28 : 0xe8e4da, transparent: true, opacity: 0.62, depthWrite: false }));
    gm.rotation.x = -Math.PI / 2; gm.position.set((bx0 + bx1) / 2, 0, (bz0 + bz1) / 2); gm.renderOrder = 2; T.group.add(gm);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), new THREE.MeshLambertMaterial({ color: dark ? 0x0d0d0e : 0xb9b4a8 }));
    under.rotation.x = -Math.PI / 2; under.position.set((bx0 + bx1) / 2, -0.45, (bz0 + bz1) / 2); T.group.add(under);

    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) segs.push({ a: pts[i], b: pts[i + 1], leg: pts[i + 1].leg });
    const dseg = (px, pz) => {
      let m = 1e9;
      for (let i = 0; i < segs.length; i++) {
        const a = segs[i].a, b = segs[i].b, dx = b.x - a.x, dz = b.y - a.y, L = dx * dx + dz * dz || 1;
        const t = clamp(((px - a.x) * dx + (pz - a.y) * dz) / L, 0, 1), d = Math.hypot(px - (a.x + dx * t), pz - (a.y + dz * t));
        if (d < m) m = d;
      }
      return m;
    };
    const cell = 0.4; let list = [];
    for (let gx = bx0; gx < bx1; gx += cell) for (let gz = bz0; gz < bz1; gz += cell) {
      const px = gx + cell / 2, pz = gz + cell / 2; if (dseg(px, pz) < 0.3) continue;
      if (hash(gx, gz) < 0.18) continue; list.push([px, pz]);
    }
    if (list.length > 2600) { const st = Math.ceil(list.length / 2600); list = list.filter((_, i) => i % st === 0); }
    const base = dark ? 0x58564f : 0xd7d1c4;
    const bm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), list.length);
    const M = new THREE.Matrix4(), c = new THREE.Color();
    list.forEach((b, i) => {
      const hh = 0.1 + hash(b[0], b[1]) * 0.2, w = cell * 0.55;
      M.makeScale(w, hh, w); M.setPosition(b[0], hh / 2, b[1]); bm.setMatrixAt(i, M);
      c.set(base); c.offsetHSL(0, 0, (hash(b[1], b[0]) - 0.5) * 0.05); bm.setColorAt(i, c);
    });
    bm.instanceMatrix.needsUpdate = true; if (bm.instanceColor) bm.instanceColor.needsUpdate = true; T.group.add(bm);

    segs.forEach((s) => {
      const lg = route.legs[s.leg], prod = lg.p, hgt = h3(prod), dx = s.b.x - s.a.x, dz = s.b.y - s.a.y, L = Math.hypot(dx, dz);
      const m = new THREE.Mesh(new THREE.BoxGeometry(L + 0.04, 0.035, prod === 'S' ? 0.075 : 0.07), new THREE.MeshLambertMaterial({ color: new THREE.Color(lg.c) }));
      m.position.set((s.a.x + s.b.x) / 2, hgt, (s.a.y + s.b.y) / 2); m.rotation.y = -Math.atan2(dz, dx); T.group.add(m);
      if (prod === 'S') {
        const pil = new THREE.Mesh(new THREE.BoxGeometry(0.035, hgt, 0.035), new THREE.MeshLambertMaterial({ color: dark ? 0x77746c : 0x9a968c }));
        pil.position.set(s.a.x, hgt / 2, s.a.y); T.group.add(pil);
      }
    });
    pts.forEach((p, i) => {
      const prod = route.legs[p.leg].p, end = path.legs.some((L) => L.a === i || L.b === i), hgt = h3(prod);
      const st = new THREE.Mesh(new THREE.BoxGeometry(end ? 0.2 : 0.11, 0.05, end ? 0.2 : 0.11), new THREE.MeshLambertMaterial({ color: end ? 0xffffff : 0xf3f1ea }));
      st.position.set(p.x, hgt + 0.035, p.y); T.group.add(st);
      if (end) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 8), new THREE.MeshLambertMaterial({ color: i === 0 ? 0x0a6cff : (i === pts.length - 1 ? 0xe5231b : 0x444444) }));
        post.position.set(p.x, hgt + 0.2, p.y); T.group.add(post);
      }
    });
    path.legs.forEach((L, li) => {
      if (li === 0) return; const p = pts[L.a];
      if (route.legs[li - 1].p !== route.legs[li].p) {
        const cn = new THREE.Mesh(new THREE.BoxGeometry(0.03, HS - HU, 0.03), new THREE.MeshLambertMaterial({ color: 0xffffff }));
        cn.position.set(p.x, (HS + HU) / 2, p.y); T.group.add(cn);
      }
    });
    T.veh = { S: makeTrain('S'), U: makeTrain('U') }; T.veh.S.visible = false; T.veh.U.visible = false; T.group.add(T.veh.S); T.group.add(T.veh.U);
    T.curLeg = -1;
  }
  place(overlay, p) {
    const m = pointAt(overlay, p);
    this.camPos.set(m.x - Math.cos(m.ang) * 2.5, 1.7, m.y - Math.sin(m.ang) * 2.5); this.look.set(m.x, 0.1, m.y);
  }
  render(overlay, p) {
    const T = this, m = pointAt(overlay, p);
    const li = clamp(R.legAt(overlay.path, Math.min(p, overlay.path.pts.length - 1.001)), 0, overlay.route.legs.length - 1);
    const lg = overlay.route.legs[li], hgt = h3(lg.p);
    if (T.curLeg !== li) {
      T.curLeg = li; T.veh.S.visible = lg.p === 'S'; T.veh.U.visible = lg.p === 'U';
      T.veh[lg.p].children.forEach((c) => { if (c.userData.body) c.material.color.set(lg.c); });
    }
    const v = T.veh[lg.p]; v.position.set(m.x, hgt + 0.08, m.y); v.rotation.y = -m.ang;
    const back = 2.5, h = lg.p === 'U' ? 1.5 : 1.7, tx = m.x - Math.cos(m.ang) * back, tz = m.y - Math.sin(m.ang) * back;
    T.camPos.x += (tx - T.camPos.x) * 0.06; T.camPos.y += (h - T.camPos.y) * 0.06; T.camPos.z += (tz - T.camPos.z) * 0.06;
    const lx = m.x + Math.cos(m.ang) * 0.7, lz = m.y + Math.sin(m.ang) * 0.7;
    T.look.x += (lx - T.look.x) * 0.12; T.look.y += (hgt - T.look.y) * 0.12; T.look.z += (lz - T.look.z) * 0.12;
    T.cam.position.copy(T.camPos); T.cam.lookAt(T.look); T.r.render(T.scene, T.cam);
  }
}
