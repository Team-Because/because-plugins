# The six builds (14-10-2026)

These six builds live on the plugin owner's machine, not in this plugin (`M` below is their folder there). Use the
table for what each build taught: the mood, length and score choices. Ask the plugin owner for a build's brief and beat
sheet when the closest one would help.

| # | Build | Source | Length | Mood | Score | Path |
|---|---|---|---|---|---|---|
| 1 | Speed wins (the reference) | English keynote, wide stage, 16:9 tracked to 9:16 | 30.5 s | keynote | Approved by Aman: "This really looks good" | `M/speed-wins-reel/vox-local/` -> `M/speed-wins-reel/out/speed-wins-reel-vox.mp4` |
| 2 | TBA clip 1, testimonial | Raw, medium shot in front of the banner, 47.4 s | 36.2 s | warm | 7.5 vs Vox | `M/vox-reels/tba-clip1/` |
| 3 | TBA clip 2, "Speed wins" talk | Raw, wide stage, speaker small, turns away, audience in front | 39.7 s | keynote | 7.5 vs Vox | `M/vox-reels/tba-clip2/` |
| 4 | TBA clip 4, "1 + 1 = ?" | Raw vertical 1728x3072, lectern with flowers, one Gujarati line | 34.75 s | keynote | not scored (agent cut off; output verified: 868 frames, -14 LUFS) | `M/vox-reels/tba-clip4/` |
| 5 | VIP ni Class | Meet's finished edit, Gujarati, burned-in captions | 38.96 s | warm | 7 vs Vox, 8.5 vs Meet | `M/vox-reels/vip-class-39s/` |
| 6 | VIP "ponch" story | Meet's finished edit, Gujarati, 11 shots, music bed | 60.56 s | warm | 7.5 vs Vox, 8.5 vs Meet | `M/vox-reels/vip-60s/` |

## 1. Speed wins (reference compositor)

- The method was born here: Vision matte, sticker speaker, coded paper world, 12 fps props,
  captions on black tape. `compose.py` (610 lines) is the source of `voxkit.py`.
- Beats worth stealing: "big eats small" acted out by paper fish; "GONE." hard cut to red with a
  punch-in; three "FASTER TO ..." labels while one red arrow draws in thirds; "SPEED WINS / NOT
  SIZE." with a red X; a network of paper dots and lines on "a network of advisors".
- Sub hits on "gone", "speed wins", "five years". Keynote, lift to major on the promise.
- Built after a paid Higgsfield restyle test failed (gibberish headlines, re-textured suit).

## 2. TBA clip 1 (testimonial)

- Segment skips 11 s of introductions; credentials became paper stamps in the first 2.6 s.
- Torn paper bust edge at y ~1432 with captions as tape on that edge, so captions never cover
  hands. Newsprint floor strip under every scene.
- Story props: coins stacking, paper people each receiving a coin, PREPARE / PRICE / BUYERS /
  CLOSE tags from the real banner ticked one by one, a brick shop built one brick per step, the
  shop tearing into scraps on "VANISH.", a padlock springing open.
- Audio: resemble-enhance + warmth EQ + 30% blend (19 to 24 dB speech-to-noise).
- Weak: small sticker (scale 0.92-1.1), side props behind his arms, mostly slap-and-hold, caption
  breaks ("BE HE IS", "THE ALL VALUE").

## 3. TBA clip 2 ("Speed wins" talk, wide stage)

- Hardest matte: head ~55 px tall, back turned twice, podium flowers, audience heads.
  `tools/track.py`, `crops.py`, `clean_masks.py` (now `matte.py`): 2x crops, cut at source y 730
  above the audience, rim colour test for flowers, hole fill. Torn newsprint ledge hides the cut.
- Two dead-air cuts placed on ground changes. Traffic-light colour logic.
- Props: stopwatch, tear-off calendar, walking red arrow with speed lines, a READY bar stalling at
  85%, a traffic light turning green on "go", a crossed-out bridge vs a SOLD shop, a bulb lighting
  on "smart", crumpled paper balls piling up on "mistakes".
- Weak: soft face (2.6x upscale), busy bottom third, back-turned beats rely on props, one petal fleck.

## 4. TBA clip 4 ("What is one plus one?")

- Static camera: `tools/refine_masks.py` (now `matte.py plate`) built an empty-stage plate and a
  difference key, fixing Vision leaking onto the LED wall logo near raised hands.
- Torn bust cut above the floral lectern; frame 0 already shows "1 + 1 = ?" (the question is on
  screen before he speaks). The equation cards hop on their words; the answer card flips 2, 11, 2,
  11 on stop-motion steps and lands on "YOU DECIDE.".
- Cut the mutual-fund example (third repeat), payoff moved 41 s to 30 s.
- Weak (seen by the main session): lectern flowers still stuck to the cut-out in places; frame 0
  had tape over the first "1" (the agent was re-rendering that fix when it was cut off; check frame 0).

## 5. VIP ni Class (Meet's edit)

- Caption tape measured per frame (top >= source y 1545); torn photo clipping cut at <= 1530.
- A wooden paper desk at y 1390 anchors every shot and carries the captions (y 1478).
- Per-shot size normalisation from head width; punch-ins at 3.5, 11.28, 26.92, 34.0 s.
- Ground rips (3 stop-motion steps) between acts. Real artefacts: a name card, an Std 8 timetable
  with VIP periods ringed, two doors, a principal's memo, a ringing bell, a desk nameplate.
- demucs stripped Meet's music bed; timing from Meet's captions (Whisper failed on Gujarati).
- Score lifted +16 dB after the last word to carry the end card.
- Weak: crude paper kids, slap-and-hold motion, plain desk eats 28% of the frame.

## 6. VIP "ponch" story (Meet's 60 s edit)

- Same caption-safe bust cut (tape never above 1557); Meet's white edge eroded and inpainted.
- Eleven shots normalised (`min(1.62, 345 / head_width)`), face around y 650-800.
- Documents carry the story: a gazetteer card with MEHSANA ringed, a dictionary entry "paani (n.)
  water" struck through, a MEHSANA / AHMEDABAD bus ticket with a dashed red route, 5 / 35 / 55 / 95
  on a chalkboard, a notebook "LESSON" typed word by word, a memo "TO: MY TEACHERS".
- Sub hits only on the two turns (the students' answer, "but never ponch").
- Soundfont download stalled at 208 of 216 MB; resumed into a local copy.
- Weak: bottom 25% empty, hands below the chest cut, prop timing estimated.
