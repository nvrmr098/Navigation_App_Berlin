/* Real-world 3D: MapLibre GL with OpenStreetMap buildings (OpenFreeMap vector tiles, extruded).
 * Needs internet for the tiles. If the style cannot load, onFail is called and the app falls back to the generic 3D city.
 * Credit (must stay visible): OpenFreeMap, OpenMapTiles, data from OpenStreetMap contributors. */
import { ST } from './net.js';
import { geoAt } from './geo.js';

const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';

const angDiff = (a, b) => ((b - a + 540) % 360) - 180;

export class RealMap3D {
  constructor(container, opts) {
    this.container = container; this.opts = opts; this.map = null; this.loaded = false; this.dead = false;
    this.bearing = 0; this.lastJump = 0; this.follow = true; this.veh = null; this.me = null; this.ml = null;
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
        center: [start.lng, start.lat], zoom: 16, pitch: 62, bearing: start.bearing, maxPitch: 78,
        attributionControl: false, fadeDuration: 0, canvasContextAttributes: { antialias: true },
      });
      this.map = map;
      map.addControl(new ml.AttributionControl({ compact: true, customAttribution: 'OpenFreeMap' }), 'bottom-left');
      const timer = setTimeout(() => { if (!this.loaded) fail('timeout'); }, 9000);
      map.on('error', (e) => { if (!this.loaded) { clearTimeout(timer); fail((e && e.error && e.error.message) || 'style'); } });
      map.on('dragstart', () => { this.follow = false; this.opts.onUserMove && this.opts.onUserMove(); });
      map.on('load', () => {
        clearTimeout(timer); if (this.dead) return;
        try { this.addBuildings(dark); this.addRoute(overlay); this.addMarkers(overlay); } catch (err) { fail(String(err)); return; }
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
        'fill-extrusion-color': dark ? '#454b5f' : '#d9d4ca',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.94,
      },
    }, firstSymbol);
  }

  addRoute(overlay) {
    const map = this.map, route = overlay.route, pts = overlay.path.pts;
    const features = route.legs.map((lg, li) => {
      const seg = overlay.path.legs[li], coords = [];
      for (let i = seg.a; i <= seg.b; i++) coords.push([ST[pts[i].st].lng, ST[pts[i].st].lat]);
      return { type: 'Feature', properties: { c: lg.c, p: lg.p }, geometry: { type: 'LineString', coordinates: coords } };
    });
    const stops = pts.map((p) => ({ type: 'Feature', properties: { name: ST[p.st].name }, geometry: { type: 'Point', coordinates: [ST[p.st].lng, ST[p.st].lat] } }));
    map.addSource('rb-route', { type: 'geojson', data: { type: 'FeatureCollection', features } });
    map.addSource('rb-stops', { type: 'geojson', data: { type: 'FeatureCollection', features: stops } });
    map.addLayer({ id: 'rb-route-case', type: 'line', source: 'rb-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 11, 'line-opacity': 0.95 } });
    map.addLayer({ id: 'rb-route-s', type: 'line', source: 'rb-route', filter: ['==', ['get', 'p'], 'S'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': 7 } });
    map.addLayer({ id: 'rb-route-u', type: 'line', source: 'rb-route', filter: ['==', ['get', 'p'], 'U'], layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': 8, 'line-dasharray': [2, 1.3] } });
    map.addLayer({ id: 'rb-stops-dot', type: 'circle', source: 'rb-stops', paint: { 'circle-radius': 5.5, 'circle-color': '#ffffff', 'circle-stroke-color': '#1d1d1b', 'circle-stroke-width': 2 } });
    if (map.getStyle().glyphs) {
      map.addLayer({
        id: 'rb-stops-label', type: 'symbol', source: 'rb-stops',
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-allow-overlap': false },
        paint: { 'text-color': '#111', 'text-halo-color': '#fff', 'text-halo-width': 2 },
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

  setLeg(overlay, li) {
    if (!this.vehEl) return; const lg = overlay.route.legs[li];
    const b = this.vehEl.querySelector('b'); b.textContent = lg.line; b.style.background = lg.c;
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
      this.map.jumpTo({ center: [g.lng, g.lat], bearing: this.bearing, pitch: 62, zoom: 16.2, padding: { top: Math.round(h * 0.3), bottom: 0, left: 0, right: 0 } });
    }
  }

  setUser(fix) {
    if (!this.me) return;
    if (!fix) { this.meEl.style.display = 'none'; return; }
    this.meEl.style.display = 'block'; this.me.setLngLat([fix.lng, fix.lat]);
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
