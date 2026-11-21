import React, { useMemo, useRef, useState } from 'react';
import { R, INFO, lum } from './net.js';

export function Badge({ line }) {
  const c = INFO[line].c;
  return <span className={'bdg ' + INFO[line].p} style={{ background: c, color: lum(c) > 0.72 ? '#222' : '#fff' }}>{line}</span>;
}

export function Badges({ s, max }) {
  const l = max && s.lines.length > max ? s.lines.slice(0, max) : s.lines;
  return (
    <>
      {l.map((x) => <React.Fragment key={x}><Badge line={x} />{' '}</React.Fragment>)}
      {max && s.lines.length > max ? <small style={{ color: 'var(--mute)' }}>+{s.lines.length - max}</small> : null}
    </>
  );
}

/* Input with a dropdown of station suggestions. The parent supplies the wrapper (icon, dot, clear button). */
export function SearchBox({ value, onChange, onPick, placeholder, store, ddTop, inputId }) {
  const [open, setOpen] = useState(false);
  const inp = useRef(null);

  const content = useMemo(() => {
    if (!open) return null;
    const row = (s) => ({ s });
    if (!value.trim()) {
      const rec = [];
      store.rec.forEach((r) => r.forEach((n) => { const s = R.byName(n); if (s && rec.indexOf(s) < 0) rec.push(s); }));
      const fav = store.fav.map((n) => R.byName(n)).filter(Boolean);
      const groups = [];
      if (fav.length) groups.push(['Favorites', fav.slice(0, 4)]);
      if (rec.length) groups.push(['Recent', rec.slice(0, 4)]);
      groups.push(['Popular', R.search('', 6)]);
      return groups.map((g) => ({ head: g[0], items: g[1].map(row) }));
    }
    const list = R.search(value, 9);
    return [{ head: null, items: list.map(row) }];
  }, [open, value, store.fav, store.rec]);

  const pick = (s) => { setOpen(false); inp.current && inp.current.blur(); onPick(s); };

  return (
    <>
      <input
        id={inputId} ref={inp} type="text" value={value} placeholder={placeholder} autoComplete="off" enterKeyHint="search"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => { if (e.key === 'Enter') { const r = R.search(value, 1)[0]; if (r) pick(r); } }}
      />
      {open && content && (
        <div className="dd" style={{ display: 'block', top: ddTop }}>
          {content.map((g, gi) => (
            <React.Fragment key={gi}>
              {g.head && <div className="hd">{g.head}</div>}
              {g.items.length === 0 && <div className="it" style={{ color: 'var(--mute)' }}>No station found</div>}
              {g.items.map(({ s }) => (
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
