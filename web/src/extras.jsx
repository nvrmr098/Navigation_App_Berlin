/* Extra helpers: ticket zones, station help, alternatives, night info, voice assistant. */
import React, { useEffect, useState } from 'react';
import { tr, fmtTime, getLang } from './i18n.js';
import { Ico, Badge, SearchBox } from './ui.jsx';
import { ST } from './net.js';
import { board, journeys, cleanName } from './live.js';
import { distKm, nearestStation } from './geo.js';
import { geocode } from './walk.js';
import { listen, speechLang, voiceAvailable } from './voice.js';

const C0 = { lat: 52.5219, lng: 13.4115 };
/* zone estimate: A = inside the Ringbahn (about 8 km around the centre), B = rest of Berlin (about 21 km), C = beyond. An estimate, not an official map. */
export const zoneOf = (lat, lng) => { const d = distKm(C0.lat, C0.lng, lat, lng); return d <= 8.5 ? 'A' : d <= 21 ? 'B' : 'C'; };
export const stByName = (n) => ST.find((s) => s.name === n);

export function TicketHelper({ nav }) {
  const r = nav.routes && nav.routes[nav.sel || 0];
  if (!r) return (<><h3>{tr('tkTitle')}</h3><p className="mute">{tr('tkNoRoute')}</p><p>{tr('ticP2')}</p></>);
  const set = new Set();
  r.legs.forEach((l) => l.stations.forEach((i) => set.add(zoneOf(ST[i].lat, ST[i].lng))));
  if (nav.fromPlace) set.add(zoneOf(nav.fromPlace.lat, nav.fromPlace.lng));
  if (nav.toPlace) set.add(zoneOf(nav.toPlace.lat, nav.toPlace.lng));
  const z = ['A', 'B', 'C'].filter((k) => set.has(k));
  const need = set.has('C') ? (set.has('A') ? 'ABC' : 'BC') : 'AB';
  return (
    <>
      <h3>{tr('tkTitle')}</h3>
      <p><b>{ST[r.from].name}</b> &rarr; <b>{ST[r.to].name}</b></p>
      <div className="tkbig"><small>{tr('tkNeed')}</small><b>{need}</b></div>
      <p className="mute">{tr('tkZones')}: {z.join(', ')}</p>
      <p className="mute">{tr('tkNote')}</p>
      <a className="btn sm" style={{ display: 'inline-flex', marginTop: 6 }} href="https://www.bvg.de/en/tickets-and-fares" target="_blank" rel="noopener noreferrer"><Ico n="ticket" />{tr('tkOpen')}</a>
    </>
  );
}

const ovCache = {};
async function nearbyAmenities(lat, lng) {
  const k = lat.toFixed(4) + lng.toFixed(4); if (ovCache[k]) return ovCache[k];
  const a = '(around:250,' + lat + ',' + lng + ')';
  const q = '[out:json][timeout:12];(node' + a + '[amenity=toilets];way' + a + '[amenity=toilets];node' + a + '[highway=elevator];node' + a + '[elevator=yes];);out center 40;';
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q), { signal: ctl.signal }); if (!r.ok) throw new Error('http');
    const j = await r.json();
    const out = (j.elements || []).map((e) => { const p = e.center || e; const t = e.tags || {}; return { kind: t.amenity === 'toilets' ? 'wc' : 'lift', d: Math.round(distKm(lat, lng, p.lat, p.lon) * 1000), fee: t.fee === 'yes', wheel: t.wheelchair === 'yes' }; }).sort((a, b) => a.d - b.d);
    ovCache[k] = out; return out;
  } finally { clearTimeout(t); }
}

/* pick any station, street or place (places resolve to the nearest S+U station) */
export function PlacePick({ store, onName }) {
  const [q, setQ] = useState('');
  return (
    <div className="fld pk"><Ico n="search" className="s" />
      <SearchBox value={q} onChange={setQ} placeholder={tr('pickPlace')} store={store} ddTop={50} places
        onPick={(s) => { const st = s.place ? nearestStation(s.lat, s.lng).st : s; onName(st.name); setQ(''); }} />
    </div>
  );
}

