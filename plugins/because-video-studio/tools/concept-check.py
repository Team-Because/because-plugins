# .venv/bin/python tools/concept-check.py <video>/docs/concept-map.yaml
# A reference gives the GRAMMAR (structure, timing, the trick, sync, pacing, camera, transitions, music feel), never the
# CONTENT (objects, images, metaphors). Aman, 15-10-2026 (L-156): "there is mountain and building that may apply for that
# reference video but it may not apply for <the brand>". Every reference-based video carries docs/concept-map.yaml; this check
# refuses it unless:
#   1. every beat says what the reference shows, the ROLE it plays there, and the client's own equivalent;
#   2. every client equivalent has a source: `asset: <path that exists>` or `fact: <text found in a listed facts file>`;
#   3. no reference object (reference_nouns) appears in the client version, unless keeps_reference_object is true and a
#      reason says why its role is genuinely the same for the client;
#   4. the beats cover the reference from start to end (gaps under 0.5 s).
# tools/ship.mjs runs this for any film whose code points at refs/. Template: templates/concept-map.yaml.
import sys, os, re, json
import yaml

p = sys.argv[1]; base = os.path.dirname(os.path.dirname(os.path.abspath(p)))      # the video folder
m = yaml.safe_load(open(p)); fails = []
root = os.path.abspath(os.path.join(base, '..', '..'))                            # the client folder
def resolve(path):
    path = os.path.expanduser(path)
    for c in (path, os.path.join(base, path), os.path.join(root, path)):
        if os.path.exists(c): return c
    return None
facts_text = ''
for f in m.get('client_facts', []):
    r = resolve(f) or resolve(os.path.join(root, 'brand', 'facts-cache', os.path.basename(f)))   # local copy when a share is offline
    if r is None: fails.append(f'facts file not found (and no copy in brand/facts-cache): {f}')
    else: facts_text += open(r, errors='ignore').read().lower() + '\n'
norm = lambda s: re.sub(r'[^a-z0-9 ]+', ' ', s.lower())
beats = m.get('beats') or []
if not beats: fails.append('no beats')
for i, b in enumerate(beats, 1):
    tag = f"beat {i} ({b.get('t')})"
    for k in ('reference_shows', 'role', 'client_shows', 'source'):
        if not str(b.get(k) or '').strip(): fails.append(f'{tag}: missing {k}')
    for src in (b.get('source') or '').split(';'):
        src = src.strip()
        if src.startswith('asset:'):
            if resolve(src[6:].strip()) is None: fails.append(f'{tag}: asset not found: {src[6:].strip()}')
        elif src.startswith('fact:'):
            phrase = ' '.join(norm(src[5:]).split())
            words = [w for w in phrase.split() if len(w) > 3]
            # the exact phrase first (numeric facts like "0-40 km/hr in 2.8 s" are all short words), then most of its words
            hit = 1.0 if phrase and phrase in ' '.join(norm(facts_text).split()) else sum(w in facts_text for w in words) / max(1, len(words))
            if hit < 0.8: fails.append(f'{tag}: fact not found in the facts files ({hit:.0%} of its words): {src[5:].strip()[:70]}')
        elif src: fails.append(f'{tag}: source must start with asset: or fact: ({src[:40]})')
    shown = ' ' + norm(str(b.get('client_shows', ''))) + ' '
    reused = [n for n in b.get('reference_nouns') or [] if re.search(r'\b' + re.escape(n.lower().rstrip('s')) + r's?\b', shown)]
    if reused and not (b.get('keeps_reference_object') and str(b.get('reason') or '').strip()):
        fails.append(f'{tag}: reuses the reference\'s own objects {reused} with no reason their role is the same for the client')
ref_dna = resolve(os.path.join(m.get('reference', ''), 'dna', 'dna.json')) if m.get('reference') else None
if ref_dna:
    dur = json.load(open(ref_dna))['video']['duration']; ts = sorted(tuple(b.get('t') or (0, 0)) for b in beats); end = 0.0
    for a, z in ts:
        if a - end > 0.5: fails.append(f'gap in the beats: {end:.2f} to {a:.2f} s')
        end = max(end, z)
    if dur - end > 0.5: fails.append(f'beats stop at {end:.2f} s; the reference runs to {dur:.2f} s')
elif m.get('reference'): fails.append(f"reference has no dna/dna.json (run tools/ref-dna.py on {m.get('reference')})")
print(('FAIL' if fails else 'PASS') + f' concept map {os.path.relpath(p)}: {len(beats)} beats')
for f in fails: print('  - ' + f)
sys.exit(1 if fails else 0)
