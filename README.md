# beatfilm

A Claude skill that turns a few lines about a product, game or brand into a motion-design film cut to
the beat of real music, rendered to 4K.

1. Describe it in a few lines: `/beatfilm Kairo is a calendar that plans your week for you…`
2. Claude writes the concept and copy, animates every frame as HTML/CSS/SVG, and cuts it to a measured beat map.
3. The film renders headless to `out/film_4k.mp4` (3840×2160, H.264, AAC).

Everything runs locally with Node ≥ 22, ffmpeg and Chrome/Edge. There are no npm dependencies and no
generation credits.

## How it works

| Piece | What it does |
| --- | --- |
| `scripts/music.mjs` | searches Kevin MacLeod's incompetech catalogue (~1,400 CC BY tracks) by feel and bpm, and fetches a track with its credit line |
| `scripts/beats.mjs` | spectral-flux onsets → tempo (autocorrelation) → beats (Ellis DP, snapped to a steady grid when it fits) → downbeats, energy, hits → a phrase-aligned cut of N bars plus a faded tail. Beat timing is within ~1 ms of ground truth on synthetic clicks |
| `runtime/bf.js` | the page runtime: easing, keyframes, seeded noise and shake, beat helpers, text splitting, motion blur, grain, and a live player with audio |
| `scripts/render.mjs` | `bundle` packs the film into one self-contained live-preview page (fonts, audio, beat map and credit inlined) for Artifacts. `render` drives N headless Chrome instances over the DevTools protocol. Each renders a contiguous chunk at device-scale (true 4K raster, not upscaled) and pipes frames straight into x264. Chunks are concatenated losslessly and the cut audio is muxed in. `check` verifies the page contract, fonts, network and frame determinism |
| `SKILL.md` | the workflow and craft rules Claude follows: plan → music → beat map → page → check → stills review → render |
| `examples/kairo/` | a complete 30 s reference film made from a two-line brief |

## Install as a skill

Copy or link this folder to `~/.claude/skills/beatfilm/`, then ask Claude Code for a film or type `/beatfilm <brief>`.

## Background

This is a clean-room take on Higgsfield Katana's motion-graphics path, based on its published workflow
documents. That path is one HTML page drawn from time, rendered frame by frame in Chrome and encoded
with ffmpeg, with real recorded music and energy-matched cuts. beatfilm drops Katana's dependence on a
reference video and paid generation: it goes straight from a brief to a film. No Higgsfield code is
included.

Music from incompetech is licensed CC BY 4.0, so ship the generated `CREDITS.txt` line with the film.
