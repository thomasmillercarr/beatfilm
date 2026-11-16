# Transitions: how one scene becomes the next

Credit: adapted (condensed and partly rewritten) from HyperFrames' `motion-doctrine` and `cut-the-curve` skills
(Apache-2.0, github.com/heygen-com/hyperframes) and motionmaxxing's `references/transitions.md`
(Apache-2.0, github.com/Tejashmakwana/motionmaxxing). This file is under the Apache License 2.0 (LICENSES/Apache-2.0.txt). See NOTICE.

The failure this prevents: scenes written one at a time, so the eye's momentum dies at every cut
and the film reads as slides. Plan both sides of every cut together.

## 1. The seam law

How scene A exits decides how scene B enters:

1. **Same axis.** x stays x, y stays y, depth stays depth.
2. **Same direction.** Never mirror. In depth, direction is the sign of the scale change: growing
   means pushing in, shrinking means pulling back. A shrinking exit answered by a grow-from-small
   entry is the most common violation.
3. **Matched speed.** B's first frames move about as fast as A's last frames (mirror the easing:
   A accelerates out with `inExpo`/`inQuart`, B decelerates in with `outExpo`/`outQuart` over a similar distance).
4. **Cut mid-motion on both sides.** A is still moving at the cut; B starts more than halfway
   along its path. Settling to rest before a cut, or starting from rest after it, is a dead beat.
   Exception: a held beat may end at rest when the cut itself is the cause (a click, a key press,
   the drop). B must then be at full speed on its first frame.

**The current.** Pick one default direction of travel for the film (say left) and use it at
ordinary cuts. Other directions mean something: up = a conclusion rising; push in = going deeper
into the same thought; pull back = arrival, something bigger lands. Never run consecutive cuts
in opposite directions. A change of direction needs a visible cause (an impact, a click) or a new chapter.

**Carry something across.** The eye follows objects. The best cuts hand a concrete thing across
at matched position and speed: a word, a dot, a card, a cursor, the ground colour. A crossfade
carries nothing.

**Eye trace.** B's focal point appears where A's focal point was on its last frame, or where A's
motion was heading. On the stills sheet, check the focal point on both sides of every cut.

**Cause and effect.** Effects start on the frame of their cause, not shortly after. Big things
react slower, small things snap.

## 2. While a scene is on screen

- **No idle wobble.** Breathing, floating and glow-pulsing to fill time read as "the video is
  waiting". If a scene finishes entering with seconds left, that is a planning bug: add story.
  Every scene keeps performing by one of: staged reveals (hold content back, pay it off on beats),
  a camera move with a destination, the UI doing its job (progress, counts, highlights), an object
  acting out a beat, or a cursor that walks the eye and clicks.
- **Stillness before the climax.** Put a 0.3-0.75 s held beat between the big action and its result.
  That pause is what makes the result land.
- One entrance is at most ~0.8 s; a longer build is a stagger of several elements. Exits are
  quicker than entrances. Similar elements share one easing. No `outElastic` or bounce on whole
  scenes; one visible spring per film is plenty.

## 3. Catalogue (pick 2-3 for a film and repeat them)

| Id | Transition | Use when |
| --- | --- | --- |
| T1 | **Hard cut on motion**: both sides moving, cut on a beat | the default for everything |
| T2 | **Carried object**: one element continues across the cut at the same place and speed | state changes, chapters |
| T3 | **The effect becomes the next ground**: a dot grows into the new background, a band sweeps and stays | dark to light, a change of world |
| T4 | **Container replacement**: a card shrinks or docks into the next layout | list or form becomes a result |
| T7 | **Wipe that starts in A and finishes in B**, painted in B's ground, made of the film's own shape | text to UI, subject changes |
| T8 | **Mask through the glyphs**: the next scene shows through the type | question to answer, word to world |
| T11 | **Zoom-through** into a detail (a letter's counter, a logo part) | brand to product |
| T12 | **Pull-back reveal with a snap**: one fast scale step, then a slow tail | the payoff, the arrival |
| T13 | **Whip**: fast travel with motion blur (`BF.mblur`), and content changes during the blur | energy peaks |
| T14 | **Scale cut**: a one-frame scale jump with a content change in the same frame | same subject, new distance |
| T19 | **Hard replacement** of a word or line, with no re-centring | copy changes in a sentence |

Choosing by what changes: only the state → T1 + T2. Ground → T3. Scale → T14 or T12.
Subject → T7, T4 or T8. Chapter → T1 + T2 plus a ground change, never a number or title card.
Brand to product → T11.

Build wipes and masks from shapes that already live in the film (the logo's geometry, its
grid, its dot). A generic slide-in reads as a template.

## 4. In beatfilm

- Cuts land on downbeats (scene changes) or beats (changes within a scene). With VO, the
  change leads the spoken word by about 0.1-0.2 s.
- Write a one-line handoff for each cut in `plan.md`: `cut at bar 4 | A exits left, accelerating |
  B enters left, mid-flight | carried: the blue dot | T2`. Check A's last frame and B's first on
  the stills sheet (`--at` just before and after each cut).
- A crossfade is allowed only on a single object whose identity continues (one icon becoming
  another on the same spot), never between whole scenes.
