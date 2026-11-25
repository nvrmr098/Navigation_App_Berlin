/* Footsteps along a walking route instead of dots: left and right foot alternate, pointing the way you walk. */
import { meters, bearing } from './walk.js';

function footCanvas(color, left) {
  const s = 2, W = 22 * s, H = 34 * s, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.scale(s, s);
  const shape = () => {
    g.beginPath(); g.ellipse(11, 20, 5.4, 8.6, 0, 0, 7); // ball and arch
    g.moveTo(15.6, 29); g.ellipse(11, 28.6, 4, 4.6, 0, 0, 7); // heel
    const sx = left ? 1 : -1; // toes: big toe on the inside
    [[11 - 3.4 * sx, 7.2, 2.5], [11 - 0.5 * sx, 4.6, 1.9], [11 + 2.4 * sx, 4.5, 1.7], [11 + 4.6 * sx, 5.6, 1.5], [11 + 6.2 * sx, 7.5, 1.3]].forEach(([x, y, r]) => { g.moveTo(x + r, y); g.arc(x, y, r, 0, 7); });
  };
  g.lineJoin = 'round'; g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 3;
  shape(); g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.stroke(); g.shadowBlur = 0;
  shape(); g.fillStyle = color; g.fill();
  return g.getImageData(0, 0, W, H);
}
export function addFootImages(map, color) {
  ['foot-l', 'foot-r'].forEach((id) => { if (map.hasImage(id)) map.removeImage(id); map.addImage(id, footCanvas(color, id === 'foot-l'), { pixelRatio: 2 }); });
}

/* points every `gap` metres along a [lng,lat] polyline, alternating feet. done = steps behind the walker */
export function stepPoints(pts, gap, doneIdx) {
  const out = []; let carry = gap / 2, k = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = { lat: pts[i][1], lng: pts[i][0] }, b = { lat: pts[i + 1][1], lng: pts[i + 1][0] }, d = meters(a, b);
    if (d < 0.5) continue;
    const br = bearing(a, b);
    while (carry <= d) {
      const f = carry / d;
      out.push({ type: 'Feature', properties: { f: k % 2 ? 'r' : 'l', b: br, d: i < doneIdx ? 1 : 0, i }, geometry: { type: 'Point', coordinates: [a.lng + (b.lng - a.lng) * f, a.lat + (b.lat - a.lat) * f] } });
      k++; carry += gap;
    }
    carry -= d;
  }
  return { type: 'FeatureCollection', features: out };
}
export function addFootLayer(map, data, dark) {
  if (!map.getSource('steps')) map.addSource('steps', { type: 'geojson', data });
  if (!map.getLayer('steps')) {
    map.addLayer({
      id: 'steps', type: 'symbol', source: 'steps',
      layout: {
        'icon-image': ['case', ['==', ['get', 'f'], 'l'], 'foot-l', 'foot-r'], 'icon-rotate': ['get', 'b'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map',
        'icon-allow-overlap': true, 'icon-ignore-placement': true,
        'icon-offset': ['case', ['==', ['get', 'f'], 'l'], ['literal', [-7, 0]], ['literal', [7, 0]]],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.34, 16, 0.62, 18, 1.05, 20, 1.5],
      },
      paint: { 'icon-opacity': ['case', ['==', ['get', 'd'], 1], dark ? 0.2 : 0.28, 1] },
    });
  }
}
