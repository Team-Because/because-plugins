# <python> tools/voice.py <video-dir> [--voice <name|id>]
# Voiceover for a film: one take per line, each line placed on its own start time from <video>/docs/script.json. Never
# time-stretches speech (a phase-vocoder speed-up was heard as glitches on 15-10-2026); a line that runs long pushes the next
# one back. Fades on every edge. Writes vo.wav and vo.json (absolute word times, for captions).
# script.json: {"voice": "brian", "end": 19.2, "lines": [{"t": 0.07, "text": "..."}, ...]}
# Where the takes come from:
#   1. The ElevenLabs connector in Claude (the normal route, no key): Claude makes each line with the connector's
#      text-to-speech tool and saves it as vo-cache/line-01.mp3, line-02.mp3 ... in script order. This script then places
#      them; word times come from faster-whisper on each take, matched to the script's words.
#   2. ELEVEN_LABS_API_KEY in the environment or the studio .env (optional): one API call per line with exact word timings.
# With neither, it stops and lists the lines Claude still has to make.
import os, sys, json, base64, io, re, difflib, urllib.request, urllib.error
import numpy as np, soundfile as sf, librosa

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import env
KEY = env('ELEVEN_LABS_API_KEY')
VOICES = {'brian': 'nPczCjzI2devNBz1zQrb', 'kamal': 'qsz5tTEjPvsiIJZIpM8S', 'vijay': 'rAsfH6d68tmh0XRGXp4D', 'george': 'JBFqnCBsd6RMkjVDRZzb'}
SR = 44100
vd = sys.argv[1]; args = sys.argv[2:]
spec = json.load(open(os.path.join(vd, 'docs', 'script.json')))
name = args[args.index('--voice') + 1] if '--voice' in args else spec.get('voice', 'brian')
vid = VOICES.get(name, name)
def take_file(i):
    for ext in ('mp3', 'wav', 'm4a'):
        p = os.path.join(vd, 'vo-cache', f'line-{i + 1:02d}.{ext}')
        if os.path.exists(p): return p
    return None

if not KEY:
    missing = [i for i in range(len(spec['lines'])) if not take_file(i)]
    if missing:
        sys.exit('No voice takes yet. Make these lines with the ElevenLabs connector and save each as vo-cache/line-NN.mp3:\n'
                 + '\n'.join(f"  line-{i + 1:02d}.mp3  {spec['lines'][i]['text']}" for i in missing)
                 + '\nNo ElevenLabs connector: leave the voice out (on-screen text and music carry the film).')

_whisper = None
def whisper_words(path):
    global _whisper
    from faster_whisper import WhisperModel
    if _whisper is None:
        _whisper = WhisperModel('small', device='cpu', compute_type='int8', download_root=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.models'))
    segs, _ = _whisper.transcribe(path, word_timestamps=True, vad_filter=False)
    return [(w.word.strip(), w.start, w.end) for s in segs for w in (s.words or [])]

def from_file(i, text):
    # the script's own words, timed from what Whisper heard; unmatched words are spread between their matched neighbours
    path = take_file(i); y, _ = librosa.load(path, sr=SR, mono=True)
    norm = lambda w: re.sub(r'[^\w]', '', w.lower())
    script = text.split(); heard = whisper_words(path)
    times = [None] * len(script)
    sm = difflib.SequenceMatcher(a=[norm(w) for w in script], b=[norm(w) for w, _, _ in heard], autojunk=False)
    for a, b, n in sm.get_matching_blocks():
        for k in range(n): times[a + k] = (heard[b + k][1], heard[b + k][2])
    nz = np.where(np.abs(y) > 0.01)[0]; s0, s1 = (nz[0] / SR, nz[-1] / SR) if len(nz) else (0.0, len(y) / SR)
    known = [-1] + [k for k, t in enumerate(times) if t] + [len(script)]
    for a, b in zip(known[:-1], known[1:]):
        if b - a < 2: continue
        lo = times[a][1] if a >= 0 else s0; hi = times[b][0] if b < len(script) else s1
        step = max(0.0, hi - lo) / (b - a - 1)
        for k in range(a + 1, b): times[k] = (lo + (k - a - 1) * step, lo + (k - a) * step)
    ch, st, en = [], [], []
    for w, (a, b) in zip(script, times):
        for j, c in enumerate(w): ch.append(c); st.append(a + (b - a) * j / len(w)); en.append(a + (b - a) * (j + 1) / len(w))
        ch.append(' '); st.append(b); en.append(b)
    return y, ch, st, en

def credit():
    j = json.load(urllib.request.urlopen(urllib.request.Request('https://api.elevenlabs.io/v1/user/subscription', headers={'xi-api-key': KEY}), timeout=30))
    return j['character_limit'] - j['character_count']
need = sum(len(l['text']) for l in spec['lines']) + 200
if KEY and credit() < need: sys.exit(f'ElevenLabs credit too low ({credit()} left, {need} needed): make the lines with the ElevenLabs connector instead (no key needed)')

def tts(text, prev, nxt, i):
    if not KEY: return from_file(i, text)
    os.makedirs(os.path.join(vd, 'vo-cache'), exist_ok=True)
    ck = os.path.join(vd, 'vo-cache', f'{vid}-' + ''.join(c for c in text if c.isalnum())[:40] + '.json')
    if os.path.exists(ck): j = json.load(open(ck))
    else:
        body = {'text': text, 'model_id': 'eleven_multilingual_v2', 'previous_text': prev, 'next_text': nxt,
                'voice_settings': {'stability': 0.62, 'similarity_boost': 0.8, 'style': 0.08, 'use_speaker_boost': True, 'speed': 0.92}}
        req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{vid}/with-timestamps?output_format=mp3_44100_128',
                                     data=json.dumps(body).encode(), headers={'xi-api-key': KEY, 'Content-Type': 'application/json'})
        j = json.load(urllib.request.urlopen(req, timeout=120)); json.dump(j, open(ck, 'w'))
    y, _ = librosa.load(io.BytesIO(base64.b64decode(j['audio_base64'])), sr=SR, mono=True)
    a = j['alignment']; return y, a['characters'], a['character_start_times_seconds'], a['character_end_times_seconds']

