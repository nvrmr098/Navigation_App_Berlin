/* Ongoing trip notification (shown on the lock screen). Works in the Android app through the bridge;
 * in a plain browser there is nothing to show, so it does nothing. */
let last = '';
export function tripNotify(title, text) {
  const k = title + '|' + text; if (k === last) return; last = k;
  try { if (window.AndroidBridge && window.AndroidBridge.tripNotify) window.AndroidBridge.tripNotify(String(title || ''), String(text || '')); } catch (e) { /* no bridge */ }
}
export function tripNotifyEnd() {
  last = '';
  try { if (window.AndroidBridge && window.AndroidBridge.tripNotifyEnd) window.AndroidBridge.tripNotifyEnd(); } catch (e) { /* no bridge */ }
}
