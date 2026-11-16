# BF runtime reference (`bf.js`) and troubleshooting

`grid({ bpm, bars, drop, tail })` → a `beats.json`-shaped map on a steady grid, for drafts with no
analysed track. `bars = round((length − tail) × bpm / 240)`, so 15 s at 120 bpm is 7 bars.

`clamp lerp invlerp` · `map(t, t0, t1, a, b, ease)` (clamped, eased) · `kf(t, [[t0, v0], [t1, v1, ease]…])`
(numbers or arrays) · `ease.{linear, in/out/inOut Quad|Cubic|Quart|Expo, outBack, inBack, outElastic,
spring(u, k, z)}` · `rng(seed)` → `() => [0,1)` · `hash(...n)` · `noise(x, seed)` (smooth, −1..1) ·
`shake(t, amp, freq, seed)` → `{x, y, r}` · `set(el|sel, {x, y, z, s, sx, sy, r, rx, ry, skx, o, blur,
...css})` · `tf({...})` → transform string · `split(el, 'chars'|'words')` → spans (call in setup; it
flattens the element's text, so use one element per line rather than `<br>`) · `mblur(el, dx, dy)`
directional blur · `grain(amount, size)` → `fn(f)` call each frame · `fmt(n, dec)` · `$ $$` ·
`beats(map)` (done for you by `BF.film({ beats })`, also on `window.B`).

## Troubleshooting

- `check` FAIL "renders differently depending on the previous frame": something isn't reset each frame
  (an element only set while its scene is active, text written conditionally, a cached value). Make the
  frame function set it unconditionally.
- Fonts missing: the `fonts: [...]` descriptors must match `@font-face` family/weight/style.
- Wrong downbeat (cuts feel one beat off): rerun `beats.mjs` with `--phase` (0–3). Wrong tempo: `--bpm`.
- Track shorter than `--duration`: `beats.mjs` cuts as many whole bars as fit and warns. Pick a longer track or a shorter film.
- Chrome not found: set `CHROME_PATH`. Extra Chrome flags (e.g. `--no-sandbox` in CI): `CHROME_FLAGS`.
  Slow 4K renders: `--workers N` (default ≈ cores/3), or render 1080.
