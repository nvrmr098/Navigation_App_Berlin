#!/usr/bin/env python3
"""Build tram, bus and regional train (RE/RB) data for Bearline.

Source: vbb-lines, vbb-stations, vbb-line-colors (npm, by Jannis R., ISC licence) computed from
VBB GTFS open data (CC BY 3.0, VBB Verkehrsverbund Berlin-Brandenburg GmbH).
The drawings in the app are original; only line names, stop names and positions (facts) come from the data.
Usage: python3 -I build_modes.py <node_modules_dir> <out_dir>
"""
import json, math, re, sys, collections

base, out = sys.argv[1], sys.argv[2]
L = [json.loads(l) for l in open(base + '/vbb-lines/data.ndjson')]
S = json.load(open(base + '/vbb-stations/data.json'))
F = json.load(open(base + '/vbb-stations/full.json'))
COL = json.load(open(base + '/vbb-line-colors/index.json'))

byid = {r[0]: (r[1], r[3], r[4]) for r in S}
for fid, st in F.items():
    byid.setdefault(fid, (st['name'], st['location']['latitude'], st['location']['longitude']))
    for s in st.get('stops', []):
        byid.setdefault(s['id'], (st['name'], st['location']['latitude'], st['location']['longitude']))


def res(i):
    if i in byid:
        return byid[i]
    m = re.match(r'.*?(\d{9,})', i)
    if m:
        for k in (m.group(1), '900' + m.group(1)[-6:]):
            if k in byid:
                return byid[k]
    return None


def clean(n):
    n = re.sub(r'^(S\+U|S|U)\s+', '', n)
    n = re.sub(r'\s*\(Berlin\)\s*$', '', n)
    n = re.sub(r'\s+Bhf$', '', n)
    n = re.sub(r',\s*$', '', n.strip())
    return n.strip()


def inb(p):
    return 52.33 <= p[1] <= 52.68 and 13.08 <= p[2] <= 13.78


def km(a, b):
    return math.hypot((a[1] - b[1]) * 111.2, (a[2] - b[2]) * 68)


def busc(name):
    if name.startswith('M'): return '#8d5cd0'
    if name.startswith('X'): return '#d9731a'
    if name.startswith('N'): return '#3a57b8'
    return '#7b8699'


def build(prod, keep):
    stops, index = [], {}

    def sid(p):
        nm = clean(p[0])
        for k in index.get(nm, []):
            if km(stops[k], (nm, p[1], p[2])) < 0.25:
                return k
        stops.append([nm, round(p[1], 4), round(p[2], 4)])
        index.setdefault(nm, []).append(len(stops) - 1)
        return len(stops) - 1

    lines = {}
    for r in L:
        if r['product'] != prod:
            continue
        vs = []
        for v in sorted(r['variants'], key=lambda v: -v.get('trips', 0)):
            pts = [res(s) for s in v['stops']]
            pts = [p for p in pts if p]
            nb = len([p for p in pts if inb(p)])
            if (prod == 'regional' and nb < 1) or (prod != 'regional' and nb < 2):
                continue
            ids = []
            for p in pts:
                k = sid(p)
                if not ids or ids[-1] != k:
                    ids.append(k)
            if len(ids) < 2:
                continue
            s = set(ids)
            if any(len(s & set(o)) / len(s) > .8 for o in vs):
                continue
            vs.append(ids)
            if len(vs) >= 3:
                break
        if not vs:
            continue
        name = r['name']
        if prod == 'regional':
            c = COL.get('regional', {}).get(name, {}).get('bg', '#d0021b')
        elif prod == 'tram':
            c = COL.get('tram', {}).get(name, {}).get('bg', '#b3282d')
        else:
            c = busc(name)
        if name in lines:
            lines[name]['v'] += vs
        else:
            lines[name] = {'c': c, 'v': vs}
    used = sorted({i for l in lines.values() for v in l['v'] for i in v})
    remap = {o: n for n, o in enumerate(used)}
    st = [stops[i] for i in used]
    for l in lines.values():
        l['v'] = [[remap[i] for i in v] for v in l['v']]
    return {'s': st, 'l': lines}


for prod, fn in (('tram', 'tram'), ('bus', 'bus'), ('regional', 're')):
    d = build(prod, None)
    json.dump(d, open(f'{out}/modes-{fn}.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    print(fn, len(d['l']), 'lines', len(d['s']), 'stops')
