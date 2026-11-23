import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { board, disruptions } from './live.js';
import { tr, fmtTime, getLang } from './i18n.js';
import { LineTag, Ico } from './ui.jsx';

/* polls a live board; keeps the last good data when a refresh fails */
export function useBoard(name, kind, active, opts) {
  const [st, setSt] = useState({ state: 'loading', items: [], at: 0 });
  const key = name + '|' + (opts && opts.at ? opts.at.lat.toFixed(3) + opts.at.lng.toFixed(3) : '') + (opts && opts.all ? 'a' : '') + '|' + kind + '|' + (opts && opts.when ? Math.floor(opts.when / 60000) : '') + '|' + getLang();
  const tick = useRef(0);
  const load = useCallback(async () => {
    if (!name) return;
    const my = ++tick.current;
    try {
      const items = await board(name, kind, opts);
      if (my === tick.current) setSt({ state: 'ok', items, at: Date.now() });
    } catch (e) {
      if (my === tick.current) setSt((o) => ({ state: o.items.length ? 'stale' : 'error', items: o.items, at: o.at }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (!active || !name) return undefined;
    setSt({ state: 'loading', items: [], at: 0 }); load();
    const t = setInterval(load, 30000);
    return () => { clearInterval(t); tick.current++; };
  }, [key, active, load, name]);
  return [st, load];
}

export const minsUntil = (ms) => Math.round((ms - Date.now()) / 60000);

export function DelayTag({ d }) {
  if (d.cancelled) return <span className="dl bad">{tr('cancelled')}</span>;
  if (d.delay >= 1) return <span className="dl warn">+{d.delay}</span>;
  return <span className="dl ok">{tr('onTime')}</span>;
}

export function BoardRows({ items, kind, max }) {
  const list = max ? items.slice(0, max) : items;
  return (
    <div className="brows">
      {list.map((d, i) => {
        const m = minsUntil(d.when);
        return (
          <div className={'brow' + (d.cancelled ? ' x' : '')} key={d.line + d.when + i}>
            <span className="bt">{fmtTime(d.when)}</span>
            <LineTag line={d.line} product={d.product} />
            <span className="bd">{kind === 'arrivals' ? tr('from') + ' ' : ''}{d.dir}{d.platform ? <small> &middot; {tr('platform')} {d.platform}</small> : null}</span>
            <span className="bm">{d.cancelled ? '' : m <= 0 ? tr('now') : m + ' ' + tr('minShort')}</span>
            <DelayTag d={d} />
          </div>
        );
      })}
    </div>
  );
}

export function BoardStatus({ st, reload }) {
  if (st.state === 'loading') return <div className="bstat"><span className="spin" />{tr('loading')}</div>;
  if (st.state === 'error') return <div className="bstat err"><Ico n="wifioff" /><span>{tr('liveOff')}</span><button className="btn alt sm" onClick={reload}><Ico n="refresh" />{tr('retry')}</button></div>;
  if (st.state === 'ok' && !st.items.length) return <div className="bstat">{tr('noTrains')}</div>;
  return null;
}

/* full board with Departures / Arrivals tabs, shown in the modal */
export function StationBoard({ name, at, all }) {
  const [kind, setKind] = useState('departures');
  const bo = useMemo(() => ({ results: 14, duration: 90, at, all }), [name, at && at.lat, at && at.lng, all]);
  const [st, reload] = useBoard(name, kind, true, bo);
  return (
    <>
      <h3>{name}</h3>
      <div className="seg3 wide">
        <button className={kind === 'departures' ? 'on' : ''} onClick={() => setKind('departures')}>{tr('departures')}</button>
        <button className={kind === 'arrivals' ? 'on' : ''} onClick={() => setKind('arrivals')}>{tr('arrivals')}</button>
      </div>
      <BoardStatus st={st} reload={reload} />
      <BoardRows items={st.items} kind={kind} />
      <p className="mute">{st.at ? tr('updated') + ' ' + fmtTime(st.at) + ' · ' : ''}{tr('liveSrc')}</p>
    </>
  );
}

/* compact live card for the Navigate page */
export function MiniBoard({ name, onMore }) {
  const [st, reload] = useBoard(name, 'departures', true, { results: 12, duration: 60 });
  return (
    <div className="mini glass">
      <div className="mh"><Ico n="train" /><b>{tr('liveAt')} {name}</b><span style={{ flex: 1 }} /><button className="lnk" onClick={onMore}>{tr('all')}</button></div>
      <BoardStatus st={st} reload={reload} />
      <BoardRows items={st.items} kind="departures" max={4} />
    </div>
  );
}

/* next three trains for the first leg of a route */
export function NextTrains({ st, line }) {
  if (st.state === 'loading') return <div className="nt"><span className="spin" />{tr('loading')}</div>;
  if (st.state === 'error' || (st.state === 'stale' && !st.items.length)) return <div className="nt off"><Ico n="wifioff" />{tr('liveOff')}</div>;
  if (!st.items.length) return <div className="nt off">{tr('noTrains')}</div>;
  return (
    <div className="nt">
      <span className="ntl">{tr('nextTrains')}</span>
      {st.items.slice(0, 3).map((d, i) => (
        <span className={'ntc' + (d.delay >= 1 ? ' late' : '') + (d.cancelled ? ' x' : '')} key={i}>
          <b>{fmtTime(d.when)}</b>
          <small>{d.cancelled ? tr('cancelled') : d.delay >= 1 ? '+' + d.delay : minsUntil(d.when) <= 0 ? tr('now') : minsUntil(d.when) + ' ' + tr('minShort')}</small>
        </span>
      ))}
    </div>
  );
}

/* service updates for the More page */
export function useDisruptions(active) {
  const [st, setSt] = useState({ state: 'loading', data: null });
  const load = useCallback(async () => {
    try { setSt({ state: 'ok', data: await disruptions() }); } catch (e) { setSt((o) => ({ state: o.data ? 'stale' : 'error', data: o.data })); }
  }, []);
  useEffect(() => {
    if (!active) return undefined;
    load(); const t = setInterval(load, 300000);
    return () => clearInterval(t);
  }, [active, load]);
  return [st, load];
}
