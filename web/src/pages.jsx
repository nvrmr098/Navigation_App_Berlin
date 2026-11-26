import React, { useEffect, useMemo, useState } from 'react';
import { changeTip } from './carriage.js';
import { setLay } from './layoutstate.js';
const StationLayout = React.lazy(() => import('./layout.jsx'));
import { CoachGuide } from './coach.jsx';
import { meters, walkMin } from './walk.js';
import { loadStops } from './modestops.js';
import { TicketHelper, StationHelp, Alternatives, NightInfo, Assistant } from './extras.jsx';
import { POPULAR } from './popular.js';
import { VOICE_ASSISTANT } from './config.js';
import { R, ST, NET } from './net.js';
import { Badge, Badges, SearchBox, Ico, Logo, LineTag, BackBtn } from './ui.jsx';
import { tr, cnt, fmtTime, fmtDay, LANGS } from './i18n.js';
import { useBoard, MiniBoard, NextTrains, StationBoard, useDisruptions } from './live-ui.jsx';
import { pickTrains, PROD_GROUPS } from './live.js';
import { berlinParts, berlinMs, dayOffsetMs, pad } from './time.js';
import { distKm, getPositionOnce } from './geo.js';

const TAGS = { fastest: 'fastest', fewest: 'fewest', faster: 'fastest' };
const MODEWORD = { RE: 'modeRE', bus: 'modeBus', tram: 'modeTram', ferry: 'modeFerry' };
const fmtDist = (km) => (km < 1 ? Math.round(km * 1000 / 10) * 10 + ' m' : km.toFixed(1) + ' km');

/* when: { mode: 'now' | 'dep' | 'arr', ts } -> { dep, arr } in ms for a route of `min` minutes */
export function planTimes(when, min) {
  const now = Date.now();
  if (when.mode === 'dep') return { dep: when.ts, arr: when.ts + min * 60000 };
  if (when.mode === 'arr') return { dep: when.ts - min * 60000, arr: when.ts };
  return { dep: now, arr: now + min * 60000 };
}
export const whenLabel = (w) => (w.mode === 'now' ? tr('leaveNow') : (w.mode === 'dep' ? tr('departAt') : tr('arriveBy')) + ' ' + fmtDay(w.ts) + ' ' + fmtTime(w.ts));