def words_of(ch, st, en):
    out, cur, s0, pe = [], '', None, None
    for c, a, b in zip(ch, st, en):
        if c == ' ':
            if cur: out.append([cur, s0, pe]); cur = ''
            continue
        if not cur: s0 = a
        cur += c; pe = b
    if cur: out.append([cur, s0, pe])
    return out

lines = spec['lines']; end = spec.get('end', lines[-1]['t'] + 3)
mix = np.zeros(int((end + 4) * SR)); words = []; free = 0.0; placed = []
for i, ln in enumerate(lines):
    prev = ' '.join(l['text'] for l in lines[:i]); nxt = lines[i + 1]['text'] if i + 1 < len(lines) else ''
    y, ch, st, en = tts(ln['text'], prev, nxt, i)
    nz = np.where(np.abs(y) > 0.01)[0]; a0 = max(0, nz[0] - int(0.02 * SR)); a1 = min(len(y), nz[-1] + int(0.08 * SR))
    y = y[a0:a1].copy(); shift = a0 / SR
    fi, fo = int(0.012 * SR), int(0.045 * SR); y[:fi] *= np.linspace(0, 1, fi) ** 2; y[-fo:] *= np.linspace(1, 0, fo) ** 2
    t0 = max(ln['t'], free + 0.08)
    # a line that finishes the previous one's sentence follows it closely: the second half of "Because a bike that doesn't
    # think / limits you." waited 1.2 s for its planned start, heard as a vocal glitch (listening review, 15-10-2026)
    if i and not lines[i - 1]['text'].rstrip().endswith(('.', '!', '?')): t0 = free + 0.3
    k = int(t0 * SR); mix[k:k + len(y)] += y[:len(mix) - k]
    for w, s, e in words_of(ch, st, en): words.append({'w': w, 'line': i, 's': round(t0 + s - shift, 3), 'e': round(t0 + e - shift, 3)})
    free = t0 + len(y) / SR; placed.append({'line': i, 'planned': ln['t'], 'at': round(t0, 3), 'ends': round(free, 3)})
    print(f'line {i + 1}: at {t0:.2f}s (planned {ln["t"]:.2f}), ends {free:.2f}')
mix /= max(1e-6, np.abs(mix).max() / 0.89)
sf.write(os.path.join(vd, 'vo.wav'), mix.astype(np.float32), SR)
json.dump({'voice': name, 'voice_id': vid, 'model': 'eleven_multilingual_v2' if KEY else 'elevenlabs-connector', 'lines': [l['text'] for l in lines], 'placed': placed, 'words': words},
          open(os.path.join(vd, 'vo.json'), 'w'), indent=1)
