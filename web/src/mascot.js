/* The kid and the dog as the walking-mode avatar: speed decides idle, walk, jog or run (with hysteresis), hidden above 7 m/s (you are in a vehicle). */
import * as THREE from 'three';
import { COL, buildKid, poseKid, buildDog, poseDog, buildBike, poseBike, solve2, BIKE } from './toon.js';
const S = Math.sin, K = Math.cos, MX = Math.max, TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t, sm = (t) => t * t * (3 - 2 * t);
const blink = (t) => { const b = (t % 3.7) - 3.5; return b > 0 && b < 0.14 ? 0.1 : 1; };
const legTrot = (q, amp = 0.55) => { const a = (x) => amp * S(x), f = (x) => 0.12 + 0.75 * MX(0, K(x)); return [[a(q), f(q)], [a(q + Math.PI), f(q + Math.PI)], [a(q + Math.PI), f(q + Math.PI)], [a(q), f(q)]]; };

/* ---------------- speed to state, with hysteresis (speed = 3 to 5 s average, m/s) ---------------- */
export function nextState(cur, v) {
  const up = { idle: 0.5, walk: 2, jog: 3.5 }, down = { walk: 0.3, jog: 1.7, run: 3.0 };
  if (v > 7) return 'hidden';
  let s = cur === 'hidden' ? 'run' : cur; const order = ['idle', 'walk', 'jog', 'run'];
  for (let g = 0; g < 4; g++) { const k = order.indexOf(s); if (k < 3 && v >= up[s]) { s = order[k + 1]; continue; } if (k > 0 && v < down[s]) { s = order[k - 1]; continue; } break; }
  return s;
}
export const rateFor = (state, v) => state === 'walk' ? clamp(v / 1.3, 0.6, 1.5) : state === 'jog' ? clamp(v / 2.7, 0.7, 1.4) * 0.8 : state === 'run' ? clamp(v / 4.2, 0.8, 1.6) : 1;