function RouteCard({ fromPlace, toPlace, onModal, r, i, sel, when, onSelect, onShow, onStart, onShare, active }) {
  const gen = !!r.generic; // bus, tram or regional train in the route: live times come with the journey
  const t = planTimes(when, r.minutes), lg0 = r.legs[0], station = ST[lg0.stations[0]].name;
  // live board for the first station while this card is open
  const q = useMemo(() => {
    if (when.mode === 'arr') return { when: t.dep - 35 * 60000, results: 40, duration: 60 };
    if (when.mode === 'dep') return { when: when.ts, results: 40, duration: 90 };
    return { results: 40, duration: 90 };
  }, [when.mode, when.ts, t.dep]);
  const [st, reload] = useBoard(station, 'departures', active && sel && !gen, q);
  const picked = useMemo(() => {
    let list = pickTrains(st.items, lg0.line, lg0.toward);
    if (when.mode === 'arr') list = list.filter((d) => d.when <= t.dep + 60000).slice(-3);
    else list = list.filter((d) => d.when >= (when.mode === 'dep' ? when.ts : Date.now() - 30000)).slice(0, 3);
    return list;
  }, [st.items, lg0.line, lg0.toward, when.mode, when.ts, t.dep]);
  const liveFirst = picked.find((d) => !d.cancelled);
  // with a live first train the arrival time follows the real departure
  let dep = t.dep, arr = t.arr;
  if (when.mode !== 'arr' && liveFirst) { dep = liveFirst.when; arr = liveFirst.when + (r.minutes - lg0.waitMin) * 60000; }
  if (gen && r.dep) { dep = r.dep; arr = r.arr; }
  const sA = ST[lg0.stations[0]], sB = ST[r.legs[r.legs.length - 1].stations[r.legs[r.legs.length - 1].stations.length - 1]];
  const wStart = fromPlace ? Math.round(meters(fromPlace, sA) * 1.25) : 0, wEnd = toPlace ? Math.round(meters(toPlace, sB) * 1.25) : 0;
  if (wEnd) arr += walkMin(wEnd) * 60000;
  const tips = r.legs.map((l, k) => (k > 0 ? changeTip(r.legs[k - 1], l) : null));
  return (
    <div className={'rc glass' + (sel ? ' sel' : '')} onClick={onSelect} style={{ animationDelay: i * 70 + 'ms' }}>
      <div className="hd">
        <span className="tt">{r.minutes}<small>{tr('min')}</small></span><span style={{ flex: 1 }} />
        <span className={'tg' + (i === 0 ? ' hot' : '')}>{r.key === 'faster' ? tr('fasterVia', { m: r.modes.map((m) => tr(MODEWORD[m] || 'modeBus')).join(' + ') }) : tr(TAGS[r.key])}</span>
      </div>
      <div className="meta">
        {when.mode === 'now' && !liveFirst && !gen ? tr('arriveAbout') + ' ' + fmtTime(arr) : tr('leave') + ' ' + fmtTime(dep) + ' · ' + tr('arrive') + ' ' + fmtTime(arr)}
        {' · '}{r.transfers ? cnt('change', r.transfers) : tr('direct')}
        {r.key === 'faster' && r.save > 0 && <b className="svd"> · {tr('fasterSave', { n: r.save })}</b>}
      </div>
      <div className="vis">
        {r.legs.map((l, k) => <React.Fragment key={k}>{k > 0 && <span className="ar">&rsaquo;</span>}<Badge line={l.line} big /></React.Fragment>)}
      </div>
      {sel && (
        <>
          {!gen && <NextTrains st={{ ...st, items: picked }} line={lg0.line} />}
          <ul className="steps">
            {wStart > 60 && <li className="walkli" style={{ '--c': '#8a93aa' }}><span className="pin" /><b><Ico n="walk" className="s" />{tr('walkFrom', { m: walkMin(wStart), d: wStart >= 1000 ? (wStart / 1000).toFixed(1) + ' km' : wStart + ' m', place: fromPlace.me ? tr('yourLocation') : fromPlace.name, st: sA.name })}</b></li>}
            {r.legs.map((lg, li) => {
              const a = ST[lg.stations[0]], b = ST[lg.stations[lg.stations.length - 1]];
              return (
                <React.Fragment key={li}>
                  {lg.walkIn && <li className="walkli" style={{ '--c': '#8a93aa' }}><span className="pin" /><b><Ico n="walk" className="s" />{tr('walkBetween', { m: lg.walkIn.min, d: lg.walkIn.m >= 1000 ? (lg.walkIn.m / 1000).toFixed(1) + ' km' : lg.walkIn.m + ' m', st: a.name })}</b></li>}
                  <li style={{ '--c': lg.c }}><span className="pin" /><b>{li === 0 ? tr('startAt') : tr('changeAt')} {a.name}{gen && lg.dep ? ' · ' + fmtTime(lg.dep) : ''}{gen && lg.platform ? ' · ' + tr('platform') + ' ' + lg.platform : ''}</b>
                    {li > 0 && <button className="chip tool laylink" onClick={(e) => { e.stopPropagation(); setLay(a.name, r.legs[li - 1].line, lg.line); onModal('layout'); }}><Ico n="building" className="s" />{tr('layTitle')}</button>}
                    {li > 0 && tips[li] && (tips[li].ride ? <CoachGuide pos={tips[li].ride} toward={r.legs[li - 1].toward} color={r.legs[li - 1].c} /> : <small className="tip"><Ico n="bulb" /><span>{tips[li].text}</span></small>)}
                    <small><Badge line={lg.line} /> {tr('towards')} {lg.toward} &middot; {cnt('stop', lg.stops)} &middot; {Math.round(lg.rideMin)} {tr('min')}</small>
                  </li>
                  {li === r.legs.length - 1 && <li style={{ '--c': '#ef4455' }}><span className="pin" /><b>{tr('arriveAt')} {b.name}</b></li>}
                  {li === r.legs.length - 1 && wEnd > 60 && <li className="walkli" style={{ '--c': '#8a93aa' }}><span className="pin" /><b><Ico n="walk" className="s" />{tr('walkTo2', { m: walkMin(wEnd), d: wEnd >= 1000 ? (wEnd / 1000).toFixed(1) + ' km' : wEnd + ' m', place: toPlace.name })}</b></li>}
                </React.Fragment>
              );
            })}
          </ul>
          {st.state === 'error' && <div className="acts" style={{ marginBottom: 8 }}><button className="btn alt sm" onClick={(e) => { e.stopPropagation(); reload(); }}><Ico n="refresh" />{tr('retry')}</button></div>}
          <div className="acts">
            <button className="btn alt sm sq" aria-label={tr('alTitle')} onClick={(e) => { e.stopPropagation(); onModal('alt'); }}><Ico n="refresh" /></button>
            <button className="btn alt sm sq" aria-label={tr('tkTitle')} onClick={(e) => { e.stopPropagation(); onModal('tkt'); }}><Ico n="ticket" /></button>
            <button className="btn alt sm sq" aria-label={tr('share')} onClick={(e) => { e.stopPropagation(); onShare(); }}><Ico n="share" /></button>
            <button className="btn sm" style={{ flex: 2 }} onClick={(e) => { e.stopPropagation(); onStart(); }}><Ico n="nav" />{tr('routeStart')}</button>
          </div>
        </>
      )}
    </div>
  );
}

