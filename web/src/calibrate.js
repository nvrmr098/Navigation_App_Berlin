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
