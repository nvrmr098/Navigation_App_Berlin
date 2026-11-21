import React from 'react';
import { R, ST, NET } from './net.js';
import { Badge, Badges, SearchBox } from './ui.jsx';

const TAG = { fastest: 'Fastest', fewest: 'Fewer changes' };

export function NavPage({ on, nav, fq, setFq, tq, setTq, store, onPickFrom, onPickTo, onSwap, onSelect, onShow, onStart, onShare, onChipStation, onChipTrip, onStepInfo }) {
  const ready = nav.from && nav.to;
  return (
    <section className={'page' + (on ? ' on' : '')} id="pNav">
      <h2>Plan your trip</h2>
      <div className="panel">
        <div className="fld"><span className="dot" />
          <SearchBox value={fq} onChange={setFq} onPick={onPickFrom} placeholder="Start station" store={store} ddTop={52} />
        </div>
        <div className="fld"><span className="dot b" />
          <SearchBox value={tq} onChange={setTq} onPick={onPickTo} placeholder="Destination" store={store} ddTop={52} />
        </div>
        <button id="swap" aria-label="Swap" onClick={onSwap}>
          <svg viewBox="0 0 24 24"><path d="M8 4v16M8 4L4 8M8 4l4 4M16 20V4M16 20l-4-4M16 20l4-4" /></svg>
        </button>
        <div className="opt"><label><input type="checkbox" checked={false} onChange={onStepInfo} /> Step-free stations preferred (soon)</label></div>
      </div>

      {ready && nav.routes.length === 0 && <div className="empty">No route found between these stations.</div>}
      {ready && nav.routes.map((r, i) => {
        const sel = i === nav.sel;
        return (
          <div key={r.key} className={'rc' + (sel ? ' sel' : '')} onClick={() => onSelect(i)}>
            <div className="hd">
              <span className="tt">{r.minutes} min</span><span className="tg">{TAG[r.key]}</span><span style={{ flex: 1 }} />
              <span className="tg">{r.transfers ? r.transfers + (r.transfers > 1 ? ' changes' : ' change') : 'Direct'}</span>
            </div>
            <div className="vis">
              {r.legs.map((l, k) => <React.Fragment key={k}>{k > 0 && <span className="ar">&rsaquo;</span>}<Badge line={l.line} /></React.Fragment>)}
            </div>
            {sel && (
              <>
                <ul className="steps">
                  {r.legs.map((lg, li) => {
                    const a = ST[lg.stations[0]], b = ST[lg.stations[lg.stations.length - 1]];
                    return (
                      <React.Fragment key={li}>
                        <li style={{ '--c': lg.c }}><span className="pin" /><b>{li === 0 ? 'Start at ' : 'Change at '}{a.name}</b>
                          <small><Badge line={lg.line} /> towards {lg.toward} &middot; {lg.stops} {lg.stops === 1 ? 'stop' : 'stops'} &middot; about {Math.round(lg.rideMin)} min</small>
                        </li>
                        {li === r.legs.length - 1 && <li style={{ '--c': '#e5231b' }}><span className="pin" /><b>Arrive at {b.name}</b></li>}
                      </React.Fragment>
                    );
                  })}
                </ul>
                <div className="acts">
                  <button className="btn alt sm" onClick={(e) => { e.stopPropagation(); onShow(r); }}>Show on map</button>
                  <button className="btn sm" onClick={(e) => { e.stopPropagation(); onStart(r); }}>Start</button>
                  <button className="btn alt sm" onClick={(e) => { e.stopPropagation(); onShare(r); }}>Share</button>
                </div>
              </>
            )}
          </div>
        );
      })}
      {ready && nav.routes.length > 0 && (
        <p style={{ color: 'var(--mute)', fontSize: '12.5px', margin: '12px 4px' }}>
          Times are estimates from distances and typical waiting times, not a live timetable. Bus and tram connections are coming later.
        </p>
      )}

      {!ready && (
        <div>
          {store.fav.length > 0 && <><div className="sec">Favorites</div><div className="rec">{store.fav.map((n) => <button key={n} className="chip" onClick={() => onChipStation(n)}>&#9733; {n}</button>)}</div></>}
          {store.rec.length > 0 && <><div className="sec">Recent trips</div><div className="rec">{store.rec.map((r, i) => <button key={i} className="chip" onClick={() => onChipTrip(r)}>{r[0]} &rarr; {r[1]}</button>)}</div></>}
          <div className="sec">Popular stations</div>
          <div className="rec">{R.search('', 8).map((s) => <button key={s.i} className="chip" onClick={() => onChipStation(s.name)}>{s.name}</button>)}</div>
          <p style={{ color: 'var(--mute)', fontSize: 13, margin: '18px 4px' }}>
            Enter a start and a destination. The app finds the fastest way through the S-Bahn and U-Bahn network and shows every change.
          </p>
        </div>
      )}
    </section>
  );
}

export function MorePage({ on, store, setStore, open, toast }) {
  const toggle = (k, msg) => () => { setStore((s) => ({ ...s, [k]: !s[k] })); if (msg) toast(msg); };
  const Row = ({ ico, title, sub, onClick, right }) => (
    <button className="li" onClick={onClick}><span className="ico">{ico}</span><span className="tx">{title}{sub && <small>{sub}</small>}</span>{right || <span className="ch">&rsaquo;</span>}</button>
  );
  const Tgl = ({ k, label, msg }) => <button className={'tgl' + (store[k] ? ' on' : '')} aria-label={label} onClick={toggle(k, msg)} />;
  return (
    <section className={'page' + (on ? ' on' : '')} id="pMore">
      <h2>More</h2>
      <div className="list">
        <Row ico={'★'} title="Favorites" sub={store.fav.length ? store.fav.length + ' saved' : 'No favorites yet'} onClick={() => open('fav')} />
        <Row ico={'\u{1F55B}'} title="Recent trips" sub={store.rec.length ? store.rec[0][0] + ' to ' + store.rec[0][1] : 'None yet'} onClick={() => open('rec')} />
        <Row ico={'⚠'} title="Service updates" sub="Live disruptions (coming soon)" onClick={() => open('dis')} />
        <Row ico={'\u{1F3AB}'} title="Tickets and zones" sub="A, B, C explained" onClick={() => open('tic')} />
      </div>
      <div className="list">
        <div className="li"><span className="ico">{'\u{1F319}'}</span><span className="tx">Dark mode</span><Tgl k="dark" label="Dark mode" /></div>
        <div className="li"><span className="ico">{'♿'}</span><span className="tx">Step-free routes<small>Elevator aware routing (coming soon)</small></span><Tgl k="step" label="Step-free" msg="Step-free routing is planned for a later version" /></div>
        <div className="li"><span className="ico">{'\u{1F310}'}</span><span className="tx">Language<small>English (Deutsch soon)</small></span></div>
        <div className="li"><span className="ico">{'\u{1F4DC}'}</span><span className="tx">More station names<small>Show more names on the map</small></span><Tgl k="lbl" label="Labels" /></div>
      </div>
      <div className="list">
        <Row ico={'\u{1F4E4}'} title="Share this app" onClick={() => open('share')} />
        <Row ico={'✉'} title="Send feedback" onClick={() => open('fb')} />
        <Row ico={'ℹ'} title="About and data credits" sub="Version 0.3" onClick={() => open('about')} />
        <Row ico={'\u{1F512}'} title="Privacy" sub="No account, no tracking" onClick={() => open('priv')} />
      </div>
    </section>
  );
}

export function ModalContent({ kind, store, onFav, onTrip }) {
  switch (kind) {
    case 'fav':
      return (<><h3>Favorites</h3>{store.fav.length ? store.fav.map((n) => { const s = R.byName(n); return <div key={n} className="li" onClick={() => onFav(n)} style={{ paddingLeft: 0, paddingRight: 0 }}><span className="tx">{n}</span>{s && <Badges s={s} max={4} />}</div>; }) : <p className="mute">Tap a station on the map and press the star to save it here.</p>}</>);
    case 'rec':
      return (<><h3>Recent trips</h3>{store.rec.length ? store.rec.map((r, i) => <div key={i} className="li" onClick={() => onTrip(r)} style={{ paddingLeft: 0, paddingRight: 0 }}><span className="tx">{r[0]} &rarr; {r[1]}</span></div>) : <p className="mute">Your last trips will appear here.</p>}</>);
    case 'dis':
      return (<><h3>Service updates</h3><p>Live disruptions, construction and replacement buses will be shown here once a real time data source is connected.</p><p className="mute">Planned source: the VBB open data interface.</p></>);
    case 'tic':
      return (<><h3>Tickets and zones</h3><p>Berlin public transport uses three fare zones.</p>
        <table className="z"><tbody><tr><th>Zone</th><th>Area</th></tr><tr><td><b>A</b></td><td>Inside the S-Bahn ring and a bit beyond</td></tr><tr><td><b>B</b></td><td>The rest of Berlin up to the city border</td></tr><tr><td><b>C</b></td><td>Potsdam and the surrounding area, BER airport</td></tr></tbody></table>
        <p>One ticket works on S-Bahn, U-Bahn, tram, bus and the regional ferries within its zones. Tickets must be validated before the first ride unless bought as an app or mobile ticket.</p>
        <p className="mute">Always check current prices on the official BVG or VBB pages. Ticket sales inside this app may follow later.</p></>);
    case 'fb':
      return (<><h3>Send feedback</h3><p>Tell us what is confusing, missing or wrong. A feedback form and email address will be added before release.</p></>);
    case 'priv':
      return (<><h3>Privacy</h3><p>This version has no account, no tracking and no ads. Favorites and recent trips stay on your device.</p><p className="mute">A full privacy policy is required for the store listing and will be added before release.</p></>);
    case 'about':
      return (<><h3>About Berlin Route</h3><p>Version 0.3 (preview). A simplified S-Bahn and U-Bahn map with route finding for newcomers to Berlin.</p>
        <p className="mute">{NET.credit}</p>
        <p className="mute">Line and station names and colors are facts from open data. This map is an original drawing and is not the official BVG or S-Bahn Berlin map. This app is not affiliated with BVG, S-Bahn Berlin or VBB.</p>
        <p className="mute">Travel times are estimates. Lines S4 and S45 are not included yet.</p>
        <p className="mute">Built with React, Vite and three.js (MIT).</p></>);
    default:
      return null;
  }
}
