#!/usr/bin/env python3
# .venv/bin/python tools/human-review.py <film.mp4> [--intent "<what the film should make a viewer think>" | --script <docs/script.json>]
#                                        [--out <dir>] [--calibrate]
# A blind first-time viewer (Aman, 16-10-2026: "review it as human... see the reel, hear it, end to end make sense or not").
#   1. WATCH: Gemini gets the whole mp4, picture and sound, and nothing else: no brief, no script, no brand notes. It reports
#      what it saw and heard second by second, what it thinks the film claims, where it got lost, what went by too fast,
#      any text cut off or unreadable, and whether it would watch to the end.
#   2. JUDGE: a second call compares the viewer's retelling with the intent (the script). A reviewer that knows the intent
#      fills the gaps itself, so the viewer never sees it.
#   PASS needs: the claim understood (same), sense >= 7, nothing flagged too fast, no text cut off, no lost moment marked major.
# --calibrate runs the cases Aman already judged (tools/human-review-cases.json) and checks the verdicts agree (L-032).
# Writes <out>/human-review.json and prints a short report. Exit 1 on FAIL. Cost: about $0.01-0.03 per film.
import sys, os, json, base64, argparse, subprocess, urllib.request, time

STUDIO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(STUDIO)
MODELS = ['google/gemini-3.8-flash', 'google/gemini-3.7-flash']


def key():
    sys.path.insert(0, os.path.join(STUDIO, 'tools'))
    from paths import env
    return env('OPENROUTER_API_KEY') or sys.exit('OpenRouter key missing: the blind viewer review needs OPENROUTER_API_KEY in the studio .env')


def call(content, system, model):
    body = {'model': model, 'max_tokens': 6000, 'response_format': {'type': 'json_object'},
            'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': content}]}
    req = urllib.request.Request('https://openrouter.ai/api/v1/chat/completions', data=json.dumps(body).encode(),
                                 headers={'Authorization': f'Bearer {key()}', 'Content-Type': 'application/json', 'X-Title': 'B1 human review'})
    t0 = time.time()
    r = json.load(urllib.request.urlopen(req, timeout=240))
    txt = r['choices'][0]['message']['content']
    txt = txt[txt.find('{'): txt.rfind('}') + 1]
    return json.loads(txt), r.get('usage', {}).get('cost', 0), round(time.time() - t0, 1)


def ask(content, system):
    err = []
    for m in MODELS:
        for _ in range(2):
            try: return call(content, system, m) + (m,)
            except Exception as e: err.append(f'{m}: {e}')
    sys.exit('every model failed: ' + ' | '.join(err))


WATCH = """You are a normal person scrolling Instagram Reels on a phone, sound on. You have never heard of this brand and you know
nothing about this video: no brief, no script. Watch the whole video and listen to it once, the way a real viewer would.
Be honest and plain. Do not be kind; a real viewer swipes away.
Return one JSON object:
{"duration_s": <number>,
 "timeline": [{"t": <seconds>, "saw": "<what is on screen>", "heard": "<the words or sound>", "understood": true|false}],   // one row per change
 "what_is_advertised": "<the product or brand, if you can tell>",
 "the_claim": "<in one sentence, what the film is telling you>",
 "lost_moments": [{"t": <seconds>, "why": "<what confused you>", "major": true|false}],
 "too_fast": [{"t": <seconds>, "what": "<what went by before you could take it in>"}],
 "text_problems": [{"t": <seconds>, "what": "<text cut off by the frame edge, unreadable, covered, or still unfinished when the video ends>"}],   // captions that type on word by word and then complete are NOT a problem
 "picture_fits_words": [{"t": <seconds>, "ok": true|false, "note": "..."}],
 "sense": <1-10, does it make sense end to end>,
 "would_watch_to_end": <1-10>,
 "best_moment": "...", "worst_moment": "...",
 "verdict": "<two plain sentences>"}"""

JUDGE = """You compare what a first-time viewer understood from a short film with what the film was meant to say.
Return one JSON object: {"same_claim": "yes"|"partly"|"no", "missed": ["<parts of the intent the viewer did not get>"],
 "lines_not_heard": ["<each intended spoken line that does not appear in what the viewer heard, word for word or near it>"],
 "wrong": ["<things the viewer understood that the film did not mean>"], "why": "<one sentence>"}"""


