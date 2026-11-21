import React, { useMemo, useRef, useState } from 'react';
import { R, INFO, lum } from './net.js';

const P = {
  map: <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14" />,
  nav: <path d="M12 3l7 17-7-4-7 4z" />,
  more: <><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  locate: <><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="1.8" fill="currentColor" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
  swap: <path d="M8 4v16M8 4L4 8M8 4l4 4M16 20V4M16 20l-4-4M16 20l4-4" />,
  star: <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.2l-5.6 3 1.1-6.2L3 9.6l6.2-.9z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  alert: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></>,
  ticket: <path d="M3 8a2 2 0 0 0 0 8v2a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-2a2 2 0 0 1 0-8V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1zM14 5v14" />,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />,
  access: <><circle cx="12" cy="4.5" r="1.7" /><path d="M7 8.5h10M12 8.5v5l-3 6M12 13.5l3 6" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
  share: <path d="M12 15V4M8 8l4-4 4 4M5 12v7h14v-7" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 8l9 6 9-6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  chevron: <path d="M9 6l6 6-6 6" />,
  play: <path d="M8 5v14l11-7z" fill="currentColor" />,
  pause: <path d="M8 5v14M16 5v14" strokeWidth="3.2" />,
  next: <path d="M5 5v14l9-7zM18 5v14" />,
  cube: <path d="M12 2l9 5v10l-9 5-9-5V7zM12 12l9-5M12 12v10M12 12L3 7" />,
  flat: <path d="M3 8l9-5 9 5-9 5zM3 13l9 5 9-5" />,
  gps: <><path d="M12 2l3.5 8.5L22 12l-6.5 1.5L12 22l-3.5-8.5L2 12l6.5-1.5z" /></>,
  sim: <><path d="M3 17h18M5 17V9a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v8M8 11h8" /><circle cx="8" cy="19.5" r="1" /><circle cx="16" cy="19.5" r="1" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></>,
  bulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />,
  vibrate: <><rect x="8" y="3" width="8" height="18" rx="2.5" /><path d="M4 8v8M20 8v8" /></>,
  building: <path d="M4 21V5l8-2v18M12 8l8 2v11M3 21h18M7 9h2M7 13h2M7 17h2M15 14h2M15 18h2" />,
};

export function Ico({ n, className }) {
  return <svg className={'i' + (className ? ' ' + className : '')} viewBox="0 0 24 24" aria-hidden="true">{P[n]}</svg>;
}

export function Badge({ line, big }) {
  const c = INFO[line].c;
  return <span className={'bdg ' + INFO[line].p + (big ? ' lg' : '')} style={{ background: c, color: lum(c) > 0.72 ? '#222' : '#fff' }}>{line}</span>;
}

export function Badges({ s, max }) {
  const l = max && s.lines.length > max ? s.lines.slice(0, max) : s.lines;
  return (
    <>
      {l.map((x) => <React.Fragment key={x}><Badge line={x} />{' '}</React.Fragment>)}
      {max && s.lines.length > max ? <small style={{ color: 'var(--mute)', fontWeight: 650 }}>+{s.lines.length - max}</small> : null}
    </>
  );
}

/* Input with a dropdown of station suggestions. The parent supplies the wrapper (icon, dot, clear button). */
export function SearchBox({ value, onChange, onPick, placeholder, store, ddTop }) {
  const [open, setOpen] = useState(false);
  const inp = useRef(null);

  const content = useMemo(() => {
    if (!open) return null;
    if (!value.trim()) {
      const rec = [];
      store.rec.forEach((r) => r.forEach((n) => { const s = R.byName(n); if (s && rec.indexOf(s) < 0) rec.push(s); }));
      const fav = store.fav.map((n) => R.byName(n)).filter(Boolean);
      const groups = [];
      if (fav.length) groups.push(['Favorites', fav.slice(0, 4)]);
      if (rec.length) groups.push(['Recent', rec.slice(0, 4)]);
      groups.push(['Popular', R.search('', 6)]);
      return groups.map((g) => ({ head: g[0], items: g[1] }));
    }
    return [{ head: null, items: R.search(value, 9) }];
  }, [open, value, store.fav, store.rec]);

  const pick = (s) => { setOpen(false); inp.current && inp.current.blur(); onPick(s); };

  return (
    <>
      <input
        ref={inp} type="text" value={value} placeholder={placeholder} autoComplete="off" enterKeyHint="search" spellCheck={false}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => { if (e.key === 'Enter') { const r = R.search(value, 1)[0]; if (r) pick(r); } }}
      />
      {open && content && (
        <div className="dd" style={{ top: ddTop }}>
          {content.map((g, gi) => (
            <React.Fragment key={gi}>
              {g.head && <div className="hd">{g.head}</div>}
              {g.items.length === 0 && <div className="it" style={{ color: 'var(--mute)' }}>No station found</div>}
              {g.items.map((s) => (
                <div className="it" key={g.head + s.i} onPointerDown={(e) => { e.preventDefault(); pick(s); }}>
                  <span className="nm">{s.name}</span><Badges s={s} max={3} />
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      )}
    </>
  );
}
