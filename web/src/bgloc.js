/* Keeps the position moving when the app is not on screen.
 *  - In the Android app a small foreground service reads the GPS and pushes every fix into the page (window.__nativeFix).
 *    The page does not need to know: this file wraps navigator.geolocation.watchPosition so every watcher also gets the native fixes.
 *  - In every browser the position is asked again at once when the app comes back to the front, so the dot never stays where it stopped.
 * bgTrack(true) is called while a trip or a walk is running, bgTrack(false) when it ends. */
const bridge = () => (typeof window !== 'undefined' ? window.AndroidBridge : null);
const watchers = new Map();
let nextId = 1, users = 0, native = false, stopTimer = 0, title = 'Bearline', text = '';

const refresh = () => {
  if (!watchers.size || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition((pos) => { watchers.forEach((w) => { w.last = pos.timestamp || Date.now(); try { w.ok(pos); } catch (e) { /* watcher failed */ } }); }, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 });
};

const startNative = () => {
  clearTimeout(stopTimer);
  const b = bridge(); if (native || !b || !b.startTracking) return;
  try { b.startTracking(title, text); native = true; } catch (e) { native = false; }
};
const stopNative = () => {
  const b = bridge(); if (!native) return;
  try { b.stopTracking && b.stopTracking(); } catch (e) { /* ignore */ }
  native = false;
};

/* a trip or a walk needs the position even when the app is in the background */
export function bgTrack(on, t, x) {
  if (t) title = t; if (x) text = x;
  if (on) { users++; startNative(); return; }
  users = Math.max(0, users - 1);
  if (!users) { clearTimeout(stopTimer); stopTimer = setTimeout(() => { if (!users) stopNative(); }, 3000); } // a walk handing over to a trip does not stop and start the service
}

export function installBgLocation() {
  const geo = typeof navigator !== 'undefined' ? navigator.geolocation : null;
  if (!geo || geo.__bl) return;
  const real = { watch: geo.watchPosition.bind(geo), clear: geo.clearWatch.bind(geo) };
  try {
    geo.watchPosition = (ok, err, opts) => {
      const id = nextId++, w = { ok, last: 0, real: null };
      w.real = real.watch((pos) => { w.last = pos.timestamp || Date.now(); ok(pos); }, err, opts);
      watchers.set(id, w);
      return id;
    };
    geo.clearWatch = (id) => { const w = watchers.get(id); if (!w) { real.clear(id); return; } real.clear(w.real); watchers.delete(id); };
    geo.__bl = true;
  } catch (e) { return; }
  // a fix from the Android service: forward it to every watcher that has not seen a newer one
  window.__nativeFix = (lat, lng, acc, speed, heading, t) => {
    watchers.forEach((w) => {
      if (t <= w.last) return; w.last = t;
      try { w.ok({ coords: { latitude: lat, longitude: lng, accuracy: acc, altitude: null, altitudeAccuracy: null, speed: speed < 0 ? null : speed, heading: heading < 0 ? null : heading }, timestamp: t }); } catch (e) { /* watcher failed */ }
    });
  };
  window.__bgResume = refresh;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  window.addEventListener('pageshow', refresh);
}