export function NavPage({ onWalk, onModal, on, nav, fq, setFq, tq, setTq, store, when, onTime, onPickFrom, onPickTo, onSwap, onSelect, onShow, onStart, onShare, onChipStation, onChipTrip, onLocate, onBoard, onPlaces, onSetDest, onPickPlace, onBack, onReset, onSaveAs, onSaveCommute }) {
  const ready = nav.from && nav.to;
  const boardName = nav.from ? nav.from.name : nav.to ? nav.to.name : '';
  const mine = [];
  if (store.home) mine.push(['home', store.home]);
  if (store.work) mine.push(['work', store.work]);
  return (
    <section className={'page scroll' + (on ? ' on' : '')} id="pNav">
      <div className="pghead"><BackBtn onClick={onBack} /><h1><small>{tr('navSub')}</small>{tr('whereTo')}</h1>
        <button className="rstbtn" aria-label={tr('reset')} onClick={onReset} disabled={!fq && !tq && when.mode === 'now'}><Ico n="refresh" /><span>{tr('reset')}</span></button></div>
      <div className="panel glass">
        <div className="fld"><span className="pin2" />
          <SearchBox value={fq} onChange={setFq} onPick={onPickFrom} placeholder={tr('startStation')} store={store} ddTop={58} places />
          <button className="loc" aria-label={tr('useMyLocation')} onClick={onLocate}><Ico n="locate" /></button>
        </div>
        <div className="fld"><span className="pin2 b" />
          <SearchBox value={tq} onChange={setTq} onPick={onPickTo} placeholder={tr('destination')} store={store} ddTop={58} places />
        </div>
        <button id="swap" aria-label={tr('swap')} onClick={onSwap}><Ico n="swap" /></button>
      </div>

      {nav.to && (
        <div className="savebar">
          {['home', 'work'].map((k) => { const nm = nav.toPlace ? nav.toPlace.name : nav.to.name, on2 = store[k] === nm; return (
            <button key={k} className={'chip' + (on2 ? ' on' : '')} onClick={() => onSaveAs(k)}><Ico n={k} className="s" />{on2 ? tr('savedAs', { k: tr(k) }) : tr('saveAs', { k: tr(k) })}</button>
          ); })}
          {nav.from && nav.to && (() => { const has = (store.commutes || []).some((c) => c[0] === nav.from.name && c[1] === nav.to.name); return (
            <button className={'chip' + (has ? ' on' : '')} onClick={onSaveCommute}><Ico n="star" className="s" />{has ? tr('commuteSaved') : tr('commuteSave')}</button>
          ); })()}
        </div>
      )}
      <div className="qrow">
        <button className={'tpill glass' + (when.mode !== 'now' ? ' set' : '')} onClick={onTime}><Ico n="clock" />{whenLabel(when)}<Ico n="down" className="dn" /></button>
        <button className={'tpill glass optpill' + (store.step || store.bike ? ' set' : '')} aria-label={tr('optsTitle')} onClick={() => onModal('opts')}><Ico n="sliders" />{tr('opts')}{(store.step ? 1 : 0) + (store.bike ? 1 : 0) > 0 && <b className="nb">{(store.step ? 1 : 0) + (store.bike ? 1 : 0)}</b>}</button>
      </div>
      {!nav.to && (
        <div className="pins one">
          {['home', 'work'].map((k) => (
            <button key={k} className="chip" onClick={() => (store[k] ? onSetDest(store[k]) : onPlaces(k))}><Ico n={k} className="s" />{store[k] ? tr(k) : tr('set' + k[0].toUpperCase() + k.slice(1))}</button>
          ))}
          {(store.commutes || []).map((c) => <button key={c[0] + c[1]} className="chip" onClick={() => onChipTrip(c)}><Ico n="nav" className="s" />{c[0]} &rarr; {c[1]}</button>)}
          {store.fav.map((n) => <button key={n} className="chip" onClick={() => onSetDest(n)}><Ico n="star" className="s" />{n}</button>)}
        </div>
      )}

      {ready && nav.routes.length === 0 && <div className="empty">{tr('noRoute')}</div>}
      {ready && nav.routes.map((r, i) => (
        <RouteCard key={r.key + r.minutes + '|' + when.mode + when.ts + (nav.toPlace ? nav.toPlace.name : '') + (nav.fromPlace ? nav.fromPlace.name : '')} fromPlace={nav.fromPlace} toPlace={nav.toPlace} onModal={onModal} r={r} i={i} sel={i === nav.sel} when={when} active={on}
          onSelect={() => onSelect(i)} onShow={() => onShow(r)} onStart={() => onStart(r)} onShare={() => onShare(r)} />
      ))}
      {ready && nav.routes.length > 0 && <p className="note">{tr('estNote')}</p>}
      {ready && on && <Alternatives key={nav.from.name + '>' + nav.to.name} nav={nav} store={store} inline onStart={onStart} onWalk={onWalk} />}

      {boardName && <MiniBoard name={boardName} onMore={() => onBoard(boardName)} />}

      {!ready && (
        <div>
          {store.rec.length > 0 && <><div className="sec">{tr('recentTrips')}</div><div className="pins one">{store.rec.slice(0, 6).map((r, i) => <button key={i} className="chip" onClick={() => onChipTrip(r)}>{r[0]} &rarr; {r[1]}</button>)}</div></>}
          <div className="sec">{tr('popularStations')}</div>
          <div className="pins one">{R.search('', 8).map((s) => <button key={s.i} className="chip" onClick={() => onChipStation(s.name)}>{s.name}</button>)}</div>
          <div className="sec">{tr('popularPlaces')}</div>
          <div className="pins one">{POPULAR.map((pl) => <button key={pl.name} className="chip" onClick={() => onPickPlace(pl)}><Ico n="pinmark" className="s" />{pl.name}</button>)}</div>
          <p className="note">{tr('navHint')}</p>
        </div>
      )}
    </section>
  );
}

