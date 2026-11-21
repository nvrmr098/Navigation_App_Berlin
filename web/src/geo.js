/* Geo helpers: GPS tracking, projection onto the schematic map, snapping a position onto a route. */
import { ST, clamp } from './net.js';

// must match scripts/build_data.py
const LAT0 = 52.52, LON0 = 13.405, PP = 0.55, PC = 1.75, YSTRETCH = 1.3;

export function project(lat, lng) {
  let x = (lng - LON0) * 111.32 * Math.cos(LAT0 * Math.PI / 180);
  let y = -(lat - LAT0) * 110.57;
  const r = Math.hypot(x, y);
  if (r > 1e-6) { const r2 = PC * Math.pow(r, PP); x = x * r2 / r; y = y * r2 / r * YSTRETCH; }
  return { x, y };
}

export function distKm(lat1, lng1, lat2, lng2) {
  const p = Math.PI / 180, dl = (lat2 - lat1) * p, dn = (lng2 - lng1) * p;
  const a = Math.sin(dl / 2) ** 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(dn / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export function nearestStation(lat, lng) {
  let best = null, bd = 1e9;
  ST.forEach((s) => { const d = distKm(lat, lng, s.lat, s.lng); if (d < bd) { bd = d; best = s; } });
  return { st: best, km: bd };
}

// local planar coordinates in km around a reference latitude
const kx = (lng, lat) => (lng - LON0) * 111.32 * Math.cos(lat * Math.PI / 180);
const ky = (lat) => (lat - LAT0) * 110.57;

/* Snap a GPS position onto the route polyline (station to station).
 * Returns the float index along the route points and the distance to the route in km. */
export function snapToRoute(overlay, lat, lng, prevIdx) {
  const pts = overlay.path.pts, px = kx(lng, lat), py = ky(lat);
  let best = { idx: 0, km: 1e9 }, bestScore = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = ST[pts[i].st], b = ST[pts[i + 1].st];
    const ax = kx(a.lng, a.lat), ay = ky(a.lat), bx = kx(b.lng, b.lat), by = ky(b.lat);
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-9;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1);
    const d = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    const score = d + (prevIdx != null ? 0.03 * Math.abs(i + t - prevIdx) : 0);
    if (score < bestScore) { bestScore = score; best = { idx: i + t, km: d }; }
  }
  return best;
}

// geographic position and heading (degrees, 0 = north) at a float index of the route
export function geoAt(overlay, idx) {
  const pts = overlay.path.pts;
  let i = Math.floor(idx); if (i >= pts.length - 1) i = pts.length - 2; if (i < 0) i = 0;
  const t = clamp(idx - i, 0, 1), a = ST[pts[i].st], b = ST[pts[i + 1].st];
  const lat = a.lat + (b.lat - a.lat) * t, lng = a.lng + (b.lng - a.lng) * t;
  const dx = kx(b.lng, b.lat) - kx(a.lng, a.lat), dy = ky(b.lat) - ky(a.lat);
  const bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  return { lat, lng, bearing };
}

export function haptic(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not supported */ } }

export function keepAwake(on) {
  try { if (window.AndroidBridge && window.AndroidBridge.keepScreenOn) window.AndroidBridge.keepScreenOn(!!on); } catch (e) { /* ignore */ }
  try {
    if (navigator.wakeLock) {
      if (on) navigator.wakeLock.request('screen').then((l) => { keepAwake.lock = l; }).catch(() => {});
      else if (keepAwake.lock) { keepAwake.lock.release().catch(() => {}); keepAwake.lock = null; }
    }
  } catch (e) { /* ignore */ }
}

/* Thin wrapper around watchPosition with a clear status:
 * idle | asking | searching | ok | weak | denied | unavailable */
export class GpsTracker {
  constructor(onFix, onStatus) { this.onFix = onFix; this.onStatus = onStatus; this.id = null; this.status = 'idle'; this.last = null; }
  set(s) { if (s !== this.status) { this.status = s; this.onStatus && this.onStatus(s); } }
  start() {
    if (this.id != null) return;
    if (!navigator.geolocation) { this.set('unavailable'); return; }
    this.set('asking');
    this.id = navigator.geolocation.watchPosition(
      (pos) => {
        const c = pos.coords;
        this.last = { lat: c.latitude, lng: c.longitude, acc: c.accuracy, heading: c.heading, speed: c.speed, t: pos.timestamp };
        this.set(c.accuracy > 80 ? 'weak' : 'ok');
        this.onFix(this.last);
      },
      (err) => { this.set(err.code === 1 ? 'denied' : err.code === 3 ? 'searching' : 'unavailable'); },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
    setTimeout(() => { if (this.status === 'asking') this.set('searching'); }, 1500);
  }
  stop() { if (this.id != null) navigator.geolocation.clearWatch(this.id); this.id = null; this.set('idle'); }
}

export function getPositionOnce() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('unavailable')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      (e) => reject(e), { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 });
  });
}
