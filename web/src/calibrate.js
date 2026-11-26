/* GPS calibration: a manual offset (where the crosshair says you really are) and a compass offset. Kept for the current session. */
const KEY = 'bl_calib';
let st = { dLat: 0, dLng: 0, comp: 0, t: 0 };
try { const o = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (o && Date.now() - o.t < 45 * 60000) st = o; } catch (e) { /* none */ }
const save = () => { st.t = Date.now(); try { sessionStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ } };
export const getCalib = () => st;
export const hasCalib = () => !!(st.dLat || st.dLng || st.comp);
export function setOffsetFrom(raw, truth) { st.dLat = truth.lat - raw.lat; st.dLng = truth.lng - raw.lng; save(); }
export function setCompass(deg) { st.comp = ((deg % 360) + 540) % 360 - 180; save(); }
export function resetCalib() { st = { dLat: 0, dLng: 0, comp: 0, t: 0 }; try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
export const applyPos = (p) => ({ ...p, lat: p.lat + st.dLat, lng: p.lng + st.dLng });
export const applyHeading = (h) => (h == null ? h : (h + st.comp + 360) % 360);
export const offsetMeters = () => Math.round(Math.hypot(st.dLat * 111000, st.dLng * 68000));

/* ---------------- automatic calibration ----------------
 * One tap: the phone is moved in a figure eight while the app listens to the motion sensors and the GPS.
 *  - motion: enough turning around all three axes means the compass has been moved through every direction (progress bar)
 *  - GPS: the fixes of those seconds are averaged (the most exact ones count most), so a single jump does not matter
 *  - position: on a route (train or walking route) the averaged position is moved onto the route when it is close to it
 *  - compass: while moving, the offset between the compass and the GPS course is learned
 * The old manual shift is replaced by the result. */
const wrap180 = (d) => ((d % 360) + 540) % 360 - 180;
export const clearPos = () => { st.dLat = 0; st.dLng = 0; save(); };

/* iOS asks for motion access; call this directly from the tap handler. Everywhere else it is granted. */
export async function askMotion() {
  try {
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') return (await D.requestPermission()) === 'granted';
  } catch (e) { return false; }
  return true;
}

/* o: { getRaw(): {lat,lng}|null, snap(A, moving): {lat,lng,m,max}|null, getCompass(): deg|null, onProgress(p), onDone(result), minMs, maxMs } */
export function startAutoCalib(o) {
  const minMs = o.minMs || 4500, maxMs = o.maxMs || 15000;
  const S = { t0: Date.now(), fixes: [], aSum: 0, aLast: null, bMin: 999, bMax: -999, gMin: 999, gMax: -999, rot: 0, lastM: 0, ev: 0, err: '', done: false, p: 0 };
  const onOri = (e) => {
    if (e.alpha == null && e.beta == null && e.gamma == null) return;
    S.ev++;
    if (e.alpha != null) { if (S.aLast != null) S.aSum += Math.abs(wrap180(e.alpha - S.aLast)); S.aLast = e.alpha; }
    if (e.beta != null) { S.bMin = Math.min(S.bMin, e.beta); S.bMax = Math.max(S.bMax, e.beta); }
    if (e.gamma != null) { S.gMin = Math.min(S.gMin, e.gamma); S.gMax = Math.max(S.gMax, e.gamma); }
  };
  const onMot = (e) => {
    const r = e.rotationRate; if (!r) return;
    const now = performance.now(), dt = S.lastM ? Math.min(0.2, (now - S.lastM) / 1000) : 0; S.lastM = now; S.ev++;
    S.rot += Math.hypot(r.alpha || 0, r.beta || 0, r.gamma || 0) * dt;
  };
  window.addEventListener('deviceorientation', onOri, true); window.addEventListener('devicemotion', onMot, true);
  let wid = null;
  try {
    if (navigator.geolocation) wid = navigator.geolocation.watchPosition((p) => { const c = p.coords; S.fixes.push({ lat: c.latitude, lng: c.longitude, acc: c.accuracy || 50, speed: c.speed, heading: c.heading, t: Date.now() }); },
      (e) => { S.err = e && e.code === 1 ? 'denied' : 'nofix'; }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  } catch (e) { S.err = 'nofix'; }

  const cover = () => Math.min(1, (Math.min(1, S.aSum / 200) + Math.min(1, Math.max(0, S.bMax - S.bMin) / 45) + Math.min(1, Math.max(0, S.gMax - S.gMin) / 45)) / 3);
  const stop = () => { S.done = true; clearInterval(timer); window.removeEventListener('deviceorientation', onOri, true); window.removeEventListener('devicemotion', onMot, true); try { wid != null && navigator.geolocation.clearWatch(wid); } catch (e) { /* ignore */ } };
  const bestAcc = () => (S.fixes.length ? Math.round(Math.min(...S.fixes.map((f) => f.acc))) : null);

  const result = (el) => {
    const usable = S.fixes.filter((f) => f.acc <= 60);
    const pool = usable.length >= 2 ? usable : S.fixes.slice().sort((a, b) => a.acc - b.acc).slice(0, 3);
    let A = null;
    if (pool.length) { let w = 0, la = 0, ln = 0; pool.forEach((f) => { const k = 1 / Math.max(4, f.acc * f.acc); w += k; la += f.lat * k; ln += f.lng * k; }); A = { lat: la / w, lng: ln / w }; }
    else if (o.getRaw && o.getRaw()) A = o.getRaw();
    const moving = pool.filter((f) => f.speed != null && f.speed > 3).length >= 2;
    let shiftM = 0, snapped = false;
    if (A && o.snap) {
      const s = o.snap(A, moving);
      if (s && s.m > 10 && s.m <= (s.max || 60)) { setOffsetFrom(A, s); shiftM = Math.round(s.m); snapped = true; } else clearPos();
    } else if (A) clearPos();
    let comp = 'none';
    if (o.getCompass) {
      const raw = o.getCompass(), gh = S.fixes.filter((f) => f.heading != null && !Number.isNaN(f.heading) && f.speed != null && f.speed > 1.2).pop();
      if (raw != null && gh) { setCompass(wrap180(gh.heading - raw)); comp = 'learned'; } else if (raw != null) { setCompass(0); comp = 'reset'; }
    }
    return { ok: !!A, reason: A ? '' : S.err || 'nofix', accuracy: pool.length ? Math.round(Math.min(...pool.map((f) => f.acc))) : null, shiftM, snapped, compass: comp, fixes: S.fixes.length, motion: S.ev > 3, ms: el };
  };

  const timer = setInterval(() => {
    if (S.done) return;
    const el = Date.now() - S.t0, noMotion = S.ev < 3 && el > 2500;
    const pm = noMotion ? Math.min(1, el / 3500) : Math.max(cover(), Math.min(1, S.rot / 540));
    S.p = Math.max(S.p, Math.min(pm, el / minMs));
    o.onProgress && o.onProgress({ p: S.p, acc: bestAcc(), fixes: S.fixes.length, noMotion, err: S.err });
    const haveFix = S.fixes.length >= 2 || (S.fixes.length >= 1 && el > minMs + 2500) || (o.getRaw && o.getRaw() && el > minMs + 2500);
    if ((S.p >= 1 && haveFix) || el >= maxMs || (S.err === 'denied' && el > 1500)) { const r = result(el); stop(); o.onDone && o.onDone(r); }
  }, 200);
  return { stop, state: S };
}
