# .venv/bin/python tools/voice.py <video-dir> [--voice <name|id>]
# Voiceover for a reference-based film: one ElevenLabs call per line (with word timings), each line placed on its own start
# time from <video>/docs/script.json. Never time-stretches speech (a phase-vocoder speed-up was heard as glitches on
# 15-10-2026); a line that runs long pushes the next one back. Fades on every edge. Writes vo.wav and vo.json (absolute word
# times, for captions). Lines are cached in vo-cache/, so re-runs cost nothing.
# script.json: {"voice": "brian", "end": 19.2, "lines": [{"t": 0.07, "text": "..."}, ...]}
# Music and voice routing (motion-studio/CLAUDE.md): ElevenLabs direct first; when it has no credit, this stops and says so,
# and the FAL fallback runs from a Claude session (FAL is an MCP connection, no key in .env).
import os, sys, json, base64, io, urllib.request, urllib.error
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
if not KEY: sys.exit('ElevenLabs key missing: run setup again to add it')

def credit():
    j = json.load(urllib.request.urlopen(urllib.request.Request('https://api.elevenlabs.io/v1/user/subscription', headers={'xi-api-key': KEY}), timeout=30))
    return j['character_limit'] - j['character_count']
need = sum(len(l['text']) for l in spec['lines']) + 200
if credit() < need: sys.exit(f'ElevenLabs credit too low ({credit()} left, {need} needed): run the FAL fallback from a Claude session')

def tts(text, prev, nxt):
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
    y, ch, st, en = tts(ln['text'], prev, nxt)
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
json.dump({'voice': name, 'voice_id': vid, 'model': 'eleven_multilingual_v2', 'lines': [l['text'] for l in lines], 'placed': placed, 'words': words},
          open(os.path.join(vd, 'vo.json'), 'w'), indent=1)
