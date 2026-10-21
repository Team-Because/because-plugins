# Context cards: keep the room on screen

Added 14-10-2026 after Aman watched the six v1 reels and asked whether the paper cut-out loses what
the raw video shows (the speaker sharing something on the podium).

## Why

When the source is an event or a stage, cutting the speaker out throws away the room: the stage,
the banner, the lectern, the audience. That context is the proof. "A man in a suit saying speed
wins" is ordinary. "A man saying speed wins on stage at a brand launch, in front of a full hall" is
a moment. Without it the viewer cannot tell it was a live keynote at all.

Vox's own collage rule: real photos
stay real and appear as cards (white margins, rounded about 18 px, slight rotation of 1.5-3 degrees,
soft shadow), and a photograph is never recreated, because an invented photo reads as fake. So the
answer is not "cut out everything": real footage of the context goes on screen as a printed photo
card inside the collage.

## When

| Source | Context cards |
|---|---|
| Stage talk, keynote, launch, panel, award, any event with a room | Yes: opening card + 1-2 inserts + real logo |
| Testimonial filmed at an event (banner behind them) | Yes: opening card of the banner shot; the logo from the banner |
| Seated interview, teacher at a desk, studio, no venue | No. There is no room to lose (the VIP reels need none) |

## The three pieces

1. **Opening card from frame 0.** The real wide shot (stage, banner, crowd) plays as a live photo
   card (`photo_card()`, rebuilt from the source frame every frame so it moves), with a verifiable
   typewriter tag: what and where, e.g. "LIVE ON STAGE, TRANSWORLD INDIA LAUNCH, AHMEDABAD". Only
   facts you can verify from the footage or the person; never invent a city or a date.
   Frame 0 is the thumbnail, so the card and its tag sit fully below y 192.
2. **Hand-off event by about 1.3-1.5 s.** The card is torn away (`torn_reveal`) or slid off
   (`card_handoff(kind="slide")`) while the speaker sticker slaps in over it (`slap()` on the
   speaker scale). The viewer reads "big event" before the first line ends, then gets the person.
   The template draws the card UNDER the sticker so he lands on top of the leaving card.
3. **1-2 live inserts tied to lines.** A small live card of the audience or the wide stage lands
   on a line that names the room or the people: in "Speed wins" the audience card lands on "a
   network of business advisors", so the room becomes the network. Insert = a prop: it slaps in
   on its word, sits beside the speaker (never over face or hands), leaves at the act change.
4. **Real logo cropped from the footage.** Crop the logo from the banner, lectern or slide
   (`logo_from_footage()`), torn paper edge, taped on as a sign-off or name tag. Never redraw a
   logo.

## How (compose_template.py)

```python
OPEN_CARD = dict(crop=(0, 0, 1920, 1080), tag="LIVE ON STAGE, <EVENT>, <CITY>", t_out=1.0, kind="slide")
INSERTS = [dict(t0=24.95, t1=27.0, crop=(0, 650, 1920, 1080), x=760, y=470, w=520, rot=-3, tag="THE ROOM")]
```

- `crop` is in SOURCE pixels. For the opening card use the widest clean shot in the segment; if
  the segment is a tight shot, take the card from an earlier wide moment of the same source (a
  still from the real footage is still real) and say so in beats.md.
- Width 900-980 px for the opening card, 420-560 px for inserts.
- Check the card at full resolution: a 1920 px stage shot shrunk to 944 px is sharp; a 3x
  upscaled crop is not, crop less.

## Learnings from the v2 builds

<!-- MAIN SESSION: fill this section from the four v2 builds (speed-wins, tba-clip1, tba-clip2,
tba-clip4 with context cards, 14-10-2026). For each: what the opening card showed and its tag, the
hand-off timing and kind that read best, which insert lines worked, how the logo was cropped,
gate results, the score vs v1, and anything that went wrong. Then turn the patterns into rules
above and add the mistakes to learnings.md. -->

### speed-wins v2 (14-10-2026), score 8.5 vs v1 ~8
- Opening: 4:3 crop of the wide shot (screen, speaker, banner, audience) under the masthead, 18 px border, -2 deg, two tapes, red "LIVE ON STAGE" tag. Red marker ring draws round the man at 0.40 s, then at 1.0 s the card tears at his x and the halves fly apart; the sticker slaps in through the gap at 1.08 s. Halves gone by ~1.4 s.
- Inserts: small wide-stage card between SPEED and WINS (18.90-20.89 s); audience card on "a network of business advisors" (24.95-28.79 s) with paper dots popping onto real heads, linked by drawn lines (replaced drawn nodes).
- Logo: median of every 20th wide frame removes the speaker from the screen, giving a clean real Transworld logo used as a torn clipping.
- Short of: frame 0 lower 40% is body copy only; no lip-sync for the first second; room off screen 1.4-18.9 s.

