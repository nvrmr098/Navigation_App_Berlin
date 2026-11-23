import React, { useEffect, useMemo, useRef, useState } from 'react';
import { R, INFO, lum } from './net.js';
import { tr } from './i18n.js';
import { geocode } from './walk.js';

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
  warn: <path d="M12 3l10 18H2zM12 10v5M12 18h.01" />,
  bell: <path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4" />,
  arrowup: <path d="M12 19V5M5 12l7-7 7 7" />,
  uturn: <path d="M8 20V9a4 4 0 0 1 8 0v8M12 13l4 4 4-4" />,
  pinmark: <><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.4" /></>,
  home: <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />,
  work: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></>,
  train: <><rect x="5" y="3" width="14" height="14" rx="3.5" /><path d="M5 11h14M8.5 21l2-4M15.5 21l-2-4" /><circle cx="9" cy="14" r=".6" fill="currentColor" /><circle cx="15" cy="14" r=".6" fill="currentColor" /></>,
  refresh: <path d="M20 11a8 8 0 0 0-14.5-3.5M4 4v4h4M4 13a8 8 0 0 0 14.5 3.5M20 20v-4h-4" />,
  radar: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 12l6-6" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  bot: <><rect x="4" y="8" width="16" height="11" rx="4" /><path d="M12 8V4M9 13v1.5M15 13v1.5" /><circle cx="12" cy="3.5" r="1" /></>,
  wifioff: <path d="M3 3l18 18M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 3-2M12 20h.01M19 12.9a10 10 0 0 0-5-2.8" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  down: <path d="M6 9l6 6 6-6" />,
  walk: <><circle cx="13" cy="4.5" r="1.8" /><path d="M9 21l2-6-2-3 2-5 3 2 2 3M13 9l-4 3" /></>,
  building: <path d="M4 21V5l8-2v18M12 8l8 2v11M3 21h18M7 9h2M7 13h2M7 17h2M15 14h2M15 18h2" />,
  map2: <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />,
};


export function Ico({ n, className }) {
  return <svg className={'i' + (className ? ' ' + className : '')} viewBox="0 0 24 24" aria-hidden="true">{P[n]}</svg>;
}

