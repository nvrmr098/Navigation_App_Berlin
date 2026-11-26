/* The page that opens when you reach the destination: celebration, trip summary and the next useful steps. */
import React, { useEffect, useRef } from 'react';
import { tr, fmtTime } from './i18n.js';
import { Ico, Badge } from './ui.jsx';
import { ST } from './net.js';

function Celebrate() {
  const cv = useRef(null);
  useEffect(() => {
    let dead = false, raf = 0, stage = null;
    import('./mascot.js').then((M) => {
      if (dead || !cv.current) return;
      try { stage = new M.MascotStage3D(cv.current, { size: 200, pitch: 38 }); stage.setHeading(160, true); } catch (e) { return; }
      let last = performance.now(), t = 0;
      const loop = (n) => { if (dead) return; const dt = Math.min(0.05, (n - last) / 1000); last = n; t += dt; stage.setHeading(160 + Math.sin(t * 0.7) * 18, false); stage.frame(dt, { speed: 0, reduce: document.body.classList.contains('rm') }); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    }).catch(() => {});
    return () => { dead = true; cancelAnimationFrame(raf); if (stage) stage.destroy(); };
  }, []);
  return <canvas ref={cv} className="arrmascot" width={200} height={200} aria-hidden="true" />;
}

export default function ArrivePage({ route, place, onExits, onWalk, onLayout, onNew, onDone }) {
  const to = ST[route.to], changes = Math.max(0, route.legs.length - 1);
  const stops = route.legs.reduce((n, l) => n + Math.max(0, (l.stations ? l.stations.length : 1) - 1), 0);
  return (
    <div className="arrpage" role="dialog" aria-label={tr('arrived')}>
      <div className="arrcard glass">
        <Celebrate />
        <div className="arrtick"><Ico n="check" /></div>
        <h2>{tr('arrived')}</h2>
        <p className="arrname">{place ? place.name : to.name}</p>
        {place && <small className="mute">{tr('arrStation', { s: to.name })}</small>}
        <div className="arrstats">
          <div><b>{fmtTime(Date.now())}</b><small>{tr('arrAt')}</small></div>
          <div><b>{route.minutes}</b><small>{tr('arrMin')}</small></div>
          <div><b>{stops}</b><small>{tr('arrStops')}</small></div>
          <div><b>{changes}</b><small>{tr('arrChanges')}</small></div>
        </div>
        <div className="arrlines">{route.legs.map((l, i) => <Badge key={i} line={l.line} />)}</div>
        <div className="arracts">
          <button className="btn alt" onClick={onExits}><Ico n="door" />{tr('entTitle')}</button>
          <button className="btn alt" onClick={onLayout}><Ico n="building" />{tr('layTitle')}</button>
          {place && <button className="btn alt" onClick={onWalk}><Ico n="walk" />{tr('walkTo2s', { place: place.name })}</button>}
        </div>
        <button className="btn arrmain" onClick={onNew}><Ico n="nav" />{tr('arrNew')}</button>
        <button className="btn alt arrdone" onClick={onDone}>{tr('arrDone')}</button>
      </div>
    </div>
  );
}
