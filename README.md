# beatfilm

A Claude skill that builds a motion-design film cut to the beat of real music and renders it to 4K.

> **beatfilm now ships as part of [motion-studio](https://github.com/thomasmillercarr/motion-studio).**
> motion-studio puts creative direction before the build: research, three directions, your
> approval. That is the recommended install. This repo stays as the standalone skill, kept in
> sync with motion-studio's `skills/beatfilm`.

1. Describe it in a few lines, or hand it an approved `direction.md` from motion-studio's `studio` skill.
2. Claude plans the film, animates every frame as HTML/CSS/SVG and cuts it to a measured beat map.
3. The film renders headless to `out/film_4k.mp4` (3840×2160, H.264, AAC, with the music credit in the file's metadata).

Everything runs locally with Node ≥ 22, ffmpeg and Chrome/Edge. There are no npm dependencies and no
generation credits. In Claude chat, where none of those run, it makes a live, silent draft as an Artifact.

## How it works

| Piece | What it does |
| --- | --- |
| `scripts/music.mjs` | searches Kevin MacLeod's incompetech catalogue (~1,400 CC BY tracks) by feel and bpm, and fetches a track with its credit line |
| `scripts/beats.mjs` | spectral-flux onsets → tempo → beats (Ellis DP, snapped to a steady grid, gaps filled) → downbeats, energy, hits → a phrase-aligned cut of N bars plus a faded tail |
| `runtime/bf.js` | the page runtime: easing, keyframes, seeded noise, beat helpers, text splitting, motion blur, grain, a live player, and `BF.grid()` for drafts with no track |
| `scripts/render.mjs` | `check` (contract, fonts, network, determinism), `stills`, `render` (parallel headless Chrome → x264, true 4K raster), `bundle` (one self-contained preview for an Artifact) |
| `references/` | `slop.md` (the never-ship list), `transitions.md` (seam law and transition catalogue), `runtime.md`, `chat-draft.md` |
| `SKILL.md` | the workflow and craft rules Claude follows |
| `examples/kairo/` | the page format, as a reference for the runtime contract (its creative choices predate `references/`) |

## Install as a standalone skill

Copy this folder to `~/.claude/skills/beatfilm/`, then ask Claude Code for a film or type
`/beatfilm <brief>`. Don't install it alongside the motion-studio plugin; the plugin already includes it.

## Credits

`references/slop.md` and `references/transitions.md` are adapted from
[HyperFrames](https://github.com/heygen-com/hyperframes) and
[motionmaxxing](https://github.com/Tejashmakwana/motionmaxxing) and stay under Apache-2.0 (see `NOTICE`).
The pipeline is our own, informed by public descriptions of AI motion-graphics workflows. It contains no
Higgsfield code, prompts or documents and is not affiliated with or endorsed by Higgsfield.
Example music: CC BY 4.0, Kevin MacLeod. The music credit must ship with any film.
