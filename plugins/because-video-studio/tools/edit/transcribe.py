#!/usr/bin/env python3
"""Word-level transcript of any video/audio. Two engines; the person picks after hearing the result:
  whisper     (default) faster-whisper large-v3 on this computer: free, no upload, no key. Good for English and Hindi;
              Gujarati comes out rough.
  elevenlabs  ElevenLabs Scribe: the audio is uploaded, about $0.20 an hour of audio from the person's ElevenLabs plan,
              needs their API key (set in the plugin's options). Use it when Whisper gets Gujarati or mixed speech wrong.

  <studio python> tools/edit/transcribe.py <media> [--engine whisper|elevenlabs] [--lang auto|en|hi|gu|...] [--out DIR]
                                                   [--vocab "Brand, Name"] [--model large-v3]

Writes to DIR (default: next to the media, in <name>_transcript/):
  transcript.json  {source, engine, language, duration, words:[{w,start,end}], segments:[{start,end,text}]}
  transcript.md    one readable line per sentence: [mm:ss.s-mm:ss.s] text   (read this to pick moments)
  transcript.srt   subtitles for upload to YouTube/LinkedIn etc.
The Whisper model (large-v3, ~3 GB) downloads once, on first use, into the studio folder (.models/). large-v3-turbo is
faster but heard Gujarati as English and translated it (tested 17-11-2026), so it is not the default.
"""
import argparse, json, os, re, subprocess, sys, tempfile, uuid, urllib.request, urllib.error
from pathlib import Path

STUDIO = Path(__file__).resolve().parent.parent.parent   # the studio folder (tools/edit/ is two levels down)
sys.path.insert(0, str(STUDIO / "tools"))


def ts(t, srt=False):
    h, m, s = int(t // 3600), int(t % 3600 // 60), t % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",") if srt else f"{int(t // 60):02d}:{s:04.1f}"


def whisper_words(src, a):
    from faster_whisper import WhisperModel
    model = WhisperModel(a.model, device="cpu", compute_type="int8", download_root=str(STUDIO / ".models"))
    segs_raw, info = model.transcribe(str(src), language=None if a.lang == "auto" else a.lang, word_timestamps=True,
                                      initial_prompt=a.vocab or None, vad_filter=True)
    return [(w.word, w.start, w.end) for seg in segs_raw for w in seg.words or []], info.language


def elevenlabs_words(src, a):
    from paths import env
    key = env("ELEVEN_LABS_API_KEY")
    if not key:
        sys.exit("NO_KEY: no ElevenLabs API key on this computer yet. Add it once in Claude: /plugin, Installed, "
                 "Because Video Studio, Configure options, paste the key, then start a new session.")
    with tempfile.TemporaryDirectory() as tmp:                       # upload the sound only, not the whole video
        mp3 = Path(tmp) / "audio.mp3"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vn", "-ac", "1", "-b:a", "96k", str(mp3)], check=True)
        fields = {"model_id": "scribe_v3", "timestamps_granularity": "word"}
        if a.lang != "auto": fields["language_code"] = a.lang
        b = uuid.uuid4().hex
        body = b"".join(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields.items())
        body += f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="audio.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n'.encode()
        body += mp3.read_bytes() + f"\r\n--{b}--\r\n".encode()
    req = urllib.request.Request("https://api.elevenlabs.io/v1/speech-to-text", data=body, method="POST",
                                 headers={"xi-api-key": key, "Content-Type": f"multipart/form-data; boundary={b}"})
    try:
        d = json.load(urllib.request.urlopen(req, timeout=600))
    except urllib.error.HTTPError as e:
        msg = e.read().decode(errors="replace")[:300]
        sys.exit(f"ElevenLabs refused the request ({e.code}): {msg}\n401 = the key is wrong or lacks Speech to Text access; "
                 "402/quota = the ElevenLabs plan is out of credits.")
    return [(w["text"], w["start"], w["end"]) for w in d.get("words", []) if w.get("type") == "word"], d.get("language_code", "?")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("media"); ap.add_argument("--lang", default="auto"); ap.add_argument("--out")
    ap.add_argument("--engine", choices=["whisper", "elevenlabs"], default="whisper")
    ap.add_argument("--vocab", default="", help='names/brands to spell right, e.g. "ElevenLabs, HyperFrames" (Whisper only)')
    ap.add_argument("--model", default="large-v3", help="Whisper model; large-v3-turbo is faster but weak on Gujarati")
    a = ap.parse_args()
    src = Path(a.media).expanduser().resolve()
    out = Path(a.out) if a.out else src.parent / f"{src.stem}_transcript"
    out.mkdir(parents=True, exist_ok=True)
    raw, language = (elevenlabs_words if a.engine == "elevenlabs" else whisper_words)(src, a)
    words = []
    for word, start, end in raw:
        t = word.strip()
        if not t: continue
        if words and not re.match(r"^[\w\"'(¿¡]", t, re.U):           # punctuation glued to the previous word
            words[-1]["w"] += t; words[-1]["end"] = round(end, 3); continue
        words.append({"w": t, "start": round(start, 3), "end": round(end, 3)})
    segs, cur = [], []                                                # sentences: end punctuation, pause > 0.7 s, or 40 words
    for i, w in enumerate(words):
        cur.append(w)
        gap = words[i + 1]["start"] - w["end"] if i + 1 < len(words) else 9
        if re.search(r"[.!?…।]['\")]?$", w["w"]) or gap > 0.7 or len(cur) > 40:
            segs.append({"start": cur[0]["start"], "end": cur[-1]["end"], "text": " ".join(x["w"] for x in cur)}); cur = []
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(src)],
                               capture_output=True, text=True).stdout.strip() or 0)
    (out / "transcript.json").write_text(json.dumps({"source": str(src), "engine": a.engine, "language": language, "duration": dur,
                                                     "words": words, "segments": segs}, indent=1, ensure_ascii=False), encoding="utf-8")
    (out / "transcript.md").write_text(f"# Transcript: {src.name} ({language}, {a.engine}, {dur:.1f}s)\n\n" + "\n".join(
        f"[{ts(s['start'])}-{ts(s['end'])}] {s['text']}" for s in segs) + "\n", encoding="utf-8")
    (out / "transcript.srt").write_text("\n".join(f"{i}\n{ts(s['start'], 1)} --> {ts(s['end'], 1)}\n{s['text']}\n"
                                                  for i, s in enumerate(segs, 1)), encoding="utf-8")
    print(f"{len(words)} words, {len(segs)} sentences, language {language}, {a.engine} -> {out}/transcript.{{json,md,srt}}")


if __name__ == "__main__":
    main()
