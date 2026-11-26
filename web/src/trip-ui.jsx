import React, { useEffect, useRef, useState } from 'react';
import { fetchTrip, fetchChange, placeOf } from './trip.js';
import { tr, fmtTime } from './i18n.js';
import { Ico, LineTag } from './ui.jsx';
import { changeTip } from './carriage.js';
import { ST } from './net.js';
import { CoachGuide } from './coach.jsx';
import { tripNotify, tripNotifyEnd } from './notify.js';

/* polls the live trip every 25 s; keeps the last good data when a refresh fails */
export function useTrip(active, route, li, nextName, destName, nextIdx) {
  const [st, setSt] = useState({ key: '', trip: null, change: null, state: 'loading' });
  const key = active && route && nextName ? route.from + '-' + route.to + '|' + li + '|' + nextName : '';
  useEffect(() => {
    if (!key) return undefined;
    let dead = false, timer = 0;
    const leg = key.split('|').slice(0, 2).join('|');
    const run = async () => {
      try {
        const trip = await fetchTrip(route, li, (nextIdx != null && placeOf(ST[nextIdx])) || nextName, placeOf(ST[route.to]) || destName);
        let change = null;
        if (trip.change) { try { change = await fetchChange(trip.change); } catch (e) { change = null; } }
        if (!dead) setSt({ key: leg, trip, change, state: 'ok' });
      } catch (e) {
        if (!dead) setSt((o) => (o.key === leg && o.trip ? { ...o, state: 'stale' } : { key: leg, trip: null, change: null, state: 'error' }));
      }
      if (!dead) timer = setTimeout(run, 25000);
    };
    run();
    return () => { dead = true; clearTimeout(timer); };
    // eslint-disable-next-line
  }, [key]);
  const leg = key.split('|').slice(0, 2).join('|');
  return st.key === leg ? st : { key: leg, trip: null, change: null, state: key ? 'loading' : 'off' };
}

export function useNow(ms) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}

const minTo = (ms, now) => Math.max(0, Math.ceil((ms - now) / 60000));
const loadKey = (l) => (!l ? '' : /exceptional|full/.test(l) ? 'crowd_full' : /very|high/.test(l) && !/low/.test(l) ? 'crowd_high' : /medium|mid/.test(l) || /low-to/.test(l) ? 'crowd_mid' : 'crowd_low');

/* final arrival (ms) and the stop-by-stop facts shown on the card; also used for the notification text */
export function tripFacts(st, info, route, now) {
  const t = st.trip, est = !t;
  const arr = t ? t.arr : now + route.minutes * 60000 * (1 - (info.pct || 0) / 100);
  const delay = t ? t.delay : 0;
  const legEnd = t ? t.legEnd : 0;
  return { est, arr, delay, legEnd, inMin: minTo(arr, now) };
}

