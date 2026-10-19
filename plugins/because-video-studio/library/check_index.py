#!/usr/bin/env python3
"""Check the motion library (studio layer + every client layer). Run: motion-studio/.venv/bin/python motion-studio/library/check_index.py
Fails (exit 1) on: a missing path, an entry without id/status/kind/event, a bad status, an approved generic piece outside
library/pieces/, a client name / slug / product name inside a generic file, a client library pointing into another client,
a client without the standard layout, a video folder missing from its client's campaigns.md."""
import sys, os, re, json, glob
HERE = os.path.dirname(os.path.abspath(__file__))
STUDIO = os.path.dirname(HERE)
try:
    import yaml
except ImportError:
    venv = os.path.join(STUDIO, '.venv', 'Scripts', 'python.exe') if os.name == 'nt' else os.path.join(STUDIO, '.venv', 'bin', 'python')
    os.execv(venv, [venv] + sys.argv)

errs, warns = [], []
# Media lives in Supabase Storage (tools/media.mjs); media.lock.json lists it. A file that is in the lock
# but not pulled to this machine is present, just not downloaded.
LOCKFILE = os.path.join(STUDIO, 'media.lock.json')
IN_STORAGE = set(json.load(open(LOCKFILE, encoding='utf-8'))['files']) if os.path.exists(LOCKFILE) else set()
not_pulled = []
def present(path):
    if os.path.exists(path): return True
    rel = os.path.relpath(path, STUDIO).replace(os.sep, '/')
    if rel in IN_STORAGE: not_pulled.append(rel); return True
    return False
STATUS = ('approved', 'candidate', 'rejected')
LAYOUT = ('CLAUDE.md', 'client.json', 'brand', 'campaigns.md', 'library.yaml', 'videos')

# ---- the brand words no generic file may contain: every client's name and slug, and every product folder name
CLIENTS = os.path.join(STUDIO, 'clients')   # a new workspace has no clients yet
clients = sorted(d for d in os.listdir(CLIENTS) if os.path.isdir(os.path.join(CLIENTS, d))) if os.path.isdir(CLIENTS) else []
words = set()
for c in clients:
    words.add(c)
    cj = os.path.join(STUDIO, 'clients', c, 'client.json')
    if os.path.exists(cj): words.add(json.load(open(cj, encoding='utf-8')).get('name', c))
    words.update(os.listdir(os.path.join(STUDIO, 'clients', c, 'products')) if os.path.isdir(os.path.join(STUDIO, 'clients', c, 'products')) else [])
words = {w for w in words if len(w) >= 3}
brand_re = re.compile(r'(?<![a-z0-9])(' + '|'.join(re.escape(w) for w in sorted(words, key=len, reverse=True)) + r')(?![a-z0-9])', re.I) if words else None

def leak(text, where):
    if brand_re is None: return
    for m in brand_re.finditer(text): errs.append(f'{where}: client word "{m.group(0)}" in a generic file')

def check_entry(e, where, base, scope):
    i = e.get('id', '?')
    for k in ('id', 'status', 'kind', 'event'):
        if k not in e or e[k] in (None, ''): errs.append(f'{where}/{i}: no {k}')
    if e.get('status') not in STATUS: errs.append(f'{where}/{i}: bad status {e.get("status")}')
    if e.get('status') == 'rejected' and not e.get('reason'): errs.append(f'{where}/{i}: rejected without reason')
    # local_only: "<why>" marks media that is deliberately not in git (size, client not in the pilot).
    # Missing there is a warning, so a fresh checkout passes and still says what it cannot render.
    miss = (lambda m: warns.append(f'{where}/{i}: {m} (local only: {e["local_only"]})')) if e.get('local_only') else errs.append
    for k in ('file', 'source', 'clip', 'preview'):
        p = e.get(k)
        if p and not present(os.path.join(base, p)): miss(f'missing {k} {p}')
    for p in e.get('also', []) or []:
        if not present(os.path.join(base, p)): miss(f'missing {p}')
    if scope == 'studio':
        leak(' '.join(str(e.get(k, '')) for k in ('id', 'event', 'use_when', 'tags', 'api', 'name')), f'index.yaml/{i}')
        if where == 'pieces' and e.get('status') == 'approved':
            f = e.get('file') or ''
            if not f.startswith('pieces/'): errs.append(f'index.yaml/{i}: approved generic piece must live in library/pieces/ (extract it from {e.get("source")})')
    if scope != 'studio':
        for k in ('file', 'source'):
            p = os.path.normpath(os.path.join(base, e.get(k) or '.'))
            if os.path.join(STUDIO, 'clients') in p and not p.startswith(base): errs.append(f'{where}/{i}: points into another client: {e.get(k)}')

