# Draft preview without Node, Chrome or ffmpeg (Claude chat, phone)

When the scripts cannot run, make a **draft preview** and tell the user plainly, once, that the MP4
is rendered later in Claude Code or by GitHub Actions.

1. Plan exactly as in SKILL.md §1, with a music brief (feel words + bpm) instead of a fetched track.
2. Write one self-contained HTML page. Paste the full contents of this skill's `runtime/bf.js` into
   an inline `<script>` that starts with the comment `// beatfilm runtime` (no `src`). Load fonts with
   a Google Fonts `<link>`. Pass `beats: BF.grid({ bpm, bars, drop })`
   (`bars = round((length − 1) × bpm / 240)`) and no `audio`. The page contract in SKILL.md §3 applies.
3. Publish it as an Artifact. It plays live and silent on the steady grid. Check it yourself in the
   preview before handing it over. If you cannot see frames, list 5-8 timestamps for the user to
   scrub (one per scene and each side of every cut) and say what should be on screen at each.
4. Give the user the page as a file (`index.html`) to keep. The approved direction travels with it
   in the conversation.

## Finishing the draft (Claude Code)

Put the page in `films/<slug>/index.html`, then:

1. Move the inline runtime back out: delete the inline script and add `<script src="bf.js"></script>`
   (copy `runtime/bf.js` into the film dir).
2. Replace the Google Fonts `<link>` with local `@font-face` files fetched as in SKILL.md §3.
   `check` fails on any remote URL.
3. Run SKILL.md §2 to get the real track and `beats.json`. Switch to `beats: 'beats.json'` and
   `audio: 'audio/cut.m4a'`, and retime anything that relied on the steady grid.
4. Run SKILL.md §4.

The GitHub Actions route needs the same steps 1-3 done first, because the workflow runs `check`.