/* ---------------- what every state looks like at time t ---------------- */
export function scene(state, t, rate = 1) {
  const o = { kid: { p: [0, 0, 0], ry: 0, pose: {} }, dog: { p: [0, 0, 0], ry: 0, pose: {} }, scroll: 0, leash: false, dust: 0, lines: 0, zs: 0 };
  if (state === 'idle') {
    const a = t * 0.8, dx = 0.66 * S(a), dz = 0.66 * K(a), q = t * 9, hop = 0.12 * Math.abs(S(t * 4.6)), air = hop > 0.05;
    o.dog.p = [dx, 0, dz]; o.dog.ry = Math.atan2(K(a), -S(a));
    o.dog.pose = { y: hop, pitch: -0.1 * S(t * 4.6), legs: air ? [[0.8, 0.9], [0.7, 0.9], [-0.7, 1.0], [-0.6, 1.0]] : legTrot(q, 0.45), ear: 0.35 + 0.55 * Math.abs(S(t * 9)), earSwing: 0.3 * S(t * 9), tail: 0.7 * S(t * 13), tongue: 0.6, headX: -0.1 };
    o.kid.pose = { breath: S(t * 1.9), spine: 0.02 * S(t * 1.9), headY: 0.7 * clamp(dx / 0.66, -1, 1), headX: 0.04 * S(t * 1.3), shL: 0.06 + 0.05 * S(t * 1.9 + 1), shR: 0.06 - 0.05 * S(t * 1.9 + 1), eye: blink(t), pack: 0.003 * S(t * 1.9), sway: 0.01 * S(t * 0.95) };
  } else if (state === 'petting') {
    const pat = S(t * 5);
    o.kid.p = [-0.04, 0, -0.1]; o.dog.p = [0, 0, 0.6]; o.dog.ry = Math.PI;
    o.kid.pose = { y: -0.21, hipL: 1.3, hipR: 1.2, kneeL: 2.2, kneeR: 2.1, spine: 0.42, headX: 0.3, shR: 1.25 + 0.14 * pat, elR: 0.3, shL: 0.75, elL: 0.75, abd: 0.15, eye: 0.4, open: 0.4, breath: S(t * 2), pack: 0.004 * S(t * 2) };
    o.dog.pose = { y: -0.085, pitch: -0.78, legs: [[-0.78, 0.1], [-0.78, 0.1], [0.95, 2.2], [0.95, 2.2]], headX: 0.55 + 0.05 * pat, ear: 0.25 + 0.2 * S(t * 7), earSwing: 0.15 * S(t * 7), tail: 0.9 * S(t * 12), tailUp: 0.2, tongue: 0.8 };
  } else if (state === 'looking') {
    const l = S(t * 0.9), w = sm(clamp((l - 0.1) * 3, 0, 1)), sn = S(t * 1.1);
    o.kid.p = [-0.32, 0, 0];
    o.kid.pose = { headY: 0.9 * l, headX: -0.1, shR: lerp(0.06, 2.4, w), elR: lerp(0.12, 1.85, w), abd: 0.12 + 0.2 * w, eye: blink(t), breath: S(t * 1.8), twist: 0.15 * l, pack: 0.003 * S(t * 1.8) };
    o.dog.p = [0.42 + 0.1 * sn, 0, 0.3]; o.dog.ry = 0.6 + 0.25 * sn;
    o.dog.pose = { pitch: 0.16, headX: 0.85 + 0.05 * S(t * 7), legs: legTrot(t * 4, 0.18).map((l2) => [l2[0], l2[1] * 0.4]), tail: 0.6 * S(t * 9), ear: 0.6, tongue: 0, breath: S(t * 3) };
  } else if (state === 'sleepy') {
    const y = sm((1 - K(t * 0.8)) / 2);
    o.kid.p = [-0.3, 0, 0];
    o.kid.pose = { open: 0.15 + 0.9 * y, eye: 0.08, headX: -0.28 * y, shR: lerp(0.06, 1.95, y), elR: lerp(0.12, 2.15, y), shL: lerp(0.06, 2.9, y * 0.8), abd: 0.12 + 0.35 * y, breath: S(t * 1.6), spine: -0.05 * y, pack: 0.003 * S(t * 1.6) };
    o.dog.p = [0.42, 0, 0.3]; o.dog.ry = -0.6; o.zs = t;
    o.dog.pose = { y: -0.115, legs: [[1.45, 2.8], [1.45, 2.8], [1.35, 2.8], [1.35, 2.8]], headX: 0.75, headY: 1.35, eye: 0.1, ear: 0.7, tail: 0.9, tailUp: 0.15, breath: S(t * 1.6) };
  } else if (state === 'walk') {
    const f = t * TAU * 0.95 * rate, hipA = 0.5, kf = (x) => 0.12 + 0.75 * MX(0, K(x));
    o.kid.p = [-0.1, 0, -0.3]; o.dog.p = [0.32, 0, 0.62]; o.scroll = 1.25 * rate;
    o.kid.pose = { hipL: hipA * S(f), kneeL: kf(f), hipR: -hipA * S(f), kneeR: kf(f + Math.PI), shR: 0.5 * S(f), elR: 0.22 + 0.2 * MX(0, S(f)), shL: 0.62, elL: 0.7, abd: 0.14, y: -0.04 * Math.abs(S(f)) + 0.008, twist: 0.12 * S(f), spine: 0.04, headY: -0.1, pack: 0.012 * S(2 * f + 0.8), eye: blink(t), sway: 0.02 * S(f) };
    o.dog.pose = { y: 0.012 * Math.abs(S(f * 2)), pitch: 0.03 * S(f * 2), legs: legTrot(f * 1.0, 0.55), ear: 0.25 + 0.2 * S(f * 2 + 1), earSwing: 0.1 * S(f * 2), tail: 0.5 * S(f * 2), tailUp: 0.95, tongue: 0.35, headY: -0.15 };
    o.leash = true;
  } else if (state === 'run') {
    const f = t * TAU * 1.5 * rate, e = 0.5 + 0.5 * K(f * 0.95);
    o.kid.p = [-0.1, 0, -0.4]; o.dog.p = [0.35, 0, 0.85]; o.scroll = 3.6 * rate; o.dust = 1; o.lines = 1;
    o.kid.pose = { hipL: 0.15 + 0.9 * S(f), kneeL: 0.3 + 1.6 * MX(0, K(f)), hipR: 0.15 - 0.9 * S(f), kneeR: 0.3 + 1.6 * MX(0, -K(f)), shL: 0.15 - 0.95 * S(f), elL: 1.45, shR: 0.15 + 0.95 * S(f), elR: 1.45, abd: 0.18, spine: 0.3, headX: -0.18, y: -0.05 + 0.1 * S(f) * S(f), twist: 0.18 * S(f), pack: 0.02 * S(2 * f + 1), open: 0.45, tongue: 0, sway: 0.03 * S(f) };
    o.dog.pose = { y: 0.05 * e, pitch: 0.12 - 0.22 * e, legs: [[-0.25 + 1.0 * e, 0.12 + 0.5 * (1 - e)], [-0.3 + 0.95 * e, 0.1 + 0.5 * (1 - e)], [0.4 - 1.05 * e, 0.3 + 0.6 * (1 - e)], [0.45 - 1.0 * e, 0.3 + 0.6 * (1 - e)]], ear: 1.05, earSwing: 0.1 * S(f * 2), tail: 0.15 * S(f), tailUp: 0.25, tongue: 1, headX: -0.1 };
  }
  else if (state === 'cycle') {
    const f = t * TAU * 0.9 * rate, g = t * TAU * 1.9 * rate, e = 0.5 + 0.5 * K(g * 0.95);
    o.cycle = { theta: f, wheel: f * 2.1, steer: 0.035 * S(t * 0.9) }; o.kid.p = [0, 0, 0.05]; o.dog.p = [0.3, 0, -1.3 - 0.12 * S(g * 0.5)]; o.zsc = 1;
    o.kid.pose = { eye: blink(t), breath: S(t * 2), pack: 0.012 * S(f * 2 + 1), sway: 0.012 * S(f), headY: 0.06 * S(t * 0.8), open: 0.25 };
    o.dog.pose = { y: 0.05 * e, pitch: 0.12 - 0.22 * e, legs: [[-0.25 + 1.0 * e, 0.12 + 0.5 * (1 - e)], [-0.3 + 0.95 * e, 0.1 + 0.5 * (1 - e)], [0.4 - 1.05 * e, 0.3 + 0.6 * (1 - e)], [0.45 - 1.0 * e, 0.3 + 0.6 * (1 - e)]], ear: 1.05, earSwing: 0.1 * S(g * 2), tail: 0.15 * S(g), tailUp: 0.25, tongue: 1, headX: -0.1 };
    o.lines = 0;
  } else if (state === 'cycleidle') {
    o.cycle = { theta: 0.55, wheel: 0, steer: 0.04 * S(t * 0.6) }; o.kid.p = [0, 0, 0.05]; o.dog.p = [0.55, 0, -0.55]; o.dog.ry = 0.9;
    o.kid.pose = { eye: blink(t), breath: S(t * 1.9), pack: 0.003 * S(t * 1.9), headY: 0.8 * S(t * 0.7), open: 0.2 };
    o.dog.pose = { headX: 0.2, legs: legTrot(0, 0).map(() => [0, 0.1]), tail: 0.7 * S(t * 12), tailUp: 0.9, tongue: 0.8, ear: 0.3, breath: S(t * 3) };
  }
  return o;
}
export function nextBike(cur, v) { if (v > 12) return 'hidden'; if (cur === 'hidden') return 'cycle'; if (cur === 'cycle') return v < 0.3 ? 'idle' : 'cycle'; return v >= 0.6 ? 'cycle' : 'idle'; }

