"""Score engine for Vox-style reels: real sampled instruments, written note by note in code.

Free and local only: pretty_midi writes the notes, FluidSynth plays them through the
MuseScore General soundfont (real piano / strings / harp / pizzicato samples), Spotify's
pedalboard does the studio chain (felt-piano filter, plate reverb, glue compression),
numpy adds sub hits. Then the score is ducked under the voice and mixed to -14 LUFS.

Register (Apple keynote / brand-film level): sparse felt piano, a clean muted pulse,
strings that swell, soft rim/snap on 2 and 4, lots of space. Never playful, no marimba,
no whooshes or novelty sound effects.

Copied from motion-studio/vox-kit/score.py into the vox-reel skill; set VOX_SF2 to use another
soundfont path. See references/music.md for choosing mood, sections and hits.

Usage from a video folder:
    import sys; sys.path.insert(0, "<skill>/scripts")
    from score import Section, render_score, mix_with_voice
    secs = [Section(0, 3.4, ["Dm", "Bb"], 0), Section(4.67, 13.3, ["Dm", "Bb", "F", "C"], 1), ...]
    render_score(secs, hits=[3.37, 18.65], end=30.6, mood="keynote", out="out/score.wav")
    mix_with_voice("out/score.wav", "voice.wav", "out/mix.wav")

energy: 0 = piano + pad only, 1 = + muted pulse + low strings, 2 = + soft kick and rim,
3 = full (bass, strings up an octave, piano chords, open hat).
mood: "keynote" (112 bpm, confident, driving) or "warm" (84 bpm, nostalgic and human:
piano, harp arpeggios and strings, brushes only at energy 2+).
"""
import json, os, subprocess, tempfile
from dataclasses import dataclass, field

import numpy as np
import pretty_midi
import soundfile as sf
from pedalboard import Compressor, Gain, HighpassFilter, Limiter, LowpassFilter, Pedalboard, Reverb

_STUDIO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SF2 = os.environ.get("VOX_SF2", os.path.join(_STUDIO, "soundfont", "MuseScore_General.sf2"))
# FluidSynth: on PATH (Mac: brew fluid-synth), else the copy setup.mjs unpacks into <studio>/bin/fluidsynth (Windows)
def _fluidsynth():
    import shutil, glob
    found = shutil.which("fluidsynth")
    if found: return found
    hits = glob.glob(os.path.join(_STUDIO, "bin", "fluidsynth", "**", "fluidsynth.exe"), recursive=True)
    if hits: return hits[0]
    raise RuntimeError("FluidSynth is not installed: run the studio setup again")
SF2_BYTES = 215614036  # the complete MuseScore_General.sf2; a stalled download is smaller and plays wrong
SR = 48000


def check_soundfont(path=None):
    """Fail fast on a missing or partial soundfont (a download once stalled at 208 of 216 MB)."""
    p = path or SF2
    if not os.path.exists(p):
        raise FileNotFoundError(f"soundfont missing: {p} (run the studio setup again)")
    if os.path.getsize(p) != SF2_BYTES:
        raise RuntimeError(f"soundfont incomplete: {os.path.getsize(p)} of {SF2_BYTES} bytes at {p}; run the studio setup again")
    return p

CHORDS = {  # voicings (MIDI note names), mid register
    "Dm": ["D3", "F3", "A3", "D4"], "Bb": ["Bb2", "F3", "Bb3", "D4"], "F": ["F2", "C3", "A3", "F4"],
    "C": ["C3", "G3", "C4", "E4"], "Gm": ["G2", "D3", "Bb3", "G4"], "A": ["A2", "E3", "A3", "C#4"],
    "Am": ["A2", "E3", "A3", "C4"], "G": ["G2", "D3", "B3", "G4"], "Em": ["E2", "B2", "G3", "E4"],
    "Fmaj7": ["F2", "C3", "E3", "A3"], "Cmaj7": ["C3", "G3", "B3", "E4"], "Dsus": ["D3", "G3", "A3", "D4"],
    "Ebmaj7": ["Eb2", "Bb2", "D3", "G3"], "Abmaj7": ["Ab2", "Eb3", "G3", "C4"], "Bbmaj7": ["Bb2", "F3", "A3", "D4"],
}
MOODS = {"keynote": dict(bpm=112, swing=0.0), "warm": dict(bpm=84, swing=0.0)}


@dataclass
class Section:
    start: float
    end: float
    chords: list
    energy: int = 1
    melody: list = field(default_factory=list)  # optional [(beat_offset, "A4", beats)] piano motif per bar


def _n(name):
    return pretty_midi.note_name_to_number(name.replace("b", "b"))


def _note(inst, pitch, t0, t1, vel):
    if t1 > t0:
        inst.notes.append(pretty_midi.Note(velocity=int(np.clip(vel, 1, 127)), pitch=int(pitch), start=t0, end=t1))