export function StationHelp({ names: n0, store }) {
  const [extra, setExtra] = useState([]);
  const names = [...extra, ...n0.filter((x) => extra.indexOf(x) < 0)];
  const [name, setName] = useState(n0[0] || '');
  const [plat, setPlat] = useState(null);
  const [am, setAm] = useState(null);
  useEffect(() => {
    if (!name) return undefined; let dead = false; setPlat(null); setAm(null);
    board(name, 'departures', { results: 40, duration: 30 }).then((l) => { if (!dead) { const m = {}; l.forEach((x) => { if (x.platform) (m[x.line] = m[x.line] || new Set()).add(x.platform); }); setPlat(Object.keys(m).map((k) => [k, [...m[k]].join(', ')])); } }).catch(() => { if (!dead) setPlat([]); });
    const s = stByName(name); if (s) nearbyAmenities(s.lat, s.lng).then((a) => { if (!dead) setAm(a); }).catch(() => { if (!dead) setAm('err'); });
    return () => { dead = true; };
  }, [name]);
  const s = stByName(name), ok = Array.isArray(am), wc = (ok ? am : []).filter((x) => x.kind === 'wc'), lf = (ok ? am : []).filter((x) => x.kind === 'lift');
  return (
    <>
      <h3>{tr('shTitle')}</h3>
      <PlacePick store={store} onName={(x) => { setExtra((o) => [x, ...o]); setName(x); }} />
      {names.length > 1 && <div className="chips">{names.map((n) => <button key={n} className={'chip' + (n === name ? ' on' : '')} onClick={() => setName(n)}>{n}</button>)}</div>}
      <p><b>{name}</b></p>
      <div className="sec">{tr('shPlatforms')}</div>
      {plat === null ? <p className="mute">{tr('shChecking')}</p> : plat.length ? <div className="plist">{plat.map((p) => <div key={p[0]} className="li" style={{ padding: '6px 0' }}><Badge line={p[0]} /><span className="tx" style={{ marginLeft: 8 }}>{tr('platform')} {p[1]}</span></div>)}</div> : <p className="mute">{tr('shNoPlat')}</p>}
      <div className="sec">{tr('shLifts')}</div>
      {am === null ? <p className="mute">{tr('shChecking')}</p> : am === 'err' ? <p className="mute">{tr('liveOff')}</p> : lf.length ? <p>{lf.slice(0, 4).map((x) => x.d + ' m').join(' · ')}</p> : <p className="mute">{tr('shNone')}</p>}
      <div className="sec">{tr('shToilets')}</div>
      {am === null ? <p className="mute">{tr('shChecking')}</p> : am === 'err' ? <p className="mute">{tr('liveOff')}</p> : wc.length ? <p>{wc.slice(0, 4).map((x) => x.d + ' m' + (x.fee ? ' (€)' : '')).join(' · ')}</p> : <p className="mute">{tr('shNone')}</p>}
      {s && <a className="btn alt sm" style={{ display: 'inline-flex', marginTop: 6 }} href={'https://www.openstreetmap.org/?mlat=' + s.lat + '&mlon=' + s.lng + '#map=18/' + s.lat + '/' + s.lng} target="_blank" rel="noopener noreferrer"><Ico n="map" />{tr('shOsm')}</a>}
      <p className="mute" style={{ marginTop: 10 }}>{tr('shCred')}</p>
    </>
  );
}

