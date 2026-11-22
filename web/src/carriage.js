import CH from './changes.json';
import { ST } from './net.js';
import { tr } from './i18n.js';

// Crowd sourced platform positions (vbb-change-positions, ODbL 1.0).
// Row: [station, fromLines, prevStation, fromPos, toLines, nextStation, toPos, samePlatform]
const byStation = {};
CH.forEach((r) => { (byStation[r[0]] = byStation[r[0]] || []).push(r); });

const where = (p) => (p >= 0.8 ? 'front' : p <= 0.2 ? 'rear' : 'middle');

// tip for changing from leg `a` to leg `b` (route legs) or null when nothing is known
export function changeTip(a, b) {
  const x = ST[b.stations[0]].name;
  const rows = (byStation[x] || []).filter((r) => r[1].indexOf(a.line) > -1 && r[4].indexOf(b.line) > -1);
  if (!rows.length) return null;
  const prev = a.stations.length > 1 ? ST[a.stations[a.stations.length - 2]].name : '';
  const next = b.stations.length > 1 ? ST[b.stations[1]].name : '';
  let best = null, bs = -1;
  rows.forEach((r) => {
    const s = (r[2] && r[2] === prev ? 2 : 0) + (r[5] && r[5] === next ? 2 : 0) + (r[2] === '' || r[5] === '' ? 0 : 0);
    if (s > bs) { bs = s; best = r; }
  });
  // weak match (direction not confirmed): only use it if every candidate agrees
  if (bs < 4) {
    const agree = rows.every((r) => r[7] === best[7] && r[3] === best[3] && r[6] === best[6]);
    if (!agree) return null;
  }
  if (best[7]) return { same: true, text: tr('tipSame', { b: b.line }) };
  const f = where(best[3]), t = where(best[6]);
  return {
    same: false,
    text: tr('tipRide', { f: tr(f), t: tr(t), a: a.line, b: b.line }),
  };
}
