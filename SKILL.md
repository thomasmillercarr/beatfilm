---
name: beatfilm
description: Builds and renders a motion-design film, cut to the beat of real music, as HTML/CSS/SVG animated from time and rendered to 4K MP4 with headless Chrome + ffmpeg. Use when an approved direction exists (films/<slug>/direction.md or an approved direction earlier in the conversation), when the user types /beatfilm or says to skip creative direction, or to re-render or edit an existing film. For a new film request with no approved direction, use the studio skill first if it is installed. In Claude chat it makes a live, silent draft Artifact.
---

# beatfilm: approved direction → film cut to the beat → 4K

You build the film, animate it, cut it to the music and deliver an MP4 (4K by default).
Everything is code you author, so text is crisp, numbers are exact and every frame can be redone.

**Scripts live in `${CLAUDE_SKILL_DIR}/scripts/`.** Always quote the path, because it may contain
spaces: `node "${CLAUDE_SKILL_DIR}/scripts/render.mjs" …`. If `${CLAUDE_SKILL_DIR}` was not replaced
with a real path, or `node`/Chrome/ffmpeg are missing (Claude chat, the mobile app), follow
`references/chat-draft.md` instead of §2-§4. Needs Node ≥ 22, ffmpeg and Chrome or Edge; no npm installs.

| Step | Command (prefix each with `node "${CLAUDE_SKILL_DIR}/scripts/`) |
| --- | --- |
| find music | `music.mjs" search <feel words> [--bpm 110-130]` then `get "<title>" <dir>` |
| beat map + cut | `beats.mjs" <track> <dir> --duration 30` → `beats.json`, `audio/cut.m4a` |
| new film | `render.mjs" init <dir>` (template page + `bf.js` runtime) |
| verify | `render.mjs" check <dir>` |
| look | `render.mjs" stills <dir> [--at 0,2.5s,f120]` → `out/sheet.jpg` |
| live preview | `render.mjs" serve <dir>` |
| render | `render.mjs" render <dir> [--res 4k\|1080\|720]` → `out/film_4k.mp4` |
| share live | `render.mjs" bundle <dir>` → `out/preview.html` (one self-contained file for an Artifact) |

Films go in the user's working directory (`films/<slug>/`) unless they say otherwise. `films/` is
private: never commit or publish it. `${CLAUDE_SKILL_DIR}/examples/kairo/` shows the page format:
read its `index.html` for the **runtime contract only**. Its creative choices predate
`references/slop.md` and `references/transitions.md`, and several of them break those rules.

## Operating rules

- **Look for a direction first.** Check `films/*/direction.md` for this subject, and any direction
  approved earlier in this conversation (in Claude chat there is no film dir).
  - `status: approved`: build that film. Take its logline, kind, hero moment, world, palette, type,
    current, transitions, sound (use the track path if given), length/aspect/fps and never list.
    Derive the §1 scene table from its Arc. Do not re-decide any of it. If something cannot be built,
    say so instead of quietly changing it.
  - Not approved: if the user's message picks a direction or says to skip approval, change the top
    line to `status: approved YYYY-MM-DD (via beatfilm: "<their words>")` and build. Otherwise ask
    for a yes in one line, naming the recommended direction. In an unattended run, stop.
- **No direction: autonomous.** A bare brief is a production request. Resolve unspecified choices
  (length, aspect, tone, palette, music, copy) from the brief, state them in one line and keep going.
  Ask only if the brief is empty. In an unattended run, stop and report instead.
- **Read `references/slop.md` and `references/transitions.md` before planning.** They hold the
  never-ship list and the rules for cuts, and they override anything below that seems to disagree.
- **Defaults:** 30 s, 16:9 page 1920×1080 at 30 fps rendered to 3840×2160. Vertical/social → page
  1080×1920 (renders 2160×3840). 15 s / 60 s when asked.
- **Real music only.** Use the user's track if given; otherwise pick one with `music.mjs`. Never
  synthesise music or SFX in code. A CC-BY track ships with its `CREDITS.txt`. Voice-over sync is not
  supported yet. With a VO, cut to the music and tell the user.
- **Exact things are code.** Text, numbers, UI, charts, logos and icons are drawn in HTML/CSS/SVG.
  Photos, logos, product shots or game art the user supplies go in `assets/` and are animated in code.
  Never redraw a real logo. For a fictional or unbranded subject, design the wordmark yourself and say so.
