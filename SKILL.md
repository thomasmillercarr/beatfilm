---
name: beatfilm
description: Turn a few lines about a product, game, app or brand into a finished motion-design film cut to the beat of real music, rendered to 4K MP4. Claude writes the concept and copy, animates every frame as code (HTML/CSS/SVG drawn from time), syncs cuts and accents to a measured beat map, and renders with headless Chrome + ffmpeg. Use when the user asks for a launch film, promo, sizzle, trailer, explainer, kinetic-type video, social ad or "motion design video" from a description, or types /beatfilm. No generation credits needed.
---

# beatfilm: brief → film cut to the beat → 4K

The user describes a product, game or brand in a few lines. You write the film, animate it, cut it to
the music and deliver an MP4 (4K by default). Everything is code you author, so text is crisp, numbers
are exact and every frame can be redone. Tools (all in `scripts/`, Node ≥ 22 + ffmpeg + Chrome, no npm installs):

| Step | Command |
| --- | --- |
| find music | `node scripts/music.mjs search <feel words> [--bpm 110-130]` then `get "<title>" <dir>` |
| beat map + cut | `node scripts/beats.mjs <track> <dir> --duration 30` → `beats.json`, `audio/cut.m4a` |
| new film | `node scripts/render.mjs init <dir>` (template page + `bf.js` runtime) |
| verify | `node scripts/render.mjs check <dir>` |
| look | `node scripts/render.mjs stills <dir> [--at 0,2.5s,f120]` → `out/sheet.jpg` |
| live preview | `node scripts/render.mjs serve <dir>` |
| render | `node scripts/render.mjs render <dir> [--res 4k\|1080\|720]` → `out/film_4k.mp4` |
| share live | `node scripts/render.mjs bundle <dir>` → `out/preview.html` (one self-contained file for an Artifact) |

`scripts/` is relative to this skill's folder. Put films in the user's working directory
(`films/<slug>/`) unless they say otherwise. `examples/kairo/` is a complete reference film:
read its `index.html` before writing your first film in a session.

## Operating rules

- **Autonomous.** A brief is a production request. Do not ask questions or offer menus; resolve
  unspecified choices (length, aspect, tone, palette, music, copy) from the brief, state them in one
  line and keep going. Ask only if the brief is empty.
- **Defaults:** 30 s, 16:9 page 1920×1080 at 30 fps rendered to 3840×2160. Vertical/social → page
  1080×1920 (renders 2160×3840). 15 s / 60 s when asked.
- **Real music only.** Use the user's track if given; otherwise pick one with `music.mjs`. Never
  synthesise music or SFX in code. A CC-BY track ships with its `CREDITS.txt` line.
- **Exact things are code.** Text, numbers, UI, charts, logos and icons are drawn in HTML/CSS/SVG.
  Photos, logos, product shots or game art the user supplies go in `assets/` and are animated in code.
- **Don't invent facts.** Copy comes from the brief. Stats, prices and claims the brief doesn't give
  stay out, or are clearly illustrative UI content (sample calendar entries, example messages).

## 1. Plan (write `plan.md` in the film dir, short)