export default function TripCard({ st, info, route, now, bridge }) {
  const [open, setOpen] = useState(false);
  const f = tripFacts(st, info, route, now), t = st.trip, ch = st.change, cg = t && t.change;
  const left = info.left, nextLeg = route.legs[info.li + 1];
  const off = left <= 0 ? tr('tripOffNow', { st: info.endName }) : (left === 1 ? tr('tripOff1') : tr('tripOffN', { n: left })) + ' ' + tr('tripOffAt', { st: info.endName });
  const tip = nextLeg ? changeTip(route.legs[info.li], nextLeg) : null;
  const lk = t ? loadKey(t.load) : '';
  const risk = ch && ch.status !== 'ok';
  return (
    <div className={'tripcard glass' + (open ? ' open' : '') + (risk ? ' risk' : '')}>
      <button className="tc-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="tc-eta"><small>{tr('tripArrive')}</small><b>{(f.est ? '~' : '') + fmtTime(f.arr)}</b></span>
        <span className="tc-mid">
          <span>{f.inMin <= 1 ? tr('inMin1') : tr('inMinN', { n: f.inMin })}</span>
          {!f.est && (f.delay >= 1 ? <em className="dl warn">{tr('tripDelay', { n: f.delay })}</em> : <em className="dl ok">{tr('tripOnTime')}</em>)}
          {!f.est && <i className="livedot" title={tr('tripLive')} />}
        </span>
        <span className="tc-off">{off}</span>
        <Ico n={open ? 'close' : 'train'} />
      </button>
      {open && (
        <div className="tc-body">
          {f.est && <p className="mute">{tr('tripEst')}</p>}
          {cg && (
            <div className={'tc-change' + (risk ? ' warn' : '')}>
              <div className="tc-row"><b>{tr('tripChangeAt', { st: cg.station })}</b>
                <span className={'tc-st ' + (ch ? ch.status : 'ok')}>{ch ? tr(ch.status === 'ok' ? 'connOk' : ch.status === 'tight' ? 'connTight' : 'connMissed') : tr('connOk')}</span></div>
              <div className="tc-row"><LineTag line={cg.line} /><span className="tc-dir">{cg.dir}{cg.platform ? ' · ' + tr('tripPlatform', { p: cg.platform }) : ''}</span>
                <span className="tc-time">{fmtTime(cg.dep)}{cg.delay >= 1 ? <em className="dl warn">+{cg.delay}</em> : null}</span></div>
              {ch && (ch.mine || ch.then) && (
                <div className="tc-row small">
                  {ch.mine && <span>{tr(risk ? 'connNext' : 'tripNext')}: <b>{fmtTime(ch.mine.when)}</b>{ch.mine.delay >= 1 ? ' (+' + ch.mine.delay + ')' : ''}{ch.mine.platform ? ' · ' + tr('tripPlatform', { p: ch.mine.platform }) : ''}</span>}
                  {ch.then && <span>{tr('tripAfter')}: <b>{fmtTime(ch.then.when)}</b></span>}
                </div>
              )}
              {cg.walkMin > 0 && <div className="tc-row small"><Ico n="walk" /><span>{tr('tripWalk', { n: cg.walkMin })}</span></div>}
              {tip && !tip.same && tip.ride && <CoachGuide pos={tip.ride} toward={route.legs[info.li].toward} color={route.legs[info.li].c} />}
              {tip && tip.same && <div className="tc-row small"><Ico n="train" /><span>{tip.text}</span></div>}
            </div>
          )}
          {lk && <div className="tc-row small"><Ico n="info" /><span>{tr('crowd')}: <b>{tr(lk)}</b></span></div>}
          {t && t.lifts.length > 0 && (
            <div className="tc-lifts"><b>{tr('liftNotice')}</b>{t.lifts.map((x, i) => <p key={i}>{x}</p>)}</div>
          )}
          {t && <p className="mute">{tr('tripUpdated', { t: fmtTime(t.at) })}</p>}
        </div>
      )}
    </div>
  );
}

/* the card plus its background work: live polling, ticking clock, lock screen notification, hand-over to the train marker */
export function TripLive({ info, route, onData }) {
  const st = useTrip(true, route, info.li, info.nextName, ST[route.to].name, info.nextIdx);
  const now = useNow(1000);
  useEffect(() => { onData && onData(st, info.li); }, [st, info.li]); // eslint-disable-line
  useEffect(() => () => tripNotifyEnd(), []);
  const f = tripFacts(st, info, route, now), cg = st.trip && st.trip.change, ch = st.change;
  const parts = [info.left <= 0 ? tr('notifOff', { st: info.endName }) : tr('notifNext', { st: info.nextName }), tr('notifArrive', { t: (f.est ? '~' : '') + fmtTime(f.arr) + (f.delay >= 1 ? ' (+' + f.delay + ')' : '') })];
  if (cg && info.left <= 3) parts.splice(1, 0, tr('notifChange', { line: cg.line }) + (cg.platform ? ' ' + tr('tripPlatform', { p: cg.platform }) : '') + ' ' + fmtTime(cg.dep) + (ch && ch.status !== 'ok' ? ' !' : ''));
  const text = parts.join(' · ');
  useEffect(() => { tripNotify(info.title, text); }, [info.title, text]); // eslint-disable-line
  return <TripCard st={st} info={info} route={route} now={now} />;
}