/* ---------- Nearby tab ---------- */
export function NearbyPage({ on, store, setStore, onBoard, onGo, onOnMap, onGoPlace, onModeMap, onModal, say, onBack }) {
  const [pos, setPos] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | asking | ok | denied | error
  const [modes, setModes] = useState({ tram: [], bus: [] });
  const find = async () => {
    setStatus('asking');
    try { const p = await getPositionOnce(); setPos(p); setStatus('ok'); } catch (e) { setStatus(e && e.code === 1 ? 'denied' : 'error'); }
  };
  useEffect(() => { if (on && status === 'idle') find(); /* eslint-disable-next-line */ }, [on]);
  useEffect(() => { if (on) { Promise.all([loadStops('tram'), loadStops('bus')]).then(([tram, bus]) => setModes({ tram, bus })).catch(() => {}); } }, [on]);
  const sec = useMemo(() => {
    if (!pos) return null;
    const near = (arr, n) => arr.map((s) => ({ s, km: distKm(pos.lat, pos.lng, s.lat, s.lng) })).sort((a, b) => a.km - b.km).slice(0, n);
    const rail = ST.map((s) => ({ ...s, kind: 'rail' }));
    const sb = ST.filter((s) => s.lines.some((l) => l[0] === 'S')), ub = ST.filter((s) => s.lines.some((l) => l[0] === 'U'));
    const all = near([...rail, ...modes.tram, ...modes.bus], 3);
    return { all, sb: near(sb, 3), ub: near(ub, 3), tram: near(modes.tram, 3), bus: near(modes.bus, 3) };
  }, [pos, modes]);
  const far = sec && sec.all.length && sec.all[0].km > 8;
  const toggleFav = (name) => setStore((o) => {
    const has = o.fav.indexOf(name) >= 0;
    say(has ? tr('favRemoved') : tr('favAdded'));
    return { ...o, fav: has ? o.fav.filter((x) => x !== name) : [name, ...o.fav] };
  });
  const Card = ({ s, km }) => {
    const rail = !s.kind || s.kind === 'rail', fav = store.fav.indexOf(s.name) >= 0;
    return (
      <div className="ncard glass">
        <div className="nt1"><b>{s.name}</b>
          {rail && <button className={'favb' + (fav ? ' on' : '')} aria-label={fav ? tr('unpin') : tr('pin')} onClick={() => toggleFav(s.name)}><Ico n="star" /></button>}</div>
        <div className="nt2">{rail ? <Badges s={s} max={6} /> : <span className="mlines">{s.lines.slice(0, 7).map((l) => <LineTag key={l} line={l} product={s.kind} />)}{s.lines.length > 7 ? <small>+{s.lines.length - 7}</small> : null}</span>}
          <span className="dist"><Ico n="walk" />{fmtDist(km)} &middot; {Math.max(1, Math.round(km * 1000 / 80))} {tr('min')}</span></div>
        <div className="acts">
          <button className="btn alt sm" onClick={() => (rail ? onBoard(s.name) : onBoard(s.name, { lat: s.lat, lng: s.lng }, true))}><Ico n="train" />{tr('departures')}</button>
          <button className="btn alt sm" onClick={() => (rail ? onOnMap(s.i) : onModeMap(s.kind))}><Ico n="map" />{tr('map')}</button>
          <button className="btn sm" onClick={() => (rail ? onGo(s) : onGoPlace({ name: s.name, lat: s.lat, lng: s.lng }))}><Ico n="nav" />{tr('goHere')}</button>
        </div>
      </div>
    );
  };
  const Sec = ({ ico, title, list }) => (
    <>
      <div className="nsec"><Ico n={ico} /><b>{title}</b></div>
      {list.length ? list.map(({ s, km }) => <Card key={s.kind + s.name + (s.i == null ? s.lat : s.i)} s={s} km={km} />) : <p className="mute" style={{ margin: '0 4px 10px' }}>{tr('shNone')}</p>}
    </>
  );
  return (
    <section className={'page scroll' + (on ? ' on' : '')} id="pNear">
      <div className="pghead"><BackBtn onClick={onBack} /><h1><small>{tr('nearSub')}</small>{tr('nearby')}</h1></div>
      <div className="nhead glass">
        <span className="rad"><i /><i /><Ico n="radar" /></span>
        <div className="tx"><b>{status === 'ok' ? (far ? tr('farAway') : tr('nearFound')) : status === 'asking' ? tr('searchingGps') : status === 'denied' ? tr('locDenied') : tr('tapFind')}</b>
          <small>{status === 'ok' && pos ? tr('accuracy') + ' ' + Math.round(pos.acc || 0) + ' m' : status === 'denied' ? tr('locDeniedHelp') : status === 'error' ? tr('gpsFail') : tr('nearHint')}</small></div>
        <button className="btn sm" onClick={find}><Ico n="refresh" />{tr('refresh')}</button>
      </div>
      <button className="nightcard glass" onClick={() => onModal('night')}><Ico n="moon" /><span><b>{tr('nightTitle')}</b><small>{tr('nightSub')}</small></span><Ico n="chevron" /></button>
      {sec && (
        <>
          <Sec ico="radar" title={tr('nearestAll')} list={sec.all} />
          <Sec ico="train" title="S-Bahn" list={sec.sb} />
          <Sec ico="train" title="U-Bahn" list={sec.ub} />
          <Sec ico="train" title={tr('netTram')} list={sec.tram} />
          <Sec ico="train" title={tr('netBus')} list={sec.bus} />
        </>
      )}
      {status === 'ok' && <p className="note">{tr('pinNote')}</p>}
    </section>
  );
}

