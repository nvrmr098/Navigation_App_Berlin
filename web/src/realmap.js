/* Real-world 3D: MapLibre GL with OpenStreetMap buildings (OpenFreeMap vector tiles, extruded).
 * Needs internet for the tiles. If the style cannot load, onFail is called and the app falls back to the generic 3D city.
 * Credit (must stay visible): OpenFreeMap, OpenMapTiles, data from OpenStreetMap contributors. */
import { ST } from './net.js';
import { geoAt } from './geo.js';
import { tuneMap } from './mapstyle.js';

const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/liberty'; // same detailed style as light, recoloured by tuneMap

const angDiff = (a, b) => ((b - a + 540) % 360) - 180;

export class RealMap3D {
  constructor(container, opts) {
    this.container = container; this.opts = opts; this.map = null; this.loaded = false; this.dead = false;
    this.bearing = 0; this.lastJump = 0; this.follow = true; this.veh = null; this.me = null; this.ml = null;
    this.tilt = !(opts && opts.flat); this.route = null;
  }

  async init(overlay) {
    const { dark, styleOverride, onReady, onFail } = this.opts;
    let failed = false;
    const fail = (why) => { if (failed || this.dead) return; failed = true; onFail && onFail(why); };
    try {
      const ml = await import('maplibre-gl');
      const worker = (await import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url')).default;
      await import('maplibre-gl/dist/maplibre-gl.css');
      if (ml.setWorkerUrl) ml.setWorkerUrl(worker);
      this.ml = ml;
      if (this.dead) return;
      const start = geoAt(overlay, 0);
      const map = new ml.Map({
        container: this.container,
        style: styleOverride || (dark ? STYLE_DARK : STYLE_LIGHT),
        center: [start.lng, start.lat], zoom: 16, pitch: this.tilt ? 62 : 0, bearing: this.tilt ? start.bearing : 0, maxPitch: 78,
        attributionControl: false, fadeDuration: 0, canvasContextAttributes: { antialias: true },
      });
      this.map = map;
      map.addControl(new ml.AttributionControl({ compact: true, customAttribution: 'OpenFreeMap' }), 'bottom-left');
      const timer = setTimeout(() => { if (!this.loaded) fail('timeout'); }, 9000);
      map.on('error', (e) => { if (!this.loaded) { clearTimeout(timer); fail((e && e.error && e.error.message) || 'style'); } });
      map.on('dragstart', () => { this.follow = false; this.opts.onUserMove && this.opts.onUserMove(); });
      map.on('load', () => {
        clearTimeout(timer); if (this.dead) return;
        try { this.addBuildings(dark); this.tune(dark); this.addRoute(overlay); this.addMarkers(overlay); this.route = overlay.route; if (this.opts.fit) { this.follow = false; this.fit(overlay, this.opts.fit); } } catch (err) { fail(String(err)); return; }
        this.loaded = true; onReady && onReady();
      });
    } catch (err) { fail(String(err)); }
  }

  addBuildings(dark) {
    const map = this.map, style = map.getStyle(), layers = style.layers || [];
    if (layers.some((l) => l.type === 'fill-extrusion')) return; // the style already has 3D buildings
    const srcName = Object.keys(style.sources).find((k) => style.sources[k].type === 'vector');
    if (!srcName) return;
    const firstSymbol = (layers.find((l) => l.type === 'symbol') || {}).id;
    map.addLayer({
      id: 'rb-buildings', type: 'fill-extrusion', source: srcName, 'source-layer': 'building', minzoom: 13,
      paint: {
        'fill-extrusion-color': dark ? '#3d4a6c' : '#d9d4ca',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.94,
      },
    }, firstSymbol);
  }

  /* readable colours: navy dark theme, soft light theme, height ramp on buildings, calmer labels */
  tune(dark) {
    if (dark) { tuneMap(this.map, true); try { this.map.setLight({ anchor: 'viewport', color: '#9db4ff', intensity: 0.3, position: [1.4, 210, 45] }); } catch (e) { /* ignore */ } this.dark = true; return; }
    const map = this.map, layers = (map.getStyle().layers || []);
    const set = (id, prop, val) => { try { map.setPaintProperty(id, prop, val); } catch (e) { /* ignore */ } };
    const P = dark
      ? { bg: '#0f1626', water: '#0c2a48', green: '#12263a', land: '#141d31', road: '#34415f', main: '#54668f', rail: '#2a3550', txt: '#c4d1ee', halo: '#0f1626', b1: '#33426a', b2: '#6d83bd' }
      : { bg: '#eef0f6', water: '#bcd8f2', green: '#dcebd3', land: '#eceef4', road: '#ffffff', main: '#fbf4e4', rail: '#cfd3de', txt: '#2b3350', halo: '#ffffff', b1: '#d4cfc6', b2: '#b9b3c8' };
    layers.forEach((l) => {
      const id = l.id, t = l.type, k = id.toLowerCase();
      if (t === 'background') set(id, 'background-color', P.bg);
      else if (t === 'fill') {
        if (/water/.test(k)) set(id, 'fill-color', P.water);
        else if (/park|wood|forest|grass|green|landcover|nature|golf|cemetery|pitch/.test(k)) set(id, 'fill-color', P.green);
        else if (/building/.test(k)) set(id, 'fill-color', dark ? '#1c2742' : '#e2ded6');
        else if (/landuse|residential|land/.test(k)) set(id, 'fill-color', P.land);
      } else if (t === 'line') {
        if (/water/.test(k)) set(id, 'line-color', P.water);
        else if (/rail|transit|subway/.test(k)) set(id, 'line-color', P.rail);
        else if (/motorway|trunk|primary|secondary|major/.test(k)) set(id, 'line-color', P.main);
        else if (/road|street|tertiary|minor|service|path|track|highway/.test(k)) set(id, 'line-color', P.road);
      } else if (t === 'symbol') {
        set(id, 'text-color', P.txt); set(id, 'text-halo-color', P.halo); set(id, 'text-halo-width', 1.4);
      } else if (t === 'fill-extrusion') {
        set(id, 'fill-extrusion-color', ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, P.b1, 25, P.b1, 90, P.b2]);
        set(id, 'fill-extrusion-opacity', dark ? 0.92 : 0.95);
      }
    });
    try { map.setLight({ anchor: 'viewport', color: dark ? '#9db4ff' : '#ffffff', intensity: dark ? 0.32 : 0.4, position: [1.4, 210, 45] }); } catch (e) { /* ignore */ }
    this.dark = dark;
  }