- **Don't invent facts.** Copy comes from the brief. Stats, prices, testimonials and claims the brief
  doesn't give stay out.

## 1. Plan (write `plan.md` in the film dir, short)

1. **Concept**: a one-line logline and one visual motif that carries the whole film. The motif is
   what turns a slideshow into a film: set it up early, **transform the same objects** at the drop
   (do not swap in new ones), and pay it off at the end.
2. **Arc mapped to the music's energy**, not to a fixed template. Typical 30 s: hook (0–2 s, a
   provocation, never a logo) → tension/build → **the motif transforms on the drop (never a logo
   slam)** → the motif doing the subject's job, one event per bar → breather when the music dips →
   payoff of the motif → the mark, once, landing on the out-hit and held 0.6–1.4 s, then the frame
   fades through the tail. Vary shot lengths: not every scene is one bar.
3. **Copy**: 3–7 words per card, verbs first, one idea each. Reading time ≥ 0.25 s per word + 0.4 s;
   anything shorter is a flash, which is fine only for rhythm words. Total on-screen words for 30 s ≈ 40–70.
4. **Look**: palette of 2 neutrals + 1 accent (+1 secondary at most), from the brand if given, each
   colour with a meaning. The brand's own typeface when known. Otherwise, a display face with character
   (often variable, so weight and width can animate) plus at most one contrasting face. Avoid the
   default AI set (Inter, Roboto, Space Grotesk, Fraunces, Instrument Serif, Geist). Good free choices:
   Bricolage Grotesque, Familjen Grotesk, Unbounded, Archivo (wdth), Anybody, Syne, Big Shoulders,
   Darker Grotesque; JetBrains Mono / IBM Plex Mono / Martian Mono for data. An italic-serif accent
   word appears at most once per film: it is a pastiche tell.
5. **Scene table in bars**: `scene | bars | role | what happens (an event) | text | accent | reason`.
   The reason column ties each technique to the story or a reference principle.
6. **Cut table**: one line per cut, both sides planned together (`references/transitions.md` §4):
   `bar | A exits (direction, moving) | B enters (mid-flight) | carried object | eye trace | T-id`.
   Use the film's current for ordinary cuts and only 2-3 transition types in the whole film.
7. **Plan check** before writing code: run the default-reaches table in `references/slop.md` on
   the plan, and fix what it catches.

## 2. Music and beat map

```bash
node "${CLAUDE_SKILL_DIR}/scripts/music.mjs" search bright driving uplifting --bpm 110-130
node "${CLAUDE_SKILL_DIR}/scripts/music.mjs" get "Inspired" films/<slug>
node "${CLAUDE_SKILL_DIR}/scripts/beats.mjs" films/<slug>/audio/source.mp3 films/<slug> --duration 30 --bpm <catalogue bpm>
```

Feel words: bright, driving, epic, dark, grooving, playful, action. Pick by feel and tempo: 115–130
bpm suits product/tech; 140–170 action/games; 85–105 warm/brand. **Always pass the catalogue bpm**
(`music.mjs get` prints it). Then confirm `beats.json` has `steady: true` and about
`duration / beat` beats: `B.t(i)` and `B.bar(n)` index that list, so a missing beat shifts every bar
after it. `beats.mjs` tracks beats, guesses downbeats (`--phase 0-3` to override), and picks a phrase-aligned window of
whole bars with a building energy curve (`--start <sec>` to override), plus a faded tail. The length
rounds to whole bars (15 s at 125 bpm gives 14.4 s). It prints phrase energies: **read them and map
your arc onto them** (drop = biggest rise; breathers = dips). For films under 20 s, the 4-bar phrase
energies are too coarse: read the per-beat `energy[]`, find the first beat after a dip where energy
jumps by more than 0.4, and use `--start` to put that drop on bar 1-3.

`beats.json` (times relative to the cut, t=0 = first downbeat): `bpm, beat, bar, bars, duration, out`
(the out-hit: last downbeat before the tail, where the mark lands), `beats[]`, `downbeats[]`,
`energy[]` (0–1 per beat), `phrases[{bar,t,energy}]`, `drop`, `hits[]` (accents louder than their
neighbours: crashes, stabs).

## 3. Write the film page

