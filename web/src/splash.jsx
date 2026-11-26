import React, { useEffect, useRef } from 'react';
import { tr } from './i18n.js';
import { SPLASH_HTML } from './splash-dawn.js';
import './splash-dawn.css';

/* Start clip, 6.6 seconds: "Dawn + City".
 * A night sky over a tiny 3D Berlin: the sun rises and turns the sky pink and orange, the city grid rises with its blue, green and
 * red lines, a yellow route finds its way with two transfers and a pin drops in. Then the sun turns into the Bearline ring, the
 * bear wakes up and the name appears. Everything is plain CSS and SVG animation (see splash-dawn.css), so the browser runs it
 * on its own clock. This component only scales the 390 x 844 stage to the screen, plays the soft sound and handles skipping.
 * Tap = skip to the last second. A slow phone skips ahead by itself. Reduced motion shows the finished frame. */
const T_END = 6.6, T_SKIP = 5.4;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default function Splash({ onDone }) {
  const wrap = useRef(null), stage = useRef(null);
  const tag = tr('splashTag');
  const html = SPLASH_HTML.replace('__TAG__', esc(tag));
  useEffect(() => {
    const root = stage.current, host = wrap.current;
    let done = false, raf = 0, frames = 0, slow = 0, off = 0, ac = null, sndTimers = [];
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mine = () => (document.getAnimations ? document.getAnimations().filter((a) => a.effect && a.effect.target && root.contains(a.effect.target)) : []);
    const seek = (sec, pause) => { void root.offsetHeight; mine().forEach((a) => { try { if (pause) a.pause(); if (pause || (a.currentTime || 0) < sec * 1000) a.currentTime = sec * 1000; } catch (e) { /* finished */ } }); };
    const fit = () => { const s = Math.min(window.innerWidth / 390, window.innerHeight / 844); root.style.transform = 'scale(' + s.toFixed(4) + ')'; };
    fit();

    // soft sound: a swell while the sun rises, two pings at the transfers, a short chime when the bear wakes. Plays only where the browser allows audio without a tap.
    const stopSound = () => { sndTimers.forEach(clearTimeout); sndTimers = []; };
    try {
      const AC = window.AudioContext || window.webkitAudioContext; let on = true; try { on = JSON.parse(localStorage.getItem('bl1') || '{}').sound !== false; } catch (e) { /* ignore */ }
      if (AC && on && !reduce && window.__splashT == null) {
        ac = new AC(); if (ac.state === 'suspended') ac.resume().catch(() => {});
        const tone = (f, at, dur, vol, type) => { const o = ac.createOscillator(), gn = ac.createGain(); o.type = type || 'sine'; o.frequency.value = f; o.connect(gn); gn.connect(ac.destination); const t = ac.currentTime + at; gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(vol, t + 0.03); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.start(t); o.stop(t + dur + 0.05); return o; };
        const sw = ac.createOscillator(), sg = ac.createGain(); sw.type = 'triangle'; sw.frequency.setValueAtTime(110, ac.currentTime); sw.frequency.exponentialRampToValueAtTime(330, ac.currentTime + 4); sw.connect(sg); sg.connect(ac.destination);
        sg.gain.setValueAtTime(0.0001, ac.currentTime); sg.gain.exponentialRampToValueAtTime(0.045, ac.currentTime + 3.6); sg.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 4.4); sw.start(); sw.stop(ac.currentTime + 4.5);
        sndTimers.push(setTimeout(() => tone(740, 0, 0.3, 0.04), 3200), setTimeout(() => tone(880, 0, 0.35, 0.05), 3700));
        sndTimers.push(setTimeout(() => { if (!done && ac) { tone(660, 0, 0.9, 0.06); tone(990, 0.08, 1.0, 0.045); } }, 4700));
      }
    } catch (e) { ac = null; }

    const finish = () => { if (done) return; done = true; stopSound(); host.classList.add('out'); setTimeout(onDone, 420); };

    if (window.__splashT != null) { seek(window.__splashT, true); return () => {}; } // test hook: show one frame and stay
    if (reduce) { seek(T_END, true); const id = setTimeout(finish, 900); return () => clearTimeout(id); }

    const t0 = performance.now(); let last = t0;
    const jump = (sec) => { const now = (performance.now() - t0) / 1000 + off; if (now >= sec) return; off += sec - now; seek(sec, false); stopSound(); };
    const loop = (now) => {
      const dt = now - last; last = now; frames++;
      if (frames > 6 && frames < 40 && dt > 70) slow++;
      if (slow > 14) { slow = -1e9; jump(5.6); }
      if ((now - t0) / 1000 + off >= T_END) { finish(); return; }
      raf = requestAnimationFrame(loop);
    };
    const onSkip = () => { if (!done) jump(T_SKIP); };
    host.addEventListener('pointerdown', onSkip);
    window.addEventListener('resize', fit);
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); stopSound(); host.removeEventListener('pointerdown', onSkip); window.removeEventListener('resize', fit); try { ac && ac.close(); } catch (e) { /* closed */ } };
    // eslint-disable-next-line
  }, []);
  return (
    <div className={'splash2' + (/[A-Za-z]/.test(tag) ? '' : ' sd-nl')} ref={wrap} role="status" aria-label="Bearline">
      <div className="sd-stage" ref={stage} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
