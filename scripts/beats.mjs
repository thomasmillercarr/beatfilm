#!/usr/bin/env node
// Beat map for a music track: tempo, beat grid, downbeats, per-beat energy, hits, phrases,
// and a phrase-aligned cut of the requested length written as <dir>/audio/cut.m4a + <dir>/beats.json.
// Zero dependencies: ffmpeg decodes, everything else is plain JS.
//
//   node beats.mjs <track> <filmDir> [--duration 30] [--start <sec>] [--bpm N] [--phase 0-3] [--tail 1.5]
//   node beats.mjs <track> --info            # analyse only, print summary
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SR = 22050, N = 1024, HOP = 256, FPS = SR / HOP;
const LAG = 0.035; // flux peaks ~35 ms before the audible onset (measured on clicks, kicks, noise bursts)

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const flag = k => args.includes('--' + k);
const [track, dirArg] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--info'));
if (!track) { console.error('usage: beats.mjs <track> <filmDir> [--duration 30] [--start s] [--bpm N] [--phase k] [--tail s] | --info'); process.exit(1); }

// ---- decode ----
const dec = spawnSync('ffmpeg', ['-v', 'error', '-i', track, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
if (dec.status) { console.error(dec.stderr.toString()); process.exit(1); }
const pcm = new Float32Array(dec.stdout.buffer, dec.stdout.byteOffset, dec.stdout.length >> 2);
const length = pcm.length / SR;

// ---- STFT onset envelopes (spectral flux on log magnitude; full band + kick band) ----
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2, tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}
const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
const nf = Math.max(1, Math.floor((pcm.length - N) / HOP));
const bins = N / 2, hiBin = Math.round(8000 / (SR / N)), kickBin = Math.round(150 / (SR / N));
const onset = new Float32Array(nf), kick = new Float32Array(nf), rms = new Float32Array(nf);
let prev = new Float32Array(bins);
const re = new Float64Array(N), im = new Float64Array(N);
for (let f = 0; f < nf; f++) {
  let e = 0;
  for (let i = 0; i < N; i++) { const s = pcm[f * HOP + i]; re[i] = s * win[i]; im[i] = 0; e += s * s; }
  rms[f] = Math.sqrt(e / N);
  fft(re, im);
  let flux = 0, kf = 0;
  const cur = new Float32Array(bins);
  for (let k = 1; k < hiBin; k++) {
    cur[k] = Math.log1p(1000 * Math.hypot(re[k], im[k]));
    const d = cur[k] - prev[k];
    if (d > 0) { flux += d; if (k <= kickBin) kf += d; }
  }
  onset[f] = flux; kick[f] = kf; prev = cur;
}
// remove slow trend, half-wave rectify, normalise
function detrend(x, w = Math.round(FPS)) {
  const out = new Float32Array(x.length); let s = 0; const q = [];
  for (let i = 0; i < x.length + w; i++) {
    if (i < x.length) { s += x[i]; q.push(x[i]); }
    if (q.length > 2 * w + 1) s -= q.shift();
    const c = i - w; if (c >= 0 && c < x.length) out[c] = Math.max(0, x[c] - s / q.length);
  }
  const m = [...out].sort((a, b) => a - b)[Math.floor(out.length * 0.995)] || 1; // p99.5, so one transient can't flatten the rest
  return out.map(v => Math.min(1, v / m));
}
const env = detrend(onset), kenv = detrend(kick);

// ---- tempo: autocorrelation with a log-normal prior around 120 bpm ----
function tempo() {
  if (opt('bpm')) return +opt('bpm');
  const lo = Math.floor(FPS * 60 / 200), hi = Math.ceil(FPS * 60 / 60);
  const mean = env.reduce((a, b) => a + b, 0) / env.length;
  const x = env.map(v => v - mean), ac = new Float64Array(hi + 2);
  for (let L = lo - 1; L <= hi + 1; L++) { let s = 0; for (let i = L; i < x.length; i++) s += x[i] * x[i - L]; ac[L] = s / (x.length - L); }
  let best = lo, bestS = -Infinity;
  for (let L = lo; L <= hi; L++) {
    const bpm = 60 * FPS / L, w = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    const s = ac[L] * w; if (s > bestS) { bestS = s; best = L; }
  }
  // octave check: prefer 80-165 bpm when that lag is nearly as strong
  const half = Math.round(best / 2), dbl = best * 2;
  if (60 * FPS / best < 80 && half >= lo && ac[half] > 0.5 * ac[best]) best = half;
  else if (60 * FPS / best > 165 && dbl <= hi && ac[dbl] > 0.5 * ac[best]) best = dbl;
  const [a, b, c] = [ac[best - 1], ac[best], ac[best + 1]]; // parabolic refine
  const L = best + (a - c) / (2 * (a - 2 * b + c) || 1);
  return 60 * FPS / L;
}
const bpm = tempo(), P = 60 * FPS / bpm;

// ---- beat tracking: dynamic programming (Ellis 2007) ----
const local = new Float32Array(env.length);
{ const W = Math.round(P); for (let i = 0; i < env.length; i++) { let s = 0; for (let k = -W; k <= W; k++) { const j = i + k; if (j >= 0 && j < env.length) s += env[j] * Math.exp(-0.5 * (k * 32 / P) ** 2); } local[i] = s; } }
const cum = new Float32Array(env.length), back = new Int32Array(env.length).fill(-1);
for (let i = 0; i < env.length; i++) {
  let best = 0, bj = -1;
  for (let j = Math.max(0, Math.round(i - 2 * P)); j <= i - Math.round(P / 2); j++) {
    const s = cum[j] - 100 * Math.log((i - j) / P) ** 2; if (bj < 0 || s > best) { best = s; bj = j; }
  }
  cum[i] = local[i] + (bj >= 0 ? best : 0); back[i] = bj;
}
let last = env.length - 1; for (let i = Math.max(0, Math.round(env.length - P)); i < env.length; i++) if (cum[i] > cum[last]) last = i;
let dp = []; for (let i = last; i >= 0; i = back[i]) dp.unshift(i);
{ const thr = 0.5 * Math.sqrt(local.reduce((a, v) => a + v * v, 0) / local.length); dp = dp.filter(i => local[i] > thr); }

// steady grid if the tracked beats fit a straight line (most produced music); gaps are fine
let beats = dp.map(i => i / FPS + LAG), steady = false;
if (beats.length > 8) {
  let per = P / FPS, t0 = beats[0], sd = 1;
  for (let it = 0; it < 3; it++) { // index each beat on the grid, refit
    const k = beats.map(b => Math.round((b - t0) / per)), n = k.length;
    const mk = k.reduce((a, b) => a + b) / n, mb = beats.reduce((a, b) => a + b) / n;
    let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (k[i] - mk) * (beats[i] - mb); sxx += (k[i] - mk) ** 2; }
    per = sxy / sxx; t0 = mb - per * mk;
    sd = Math.sqrt(beats.reduce((a, b, i) => a + (b - t0 - per * k[i]) ** 2, 0) / n);
  }
  if (sd < 0.025) { steady = true; const k0 = Math.ceil(-t0 / per); beats = []; for (let k = k0; t0 + k * per < length; k++) beats.push(t0 + k * per); }
}
const beatLen = steady ? beats[1] - beats[0] : 60 / bpm;