/* ---------- More ---------- */
const sevText = (e) => e.title || e.text;

function Updates({ on }) {
  const [st, reload] = useDisruptions(on);
  const [all, setAll] = useState(false);
  const [f, setF] = useState('all');
  const items = st.data ? st.data.items : [];
  const hit = (e, k) => PROD_GROUPS[k].some((p) => e.prods.indexOf(p) > -1) || (!e.prods.length && ((k === 'S' && e.lines.some((l) => /^S\d/.test(l))) || (k === 'U' && e.lines.some((l) => /^U\d/.test(l))) || (k === 'RE' && e.lines.some((l) => /^(RE|RB|FEX)/.test(l)))));
  const shown = items.filter((e) => f === 'all' || hit(e, f));
  const count = (k) => items.filter((e) => hit(e, k)).length;
  const list = all ? shown : shown.slice(0, 4);
  return (
    <div className="upd glass">
      <div className="uh"><Ico n="alert" /><b>{tr('serviceUpdates')}</b><span style={{ flex: 1 }} />
        <button className="lnk" onClick={reload} aria-label={tr('refresh')}><Ico n="refresh" /></button></div>
      <div className="seg3 wide scrollx" style={{ marginBottom: 10 }}>
        {[['all', tr('all')], ['S', 'S-Bahn'], ['U', 'U-Bahn'], ['tram', tr('netTram')], ['bus', tr('netBus')], ['RE', 'RE/RB']].map((o) => <button key={o[0]} className={f === o[0] ? 'on' : ''} onClick={() => setF(o[0])}>{o[1]}{o[0] !== 'all' && st.data && count(o[0]) ? <i className="cn">{count(o[0])}</i> : null}</button>)}
      </div>
      {st.state === 'loading' && <div className="bstat"><span className="spin" />{tr('loading')}</div>}
      {st.state === 'error' && <div className="bstat err"><Ico n="wifioff" /><span>{tr('liveOff')}</span><button className="btn alt sm" onClick={reload}><Ico n="refresh" />{tr('retry')}</button></div>}
      {(st.state === 'ok' || st.state === 'stale') && shown.length === 0 && <div className="allgood"><Ico n="check" />{tr('noDisruptions')}</div>}
      {list.map((e) => (
        <div className="ui" key={e.id}>
          <div className="ul">{e.lines.length ? e.lines.slice(0, 6).map((l) => <LineTag key={l} line={l} product={e.prods.indexOf('bus') > -1 ? 'bus' : e.prods.indexOf('tram') > -1 ? 'tram' : e.prods.indexOf('regional') > -1 ? 'regional' : undefined} />) : <span className="bdg" style={{ background: '#8a93aa' }}>{tr('network')}</span>}</div>
          <b>{sevText(e)}</b>
          {e.text && e.text !== e.title && <p>{e.text.length > 240 && !all ? e.text.slice(0, 237) + '...' : e.text}</p>}
          {(e.from || e.to) && <small>{e.from ? tr('since') + ' ' + fmtDay(Date.parse(e.from)) + ' ' + fmtTime(Date.parse(e.from)) : ''}{e.to ? ' · ' + tr('until') + ' ' + fmtDay(Date.parse(e.to)) + ' ' + fmtTime(Date.parse(e.to)) : ''}</small>}
        </div>
      ))}
      {shown.length > 4 && <button className="btn alt sm" style={{ width: '100%', marginTop: 8 }} onClick={() => setAll(!all)}>{all ? tr('showLess') : tr('showAll') + ' (' + shown.length + ')'}</button>}
      {st.data && st.data.cancelled > 0 && <p className="mute" style={{ marginTop: 8 }}>{cnt('cancelledTrips', st.data.cancelled)}</p>}
      <p className="mute" style={{ marginTop: 8 }}>{st.data ? tr('updated') + ' ' + fmtTime(st.data.at) + ' · ' : ''}{tr('liveSrc')}</p>
    </div>
  );
}

