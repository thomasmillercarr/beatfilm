#!/usr/bin/env node
// Find and fetch real recorded music: Kevin MacLeod's incompetech catalogue (~1,400 tracks, CC BY 4.0,
// metadata includes bpm, feel and instruments). The user's own track always wins over this.
//
//   node music.mjs search <words...> [--bpm 110-130] [--min 60]     ranked matches (min = length in seconds)
//   node music.mjs get "<exact title>" <filmDir>                      -> <filmDir>/audio/source.mp3 + CREDITS.txt
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BASE = 'https://incompetech.com/music/royalty-free/';
const args = process.argv.slice(2), [cmd, ...rest] = args;
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const words = rest.filter((a, i) => !a.startsWith('--') && !(i && rest[i - 1].startsWith('--')));

async function catalogue() {
  const cache = join(tmpdir(), 'beatfilm-incompetech.json');
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  const r = await fetch(BASE + 'pieces.json'); if (!r.ok) throw new Error('catalogue fetch failed: ' + r.status);
  const txt = await r.text(); writeFileSync(cache, txt); return JSON.parse(txt);
}
const secs = l => l.split(':').reduce((a, x) => a * 60 + +x, 0);

if (cmd === 'search') {
  const [lo, hi] = (opt('bpm', '0-999')).split('-').map(Number), min = +opt('min', 45);
  const q = words.map(w => w.toLowerCase());
  const hits = (await catalogue()).map(p => {
    const hay = { feel: (p.feel || '').toLowerCase(), desc: (p.description || '').toLowerCase(), inst: (p.instruments || '').toLowerCase(), title: p.title.toLowerCase() };
    const score = q.reduce((s, w) => s + (hay.feel.includes(w) ? 3 : 0) + (hay.title.includes(w) ? 2 : 0) + (hay.inst.includes(w) ? 1.5 : 0) + (hay.desc.includes(w) ? 1 : 0), 0);
    return { p, score };
  }).filter(({ p, score }) => score > 0 && +p.bpm >= lo && +p.bpm <= hi && secs(p.length) >= min)
    .sort((a, b) => b.score - a.score || (b.p.uploaded || '').localeCompare(a.p.uploaded || '')).slice(0, +opt('n', 12));
  for (const { p } of hits) console.log(`${p.title}  |  ${p.bpm} bpm  ${p.length}  |  ${p.feel}  |  ${p.instruments}\n    ${(p.description || '').slice(0, 140)}`);
  if (!hits.length) console.log('no matches: try broader feel words (bright, driving, epic, dark, grooving, uplifting, action, playful)');
} else if (cmd === 'get') {
  const [title, dir] = words; if (!title || !dir) { console.error('usage: music.mjs get "<title>" <filmDir>'); process.exit(1); }
  const p = (await catalogue()).find(x => x.title.toLowerCase() === title.toLowerCase());
  if (!p) { console.error('not in catalogue: ' + title); process.exit(1); }
  const r = await fetch(BASE + 'mp3-royaltyfree/' + encodeURIComponent(p.filename)); if (!r.ok) { console.error('download failed: ' + r.status); process.exit(1); }
  const out = resolve(dir); mkdirSync(join(out, 'audio'), { recursive: true });
  writeFileSync(join(out, 'audio', 'source.mp3'), Buffer.from(await r.arrayBuffer()));
  const credit = `"${p.title}" Kevin MacLeod (incompetech.com)\nLicensed under Creative Commons: By Attribution 4.0 License\nhttp://creativecommons.org/licenses/by/4.0/\n`;
  writeFileSync(join(out, 'CREDITS.txt'), credit);
  console.log(`${p.title}: ${p.bpm} bpm, ${p.length}, ${p.feel} -> ${join(out, 'audio', 'source.mp3')}\ncatalogue bpm ${p.bpm}: if beats.mjs measures something else (not x2 / x0.5), pass --bpm ${p.bpm}\ncredit (must ship with the film) -> CREDITS.txt`);
} else { console.error('usage: music.mjs search <words...> [--bpm lo-hi] [--min s] | get "<title>" <filmDir>'); process.exit(1); }