def _write_parts(sections, end, mood):
    bpm = MOODS[mood]["bpm"]
    beat = 60 / bpm
    bar = 4 * beat
    parts = {k: pretty_midi.PrettyMIDI(initial_tempo=bpm) for k in ("piano", "strings", "pulse", "harp", "drums", "bass")}
    piano = pretty_midi.Instrument(0, name="piano")
    strings = pretty_midi.Instrument(49, name="strings")  # slow string ensemble
    pulse = pretty_midi.Instrument(45, name="pizz")  # pizzicato as the muted pulse
    harp = pretty_midi.Instrument(46, name="harp")
    bass = pretty_midi.Instrument(32, name="bass")  # acoustic bass
    drums = pretty_midi.Instrument(0, is_drum=True, name="drums")

    for s in sections:
        nb = int(np.ceil((s.end - s.start) / bar - 1e-6))
        for b in range(nb):
            t0 = s.start + b * bar
            t1 = min(s.end, t0 + bar)
            ch = [_n(x) for x in CHORDS[s.chords[b % len(s.chords)]]]
            root = ch[0]
            # pad of strings, swells with energy
            for p in ch[1:]:
                _note(strings, p + (12 if s.energy >= 3 else 0), t0, t1 + 0.05, 38 + 14 * s.energy)
            if s.energy >= 1:
                _note(strings, root - 12 if root > 40 else root, t0, t1, 40 + 8 * s.energy)
            # felt piano: sparse top notes at energy 0, broken chords above
            if s.melody:
                for off, nm, ln in s.melody:
                    if t0 + off * beat < t1:
                        _note(piano, _n(nm), t0 + off * beat, min(t1, t0 + (off + ln) * beat), 52)
            elif s.energy == 0:
                for k, p in enumerate([ch[-1] + 12, ch[2] + 12]):
                    _note(piano, p, t0 + k * 2 * beat, t0 + k * 2 * beat + 1.8 * beat, 62)
            else:
                pat = [ch[1] + 12, ch[2] + 12, ch[3] + 12, ch[2] + 12] * 2
                for k, p in enumerate(pat):
                    tt = t0 + k * beat / 2
                    if tt < t1:
                        _note(piano, p, tt, tt + beat * 0.9, 40 + 5 * s.energy + (8 if k % 4 == 0 else 0))
                if s.energy >= 3:
                    for p in ch:
                        _note(piano, p, t0, t0 + beat * 1.5, 50)
            if mood == "warm" and s.energy >= 1:  # harp arpeggio, the human warmth
                arp = [ch[0], ch[1], ch[2], ch[3], ch[2] + 12, ch[3], ch[2], ch[1]]
                for k, p in enumerate(arp):
                    tt = t0 + k * beat / 2
                    if tt < t1:
                        _note(harp, p + 12, tt, tt + beat, 46 + 6 * s.energy)
            if mood == "keynote" and s.energy >= 1:  # muted 8th pulse on the root/fifth
                for k in range(8):
                    tt = t0 + k * beat / 2
                    if tt < t1:
                        _note(pulse, (root if k % 2 == 0 else ch[1]) + 12, tt, tt + beat * 0.3, 60 + 6 * s.energy)
            if s.energy >= 2:
                for k in range(4):
                    tt = t0 + k * beat
                    if tt >= t1:
                        continue
                    if mood == "keynote":
                        if k in (0, 2):
                            _note(drums, 36, tt, tt + 0.1, 70 + 10 * (s.energy - 2))  # kick
                        else:
                            _note(drums, 37, tt, tt + 0.1, 62)  # side stick
                    else:
                        _note(drums, 40 if k in (1, 3) else 36, tt, tt + 0.1, 40)  # soft brush feel
                if s.energy >= 3 and mood == "keynote":
                    for k in range(8):
                        tt = t0 + k * beat / 2
                        if tt < t1 and k % 2:
                            _note(drums, 46, tt, tt + 0.1, 38)  # open hat on the off-beat
            if s.energy >= 2:
                for k in range(0, 8, 2 if s.energy == 2 else 1):
                    tt = t0 + k * beat / 2
                    if tt < t1:
                        _note(bass, root - 12 if root >= 48 else root, tt, tt + beat * 0.45, 70)

    for key, inst in (("piano", piano), ("strings", strings), ("pulse", pulse), ("harp", harp), ("drums", drums), ("bass", bass)):
        parts[key].instruments.append(inst)
    return parts


def _render_midi(pm, end):
    with tempfile.TemporaryDirectory() as d:
        mid, wav = os.path.join(d, "p.mid"), os.path.join(d, "p.wav")
        pm.write(mid)
        subprocess.run([_fluidsynth(), "-ni", "-q", "-g", "0.7", "-r", str(SR), "-F", wav, SF2, mid],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        x, sr = sf.read(wav, dtype="float32", always_2d=True)
    n = int((end + 4) * SR)
    out = np.zeros((n, 2), np.float32)
    out[: min(n, len(x))] = x[:n]
    return out


def _sub_hit():
    t = np.arange(int(SR * 3.0)) / SR
    f = 58 * np.exp(-t * 0.7) + 30
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.4) * np.minimum(1, t / 0.004)
    return np.stack([boom, boom], 1).astype(np.float32)