  addRoute(overlay) {
    const map = this.map, route = overlay.route, pts = overlay.path.pts;
    const features = [];
    route.legs.forEach((lg, li) => {
      const seg = overlay.path.legs[li], coords = [], ll = (i) => [ST[pts[i].st].lng, ST[pts[i].st].lat];
      // a walk between two stops is drawn dashed and grey, the ride starts at its own first stop
      const from = lg.walkIn && seg.b > seg.a ? seg.a + 1 : seg.a;
      if (from > seg.a) features.push({ type: 'Feature', properties: { c: '#8a93aa', p: 'W' }, geometry: { type: 'LineString', coordinates: [ll(seg.a), ll(seg.a + 1)] } });
      for (let i = from; i <= seg.b; i++) coords.push(ll(i));
      features.push({ type: 'Feature', properties: { c: lg.c, p: lg.p }, geometry: { type: 'LineString', coordinates: coords } });
    });
    const stops = pts.map((p) => ({ type: 'Feature', properties: { name: ST[p.st].name }, geometry: { type: 'Point', coordinates: [ST[p.st].lng, ST[p.st].lat] } }));
    map.addSource('rb-route', { type: 'geojson', data: { type: 'FeatureCollection', features } });
    map.addSource('rb-stops', { type: 'geojson', data: { type: 'FeatureCollection', features: stops } });
    map.addLayer({ id: 'rb-route-glow', type: 'line', source: 'rb-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': 16, 'line-blur': 10, 'line-opacity': this.dark ? 0.55 : 0.25 } });
    map.addLayer({ id: 'rb-route-case', type: 'line', source: 'rb-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': this.dark ? '#0a0f1c' : '#ffffff', 'line-width': 9, 'line-opacity': 0.9 } });
    map.addLayer({ id: 'rb-route-s', type: 'line', source: 'rb-route', filter: ['==', ['get', 'p'], 'S'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': 5.5 } });
    map.addLayer({ id: 'rb-route-u', type: 'line', source: 'rb-route', filter: ['==', ['get', 'p'], 'U'], layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': 6, 'line-dasharray': [2, 1.3] } });
    map.addLayer({ id: 'rb-route-o', type: 'line', source: 'rb-route', filter: ['!', ['in', ['get', 'p'], ['literal', ['S', 'U', 'W']]]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': 6 } });
    map.addLayer({ id: 'rb-route-w', type: 'line', source: 'rb-route', filter: ['==', ['get', 'p'], 'W'], layout: { 'line-join': 'round' }, paint: { 'line-color': this.dark ? '#aab4d0' : '#6b7690', 'line-width': 4, 'line-dasharray': [1, 1.6] } });
    map.addLayer({ id: 'rb-stops-dot', type: 'circle', source: 'rb-stops', paint: { 'circle-radius': 5.5, 'circle-color': '#ffffff', 'circle-stroke-color': this.dark ? '#4f6bff' : '#1d1d1b', 'circle-stroke-width': 2 } });
    if (map.getStyle().glyphs) {
      map.addLayer({
        id: 'rb-stops-label', type: 'symbol', source: 'rb-stops',
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-allow-overlap': false },
        paint: { 'text-color': this.dark ? '#f1f5ff' : '#111', 'text-halo-color': this.dark ? '#0a0f1c' : '#fff', 'text-halo-width': 2 },
      });
    }
  }

  addMarkers(overlay) {
    const ml = this.ml, lg = overlay.route.legs[0];
    const el = document.createElement('div'); el.className = 'veh3';
    el.innerHTML = '<i class="pulse"></i><b style="background:' + lg.c + '">' + lg.line + '</b>';
    this.vehEl = el; this.veh = new ml.Marker({ element: el, pitchAlignment: 'viewport', rotationAlignment: 'viewport' }).setLngLat(this.map.getCenter()).addTo(this.map);
    const me = document.createElement('div'); me.className = 'me3'; me.innerHTML = '<i></i><b></b>'; me.style.display = 'none';
    this.meEl = me; this.me = new ml.Marker({ element: me }).setLngLat(this.map.getCenter()).addTo(this.map);
  }

  setLeg(overlay, li, walking) {
    if (!this.vehEl) return; const lg = overlay.route.legs[li];
    const b = this.vehEl.querySelector('b'); b.textContent = walking ? '\u{1F6B6}' : lg.line; b.style.background = walking ? '#6b7690' : lg.c;
  }

  /* 2D (flat, north up) or 3D (tilted, heading up) */
  setTilt(on) {
    this.tilt = !!on; if (!this.map) return;
    this.map.easeTo({ pitch: on ? 62 : 0, bearing: on ? this.bearing : 0, duration: 600 });
  }
  zoomBy(d) {
    if (!this.map) return;
    const z = Math.max(12, Math.min(19, this.map.getZoom() + d)); if (this.tilt) this.zoomTilt = z; else this.zoomFlat = z;
    this.map.easeTo({ zoom: z, duration: 260 });
  }
  /* show the whole route (preview) */
  fit(overlay, pad) {
    if (!this.map) return;
    const pts = overlay.path.pts; let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
    pts.forEach((p) => { const s = ST[p.st]; a = Math.min(a, s.lng); c = Math.max(c, s.lng); b = Math.min(b, s.lat); d = Math.max(d, s.lat); });
    const pd = pad && typeof pad === 'object' ? pad : { top: 130, bottom: 230 };
    this.map.fitBounds([[a, b], [c, d]], { padding: { top: pd.top, bottom: pd.bottom, left: 36, right: 36 }, maxZoom: 16.5, pitch: 0, bearing: 0, duration: 0 });
  }

  // move the vehicle marker and (when following) the camera
  setPosition(overlay, idx, now) {
    if (!this.loaded || !this.veh) return;
    const g = geoAt(overlay, idx);
    this.veh.setLngLat([g.lng, g.lat]);
    this.bearing += angDiff(this.bearing, g.bearing) * 0.06;
    if (this.follow && now - this.lastJump > 33) {
      this.lastJump = now;
      const h = this.container.clientHeight || 600;
      this.map.jumpTo({ center: [g.lng, g.lat], bearing: this.tilt ? this.bearing : 0, pitch: this.tilt ? 62 : 0, zoom: this.tilt ? this.zoomTilt || 16.2 : this.zoomFlat || 16, padding: { top: Math.round(h * (this.tilt ? 0.3 : 0.18)), bottom: 0, left: 0, right: 0 } });
    }
  }

  setUser(fix) {
    if (!this.me) return;
    // no blue dot while navigating: the train marker shows where you are
    this.meEl.style.display = 'none';
  }

  recenter() { this.follow = true; }
  resize() { if (this.map) this.map.resize(); }
  destroy() { this.dead = true; try { if (this.map) this.map.remove(); } catch (e) { /* ignore */ } this.map = null; this.loaded = false; }
}

// offline style used only by the automated screenshot test (no network needed)
export function mockStyle(centerLng, centerLat) {
  const boxes = [];
  for (let i = -24; i < 24; i++) for (let j = -24; j < 24; j++) {
    if (Math.abs(i % 5) < 1 || Math.abs(j % 5) < 1) continue;
    const x = centerLng + i * 0.0011, y = centerLat + j * 0.00075, w = 0.00032, h = 0.00022;
    boxes.push({ type: 'Feature', properties: { render_height: 12 + ((i * 7 + j * 13) % 9 + 9) % 9 * 6 }, geometry: { type: 'Polygon', coordinates: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]] } });
  }
  return {
    version: 8, sources: { b: { type: 'geojson', data: { type: 'FeatureCollection', features: boxes } } },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#e9e6df' } },
      { id: 'b3d', type: 'fill-extrusion', source: 'b', paint: { 'fill-extrusion-color': '#d4cec2', 'fill-extrusion-height': ['get', 'render_height'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.95 } },
    ],
  };
}
