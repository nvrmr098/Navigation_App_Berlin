/* Bearline live trip sharing. One KV key per trip, deleted automatically after 6 hours.
 * POST /api/trip            -> { id, key }          start a trip (key is the secret for updates)
 * PUT  /api/trip/:id        -> update position      header X-Key, body { lat, lng, acc, label, ended }
 * GET  /api/trip/:id        -> latest position      public, needs the unguessable id
 * DELETE /api/trip/:id      -> stop sharing         header X-Key
 * GET  /t/:id               -> viewer page          */
const TTL = 6 * 3600;
const H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-key', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' };
const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { ...H, 'content-type': 'application/json', 'cache-control': 'no-store' } });
const rnd = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join(''); };
const num = (v, lo, hi) => (typeof v === 'number' && v >= lo && v <= hi ? v : null);

export default {
  async fetch(req, env) {
    const u = new URL(req.url), p = u.pathname;
    if (req.method === 'OPTIONS') return new Response(null, { headers: H });
    let m;
    if (p === '/api/trip' && req.method === 'POST') {
      const id = rnd(12), key = rnd(24);
      await env.TRIPS.put('t:' + id, JSON.stringify({ key, t: Date.now(), lat: null, lng: null }), { expirationTtl: TTL });
      return json({ id, key });
    }
    if ((m = p.match(/^\/api\/trip\/([a-z2-9]{12})$/))) {
      const id = m[1], raw = await env.TRIPS.get('t:' + id);
      if (!raw) return json({ error: 'gone' }, 404);
      const cur = JSON.parse(raw);
      if (req.method === 'GET') { const { key, ...pub } = cur; return json(pub); }
      if (req.headers.get('x-key') !== cur.key) return json({ error: 'forbidden' }, 403);
      if (req.method === 'DELETE') { await env.TRIPS.delete('t:' + id); return json({ ok: true }); }
      if (req.method === 'PUT') {
        let b; try { b = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
        const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180);
        const next = { key: cur.key, t: Date.now(), lat: lat === null ? cur.lat : lat, lng: lng === null ? cur.lng : lng, acc: num(b.acc, 0, 100000), label: String(b.label || cur.label || '').slice(0, 120), ended: !!b.ended };
        await env.TRIPS.put('t:' + id, JSON.stringify(next), { expirationTtl: TTL });
        return json({ ok: true });
      }
    }
    if ((m = p.match(/^\/t\/([a-z2-9]{12})$/))) return new Response(PAGE.replace('__ID__', m[1]), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
    if (p === '/') return new Response('Bearline live trip sharing', { headers: { 'content-type': 'text/plain' } });
    return new Response('Not found', { status: 404 });
  },
};

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><title>Bearline live trip</title>
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.css">
<style>html,body{margin:0;height:100%;font-family:system-ui,sans-serif;background:#eef0f6;color:#111}#map{position:absolute;inset:0}
#bar{position:absolute;z-index:5;left:12px;right:12px;top:12px;background:#fff;border-radius:20px;padding:12px 16px;box-shadow:0 6px 24px rgba(0,0,0,.18)}
#bar b{display:block;font-size:17px}#bar span{color:#667;font-size:13.5px}.dot{width:18px;height:18px;border-radius:50%;background:#2f7bff;border:3px solid #fff;box-shadow:0 0 0 6px rgba(47,123,255,.25)}</style></head>
<body><div id="map"></div><div id="bar"><b id="t">Bearline live trip</b><span id="s">Loading...</span></div>
<script src="https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.js"></script>
<script>
var ID='__ID__',map,mk,first=true;
function init(){map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/liberty',center:[13.405,52.52],zoom:12,attributionControl:false});
map.addControl(new maplibregl.AttributionControl({compact:true,customAttribution:'OpenFreeMap, OpenStreetMap'}),'bottom-left');
var el=document.createElement('div');el.className='dot';mk=new maplibregl.Marker({element:el});poll();setInterval(poll,10000);}
function ago(ms){var s=Math.round((Date.now()-ms)/1000);return s<60?s+' s':Math.round(s/60)+' min';}
function poll(){fetch('/api/trip/'+ID,{cache:'no-store'}).then(function(r){if(r.status===404)throw 0;return r.json()}).then(function(d){
 document.getElementById('t').textContent=d.label||'Bearline live trip';
 if(d.ended){document.getElementById('s').textContent='Trip ended';return;}
 if(d.lat==null){document.getElementById('s').textContent='Waiting for position...';return;}
 document.getElementById('s').textContent='Updated '+ago(d.t)+' ago';
 mk.setLngLat([d.lng,d.lat]).addTo(map);if(first){map.jumpTo({center:[d.lng,d.lat],zoom:15});first=false}else map.easeTo({center:[d.lng,d.lat],duration:800});
 }).catch(function(){document.getElementById('s').textContent='This link has ended or expired.'});}
init();
</script></body></html>`;