1. **Concept**: a one-line logline and one visual motif that carries the whole film (Kairo: "your
   week, rebuilt": chaotic calendar blocks → the same blocks snapping into order). The motif is what
   turns a slideshow into a film: set it up early, transform it at the drop, pay it off at the end.
2. **Arc mapped to the music's energy**, not to a fixed template. Typical 30 s:
   hook (0–2 s, a provocation, never a logo) → tension/build → **reveal on the drop** →
   feature run (one idea per bar, cuts on beats) → breather when the music dips → finale/proof → lockup
   on the out-hit → hold through the faded tail. Games: world → mechanic → stakes → title → platforms/date.
   Brands: belief → proof moments → mark.
3. **Copy**: 3–7 words per card, verbs first, one idea each. Reading time ≥ 0.25 s per word + 0.4 s;
   anything shorter is a flash, which is fine only for rhythm words. Total on-screen words for 30 s ≈ 40–70.
4. **Look**: palette of 2 neutrals + 1 accent (+1 secondary at most), derived from the brand if given.
   A type pairing with character: a display face (often variable, so weight/width can animate)
   + a contrasting accent (italic serif or mono). Avoid the default AI set (Inter, Roboto, Space Grotesk,
   Fraunces, Instrument Serif, Geist); good free choices: Bricolage Grotesque, Familjen Grotesk, Unbounded,
   Archivo (wdth), Anybody, Syne, Big Shoulders, Darker Grotesque, Newsreader / Gloock / Young Serif
   (accent serif), JetBrains Mono / IBM Plex Mono / Martian Mono (data). Light and dark scenes may alternate
   to mark the arc (Kairo: dark = problem, paper = solution).
5. **Scene table in bars**: `scene | bars | role | what moves | text | accent beats`.

## 2. Music and beat map

```bash
node scripts/music.mjs search bright driving uplifting --bpm 110-130   # feel words: bright, driving, epic,
node scripts/music.mjs get "Inspired" films/kairo                        # dark, grooving, playful, action...
node scripts/beats.mjs films/kairo/audio/source.mp3 films/kairo --duration 30
```

Pick by feel and tempo: 115–130 bpm suits product/tech; 140–170 action/games; 85–105 warm/brand.
`beats.mjs` measures tempo (cross-check against the catalogue bpm; pass `--bpm` if it's off by
something other than ×2/÷2), tracks beats (snapping to a steady grid when the track is quantised),
guesses downbeats (`--phase 0-3` to override), and picks a phrase-aligned window of whole bars with
a building energy curve (`--start <sec>` to override), plus a faded tail. It prints phrase energies:
**read them and map your arc onto them** (drop = biggest rise; breathers = dips).

`beats.json` (times relative to the cut, t=0 = first downbeat): `bpm, beat, bar, bars, duration, out`
(the out-hit: last downbeat before the tail, where the lockup lands), `beats[]`, `downbeats[]`,
`energy[]` (0–1 per beat), `phrases[{bar,t,energy}]`, `drop`, `hits[]` (accents louder than their
neighbours: crashes, stabs).

## 3. Write the film page

`node scripts/render.mjs init films/<slug>` creates `index.html` + `bf.js` + `assets/ fonts/ audio/`.
Fetch fonts as files (no network at render time):
`curl -fL -o fonts/X.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/<family>/<File>.ttf"`
(variable files are named like `BricolageGrotesque%5Bopsz,wdth,wght%5D.ttf`; check the folder listing
at `https://github.com/google/fonts/tree/main/ofl/<family>` if a name 404s).

Page contract (enforced by `check`):

- `<div id="stage">` holds everything; one `<section class="scene">` per scene.
- `BF.film({ width, height, fps, audio: 'audio/cut.m4a', beats: 'beats.json', fonts: ['800 100px "Face"'], setup(B) { ...; return (t, f) => {...} } })`.
  `setup` runs once after fonts/beats load: build DOM, split text, seed layouts, return the frame function.
- **Every frame is a pure function of `t`**: no timers, `Date`, `performance.now`, `Math.random`,
  CSS transitions/animations, or values carried from the previous frame (frames render out of order in
  parallel). Use `BF.rng(seed)` / `BF.hash()` at setup. Each frame must set every property it relies
  on; hide inactive elements explicitly (`set(el, { o: 0 })`).
- Scene switching: toggle `section.style.visibility`; inside, use `BF.set(el, { o })` (which never
  forces `visible`, so hidden scenes stay hidden).
- Assets are local files. Video clips: extract frames to an image sequence with ffmpeg and swap `img.src`
  by frame (a `<video>` is not frame-accurate).

### Writing on the beat

Express all timing in beats and bars, never raw seconds: `B.t(i)` (beat i, fractional ok), `B.bar(n)`,
`B.beat`, `B.out`, `B.duration`. Helpers: `B.pulse(t, decay, list?)` (1 on each beat/event, decaying),
`B.since(t)`, `B.energy(t)`.

- **Cuts land on downbeats or beats.** Scene changes on bar lines; within high-energy phrases, change
  something on every beat; in breathers, every 2–4 beats. Cut density follows `energy`.
- **The loudest visual frame sits on the beat.** Use fast-out easings (`outExpo`, `outBack`, `spring`)
  starting on the beat so the big change happens in the first frames; for anticipation moves (crush,
  wind-up, whip), end them on the beat.
- **Accents**: flash/shake/punch-scale on `B.hits`, the drop and the out-hit; small `pulse` scale
  (2–6 %) on beats where the music drives. Don't pulse everything all the time.
- **Stagger** letters/words/items in 16ths (`B.beat/4`) or fixed 30–60 ms; lists land one item per beat.
- **Carry the energy.** Generated-feeling motion is too calm: add camera moves (slow push in builds,
  pull-out on payoffs, small rotation), motion blur on fast moves (`BF.mblur(el, dx, dy)`), shake bursts on
  impacts, overshoot on landings. Never let a frame be static for more than a beat in high-energy sections.

### Motion vocabulary (pick what serves the concept; don't use all)

Kinetic type (per-char rise with blur-to-sharp; word swaps on beats; weight/width animation on variable
fonts; mask reveals with `clip-path: inset()`); counters that land on the beat; UI cards that spring in
with slight 3D tilt (`rx`); SVG strokes drawing on (`pathLength=1` + `stroke-dashoffset`); charts growing;
grids/blocks assembling (the motif doing work); camera wrapper per scene (scale/rotate/translate a
container); whip transitions (fast translate + motion blur across a cut); flash frames (white overlay,
exponential decay); split-screen and masks; particles via canvas with seeded positions; grain
(`BF.grain()`) and vignette as the finishing pass, subtle.

### Composition and craft

Big type: headline 110–240 px on a 1920 page; nothing important under 28 px (it is 56 px in 4K, but
thumbnails on phones are tiny). Keep a 100–120 px safe margin. Give text a scrim when it sits on busy
content. Left-aligned captions + right-side visuals read faster than everything centred. One focal point
per beat. Product/game art: frame it large, move it (push, parallax, tilt) and give it a reveal.

## 4. Verify, look, fix (do not skip)

1. `render.mjs check <dir>` must pass: contract, fonts, missing files, network, page errors, and
   determinism (each probe frame re-rendered after other frames must match).
2. `render.mjs stills <dir> --at <times>`: pick a still inside every scene, at each drop/hit and on the
   lockup; then **open `out/sheet.jpg` and look**. Three passes (internal, not user rounds):
   **timing** (does each change land on its beat? is text on screen long enough?), **space/continuity**
   (framing, overlaps, collisions, legibility, safe margins, motif continuity across cuts), **polish**
   (type sizes, spacing, contrast, easing, energy). Fix and re-check the stills you changed.
3. Optional: `render.mjs render <dir> --res 720` for a quick watchable cut (`serve` gives a live
   preview with audio in a browser).
4. `render.mjs render <dir>` (4K). It verifies the frame count and muxes the cut audio. Encode is x264
   `faster`, CRF 18, capped near 45 Mbps at 4K (`--preset slow` / `--crf` for archival masters). `BF.grain()`
   is applied by ffmpeg during the encode (stills don't show it). A 30 s film takes about 3 minutes at 4K
   on a 28-core machine; run it in the background.

## 5. Deliver

Report: the file (`out/film_4k.mp4`), length/bpm/track and its credit line, one line on the concept,
and anything you could not do. The film page also plays live (audio-synced player with scrubbing):
`render.mjs bundle <dir>` inlines the runtime, beat map, fonts, assets, audio and the music credit into
`out/preview.html`; publish that one file as an Artifact so the user can watch and share it in Claude.
Edits are cheap: change the page, re-run `stills`, re-render, re-bundle and republish to the same URL.

## BF runtime reference (`bf.js`)

`clamp lerp invlerp` · `map(t, t0, t1, a, b, ease)` (clamped, eased) · `kf(t, [[t0, v0], [t1, v1, ease]…])`
(numbers or arrays) · `ease.{linear, in/out/inOut Quad|Cubic|Quart|Expo, outBack, inBack, outElastic,
spring(u, k, z)}` · `rng(seed)` → `() => [0,1)` · `hash(...n)` · `noise(x, seed)` (smooth, −1..1) ·
`shake(t, amp, freq, seed)` → `{x, y, r}` · `set(el|sel, {x, y, z, s, sx, sy, r, rx, ry, skx, o, blur,
...css})` · `tf({...})` → transform string · `split(el, 'chars'|'words')` → spans (call in setup) ·
`mblur(el, dx, dy)` directional blur · `grain(amount, size)` → `fn(f)` call each frame · `fmt(n, dec)` ·
`$ $$` · `beats(map)` (done for you by `BF.film({ beats })`, also on `window.B`).

## Troubleshooting

- `check` FAIL "renders differently depending on the previous frame": something isn't reset each frame
  (an element only set while its scene is active, text written conditionally, a cached value). Make the
  frame function set it unconditionally.
- Fonts missing: the `fonts: [...]` descriptors must match `@font-face` family/weight/style.
- Wrong downbeat (cuts feel one beat off): rerun `beats.mjs` with `--phase` (0–3). Wrong tempo: `--bpm`.
- Chrome not found: set `CHROME_PATH`. Slow 4K renders: `--workers N` (default ≈ cores/3), or render 1080.