Rules from it:
1. Establish the room, then isolate: live wide plate, red ring on the subject, tear the card at the subject's x so he steps out of the photo.
2. Draw every annotation in card space before rotating the card, so rotation and jitter carry it and it stays on the feature.
3. Locate the speaker in a wide shot cheaply by thresholding dark pixels against a bright screen band (luma < 70); no extra matte needed.
4. A median of every Nth wide frame gives a clean plate: real logo or banner with the speaker removed. Real pixels, never redrawn.
5. Tie each card to a line where the room IS the meaning ("network" = dots on real heads).
6. Big cards get a soft slap (1.06 then 1.02), never the 1.22 label slap, or they break the edge and top-band rules.
7. Frame 0: no slap and no caption, everything settled; check numerically that the first changed row is below y 192.
8. Printed-photo grade on cards (lifted blacks, -10% saturation, slightly warm) so they sit on the paper while faces stay real.
9. Cards live in the behind layer so the speaker always covers them; only the tear halves go in front, for 4 steps.

### tba-clip1 v2 (14-10-2026), score 8 vs v1 ~7
- Opening: uncut shot of him in front of the Transworld banner (1030 px card) under the "FIRST TIME" hook with his name tag; sticker slaps in at 0.92 s while the card is pulled off left in 4 steps, gone by 1.25 s.
- Inserts: the banner's real 7-step process list on "how they set up this process" with red ticks on its real bullets (replaced invented tags); banner + him on "this is the platform" with a ring on the real logo, pulled off on "unlock". Real logo on torn paper at the sign-off.
- Short of: banner is soft in the footage, so the process card and logo are a little blurry; plain mustard area in the last act.

Rules from it:
1. Re-extract source frames by measuring against the masks: ffmpeg -ss landed one frame off; an edge-correlation check over offsets 0-8 finds the right one.
2. Build a gesture map first (union of the matte per act); props hide behind arms below ~y 950, the slots above the shoulders and the top band are safe.
3. Card exit: sticker slaps in on top while the card leaves behind in 4 steps with growing offsets (about 70, 320, 680, 1100 px) and more rotation per step. A slow first step reads as a stall.
4. A card needs room: drop the speaker scale for that act (0.82) rather than shrinking the card; keep cards 400-680 px wide in the top band, above the head top.
5. Annotate on real features measured in source pixels and mapped through the card's crop, scale and rotation.
6. Clip tint and contrast before converting to uint8, or bright pixels wrap into cyan.
7. Evidence beats invention: if the footage contains the thing described (a process list on a banner), show it as a card instead of writing tags.
8. Caption cues are best hand-cut as a word-index table; each cue must end where the next hide window starts.

### tba-clip2 v2 (14-10-2026), score ~8 vs v1 ~7.4
- Opening: live wide card (stage, "05 Speed Wins" slide, banner, audience) with "LIVE ON STAGE"; SPEED lands over it at 0.64 s; 0.75-1.25 s the card zooms into him and ends exactly at the sticker's scale and position, then the room drops away to paper (zoom-isolation hand-off). WINS lands on the last step.
- Inserts: audience card "THE ROOM" on "go."; real logo (filled only blank banner where a head overlapped) under the SOLD shop; the wide stage card returns on the "but speed wins" callback ("SAME STAGE").
- Short of: ~6 frames of over-exposed slide screen during the zoom; a few 1-3 frame specks near hair and glasses; logo small. The "LIVE ON STAGE" tag on frame 0 sits partly off the left edge.

Rules from it:
1. The opening card can BE the hand-off: map the source through one transform and blend scale (geometrically) and anchor from the card to the sticker's exact transform, then cut to paper with him in the same spot.
2. Aim audience crops away from the speaker (offset ~560 px from the follow centre), or the crop shows his legs.
3. Layer: ground, cards, speaker, then hook labels on top, so a card's slap never hides the hook.
4. A callback card repeats frame 0's composition; it rhymes with the opening for free.
5. Check every frame for something in front of a logo before cropping it; fill blank banner, never redraw the logo.
6. Stage footage puts podium flowers in the person matte: inspect a sheet of tight head crops (thumbnails hide cream petals), repair from clean neighbouring frames, and protect a region in front of the face (a pink filter also cuts skin).
7. Scan the source for broken frames (grey or blocky); hold the previous frame for one frame.
8. Tags pinned to a tilted card must be checked against the frame edge after rotation.