/* Bearline logo: a bear head inside the oval Ring */
export function Logo({ size = 96, id = 'lg' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Bearline">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6d7cff" /><stop offset="1" stopColor="#22c4ff" /></linearGradient>
      </defs>
      <ellipse cx="60" cy="60" rx="54" ry="42" fill="none" stroke={'url(#' + id + ')'} strokeWidth="5" />
      <circle cx="43" cy="42" r="9" fill="#fff" /><circle cx="77" cy="42" r="9" fill="#fff" />
      <circle cx="43" cy="42" r="4.2" fill={'url(#' + id + ')'} /><circle cx="77" cy="42" r="4.2" fill={'url(#' + id + ')'} />
      <circle cx="60" cy="63" r="25" fill="#fff" />
      <ellipse cx="60" cy="73" rx="11" ry="8.2" fill="#d8e4f7" />
      <ellipse cx="60" cy="69.5" rx="4" ry="3" fill="#0e1220" />
      <circle cx="50" cy="58" r="3" fill="#0e1220" /><circle cx="70" cy="58" r="3" fill="#0e1220" />
      <path d="M60 72.5v3.5M55.5 77.5q4.5 3 9 0" fill="none" stroke="#0e1220" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Badge({ line, big }) {
  const inf = INFO[line] || { c: /^(M?\d|RE|RB)/.test(line) ? (/^R/.test(line) ? '#d6001c' : /^M?\d{1,2}$/.test(line) ? '#c8102e' : '#a5027d') : '#6b7280', p: 'o' };
  const c = inf.c;
  return <span className={'bdg ' + inf.p + (big ? ' lg' : '')} style={{ background: c, color: lum(c) > 0.72 ? '#222' : '#fff' }}>{line}</span>;
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

// a badge for a line name that may not exist in our data (live data can contain extras)
export function LineTag({ line, product }) {
  if (INFO[line]) return <Badge line={line} />;
  return <span className="bdg" style={{ background: product === 'subway' ? '#1670b8' : product === 'bus' ? '#a5027d' : product === 'tram' ? '#d6001c' : product === 'regional' ? '#e30613' : '#3d9a4a' }}>{line}</span>;
}

/* Input with a dropdown of station suggestions. The parent supplies the wrapper (icon, dot, clear button). */
export function SearchBox({ value, onChange, onPick, placeholder, store, ddTop, places }) {
  const [open, setOpen] = useState(false);
  const [pl, setPl] = useState([]);
  useEffect(() => {
    if (!places || !open || value.trim().length < 3) { setPl([]); return undefined; }
    let dead = false; const t = setTimeout(() => { geocode(value).then((r) => { if (!dead) setPl(r); }).catch(() => {}); }, 400);
    return () => { dead = true; clearTimeout(t); };
  }, [value, open, places]);
  const inp = useRef(null);

  const content = useMemo(() => {
    if (!open) return null;
    if (!value.trim()) {
      const rec = [];
      store.rec.forEach((r) => r.forEach((n) => { const s = R.byName(n); if (s && rec.indexOf(s) < 0) rec.push(s); }));
      const mine = [];
      if (store.home) mine.push([R.byName(store.home), 'home']);
      if (store.work) mine.push([R.byName(store.work), 'work']);
      store.fav.forEach((n) => mine.push([R.byName(n), 'star']));
      const groups = [];
      const pins = mine.filter((m) => m[0]);
      if (pins.length) groups.push([tr('saved'), pins.slice(0, 6).map((m) => m[0]), pins.slice(0, 6).map((m) => m[1])]);
      if (rec.length) groups.push([tr('recent'), rec.slice(0, 4)]);
      groups.push([tr('popular'), R.search('', 6)]);
      return groups.map((g) => ({ head: g[0], items: g[1], icons: g[2] }));
    }
    return [{ head: null, items: R.search(value, 9) }];
  }, [open, value, store.fav, store.rec, store.home, store.work, store.lang]);

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
              {g.items.length === 0 && !(places && pl.length) && <div className="it" style={{ color: 'var(--mute)' }}>{tr('noStation')}</div>}
              {g.items.map((s, k) => (
                <div className="it" key={g.head + s.i + k} onPointerDown={(e) => { e.preventDefault(); pick(s); }}>
                  {g.icons && <Ico n={g.icons[k]} className="pl" />}
                  <span className="nm">{s.name}</span><Badges s={s} max={3} />
                </div>
              ))}
            </React.Fragment>
          ))}
          {places && pl.length > 0 && <div className="hd">{tr('places')}</div>}
          {places && pl.map((p, k) => (
            <div className="it" key={'pl' + k} onPointerDown={(e) => { e.preventDefault(); pick(p); }}>
              <Ico n="pinmark" className="pl" /><span className="nm">{p.name}{p.sub ? <small className="sub"> {p.sub}</small> : null}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* Local Berlin time, always Europe/Berlin whatever the phone says */
export function BerlinClock({ lang }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const f = (o) => new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : lang, { timeZone: 'Europe/Berlin', hour12: false, ...o }).format(now);
  return (
    <div className="bclock glass" aria-label={tr('berlinTime')}>
      <b>{f({ hour: '2-digit', minute: '2-digit' })}<i>{String(new Date(now).getSeconds()).padStart(2, '0')}</i></b>
      <small>{tr('berlin')} &middot; {f({ weekday: 'short', day: 'numeric', month: 'short' })}</small>
    </div>
  );
}

/* Start screen: logo, name, orbiting rings and a segmented progress bar. About 3.8 seconds. */
export function Splash({ onDone }) {
  const [pct, setPct] = useState(0);
  const [out, setOut] = useState(false);
  useEffect(() => {
    const T = 3500, t0 = performance.now(); let raf = 0, closed = false;
    const loop = (now) => {
      const x = Math.min(1, (now - t0) / T), e = x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
      setPct(Math.round(e * 100));
      if (x < 1) raf = requestAnimationFrame(loop);
      else if (!closed) { closed = true; setTimeout(() => setOut(true), 250); setTimeout(onDone, 800); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);
  const stage = pct < 28 ? 'splash1' : pct < 60 ? 'splash2' : pct < 92 ? 'splash3' : 'splash4';
  const on = Math.round(pct / 100 * 28);
  return (
    <div className={'splash' + (out ? ' out' : '')} role="status" aria-label="Bearline">
      <div className="sgrid" /><div className="sscan" />
      <div className="sorb">
        <svg className="ring r1" viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" /></svg>
        <svg className="ring r2" viewBox="0 0 200 200"><circle cx="100" cy="100" r="78" /></svg>
        <svg className="ring r3" viewBox="0 0 200 200"><circle cx="100" cy="100" r="64" /></svg>
        <span className="dot d1" /><span className="dot d2" />
        <div className="slogo"><Logo size={104} id="sl" /></div>
      </div>
      <h1 className="sname">Bearline</h1>
      <p className="stag">{tr('tagline')}</p>
      <div className="sbar" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} className={i < on ? 'on' : ''} />)}</div>
      <div className="sinfo"><span>{tr(stage)}</span><b>{pct}%</b></div>
    </div>
  );
}