CHAINS = {
    "piano": Pedalboard([LowpassFilter(3400), Compressor(-22, 2.5, 8, 120), Reverb(0.62, 0.55, 0.30, 0.85, 0.9), Gain(2)]),
    "strings": Pedalboard([HighpassFilter(90), LowpassFilter(7000), Reverb(0.8, 0.5, 0.35, 0.75, 1.0), Gain(-3)]),
    "pulse": Pedalboard([HighpassFilter(150), LowpassFilter(5000), Reverb(0.3, 0.6, 0.18, 0.9, 0.6), Gain(-4)]),
    "harp": Pedalboard([HighpassFilter(120), Reverb(0.55, 0.5, 0.28, 0.85, 0.9), Gain(-3)]),
    "drums": Pedalboard([HighpassFilter(40), Compressor(-18, 3, 3, 80), Reverb(0.2, 0.7, 0.08, 0.95, 0.4), Gain(-5)]),
    "bass": Pedalboard([LowpassFilter(900), Compressor(-20, 3, 10, 100), Gain(-4)]),
}


def render_score(sections, hits, end, mood="keynote", out="score.wav", final_chord=None):
    """Write the music bed (stereo, 48 kHz) to `out`. hits = times for sub hits on story turns."""
    check_soundfont()
    if final_chord:  # (time, chord name): let a last chord ring over the ending
        sections = list(sections) + [Section(final_chord[0], end + 2.5, [final_chord[1]], 0)]
    parts = _write_parts(sections, end, mood)
    bus = None
    for key, pm in parts.items():
        if not pm.instruments[0].notes:
            continue
        x = _render_midi(pm, end)
        x = CHAINS[key](x.T, SR).T
        bus = x if bus is None else bus + x
    for t in hits:
        i = int(t * SR)
        h = _sub_hit() * 0.16
        j = min(len(bus), i + len(h))
        bus[i:j] += h[: j - i]
    bus = Pedalboard([Compressor(-16, 2, 20, 200), Limiter(-1.0)])(bus.T, SR).T
    n_end = int((end + 0.0) * SR)
    fade = int(0.8 * SR)
    bus = bus[:n_end]
    bus[-fade:] *= np.linspace(1, 0, fade)[:, None]
    sf.write(out, bus, SR)
    return out


def mix_with_voice(score_wav, voice_wav, out_wav, music_db=-17, duck_db=8, lift_at=None, lift_db=16):
    """Duck the score under speech (fast attack, slow release) and loudness-normalise via ffmpeg.

    lift_at: time (s) after the last word; the score rises lift_db over 0.8 s to carry an end card
    (VIP ni Class did this so the end card was not near-silent)."""
    m, _ = sf.read(score_wav, dtype="float32", always_2d=True)
    v, vsr = sf.read(voice_wav, dtype="float32", always_2d=True)
    if vsr != SR:
        raise ValueError(f"voice must be {SR} Hz, got {vsr}")
    n = min(len(m), len(v))
    m, v = m[:n], v[:n]
    env = np.abs(v.mean(1))
    win = int(0.05 * SR)
    env = np.convolve(env, np.ones(win) / win, mode="same")
    speaking = (env > np.percentile(env, 60) * 0.5).astype(np.float32)
    # smooth the gain: attack 60 ms, release 400 ms
    g = np.empty(n, np.float32)
    a_att, a_rel = np.exp(-1 / (0.06 * SR)), np.exp(-1 / (0.4 * SR))
    cur = 0.0
    for i in range(0, n, 64):  # control rate
        tgt = speaking[i]
        a = a_att if tgt > cur else a_rel
        cur = tgt + (cur - tgt) * a**64
        g[i:i + 64] = cur
    lift = 0.0
    if lift_at is not None:
        lift = lift_db * np.clip((np.arange(n) / SR - lift_at) / 0.8, 0, 1)
    gain = 10 ** ((music_db - duck_db * g + lift) / 20)
    mix = v + m * gain[:, None]
    tmp = out_wav + ".pre.wav"
    sf.write(tmp, mix, SR)
    # two-pass loudnorm (linear) so the result lands on -14 LUFS instead of undershooting
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", tmp, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True)
    meas = json.loads(r.stderr[r.stderr.rindex("{"):r.stderr.rindex("}") + 1])
    af = ("loudnorm=I=-14:TP=-1.5:LRA=11:linear=true:measured_I={input_i}:measured_TP={input_tp}:"
          "measured_LRA={input_lra}:measured_thresh={input_thresh}:offset={target_offset}").format(**meas)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-af", af + ",alimiter=limit=0.84:level=false", "-ar", str(SR), out_wav], check=True)
    os.remove(tmp)
    return out_wav