// ---- per-beat features ----
const fr = t => Math.min(env.length - 1, Math.max(0, Math.round((t - LAG) * FPS)));
const peak = (x, t, w = 3) => { let m = 0; for (let k = -w; k <= w; k++) m = Math.max(m, x[fr(t) + k] || 0); return m; };
const beatRms = beats.map((t, i) => { const a = fr(t), b = fr(beats[i + 1] ?? t + beatLen); let s = 0; for (let k = a; k < Math.max(a + 1, b); k++) s += rms[k] ** 2; return 10 * Math.log10(s / Math.max(1, b - a) + 1e-10); });
const sorted = [...beatRms].sort((a, b) => a - b), lo5 = sorted[Math.floor(sorted.length * 0.05)], hi95 = sorted[Math.floor(sorted.length * 0.95)];
const energy = beatRms.map(v => Math.min(1, Math.max(0, (v - lo5) / (hi95 - lo5 || 1))));

// downbeat phase: accent + kick + energy jump at bar starts
let phase = opt('phase') != null ? +opt('phase') : (() => {
  const score = [0, 0, 0, 0];
  beats.forEach((t, i) => { const jump = Math.max(0, (energy[i] ?? 0) - (energy[i - 1] ?? 0)); score[i % 4] += peak(env, t) + peak(kenv, t) + 2 * jump; });
  return score.indexOf(Math.max(...score));
})();
const downIdx = beats.map((_, i) => i).filter(i => i % 4 === phase);

// hits: accents louder than the surrounding beats (crashes, stabs, drops), at least one beat apart
const hits = [];
{ const bp = beats.map(t => peak(env, t, 2));
  const cand = [];
  for (let i = 1; i < env.length - 1; i++) {
    if (!(env[i] > env[i - 1] && env[i] >= env[i + 1] && env[i] > 0.2)) continue;
    const t = i / FPS + LAG, k = Math.max(0, Math.round((t - beats[0]) / beatLen));
    const near = bp.slice(Math.max(0, k - 8), k + 9).sort((x, y) => x - y), med = near[near.length >> 1] || 1;
    if (env[i] > 1.35 * med) cand.push([t, env[i] / med]);
  }
  cand.sort((x, y) => y[1] - x[1]);
  for (const [t] of cand) if (hits.every(h => Math.abs(h - t) > beatLen * 0.9)) hits.push(t);
  hits.sort((x, y) => x - y); }