export function MorePage({ on, store, setStore, open, toast, gpsStatus, onBack }) {
  const flip = (k, msg) => () => { setStore((s) => ({ ...s, [k]: !s[k] })); if (msg) toast(msg); };
  const Row = ({ ico, title, sub, onClick, soon }) => (
    <button className="li" onClick={onClick}><span className="ico"><Ico n={ico} /></span><span className="tx">{title}{sub && <small>{sub}</small>}</span>{soon ? <span className="soon">{tr('soon')}</span> : <span className="ch"><Ico n="chevron" /></span>}</button>
  );
  const Tgl = ({ k, label, msg }) => <button className={'tgl' + (store[k] ? ' on' : '')} role="switch" aria-checked={!!store[k]} aria-label={label} onClick={flip(k, msg)} />;
  const gpsText = tr('gps_' + gpsStatus);
  const [openG, setOpenG] = useState(null);
  const Group = ({ id, ico, title, sub, children }) => { const o = openG === id; return (
    <div className={'list glass grp' + (o ? ' open' : '')}>
      <button className="li grphead" aria-expanded={o} onClick={() => setOpenG(o ? null : id)}><span className="ico"><Ico n={ico} /></span><span className="tx">{title}<small>{sub}</small></span><span className="ch"><Ico n="chevron" /></span></button>
      {o && <div className="grpbody">{children}</div>}
    </div>
  ); };
  const lang = LANGS.find((l) => l.id === store.lang) || LANGS[0];
  const saved = (store.home ? 1 : 0) + (store.work ? 1 : 0) + store.fav.length;
  return (
    <section className={'page scroll' + (on ? ' on' : '')} id="pMore">
      <div className="pghead"><BackBtn onClick={onBack} /><h1><small>{tr('moreSub')}</small>{tr('more')}</h1></div>
      <div className="hero glass">
        <div className="logo2"><Logo size={58} id="hl" /></div>
        <div><b>Bearline</b><span>{tr('tagline')}</span></div>
      </div>

      <Updates on={on} />

      <Group id="saved" ico="home" title={tr('gSaved')} sub={tr('gSavedSub')}>
        <Row ico="home" title={tr('savedPlaces')} sub={saved ? cnt('saved', saved) : tr('savedNone')} onClick={() => open('places')} />
        <Row ico="clock" title={tr('recentTrips')} sub={store.rec.length ? store.rec[0][0] + ' → ' + store.rec[0][1] : tr('none')} onClick={() => open('rec')} />
        <Row ico="ticket" title={tr('tkTitle')} sub={tr('tkSub')} onClick={() => open('tkt')} />
        <Row ico="ticket" title={tr('tickets')} sub={tr('zonesSub')} onClick={() => open('tic')} />
      </Group>
      <Group id="plan" ico="nav" title={tr('gPlan')} sub={tr('gPlanSub')}>
        {VOICE_ASSISTANT && <Row ico="mic" title={tr('asTitle')} sub={tr('asSub')} onClick={() => open('assist')} />}
        <Row ico="building" title={tr('shTitle')} sub={tr('shSub')} onClick={() => open('sthelp')} />
        <Row ico="refresh" title={tr('alTitle')} sub={tr('alSub')} onClick={() => open('alt')} />
        <Row ico="moon" title={tr('nightTitle')} sub={tr('nightSub')} onClick={() => open('night')} />
        <Row ico="share" title={tr('shareTrip')} sub={tr('shareTripSub')} onClick={() => open('trip')} />
      </Group>
      <Group id="look" ico="eye" title={tr('gLook')} sub={tr('gLookSub', { theme: tr('th' + (store.theme || 'auto')[0].toUpperCase() + (store.theme || 'auto').slice(1)), lang: lang.name })}>
        <div className="skins" role="radiogroup" aria-label={tr('skinTitle')}>
          {['classic', 'neon', 'modern'].map((k) => (
            <button key={k} role="radio" aria-checked={(store.skin || 'classic') === k} className={'skin sk-' + k + ((store.skin || 'classic') === k ? ' on' : '')} onClick={() => setStore((s) => ({ ...s, skin: k }))}>
              <i /><b>{tr('skin_' + k)}</b><small>{tr('skin_' + k + '_sub')}</small>
            </button>
          ))}
        </div>
        <div className="li"><span className="ico"><Ico n="moon" /></span><span className="tx">{tr('appearance')}</span>
          <div className="seg3">{['auto', 'light', 'dark'].map((t) => <button key={t} className={store.theme === t ? 'on' : ''} onClick={() => setStore((s) => ({ ...s, theme: t }))}>{tr('theme_' + t)}</button>)}</div>
        </div>
        <Row ico="globe" title={tr('language')} sub={lang.name} onClick={() => open('lang')} />
        <div className="li"><span className="ico"><Ico n="map" /></span><span className="tx">{tr('labels')}<small>{tr('labelsSub')}</small></span><Tgl k="lbl" label={tr('labels')} /></div>
        <div className="li"><span className="ico"><Ico n="building" /></span><span className="tx">{tr('real3d')}<small>{tr('real3dSub')}</small></span><Tgl k="real3d" label={tr('real3d')} /></div>
        <div className="li"><span className="ico"><Ico n="walk" /></span><span className="tx">{tr('reduceMotion')}<small>{tr('reduceMotionSub')}</small></span><Tgl k="reduceMotion" label={tr('reduceMotion')} /></div>
      </Group>
      <Group id="move" ico="walk" title={tr('gMove')} sub={tr('gMoveSub')}>
        <div className="li"><span className="ico"><Ico n="bike" /></span><span className="tx">{tr('bikeMode')}<small>{tr('bikeModeSub')}</small></span><Tgl k="bike" label={tr('bikeMode')} /></div>
        <div className="li"><span className="ico"><Ico n="access" /></span><span className="tx">{tr('stepFree')}<small>{tr('stepFreeSub')}</small></span><Tgl k="step" label={tr('stepFree')} msg={tr('stepFreeMsg')} /></div>
        <div className="li"><span className="ico"><Ico n="bulb" /></span><span className="tx">{tr('awake')}<small>{tr('awakeSub')}</small></span><Tgl k="awake" label={tr('awake')} /></div>
        <div className="li"><span className="ico"><Ico n="vibrate" /></span><span className="tx">{tr('haptics')}<small>{tr('hapticsSub')}</small></span><Tgl k="haptics" label={tr('haptics')} /></div>
      </Group>
      <Group id="priv" ico="lock" title={tr('gPrivacy')} sub={tr('gPrivacySub')}>
        <div className="li"><span className="ico"><Ico n="gps" /></span><span className="tx">{tr('location')}<small>{gpsText}</small></span></div>
        <Row ico="lock" title={tr('privacy')} sub={tr('privacySub')} onClick={() => open('priv')} />
      </Group>
      <div className="sec">{tr('comingSoon')}</div>
      <div className="list glass">
        <Row ico="ticket" title={tr('ticketsBuy')} sub={tr('ticketsBuySub')} soon onClick={() => toast(tr('plannedMsg'))} />
      </div>
      <Group id="about" ico="info" title={tr('gAbout')} sub={tr('gAboutSub')}>
        <Row ico="share" title={tr('shareApp')} onClick={() => open('share')} />
        <Row ico="mail" title={tr('feedback')} onClick={() => open('fb')} />
        <Row ico="info" title={tr('about')} sub={tr('version') + ' 0.6'} onClick={() => open('about')} />
      </Group>
    </section>
  );
}

