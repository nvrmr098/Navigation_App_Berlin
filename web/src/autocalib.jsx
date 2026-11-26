/* One tap calibration panel: shows the figure eight, listens to the sensors and the GPS and finishes by itself (see startAutoCalib). */
import React, { useEffect, useRef, useState } from 'react';
import { tr } from './i18n.js';
import { startAutoCalib } from './calibrate.js';
import './v10.css';

const EIGHT = 'M60 30C48 10 14 10 14 30s34 20 46 0 46-20 46 0-34 20-46 0z';
const msgOf = (r) => (r.accuracy == null ? tr('acResultNoAcc') : r.shiftM ? tr('acResultShift', { acc: r.accuracy, m: r.shiftM }) : tr('acResult', { acc: r.accuracy }));

export default function AutoCalibPanel({ opts, onDone, onCancel, extra }) {
  const [st, setSt] = useState({ p: 0, acc: null, fixes: 0, noMotion: false, err: '' });
  const [res, setRes] = useState(null);
  const h = useRef(null), alive = useRef(true), tm = useRef(0), cb = useRef(onDone);
  cb.current = onDone;
  const run = () => {
    clearTimeout(tm.current); if (h.current) h.current.stop();
    setRes(null); setSt({ p: 0, acc: null, fixes: 0, noMotion: false, err: '' });
    h.current = startAutoCalib({
      ...opts,
      onProgress: (s) => { if (alive.current) setSt(s); },
      onDone: (r) => {
        if (!alive.current) return;
        setRes(r); setSt((s) => ({ ...s, p: 1 }));
        if (r.ok) tm.current = setTimeout(() => { if (alive.current) cb.current(msgOf(r), r); }, 1600); // show the result for a moment, then close by itself
      },
    });
  };
  useEffect(() => { alive.current = true; run(); return () => { alive.current = false; clearTimeout(tm.current); if (h.current) h.current.stop(); }; /* eslint-disable-next-line */ }, []);
  const pct = Math.round(st.p * 100);
  return (
    <div className={'autocal' + (res ? (res.ok ? ' done' : ' fail') : '')} data-state={res ? (res.ok ? 'done' : 'fail') : 'run'}>
      <h3>{res ? tr(res.ok ? 'acDoneTitle' : 'acFailTitle') : tr('acTitle')}</h3>
      <div className="ac-eight" aria-hidden="true">
        <svg viewBox="0 0 120 60"><path d={EIGHT} /><circle r="4" cx="60" cy="30"><animateMotion dur="3s" repeatCount="indefinite" path={EIGHT} /></circle></svg>
      </div>
      {!res && <p className="ac-hint">{tr(st.noMotion ? 'acNoMotion' : 'acHint')}</p>}
      <div className="ac-bar"><i style={{ width: pct + '%' }} /></div>
      <div className="ac-stats"><span>GPS <b>{st.acc != null ? '±' + st.acc + ' m' : tr('acSearching')}</b></span><span>{tr('acMotion')} <b>{pct}%</b></span></div>
      {res && <p className="ac-res">{res.ok ? msgOf(res) : tr(res.reason === 'denied' ? 'acDenied' : 'acNoFix')}</p>}
      <div className="ac-acts">
        {res && !res.ok && <button className="btn" onClick={run}>{tr('acRetry')}</button>}
        <button className="btn alt" onClick={onCancel}>{tr(res && res.ok ? 'close' : 'cancel')}</button>
      </div>
      {extra}
    </div>
  );
}
