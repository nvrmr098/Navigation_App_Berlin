/* Berlin Route: schematic S-Bahn and U-Bahn map, search, routing, navigation with 2D and 3D views. */
(function () {
  'use strict';
  var NET = window.NET, R = window.Router.create(NET), ST = R.ST, INFO = R.INFO;
  var $ = function (id) { return document.getElementById(id); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  // ---------- storage ----------
  var store = { dark: false, fav: [], rec: [], lbl: true, step: false };
  try { var raw = localStorage.getItem('br1'); if (raw) Object.assign(store, JSON.parse(raw)); } catch (e) {}
  function save() { try { localStorage.setItem('br1', JSON.stringify(store)); } catch (e) {} }
  function toast(t) { var el = $('toast'); el.textContent = t; el.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(function () { el.style.display = 'none'; }, 2200); }

  // ---------- helpers ----------
  function lum(hex) { var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
  function badge(l) { var c = INFO[l].c; return '<span class="bdg ' + INFO[l].p + '" style="background:' + c + ';color:' + (lum(c) > 0.72 ? '#222' : '#fff') + '">' + l + '</span>'; }
  function badges(s, max) { var l = max && s.lines.length > max ? s.lines.slice(0, max) : s.lines; return l.map(badge).join(' ') + (max && s.lines.length > max ? ' <small style="color:var(--mute)">+' + (s.lines.length - max) + '</small>' : ''); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var cssv = function (n) { return getComputedStyle(document.body).getPropertyValue(n).trim(); };

  // ---------- pages ----------
  function go(p) {
    document.querySelectorAll('.page').forEach(function (e) { e.classList.toggle('on', e.id === p); });
    document.querySelectorAll('#footer button').forEach(function (b) { b.classList.toggle('on', b.dataset.p === p); });
    if (p === 'pMap') { resize(); schedule(); }
    if (p === 'pNav') renderHome();
    if (p === 'pMore') renderMoreSummary();
  }
  document.querySelectorAll('#footer button').forEach(function (b) { b.onclick = function () { go(b.dataset.p); }; });

  // ---------- search component ----------
  function attachSearch(inp, dd, onPick, clearBtn) {
    function items(q) {
      var h = '', list;
      if (!q.trim()) {
        var rec = [];
        store.rec.forEach(function (r) { r.forEach(function (n) { var s = R.byName(n); if (s && rec.indexOf(s) < 0) rec.push(s); }); });
        var fav = store.fav.map(R.byName).filter(Boolean);
        if (fav.length) h += '<div class="hd">Favorites</div>' + fav.slice(0, 4).map(row).join('');
        if (rec.length) h += '<div class="hd">Recent</div>' + rec.slice(0, 4).map(row).join('');
        h += '<div class="hd">Popular</div>' + R.search('', 6).map(row).join('');
        return h;
      }
      list = R.search(q, 9);
      return list.length ? list.map(row).join('') : '<div class="it" style="color:var(--mute)">No station found</div>';
    }
    function row(s) { return '<div class="it" data-i="' + s.i + '"><span class="nm">' + esc(s.name) + '</span>' + badges(s, 3) + '</div>'; }
    function show() { dd.innerHTML = items(inp.value); dd.style.display = 'block'; }
    function hide() { dd.style.display = 'none'; }
    inp.addEventListener('focus', show);
    inp.addEventListener('input', function () { show(); if (clearBtn) clearBtn.style.display = inp.value ? 'block' : 'none'; if (inp.onedit) inp.onedit(); });
    dd.addEventListener('pointerdown', function (e) {
      var it = e.target.closest('.it'); if (!it || it.dataset.i === undefined) return;
      e.preventDefault(); var s = ST[+it.dataset.i]; inp.value = s.name; hide(); inp.blur();
      if (clearBtn) clearBtn.style.display = 'block'; onPick(s);
    });
    inp.addEventListener('blur', function () { setTimeout(hide, 120); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var r = R.search(inp.value, 1)[0]; if (r) { inp.value = r.name; hide(); inp.blur(); onPick(r); } } });
    if (clearBtn) clearBtn.onclick = function () { inp.value = ''; clearBtn.style.display = 'none'; if (inp.onedit) inp.onedit(); inp.focus(); };
  }

  // ---------- map state ----------
  var cv = $('cv'), ctx = cv.getContext('2d'), W = 0, H = 0, dpr = 1;
  var BB = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 }; ST.forEach(function (s) { BB.x0 = Math.min(BB.x0, s.x); BB.x1 = Math.max(BB.x1, s.x); BB.y0 = Math.min(BB.y0, s.y); BB.y1 = Math.max(BB.y1, s.y); });
  var view = { cx: 1.5, cy: -0.5, z: 15 }, z0 = 15;
  var filter = 'both', selected = -1;
  var overlay = null;   // { route, path, reveal:[..], marker:null|float index }
  var navMode = false;
  var needs = false;

  // edges grouped for bundle offsets
  var edgeMap = {};
  Object.keys(NET.lines).forEach(function (l) {
    NET.lines[l].v.forEach(function (seq) {
      for (var i = 0; i < seq.length - 1; i++) {
        var a = seq[i], b = seq[i + 1], k = a < b ? a + '|' + b : b + '|' + a;
        var e = edgeMap[k] || (edgeMap[k] = { a: Math.min(a, b), b: Math.max(a, b), lines: [] });
        if (e.lines.indexOf(l) < 0) e.lines.push(l);
      }
    });
  });
  var edges = Object.keys(edgeMap).map(function (k) { var e = edgeMap[k]; e.lines.sort(function (x, y) { return x.localeCompare(y, 'en', { numeric: true }); }); return e; });
  var byWeight = ST.slice().sort(function (a, b) { return b.w - a.w; });
  var rank = {}; byWeight.forEach(function (s, i) { rank[s.i] = i; });

  function showLine(l) { return filter === 'both' || INFO[l].p === filter; }
  function sx(x) { return (x - view.cx) * view.z + W / 2; }
  function sy(y) { return (y - view.cy) * view.z + H / 2; }
  function schedule() { if (needs) return; needs = true; requestAnimationFrame(function () { needs = false; draw(); }); }

  function resize() {
    var r = cv.getBoundingClientRect(); if (!r.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2); W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var ng = $('gl'); if (three.r) { three.r.setPixelRatio(dpr); three.r.setSize(W, H, false); three.cam.aspect = W / H; three.cam.updateProjectionMatrix(); }
    z0 = Math.min((W - 8) / (BB.x1 - BB.x0 + 1.4), (H - 150) / (BB.y1 - BB.y0 + 1.4));
    if (!resize.done) { view.z = z0; resize.done = true; }
    schedule();
  }
  window.addEventListener('resize', resize);

  function fitAll() { view.cx = (BB.x0 + BB.x1) / 2; view.cy = (BB.y0 + BB.y1) / 2 + 0.3; view.z = z0; schedule(); }
  function fitPoints(pts, padTop, padBottom) {
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    pts.forEach(function (p) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
    var w = Math.max(x1 - x0, 1.5), h = Math.max(y1 - y0, 1.5);
    var availH = H - padTop - padBottom;
    view.z = clamp(Math.min((W - 110) / w, availH / h), z0 * 0.8, z0 * 9);
    view.cx = (x0 + x1) / 2; view.cy = (y0 + y1) / 2 + (padBottom - padTop) / 2 / view.z;
    schedule();
  }

  function tintLine(ctx, col, w, alpha) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.globalAlpha = alpha; }

  function draw() {
    if (!W) return;
    var dark = document.body.classList.contains('dark');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.fillStyle = cssv('--map'); ctx.fillRect(0, 0, W, H);
    var k = view.z / z0, dim = overlay ? 0.2 : 1;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    drawRiverHint(dark);

    var lw = clamp(3.2 * Math.sqrt(k), 2.4, 7.5);
    // lines (S first, then U on top)
    ['S', 'U'].forEach(function (prod) {
      edges.forEach(function (e) {
        var ls = e.lines.filter(function (l) { return showLine(l) && INFO[l].p === prod; });
        if (!ls.length) return;
        var a = ST[e.a], b = ST[e.b], x1 = sx(a.x), y1 = sy(a.y), x2 = sx(b.x), y2 = sy(b.y);
        if ((x1 < -50 && x2 < -50) || (x1 > W + 50 && x2 > W + 50) || (y1 < -50 && y2 < -50) || (y1 > H + 50 && y2 > H + 50)) return;
        var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, n = ls.length, gap = lw * 1.0;
        ls.forEach(function (l, i) {
          var off = (i - (n - 1) / 2) * gap;
          ctx.beginPath(); ctx.moveTo(x1 + nx * off, y1 + ny * off); ctx.lineTo(x2 + nx * off, y2 + ny * off);
          if (prod === 'U') { ctx.strokeStyle = dark ? '#111' : '#fff'; ctx.globalAlpha = dim; ctx.lineWidth = lw + 2.2; ctx.stroke(); }
          tintLine(ctx, INFO[l].c, prod === 'U' ? lw : lw * 0.92, dim); ctx.stroke();
        });
      });
    });
    ctx.globalAlpha = 1;

    // route
    if (overlay) drawRoute(k);

    // stations
    var visible = [];
    ST.forEach(function (s) {
      var ls = s.lines.filter(showLine); if (!ls.length) return;
      var x = sx(s.x), y = sy(s.y); if (x < -20 || x > W + 20 || y < -20 || y > H + 20) return;
      var tr = ls.length > 1, r = (tr ? 4.4 : 2.7) * clamp(Math.sqrt(k), 0.8, 1.6);
      ctx.globalAlpha = overlay ? 0.35 : 1;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = dark ? '#2b2b29' : '#fff'; ctx.fill();
      ctx.lineWidth = tr ? 2.2 : 1.6; ctx.strokeStyle = dark ? '#f1efe9' : '#1d1d1b'; ctx.stroke();
      visible.push({ s: s, x: x, y: y, r: r });
    });
    ctx.globalAlpha = 1;
    drawLabels(visible, k, dark);
    if (selected >= 0) {
      var s = ST[selected], x = sx(s.x), y = sy(s.y);
      ctx.beginPath(); ctx.arc(x, y, 13, 0, 6.2832); ctx.strokeStyle = cssv('--accent'); ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 4, 0, 6.2832); ctx.fillStyle = cssv('--accent'); ctx.fill();
    }
    if (overlay && overlay.marker != null) drawMarker();
    hitList = visible;
  }
  var hitList = [];

  function drawRiverHint() {}

  function labelFont(k) { return (k > 3 ? 13 : 11.5) + 'px system-ui,sans-serif'; }
  function drawLabels(vis, k, dark) {
    var maxN = store.lbl ? Math.round(14 * Math.pow(k, 2.3)) : Math.round(6 * Math.pow(k, 2));
    var placed = [], force = {}, onRoute = {};
    if (overlay) { overlay.path.pts.forEach(function (p) { onRoute[p.st] = 1; }); overlay.path.legs.forEach(function (L) { force[overlay.path.pts[L.a].st] = 1; force[overlay.path.pts[L.b].st] = 1; }); }
    if (selected >= 0) force[selected] = 1;
    vis.sort(function (a, b) { return (force[b.s.i] ? 1e6 : 0) - (force[a.s.i] ? 1e6 : 0) || rank[a.s.i] - rank[b.s.i]; });
    ctx.font = labelFont(k); ctx.textBaseline = 'middle';
    var ink = dark ? '#f1efe9' : '#1d1d1b', halo = cssv('--map'), n = 0;
    for (var i = 0; i < vis.length; i++) {
      var v = vis[i], f = force[v.s.i];
      if (!f && !onRoute[v.s.i] && (n >= maxN)) break;
      if (overlay && !f && !onRoute[v.s.i]) continue;
      var w = ctx.measureText(v.s.name).width, h = 14, pad = v.r + 4;
      var cands = [[v.x + pad, v.y - h / 2], [v.x - pad - w, v.y - h / 2], [v.x - w / 2, v.y - pad - h], [v.x - w / 2, v.y + pad]];
      var done = false;
      for (var c = 0; c < cands.length && !done; c++) {
        var bx = cands[c][0], by = cands[c][1], ok = bx > 2 && bx + w < W - 2 && by > 60 && by + h < H - 2;
        if (ok) for (var j = 0; j < placed.length; j++) { var p = placed[j]; if (bx < p[2] && bx + w > p[0] && by < p[3] && by + h > p[1]) { ok = false; break; } }
        if (!ok && !f) continue;
        placed.push([bx, by, bx + w, by + h]);
        ctx.lineWidth = 3.5; ctx.strokeStyle = halo; ctx.lineJoin = 'round'; ctx.strokeText(v.s.name, bx, by + h / 2);
        ctx.fillStyle = ink; ctx.fillText(v.s.name, bx, by + h / 2); done = true;
      }
      if (done) n++;
    }
  }

  // path portion helpers (screen space)
  function routeScreen() { return overlay.path.pts.map(function (p) { return [sx(p.x), sy(p.y)]; }); }
  function drawPortion(pts, a, b, frac) {
    // draw polyline pts[a..b] up to fraction frac of its length
    var tot = 0, i; for (i = a; i < b; i++) tot += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    var lim = tot * frac, acc = 0, tip = pts[a], ang = 0;
    ctx.beginPath(); ctx.moveTo(pts[a][0], pts[a][1]);
    for (i = a; i < b; i++) {
      var dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], d = Math.hypot(dx, dy);
      if (acc + d <= lim) { ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); acc += d; tip = pts[i + 1]; ang = Math.atan2(dy, dx); }
      else { var t = (lim - acc) / (d || 1); tip = [pts[i][0] + dx * t, pts[i][1] + dy * t]; ctx.lineTo(tip[0], tip[1]); ang = Math.atan2(dy, dx); break; }
    }
    return { tip: tip, ang: ang };
  }
  function arrow(x, y, ang, size, col) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * 0.7, -size * 0.8); ctx.lineTo(-size * 0.7, size * 0.8); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke(); ctx.restore();
  }
  function drawRoute(k) {
    var pts = routeScreen(), o = overlay, w = clamp(7 * Math.sqrt(k), 6, 13);
    o.route.legs.forEach(function (lg, li) {
      var seg = o.path.legs[li], frac = o.reveal ? o.reveal[li] : 1; if (frac <= 0) return;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      var r = drawPortion(pts, seg.a, seg.b, frac); ctx.strokeStyle = '#fff'; ctx.lineWidth = w + 4; ctx.globalAlpha = 1; ctx.stroke();
      drawPortion(pts, seg.a, seg.b, frac); ctx.strokeStyle = lg.c; ctx.lineWidth = w; ctx.stroke();
      // direction chevrons
      var tot = 0, i; for (i = seg.a; i < seg.b; i++) tot += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      var step = 70, d = step / 2, acc = 0;
      for (i = seg.a; i < seg.b; i++) {
        var dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], L = Math.hypot(dx, dy);
        while (d < acc + L && d <= tot * frac) { var t = (d - acc) / (L || 1); arrow(pts[i][0] + dx * t, pts[i][1] + dy * t, Math.atan2(dy, dx), 5.2, lg.c); d += step; }
        acc += L;
      }
      if (o.reveal && frac < 1) arrow(r.tip[0], r.tip[1], r.ang, 9, lg.c);
    });
    // stops on route
    o.path.pts.forEach(function (p, i) {
      var li = p.leg, frac = o.reveal ? o.reveal[li] : 1; if (frac <= 0) return;
      var first = i === 0, last = i === o.path.pts.length - 1, x = pts[i][0], y = pts[i][1];
      var isEnd = o.path.legs.some(function (L) { return L.a === i || L.b === i; });
      ctx.beginPath(); ctx.arc(x, y, isEnd ? 8 : 4.2, 0, 6.2832); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = o.route.legs[li].c; ctx.stroke();
      if (first || last) {
        ctx.beginPath(); ctx.arc(x, y, 11, 0, 6.2832); ctx.fillStyle = first ? cssv('--accent') : '#e5231b'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(first ? 'A' : 'B', x, y + 0.5); ctx.textAlign = 'left';
      }
    });
  }
  function pointAt(idx) {
    var p = overlay.path.pts, i = Math.floor(idx); if (i >= p.length - 1) i = p.length - 2; var t = idx - i;
    return { x: p[i].x + (p[i + 1].x - p[i].x) * t, y: p[i].y + (p[i + 1].y - p[i].y) * t, ang: Math.atan2(p[i + 1].y - p[i].y, p[i + 1].x - p[i].x), leg: p[Math.round(idx) < p.length ? Math.round(idx) : p.length - 1].leg, i: i };
  }
  function drawMarker() {
    var m = pointAt(overlay.marker), x = sx(m.x), y = sy(m.y), col = overlay.route.legs[clamp(R.legAt(overlay.path, overlay.marker), 0, overlay.route.legs.length - 1)].c;
    var pul = 14 + 4 * Math.sin(Date.now() / 220);
    ctx.beginPath(); ctx.arc(x, y, pul, 0, 6.2832); ctx.fillStyle = 'rgba(10,108,255,.2)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.2832); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = col; ctx.stroke();
    arrow(x + Math.cos(m.ang) * 15, y + Math.sin(m.ang) * 15, m.ang, 6, col);
  }

  // ---------- map interaction ----------
  var ptrs = {}, down = null, lastPinch = 0;
  cv.addEventListener('pointerdown', function (e) {
    cv.setPointerCapture(e.pointerId); ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    down = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false };
    if (Object.keys(ptrs).length === 2) { var p = Object.values(ptrs); lastPinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); down.moved = true; }
    manual();
  });
  cv.addEventListener('pointermove', function (e) {
    var p = ptrs[e.pointerId]; if (!p) return;
    var ids = Object.keys(ptrs), r = cv.getBoundingClientRect();
    if (ids.length === 1) {
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 6) down.moved = true;
      view.cx -= dx / view.z; view.cy -= dy / view.z;
    } else if (ids.length === 2) {
      var o = ptrs[ids[0] === String(e.pointerId) ? ids[1] : ids[0]], nx = { x: e.clientX, y: e.clientY };
      var d = Math.hypot(nx.x - o.x, nx.y - o.y);
      if (lastPinch) zoomAt((nx.x + o.x) / 2 - r.left, (nx.y + o.y) / 2 - r.top, d / lastPinch);
      lastPinch = d;
    }
    p.x = e.clientX; p.y = e.clientY; schedule();
  });
  function endPtr(e) {
    var had = ptrs[e.pointerId]; delete ptrs[e.pointerId]; lastPinch = 0;
    if (had && down && !down.moved && Date.now() - down.t < 450 && !Object.keys(ptrs).length) tap(e.clientX, e.clientY);
  }
  cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', function (e) { delete ptrs[e.pointerId]; lastPinch = 0; });
  cv.addEventListener('wheel', function (e) { e.preventDefault(); var r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); manual(); }, { passive: false });
  function zoomAt(px, py, f) {
    var nz = clamp(view.z * f, z0 * 0.6, z0 * 14), wx = (px - W / 2) / view.z + view.cx, wy = (py - H / 2) / view.z + view.cy;
    view.z = nz; view.cx = wx - (px - W / 2) / nz; view.cy = wy - (py - H / 2) / nz; schedule();
  }
  function manual() { live.follow = false; }
  function tap(cx, cy) {
    var r = cv.getBoundingClientRect(), x = cx - r.left, y = cy - r.top, best = null, bd = 26;
    hitList.forEach(function (v) { var d = Math.hypot(v.x - x, v.y - y); if (d < bd) { bd = d; best = v.s; } });
    if (best) selectStation(best.i, false); else { closeSheet(); }
  }
  $('zin').onclick = function () { view.z = clamp(view.z * 1.5, z0 * 0.6, z0 * 14); manual(); schedule(); };
  $('zout').onclick = function () { view.z = clamp(view.z / 1.5, z0 * 0.6, z0 * 14); manual(); schedule(); };
  $('zfit').onclick = function () { manual(); if (overlay) fitPoints(overlay.path.pts, 120, 120); else fitAll(); };

  // filters
  $('filters').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return; filter = b.dataset.f;
    document.querySelectorAll('#filters .chip').forEach(function (c) { c.classList.toggle('on', c === b); });
    if (selected >= 0 && !ST[selected].lines.some(showLine)) closeSheet();
    $('legend').children[0].style.display = filter === 'U' ? 'none' : ''; $('legend').children[1].style.display = filter === 'S' ? 'none' : '';
    schedule();
  });

  // map search
  var mq = $('mq');
  attachSearch(mq, $('mdd'), function (s) { filterFor(s); selectStation(s.i, true); }, $('mqc'));
  function filterFor(s) { if (!s.lines.some(showLine)) { filter = 'both'; document.querySelectorAll('#filters .chip').forEach(function (c) { c.classList.toggle('on', c.dataset.f === 'both'); }); } }

  // ---------- station sheet ----------
  function selectStation(i, center) {
    selected = i; var s = ST[i];
    $('shName').textContent = s.name; $('shLines').innerHTML = badges(s);
    $('shFav').innerHTML = store.fav.indexOf(s.name) >= 0 ? '&#9733;' : '&#9734;';
    $('sheet').classList.add('on'); $('fabs').style.bottom = '178px';
    if (center) { view.cx = s.x; view.cy = s.y - (H * 0.12) / Math.max(view.z, z0 * 4); view.z = Math.max(view.z, z0 * 3.2); }
    schedule();
  }
  function closeSheet() { selected = -1; $('sheet').classList.remove('on'); $('fabs').style.bottom = ''; schedule(); }
  $('shX').onclick = closeSheet;
  $('shFrom').onclick = function () { setFrom(ST[selected]); closeSheet(); go('pNav'); };
  $('shTo').onclick = function () { setTo(ST[selected]); closeSheet(); go('pNav'); };
  $('shFav').onclick = function () {
    var n = ST[selected].name, i = store.fav.indexOf(n);
    if (i >= 0) store.fav.splice(i, 1); else store.fav.unshift(n);
    save(); $('shFav').innerHTML = i >= 0 ? '&#9734;' : '&#9733;'; toast(i >= 0 ? 'Removed from favorites' : 'Added to favorites');
  };

  // ---------- navigation page ----------
  var nav = { from: null, to: null, routes: [], sel: 0 };
  var fq = $('fq'), tq = $('tq');
  attachSearch(fq, $('fdd'), function (s) { nav.from = s; compute(); if (!nav.to) tq.focus(); });
  attachSearch(tq, $('tdd'), function (s) { nav.to = s; compute(); });
  fq.onedit = function () { nav.from = null; nav.routes = []; renderResults(); };
  tq.onedit = function () { nav.to = null; nav.routes = []; renderResults(); };
  function setFrom(s) { nav.from = s; fq.value = s ? s.name : ''; compute(); }
  function setTo(s) { nav.to = s; tq.value = s ? s.name : ''; compute(); if (!nav.from) setTimeout(function () { fq.focus(); }, 50); }
  $('swap').onclick = function () { var a = nav.from; nav.from = nav.to; nav.to = a; fq.value = nav.from ? nav.from.name : ''; tq.value = nav.to ? nav.to.name : ''; compute(); };
  $('optStep').onchange = function () { toast('Step-free routing is planned for a later version'); this.checked = false; };

  function compute() {
    nav.routes = []; nav.sel = 0;
    if (nav.from && nav.to) {
      if (nav.from === nav.to) { toast('Start and destination are the same'); }
      else nav.routes = R.routes(nav.from.i, nav.to.i);
    }
    renderResults();
  }
  var TAG = { fastest: 'Fastest', fewest: 'Fewer changes' };
  function visRow(r) { return r.legs.map(function (l) { return badge(l.line); }).join('<span class="ar">&rsaquo;</span>'); }
  function renderResults() {
    var el = $('results'), home = $('navHome');
    if (!nav.from || !nav.to) { el.innerHTML = ''; home.style.display = ''; renderHome(); return; }
    home.style.display = 'none';
    if (!nav.routes.length) { el.innerHTML = '<div class="empty">No route found between these stations.</div>'; return; }
    var h = '';
    nav.routes.forEach(function (r, i) {
      var sel = i === nav.sel;
      h += '<div class="rc' + (sel ? ' sel' : '') + '" data-i="' + i + '"><div class="hd"><span class="tt">' + r.minutes + ' min</span><span class="tg">' + TAG[r.key] + '</span><span style="flex:1"></span><span class="tg">' + (r.transfers ? r.transfers + (r.transfers > 1 ? ' changes' : ' change') : 'Direct') + '</span></div><div class="vis">' + visRow(r) + '</div>';
      if (sel) {
        h += '<ul class="steps">';
        r.legs.forEach(function (lg, li) {
          var a = ST[lg.stations[0]], b = ST[lg.stations[lg.stations.length - 1]];
          h += '<li style="--c:' + lg.c + '"><span class="pin"></span><b>' + (li === 0 ? 'Start at ' : 'Change at ') + esc(a.name) + '</b><small>' + badge(lg.line) + ' towards ' + esc(lg.toward) + ' &middot; ' + lg.stops + (lg.stops === 1 ? ' stop' : ' stops') + ' &middot; about ' + Math.round(lg.rideMin) + ' min</small></li>';
          if (li === r.legs.length - 1) h += '<li style="--c:#e5231b"><span class="pin"></span><b>Arrive at ' + esc(b.name) + '</b></li>';
        });
        h += '</ul><div class="acts"><button class="btn alt sm" data-a="map">Show on map</button><button class="btn sm" data-a="start">Start</button><button class="btn alt sm" data-a="share">Share</button></div>';
      }
      h += '</div>';
    });
    h += '<p class="mute" style="color:var(--mute);font-size:12.5px;margin:12px 4px">Times are estimates from distances and typical waiting times, not a live timetable. Bus and tram connections are coming later.</p>';
    el.innerHTML = h;
  }
  $('results').addEventListener('click', function (e) {
    var a = e.target.closest('[data-a]'), card = e.target.closest('.rc'); if (!card) return;
    var i = +card.dataset.i;
    if (!a) { nav.sel = i; renderResults(); return; }
    var r = nav.routes[i];
    if (a.dataset.a === 'map') { showOnMap(r); }
    else if (a.dataset.a === 'start') { startNav(r); }
    else if (a.dataset.a === 'share') { shareRoute(r); }
  });
  function renderHome() {
    var el = $('navHome'); if (nav.from && nav.to) { el.innerHTML = ''; return; }
    var h = '';
    if (store.fav.length) h += '<div class="sec">Favorites</div><div class="rec">' + store.fav.map(function (n) { return '<button class="chip" data-n="' + esc(n) + '">&#9733; ' + esc(n) + '</button>'; }).join('') + '</div>';
    if (store.rec.length) h += '<div class="sec">Recent trips</div><div class="rec">' + store.rec.map(function (r) { return '<button class="chip" data-a="' + esc(r[0]) + '" data-b="' + esc(r[1]) + '">' + esc(r[0]) + ' &rarr; ' + esc(r[1]) + '</button>'; }).join('') + '</div>';
    h += '<div class="sec">Popular stations</div><div class="rec">' + R.search('', 8).map(function (s) { return '<button class="chip" data-n="' + esc(s.name) + '">' + esc(s.name) + '</button>'; }).join('') + '</div>';
    h += '<p style="color:var(--mute);font-size:13px;margin:18px 4px">Enter a start and a destination. The app finds the fastest way through the S-Bahn and U-Bahn network and shows every change.</p>';
    el.innerHTML = h;
  }
  $('navHome').addEventListener('click', function (e) {
    var c = e.target.closest('.chip'); if (!c) return;
    if (c.dataset.n) { var s = R.byName(c.dataset.n); if (!nav.from) setFrom(s); else setTo(s); }
    else { nav.from = R.byName(c.dataset.a); nav.to = R.byName(c.dataset.b); fq.value = nav.from.name; tq.value = nav.to.name; compute(); }
  });
  function remember(r) {
    var a = ST[r.from].name, b = ST[r.to].name;
    store.rec = store.rec.filter(function (x) { return !(x[0] === a && x[1] === b); }); store.rec.unshift([a, b]); store.rec = store.rec.slice(0, 6); save();
  }
  function shareRoute(r) {
    var t = 'Berlin Route: ' + ST[r.from].name + ' to ' + ST[r.to].name + ', ' + r.minutes + ' min. ' + r.legs.map(function (l) { return l.line + ' towards ' + l.toward + ' (' + l.stops + ' stops)'; }).join(', then ') + '.';
    if (navigator.share) navigator.share({ text: t }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { toast('Route copied'); }, function () { toast('Sharing not available'); });
    else toast('Sharing not available');
  }

  // ---------- route on map / navigation mode ----------
  function setOverlay(r) {
    var path = R.routePath(r);
    overlay = { route: r, path: path, reveal: null, marker: null };
    return overlay;
  }
  function showOnMap(r) {
    remember(r); setOverlay(r); filter = 'both'; document.querySelectorAll('#filters .chip').forEach(function (c) { c.classList.toggle('on', c.dataset.f === 'both'); });
    go('pMap'); closeSheet(); setTimeout(function () { resize(); fitPoints(overlay.path.pts, 90, 130); }, 30);
    $('top').style.display = 'none'; $('navctl').style.display = 'none';
    showClear();
  }
  function showClear() {
    $('navbar').style.display = 'block'; var r = overlay.route;
    $('nbBadge').innerHTML = r.legs.map(function (l) { return badge(l.line); }).join(' ');
    $('nbTitle').textContent = r.minutes + ' min'; $('nbSub').textContent = ST[r.from].name + ' to ' + ST[r.to].name + ' (tap X on the map to close)';
    $('nbBar').style.width = '0%';
    $('navctl').style.display = 'flex'; $('ncPlay').style.display = 'none'; $('ncNext').style.display = 'none'; $('ncEnd').textContent = 'Close route'; $('ncEnd').style.flex = '1';
    navMode = false; $('viewsw').style.display = 'none';
  }
  var live = { on: false, play: true, p: 0, target: 0, follow: true, last: 0, speed: 0.45, is3d: false, phase: 'idle', t0: 0 };
  function startNav(r) {
    remember(r); setOverlay(r); navMode = true; live.on = true; live.p = 0; live.target = 0; live.play = true; live.follow = true; live.phase = 'intro'; live.t0 = performance.now(); live.is3d = false;
    filter = 'both'; document.querySelectorAll('#filters .chip').forEach(function (c) { c.classList.toggle('on', c.dataset.f === 'both'); });
    go('pMap'); closeSheet(); setTimeout(function () { resize(); fitPoints(overlay.path.pts, 110, 150); }, 30);
    $('top').style.display = 'none'; $('legend').style.display = 'none';
    $('navbar').style.display = 'block'; $('navctl').style.display = 'none'; $('viewsw').style.display = 'none'; $('viewsw').textContent = '3D';
    $('gl').style.display = 'none'; cv.style.display = 'block';
    overlay.reveal = r.legs.map(function () { return 0; }); overlay.marker = null;
    $('hud').style.display = 'none'; $('intro').style.display = 'block';
    $('nbBadge').innerHTML = ''; $('nbTitle').textContent = 'Your route'; $('nbSub').textContent = ST[r.from].name + ' to ' + ST[r.to].name; $('nbBar').style.width = '0%';
    requestAnimationFrame(tick);
  }
  function tick(now) {
    if (!live.on) return;
    var o = overlay, r = o.route, n = r.legs.length, dt = Math.min(0.05, (now - (live.last || now)) / 1000); live.last = now;
    if (live.phase === 'intro') {
      var t = (now - live.t0) / 1000, per = n === 1 ? 1.6 : Math.min(1.3, 3.2 / n), runStart = per * n + 0.3, runLen = 1.6;
      for (var i = 0; i < n; i++) o.reveal[i] = clamp((t - i * per) / per, 0, 1);
      var li = clamp(Math.floor(t / per), 0, n - 1);
      if (t < per * n) { var lg = r.legs[li]; $('introTx').innerHTML = (li === 0 ? 'Take ' : 'Then ') + badge(lg.line) + ' towards ' + esc(lg.toward); o.marker = null; }
      else if (t < runStart + runLen) {
        var f = clamp((t - runStart) / runLen, 0, 1); f = f * f * (3 - 2 * f); o.marker = f * (o.path.pts.length - 1) * 0.999; $('introTx').textContent = 'Off we go';
        view.cx += (pointAt(o.marker).x - view.cx) * 0.0;
      } else { live.phase = 'live'; live.p = 0; live.target = 0; o.marker = 0; live.follow = true; $('intro').style.display = 'none'; $('navctl').style.display = 'flex'; $('ncPlay').style.display = ''; $('ncNext').style.display = ''; $('ncEnd').textContent = 'End'; $('ncEnd').style.flex = ''; $('ncPlay').textContent = 'Pause'; $('viewsw').style.display = 'flex'; $('hud').style.display = 'block'; if (live.is3d) place3D(); }
    }
    if (live.phase === 'live') {
      var last = o.path.pts.length - 1;
      if (live.adv != null) { live.p = live.target = Math.min(last, live.adv); live.adv = null; live.play = false; }
      if (live.play && live.target < last && Math.abs(live.p - live.target) < 0.001) live.target = Math.min(last, Math.floor(live.p + 0.0001) + 1);
      var spd = Math.abs(live.target - live.p) > 1.2 ? 2.6 : live.speed; // catch up faster after Next stop
      if (live.p < live.target) live.p = Math.min(live.target, live.p + spd * dt);
      o.marker = live.p;
      if (live.follow) {
        var m = pointAt(live.p), tz = z0 * 5.5; view.z += (tz - view.z) * 0.08; view.cx += (m.x - view.cx) * 0.12; view.cy += (m.y - view.cy) * 0.12;
      }
      updateLive();
    }
    if (live.is3d && live.phase === 'live') render3D(dt);
    schedule();
    requestAnimationFrame(tick);
  }
  function updateLive() {
    var o = overlay, r = o.route, p = live.p, last = o.path.pts.length - 1, li = R.legAt(o.path, Math.min(p, last - 0.001)), lg = r.legs[li], seg = o.path.legs[li];
    var idx = Math.round(p), left = seg.b - Math.floor(p + 0.0001), nextSt = ST[o.path.pts[Math.min(last, Math.floor(p + 0.0001) + 1)].st], endSt = ST[o.path.pts[seg.b].st];
    $('nbBadge').innerHTML = badge(lg.line);
    var fin = p >= last - 0.001;
    if (fin) { $('nbTitle').textContent = 'You have arrived'; $('nbSub').textContent = esc2(ST[r.to].name); $('hudTx').textContent = ST[r.to].name; }
    else {
      $('nbTitle').textContent = lg.line + ' towards ' + lg.toward;
      var isLastLeg = li === r.legs.length - 1, nl = r.legs[li + 1];
      $('nbSub').textContent = left <= 1 ? (isLastLeg ? 'Get off at ' + endSt.name : 'Get off at ' + endSt.name + ', change to ' + nl.line + ' towards ' + nl.toward) : 'Next: ' + nextSt.name + '. ' + left + ' stops until ' + endSt.name;
      $('hudTx').textContent = 'Next: ' + nextSt.name;
    }
    $('nbBar').style.width = Math.round(100 * p / last) + '%';
    if (fin && live.play) { live.play = false; $('ncPlay').textContent = 'Replay'; }
  }
  function esc2(s) { return s; }
  $('ncPlay').onclick = function () {
    if ($('ncPlay').textContent === 'Replay') { live.p = 0; live.target = 0; live.play = true; $('ncPlay').textContent = 'Pause'; live.follow = true; return; }
    live.play = !live.play; $('ncPlay').textContent = live.play ? 'Pause' : 'Resume';
  };
  $('ncNext').onclick = function () { var last = overlay.path.pts.length - 1; live.target = Math.min(last, Math.floor(live.p + 0.0001) + 1); live.follow = true; };
  $('ncEnd').onclick = endNav;
  function endNav() {
    live.on = false; live.phase = 'idle'; navMode = false; overlay = null; live.is3d = false;
    $('navbar').style.display = 'none'; $('navctl').style.display = 'none'; $('hud').style.display = 'none'; $('intro').style.display = 'none'; $('viewsw').style.display = 'none';
    $('top').style.display = 'flex'; $('legend').style.display = ''; $('gl').style.display = 'none'; cv.style.display = 'block';
    fitAll(); schedule();
  }
  $('viewsw').onclick = function () {
    live.is3d = !live.is3d; $('viewsw').textContent = live.is3d ? '2D' : '3D';
    if (live.is3d) { if (!window.THREE) { toast('3D not available'); live.is3d = false; $('viewsw').textContent = '3D'; return; } init3D(); build3D(); $('gl').style.display = 'block'; cv.style.display = 'none'; place3D(); }
    else { $('gl').style.display = 'none'; cv.style.display = 'block'; live.follow = true; schedule(); }
  };

  // ---------- 3D scene ----------
  var three = { r: null };
  function init3D() {
    if (three.r) return;
    var gl = $('gl'); three.r = new THREE.WebGLRenderer({ canvas: gl, antialias: true }); three.r.setPixelRatio(dpr); three.r.setSize(W, H, false);
    three.scene = new THREE.Scene(); three.cam = new THREE.PerspectiveCamera(50, W / H, 0.05, 80);
    three.scene.add(new THREE.HemisphereLight(0xffffff, 0x8d887c, 0.95)); var sun = new THREE.DirectionalLight(0xffffff, 0.7); sun.position.set(3, 6, 2); three.scene.add(sun);
    three.group = new THREE.Group(); three.scene.add(three.group); three.camPos = new THREE.Vector3(); three.look = new THREE.Vector3();
  }
  function disposeGroup(g) { while (g.children.length) { var c = g.children.pop(); if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.dispose) c.material.dispose(); } if (c.children && c.children.length) disposeGroup(c); } }
  var HS = 0.34, HU = -0.2;
  function h3(prod) { return prod === 'S' ? HS : HU; }
  function build3D() {
    var dark = document.body.classList.contains('dark'), o = overlay, path = o.path, route = o.route, T = three;
    disposeGroup(T.group);
    T.scene.background = new THREE.Color(dark ? 0x141416 : 0xdfe9f2); T.scene.fog = new THREE.Fog(dark ? 0x141416 : 0xdfe9f2, 5, 15);
    var pts = path.pts, x0 = 1e9, x1 = -1e9, z0_ = 1e9, z1 = -1e9;
    pts.forEach(function (p) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0_ = Math.min(z0_, p.y); z1 = Math.max(z1, p.y); });
    var pad = 4, bx0 = x0 - pad, bx1 = x1 + pad, bz0 = z0_ - pad, bz1 = z1 + pad;
    // ground (slightly transparent so the U-Bahn can be seen below)
    var gw = bx1 - bx0, gd = bz1 - bz0, gm = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), new THREE.MeshLambertMaterial({ color: dark ? 0x2a2a28 : 0xe8e4da, transparent: true, opacity: 0.62, depthWrite: false }));
    gm.rotation.x = -Math.PI / 2; gm.position.set((bx0 + bx1) / 2, 0, (bz0 + bz1) / 2); gm.renderOrder = 2; T.group.add(gm);
    var under = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), new THREE.MeshLambertMaterial({ color: dark ? 0x0d0d0e : 0xb9b4a8 })); under.rotation.x = -Math.PI / 2; under.position.set((bx0 + bx1) / 2, -0.45, (bz0 + bz1) / 2); T.group.add(under);
    // segments of the route
    var segs = []; for (var i = 0; i < pts.length - 1; i++) segs.push({ a: pts[i], b: pts[i + 1], leg: pts[i + 1].leg });
    function dseg(px, pz) { var m = 1e9; for (var i = 0; i < segs.length; i++) { var a = segs[i].a, b = segs[i].b, dx = b.x - a.x, dz = b.y - a.y, L = dx * dx + dz * dz || 1, t = clamp(((px - a.x) * dx + (pz - a.y) * dz) / L, 0, 1), d = Math.hypot(px - (a.x + dx * t), pz - (a.y + dz * t)); if (d < m) m = d; } return m; }
    // identical generic buildings on a grid, kept away from the tracks
    var cell = 0.4, list = [], hash = function (a, b) { var s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
    for (var gx = bx0; gx < bx1; gx += cell) for (var gz = bz0; gz < bz1; gz += cell) {
      var px = gx + cell / 2, pz = gz + cell / 2, d = dseg(px, pz); if (d < 0.3) continue;
      if (hash(gx, gz) < 0.18) continue; list.push([px, pz, d]);
    }
    if (list.length > 2600) list = list.filter(function (_, i) { return i % Math.ceil(list.length / 2600) === 0; });
    var bm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: dark ? 0x58564f : 0xd7d1c4 }), list.length), M = new THREE.Matrix4(), c = new THREE.Color();
    list.forEach(function (b, i) {
      var hh = 0.1 + hash(b[0], b[1]) * 0.2, w = cell * 0.55; M.makeScale(w, hh, w); M.setPosition(b[0], hh / 2, b[1]); bm.setMatrixAt(i, M);
      c.set(dark ? 0x58564f : 0xd7d1c4); c.offsetHSL(0, 0, (hash(b[1], b[0]) - 0.5) * 0.05); bm.setColorAt(i, c);
    });
    bm.instanceMatrix.needsUpdate = true; if (bm.instanceColor) bm.instanceColor.needsUpdate = true; T.group.add(bm);
    // tracks
    segs.forEach(function (s) {
      var lg = route.legs[s.leg], prod = lg.p, hgt = h3(prod), dx = s.b.x - s.a.x, dz = s.b.y - s.a.y, L = Math.hypot(dx, dz);
      var m = new THREE.Mesh(new THREE.BoxGeometry(L + 0.04, 0.035, prod === 'S' ? 0.075 : 0.07), new THREE.MeshLambertMaterial({ color: new THREE.Color(lg.c) }));
      m.position.set((s.a.x + s.b.x) / 2, hgt, (s.a.y + s.b.y) / 2); m.rotation.y = -Math.atan2(dz, dx); T.group.add(m);
      if (prod === 'S') { var pil = new THREE.Mesh(new THREE.BoxGeometry(0.035, hgt, 0.035), new THREE.MeshLambertMaterial({ color: dark ? 0x77746c : 0x9a968c })); pil.position.set(s.a.x, hgt / 2, s.a.y); T.group.add(pil); }
    });
    // stations
    pts.forEach(function (p, i) {
      var prod = route.legs[p.leg].p, end = path.legs.some(function (L) { return L.a === i || L.b === i; }), hgt = h3(prod);
      var st = new THREE.Mesh(new THREE.BoxGeometry(end ? 0.2 : 0.11, 0.05, end ? 0.2 : 0.11), new THREE.MeshLambertMaterial({ color: end ? 0xffffff : 0xf3f1ea })); st.position.set(p.x, hgt + 0.035, p.y); T.group.add(st);
      if (end) { var post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 8), new THREE.MeshLambertMaterial({ color: i === 0 ? 0x0a6cff : (i === pts.length - 1 ? 0xe5231b : 0x444444) })); post.position.set(p.x, hgt + 0.2, p.y); T.group.add(post); }
    });
    // transfer connectors between S and U
    path.legs.forEach(function (L, li) { if (li === 0) return; var p = pts[L.a], a = route.legs[li - 1].p, b = route.legs[li].p; if (a !== b) { var cn = new THREE.Mesh(new THREE.BoxGeometry(0.03, HS - HU, 0.03), new THREE.MeshLambertMaterial({ color: 0xffffff })); cn.position.set(p.x, (HS + HU) / 2, p.y); T.group.add(cn); } });
    // vehicles per product (one object, restyled when the leg changes)
    T.veh = { S: makeTrain('S'), U: makeTrain('U') }; T.veh.S.visible = false; T.veh.U.visible = false; T.group.add(T.veh.S); T.group.add(T.veh.U);
    T.curLeg = -1;
  }
  function makeTrain(prod) {
    var g = new THREE.Group(), n = prod === 'S' ? 3 : 2, len = prod === 'S' ? 0.2 : 0.17;
    for (var i = 0; i < n; i++) {
      var body = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.095), new THREE.MeshLambertMaterial({ color: 0xffffff })); body.position.x = -i * (len + 0.015); body.userData.body = 1; g.add(body);
      var win = new THREE.Mesh(new THREE.BoxGeometry(len * 0.8, 0.032, 0.1), new THREE.MeshLambertMaterial({ color: 0x1f2a36 })); win.position.set(-i * (len + 0.015), 0.025, 0); g.add(win);
    }
    g.userData.n = n; g.userData.len = len; return g;
  }
  function styleTrain(g, col) { g.children.forEach(function (c) { if (c.userData.body) c.material.color.set(col); }); }
  function place3D() { if (!three.r) return; resize(); var m = pointAt(live.p); three.camPos.set(m.x - Math.cos(m.ang) * 2.5, 1.7, m.y - Math.sin(m.ang) * 2.5); three.look.set(m.x, 0.1, m.y); }
  function render3D(dt) {
    var T = three, o = overlay, p = live.p, m = pointAt(p), li = clamp(R.legAt(o.path, Math.min(p, o.path.pts.length - 1.001)), 0, o.route.legs.length - 1), lg = o.route.legs[li], hgt = h3(lg.p);
    if (T.curLeg !== li) { T.curLeg = li; T.veh.S.visible = lg.p === 'S'; T.veh.U.visible = lg.p === 'U'; styleTrain(T.veh[lg.p], lg.c); }
    var v = T.veh[lg.p]; v.position.set(m.x, hgt + 0.08, m.y); v.rotation.y = -m.ang;
    var back = 2.5, h = lg.p === 'U' ? 1.5 : 1.7, tx = m.x - Math.cos(m.ang) * back, tz = m.y - Math.sin(m.ang) * back;
    T.camPos.x += (tx - T.camPos.x) * 0.06; T.camPos.y += (h - T.camPos.y) * 0.06; T.camPos.z += (tz - T.camPos.z) * 0.06;
    var lx = m.x + Math.cos(m.ang) * 0.7, lz = m.y + Math.sin(m.ang) * 0.7; T.look.x += (lx - T.look.x) * 0.12; T.look.y += (hgt - T.look.y) * 0.12; T.look.z += (lz - T.look.z) * 0.12;
    T.cam.position.copy(T.camPos); T.cam.lookAt(T.look); T.r.render(T.scene, T.cam);
  }

  // ---------- More page ----------
  function applyTheme() { document.body.classList.toggle('dark', !!store.dark); $('tDark').classList.toggle('on', !!store.dark); $('tStep').classList.toggle('on', !!store.step); $('tLbl').classList.toggle('on', !!store.lbl); var tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.content = store.dark ? '#262624' : '#ffffff'; schedule(); }
  $('tDark').onclick = function () { store.dark = !store.dark; save(); applyTheme(); if (live.is3d && three.r) build3D(); };
  $('tStep').onclick = function () { store.step = !store.step; save(); applyTheme(); toast('Step-free routing is planned for a later version'); };
  $('tLbl').onclick = function () { store.lbl = !store.lbl; save(); applyTheme(); };
  function renderMoreSummary() {
    $('mFavS').textContent = store.fav.length ? store.fav.length + ' saved' : 'No favorites yet';
    $('mRecS').textContent = store.rec.length ? store.rec[0][0] + ' to ' + store.rec[0][1] : 'None yet';
  }
  function modal(html) { $('modalBox').innerHTML = html + '<div style="margin-top:14px"><button class="btn alt" style="width:100%" id="mClose">Close</button></div>'; $('modal').classList.add('on'); $('mClose').onclick = function () { $('modal').classList.remove('on'); }; }
  $('modal').addEventListener('pointerdown', function (e) { if (e.target === $('modal')) $('modal').classList.remove('on'); });
  $('mFav').onclick = function () {
    modal('<h3>Favorites</h3>' + (store.fav.length ? store.fav.map(function (n) { var s = R.byName(n); return '<div class="li" data-n="' + esc(n) + '" style="padding-left:0;padding-right:0"><span class="tx">' + esc(n) + '</span>' + (s ? badges(s) : '') + '</div>'; }).join('') : '<p class="mute">Tap a station on the map and press the star to save it here.</p>'));
    $('modalBox').querySelectorAll('[data-n]').forEach(function (el) { el.onclick = function () { $('modal').classList.remove('on'); go('pMap'); var s = R.byName(el.dataset.n); if (s) { filterFor(s); selectStation(s.i, true); } }; });
  };
  $('mRec').onclick = function () {
    modal('<h3>Recent trips</h3>' + (store.rec.length ? store.rec.map(function (r, i) { return '<div class="li" data-i="' + i + '" style="padding-left:0;padding-right:0"><span class="tx">' + esc(r[0]) + ' &rarr; ' + esc(r[1]) + '</span></div>'; }).join('') : '<p class="mute">Your last trips will appear here.</p>'));
    $('modalBox').querySelectorAll('[data-i]').forEach(function (el) { el.onclick = function () { var r = store.rec[+el.dataset.i]; $('modal').classList.remove('on'); nav.from = R.byName(r[0]); nav.to = R.byName(r[1]); fq.value = nav.from.name; tq.value = nav.to.name; go('pNav'); compute(); }; });
  };
  $('mDis').onclick = function () { modal('<h3>Service updates</h3><p>Live disruptions, construction and replacement buses will be shown here once a real time data source is connected.</p><p class="mute">Planned source: the VBB open data interface.</p>'); };
  $('mTic').onclick = function () { modal('<h3>Tickets and zones</h3><p>Berlin public transport uses three fare zones.</p><table class="z"><tr><th>Zone</th><th>Area</th></tr><tr><td><b>A</b></td><td>Inside the S-Bahn ring and a bit beyond</td></tr><tr><td><b>B</b></td><td>The rest of Berlin up to the city border</td></tr><tr><td><b>C</b></td><td>Potsdam and the surrounding area, BER airport</td></tr></table><p>One ticket works on S-Bahn, U-Bahn, tram, bus and the regional ferries within its zones. Tickets must be validated before the first ride unless bought as an app or mobile ticket.</p><p class="mute">Always check current prices on the official BVG or VBB pages. Ticket sales inside this app may follow later.</p>'); };
  $('mShare').onclick = function () { var t = 'Berlin Route: an easier way to understand the Berlin S-Bahn and U-Bahn.'; if (navigator.share) navigator.share({ text: t }).catch(function () {}); else toast('Sharing not available here'); };
  $('mFb').onclick = function () { modal('<h3>Send feedback</h3><p>Tell us what is confusing, missing or wrong. A feedback form and email address will be added before release.</p>'); };
  $('mPriv').onclick = function () { modal('<h3>Privacy</h3><p>This version has no account, no tracking and no ads. Favorites and recent trips stay on your device.</p><p class="mute">A full privacy policy is required for the store listing and will be added before release.</p>'); };
  $('mAbout').onclick = function () { modal('<h3>About Berlin Route</h3><p>Version 0.2 (preview). A simplified S-Bahn and U-Bahn map with route finding for newcomers to Berlin.</p><p class="mute">' + esc(NET.credit) + '</p><p class="mute">Line and station names and colors are facts from open data. This map is an original drawing and is not the official BVG or S-Bahn Berlin map. This app is not affiliated with BVG, S-Bahn Berlin or VBB.</p><p class="mute">Travel times are estimates. Lines S4 and S45 are not included yet.</p><p class="mute">3D view uses three.js (MIT).</p>'); };

  // ---------- init ----------
  applyTheme(); resize(); fitAll(); renderHome(); window.__app = { R: R, go: go, nav: nav, setFrom: setFrom, setTo: setTo, compute: compute, startNav: startNav, live: live, selectStation: selectStation, view: view, ST: ST, showOnMap: showOnMap, setFilter: function (f) { var b = document.querySelector('#filters [data-f="' + f + '"]'); if (b) b.click(); } };

  // test hook: index.html#from=A&to=B&act=show|start&p=pNav&f=S&d3=1&sel=Name
  (function () {
    var h = location.hash.slice(1); if (!h) return;
    var q = {}; h.split('&').forEach(function (kv) { var a = kv.split('='); q[a[0]] = decodeURIComponent(a[1] || ''); });
    if (q.dark) { store.dark = true; applyTheme(); }
    if (q.f) window.__app.setFilter(q.f);
    if (q.from) setFrom(R.byName(q.from)); if (q.to) setTo(R.byName(q.to));
    if (q.sel) { selectStation(R.byName(q.sel).i, true); }
    if (q.zoom) { view.z = z0 * +q.zoom; schedule(); }
    if (q.act === 'show') showOnMap(nav.routes[+(q.r || 0)]);
    if (q.act === 'start') { startNav(nav.routes[+(q.r || 0)]); if (q.skip) live.t0 -= 1e5; if (q.adv) { live.adv = +q.adv; } if (q.d3) { setTimeout(function () { $('viewsw').style.display = 'flex'; $('viewsw').click(); }, +q.d3); } }
    if (q.p) go(q.p);
  })();
})();