`render.mjs init films/<slug>` creates `index.html` + `bf.js` + `assets/ fonts/ audio/`.
Fetch fonts as files (no network at render time):
`curl -fL -o fonts/X.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/<family>/<File>.ttf"`
(variable files are named like `BricolageGrotesque%5Bopsz,wdth,wght%5D.ttf`; check the folder listing
at `https://github.com/google/fonts/tree/main/ofl/<family>` if a name 404s). Keep each font's OFL file.

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

The `BF` runtime API and troubleshooting are in `references/runtime.md`.

### Writing on the beat

Express all timing in beats and bars, never raw seconds: `B.t(i)` (beat i, fractional ok), `B.bar(n)`,
`B.beat`, `B.out`, `B.duration`. Helpers: `B.pulse(t, decay, list?)`, `B.since(t)`, `B.energy(t)`.

- **Sync the big changes; let small ones ride across the beat.** Scene changes land on bar lines or
  beats. Cutting on every downbeat is metronomic, so vary it with the energy.
- **The loudest visual frame sits on the beat.** Fast-out easings (`outExpo`, `outQuart`) start on the
  beat so the change happens in the first frames. Anticipation moves (wind-up, whip) end on the beat.
  `outBack`/`spring` only for the one landing that earns it.
- **Accents are spent, not sprinkled.** Hit one sync point per phrase hard (the drop, a hit, the
  out-hit). Use each accent effect (flash, shake, punch) once or twice per film, on its cause.
  Nothing pulses on beats unless it is reacting to something.
- **Keep performing, then go still on purpose.** Scenes keep performing through story
  (`references/transitions.md` §2), not idle wobble. Hold the frame still for 0.3–0.75 s before the
  climax. Camera moves need a destination. Motion blur (`BF.mblur`) only where there is real speed.
- **Stagger** words or items in 16ths (`B.beat/4`) or fixed 30–60 ms. Words arrive whole on the
  rhythm more often than letter by letter.

### Motion vocabulary (a film uses 3–4 of these; plan.md gives the story reason for each)

Kinetic type (words rising with blur-to-sharp, word swaps on beats, weight/width animation on variable
fonts, mask reveals with `clip-path: inset()`); counters that land on the beat (real numbers only);
SVG strokes drawing on (`pathLength=1` + `stroke-dashoffset`); charts growing; grids or blocks
assembling (the motif doing work); a camera wrapper per scene (scale/translate a container); whips
(fast translate + motion blur, content changing mid-whip); masks and split screens; particles on
canvas with seeded positions; grain (`BF.grain()`) as a subtle finishing pass.

### Composition and craft

Big type: headline 110–240 px on a 1920 page; nothing important under 28 px on the page's long edge
(it is 56 px in 4K, but thumbnails on phones are tiny). Keep a 100–120 px safe margin. Type and
picture share one composition: the word sits in, on or against the thing it names. Never a caption
column beside a visual. One focal point per beat. Product or game art: frame it large, move it with
intent and give it a reveal.

## 4. Verify, look, fix (do not skip)

1. `render.mjs check <dir>` must pass: contract, fonts, missing files, network, page errors, and
   determinism (each probe frame re-rendered after other frames must match).
2. `render.mjs stills <dir> --at <times>`: a still inside every scene, at each drop/hit, a frame either
   side of every cut, and on the mark. Then **open `out/sheet.jpg` and look**. Make three passes:
   **timing** (does each change land on its beat? is text on screen long enough?),
   **space/continuity** (eye trace across cuts, framing, collisions, legibility, safe margins, the
   motif carried) and **polish** (type, spacing, contrast, easing). Fix and re-check the stills you changed.
3. Optional: `render.mjs render <dir> --res 720` for a quick watchable cut.
4. `render.mjs render <dir>` (4K). It verifies the frame count, muxes the cut audio and writes the
   music credit into the file's metadata. Encode is x264 `faster`, CRF 18 (`--preset slow` / `--crf`
   for archival masters). `BF.grain()` is applied by ffmpeg during the encode (stills don't show it).
   A 30 s film takes a few minutes at 4K on a many-core machine; run it in the background.

## 5. Deliver

Run the `film-review` skill's self-review before reporting (if it is installed). Report: the file
(`out/film_4k.mp4`), length/bpm/track and its credit line, one line on the concept, and anything you
could not do. `render.mjs bundle <dir>` inlines the runtime, beat map, fonts, assets, audio and credit
into `out/preview.html`; publish that one file as an Artifact so the user can watch it in Claude.
Edits are cheap: change the page, re-run `stills`, re-render, re-bundle and republish to the same URL.