# ---- studio layer
idx = yaml.safe_load(open(os.path.join(HERE, 'index.yaml'), encoding='utf-8'))
ids, n = set(), 0
for sec, entries in idx.items():
    if sec in ('rules', 'gaps', 'formats') or not isinstance(entries, list): continue
    for e in entries:
        if e.get('id') in ids: errs.append(f'duplicate id {e.get("id")}')
        ids.add(e.get('id')); n += 1
        check_entry(e, sec, HERE, 'studio')
for f in glob.glob(os.path.join(HERE, '**', '*'), recursive=True):
    if os.path.isfile(f) and f.endswith(('.md', '.js', '.json')) and 'lottie' not in f.replace(os.sep, '/').split('/'):
        leak(open(f, encoding='utf-8', errors='ignore').read(), os.path.relpath(f, HERE))

# ---- client layer
cn = 0
for c in clients:
    base = os.path.join(STUDIO, 'clients', c)
    for item in LAYOUT:
        if not os.path.exists(os.path.join(base, item)): errs.append(f'clients/{c}: missing {item}')
    lib = os.path.join(base, 'library.yaml')
    if os.path.exists(lib):
        data = yaml.safe_load(open(lib, encoding='utf-8')) or {}
        for sec, entries in data.items():
            for e in entries or []:
                check_entry(e, f'clients/{c}/{sec}', base, 'client'); cn += 1
    # every relative path a video's code loads must exist (an archive move once broke a shared kit, 12-10-2026)
    for page in glob.glob(os.path.join(base, 'videos', '*', '*.html')):
        vdir = os.path.dirname(page)
        code = open(page, encoding='utf-8', errors='ignore').read()
        code = re.sub(r'<!--.*?-->', '', code, flags=re.S)                 # HTML comments
        code = re.sub(r'(?<![:"\'])//[^\n]*', '', code)                    # JS line comments (not URLs)
        for m in re.finditer(r'''["'(](\.\./[^"')\s]+)''', code):
            ref = m.group(1).split('?')[0].split('#')[0]
            if '${' in ref or '+' in ref: continue
            if not present(os.path.normpath(os.path.join(vdir, ref))):
                errs.append(f'clients/{c}/{os.path.relpath(page, base)}: loads {ref}, which does not exist')
    camp = os.path.join(base, 'campaigns.md')
    if os.path.exists(camp):
        text = open(camp, encoding='utf-8').read()
        for v in sorted(os.listdir(os.path.join(base, 'videos'))) if os.path.isdir(os.path.join(base, 'videos')) else []:
            if os.path.isdir(os.path.join(base, 'videos', v)) and f'videos/{v}' not in text:
                errs.append(f'clients/{c}: videos/{v} is not in campaigns.md')

if errs:
    print('library check FAILED:'); [print('  -', e) for e in errs]; sys.exit(1)
if not_pulled:
    print(f'{len(set(not_pulled))} referenced media files are in storage but not on this machine: node tools/media.mjs pull')
if warns:
    print(f'{len(warns)} local-only files are not on this machine (fine on a fresh checkout):'); [print('  -', w) for w in warns]
gaps = idx.get('gaps', [])
print(f'library ok: {n} studio entries ({sum(1 for s in idx.get("pieces", []) if s.get("status") == "candidate")} pieces waiting for approval), '
      f'{cn} client entries across {len(clients)} clients, {len(gaps)} open gaps ({", ".join(g["id"] for g in gaps)})')