export function Alternatives({ nav, store, inline }) {
  const [stepFree, setSf] = useState(!!store.step);
  const [st, setSt] = useState({ s: 'loading', list: [] });
  const a = nav.from && nav.from.name, b = nav.to && nav.to.name;
  useEffect(() => {
    if (!a || !b) return undefined; let dead = false; setSt({ s: 'loading', list: [] });
    journeys(a, b, { results: 4, stepFree, when: Date.now() }).then((l) => { if (!dead) setSt({ s: 'ok', list: l }); }).catch(() => { if (!dead) setSt({ s: 'err', list: [] }); });
    return () => { dead = true; };
  }, [a, b, stepFree]);
  if (!a || !b) return (<><h3>{tr('alTitle')}</h3><p className="mute">{tr('tkNoRoute')}</p></>);
  return (
    <>
      {inline ? <div className="sec">{tr('alTitle')}</div> : <><h3>{tr('alTitle')}</h3><p><b>{a}</b> &rarr; <b>{b}</b></p></>}
      <div className="li" style={{ paddingLeft: 0, paddingRight: 0 }}><span className="tx">{tr('stepFree')}<small>{tr('alSfSub')}</small></span><button className={'tgl' + (stepFree ? ' on' : '')} role="switch" aria-checked={stepFree} onClick={() => setSf((v) => !v)} /></div>
      {st.s === 'loading' && <p className="mute">{tr('alLoading')}</p>}
      {st.s === 'err' && <p className="mute">{tr('alNone')}</p>}
      {st.s === 'ok' && !st.list.length && <p className="mute">{tr('alNone')}</p>}
      {st.list.map((j, i) => (
        <div key={i} className={'alt glass' + (j.warn ? ' warn' : '')}>
          <div className="hd"><b>{fmtTime(j.dep)} &rarr; {fmtTime(j.arr)}</b><span className="mute">{Math.round((j.arr - j.dep) / 60000)} {tr('min')}</span></div>
          <div className="vis">{j.legs.map((l, k) => <React.Fragment key={k}>{k > 0 && <span className="ar">&rsaquo;</span>}{l.walk ? <span className="wlk"><Ico n="walk" />{l.dist ? l.dist + ' m' : ''}</span> : <Badge line={l.line} big />}</React.Fragment>)}</div>
          {j.warn && <small className="wn"><Ico n="warn" />{tr('alDisr')}</small>}
        </div>
      ))}
      {!inline && <p className="mute">{tr('credLive')}</p>}
    </>
  );
}

export function NightInfo({ names: n0, store }) {
  const [extra, setExtra] = useState([]);
  const names = [...extra, ...n0.filter((x) => extra.indexOf(x) < 0)];
  const [name, setName] = useState(n0[0] || 'Alexanderplatz');
  const [rows, setRows] = useState(null);
  const [lines, setLines] = useState([]);
  useEffect(() => { import('./modes-bus.json').then((m) => setLines(Object.keys((m.default || m).l).filter((k) => /^N\d/.test(k)).sort((x, y) => x.localeCompare(y, 'en', { numeric: true })))); }, []);
  useEffect(() => {
    let dead = false; setRows(null);
    const t = new Date(Date.now()); const nm = new Date(t.getTime()); // next 01:00 Berlin (approx by local offset of Berlin)
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false }).format(t);
    const hoursTo1 = ((1 - parseInt(parts, 10)) + 24) % 24 || 24; nm.setMinutes(0, 0, 0); nm.setHours(nm.getHours() + hoursTo1);
    board(name, 'departures', { when: nm.getTime(), results: 30, duration: 120 }).then((l) => { if (!dead) setRows(l); }).catch(() => { if (!dead) setRows([]); });
    return () => { dead = true; };
  }, [name]);
  const seen = {}; const night = (rows || []).filter((x) => { const k = x.line + x.dir; if (seen[k]) return false; seen[k] = 1; return true; }).slice(0, 8);
  return (
    <>
      <h3>{tr('nightTitle')}</h3>
      <PlacePick store={store} onName={(x) => { setExtra((o) => [x, ...o]); setName(x); }} />
      {names.length > 1 && <div className="chips">{names.map((n) => <button key={n} className={'chip' + (name === n ? ' on' : '')} onClick={() => setName(n)}>{n}</button>)}</div>}
      <p><b>{name}</b></p>
      <div className="sec">{tr('nightAfter')}</div>
      {rows === null ? <p className="mute">{tr('shChecking')}</p> : night.length ? night.map((x, i) => <div key={i} className="li" style={{ padding: '6px 0' }}><Badge line={x.line} /><span className="tx" style={{ marginLeft: 8 }}>{x.dir}<small>{fmtTime(x.when)}</small></span></div>) : <p className="mute">{tr('nightNone')}</p>}
      <div className="sec">{tr('nightLines')}</div>
      <div className="chips wrap">{lines.slice(0, 60).map((l) => <span key={l} className="chip">{l}</span>)}</div>
      <p className="mute">{tr('nightNote')}</p>
    </>
  );
}

