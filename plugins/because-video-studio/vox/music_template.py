"""Score for <TITLE>. Content: <what is said, in one line>. Mood: <keynote | warm> because <why>.
Arc: <where it drops, where it lifts, which lines get a sub hit>. Engine: score.py in the vox-reel
skill (sampled instruments via FluidSynth + MuseScore General, pedalboard chain, local, free).
Read references/music.md before filling the sections.
"""
import os
import sys

def _studio_vox():
    """The studio's vox tools: walk up from this file to the folder holding vox/voxkit.py."""
    d = os.path.dirname(os.path.abspath(__file__))
    while d != os.path.dirname(d):
        if os.path.exists(os.path.join(d, "vox", "voxkit.py")): return os.path.join(d, "vox")
        d = os.path.dirname(d)
    sys.exit("vox tools not found: build vox videos inside the studio folder (clients/<client>/videos/<name>/)")


sys.path.insert(0, _studio_vox())
from score import Section, mix_with_voice, render_score  # noqa: E402

END = 0.0  # reel length in seconds (ffprobe the voice file)
MOOD = "keynote"  # "keynote" (112 bpm, confident) or "warm" (84 bpm, human, harp)

# Section(start, end, chords, energy): energy 0 = felt piano + pad, 1 = + pulse/harp + low strings,
# 2 = + soft kick/rim (keynote) or brushes (warm) + bass, 3 = full. One section per story beat.
SECTIONS = [
    # Section(0.0, 3.37, ["Dm", "Bb"], 0),     # the hook: felt piano alone
]
HITS = []            # sub hits ONLY on story turns (2-4 per reel), e.g. [3.37, 18.65]
FINAL = None         # (time, chord) to ring over the ending, e.g. (29.65, "F")
LIFT_AT = None       # seconds: lift the score after the last word to carry an end card

render_score(SECTIONS, hits=HITS, end=END, mood=MOOD, out="out/score.wav", final_chord=FINAL)
mix_with_voice("out/score.wav", "out/voice48k.wav", "out/mix.wav", lift_at=LIFT_AT)
print("ok")
