#!/usr/bin/env python3
"""Build data.js (stations, lines, schematic coordinates) for the Berlin Route app.

Source: vbb-lines and vbb-stations (npm), computed from VBB GTFS data.
Data licence: CC BY 3.0 (VBB / daten.berlin.de). Credit must stay in the app.
Usage: python3 -I build_data.py <npm_extract_dir> <out_data_js>
"""
import json, math, re, sys, collections

base, out = sys.argv[1], sys.argv[2]
L = json.load(open(f'{base}/x_vbb-lines/package/data.json'))
S = json.load(open(f'{base}/x_vbb-stations/package/data.json'))
C = json.load(open(f'{base}/x_vbb-line-colors/package/index.json'))
byid = {r[0]: r for r in S}  # id -> [id, name, weight, lat, lng]
F = json.load(open(f'{base}/x_vbb-stations/package/full.json'))
for fid, st in F.items():  # stations from full.json (ids that are not in data.json)
    if fid not in byid:
        byid[fid] = [fid, st['name'], st.get('weight', 1), st['location']['latitude'], st['location']['longitude']]
for fid, st in F.items():  # child stops resolve to their parent station
    for s in st.get('stops', []):
        if s['id'] not in byid:
            byid[s['id']] = [s['id'], st['name'], st.get('weight', 1), st['location']['latitude'], st['location']['longitude']]
colors = {}
for prod in ('suburban', 'subway'):
    for k, v in C[prod].items():
        colors[k] = v['bg']

KEEP_PAREN = ('Gärten der Welt',)


def prefix_of(name):
    m = re.match(r'^(S\+U|S|U)\s+', name)
    return m.group(1) if m else ''


def clean(name):
    n = re.sub(r'^(S\+U|S|U)\s+', '', name)
    n = re.sub(r'\s*\(Berlin\)\s*$', '', n)
    n = re.sub(r'\s+Bhf$', '', n)
    keep = next((k for k in KEEP_PAREN if k in n), None)
    if not keep:
        n = re.sub(r'\s*\([^)]*\)\s*$', '', n)
    n = re.sub(r'\s+Bhf$', '', n)
    n = re.sub(r'^Berlin\s+', '', n)
    return n.strip()


def key_of(name):
    return re.sub(r'\s*\([^)]*\)', '', clean(name)).lower()


def hav(a, b):
    R = 6371.0
    p = math.pi / 180
    dlat, dlng = (b[0] - a[0]) * p, (b[1] - a[1]) * p
    x = math.sin(dlat / 2) ** 2 + math.cos(a[0] * p) * math.cos(b[0] * p) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))


# ---- collect line variants (Berlin S-Bahn operator '1', BVG U-Bahn operator '796') ----
raw = []  # (linename, product 'S'/'U', [stop ids], trips)
for l in L:
    if l['product'] == 'suburban' and l['operator'] == '1':
        for v in l['variants']:
            raw.append((l['name'], 'S', v['stops'], v['trips']))
    elif l['product'] == 'subway' and l['operator'] == '796':
        for v in l['variants']:
            raw.append((l['name'], 'U', v['stops'], v['trips']))

# U4 is missing from the dataset; add it by station ids (Nollendorfplatz .. Innsbrucker Platz)
nolle = next(r for r in S if r[1] == 'U Nollendorfplatz' or r[1] == 'S+U Nollendorfplatz')
u4 = [nolle[0], 'de:11000:900055101', 'de:11000:900055102', 'de:11000:900054101', 'de:11000:900054105']
raw.append(('U4', 'U', u4, 200))
raw.append(('U4', 'U', list(reversed(u4)), 200))
colors['U4'] = colors.get('U4', '#ffd502')

# ---- group stops into stations ----
stops = {}
for name, prod, ids, trips in raw:
    for sid in ids:
        if sid in byid:
            stops[sid] = byid[sid]

groups = collections.defaultdict(list)
for sid, r in stops.items():
    groups[key_of(r[1])].append(r)