/* voice + typed assistant: rule based, no cloud AI and no key inside the app */
const normS = (s) => String(s).toLowerCase().replace(/straße|strasse/g, 'str').replace(/^(s\+u|s|u)\s+/, '').replace(/[^\p{L}\p{N}]/gu, '');
export function parseIntent(text) {
  const t = text.trim();
  let m = t.match(/(?:from|von|ab|desde|da|de|से|ਤੋਂ|从|從)\s+(.+?)\s+(?:to|nach|zu|bis|a|à|al|verso|vers|तक|को|ਤੱਕ|到|去)\s+(.+)/i);
  if (m) return { from: m[1], to: m[2] };
  m = t.match(/(?:to|nach|zu|bis|a|à|al|vers|verso|navigate to|go to|bring mich zu|去|到|前往|往)\s*(.+)/i);
  if (m) return { to: m[1] };
  m = t.match(/(.+?)\s*(?:으로|로|에)\s*(?:가|갈)/); if (m) return { to: m[1] };
  return { to: t.replace(/(जाना|जाओ|ਜਾਣਾ|ਜਾਓ)$/u, '').trim() };
}
export async function resolvePlace(text) {
  const n = normS(text); if (!n) return null;
  const hit = ST.find((s) => normS(s.name) === n) || ST.find((s) => normS(s.name).indexOf(n) === 0) || ST.find((s) => normS(s.name).indexOf(n) > -1);
  if (hit) return { st: hit };
  try { const g = await geocode(text); if (g[0]) { let best = null, bd = 1e9; ST.forEach((s) => { const d = distKm(g[0].lat, g[0].lng, s.lat, s.lng); if (d < bd) { bd = d; best = s; } }); return { st: best, place: g[0] }; } } catch (e) { /* offline */ }
  return null;
}
export function Assistant({ onGo, say, auto }) {
  const [txt, setTxt] = useState(''), [busy, setBusy] = useState(false), [listening, setListen] = useState(false), [msg, setMsg] = useState('');
  const run = async (q) => {
    const text = (q || txt).trim(); if (!text) return; setBusy(true); setMsg('');
    const it = parseIntent(text); const to = await resolvePlace(it.to); const from = it.from ? await resolvePlace(it.from) : null;
    setBusy(false);
    if (!to) { setMsg(tr('asNotFound') + ': ' + text); return; }
    const out = to.place ? to.place.name : to.st.name; setMsg(tr('asDone') + ' ' + out);
    try { if (window.speechSynthesis) { const u = new SpeechSynthesisUtterance(tr('asDone') + ' ' + out); u.lang = speechLang(getLang()); window.speechSynthesis.speak(u); } } catch (e) { /* no tts */ }
    onGo(from, to);
  };
  const mic = () => {
    setMsg('');
    listen(getLang(), (t, err) => {
      setListen(false);
      if (t) { setTxt(t); run(t); return; }
      setMsg(err === 'perm' ? tr('asErrPerm') : err === 'network' ? tr('asErrNet') : err === 'none' ? tr('asErrNone') : tr('asNoMic') + ' ' + tr('asKbHint'));
    }, () => setListen(true));
  };
  useEffect(() => { if (auto) setTimeout(mic, 350); /* eslint-disable-next-line */ }, []);
  return (
    <>
      <h3>{tr('asTitle')}</h3>
      <p className="mute">{tr('asHint')}</p>
      <div className="asrow"><input className="asin" value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') run(); }} placeholder={tr('asPh')} />
        <button className={'btn sq2' + (listening ? ' rec' : '')} aria-label={tr('asMic')} onClick={mic}><Ico n="mic" /></button></div>
      <button className="btn" style={{ width: '100%', marginTop: 10 }} disabled={busy} onClick={() => run()}><Ico n="nav" />{busy ? tr('asBusy') : tr('asGo')}</button>
      {listening && <p className="mute">{tr('asListen')}</p>}
      {msg && <p>{msg}</p>}
      {!voiceAvailable() && !msg && <p className="mute">{tr('asKbHint')}</p>}
      <p className="mute">{tr('asNote')}</p>
    </>
  );
}
