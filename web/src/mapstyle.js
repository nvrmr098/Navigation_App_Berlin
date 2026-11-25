/* Dark theme for the street map. The light map (OpenFreeMap "liberty") is easy to read, so the dark map is the same style
 * with a calmer palette and a clear step between land, roads, buildings and labels, instead of the almost black built-in dark style.
 * Layer ids are the ones of liberty (OpenMapTiles schema). Unknown ids are skipped, so it is safe with any style. */
export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export const DARK = {
  bg: '#1b2335', park: '#1f3d37', wood: '#1a3834', grass: '#21423a', res: '#1e2740', inst: '#252f4b', pitch: '#27483f', sand: '#3a3d38',
  water: '#18406d', waterLine: '#1f5489', casing: '#0e1424', minor: '#4a5a84', minorCase: '#0e1424', sec: '#7387b8', primary: '#c2a463', motor: '#d09a5a', link: '#6b79a3',
  path: '#7d90bd', rail: '#56648a', bld: '#29334f', bldLine: '#3a4668', b1: '#2e3a5a', b2: '#566a9c', b3: '#7f94c9', txt: '#eef2ff', halo: '#0d1322', boundary: '#4a5a84',
};

export function tuneMap(map, dark) {
  if (!dark || !map) return;
  const P = DARK, set = (id, prop, val) => { try { if (map.getLayer(id)) map.setPaintProperty(id, prop, val); } catch (e) { /* ignore */ } };
  const layers = (map.getStyle().layers || []);
  layers.forEach((l) => {
    const id = l.id, t = l.type, sl = l['source-layer'] || (/^(road|tunnel|bridge)_/.test(id) ? 'transportation' : /^building/.test(id) ? 'building' : '');
    if (t === 'background') set(id, 'background-color', P.bg);
    else if (t === 'raster') set(id, 'raster-opacity', 0);
    else if (t === 'fill' && sl !== 'building') {
      let c = null;
      if (/^water$|water_fill/.test(id)) c = P.water;
      else if (/park$|^park/.test(id)) c = P.park;
      else if (/wood/.test(id)) c = P.wood;
      else if (/grass|wetland/.test(id)) c = P.grass;
      else if (/pitch|track/.test(id)) c = P.pitch;
      else if (/cemetery/.test(id)) c = P.wood;
      else if (/hospital|school/.test(id)) c = P.inst;
      else if (/sand/.test(id)) c = P.sand;
      else if (/residential/.test(id)) c = P.res;
      else if (/aeroway/.test(id)) c = P.inst;
      else if (/road_area/.test(id)) c = P.minor;
      if (c) set(id, 'fill-color', c);
    } else if (t === 'fill' && sl === 'building') { set(id, 'fill-color', P.bld); set(id, 'fill-outline-color', P.bldLine); }
    else if (t === 'fill-extrusion') {
      set(id, 'fill-extrusion-color', ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, P.b1, 20, P.b1, 50, P.b2, 120, P.b3]);
      set(id, 'fill-extrusion-opacity', 0.92);
    } else if (t === 'line') {
      if (sl === 'transportation') {
        const casing = /casing/.test(id);
        let c = null;
        if (/rail|hatching/.test(id)) c = P.rail;
        else if (/motorway/.test(id)) c = casing ? P.casing : P.motor;
        else if (/trunk_primary/.test(id)) c = casing ? P.casing : P.primary;
        else if (/secondary_tertiary/.test(id)) c = casing ? P.casing : P.sec;
        else if (/link/.test(id)) c = casing ? P.casing : P.link;
        else if (/path|pedestrian/.test(id)) c = casing ? P.casing : P.path;
        else if (/minor|street|service/.test(id)) c = casing ? P.minorCase : P.minor;
        if (c) set(id, 'line-color', c);
      } else if (/water/.test(id)) set(id, 'line-color', P.waterLine);
      else if (/park_outline/.test(id)) set(id, 'line-color', P.park);
      else if (/boundary/.test(id)) set(id, 'line-color', P.boundary);
      else if (/aeroway/.test(id)) set(id, 'line-color', P.rail);
    } else if (t === 'symbol') {
      set(id, 'text-color', P.txt); set(id, 'text-halo-color', P.halo); set(id, 'text-halo-width', 1.8); set(id, 'text-halo-blur', 0.3);
    }
  });
  try { map.setLight({ anchor: 'viewport', color: '#cdd8ff', intensity: 0.34, position: [1.4, 210, 50] }); } catch (e) { /* ignore */ }
}

/* offline stand-in with the same layer ids, only for the automated screenshot test */
export function mockLiberty(lng, lat) {
  const f = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
  const rect = (x, y, w, h) => ({ type: 'Polygon', coordinates: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]] });
  const line = (a) => ({ type: 'LineString', coordinates: a });
  const bld = [], roads = [], minor = [];
  for (let i = -10; i < 10; i++) for (let j = -10; j < 10; j++) { if (Math.abs(i % 4) < 1 || Math.abs(j % 4) < 1) continue; bld.push(f(rect(lng + i * 0.0009, lat + j * 0.0006, 0.00042, 0.0003), { render_height: 10 + ((i * 7 + j * 13) % 9 + 9) % 9 * 6 })); }
  for (let i = -10; i <= 10; i++) { minor.push(f(line([[lng - 0.01, lat + i * 0.0006 * 1], [lng + 0.01, lat + i * 0.0006]]))); minor.push(f(line([[lng + i * 0.0009, lat - 0.007], [lng + i * 0.0009, lat + 0.007]]))); }
  roads.push(f(line([[lng - 0.01, lat + 0.0012], [lng + 0.01, lat - 0.0012]])));
  const src = (data) => ({ type: 'geojson', data: { type: 'FeatureCollection', features: data } });
  return {
    version: 8,
    sources: { land: src([f(rect(lng - 0.006, lat - 0.004, 0.003, 0.0035))]), water: src([f(rect(lng + 0.002, lat - 0.004, 0.004, 0.0016))]), park: src([f(rect(lng - 0.0045, lat + 0.0012, 0.0026, 0.0018))]), minor: src(minor), main: src(roads), b: src(bld) },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#f8f4f0' } },
      { id: 'park', type: 'fill', source: 'park', paint: { 'fill-color': '#d8e8c8' } },
      { id: 'landuse_residential', type: 'fill', source: 'land', paint: { 'fill-color': '#ece8e0' } },
      { id: 'water', type: 'fill', source: 'water', paint: { 'fill-color': '#9ec5e8' } },
      { id: 'road_minor_casing', type: 'line', source: 'minor', paint: { 'line-color': '#cfcdc6', 'line-width': 4 } },
      { id: 'road_minor', type: 'line', source: 'minor', paint: { 'line-color': '#ffffff', 'line-width': 3 } },
      { id: 'road_trunk_primary_casing', type: 'line', source: 'main', paint: { 'line-color': '#e0a46a', 'line-width': 9 } },
      { id: 'road_trunk_primary', type: 'line', source: 'main', paint: { 'line-color': '#fcd6a4', 'line-width': 7 } },
      { id: 'building-3d', type: 'fill-extrusion', source: 'b', paint: { 'fill-extrusion-color': '#d9d4ca', 'fill-extrusion-height': ['get', 'render_height'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.95 } },
    ],
  };
}
