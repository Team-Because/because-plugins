"""Caption chunking at phrase boundaries, plus a lint that fails bad breaks.

The v1 builds chunked captions by word count alone and shipped chunks like "BE HE IS" and
"THE ALL VALUE": fragments that read as nonsense out of context. A caption chunk must be a phrase a
viewer can read on its own. Rules, in priority order:

1. Break after sentence or clause punctuation (. , ? ! : ;).
2. Break at a pause in the speech (gap between words >= pause_s).
3. Never END a chunk on a weak word (articles, prepositions, conjunctions, auxiliaries, subject
   pronouns): "IT MIGHT NOT BE" | "100% READY" is wrong, carry the weak word forward.
4. Never leave a chunk that is only weak words ("BE HE IS").
5. Never START a chunk on a phrasal-verb particle ("SET" | "UP THIS PROCESS").
6. Respect max_words / max_chars so the tape stays one line.
Rules 3-6 are costs in a small dynamic program per phrase, so the least-bad split always wins, and
lint() flags whatever is still wrong. Lint findings are fixed by hand (edit the chunk list); a
chunk list written by hand is fine and often better.

Words come from Whisper word timestamps ({"word"|"text", "start", "end"}), or from a hand-made
list when Whisper fails (non-English speech: read timing from the burned-in captions instead).

CLI: python captions.py transcript.json [--max-words 5] [--max-chars 22]
     prints the chunks and the lint report, exits 1 if the lint fails.
"""
import json
import re
import sys

WEAK = set("""
a an the and or but nor so yet for of to in on at by with from into onto over under about as than
that which who whom whose this these those is am are was were be been being do does did have has had
will would shall should can could may might must not no if then because while when where i you he she
it we they me him her us them my your his its our their there here just very really also even
some any all every each more most such
""".split())
OK_AT_END = set("you it me him her us them this that there here".split())  # "I PROMISE YOU" is a whole phrase
NO_START = set("up out off down away back is are was were".split())  # phrasal-verb particles and copulas


def _txt(w):
    return (w.get("word") or w.get("text") or "").strip()


def _norm(token):
    return re.sub(r"[^a-z0-9%']", "", token.lower())


def _is_weak(token):
    n = _norm(token)
    return n in WEAK or n == ""


def _weak_end(token):
    return _is_weak(token) and _norm(token) not in OK_AT_END


def _cost(chunk, max_words, max_chars):
    toks = [_txt(x) for x in chunk]
    text = " ".join(toks)
    c = (len(text) - max_chars * 0.7) ** 2 * 0.02
    # a slightly long line beats a nonsense fragment, a much longer one never does
    if len(text) > max_chars:
        c += 200 + 60 * (len(text) - max_chars)
    if len(toks) > max_words:
        c += 200 * (len(toks) - max_words)
    if all(_is_weak(t) for t in toks):
        c += 400
    if _weak_end(toks[-1]) and toks[-1][-1] not in ".,?!:;":
        c += 120
    if _norm(toks[0]) in NO_START:
        c += 90
    if len(toks) == 1 and len(chunk) == 1:
        c += 15
    return c


def _split_phrase(ph, max_words, max_chars, pause_s):
    """Optimal split of one phrase (no hard punctuation inside) by dynamic programming."""
    n = len(ph)
    best = [0.0] + [float("inf")] * n
    back = [0] * (n + 1)
    for j in range(1, n + 1):
        for i in range(max(0, j - max_words - 2), j):
            c = best[i] + _cost(ph[i:j], max_words, max_chars)
            if j < n and ph[j]["start"] - ph[j - 1].get("end", ph[j - 1]["start"]) >= pause_s:
                c -= 20  # a pause is a natural break
            if c < best[j]:
                best[j], back[j] = c, i
    out, j = [], n
    while j > 0:
        out.append(ph[back[j]:j])
        j = back[j]
    return out[::-1]


def chunk_words(words, max_words=5, max_chars=22, pause_s=0.28, drop=("um", "uh", "matlab")):
    """Group word dicts into caption chunks: [(start, end, "TEXT"), ...] (end = next chunk start).

    First split into phrases at punctuation and long pauses (>= 2 x pause_s), then split each
    phrase optimally so no chunk ends on a weak word, starts on a dangling particle, or overflows.
    """
    ws = [w for w in words if _txt(w) and _norm(_txt(w)) not in drop]
    phrases, cur = [], []
    for k, w in enumerate(ws):
        cur.append(w)
        nxt = ws[k + 1] if k + 1 < len(ws) else None
        long_pause = nxt is not None and nxt["start"] - w.get("end", w["start"]) >= 2 * pause_s
        if _txt(w)[-1] in ".,?!:;" or (long_pause and not _is_weak(_txt(w))):  # a pause after "is" is a hesitation, not a phrase end
            phrases.append(cur)
            cur = []
    if cur:
        phrases.append(cur)
    chunks = [c for ph in phrases for c in _split_phrase(ph, max_words, max_chars, pause_s)]
    out = []
    for k, c in enumerate(chunks):
        s = c[0]["start"]
        e = chunks[k + 1][0]["start"] if k + 1 < len(chunks) else c[-1].get("end", s) + 0.6
        out.append((round(s, 2), round(e, 2), " ".join(_txt(x) for x in c).upper().strip(" ,;:")))
    return out


def lint(chunks, max_chars=24):
    """Return a list of problems. Empty list = pass. Read every flagged chunk out loud."""
    probs = []
    for s, e, txt in chunks:
        toks = txt.split()
        if toks and _weak_end(toks[-1].rstrip(".,?!:;")) and not txt.endswith((".", "?", "!")):
            probs.append(f"{s:6.2f}  ends on a weak word: {txt!r}")
        if toks and all(_is_weak(t) for t in toks):
            probs.append(f"{s:6.2f}  only weak words: {txt!r}")
        if len(txt) > max_chars:
            probs.append(f"{s:6.2f}  too long for one line ({len(txt)} chars): {txt!r}")
        if e - s < 0.35:
            probs.append(f"{s:6.2f}  on screen {e - s:.2f}s, too short to read: {txt!r}")
    return probs


def hide(chunks, windows):
    """Drop chunks that start inside a window where a prop already says the same words."""
    return [c for c in chunks if not any(a <= c[0] < b for a, b in windows)]


def load_words(path):
    d = json.load(open(path))
    if isinstance(d, dict) and "segments" in d:  # whisper / mlx_whisper json
        return [w for seg in d["segments"] for w in seg.get("words", [])]
    return d


if __name__ == "__main__":
    args = sys.argv[1:]
    mw = int(args[args.index("--max-words") + 1]) if "--max-words" in args else 5
    mc = int(args[args.index("--max-chars") + 1]) if "--max-chars" in args else 22
    ch = chunk_words(load_words(args[0]), mw, mc)
    for s, e, t in ch:
        print(f"{s:6.2f} {e:6.2f}  {t}")
    p = lint(ch)
    print("\nLINT:", "pass" if not p else "")
    for x in p:
        print("  " + x)
    sys.exit(1 if p else 0)
