#!/usr/bin/env node
// Render a film page (index.html calling BF.film) to MP4 with headless Chrome + ffmpeg. Zero npm deps:
// Chrome is driven over the DevTools protocol with Node's built-in WebSocket.
//
//   node render.mjs init   <dir>                       copy the starter page + runtime into a new film dir
//   node render.mjs serve  <dir>                       live preview at http://127.0.0.1:<port>/
//   node render.mjs check  <dir>                       contract, errors, fonts, network, determinism, speed
//   node render.mjs stills <dir> [--at 0,2.5s,f120] [--res 1080]   -> out/stills/*.jpg + out/sheet.jpg
//   node render.mjs render <dir> [--res 4k|1080|720] [--workers N] [--frames A:B] [--crf 16]
//                                                      -> out/film_<res>.mp4 (4k = long edge 3840)
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, createReadStream } from 'node:fs';
import { tmpdir, cpus } from 'node:os';
import { createHash } from 'node:crypto';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '..');
const args = process.argv.slice(2), [cmd, dirArg] = args;
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const die = m => { console.error('error: ' + m); process.exit(1); };
if (!cmd || !dirArg) die('usage: render.mjs <init|serve|check|stills|render> <filmDir> [options]');
const DIR = resolve(dirArg);
const log = (...m) => console.log(`[${(performance.now() / 1000).toFixed(1)}s]`, ...m);

// ---------- init ----------
if (cmd === 'init') {
  if (existsSync(join(DIR, 'index.html'))) die(`${DIR} already has an index.html`);
  mkdirSync(DIR, { recursive: true });
  cpSync(join(ROOT, 'templates', 'index.html'), join(DIR, 'index.html'));
  cpSync(join(ROOT, 'runtime', 'bf.js'), join(DIR, 'bf.js'));
  for (const d of ['audio', 'assets', 'fonts']) mkdirSync(join(DIR, d), { recursive: true });
  console.log(`film dir ready: ${DIR}`); process.exit(0);
}
if (!existsSync(join(DIR, 'index.html'))) die(`no index.html in ${DIR}`);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.mp4': 'video/mp4' };

// ---------- bundle: one self-contained page (runtime, beats, fonts, assets, audio inlined) for an Artifact / sharing ----------
if (cmd === 'bundle') {
  const uri = p => `data:${MIME[extname(p).toLowerCase()] || 'application/octet-stream'};base64,${readFileSync(join(DIR, p)).toString('base64')}`;
  const local = p => !/^(https?:|data:|#)/.test(p) && existsSync(join(DIR, p));
  // music attribution (CC BY) shown in the player bar
  const credit = existsSync(join(DIR, 'CREDITS.txt'))
    ? `<script>window.__BF_CREDIT = ${JSON.stringify(readFileSync(join(DIR, 'CREDITS.txt'), 'utf8').trim().split(/\r?\n/).slice(0, 2).join(' · '))};</script>` : '';
  // local scripts become inline <script>s (CSP blocks data: scripts); they go back in last, so the runtime's own
  // comments can't be mistaken for the film's beats/audio config
  const scripts = [];
  let html = readFileSync(join(DIR, 'index.html'), 'utf8')
    .replace(/<script src="([^"]+)"><\/script>/g, (m, p) => local(p) ? `\u0000${scripts.push(readFileSync(join(DIR, p), 'utf8')) - 1}\u0000` : m)
    .replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, p) => local(p) ? `url(${uri(p)})` : m)
    .replace(/(src|href)="([^"]+)"/g, (m, a, p) => local(p) ? `${a}="${uri(p)}"` : m)
    .replace(/beats:\s*['"]([^'"]+)['"]/, (m, p) => local(p) ? `beats: ${readFileSync(join(DIR, p), 'utf8')}` : m)
    .replace(/audio:\s*['"]([^'"]+)['"]/, (m, p) => local(p) ? `audio: '${uri(p)}'` : m)
    .replace(/\u0000(\d+)\u0000/g, (m, i) => (i === '0' ? credit : '') + `<script>${scripts[i]}</script>`)
    .replace(/<!doctype[^>]*>|<\/?html[^>]*>|<\/?head>|<\/?body>/gi, ''); // the Artifact host adds the document shell (charset stays, for sharing the file directly)
  const out = join(DIR, 'out', 'preview.html'); mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, html);
  console.log(`self-contained preview (${(html.length / 1e6).toFixed(1)} MB) -> ${out}`); process.exit(0);
}

