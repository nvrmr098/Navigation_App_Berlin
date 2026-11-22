import { changeTip } from './carriage.js';
import React from 'react';
import { R, ST, NET } from './net.js';
import { Badge, Badges, SearchBox, Ico } from './ui.jsx';

const TAG = { fastest: 'Fastest', fewest: 'Fewer changes' };
const clock = (min) => new Date(Date.now() + min * 60000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

export function NavPage({ on, nav, fq, setFq, tq, setTq, store, onPickFrom, onPickTo, onSwap, onSelect, onShow, onStart, onShare, onChipStation, onChipTrip, onLocate }) {
  const ready = nav.from && nav.to;
  return (
    <section className={'page scroll' + (on ? ' on' : '')} id="pNav">
      <h1><small>Berlin S-Bahn and U-Bahn</small>Where to?</h1>
      <div className="panel glass">
        <div className="fld"><span className="pin2" />
          <SearchBox value={fq} onChange={setFq} onPick={onPickFrom} placeholder="Start station" store={store} ddTop={58} />
          <button className="loc" aria-label="Use my location" onClick={onLocate}><Ico n="locate" /></button>
        </div>
        <div className="fld"><span className="pin2 b" />
          <SearchBox value={tq} onChange={setTq} onPick={onPickTo} placeholder="Destination" store={store} ddTop={58} />
        </div>
        <button id="swap" aria-label="Swap start and destination" onClick={onSwap}><Ico n="swap" /></button>
      </div>

      {ready && nav.routes.length === 0 && <div className="empty">No route found between these stations.</div>}
      {ready && nav.routes.map((r, i) => {
        const sel = i === nav.sel;
        return (
          <div key={r.key + r.minutes} className={'rc glass' + (sel ? ' sel' : '')} onClick={() => onSelect(i)} style={{ animationDelay: i * 70 + 'ms' }}>
            <div className="hd">
              <span className="tt">{r.minutes}<small>min</small></span><span style={{ flex: 1 }} />
              <span className={'tg' + (i === 0 ? ' hot' : '')}>{TAG[r.key]}</span>
            </div>
            <div className="meta">Arrive about {clock(r.minutes)} &middot; {r.transfers ? r.transfers + (r.transfers > 1 ? ' changes' : ' change') : 'Direct'}</div>
            <div className="vis">
              {r.legs.map((l, k) => <React.Fragment key={k}>{k > 0 && <span className="ar">&rsaquo;</span>}<Badge line={l.line} big /></React.Fragment>)}
            </div>
            {sel && (
              <>
                <ul className="steps">
                  {r.legs.map((lg, li) => {
                    const tips = r.legs.map((l, i) => (i > 0 ? changeTip(r.legs[i - 1], l) : null));
                    const a = ST[lg.stations[0]], b = ST[lg.stations[lg.stations.length - 1]];
                    return (
                      <React.Fragment key={li}>
                        <li style={{ '--c': lg.c }}><span className="pin" /><b>{li === 0 ? 'Start at ' : 'Change at '}{a.name}</b>
                          {li > 0 && tips[li] && <small className="tip"><Ico n="bulb" /><span>{tips[li].text}</span></small>}
                          <small><Badge line={lg.line} /> towards {lg.toward} &middot; {lg.stops} {lg.stops === 1 ? 'stop' : 'stops'} &middot; {Math.round(lg.rideMin)} min</small>
                        </li>
                        {li === r.legs.length - 1 && <li style={{ '--c': '#ef4455' }}><span className="pin" /><b>Arrive at {b.name}</b></li>}
                      </React.Fragment>
                    );
                  })}
                </ul>
                <div className="acts">
                  <button className="btn alt sm" onClick={(e) => { e.stopPropagation(); onShow(r); }}><Ico n="map" />Map</button>
                  <button className="btn alt sm sq" aria-label="Share" onClick={(e) => { e.stopPropagation(); onShare(r); }}><Ico n="share" /></button>
                  <button className="btn sm" style={{ flex: 2 }} onClick={(e) => { e.stopPropagation(); onStart(r); }}><Ico n="nav" />Start</button>
                </div>
              </>
            )}
          </div>
        );
      })}
      {ready && nav.routes.length > 0 && <p className="note">Times are estimates from distances and typical waiting times, not a live timetable. Bus and tram are coming later.</p>}

      {!ready && (
        <div>
          {store.fav.length > 0 && <><div className="sec">Favorites</div><div className="rec">{store.fav.map((n) => <button key={n} className="chip" onClick={() => onChipStation(n)}><Ico n="star" className="s" />{n}</button>)}</div></>}
          {store.rec.length > 0 && <><div className="sec">Recent trips</div><div className="rec">{store.rec.map((r, i) => <button key={i} className="chip" onClick={() => onChipTrip(r)}>{r[0]} &rarr; {r[1]}</button>)}</div></>}
          <div className="sec">Popular stations</div>
          <div className="rec">{R.search('', 8).map((s) => <button key={s.i} className="chip" onClick={() => onChipStation(s.name)}>{s.name}</button>)}</div>
          <p className="note">Pick a start and a destination, or tap the target icon to start from your location. The app finds the fastest way and shows every change.</p>
        </div>
      )}
    </section>
  );
}

export function MorePage({ on, store, setStore, open, toast, gpsStatus }) {
  const flip = (k, msg) => () => { setStore((s) => ({ ...s, [k]: !s[k] })); if (msg) toast(msg); };
  const Row = ({ ico, title, sub, onClick }) => (
    <button className="li" onClick={onClick}><span className="ico"><Ico n={ico} /></span><span className="tx">{title}{sub && <small>{sub}</small>}</span><span className="ch"><Ico n="chevron" /></span></button>
  );
  const Tgl = ({ k, label, msg }) => <button className={'tgl' + (store[k] ? ' on' : '')} role="switch" aria-checked={!!store[k]} aria-label={label} onClick={flip(k, msg)} />;
  const gpsText = { ok: 'Working', weak: 'Weak signal', searching: 'Searching', asking: 'Waiting for permission', denied: 'Permission denied', unavailable: 'Not available', idle: 'Starts when you navigate' }[gpsStatus] || '';
  return (
    <section className={'page scroll' + (on ? ' on' : '')} id="pMore">
      <h1><small>Settings and info</small>More</h1>
      <div className="hero glass">
        <div className="logo"><Ico n="nav" /></div>
        <div><b>Berlin Route</b><span>The S-Bahn and U-Bahn, made simple.</span></div>
      </div>
      <div className="list glass">
        <Row ico="star" title="Favorites" sub={store.fav.length ? store.fav.length + ' saved' : 'No favorites yet'} onClick={() => open('fav')} />
        <Row ico="clock" title="Recent trips" sub={store.rec.length ? store.rec[0][0] + ' to ' + store.rec[0][1] : 'None yet'} onClick={() => open('rec')} />
        <Row ico="alert" title="Service updates" sub="Live disruptions (coming soon)" onClick={() => open('dis')} />
        <Row ico="ticket" title="Tickets and zones" sub="A, B, C explained" onClick={() => open('tic')} />
      </div>
      <div className="list glass">
        <div className="li"><span className="ico"><Ico n="moon" /></span><span className="tx">Appearance</span>
          <div className="seg3">{['auto', 'light', 'dark'].map((t) => <button key={t} className={store.theme === t ? 'on' : ''} onClick={() => setStore((s) => ({ ...s, theme: t }))}>{t === 'auto' ? 'Auto' : t === 'light' ? 'Light' : 'Dark'}</button>)}</div>
        </div>
        <div className="li"><span className="ico"><Ico n="building" /></span><span className="tx">Real city in 3D<small>OpenStreetMap buildings, needs internet</small></span><Tgl k="real3d" label="Real city 3D" /></div>
        <div className="li"><span className="ico"><Ico n="bulb" /></span><span className="tx">Keep screen on<small>While navigating</small></span><Tgl k="awake" label="Keep screen on" /></div>
        <div className="li"><span className="ico"><Ico n="vibrate" /></span><span className="tx">Haptic alerts<small>Vibrate before you get off</small></span><Tgl k="haptics" label="Haptics" /></div>
        <div className="li"><span className="ico"><Ico n="map" /></span><span className="tx">More station names<small>Show more names on the map</small></span><Tgl k="lbl" label="Labels" /></div>
        <div className="li"><span className="ico"><Ico n="access" /></span><span className="tx">Step-free routes<small>Elevator aware routing (coming soon)</small></span><Tgl k="step" label="Step-free" msg="Step-free routing is planned for a later version" /></div>
        <div className="li"><span className="ico"><Ico n="gps" /></span><span className="tx">Location (GPS)<small>{gpsText}</small></span></div>
        <div className="li"><span className="ico"><Ico n="globe" /></span><span className="tx">Language<small>English (Deutsch soon)</small></span></div>
      </div>
      <div className="list glass">
        <Row ico="share" title="Share this app" onClick={() => open('share')} />
        <Row ico="mail" title="Send feedback" onClick={() => open('fb')} />
        <Row ico="info" title="About and data credits" sub="Version 0.4" onClick={() => open('about')} />
        <Row ico="lock" title="Privacy" sub="No account, no tracking" onClick={() => open('priv')} />
      </div>
    </section>
  );
}

export function StartSheet({ route, onGps, onDemo }) {
  if (!route) return null;
  return (
    <>
      <h3>Start navigation</h3>
      <p className="mute" style={{ marginTop: 0 }}>{ST[route.from].name} to {ST[route.to].name} &middot; {route.minutes} min</p>
      <button className="opt main" onClick={onGps}>
        <span className="ico"><Ico n="gps" /></span>
        <span><b>Live navigation with GPS</b><span>Follows you along the route in real time</span></span>
      </button>
      <button className="opt" onClick={onDemo}>
        <span className="ico"><Ico n="sim" /></span>
        <span><b>Demo ride</b><span>Preview the trip without moving</span></span>
      </button>
    </>
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
      return (<><h3>Privacy</h3><p>No account, no tracking and no ads. Favorites and recent trips stay on your device. Your GPS position is used only on your phone to follow the route and is never sent anywhere by this app.</p><p className="mute">The real city 3D view downloads map tiles from OpenFreeMap, which sees the map area you look at. A full privacy policy is required for the store listing and will be added before release.</p></>);
    case 'about':
      return (<><h3>About Berlin Route</h3><p>Version 0.4 (preview). A simplified S-Bahn and U-Bahn map with route finding and live GPS navigation for newcomers to Berlin.</p>
        <p className="mute">{NET.credit}</p>
        <p className="mute">Change tips (which part of the train and platform to use): vbb-change-positions, crowd sourced, ODbL 1.0. Tips are approximate and only shown where data exists. Station data: VBB open data, CC BY 3.0.</p>
        <p className="mute">3D city: map data from OpenStreetMap contributors (ODbL), tiles by OpenFreeMap and OpenMapTiles, rendered with MapLibre GL.</p>
        <p className="mute">Line and station names and colors are facts from open data. The network map is an original drawing and not the official BVG or S-Bahn Berlin map. This app is not affiliated with BVG, S-Bahn Berlin or VBB.</p>
        <p className="mute">Travel times are estimates. Lines S4 and S45 are not included yet. Built with React, Vite, MapLibre GL and three.js.</p></>);
    default:
      return null;
  }
}
