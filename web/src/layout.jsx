/* Station layout: a schematic cross section (street, entrances and lifts above, one platform bar per line below) that shows
 * which line stops where, towards which end station, and on which platform (live). When you change trains the two lines are highlighted. Not to scale. */
import React, { useEffect, useMemo, useState } from 'react';
import { tr } from './i18n.js';
import { Ico, Badge } from './ui.jsx';
import { NET, ST, lineInfo } from './net.js';
import { board } from './live.js';
import { entrancesAround } from './entrances.js';
import { nearbyAmenities, stByName } from './extras.jsx';
import { LAY } from './layoutstate.js';

const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9äöüß]+/g, '');

/* for every line at the station: the end stations its trains head to (from the network data) */
function directions(st) {
  const out = {};
  st.lines.forEach((l) => {
    const set = {};
    NET.lines[l].v.forEach((seq) => { const k = seq.indexOf(st.i); if (k >= 0 && k < seq.length - 1) set[ST[seq[seq.length - 1]].name] = 1; });
    out[l] = Object.keys(set);
  });
  return out;
}

export default function StationLayout() {
  const name = LAY.name, st = useMemo(() => stByName(name), [name]);
  const [live, setLive] = useState(null), [ents, setEnts] = useState(null), [am, setAm] = useState(null);
  useEffect(() => {
    if (!st) return undefined; let dead = false;
    board(name, 'departures', { results: 80, duration: 40 }).then((l) => { if (!dead) setLive(l); }).catch(() => { if (!dead) setLive([]); });
    entrancesAround(st.lat, st.lng, 300).then((l) => { if (!dead) setEnts(l); }).catch(() => { if (!dead) setEnts([]); });
    nearbyAmenities(st.lat, st.lng).then((a) => { if (!dead) setAm(a); }).catch(() => { if (!dead) setAm([]); });
    return () => { dead = true; };
  }, [name]);
  if (!st) return <p className="mute">{tr('layNone')}</p>;
  const dirs = directions(st), lifts = Array.isArray(am) ? am.filter((x) => x.kind === 'lift') : [];
  const platOf = (line, to) => {
    if (!live) return '';
    const t = norm(to), hit = live.filter((x) => x.line === line && x.platform && (norm(x.dir).indexOf(t) > -1 || t.indexOf(norm(x.dir)) > -1));
    const any = hit.length ? hit : live.filter((x) => x.line === line && x.platform);
    return any.length ? String(any[0].platform) : '';
  };
  const rows = []; st.lines.forEach((l) => (dirs[l].length ? dirs[l] : ['']).slice(0, 3).forEach((d) => rows.push({ line: l, to: d, plat: platOf(l, d) })));
  const lines = st.lines, ch = LAY.from && LAY.to ? [LAY.from, LAY.to] : null;
  const W = 340, top = 120, rh = 46, H = top + lines.length * rh + 14;
  const lineRow = {}; lines.forEach((l, i) => { lineRow[l] = i; });
  const hi = (l) => !ch || ch.indexOf(l) >= 0;
  return (
    <>
      <h3>{tr('layTitle')}</h3>
      <p><b>{st.name}</b></p>
      {ch && <div className="laychange"><Badge line={ch[0]} /><Ico n="chevron" /><Badge line={ch[1]} /><span>{tr('layChange')}</span></div>}
      <svg className="laysvg" viewBox={'0 0 ' + W + ' ' + H} role="img" aria-label={tr('layTitle') + ' ' + st.name}>
        <rect x="0" y="0" width={W} height="34" rx="12" className="lay-street" />
        <text x="12" y="22" className="lay-t">{tr('layStreet')}</text>
        {(ents && ents.length ? ents.slice(0, 5) : [{ ref: '' }, { ref: '' }]).map((e, i, a) => { const x = 130 + i * (190 / Math.max(1, a.length)); return (<g key={i} transform={'translate(' + x + ',6)'}><rect width="22" height="22" rx="7" className="lay-door" /><path d="M7 16V6h8v10M7 16h8M12 11h.01" className="lay-dg" /></g>); })}
        <rect x="0" y="52" width={W} height="30" rx="10" className="lay-conc" />
        <text x="12" y="71" className="lay-t">{tr('layConcourse')}</text>
        {lifts.slice(0, 2).map((l, i) => (<g key={i} transform={'translate(' + (236 + i * 44) + ',57)'}><rect width="38" height="20" rx="7" className="lay-lift" /><text x="19" y="14" className="lay-lt">{'↑↓ ' + l.d}</text></g>))}
        {[40, 300].map((x) => (<g key={x}><path d={'M' + x + ' 34V52'} className="lay-stair" /><path d={'M' + x + ' 82V' + (top - 8)} className="lay-stair" /></g>))}
        <text x="12" y={top - 18} className="lay-tm">{tr('layPlatforms')}</text>
        {lines.map((l, i) => {
          const y = top + i * rh, c = lineInfo(l).c, mine = rows.filter((r) => r.line === l);
          return (
            <g key={l} opacity={hi(l) ? 1 : 0.35}>
              <rect x="0" y={y} width={W} height="38" rx="12" className="lay-plat" />
              <rect x="0" y={y} width="8" height="38" rx="4" fill={c} />
              <text x="20" y={y + 24} className="lay-line" fill={c}>{l}</text>
              {mine.slice(0, 2).map((r, k) => (
                <g key={k}>
                  <text x={k ? 196 : 66} y={y + 16} className="lay-dir">{(k ? '→ ' : '← ') + (r.to.length > 15 ? r.to.slice(0, 14) + '…' : r.to)}</text>
                  <text x={k ? 196 : 66} y={y + 31} className="lay-pl">{r.plat ? tr('layPlat', { p: r.plat }) : tr('layPlatNone')}</text>
                </g>
              ))}
            </g>
          );
        })}
        {ch && lineRow[ch[0]] != null && lineRow[ch[1]] != null && (
          <path d={'M' + (W - 14) + ' ' + (top + lineRow[ch[0]] * rh + 19) + 'C' + (W + 6) + ' ' + (top + lineRow[ch[0]] * rh + 19) + ' ' + (W + 6) + ' ' + (top + lineRow[ch[1]] * rh + 19) + ' ' + (W - 14) + ' ' + (top + lineRow[ch[1]] * rh + 19)} className="lay-conn" />
        )}
      </svg>
      <p className="mute">{ents === null ? tr('shChecking') : ents.length ? tr('layEnts', { n: ents.length }) : tr('layNoEnts')}{' · '}{am === null ? '' : lifts.length ? tr('layLifts', { n: lifts.length, d: lifts[0].d }) : tr('layNoLifts')}</p>
      <p className="mute">{tr('layNote')}</p>
    </>
  );
}