// ---------- static server (the page must load only from here) ----------
function serve(port = 0) {
  return new Promise(res => {
    const srv = createServer((req, rsp) => {
      const p = resolve(DIR, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
      if (!p.startsWith(DIR + sep) && p !== DIR || !existsSync(p) || statSync(p).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'content-type': MIME[extname(p).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
      createReadStream(p).pipe(rsp);
    }).listen(port, '127.0.0.1', () => res(srv));
  });
}
if (cmd === 'serve') {
  const srv = await serve(+opt('port', 0));
  console.log(`live preview: http://127.0.0.1:${srv.address().port}/   (Ctrl+C to stop)`);
  await new Promise(() => {});
}

// ---------- Chrome over CDP ----------
function findChrome() {
  const c = [process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return c.find(p => p && existsSync(p)) || die('Chrome not found; set CHROME_PATH');
}
const CHROME = findChrome();

async function launch() {
  const prof = mkdtempSync(join(tmpdir(), 'bf-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--disable-extensions', '--autoplay-policy=no-user-gesture-required', ...(opt('gpu') === 'off' ? ['--disable-gpu'] : []), 'about:blank'], { stdio: 'ignore' });
  const portFile = join(prof, 'DevToolsActivePort');
  let port; // Chrome holds the file locked while writing it (EBUSY on Windows): keep polling
  for (let i = 0; !port; i++) {
    if (i > 300) die('Chrome did not start');
    try { const t = readFileSync(portFile, 'utf8'); if (t.includes('\n')) port = t.split('\n')[0]; } catch {}
    if (!port) await new Promise(r => setTimeout(r, 50));
  }
  const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map(), subs = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.j(new Error(m.error.message)) : p.r(m.result); }
    else (subs.get(m.method) || []).forEach(f => f(m.params));
  };
  const send = (method, params = {}) => new Promise((r, j) => { pend.set(++id, { r, j }); ws.send(JSON.stringify({ id, method, params })); });
  const on = (ev, f) => subs.set(ev, [...(subs.get(ev) || []), f]);
  const close = () => { try { ws.close(); } catch {} proc.kill(); setTimeout(() => { try { rmSync(prof, { recursive: true, force: true }); } catch {} }, 500); };
  return { send, on, close };
}

// open the film page in a fresh Chrome at the given device scale; returns helpers
async function openFilm(url, scale = 1, probe = null) {
  const b = await launch();
  const errors = [], requests = [];
  b.on('Runtime.exceptionThrown', p => errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));
  b.on('Runtime.consoleAPICalled', p => { if (p.type === 'error') errors.push(p.args.map(a => a.value ?? a.description).join(' ')); });
  b.on('Network.requestWillBeSent', p => requests.push(p.request.url));
  b.on('Network.loadingFailed', p => { if (!p.canceled) errors.push('load failed: ' + p.errorText); });
  await Promise.all([b.send('Runtime.enable'), b.send('Network.enable'), b.send('Page.enable')]);
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__BF_RENDER = true;' });
  const W = probe?.width || 1920, H = probe?.height || 1080;
  await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: scale, mobile: false });
  const loaded = new Promise(r => b.on('Page.loadEventFired', r));
  await b.send('Page.navigate', { url }); await loaded;
  const ev = async expr => {
    const r = await b.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const info = await ev(`(async () => { if (!window.film) throw new Error('page did not call BF.film(...) / set window.film');
    await Promise.race([film.ready, new Promise((_, j) => setTimeout(() => j(new Error('film.ready timed out after 60s')), 60000))]);
    const bad = [...document.fonts].filter(f => f.status === 'error').map(f => f.family);
    return { width: film.width, height: film.height, fps: film.fps, frames: film.frames, audio: film.audio || null, grain: film.grain || null, badFonts: bad,
      fonts: [...new Set([...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight))] }; })()`);
  const frame = async (f, fmt = 'jpeg') => {
    await ev(`Promise.resolve(film.render(${f} / film.fps, ${f})).then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))`);
    const shot = await b.send('Page.captureScreenshot', { format: fmt, ...(fmt === 'jpeg' ? { quality: +opt('q', 94) } : {}), optimizeForSpeed: true });
    return Buffer.from(shot.data, 'base64');
  };
  return { ...b, info, frame, errors, requests };
}

