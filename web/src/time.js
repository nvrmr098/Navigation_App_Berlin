/* Berlin wall clock helpers (the app always plans in Berlin time) */
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
export function berlinParts(ms) {
  const o = {}; fmt.formatToParts(ms).forEach((p) => { o[p.type] = p.value; });
  return { y: +o.year, m: +o.month, d: +o.day, hh: +o.hour % 24, mm: +o.minute };
}
// Berlin local date and time -> UTC milliseconds
export function berlinMs(y, m, d, hh, mm) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess;
  for (let i = 0; i < 2; i++) { const p = berlinParts(t); t += guess - Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm); }
  return t;
}
export const pad = (n) => (n < 10 ? '0' : '') + n;
export function dayOffsetMs(base, days) { const p = berlinParts(base + days * 86400000); return berlinMs(p.y, p.m, p.d, 12, 0); }
