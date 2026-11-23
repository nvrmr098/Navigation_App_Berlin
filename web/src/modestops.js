/* Tram and bus stops (from the VBB open data files) with the lines that serve them. */
const loaders = { tram: () => import('./modes-tram.json'), bus: () => import('./modes-bus.json') };
const cache = {};
export function loadStops(kind) {
  if (cache[kind]) return cache[kind];
  cache[kind] = loaders[kind]().then((m) => {
    const d = m.default || m, lines = Object.keys(d.l);
    const sl = d.s.map(() => []);
    lines.forEach((n) => { const seen = {}; d.l[n].v.forEach((v) => v.forEach((i) => { if (!seen[i]) { seen[i] = 1; sl[i].push(n); } })); });
    return d.s.map((s, i) => ({ kind, name: s[0], lat: s[1], lng: s[2], lines: sl[i].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) }));
  });
  return cache[kind];
}
