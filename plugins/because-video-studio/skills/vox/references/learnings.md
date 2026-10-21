# Learnings: every mistake as a rule

Read this whole file before every build. After every build, append what went wrong or what worked
better than expected, as a rule (format at the bottom). Newest at the bottom of each section.

## Content and words

1. **Never reuse another video's newsprint body copy.** Four of six v1 reels shipped with the
   speed-wins paragraph ("For a century the rule of business was simple...") behind a teacher
   talking about his accent. Write `BODY_TEXT` for each video, about its own story.
2. **Captions break at phrase boundaries.** v1 shipped "BE HE IS" and "THE ALL VALUE": chunks
   cut by word count. Use `captions.chunk_words` (phrase-aware), run `lint`, then read every
   chunk out loud. "BE HE IS" must never happen.
3. **Every word on screen is typed in code.** Never let a model generate on-screen text.
4. **Trust the frames over the brief.** A brief said "audience heads in frame"; the clip had
   none. A brief said one framing; the edit had eleven. Contact-sheet the source first.
5. **Never invent context.** Card tags and name tags carry only facts from the footage or the
   person (event, city). No guessed dates or places.

## Matte and picture

6. **Check mattes for things stuck to the speaker**: lectern flowers and petals (tba-clip4, and a
   white petal near his hair in tba-clip2), audience heads, the editor's old sticker edge. Look at a
   full-res crop on 3-4 frames, not the contact sheet.
7. **Re-mask on a 2x upscaled crop when the speaker is small or turns away.** Full-frame Vision
   lost him whenever he turned his back; crops around the tracked head gave 992/992 frames.
8. **Frame 0: nothing in the top 10%.** A slap-in at t = 0 scales the label 1.22x on frame 0 and
   breaks the top line. Frame-0 props start already settled.
9. **Tape must not cover label text.** Check tape placement on the sheet (tba-clip1 fix round).
10. **Props never sit behind his arms.** Wide gestures hid two props in tba-clip1. Place side props
    high or clear of the gesture range.
11. **Upscaling has a ceiling.** A speaker enlarged 2.6-3x from a wide WhatsApp shot is soft. Use
    Lanczos plus mild unsharp, never an AI upscaler on the face. Prefer a segment with a tighter
    shot when there is a choice, and name the softness at handover.
12. **The bottom 20-30% must be designed.** Three builds called their bottom third "texture, not
    design" (newsprint ledge, plain desk, empty ground). Give it a job.

## Audio and music

13. **Denoise alone sounds hollow.** Warmth EQ + 30% of the original blended back (audio-cleanup.md).
14. **Apple-level music by default, unasked.** Aman wants Apple brand-film music without being
    asked. Sampled instruments through score.py, never code-only synthesis, never playful or marimba.
15. **Sub hits only on story turns**, 2-4 per reel.
16. **Two-pass loudnorm** or the mix undershoots -14 LUFS.

## Tools and machine

17. **Resumable downloads with a size check.** The soundfont download stalled at 208 of 216 MB and a
    build nearly scored with a broken file. `curl -C -` plus a byte-count check (`setup.sh`,
    `score.check_soundfont`).
18. **resemble-enhance's git-lfs pull fails.** Download the weight from the Hugging Face resolve URL
    and patch download() inside its own venv (audio-cleanup.md).
19. **Whisper fails on Gujarati**, even on a demucs vocal stem. Take timing from burned-in caption
    changes and wording from the editor's captions (finished-edits.md).
20. **Never loop AppleScript open commands at QuickTime.** A burst of "open" commands froze it and
    it then ignored everything, which was wrongly blamed on QuickTime itself. Open a video with ONE
    `open <file>`; for many files, one `open` with all of them.
21. **Render CPU is shared.** Up to five agents render at once. Cap `Pool` at 2-3 workers and run
    long jobs in the background.
22. **Big tool folders stay out of git.** A 2.4 GB venv with a nested git clone sat in a build
    folder. `.gitignore` first, delete after.

## Paid routes and permission

23. **Paid AI restyle is not this pipeline.** The Higgsfield/Gemini Omni video restyle test produced
    gibberish newspaper headlines (one read as a rude word) and re-textured the suit with newsprint,
    and the face got small. The local route (real cut-out + coded paper world) beat it.
24. **Paid calls need Aman's explicit yes, per job.** A 15-credit test ran without a clear yes
    (lesson L-146). This skill stays local and free; if anything paid ever comes up, show the model,
    settings and quote and wait.

## Process

25. **Do not touch other builds' folders.** Copy what you need; agents may be writing there.
26. **A new version is a new file.** v2 never overwrites v1 (`<name>-vox-v2.mp4`).
27. **Say what you could not check**: listening and real-time viewing, every time.

---

## How to add a learning

```
N. **<the rule, in one line>.** What happened (build, date DD-MM-YYYY), and the check that
   prevents it next time. If it is mechanical, also add it to a script or a gate.
```

Prefer a mechanical guard over a sentence: a rule that lives only in prose gets broken (lesson L-029).

<!-- Learnings from the v2 context-card builds (14-10-2026) go here and in context-cards.md. -->

- **No static region (L-149, 14-10-2026).** The newsprint floor under the bust cut stayed identical for 36-40 s, 30-40% of the frame dead. Every region changes with the beats: make the floor a live audience strip from the footage (stage videos) or a per-beat coloured surface that props land on. Gate: compare each third of the frame across the contact sheet; identical across all beats = fail.
