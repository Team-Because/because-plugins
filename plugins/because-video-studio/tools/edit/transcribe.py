#!/usr/bin/env python3
"""Word-level transcript of any video/audio, locally with faster-whisper (no upload, no key, Mac/Windows/Linux).

  <studio python> tools/edit/transcribe.py <media> [--lang auto|en|hi|gu|...] [--out DIR] [--vocab "Brand, Name"] [--model small]

Writes to DIR (default: next to the media, in <name>_transcript/):
  transcript.json  {source, language, duration, words:[{w,start,end}], segments:[{start,end,text}]}
  transcript.md    one readable line per sentence: [mm:ss.s-mm:ss.s] text   (read this to pick moments)
  transcript.srt   subtitles for upload to YouTube/LinkedIn etc.
The model downloads once, on first use, into the studio folder (.models/).
"""
import argparse, json, os, re, subprocess, sys
from pathlib import Path

STUDIO = Path(__file__).resolve().parent.parent.parent   # the studio folder (tools/edit/ is two levels down)


def ts(t, srt=False):
    h, m, s = int(t // 3600), int(t % 3600 // 60), t % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",") if srt else f"{int(t // 60):02d}:{s:04.1f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("media"); ap.add_argument("--lang", default="auto"); ap.add_argument("--out")
    ap.add_argument("--vocab", default="", help='names/brands to spell right, e.g. "ElevenLabs, HyperFrames"')
    ap.add_argument("--model", default="small")
    a = ap.parse_args()
    src = Path(a.media).expanduser().resolve()
    out = Path(a.out) if a.out else src.parent / f"{src.stem}_transcript"
    out.mkdir(parents=True, exist_ok=True)
    from faster_whisper import WhisperModel
    model = WhisperModel(a.model, device="cpu", compute_type="int8", download_root=str(STUDIO / ".models"))
    segs_raw, info = model.transcribe(str(src), language=None if a.lang == "auto" else a.lang, word_timestamps=True,
                                      initial_prompt=a.vocab or None, vad_filter=True)
    words = []
    for seg in segs_raw:
        for w in seg.words or []:
            t = w.word.strip()
            if not t: continue
            if words and not re.match(r"^[\w\"'(¿¡]", t, re.U):      # punctuation glued to the previous word
                words[-1]["w"] += t; words[-1]["end"] = round(w.end, 3); continue
            words.append({"w": t, "start": round(w.start, 3), "end": round(w.end, 3)})
    segs, cur = [], []                                                # sentences: end punctuation, pause > 0.7 s, or 40 words
    for i, w in enumerate(words):
        cur.append(w)
        gap = words[i + 1]["start"] - w["end"] if i + 1 < len(words) else 9
        if re.search(r"[.!?…]['\")]?$", w["w"]) or gap > 0.7 or len(cur) > 40:
            segs.append({"start": cur[0]["start"], "end": cur[-1]["end"], "text": " ".join(x["w"] for x in cur)}); cur = []
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(src)],
                               capture_output=True, text=True).stdout.strip() or 0)
    (out / "transcript.json").write_text(json.dumps({"source": str(src), "language": info.language, "duration": dur,
                                                     "words": words, "segments": segs}, indent=1, ensure_ascii=False), encoding="utf-8")
    (out / "transcript.md").write_text(f"# Transcript: {src.name} ({info.language}, {dur:.1f}s)\n\n" + "\n".join(
        f"[{ts(s['start'])}-{ts(s['end'])}] {s['text']}" for s in segs) + "\n", encoding="utf-8")
    (out / "transcript.srt").write_text("\n".join(f"{i}\n{ts(s['start'], 1)} --> {ts(s['end'], 1)}\n{s['text']}\n"
                                                  for i, s in enumerate(segs, 1)), encoding="utf-8")
    print(f"{len(words)} words, {len(segs)} sentences, language {info.language} -> {out}/transcript.{{json,md,srt}}")


if __name__ == "__main__":
    main()