### tba-clip4 v2 (14-10-2026), score ~8.5 vs v1 ~7
- Opening: 4:5 card of the room (LED wall, him at the lectern) under the "1 + 1 = ?" hook, tags "LIVE ON STAGE" and "TBA INDIA BRAND LAUNCH" (printed on the lectern in the footage). Zoom-isolation 1.00-1.25 s onto the cut-out's exact transform, then the room falls away with a person-shaped hole.
- Inserts: wide stage card with the real logo (median of LED-wall frames) on "with Transworld", lifted off on "go up"; closing lectern card under "CHANGE IN ATTITUDE."
- Fixed: lectern flowers removed from the matte (zone-limited colour rules); 11 broken Vision mattes (2 empty) rebuilt with optical flow, which v1 had shipped.
- Short of: raised hands over the removed flowers become separate floating pieces (~10% of frames); short 1 s insert.

Rules from it:
1. Measure the footage crop first (template-match the extracted frame inside the raw frame across scales) so a card zoom lands pixel-exactly on the cut-out.
2. Re-extract the uncut source on the output timeline with the same trims; full size only where a card zooms past 1x.
3. Card tags only use text visible in the footage; otherwise just "LIVE ON STAGE".
4. Crop logos from the cleanest large surface (LED wall over a small lectern print), median over clear frames.
5. Check every frame's matte area against the clip median before building: Vision dropouts are invisible on a sampled sheet.
6. Zone-limited colour cleanup separates gestures from the body; decide how real hands are kept, drop crumbs by size.

## Floor rule (L-149, after the v2 review)
The static newsprint floor that hides the waist cut froze 30-40% of the frame in every v2. Tested on tba-clip2 v3 (14-10-2026, score ~8.5 vs v2 ~8, static-region gate passes: bottom third median diff 63 vs identical in v2):
1. For stage footage the floor under the bust cut is a live audience strip from the same frame (white border, ~1 deg tilt, shadow, printed-photo grade), bleeding off both sides. It hides the cut and puts him back in his room.
2. Crop the strip beside the speaker, following the camera (about +-560 px), with a legs margin checked against his raw head x on every frame, or a small second copy of his legs appears. Pick the side per act so side switches land on ground changes.
3. Fix the strip height and aspect first; source crop width and usable sides follow. Run the feasibility check on all frames before rendering.
4. Leave 80-120 px of the act's ground below the strip so the bottom also changes colour with the beats; tape and tag take the act colours; a fresh print drops in (10 px then 3 px) on each act change.
5. If an edit file exists (out/edit.mov), extract frames from it, and still verify the offset against the masks.
Known softness: a 1.45x upscale of phone footage; the pale stage front panel lightens the strip's top edge.

## Layout A: news-anchor bust (chosen by the user for tba-clip2 v4, 14-10-2026)
The user rejected the static newsprint floor (v2) and the live audience-heads strip (v3) and picked layout A: no floor, the speaker scaled up (4.5-5x source) so his torn bust edge runs off the frame bottom, face around y 600-1000, the act ground fills the rest. Rules from the v4 build:
1. Re-derive head x from the final repaired matte before scaling up; interpolated tracks invisible at 2.6x drift a head width at 4.5x.
2. Build a per-act gesture map and audit every prop against it (flag above 4% hidden). Free space in a bust layout is the top band (y 192 to the head top) plus side columns ~250-300 px wide above the shoulder line. Low props have no home.
3. Settle frame-0 props (t0 < 0) and check every slap's 1.22x peak against y 192.
4. Place captions per cue from a skin-based hand map (score mean and 90th percentile), split long cues at word boundaries, and composite hands back over the tape so they are never hidden.
5. At high scale use a 0.15/0.7/0.15 temporal matte blend plus a small closing, or fast hands leave half-opaque ghosts.
6. A zoom hand-off ends by painting the speaker layer itself with the same resampling (no sharpness pop); a front-loaded ease gets card edges out of frame on the first step.
7. Upscale finish: Lanczos plus a luma-only two-scale unsharp mask; no denoise (it looks plastic), no AI face restoration.
Known limits: face softness is set by the source at this scale; long back-to-camera stretches stay as they are in the footage.