stations = []  # dict(name, lat, lng, weight, ids)
stop2st = {}
for key, members in groups.items():
    clusters = []
    for r in sorted(members, key=lambda r: -r[2]):
        placed = False
        for c in clusters:
            if any(hav((r[3], r[4]), (m[3], m[4])) < 0.7 for m in c):
                c.append(r)
                placed = True
                break
        if not placed:
            clusters.append([r])
    for c in clusters:
        wsum = sum(max(m[2], 1) for m in c)
        lat = sum(m[3] * max(m[2], 1) for m in c) / wsum
        lng = sum(m[4] * max(m[2], 1) for m in c) / wsum
        best = max(c, key=lambda m: m[2])
        st = dict(name=clean(best[1]), lat=lat, lng=lng, weight=sum(m[2] for m in c))
        idx = len(stations)
        stations.append(st)
        for m in c:
            stop2st[m[0]] = idx

# ---- line variants as station index sequences ----
lines = {}
seen = set()
for name, prod, ids, trips in raw:
    seq = []
    for sid in ids:
        if sid in stop2st:
            i = stop2st[sid]
            if not seq or seq[-1] != i:
                seq.append(i)
    if len(seq) < 2:
        continue
    k = (name, tuple(seq))
    ln = lines.setdefault(name, dict(p=prod, c=colors.get(name, '#888888'), v=[], t=[]))
    if k in seen:
        ln['t'][ln['v'].index(seq)] += trips  # same station sequence on another platform: add its trips
        continue
    seen.add(k)
    ln['v'].append(seq)
    ln['t'].append(trips)

# drop rare variants (special or diverted trips) so they do not create fake connections
MIN_SHARE = float(__import__('os').environ.get('MIN_SHARE', '0.12'))
for ln in lines.values():
    mx = max(ln['t'])
    keep = [i for i, t in enumerate(ln['t']) if t >= MIN_SHARE * mx]
    ln['v'] = [ln['v'][i] for i in keep]
    ln['t'] = [ln['t'][i] for i in keep]

# drop stations that no line uses
used = sorted({i for ln in lines.values() for v in ln['v'] for i in v})
remap = {old: new for new, old in enumerate(used)}
stations = [stations[i] for i in used]
for ln in lines.values():
    ln['v'] = [[remap[i] for i in v] for v in ln['v']]

# ---- schematic coordinates: km around Alexanderplatz area + radial compression ----
lat0, lon0 = 52.5200, 13.4050
PP, PC = 0.55, 1.75
for s in stations:
    x = (s['lng'] - lon0) * 111.32 * math.cos(math.radians(lat0))
    y = -(s['lat'] - lat0) * 110.57
    r = math.hypot(x, y)
    if r > 1e-6:
        r2 = PC * r ** PP  # power law: spreads the dense centre, keeps the outskirts on the map
        x, y = x * r2 / r, y * r2 / r * 1.3  # stretch north-south a little to use the tall phone screen
    s['x'], s['y'] = round(x, 3), round(y, 3)

net = dict(
    stations=[[s['name'], round(s['lat'], 5), round(s['lng'], 5), s['x'], s['y'], round(s['weight'])] for s in stations],
    lines={k: dict(p=v['p'], c=v['c'], v=v['v'], t=v['t']) for k, v in sorted(lines.items())},
    credit='Station and line data: VBB Verkehrsverbund Berlin-Brandenburg GmbH via daten.berlin.de (CC BY 3.0), prepared with vbb-lines and vbb-stations by Jannis R.',
)
with open(out, 'w', encoding='utf-8') as f:
    f.write('window.NET=' + json.dumps(net, ensure_ascii=False, separators=(',', ':')) + ';\n')

print('stations', len(stations), 'lines', len(lines))
print('S lines', [k for k, v in lines.items() if v['p'] == 'S'])
print('U lines', [k for k, v in lines.items() if v['p'] == 'U'])
