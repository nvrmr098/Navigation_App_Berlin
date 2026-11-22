"""Builds web/src/changes.json from the vbb-change-positions dataset (ODbL 1.0).
usage: python3 -I scripts/build_changes.py <data.ndjson> <data.json> <out.json>
Maps dataset station names to the station names used in data.json."""
import json, re, sys, collections

def norm(n):
    n = re.sub(r'^(S\+U|S|U)\s+', '', n)
    n = re.sub(r'\s+(S\d+|U\d+)(\s+(S\d+|U\d+))*$', '', n)
    n = re.sub(r'^berlin\s+', '', n, flags=re.I)
    n = re.sub(r'\s*\(.*?\)', '', n).lower()
    n = n.replace('straße', 'str.').replace('strasse', 'str.').replace('ß', 'ss')
    n = n.replace('bhf', '').replace('str.', 'str').replace('-', '').replace(' ', '').replace('.', '')
    return n

src, net, out = sys.argv[1:4]
D = json.load(open(net))
ours = collections.defaultdict(list)
for s in D['stations']:
    ours[norm(s[0])].append(s[0])
rows = [json.loads(l) for l in open(src, encoding='utf-8')]
res, miss = [], set()
for r in rows:
    a = ours.get(norm(r['toStation']['name'])) or ours.get(norm(r['fromStation']['name']))
    p = ours.get(norm(r['previousStation']['name']))
    n = ours.get(norm(r['nextStation']['name']))
    if not a:
        miss.add(r['fromStation']['name']); continue
    same = 1 if r.get('samePlatform') else 0
    res.append([a[0], r['fromLines'], p[0] if p else '', r['fromPosition'], r['toLines'], n[0] if n else '', r['toPosition'], same])
json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('rows', len(res), 'of', len(rows), 'unmatched stations', sorted(miss))