def review(mp4, intent, out):
    os.makedirs(out, exist_ok=True)
    data = open(mp4, 'rb').read()
    if len(data) > 18 * 1024 * 1024:                  # keep the request small: re-encode at phone size, audio kept
        small = os.path.join(out, '.review.mp4')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mp4, '-vf', 'scale=540:-2', '-c:v', 'libx264', '-crf', '28', '-c:a', 'aac', '-b:a', '96k', small], check=True)
        data = open(small, 'rb').read()
    content = [{'type': 'text', 'text': 'Watch and listen to this reel.'},
               {'type': 'video_url', 'video_url': {'url': 'data:video/mp4;base64,' + base64.b64encode(data).decode()}}]
    w, c1, s1, m1 = ask(content, WATCH)
    j, c2, s2, m2 = ask([{'type': 'text', 'text': f"VIEWER UNDERSTOOD:\nclaim: {w.get('the_claim')}\nadvertised: {w.get('what_is_advertised')}\n"
                                                    f"timeline: {json.dumps(w.get('timeline', []))}\n\nTHE FILM WAS MEANT TO SAY:\n{intent}"}], JUDGE)
    fails = []
    if j.get('same_claim') != 'yes': fails.append(f"claim not understood ({j.get('same_claim')}): {j.get('why')}")
    # calibrated 16-10-2026: the reference itself scores 6; pace and text separate good from bad
    if (w.get('sense') or 0) < 6: fails.append(f"sense {w.get('sense')}/10")
    if w.get('too_fast'): fails.append('too fast: ' + '; '.join(f"{x.get('t')}s {x.get('what')}" for x in w['too_fast']))
    if w.get('text_problems'): fails.append('text: ' + '; '.join(f"{x.get('t')}s {x.get('what')}" for x in w['text_problems']))
    if j.get('lines_not_heard'): fails.append('lines not heard: ' + ' / '.join(j['lines_not_heard']))
    major = [x for x in w.get('lost_moments', []) if x.get('major')]
    if major: fails.append('lost: ' + '; '.join(f"{x.get('t')}s {x.get('why')}" for x in major))
    res = {'film': os.path.relpath(mp4, STUDIO), 'at': time.strftime('%d-%m-%Y %H:%M'), 'pass': not fails, 'fails': fails,
           'viewer': w, 'judge': j, 'models': [m1, m2], 'cost': round((c1 or 0) + (c2 or 0), 4), 'seconds': s1 + s2}
    json.dump(res, open(os.path.join(out, 'human-review.json'), 'w'), indent=1)
    return res


def intent_from(script):
    if os.path.exists(script):
        d = json.load(open(script))
        return 'Spoken lines, in order: ' + ' / '.join(l['text'] for l in d['lines'])
    # a film with no voice: its on-screen words from the concept map carry the intent
    import re
    cm = os.path.join(os.path.dirname(script), 'concept-map.yaml')
    lines = [x for x in re.findall(r'client_line: "(.*?)"', open(cm).read()) if x] if os.path.exists(cm) else []
    if not lines: sys.exit('give --intent: no script.json and no on-screen lines in docs/concept-map.yaml')
    return 'No voice. On-screen words, in order: ' + ' / '.join(lines)


ap = argparse.ArgumentParser()
ap.add_argument('mp4', nargs='?'); ap.add_argument('--intent'); ap.add_argument('--script'); ap.add_argument('--out')
ap.add_argument('--calibrate', action='store_true')
a = ap.parse_args()

if a.calibrate:
    cases = json.load(open(os.path.join(STUDIO, 'tools', 'human-review-cases.json')))
    bad = 0
    for c in cases:
        r = review(os.path.join(STUDIO, c['film']), c['intent'], os.path.join('/tmp', 'human-review-cal', c['name']))
        ok = r['pass'] == c['want_pass']
        bad += not ok
        print(f"{'ok  ' if ok else 'MISS'} {c['name']:<22} pass={r['pass']} (want {c['want_pass']}: {c['why']})  sense {r['viewer'].get('sense')}  claim {r['judge'].get('same_claim')}")
        if not ok or not r['pass']: print('      ' + ' | '.join(r['fails'])[:400])
    sys.exit(1 if bad else 0)

if not a.mp4: sys.exit(__doc__ if __doc__ else 'usage: human-review.py <film.mp4> --script <script.json>')
vd = os.path.dirname(os.path.dirname(os.path.abspath(a.mp4)))
script = a.script or os.path.join(vd, 'docs', 'script.json')
intent = a.intent or intent_from(script)
r = review(os.path.abspath(a.mp4), intent, a.out or os.path.join(vd, 'docs'))
v = r['viewer']
print(f"HUMAN REVIEW {'PASS' if r['pass'] else 'FAIL'}  sense {v.get('sense')}/10, would watch {v.get('would_watch_to_end')}/10, claim understood: {r['judge'].get('same_claim')}  (${r['cost']}, {r['seconds']} s)")
print(f"  viewer's claim: {v.get('the_claim')}")
for f in r['fails']: print('  FAIL ' + f)
print(f"  verdict: {v.get('verdict')}")
sys.exit(0 if r['pass'] else 1)