// ---- summary only ----
const r3 = v => Math.round(v * 1000) / 1000;
if (flag('info') || !dirArg) {
  // align: onset strength on the beats vs halfway between them (>1.5 = locked on)
  const on = beats.reduce((a, t) => a + peak(env, t, 2), 0), off = beats.reduce((a, t) => a + peak(env, t + beatLen / 2, 2), 0);
  let bo = 0, bs = -1; for (let d = -beatLen / 2; d < beatLen / 2; d += 0.005) { const s = beats.reduce((a, t) => a + (env[fr(t + d)] || 0) + (kenv[fr(t + d)] || 0), 0); if (s > bs) { bs = s; bo = d; } }
  console.log(JSON.stringify({ track, length: r3(length), bpm: r3(60 / beatLen), steady, offset: r3(bo), align: r3(on / (off || 1)), phase, beats: beats.length, firstDownbeat: r3(beats[downIdx[0]] ?? 0), hits: hits.length }));
  process.exit(0);
}

// ---- choose a phrase-aligned window: N bars + a faded tail ----
const want = +opt('duration', 30), tail = +opt('tail', Math.min(1.5, 2 * beatLen));
const barLen = 4 * beatLen, nb = Math.max(2, Math.round((want - tail) / barLen));
const meanE = (a, b) => { const s = energy.slice(a, b); return s.reduce((x, y) => x + y, 0) / (s.length || 1); };
let startBeat;
if (opt('start') != null) {
  const s = +opt('start'); startBeat = downIdx.reduce((b, i) => Math.abs(beats[i] - s) < Math.abs(beats[b] - s) ? i : b, downIdx[0]);
} else {
  let best = -Infinity;
  downIdx.forEach((i, k) => {
    if (k % 4 && k % 4 !== 2) return; // phrase-aligned (4 bars), half-phrase allowed
    const endT = beats[i] + nb * barLen + tail; if (endT > length) return;
    const n = nb * 4, early = meanE(i, i + n * 0.25), late = meanE(i + n * 0.4, i + n);
    const s = meanE(i, i + n) + 0.5 * Math.max(0, late - early) - (k % 4 ? 0.05 : 0);
    if (s > best) { best = s; startBeat = i; }
  });
  startBeat ??= downIdx[0] ?? 0;
}
const start = beats[startBeat], out = nb * barLen, duration = Math.min(out + tail, length - start);
const rel = t => r3(t - start), inWin = t => t >= start - 1e-6 && t < start + duration;
const winBeats = beats.map((t, i) => i).filter(i => inWin(beats[i]));
const phrases = [];
for (let b = 0; b < nb; b += 4) { const i = startBeat + b * 4; phrases.push({ bar: b, t: rel(beats[i]), energy: r3(meanE(i, i + 16)) }); }
let drop = null, dj = 0.12;
phrases.forEach((p, k) => { if (k && p.energy - phrases[k - 1].energy > dj) { dj = p.energy - phrases[k - 1].energy; drop = p.t; } });

const dir = resolve(dirArg);
mkdirSync(join(dir, 'audio'), { recursive: true });
const cut = spawnSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(start), '-t', String(duration), '-i', track,
  '-af', `afade=t=in:d=0.01,afade=t=out:st=${Math.max(0, duration - tail)}:d=${tail}`, '-ar', '48000', '-c:a', 'aac', '-b:a', '256k', join(dir, 'audio', 'cut.m4a')]);
if (cut.status) { console.error(cut.stderr.toString()); process.exit(1); }

const map = {
  source: track.replace(/\\/g, '/'), sourceStart: r3(start), bpm: r3(60 / beatLen), beat: r3(beatLen), bar: r3(barLen), steady,
  duration: r3(duration), out: r3(out), bars: nb,
  beats: winBeats.map(i => rel(beats[i])),
  downbeats: winBeats.filter(i => i % 4 === phase).map(i => rel(beats[i])),
  energy: winBeats.map(i => r3(energy[i])),
  phrases, drop,
  hits: hits.filter(inWin).map(rel),
};
writeFileSync(join(dir, 'beats.json'), JSON.stringify(map));
console.log(`bpm ${map.bpm}${steady ? ' (steady grid)' : ''} | cut ${map.sourceStart}s +${map.duration}s = ${nb} bars + ${r3(tail)}s tail | out-hit at ${map.out}s | drop ${drop ?? 'none'} | ${map.hits.length} hits`);
console.log('phrase energy:', phrases.map(p => `bar${p.bar}@${p.t}s=${p.energy}`).join('  '));
