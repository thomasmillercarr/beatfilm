# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**beatfilm**, a Claude skill: brief → motion-design film cut to the beat of real music → 4K MP4. `SKILL.md` is
the skill itself (the workflow and craft rules Claude follows when making a film); this repo folder is also
installed as `~/.claude/skills/beatfilm` via a directory junction, so edits here are live in the skill.
It is a clean-room take on Higgsfield Katana's motion-graphics path; no Higgsfield code is included.

Requirements: Node ≥ 22 (built-in `WebSocket` and `fetch`), ffmpeg/ffprobe on PATH, Chrome or Edge
(`CHROME_PATH` overrides discovery). **No npm dependencies, no package.json, by design**: keep it that way.

## Commands

```bash
node scripts/render.mjs init films/<slug>             # new film dir: templates/index.html + a copy of runtime/bf.js
node scripts/music.mjs search <feel words> [--bpm 100-130]
node scripts/music.mjs get "<title>" films/<slug>     # audio/source.mp3 + CREDITS.txt (CC BY line)
node scripts/beats.mjs films/<slug>/audio/source.mp3 films/<slug> --duration 30   # beats.json + audio/cut.m4a
node scripts/beats.mjs <track> --info                 # analyse only (bpm, steady, align, offset)
node scripts/render.mjs check  films/<slug>           # the test: contract, fonts, network, page errors, determinism
node scripts/render.mjs stills films/<slug> --at 0,2.5s,f120   # out/stills + out/sheet.jpg (look at it)
node scripts/render.mjs render films/<slug> [--res 4k|1080|720] [--frames A:B] [--workers N] [--preset slow]
node scripts/render.mjs bundle films/<slug>           # out/preview.html, one self-contained file for an Artifact
node scripts/render.mjs serve  films/<slug>           # live preview with audio
```

There is no test suite. Verification is `render.mjs check` plus looking at `stills` sheets. For `beats.mjs`
changes, check timing against a synthetic click track (`ffmpeg -f lavfi -i "aevalsrc=..."`, clicks every 0.5 s
from 0.5 s) and confirm `--info` beats land on 0.500, 1.000… within a few ms. Measured BPMs should match the
incompetech catalogue `bpm` field.

## Architecture

Three layers, joined by files in a film dir (`films/<slug>/` or `examples/kairo/`):

1. **`scripts/beats.mjs`** decodes with ffmpeg to 22.05 kHz mono and computes spectral-flux onsets
   (full band and a <150 Hz kick band). Tempo comes from autocorrelation with a 120 bpm prior and an octave
   check. Beats come from Ellis DP, refit to a steady grid when residuals are under 25 ms. It then estimates the
   downbeat phase heuristically, and per-beat energy and hits (accents relative to neighbouring beats). Finally
   it picks a phrase-aligned window of N bars plus a faded tail, writes `audio/cut.m4a`, and writes `beats.json`
   with all times rebased so **t=0 = the cut's first downbeat**. The film timeline and the audio timeline are
   therefore identical. `LAG = 0.035` corrects flux peaking before the audible onset (measured); don't remove it.
2. **`runtime/bf.js`** is the in-page runtime (global `BF`): easing, keyframes, seeded rng/noise, beat helpers,
   `set()`, `split()`, `mblur()`, `grain()`, and `BF.film({...setup(B)})`. `BF.film` sets the `window.film` contract
   (`width, height, fps, frames, audio, ready, render(t, f)`) that the renderer drives. Outside render mode
   (`window.__BF_RENDER` unset) the same page runs a live player synced to the audio. **Each film dir holds its
   own copy of `bf.js`** (from `init`): after changing `runtime/bf.js`, copy it into every film/example.
3. **`scripts/render.mjs`** runs a stdlib HTTP server over the film dir and drives N headless Chrome processes
   over raw CDP (its own tiny client). Each worker renders a contiguous frame chunk at
   `deviceScaleFactor = target / page size` (true 4K raster) and pipes JPEGs into its own x264. Chunks are
   concat-copied and the cut audio is muxed in. The frame count is verified with ffprobe.

## Invariants and gotchas (each one was a real bug)

- A film frame must be a **pure function of `t`**: workers render out of order. `check` re-renders probe frames
  after others and fails below 45 dB PSNR. Tiny diffs (GPU blur raster) only warn.
- `BF.set(el, {o})` writes `visibility: ''`, never `'visible'`. An explicit `visible` child overrides a hidden
  parent scene and leaks it into other scenes.
- In render mode `BF.grain()` only records `{amount, size}`; the renderer adds the grain in ffmpeg (luma noise
  + overlay blend). An in-page 4K grain overlay tripled render time. Stills don't show grain.
- Encoding (x264 `faster`, CRF 18, VBV cap ~45 Mbps at 4K, scaled by pixel count) is the 4K bottleneck, not Chrome.
- Chrome JPEG screenshots are BT.601 full range; the encode converts to BT.709 tv explicitly.
- `bundle` order matters: local `<script src>` tags are swapped for placeholders **first** and restored last.
  If the runtime is inlined early, its comments match the `beats:`/`audio:` regexes; if `src=` is rewritten
  first, scripts become `data:` URLs, which the Artifact CSP blocks. `<meta charset>` is kept.
- On Windows, Chrome holds `DevToolsActivePort` locked while writing it (EBUSY); the launch poll tolerates that.
- ffmpeg `drawtext` on Windows needs an explicit `fontfile` with the drive colon escaped (`C\\:/…`).
- Music is real recordings only (incompetech, CC BY 4.0, or the user's track); never synthesise music or SFX.
  `CREDITS.txt` must ship with any film, and `bundle` shows it in the player bar.

## Layout notes

`out/` and `audio/source.mp3` are gitignored; `audio/cut.m4a`, `beats.json`, fonts (OFL) and assets are
committed so films re-render as-is. `examples/kairo/` is the reference film (`plan.md` shows the planning
format). `films/` holds the user's own and client work: it is gitignored and must never be committed or pushed.
