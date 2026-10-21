# Vox visual grammar for a talking-head reel

The benchmark is Vox's paper-collage explainers: flat bold grounds, halftone, torn paper, tape,
scissor-cut props that move in hand-made steps, red marker on real documents. A talking-head
reel borrows that grammar and adds one rule Vox never needs: the person stays real.

## The rules

1. **One idea per beat.** One ground, one main prop or label, one marker gesture. Crowding is the
   first thing that breaks the look (Meet's VIP edit stacked five speech bubbles in 5 s).
2. **An EVENT every 2-4 s** (1-3 s is better). An event is a change you can name in one line:
   "SMALL slaps over SMEs", "the ? card becomes a mustard 2", "the shop tears into scraps". A prop
   sitting still with jitter is not an event.
3. **Flat grounds that change per beat.** Newsprint (cream with columns), red, mustard, ink, plus
   story grounds: chalkboard green, notebook paper, paper green. Each carries halftone dots and
   paper grain. A ground change marks a new idea; a cut in the edit always lands on one. Give the
   colours a logic when the story allows (tba-clip2: green = go, red = stop, mustard = good enough).
4. **Ground changes can rip in.** `ground_rip()`: the new ground tears down over 3 stop-motion steps.
   A hard cut is better on a hit word ("GONE.").
5. **Halftone and grain everywhere.** Dots on grounds and cut-outs, `make_grain()` over the frame.
6. **Torn paper.** Labels are torn clippings (`label()`), the speaker can be a torn bust, ledges
   and desks have torn edges.
7. **Tape.** Masking tape on label corners and photo cards (`tape=True`, `add_tape()`).
8. **12 fps props.** Props move on 12 fps stop-motion steps (`STEP = 12`, `step_t`, `jitter`)
   while the speaker plays at the source rate. That contrast is the look.
9. **Slap-in.** A prop arrives big for one step (1.22x), settles (1.06x), then 1.0 (`slap()`),
   on its spoken word.
10. **Marker draw-ons.** Red rings, strikes, underlines, ticks, crosses and arrows draw on over
    0.2-0.45 s on the stop-motion grid (`marker` + `partial` + `draw_p`). Rings overshoot their
    start like a real hand (`ring()`).
11. **Real documents with red marks.** A dictionary entry, a timetable, a memo, a bus ticket, a
    name card, a ledger: typed with real words from the story, then marked in red. Documents read
    as typesetting, so recreating one is allowed (flag it as recreated if it claims to be a real
    historic record). Photos are never recreated (see context-cards.md).
12. **Punch-ins.** On story turns the speaker scale jumps (1.15-1.3x) on a ground change. Use 2-5
    per reel, on the lines that matter.
13. **The real face is never redrawn.** The speaker is real footage cut out with a white sticker
    edge, a thin ink line and a paper shadow (`sticker_composite`). No AI restyle, no filters on
    the face beyond the light print grade.
14. **Props never cover the face or the hands.** Props go behind the shoulders (`behind()`) or in
    clear space; `front()` is for things that must sit over the body edge (a stamp beside him, the
    caption tape on the bust edge). When he gestures wide, move side props up or out, never let
    them sit behind his arm (tba-clip1 lost two props that way).
15. **Safe zones.** Nothing important above y 192 (top 10%) or below y 1536 (bottom 20%) on a
    1080x1920 canvas: the Shorts/Reels UI covers them. Captions sit on tape at y ~1430-1520, on
    the bust edge, ledge or desk, never across the chest. Frame 0 must be clean in the top 10%.
16. **Write the words, never generate them.** Every word on screen is typed in code from the
    speaker's own words (or the editor's vetted captions). The paid AI restyle produced gibberish
    newspaper headlines, one of them rude.
17. **Captions hide when a prop says the same words.** The line is never on screen twice.
18. **Frame 0 is the thumbnail.** It already shows the hook (the question card, the key word,
    the room card), with nothing cut off and nothing in the top 10%.

## The cast of props (all in voxkit or in the builds)

| Prop | Use |
|---|---|
| `label()` torn clipping, Impact / DIN / Typewriter / Didot | key words, stamps, tags |
| `cutout()` scissor-cut shape (any PIL drawing) | fish, shops, coins, padlocks, bulbs, traffic lights, bridges, stop signs, hearts, bells |
| `person()` paper person | crowds; crude up close, keep them small or make better ones |
| `doc()` torn document | memos, tickets, dictionary pages, timetables |
| `disc()` paper dot, `arrow_shape()` | networks, flows, direction |
| `marker` + `ring` / `strike` / `underline` / `tick` / `cross` / `arrow_head` | the red hand |
| `photo_card()` | real footage as a live card (context-cards.md) |
| `logo_from_footage()` | a real logo cropped from the footage |

## What lifts a reel from 7 to 8+ (the gaps every build reported)

1. Props that TRAVEL (slide, hop, stack, tear, swap) instead of slap-and-hold.
2. The bottom 20-30% designed, not filled: a ledge or desk is an anchor, but give it a job.
3. Better crafted cut-outs (paper kids as a head on a block read as crude next to an illustrator's).
4. A sharp speaker: tighter source framing beats any upscale.
5. Camera moves on cut paper (parallax, a slow push) on one or two beats.
