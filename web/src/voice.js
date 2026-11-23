/* Voice input. In the Android app the page asks Android's own speech dialog (the WebView has no web speech API).
 * In a browser it uses the Web Speech API when the browser has it. */
const SPEECH = { en: 'en-GB', de: 'de-DE', es: 'es-ES', it: 'it-IT', fr: 'fr-FR', hi: 'hi-IN', pa: 'pa-IN', zh: 'zh-CN', ko: 'ko-KR' };
export const speechLang = (l) => SPEECH[l] || 'en-GB';
const SR = () => (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;
export const nativeVoice = () => typeof window !== 'undefined' && !!(window.AndroidBridge && window.AndroidBridge.startVoice);
export const voiceAvailable = () => nativeVoice() || !!SR();

/* done(text, errorCode). errorCode: '', 'perm', 'network', 'none', 'unsupported', 'other' */
export function listen(lang, done, onStart) {
  const loc = speechLang(lang);
  if (nativeVoice()) {
    window.__voiceResult = (t, e) => { window.__voiceResult = null; done(t || '', t ? '' : (e === 'unavailable' ? 'unsupported' : 'none')); };
    try { window.AndroidBridge.startVoice(loc); onStart && onStart(); } catch (e) { done('', 'unsupported'); }
    return;
  }
  const R = SR(); if (!R) { done('', 'unsupported'); return; }
  const r = new R(); r.lang = loc; r.interimResults = false; r.maxAlternatives = 1;
  let got = false;
  r.onstart = () => onStart && onStart();
  r.onresult = (e) => { got = true; done(e.results[0][0].transcript, ''); };
  r.onerror = (e) => { if (got) return; got = true; const c = e.error; done('', c === 'not-allowed' || c === 'service-not-allowed' ? 'perm' : c === 'network' ? 'network' : c === 'no-speech' || c === 'aborted' ? 'none' : 'other'); };
  r.onend = () => { if (!got) { got = true; done('', 'none'); } };
  try { r.start(); } catch (e) { done('', 'other'); }
}