/* ---------- time picker ---------- */
export function TimeSheet({ when, onApply }) {
  const nowP = berlinParts(Date.now());
  const init = when.mode === 'now' ? Date.now() + 10 * 60000 : when.ts;
  const ip = berlinParts(init);
  const [mode, setMode] = useState(when.mode);
  const [day, setDay] = useState(() => { const d0 = berlinParts(Date.now()); for (let k = 0; k < 7; k++) { const p = berlinParts(dayOffsetMs(Date.now(), k)); if (p.y === ip.y && p.m === ip.m && p.d === ip.d) return k; } return d0 ? 0 : 0; });
  const [hm, setHm] = useState(pad(ip.hh) + ':' + pad(ip.mm));
  const days = [0, 1, 2, 3, 4, 5, 6].map((k) => dayOffsetMs(Date.now(), k));
  const apply = () => {
    if (mode === 'now') return onApply({ mode: 'now', ts: 0 });
    const [h, m] = hm.split(':').map(Number), p = berlinParts(days[day]);
    onApply({ mode, ts: berlinMs(p.y, p.m, p.d, h || 0, m || 0) });
  };
  const opts = [['now', 'leaveNow', 'clock'], ['dep', 'departAt', 'play'], ['arr', 'arriveBy', 'check']];
  return (
    <>
      <h3>{tr('whenTitle')}</h3>
      <div className="tmodes">
        {opts.map((o) => <button key={o[0]} className={mode === o[0] ? 'on' : ''} onClick={() => setMode(o[0])}><Ico n={o[2]} />{tr(o[1])}</button>)}
      </div>
      {mode !== 'now' && (
        <>
          <div className="sec" style={{ marginTop: 16 }}>{tr('day')}</div>
          <div className="days">{days.map((d, k) => <button key={k} className={'chip' + (day === k ? ' on' : '')} onClick={() => setDay(k)}>{k === 0 ? tr('today') : k === 1 ? tr('tomorrow') : fmtDay(d)}</button>)}</div>
          <div className="sec">{mode === 'dep' ? tr('departAt') : tr('arriveBy')}</div>
          <input className="timein" type="time" value={hm} onChange={(e) => setHm(e.target.value)} />
          <p className="mute">{tr('timeNote')} {pad(nowP.hh)}:{pad(nowP.mm)}</p>
        </>
      )}
      <div style={{ marginTop: 16 }}><button className="btn" style={{ width: '100%' }} onClick={apply}><Ico n="check" />{tr('apply')}</button></div>
    </>
  );
}

function PlacesModal({ store, setStore, onPick, say }) {
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState('');
  const set = (k, s) => { setStore((o) => ({ ...o, [k]: s ? s.name : '', [k + 'At']: s && s.place ? { lat: s.lat, lng: s.lng } : null })); setEdit(null); setQ(''); say(tr('saved')); };
  const slot = (k) => (
    <div className="plc" key={k}>
      <span className="pi"><Ico n={k} /></span>
      <div className="tx" onClick={() => store[k] && onPick(store[k], store[k + 'At'])}><b>{tr(k)}</b><small>{store[k] || tr('notSet')}</small></div>
      <button className="btn alt sm" onClick={() => { setEdit(edit === k ? null : k); setQ(''); }}>{store[k] ? tr('change') : tr('set')}</button>
      {store[k] && <button className="btn alt sm sq" aria-label={tr('remove')} onClick={() => set(k, null)}><Ico n="close" /></button>}
      {edit === k && (
        <div className="sbox2"><SearchBox value={q} onChange={setQ} onPick={(s) => set(k, s)} placeholder={tr('searchAny')} store={{ ...store, fav: [], rec: [], home: '', work: '' }} ddTop={52} places /></div>
      )}
    </div>
  );
  return (
    <>
      <h3>{tr('savedPlaces')}</h3>
      {slot('home')}{slot('work')}
      <div className="sec" style={{ marginTop: 14 }}>{tr('favourites')}</div>
      {store.fav.length ? store.fav.map((n) => {
        const s = R.byName(n);
        return (
          <div className="plc" key={n}>
            <span className="pi"><Ico n="star" /></span>
            <div className="tx" onClick={() => onPick(n)}><b>{n}</b>{s && <small><Badges s={s} max={5} /></small>}</div>
            <button className="btn alt sm sq" aria-label={tr('remove')} onClick={() => setStore((o) => ({ ...o, fav: o.fav.filter((x) => x !== n) }))}><Ico n="close" /></button>
          </div>
        );
      }) : <p className="mute">{tr('favHint')}</p>}
    </>
  );
}