const rad = Math.PI / 180, angDiff = (a, b) => ((b - a + 540) % 360) - 180;
const radial = (inner, outer, size = 128) => { const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); r.addColorStop(0, inner); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, size, size); return new THREE.CanvasTexture(c); };
const zTex = () => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.font = '800 46px Nunito,Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = '#fff'; g.strokeText('z', 32, 34); g.fillStyle = '#22305A'; g.fillText('z', 32, 34); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };

export class MascotStage3D {
  constructor(canvas, o) {
    const opt = { size: 190, pitch: 56, fov: 28, ...(o || {}) }; this.size = opt.size; this.fov = opt.fov; this.pitch = opt.pitch;
    this.r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); this.r.setSize(opt.size, opt.size, false); this.r.setClearColor(0x000000, 0);
    const sc = this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(opt.fov, 1, 0.1, 80);
    sc.add(new THREE.AmbientLight(0xffffff, 1.05)); const dl = new THREE.DirectionalLight(0xffffff, 2.1); dl.position.set(2.4, 4.2, 3.2); sc.add(dl);
    const rim = new THREE.DirectionalLight(0xbcd2ff, 0.9); rim.position.set(-3, 2, -2.5); sc.add(rim);
    this.root = new THREE.Group(); sc.add(this.root); this.facing = new THREE.Group(); this.facing.rotation.y = Math.PI; this.root.add(this.facing); // the kid faces +z, the map heading 0 is -z
    this.kid = buildKid(); this.dog = buildDog(); this.bike = buildBike(); this.bike.root.visible = false; this.facing.add(this.kid.root, this.dog.root, this.bike.root);
    // heading cone on the ground, like the old avatar
    const cone = new THREE.Group(); const sec = new THREE.CircleGeometry(1.5, 28, Math.PI / 2 - 0.62, 1.24); sec.rotateX(-Math.PI / 2);
    const cm = new THREE.Mesh(sec, new THREE.MeshBasicMaterial({ color: '#4f6bff', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })); cm.position.y = 0.012; cone.add(cm); this.root.add(cone);
    const sh = radial('rgba(34,48,90,.38)', 'rgba(34,48,90,0)'); const mk = (s) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: sh, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.004; this.facing.add(m); return m; };
    this.ks = mk(0.85); this.ds = mk(0.55);
    const dm = new THREE.MeshBasicMaterial({ color: 0xFFF0D6, transparent: true, depthWrite: false });
    this.dust = Array.from({ length: 7 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), dm.clone()); m.visible = false; this.facing.add(m); return m; });
    const lm = new THREE.MeshBasicMaterial({ color: COL.out, transparent: true, opacity: 0.4 }); this.lines = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.4), lm.clone()); m.visible = false; this.facing.add(m); return m; });
    const zt = zTex(); this.zs = Array.from({ length: 3 }, () => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: zt, transparent: true, depthWrite: false })); m.visible = false; this.facing.add(m); return m; });
    this.leash = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: COL.out })); this.leash.visible = false; this.facing.add(this.leash);
    this.center = new THREE.Vector3(0.05, 0.55, 0); this.radius = 1.75; this.heading = 0; this.cur = 0; this.t = 0; this.cs = 'idle'; this.label = 'idle'; this.idleT = 0; this.idleVar = 'idle'; this.layout();
  }
  layout() { const d = this.radius / Math.sin(this.fov * rad / 2) * 1.04, p = this.pitch * rad; this.cam.position.set(this.center.x, this.center.y + d * Math.sin(p), this.center.z + d * Math.cos(p)); this.cam.lookAt(this.center); }
  layoutFor(cyc) { if (this.cyc === cyc) return; this.cyc = cyc; if (cyc) { this.center.set(0, 0.5, -0.5); this.radius = 1.95; } else { this.center.set(0.05, 0.55, 0); this.radius = 1.75; } this.layout(); }
  setPitch(deg) { this.pitch = Math.max(35, Math.min(80, deg)); this.layout(); }
  setHeading(deg, snap) { this.heading = deg; if (snap) this.cur = deg; }
  /* state: { speed (m/s, smoothed), reduce } */
  frame(dt, state) {
    const v = (state && state.speed) || 0, reduce = !!(state && state.reduce);
    this.cur += angDiff(this.cur, this.heading) * Math.min(1, dt * 7); this.root.rotation.y = -this.cur * rad;
    const bike = !!(state && state.bike); if (bike !== this.bikeMode) { this.bikeMode = bike; this.cs = 'idle'; }
    this.cs = bike ? nextBike(this.cs === 'cycle' || this.cs === 'idle' ? this.cs : 'idle', v) : nextState(this.cs, v); const c = this.cs; this.label = c;
    const hidden = c === 'hidden'; this.facing.visible = !hidden;
    if (bike) { const st2 = c === 'cycle' ? 'cycle' : 'cycleidle', rate2 = Math.max(0.5, Math.min(2.2, v / 4)); if (!reduce) this.t += dt * (c === 'cycle' ? rate2 : 1); if (!hidden) this.draw(st2, reduce ? 0.35 : this.t, dt, rate2, reduce); this.layoutFor(true); this.r.render(this.scene, this.cam); return; }
    this.layoutFor(false);
    if (c === 'idle') { this.idleT += dt; if (this.idleT > 7) { this.idleT = 0; this.idleVar = ['idle', 'petting', 'looking', 'sleepy'][(['idle', 'petting', 'looking', 'sleepy'].indexOf(this.idleVar) + 1) % 4]; } } else { this.idleT = 0; this.idleVar = 'idle'; }
    const st = c === 'jog' ? 'run' : c === 'idle' ? this.idleVar : (c === 'hidden' ? 'run' : c), rate = rateFor(c === 'hidden' ? 'run' : c, v);
    if (!reduce) this.t += dt * rate;
    if (!hidden) this.draw(st, reduce ? 0.35 : this.t, dt, rate, reduce);
    this.r.render(this.scene, this.cam);
  }
  draw(st, t, dt, rate, reduce) {
    const o = scene(st, t, rate), k = this.kid, d = this.dog;
    k.root.position.set(o.kid.p[0], 0, o.kid.p[2]); k.root.rotation.y = o.kid.ry; d.root.position.set(o.dog.p[0], 0, o.dog.p[2]); d.root.rotation.y = o.dog.ry;
    this.bike.root.visible = !!o.cycle;
    if (o.cycle) {
      const c = o.cycle, tg = poseBike(this.bike, c.theta, c.wheel, c.steer), lean = 0.42, py = 0.6, an = (p) => [p[0] + 0.05, p[1]];
      const [hL, kL] = solve2([py, 0], an(tg[0]), 0.2, 0.17, true), [hR, kR] = solve2([py, 0], an(tg[1]), 0.2, 0.17, true);
      const sh = [py + 0.29 * K(lean), 0.29 * S(lean)], hand = [BIKE.bar[1] - 0.005, BIKE.bar[0]], [aA, eA] = solve2(sh, hand, 0.16, 0.145, false);
      o.kid.pose = Object.assign({ y: py - 0.415 + 0.006 * S(c.theta * 2), hipL: hL, kneeL: kL, hipR: hR, kneeR: kR, spine: lean, shL: aA + lean, elL: eA, shR: aA + lean, elR: eA, abd: 0.0, headX: -lean * 0.9, smile: 1 }, o.kid.pose);
      this.ks.scale.setScalar(1.9); this.ks.position.set(0, 0.004, 0.05 + 0.05);
    } else this.ks.scale.setScalar(1);
    poseKid(k, o.kid.pose); poseDog(d, o.dog.pose);
    d.eyes.forEach((e) => { e.scale.y = Math.max(0.1, o.dog.pose.eye == null ? blink(t + 1) : o.dog.pose.eye); });
    if (!o.cycle) this.ks.position.set(o.kid.p[0], 0.004, o.kid.p[2]); this.ds.position.set(o.dog.p[0], 0.004, o.dog.p[2]); const lift = (o.dog.pose.y || 0); this.ds.scale.setScalar(1 - lift * 1.4); this.ds.material.opacity = 1 - lift * 2;
    const showD = o.dust && !reduce;
    this.dust.forEach((m, i) => { m.visible = !!showD; if (!showD) return; const ph = (t * 2.3 + i / this.dust.length) % 1; m.position.set(o.kid.p[0] + (i % 2 ? 0.07 : -0.07), 0.05 + ph * 0.16, o.kid.p[2] - 0.2 - ph * 0.9); m.scale.setScalar(0.5 + ph * 1.6); m.material.opacity = 0.85 * (1 - ph); });
    this.lines.forEach((m, i) => { m.visible = !!(o.lines && !reduce); if (!m.visible) return; const ph = (t * 1.6 + i / 4) % 1; m.position.set(o.kid.p[0] + (i - 1.5) * 0.22 * (i % 2 ? 1 : -1), 0.25 + 0.5 * ((i * 0.37) % 1), o.kid.p[2] - 0.5 - ph * 1.1); m.material.opacity = 0.45 * (1 - ph); });
    this.zs.forEach((m, i) => { m.visible = o.zs > 0 && !reduce; if (!m.visible) return; const ph = (o.zs * 0.35 + i / 3) % 1; m.position.set(o.dog.p[0] + 0.1 + ph * 0.12, 0.42 + ph * 0.5, o.dog.p[2]); m.scale.setScalar(0.1 + ph * 0.14); m.material.opacity = Math.sin(Math.PI * ph); });
    if (o.leash) {
      const a = new THREE.Vector3(), b = new THREE.Vector3(); this.facing.updateMatrixWorld(true); k.handL.getWorldPosition(a); d.collar.getWorldPosition(b); this.facing.worldToLocal(a); this.facing.worldToLocal(b);
      const m = a.clone().lerp(b, 0.5); m.y = Math.min(a.y, b.y) - 0.12;
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, m, b]), 14, 0.008, 5, false); this.leash.geometry.dispose(); this.leash.geometry = geo; this.leash.visible = true;
    } else this.leash.visible = false;
  }
  destroy() { try { this.r.dispose(); this.r.forceContextLoss(); } catch (e) { /* ignore */ } }
}
