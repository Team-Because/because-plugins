# Gates: what must pass before handover

The builder never grades its own intent. Gates look at the pixels and the numbers. Run all of them
on every build; a failed gate is fixed and re-run, never reported as a caveat.

## 1. Contact sheet against the bar (every fix round)

```bash
$PY $K/gates.py sheet docs/sheet1.jpg out/frames 0,1.4,2.6,4.3,5.3,7.0,...   # one time per beat row
```

Score it out of 10 against Vox (vox-grammar.md), worst finding first. Per frame ask:
1. Is there an event here, or is it holding?
2. One idea on screen, or crowded?
3. Is anything over the face or hands? Any prop half hidden behind an arm?
4. Any matte defect: flowers, petals, audience heads, the editor's old edge, holes?
5. Any text clipped by the frame or by tape over a label?
6. Captions: whole phrases, one line, on the tape line, not repeating a label?

Two or three fix rounds is normal. The six v1 builds stopped at 7-7.5 vs Vox; say the number
honestly and list the 3 weakest points rather than rounding up.

## 2. Frame 0 is the thumbnail

Look at `out/frames/0000.jpg` at full size: the hook is visible, nothing in the top 10% (y < 192),
nothing clipped. A slap-in at t = 0 scales its label 1.22x on frame 0 and pushes it over the top
line, so frame-0 props are placed already settled (start them at t0 < 0 or keep them low).
After encoding, check the decoded first frame too (the encoder can shift colour range).

## 3. Full-res face crop

```bash
$PY $K/gates.py crop out/frames/0250.jpg docs/face.png 340 500 400 400
```

On 3-4 frames across the reel (one per shot or framing). Checks: matte edge clean on hair, ears,
glasses and hands; no petals or audience fragments; the face is the real footage, sharp enough.

## 4. Edge and safe-zone audit (mechanical)

```bash
$PY compose.py --only $(seq -s, 0 5 $LAST) --audit     # or the full render with --audit
$PY $K/gates.py audit out/audit
```

`place()` records every element's box. The audit fails any element with its top above y 192, its
bottom below y 1536 (except tags starting with cap / ledge / desk / floor / sign), or cut by the
left or right frame edge (except tags starting with bleed, used for deliberate exits). Tag every
`prop()` and `place()` call so failures name the element. Zero failures, or fix and re-run.

## 5. Loudness and sync

```bash
$PY $K/gates.py probe out/<name>-vox.mp4   # 1080x1920, audio and video the same length (within 0.1 s)
$PY $K/gates.py loud out/<name>-vox.mp4    # -14 LUFS +-1, true peak <= -1 dBTP
```

## 6. Side by side with the previous version

```bash
$PY $K/gates.py sbs docs/v1-vs-v2.jpg <v1 frames dir> out/frames 0,1.4,5,10,20,30
```

For a v2: against v1, and the v2 must win on the thing it was built to fix. For a rebuilt edit:
against the editor's frames. Re-extract frames from the old mp4 with ffmpeg if the old frame
folder was deleted.

## 7. Captions lint and the date grep

```bash
$PY $K/captions.py docs/transcript.json          # or lint your hand-written CAPTIONS list
grep -rnE "[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}" docs/*.md compose.py   # DD-MM-YYYY only
```

Read every caption chunk out loud once. "THE ALL VALUE" passes the lint and still reads oddly:
the lint catches broken breaks, not the speaker's grammar (keep his words, but break so it reads).

## 8. What I cannot check, said out loud

Listening and real-time viewing. Every handover names them: "judged by measurement and contact
sheets; needs a listen and one real-time watch".

## Static-region gate (L-149)
Split each contact-sheet frame into top, middle and bottom thirds. If any third is near-identical across every beat (mean abs diff under ~3/255 after excluding captions), the build fails: give that region a job.
