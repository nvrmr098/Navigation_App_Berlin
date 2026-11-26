/* Routing engine: Dijkstra over (line, station) nodes with transfer hubs. Times are estimates. */
const api = (function () {
  'use strict';
/* Routing engine for the Berlin S- and U-Bahn network.
 * Graph: one node per (line, station), plus hub nodes per (station, product) for transfers.
 * Costs (minutes): riding time from distance and average speed, a boarding wait per product,
 * and a walking time for each transfer. Dijkstra finds the fastest route.
 * Times are estimates, not a live timetable. */
  var WAIT = { S: 5, U: 3 };       // average wait for the next train (half of a typical headway)
  var WALK_SAME = 2, WALK_DIFF = 4; // transfer walking time: same product / S <-> U
  var PEN_FEWEST = 10;              // extra cost per transfer for the "fewest changes" option

  function hav(la1, lo1, la2, lo2) {
    var R = 6371, p = Math.PI / 180, dl = (la2 - la1) * p, dn = (lo2 - lo1) * p;
    var a = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(la1 * p) * Math.cos(la2 * p) * Math.sin(dn / 2) * Math.sin(dn / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function norm(s) {
    return s.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function rideTime(p, d) {
    var dd = d * 1.15; // tracks are longer than the straight line
    var t = p === 'U' ? dd / 0.5 + 0.4 : dd / 0.62 + 0.5;
    return Math.max(1, t);
  }

  function create(NET) {
    var ST = NET.stations.map(function (s, i) {
      return { i: i, name: s[0], lat: s[1], lng: s[2], x: s[3], y: s[4], w: s[5], n: norm(s[0]), lines: [] };
    });
    var names = Object.keys(NET.lines);
    var INFO = {};
    names.forEach(function (n) { INFO[n] = { name: n, p: NET.lines[n].p, c: NET.lines[n].c }; });

    var nodeId = {}, nodes = [];
    function ln(line, s) {
      var k = line + '@' + s;
      if (!(k in nodeId)) { nodeId[k] = nodes.length; nodes.push({ line: line, st: s }); }
      return nodeId[k];
    }
    var ride = {};
    names.forEach(function (name) {
      var L = NET.lines[name];
      var order = L.v.map(function (_, i) { return i; }).sort(function (a, b) { return (L.t[b] || 0) - (L.t[a] || 0); });
      order.forEach(function (vi) {
        var seq = L.v[vi], toward = ST[seq[seq.length - 1]].name;
        seq.forEach(function (s) { ln(name, s); if (ST[s].lines.indexOf(name) < 0) ST[s].lines.push(name); });
        for (var i = 0; i < seq.length - 1; i++) {
          var a = seq[i], b = seq[i + 1], k = name + '|' + a + '|' + b, e = ride[k];
          if (!e) {
            var d = hav(ST[a].lat, ST[a].lng, ST[b].lat, ST[b].lng);
            e = ride[k] = { a: a, b: b, line: name, p: L.p, t: rideTime(L.p, d), toward: [] };
          }
          if (e.toward.indexOf(toward) < 0) e.toward.push(toward);
        }
      });
    });
    ST.forEach(function (s) {
      s.lines.sort(function (a, b) {
        if (INFO[a].p !== INFO[b].p) return INFO[a].p === 'U' ? -1 : 1;
        return a.localeCompare(b, 'en', { numeric: true });
      });
    });
    // stops of live journeys that are not in the S/U data live at ST[100000 + n]. They never show up when the array is iterated or searched.
    var VX = {}, vKey = {}, vN = 100000;
    function virt(o) {
      var k = o.vid || (o.name + '@' + o.lat.toFixed(5) + ',' + o.lng.toFixed(5));
      if (k in vKey) return vKey[k];
      var i = vN++;
      VX[i] = { i: i, name: o.name, lat: o.lat, lng: o.lng, x: o.x, y: o.y, w: 0, n: norm(o.name), lines: [], virt: true, vid: o.vid || '' };
      vKey[k] = i; return i;
    }
    var RAW = ST;
    ST = new Proxy(RAW, { get: function (t, k, r) { if (typeof k === 'string' && k.charCodeAt(0) > 47 && k.charCodeAt(0) < 58) { var n = +k; if (n >= 100000) return VX[n]; } return Reflect.get(t, k, r); } });
    var H = nodes.length, N = H + RAW.length * 2;
    function hub(s, p) { return H + s * 2 + (p === 'S' ? 0 : 1); }
    var adj = [];
    for (var i = 0; i < N; i++) adj.push([]);
    Object.keys(ride).forEach(function (k) {
      var e = ride[k];
      adj[ln(e.line, e.a)].push({ to: ln(e.line, e.b), c: e.t, ride: e });
    });
    var boardAt = RAW.map(function () { return []; });
    nodes.forEach(function (nd, id) {
      adj[id].push({ to: hub(nd.st, INFO[nd.line].p), c: 0, ride: null });
      boardAt[nd.st].push({ line: nd.line, node: id, p: INFO[nd.line].p });
    });

    // ---- binary heap ----
    function Heap() { this.a = []; }
    Heap.prototype.push = function (k, v) {
      var a = this.a; a.push([k, v]); var i = a.length - 1;
      while (i > 0) { var p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; var t = a[p]; a[p] = a[i]; a[i] = t; i = p; }
    };
    Heap.prototype.pop = function () {
      var a = this.a, top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last; var i = 0, n = a.length;
        for (;;) {
          var l = 2 * i + 1, r = l + 1, m = i;
          if (l < n && a[l][0] < a[m][0]) m = l;
          if (r < n && a[r][0] < a[m][0]) m = r;
          if (m === i) break; var t = a[m]; a[m] = a[i]; a[i] = t; i = m;
        }
      }
      return top;
    };

    function dijkstra(a, b, pen) {
      var dist = new Array(N), prev = new Array(N), pe = new Array(N), done = new Array(N), x;
      for (x = 0; x < N; x++) { dist[x] = Infinity; prev[x] = -1; pe[x] = null; done[x] = false; }
      var heap = new Heap();
      boardAt[a].forEach(function (bd) { dist[bd.node] = WAIT[bd.p]; heap.push(WAIT[bd.p], bd.node); });
      var found = -1;
      function relax(u, to, c, e) {
        var nd = dist[u] + c;
        if (nd < dist[to]) { dist[to] = nd; prev[to] = u; pe[to] = e; heap.push(nd, to); }
      }
      while (heap.a.length) {
        var top = heap.pop(), u = top[1];
        if (done[u]) continue;
        done[u] = true;
        if (u >= H) {
          var s = (u - H) >> 1, prod = ((u - H) & 1) ? 'U' : 'S';
          if (s === b) { found = u; break; }
          boardAt[s].forEach(function (bd) {
            relax(u, bd.node, WAIT[bd.p] + (bd.p === prod ? WALK_SAME : WALK_DIFF) + pen, null);
          });
        } else {
          adj[u].forEach(function (e) { relax(u, e.to, e.c, e.ride); });
        }
      }
      if (found < 0) return null;
      var seq = [];
      for (x = found; x !== -1; x = prev[x]) seq.push(x);
      seq.reverse();
      var legs = [], cur = null, justHub = true;
      seq.forEach(function (u) {
        if (u >= H) { justHub = true; return; }
        var nd = nodes[u];
        if (justHub) {
          cur = { line: nd.line, p: INFO[nd.line].p, c: INFO[nd.line].c, stations: [nd.st], rides: [] };
          legs.push(cur); justHub = false;
        } else {
          cur.stations.push(nd.st); cur.rides.push(pe[u]);
        }
      });
      var total = 0;
      legs.forEach(function (lg, i) {
        var rideMin = 0;
        lg.rides.forEach(function (e) { rideMin += e.t; });
        var tw = null, L = NET.lines[lg.line];
        if (lg.rides.length) {
          var ord = L.v.map(function (_, i) { return i; }).sort(function (x, y) { return (L.t[y] || 0) - (L.t[x] || 0); });
          for (var oi = 0; oi < ord.length && tw === null; oi++) {
            var seq = L.v[ord[oi]], at = seq.indexOf(lg.stations[0]);
            if (at < 0) continue;
            var okSeq = true;
            for (var q = 0; q < lg.stations.length; q++) if (seq[at + q] !== lg.stations[q]) { okSeq = false; break; }
            if (okSeq) tw = ST[seq[seq.length - 1]].name;
          }
          if (tw === null) tw = lg.rides[0].toward[0];
        }
        lg.toward = tw;
        lg.rideMin = rideMin;
        lg.waitMin = WAIT[lg.p] + (i === 0 ? 0 : (legs[i - 1].p === lg.p ? WALK_SAME : WALK_DIFF));
        lg.stops = lg.stations.length - 1;
        total += lg.rideMin + lg.waitMin;
        delete lg.rides;
      });
      return { legs: legs, minutes: Math.max(1, Math.round(total)), transfers: legs.length - 1, from: a, to: b };
    }
    function sig(r) { return r.legs.map(function (l) { return l.line + ':' + l.stations.join(','); }).join('|'); }

    function routes(a, b) {
      if (a === b || a == null || b == null) return [];
      var fast = dijkstra(a, b, 0);
      if (!fast) return [];
      fast.key = 'fastest';
      var out = [fast];
      var few = dijkstra(a, b, PEN_FEWEST);
      if (few && few.transfers < fast.transfers && sig(few) !== sig(fast)) { few.key = 'fewest'; out.push(few); }
      return out;
    }

    // path through the route stations, for drawing and animation
    function routePath(route) {
      var pts = [], legs = [];
      route.legs.forEach(function (lg, li) {
        var from = pts.length ? pts.length - 1 : 0;
        lg.stations.forEach(function (s, k) {
          if (li > 0 && k === 0 && pts.length && pts[pts.length - 1].st === s) return;
          pts.push({ st: s, x: ST[s].x, y: ST[s].y, leg: li });
        });
        legs.push({ a: from, b: pts.length - 1 });
      });
      var cum = [0];
      for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      return { pts: pts, cum: cum, total: cum[cum.length - 1] || 1, legs: legs };
    }
    // float index along the path for a distance fraction 0..1
    function indexAt(path, f) {
      var d = Math.max(0, Math.min(1, f)) * path.total, i = 1;
      while (i < path.cum.length - 1 && path.cum[i] < d) i++;
      var seg = (path.cum[i] - path.cum[i - 1]) || 1;
      return (i - 1) + Math.max(0, Math.min(1, (d - path.cum[i - 1]) / seg));
    }
    function legAt(path, s) {
      for (var i = 0; i < path.legs.length; i++) if (s < path.legs[i].b) return i;
      return path.legs.length - 1;
    }

    function search(q, limit, exclude) {
      var n = norm(q || '');
      var res = [];
      if (!n) {
        ST.forEach(function (s) { if (s.i !== exclude) res.push([Math.log(s.w + 1), s]); });
      } else {
        var toks = n.split(' ');
        ST.forEach(function (s) {
          if (s.i === exclude) return;
          var sc = 0;
          if (s.n === n) sc = 200;
          else if (s.n.indexOf(n) === 0) sc = 120;
          else {
            var ws = s.n.split(' '), ok = true;
            for (var t = 0; t < toks.length; t++) {
              var hit = false;
              for (var w = 0; w < ws.length; w++) if (ws[w].indexOf(toks[t]) === 0) { hit = true; break; }
              if (!hit && s.n.indexOf(toks[t]) < 0) { ok = false; break; }
              sc += hit ? 40 : 15;
            }
            if (!ok) return;
          }
          res.push([sc + Math.log(s.w + 1), s]);
        });
      }
      res.sort(function (a, b) { return b[0] - a[0]; });
      return res.slice(0, limit || 8).map(function (r) { return r[1]; });
    }
    function byName(name) {
      var n = norm(name);
      for (var i = 0; i < ST.length; i++) if (ST[i].n === n) return ST[i];
      var r = search(name, 1);
      return r[0] || null;
    }

    return { ST: ST, virt: virt, INFO: INFO, routes: routes, routePath: routePath, indexAt: indexAt, legAt: legAt, search: search, byName: byName, norm: norm };
  }

  return { create: create };
})();
export const createRouter = api.create;
