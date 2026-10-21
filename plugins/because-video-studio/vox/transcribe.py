"""Word-timed transcript for vox captions and beats, on Mac and Windows (faster-whisper, MIT, local).

  transcribe.py <audio> <out.json> [--model large-v3-turbo] [--language en]

Writes the same shape mlx_whisper wrote, so captions.load_words reads it unchanged:
  {"text": ..., "language": ..., "segments": [{"start", "end", "text", "words": [{"word", "start", "end", "probability"}]}]}
The model downloads once on first use. Run it with the studio's main python (.venv).
"""
import json
import sys


def main():
    a = sys.argv[1:]
    if len(a) < 2:
        sys.exit("usage: transcribe.py <audio> <out.json> [--model large-v3-turbo] [--language en]")
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    from faster_whisper import WhisperModel
    model = WhisperModel(opt("--model", "large-v3-turbo"), device="auto", compute_type="int8")
    segs, info = model.transcribe(a[0], word_timestamps=True, language=opt("--language"))
    out = {"language": info.language, "segments": []}
    for s in segs:
        out["segments"].append({"start": s.start, "end": s.end, "text": s.text, "words": [
            {"word": w.word, "start": w.start, "end": w.end, "probability": w.probability} for w in (s.words or [])]})
    out["text"] = "".join(s["text"] for s in out["segments"]).strip()
    json.dump(out, open(a[1], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(out['segments'])} segments, {sum(len(s['words']) for s in out['segments'])} words -> {a[1]}")


if __name__ == "__main__":
    main()
