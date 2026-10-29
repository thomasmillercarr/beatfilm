// beatfilm runtime: small helpers for a film page drawn purely from time.
// The page calls BF.film({...}); the renderer drives film.render(t, f) frame by frame, and in a normal
// browser (or an artifact) the same page plays live, synced to its audio.
(() => {
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, u) => a + (b - a) * u;
  const invlerp = (a, b, v) => clamp((v - a) / (b - a));

  // ---- easing (u in 0..1) ----
  const ease = {
    linear: u => u,
    inQuad: u => u * u, outQuad: u => 1 - (1 - u) ** 2, inOutQuad: u => u < .5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2,
    inCubic: u => u ** 3, outCubic: u => 1 - (1 - u) ** 3, inOutCubic: u => u < .5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2,
    inQuart: u => u ** 4, outQuart: u => 1 - (1 - u) ** 4, inOutQuart: u => u < .5 ? 8 * u ** 4 : 1 - (-2 * u + 2) ** 4 / 2,
    inExpo: u => u <= 0 ? 0 : 2 ** (10 * u - 10), outExpo: u => u >= 1 ? 1 : 1 - 2 ** (-10 * u),
    inOutExpo: u => u <= 0 ? 0 : u >= 1 ? 1 : u < .5 ? 2 ** (20 * u - 10) / 2 : (2 - 2 ** (-20 * u + 10)) / 2,
    outBack: u => 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2,
    inBack: u => 2.70158 * u ** 3 - 1.70158 * u ** 2,
    outElastic: u => u <= 0 ? 0 : u >= 1 ? 1 : 2 ** (-10 * u) * Math.sin((u * 10 - .75) * 2 * Math.PI / 3) + 1,
    // critically-damped-ish spring settling at 1; k = stiffness (bounciness rises as damping z falls)
    spring: (u, k = 12, z = 0.45) => u <= 0 ? 0 : 1 - Math.exp(-z * k * u) * Math.cos(k * Math.sqrt(1 - z * z) * u),
  };
  const E = e => typeof e === 'function' ? e : ease[e || 'inOutCubic'];

  // map t from [t0,t1] to [a,b] with easing, clamped
  const map = (t, t0, t1, a = 0, b = 1, e) => lerp(a, b, E(e)(invlerp(t0, t1, t)));

  // keyframes: kf(t, [[t0, v0], [t1, v1, 'outExpo'], ...]) ; v may be number or array; ease on the segment's end key
  function kf(t, keys, e) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, ek] = keys[i];
      if (t < t1) {
        const [t0, v0] = keys[i - 1], u = E(ek || e)(invlerp(t0, t1, t));
        return Array.isArray(v0) ? v0.map((x, j) => lerp(x, v1[j], u)) : lerp(v0, v1, u);
      }
    }
    return keys[keys.length - 1][1];
  }

  // ---- deterministic randomness ----
  const hash = (...n) => { let h = 2166136261; for (const x of n) { h ^= Math.floor(x * 1000) | 0; h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; };
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  // smooth 1D value noise in [-1, 1]
  const noise = (x, seed = 0) => { const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f); return lerp(hash(i, seed), hash(i + 1, seed), s) * 2 - 1; };
  // camera shake offsets {x, y, r} at time t: amplitude px, frequency Hz
  const shake = (t, amp = 10, freq = 18, seed = 1) => ({ x: amp * noise(t * freq, seed), y: amp * noise(t * freq, seed + 7), r: amp * 0.08 * noise(t * freq, seed + 13) });

  // ---- beats ----
  // B = BF.beats(map) where map is beats.json. Beat/bar indices may be fractional.
  function beats(m) {
    const per = m.beat, bt = m.beats, db = m.downbeats;
    const t = b => { const i = Math.floor(b), f = b - i; const a = bt[i] ?? (bt[0] + i * per); return a + f * per; };
    const bar = n => t(Math.round((db[0] - bt[0]) / per) + n * 4);
    const idx = (time, list = bt) => { let lo = 0, hi = list.length - 1, r = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (list[mid] <= time) { r = mid; lo = mid + 1; } else hi = mid - 1; } return r; };
    // 1 on each event, decaying exponentially (decay per second); list defaults to beats
    const pulse = (time, decay = 8, list = bt) => { const i = idx(time, list); return i < 0 ? 0 : Math.exp(-(time - list[i]) * decay); };
    const since = (time, list = bt) => { const i = idx(time, list); return i < 0 ? Infinity : time - list[i]; };
    const energy = time => m.energy[clamp(idx(time), 0, m.energy.length - 1)] ?? 0;
    return { ...m, t, bar, idx, pulse, since, energy };
  }

  // ---- DOM helpers ----
  const $ = (s, root = document) => root.querySelector(s), $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const tf = ({ x = 0, y = 0, z = 0, s = 1, sx = 1, sy = 1, r = 0, rx = 0, ry = 0, skx = 0 } = {}) =>
    `translate3d(${x}px,${y}px,${z}px) rotate(${r}deg) rotateX(${rx}deg) rotateY(${ry}deg) skewX(${skx}deg) scale(${s * sx},${s * sy})`;
  // set(el, {x, y, s, r, o, blur, ...}) ; other keys are written as styles
  function set(el, p) {
    if (typeof el === 'string') el = $(el);
    if (!el) return;
    const { x, y, z, s, sx, sy, r, rx, ry, skx, o, blur, ...rest } = p;
    if ([x, y, z, s, sx, sy, r, rx, ry, skx].some(v => v !== undefined)) el.style.transform = tf(p);
    // '' (not 'visible') so a hidden parent scene still hides its children
    if (o !== undefined) { el.style.opacity = o; el.style.visibility = o <= 0.001 ? 'hidden' : ''; }
    if (blur !== undefined) el.style.filter = blur > 0.05 ? `blur(${blur}px)` : 'none';
    Object.assign(el.style, rest);
  }
  // wrap each char/word of el in a span once (do it at setup, before ready); returns the spans
  function split(el, mode = 'chars') {
    if (typeof el === 'string') el = $(el);
    const text = el.textContent; el.textContent = '';
    const parts = mode === 'words' ? text.split(/(\s+)/) : [...text];
    return parts.map(p => {
      if (/^\s+$/.test(p)) { el.append(p); return null; }
      const s = document.createElement('span'); s.textContent = p; s.style.display = 'inline-block'; s.style.whiteSpace = 'pre'; el.append(s); return s;
    }).filter(Boolean);
  }
  // directional motion blur via a per-element SVG filter (dx, dy in px of blur along each axis)
  let svg; const mb = new WeakMap(); let mbN = 0;
  function mblur(el, dx, dy = 0) {
    if (typeof el === 'string') el = $(el);
    if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', 0); svg.setAttribute('height', 0); svg.style.position = 'absolute'; document.body.append(svg); }
    let g = mb.get(el);
    if (!g) { const id = 'bfmb' + mbN++; svg.insertAdjacentHTML('beforeend', `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0 0"/></filter>`); g = svg.lastElementChild.firstElementChild; mb.set(el, g); g.dataset.id = id; }
    const on = Math.abs(dx) + Math.abs(dy) > 0.1;
    g.setAttribute('stdDeviation', `${Math.abs(dx)} ${Math.abs(dy)}`);
    el.style.filter = on ? `url(#${g.dataset.id})` : 'none';
  }
  // film grain; call the returned fn(f) every frame. Live: a canvas overlay. Render: the renderer adds the
  // same grain in ffmpeg (an in-page 4K overlay blend costs ~3x render time), so this only records settings.
  function grain(amount = 0.06, size = 2) {
    if (window.__BF_RENDER) { window.film.grain = { amount, size }; return () => {}; }
    const c = document.createElement('canvas'), st = $('#stage');
    c.width = Math.ceil(st.offsetWidth / size); c.height = Math.ceil(st.offsetHeight / size);
    Object.assign(c.style, { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', mixBlendMode: 'overlay', zIndex: 9999, imageRendering: 'pixelated' });
    st.append(c);
    const ctx = c.getContext('2d'), img = ctx.createImageData(c.width, c.height), d = img.data;
    return f => { const r = rng(f * 7919 + 1); for (let i = 0; i < d.length; i += 4) { const v = 128 + (r() - 0.5) * 255 * amount * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } ctx.putImageData(img, 0, 0); };
  }
  const fmt = (v, dec = 0) => v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  // ---- film ----
  // BF.film({ width, height, fps, audio, beats: 'beats.json', fonts: ['800 100px Display'], setup(B) => render(t, f) })
  // duration defaults to the beat map's cut; or pass duration / frames, ready, render(t, f) yourself.
  function film(cfg) {
    const fps = cfg.fps || 30, st = $('#stage');
    Object.assign(st.style, { position: 'absolute', left: 0, top: 0, width: cfg.width + 'px', height: cfg.height + 'px', overflow: 'hidden', transformOrigin: '0 0' });
    const fl = window.film = { width: cfg.width, height: cfg.height, fps, frames: cfg.frames || 0, audio: cfg.audio, render: cfg.render };
    const imgs = $$('img', st).map(i => i.decode().catch(() => console.error('image failed: ' + i.src)));
    const fonts = (cfg.fonts || []).map(f => document.fonts.load(f).then(r => { if (!r.length) console.error('font not loaded: ' + f); }));
    const bm = cfg.beats ? (typeof cfg.beats === 'string' ? fetch(cfg.beats).then(r => r.json()) : Promise.resolve(cfg.beats)).then(beats) : null;
    fl.ready = Promise.all([bm, cfg.ready, ...fonts, ...imgs]).then(async ([B]) => {
      if (B) window.B = B;
      if (cfg.setup) fl.render = (await cfg.setup(B)) || fl.render;
      fl.frames ||= Math.round((cfg.duration ?? B?.duration) * fps);
      await document.fonts.ready;
    });
    if (!window.__BF_RENDER) fl.ready.then(() => player(fl));
    return fl;
  }

  // live preview: fits the stage to the window, plays the audio, renders from the audio clock
  function player(fl) {
    for (const e of [document.documentElement, document.body]) Object.assign(e.style, { background: '#000', colorScheme: 'dark', margin: 0, overflow: 'hidden' });
    const st = $('#stage'), dur = fl.frames / fl.fps;
    const fit = () => { const s = Math.min(innerWidth / fl.width, (innerHeight - 44) / fl.height); st.style.transform = `translate(${(innerWidth - fl.width * s) / 2}px,${(innerHeight - 44 - fl.height * s) / 2}px) scale(${s})`; };
    addEventListener('resize', fit); fit();
    const bar = document.createElement('div');
    bar.innerHTML = `<button id="bfp" aria-label="Play">▶</button><input id="bfs" type="range" min="0" max="${dur}" step="0.001" value="0" aria-label="Scrub"><span id="bft">0.00</span><span id="bfc" style="color:#888;font-size:11px;max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>`;
    Object.assign(bar.style, { position: 'fixed', left: 0, right: 0, bottom: 0, display: 'flex', gap: '12px', alignItems: 'center', padding: '0 max(16px, env(safe-area-inset-right, 0px)) env(safe-area-inset-bottom, 0px) max(16px, env(safe-area-inset-left, 0px))', height: 'calc(44px + env(safe-area-inset-bottom, 0px))', background: '#111', color: '#ddd', font: '13px ui-monospace,monospace', zIndex: 99999, boxSizing: 'border-box' });
    document.body.append(bar);
    const btn = $('#bfp'), sc = $('#bfs'), tt = $('#bft');
    $('#bfc').textContent = fl.credit || window.__BF_CREDIT || ''; // music attribution (CC BY) when known
    Object.assign(btn.style, { background: 'none', border: '1px solid #555', color: '#fff', borderRadius: '6px', width: '36px', height: '28px', cursor: 'pointer' });
    sc.style.flex = 1;
    const au = fl.audio ? new Audio(fl.audio) : null;
    let playing = false, t0 = 0, clock = 0;
    const now = () => au ? au.currentTime : playing ? clock + (performance.now() - t0) / 1000 : clock;
    const draw = t => { t = clamp(t, 0, dur - 1e-6); fl.render(t, Math.floor(t * fl.fps)); sc.value = t; tt.textContent = t.toFixed(2); };
    const seek = t => { if (au) au.currentTime = t; clock = t; t0 = performance.now(); draw(t); };
    const toggle = () => { playing = !playing; btn.textContent = playing ? '❚❚' : '▶'; if (au) playing ? au.play() : au.pause(); else { clock = now(); t0 = performance.now(); } if (playing && now() >= dur - 0.05) seek(0); };
    btn.onclick = toggle; sc.oninput = () => seek(+sc.value);
    addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); toggle(); } });
    (function loop() { if (playing) { const t = now(); if (t >= dur) { toggle(); seek(dur - 1e-6); } else draw(t); } requestAnimationFrame(loop); })();
    draw(0);
  }

  window.BF = { clamp, lerp, invlerp, map, ease, kf, hash, rng, noise, shake, beats, $, $$, tf, set, split, mblur, grain, fmt, film };
})();