function OptionsSheet({ store, setStore, onModal }) {
  const T = ({ k, ico, title, sub }) => (
    <div className="li"><span className="ico"><Ico n={ico} /></span><span className="tx">{title}<small>{sub}</small></span><button className={'tgl' + (store[k] ? ' on' : '')} role="switch" aria-checked={!!store[k]} aria-label={title} onClick={() => setStore((s) => ({ ...s, [k]: !s[k] }))} /></div>
  );
  const Go = ({ ico, title, sub, kind }) => <button className="li" onClick={() => onModal(kind)}><span className="ico"><Ico n={ico} /></span><span className="tx">{title}<small>{sub}</small></span><span className="ch"><Ico n="chevron" /></span></button>;
  return (
    <div>
      <h2 className="mt">{tr('optsTitle')}</h2>
      <div className="sec">{tr('optsRoute')}</div>
      <div className="list glass">
        <T k="step" ico="access" title={tr('stepFree')} sub={tr('stepFreeSub')} />
        <T k="bike" ico="bike" title={tr('bikeMode')} sub={tr('bikeModeSub')} />
      </div>
      <div className="sec">{tr('optsTools')}</div>
      <div className="list glass">
        <Go kind="night" ico="moon" title={tr('nightTitle')} sub={tr('nightSub')} />
        <Go kind="tkt" ico="ticket" title={tr('tkTitle')} sub={tr('tkSub')} />
        <Go kind="sthelp" ico="building" title={tr('shTitle')} sub={tr('shSub')} />
      </div>
    </div>
  );
}

export function ModalContent({ kind, store, setStore, board, boardOpts, onFav, onTrip, onLang, onApplyTime, when, say, nav, stNames, onAssist, onCmd, onModal }) {
  switch (kind) {
    case 'tkt':
      return <TicketHelper nav={nav} />;
    case 'layout':
      return <React.Suspense fallback={null}><StationLayout /></React.Suspense>;
    case 'opts':
      return <OptionsSheet store={store} setStore={setStore} onModal={onModal} />;
    case 'sthelp':
      return <StationHelp store={store} names={stNames && stNames.length ? stNames : ['Alexanderplatz']} onLayout={(n) => { setLay(n); onModal('layout'); }} />;
    case 'alt':
      return <Alternatives nav={nav} store={store} />;
    case 'night':
      return <NightInfo store={store} names={stNames && stNames.length ? stNames : ['Alexanderplatz']} />;
    case 'assist':
      return <Assistant onGo={onAssist} say={say} store={store} onCmd={onCmd} />;
    case 'assistmic':
      return <Assistant onGo={onAssist} say={say} store={store} onCmd={onCmd} auto />;
    case 'places':
      return <PlacesModal store={store} setStore={setStore} onPick={onFav} say={say} />;
    case 'board':
      return <StationBoard name={board} at={boardOpts && boardOpts.at} all={boardOpts && boardOpts.all} />;
    case 'time':
      return <TimeSheet when={when} onApply={onApplyTime} />;
    case 'lang':
      return (<><h3>{tr('language')}</h3>{LANGS.map((l) => (
        <button key={l.id} className="li" style={{ paddingLeft: 0, paddingRight: 0 }} onClick={() => onLang(l.id)}>
          <span className="tx">{l.name}<small>{l.en}</small></span>{store.lang === l.id && <Ico n="check" className="ok" />}
        </button>))}</>);
    case 'rec':
      return (<><h3>{tr('recentTrips')}</h3>{store.rec.length ? store.rec.map((r, i) => <div key={i} className="li" onClick={() => onTrip(r)} style={{ paddingLeft: 0, paddingRight: 0 }}><span className="tx">{r[0]} &rarr; {r[1]}</span></div>) : <p className="mute">{tr('recEmpty')}</p>}</>);
    case 'tic':
      return (<><h3>{tr('tickets')}</h3><p>{tr('ticP1')}</p>
        <table className="z"><tbody><tr><th>{tr('zone')}</th><th>{tr('area')}</th></tr><tr><td><b>A</b></td><td>{tr('zoneA')}</td></tr><tr><td><b>B</b></td><td>{tr('zoneB')}</td></tr><tr><td><b>C</b></td><td>{tr('zoneC')}</td></tr></tbody></table>
        <p>{tr('ticP2')}</p><p className="mute">{tr('ticP3')}</p></>);
    case 'fb':
      return (<><h3>{tr('feedback')}</h3><p>{tr('fbText')}</p></>);
    case 'priv':
      return (<><h3>{tr('privacy')}</h3><p>{tr('privP1')}</p><p>{tr('privP3')}</p><p className="mute">{tr('privP2')}</p></>);
    case 'about':
      return (<><h3>{tr('aboutTitle')}</h3><p>{tr('aboutP1')}</p>
        <p className="mute">{NET.credit}</p>
        <p className="mute">{tr('credTips')}</p>
        <p className="mute">{tr('credLive')}</p>
        <p className="mute">{tr('cred3d')}</p>
        <p className="mute">{tr('credLegal')}</p>
        <p className="mute">{tr('credNote')}</p></>);
    default:
      return null;
  }
}