const srv = await serve();
const URL0 = `http://127.0.0.1:${srv.address().port}/index.html`;
const done = code => { srv.close(); process.exit(code); };

// probe the page once at scale 1 for its declared size
const probe = await openFilm(URL0, 1);
const F = probe.info;
probe.close();
if (!F.width || !F.height || !F.fps || !F.frames) die('window.film needs width, height, fps and frames/duration: ' + JSON.stringify(F));
if (F.width % 2 || F.height % 2) die('width and height must be even');
const RES = { '4k': 3840, '2160': 3840, '1440': 2560, '1080': 1920, '720': 1280, preview: 960 };
const scaleFor = r => (RES[r] || +r) / Math.max(F.width, F.height);
const parseAt = s => s.split(',').map(x => x.endsWith('s') ? Math.round(parseFloat(x) * F.fps) : x.startsWith('f') ? +x.slice(1) : +x).map(f => Math.min(F.frames - 1, Math.max(0, f)));
const ff = (a, input) => new Promise((r, j) => { const p = spawn('ffmpeg', ['-y', '-v', 'error', ...a], { stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'] }); p.on('exit', c => c ? j(new Error('ffmpeg failed ' + c)) : r()); if (input) input(p.stdin); });

// ---------- check ----------
if (cmd === 'check') {
  const problems = [], warns = [];
  // static scan of the film's own code (bf.js is the runtime and is exempt)
  const own = readdirSync(DIR).filter(f => /\.(html|js|css)$/.test(f) && f !== 'bf.js');
  for (const f of own) {
    const src = readFileSync(join(DIR, f), 'utf8');
    for (const [re, why] of [[/Math\.random/, 'Math.random (use BF.rng/BF.hash)'], [/Date\.now|new Date\(/, 'Date'], [/performance\.now/, 'performance.now'],
      [/setTimeout|setInterval/, 'timers'], [/requestAnimationFrame/, 'requestAnimationFrame'], [/<video/i, '<video> (not frame accurate: use an image sequence)']])
      if (re.test(src)) problems.push(`${f}: ${why}: frames must be a pure function of t`);
    if (/(^|[;{\s])(animation|transition)\s*:/m.test(src)) warns.push(`${f}: CSS animation/transition found; make sure it is none or paused and seeked from t`);
    for (const m of src.matchAll(/(?:src|href)\s*=\s*["'](https?:)?\/\/(?!127\.0\.0\.1)[^"']+/g)) problems.push(`${f}: remote URL ${m[0]}: bundle it into the film dir`);
  }
  const p = await openFilm(URL0, scaleFor('preview'), F);
  if (F.badFonts.length) problems.push('fonts failed to load: ' + F.badFonts.join(', '));
  if (F.audio && !existsSync(join(DIR, F.audio))) problems.push('audio file missing: ' + F.audio);
  if (!F.audio) warns.push('no film.audio: the render will be silent');
  // determinism: the same frame must match regardless of what was drawn before it
  const probeF = [0, Math.floor(F.frames * 0.37), Math.floor(F.frames * 0.71), F.frames - 1];
  const h = b => createHash('md5').update(b).digest('hex');
  const t0 = performance.now();
  const first = []; for (const f of probeF) first.push(await p.frame(f, 'png'));
  const ms = (performance.now() - t0) / probeF.length;
  const again = []; for (const f of [...probeF].reverse()) again.unshift(await p.frame(f, 'png'));
  // GPU blur raster can wobble by a level or two; carried state shows up as a gross difference
  const tmpD = mkdtempSync(join(tmpdir(), 'bf-check-'));
  probeF.forEach((f, i) => {
    if (h(first[i]) === h(again[i])) return;
    writeFileSync(join(tmpD, 'a.png'), first[i]); writeFileSync(join(tmpD, 'b.png'), again[i]);
    const psnr = parseFloat((spawnSync('ffmpeg', ['-i', join(tmpD, 'a.png'), '-i', join(tmpD, 'b.png'), '-lavfi', 'psnr', '-f', 'null', '-']).stderr.toString().match(/average:([\d.]+|inf)/) || [])[1] ?? 0);
    if (psnr < 45) problems.push(`frame ${f} renders differently depending on the previous frame (PSNR ${psnr.toFixed(1)} dB): state carried between frames?`);
    else warns.push(`frame ${f} differs by raster noise only (PSNR ${psnr.toFixed(1)} dB)`);
  });
  rmSync(tmpD, { recursive: true, force: true });
  // blank-frame guard on a sample
  const blank = []; for (const f of parseAt('0,' + Array.from({ length: 7 }, (_, i) => Math.floor((i + 1) * F.frames / 8)).join(','))) {
    const png = await p.frame(f, 'png'); if (png.length < 6000) blank.push(f);
  }
  if (blank.length) warns.push('near-empty frames (single flat colour?): ' + blank.join(', '));
  const remote = p.requests.filter(u => !u.startsWith('http://127.0.0.1') && !u.startsWith('data:') && !u.startsWith('blob:'));
  if (remote.length) problems.push('network requests outside the film dir: ' + [...new Set(remote)].join(', '));
  problems.push(...p.errors.map(e => 'page error: ' + e));
  p.close();
  console.log(`film ${F.width}x${F.height} @${F.fps}fps, ${F.frames} frames (${(F.frames / F.fps).toFixed(2)}s), audio ${F.audio || '-'}`);
  console.log(`fonts loaded: ${F.fonts.join(', ') || 'none'}`);
  console.log(`~${ms.toFixed(0)} ms/frame at preview size (single instance)`);
  warns.forEach(w => console.log('WARN ' + w));
  problems.forEach(w => console.log('FAIL ' + w));
  console.log(problems.length ? `check failed (${problems.length})` : 'check passed');
  done(problems.length ? 1 : 0);
}

// ---------- stills ----------
if (cmd === 'stills') {
  const at = opt('at') ? parseAt(opt('at')) : Array.from({ length: 16 }, (_, i) => Math.round(i * (F.frames - 1) / 15));
  const out = join(DIR, 'out', 'stills'); rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  const p = await openFilm(URL0, scaleFor(opt('res', '1080')), F);
  const files = [];
  for (const f of at) { const name = `f${String(f).padStart(5, '0')}_${(f / F.fps).toFixed(2)}s.jpg`; writeFileSync(join(out, name), await p.frame(f)); files.push(name); }
  p.errors.forEach(e => console.log('page error: ' + e));
  p.close();
  // contact sheet with timecodes, 4 per row
  const font = ['C:/Windows/Fonts/arial.ttf', '/System/Library/Fonts/Helvetica.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].find(existsSync);
  const ft = font ? `fontfile=${font.replace(':', '\\\\:')}:` : ''; // filtergraph + option level escaping of the drive colon
  const cols = Math.max(2, Math.min(4, files.length)), rows = Math.ceil(files.length / cols), tw = 480, th = Math.round(tw * F.height / F.width / 2) * 2;
  const inputs = files.flatMap(n => ['-i', join(out, n)]);
  const fch = files.map((n, i) => `[${i}:v]scale=${tw}:${th},drawtext=${ft}text='${n.split('_')[1].replace('.jpg', '')}':x=8:y=8:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6[v${i}]`).join(';');
  const pads = Array.from({ length: cols * rows - files.length }, (_, i) => `color=c=black:s=${tw}x${th}:d=1[p${i}]`).join(';');
  const all = [...files.map((_, i) => `[v${i}]`), ...Array.from({ length: cols * rows - files.length }, (_, i) => `[p${i}]`)].join('');
  const layout = Array.from({ length: cols * rows }, (_, i) => `${(i % cols) * tw}_${Math.floor(i / cols) * th}`).join('|');
  await ff([...inputs, '-filter_complex', `${fch}${pads ? ';' + pads : ''};${all}xstack=inputs=${cols * rows}:layout=${layout}:fill=black`, '-frames:v', '1', '-q:v', '3', join(DIR, 'out', 'sheet.jpg')]);
  console.log(`${files.length} stills -> ${out}\ncontact sheet -> ${join(DIR, 'out', 'sheet.jpg')}`);
  done(0);
}

// ---------- render ----------
if (cmd === 'render') {
  const res = opt('res', '4k'), scale = scaleFor(res);
  const [a, b] = (opt('frames') || `0:${F.frames}`).split(':').map(Number);
  const total = b - a, W = Math.round(F.width * scale / 2) * 2, H = Math.round(F.height * scale / 2) * 2;
  const nw = Math.max(1, Math.min(+opt('workers', Math.min(8, Math.floor(cpus().length / 3))), Math.ceil(total / 30)));
  const tmp = mkdtempSync(join(tmpdir(), 'bf-render-'));
  log(`render ${total} frames at ${W}x${H} (${res}) with ${nw} Chrome workers`);
  const vf = `scale=${W}:${H}:flags=lanczos:in_color_matrix=bt601:in_range=full:out_color_matrix=bt709:out_range=tv,format=yuv420p`;
  // BF.grain() in render mode: luma noise at the film's grain cell size, overlay-blended (matches the live canvas grain)
  const G = F.grain, cell = G && G.size * scale;
  const filt = s => G ? ['-filter_complex', `[0:v]${vf}[b];color=c=gray:s=${Math.round(W / cell)}x${Math.round(H / cell)}:r=${F.fps},format=yuv420p,` +
    `noise=c0s=${Math.round(G.amount * 160)}:c0f=t:c0_seed=${s + 1},scale=${W}:${H}:flags=neighbor[g];[b][g]blend=all_mode=overlay:shortest=1,format=yuv420p[v]`, '-map', '[v]'] : ['-vf', vf];
  if (G) log(`grain ${G.amount} @ ${G.size}px added in the encode`);
  let doneN = 0; const tStart = performance.now();
  const chunk = Math.ceil(total / nw);
  const segs = await Promise.all(Array.from({ length: nw }, async (_, w) => {
    const s = a + w * chunk, e = Math.min(b, s + chunk); if (s >= e) return null;
    const seg = join(tmp, `seg${w}.mp4`);
    const p = await openFilm(URL0, scale, F);
    await ff(['-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(F.fps), '-i', '-', ...filt(s), '-c:v', 'libx264', '-preset', opt('preset', 'faster'),
      // crf 18 capped at ~45 Mbps for 4K (scaled by pixel count): grain is otherwise near-incompressible
      '-crf', opt('crf', '18'), '-maxrate', opt('maxrate', Math.max(8, Math.round(45 * W * H / 3840 / 2160)) + 'M'), '-bufsize', opt('bufsize', Math.max(16, Math.round(90 * W * H / 3840 / 2160)) + 'M'), '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-threads', String(Math.max(2, Math.floor(cpus().length / nw))), seg], async stdin => {
      try {
        for (let f = s; f < e; f++) {
          const buf = await p.frame(f);
          if (!stdin.write(buf)) await new Promise(r => stdin.once('drain', r));
          if (++doneN % 30 === 0) { const el = (performance.now() - tStart) / 1000; log(`${doneN}/${total} frames  ${(doneN / el).toFixed(1)} fps  eta ${((total - doneN) / (doneN / el)).toFixed(0)}s`); }
        }
      } catch (err) { console.error(`worker ${w}: ${err.message}`); process.exitCode = 1; }
      stdin.end(); p.errors.forEach(er => console.error('page error: ' + er)); p.close();
    });
    return seg;
  }));
  if (process.exitCode) { rmSync(tmp, { recursive: true, force: true }); done(1); }
  const list = join(tmp, 'list.txt'); writeFileSync(list, segs.filter(Boolean).map(s => `file '${s.replace(/\\/g, '/')}'`).join('\n'));
  const outDir = join(DIR, 'out'); mkdirSync(outDir, { recursive: true });
  const part = opt('frames') ? '_part' : '', outFile = join(outDir, `film_${res}${part}.mp4`);
  const audio = F.audio && existsSync(join(DIR, F.audio)) ? join(DIR, F.audio) : null;
  const dur = (total / F.fps).toFixed(6);
  await ff(['-f', 'concat', '-safe', '0', '-i', list, ...(audio ? ['-ss', String(a / F.fps), '-i', audio] : []), '-map', '0:v', ...(audio ? ['-map', '1:a', '-c:a', /\.(m4a|aac)$/i.test(audio) && !a ? 'copy' : 'aac', '-b:a', '256k'] : []),
    '-c:v', 'copy', '-t', dur, '-movflags', '+faststart', outFile]);
  rmSync(tmp, { recursive: true, force: true });
  const [w, h, fr, n] = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames', '-of', 'csv=p=0', outFile]).stdout.toString().trim().split(',');
  const hasA = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', outFile]).stdout.toString().trim();
  log(`done in ${((performance.now() - tStart) / 1000).toFixed(1)}s -> ${outFile}  [${w}x${h} ${fr}fps ${n} frames, audio ${hasA || 'none'}]`);
  if (+n !== total) console.log(`WARN frame count ${n} != ${total}`);
  done(0);
}
die('unknown command ' + cmd);
