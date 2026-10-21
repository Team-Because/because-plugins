#!/usr/bin/env python3
"""Render an edit decision list (EDL) of real footage into a finished video.

  python3 tools/edit/edl.py <edl.json> [--draft]

edl.json (paths relative to the EDL file):
{
  "format": "9x16",                    # 16x9 | 9x16 | 1x1 | 4x5
  "fps": 30,
  "output": "renders/short1_9x16.mp4",
  "clips": [                           # played in order, hard cuts
    {"src": "../../references/x/raw.mp4", "in": 12.4, "out": 19.8,
     "crop": "face",                   # face (track the speaker) | center | blur (fit + blurred fill) | [x,y,w,h] in 0..1
     "zoom": 1.0,                      # punch-in (1.15 = 15 % tighter), use on alternate cuts to hide jump cuts
     "speed": 1.0, "volume": 1.0, "label": "hook"}
  ],
  "broll": [                           # optional cutaways over the main cut (main audio keeps playing)
    {"src": "broll/hands.mp4", "at": 4.2, "in": 0, "out": 2.5, "crop": "center"}
  ],
  "music": {"src": "audio/bed.mp3", "volume_db": -18, "duck": true},   # optional
  "captions": {"style": "bold", "max_words": 3, "position": 0.68, "accent": "#FFD43B", "upper": false,
               "transcripts": {}},     # optional; transcripts auto-found at <src>_transcript/transcript.json
  "loudness": -14
}
Writes the video + <output>.segments.json (where every clip landed on the output timeline).
--draft renders fast (ultrafast, half-size) for review.
"""
import argparse, bisect, json, math, os, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FORMATS = {'16x9': (1920, 1080), '9x16': (1080, 1920), '1x1': (1080, 1080), '4x5': (1080, 1350)}
_probe_cache, _face_cache = {}, {}


def probe(src):
    if src not in _probe_cache:
        d = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', src],
                                      capture_output=True, text=True).stdout)
        v = next((s for s in d['streams'] if s['codec_type'] == 'video'), None)
        w, h = (v['width'], v['height']) if v else (0, 0)
        for sd in (v or {}).get('side_data_list', []) or []:
            if abs(int(sd.get('rotation', 0) or 0)) in (90, 270): w, h = h, w
        _probe_cache[src] = {'w': w, 'h': h, 'audio': any(s['codec_type'] == 'audio' for s in d['streams']),
                             'dur': float(d['format'].get('duration', 0))}
    return _probe_cache[src]


def face_center(src, t0, t1):
    """Median centre (0..1) of the largest face across a few frames, or None."""
    key = (src, round(t0, 2), round(t1, 2))
    if key in _face_cache: return _face_cache[key]
    import cv2
    cap = cv2.VideoCapture(src)
    det, pts = None, []
    for i in range(7):
        cap.set(cv2.CAP_PROP_POS_MSEC, (t0 + (t1 - t0) * (i + 0.5) / 7) * 1000)
        ok, fr = cap.read()
        if not ok: continue
        h, w = fr.shape[:2]
        k = 640 / max(w, h); sm = cv2.resize(fr, (int(w * k), int(h * k)))
        if det is None:
            det = cv2.FaceDetectorYN.create(str(HERE / 'models/face_detection_yunet_2023mar.onnx'), '', (sm.shape[1], sm.shape[0]), 0.7)
        det.setInputSize((sm.shape[1], sm.shape[0]))
        _, faces = det.detect(sm)
        if faces is not None and len(faces):
            x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])[:4]
            pts.append(((x + fw / 2) / sm.shape[1], (y + fh / 2) / sm.shape[0]))
    cap.release()
    res = None
    if pts:
        xs, ys = sorted(p[0] for p in pts), sorted(p[1] for p in pts)
        res = (xs[len(xs) // 2], ys[len(ys) // 2])
    _face_cache[key] = res
    return res


def frame_filter(src, c, TW, TH, fps):
    """Video chain for one input: crop/scale to TW x TH."""
    p = probe(src); sw, sh = p['w'], p['h']; z = float(c.get('zoom', 1) or 1)
    mode = c.get('crop', 'center'); A = TW / TH
    if mode == 'blur':
        return (f"split[f{{i}}][b{{i}}];[b{{i}}]scale={TW}:{TH}:force_original_aspect_ratio=increase,crop={TW}:{TH},boxblur=30:3,eq=brightness=-0.08[bb{{i}}];"
                f"[f{{i}}]scale={TW}:{TH}:force_original_aspect_ratio=decrease[ff{{i}}];[bb{{i}}][ff{{i}}]overlay=(W-w)/2:(H-h)/2")
    if isinstance(mode, list):
        x, y, w, h = mode
        return f"crop={w * sw:.0f}:{h * sh:.0f}:{x * sw:.0f}:{y * sh:.0f},scale={TW}:{TH}"
    cw, ch = (sh * A, sh) if sw / sh > A else (sw, sw / A)
    cw, ch = cw / z, ch / z
    cx, cy = 0.5, 0.5
    if mode == 'face':
        f = face_center(src, float(c['in']), float(c['out']))
        if f: cx, cy = f[0], f[1] + 0.12 * ch / sh     # keep headroom: face sits ~38 % from the top of the crop
    x0 = min(max(cx * sw - cw / 2, 0), sw - cw); y0 = min(max(cy * sh - ch / 2, 0), sh - ch)
    return f"crop={int(cw) // 2 * 2}:{int(ch) // 2 * 2}:{int(x0)}:{int(y0)},scale={TW}:{TH}"


def atempo(s):
    out = []
    while s > 2: out.append('atempo=2'); s /= 2
    while s < 0.5: out.append('atempo=0.5'); s /= 0.5
    return out + [f'atempo={s:.4f}'] if abs(s - 1) > 1e-3 else out


def render_cut(E, base, TW, TH, fps, out, draft):
    args, fc, segs, t = ['ffmpeg', '-v', 'error', '-stats', '-y'], [], [], 0.0
    clips = E['clips']
    for i, c in enumerate(clips):
        src = str((base / c['src']).resolve()); p = probe(src)
        a, b, s = float(c['in']), float(c['out']), float(c.get('speed', 1) or 1)
        args += ['-ss', f'{a:.3f}', '-to', f'{b:.3f}', '-i', src]
        d = (b - a) / s
        fc.append(f"[{i}:v]setpts=(PTS-STARTPTS)/{s},{frame_filter(src, c, TW, TH, fps).replace('{i}', str(i))},fps={fps},setsar=1,format=yuv420p[v{i}]")
        if p['audio']:
            ch = ','.join(['asetpts=PTS-STARTPTS'] + atempo(s) + [f"volume={c.get('volume', 1)}", 'aformat=sample_rates=48000:channel_layouts=stereo',
                           f'afade=t=in:d=0.015,afade=t=out:st={max(d - 0.015, 0):.3f}:d=0.015'])
            fc.append(f'[{i}:a]{ch}[a{i}]')
        else:
            fc.append(f'aevalsrc=0:c=stereo:s=48000:d={d:.3f}[a{i}]')
        segs.append({'label': c.get('label', ''), 'src': c['src'], 'in': a, 'out': b, 'speed': s, 'start': round(t, 3), 'end': round(t + d, 3)})
        t += d
    n = len(clips)
    fc.append(''.join(f'[v{i}][a{i}]' for i in range(n)) + f'concat=n={n}:v=1:a=1[vc][ac]')
    vlast, k = 'vc', n
    for j, br in enumerate(E.get('broll', [])):
        src = str((base / br['src']).resolve()); a, b, at = float(br.get('in', 0)), float(br['out']), float(br['at'])
        args += ['-ss', f'{a:.3f}', '-to', f'{b:.3f}', '-i', src]
        fc.append(f"[{k}:v]setpts=PTS-STARTPTS+{at}/TB,{frame_filter(src, br, TW, TH, fps).replace('{i}', 'r' + str(j))},fps={fps},setsar=1,format=yuv420p[br{j}]")
        fc.append(f"[{vlast}][br{j}]overlay=enable='between(t,{at},{at + b - a})':eof_action=pass[vb{j}]")
        vlast, k = f'vb{j}', k + 1
    alast = 'ac'
    m = E.get('music')
    if m:
        args += ['-stream_loop', '-1', '-i', str((base / m['src']).resolve())]
        fc.append(f"[{k}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=duration={t:.3f},volume={m.get('volume_db', -18)}dB,"
                  f"afade=t=in:d=0.5,afade=t=out:st={max(t - 1.5, 0):.3f}:d=1.5[m]")
        if m.get('duck', True):
            fc.append('[ac]asplit[av][ak];[m][ak]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=350[md];[av][md]amix=inputs=2:normalize=0[am]')
        else:
            fc.append('[ac][m]amix=inputs=2:normalize=0[am]')
        alast = 'am'
    fc.append(f"[{alast}]loudnorm=I={E.get('loudness', -14)}:TP=-1:LRA=11,aresample=48000[ao]")
    if draft: fc.append(f'[{vlast}]scale={TW // 2}:{TH // 2}[vo]'); vlast = 'vo'
    args += ['-filter_complex', ';'.join(fc), '-map', f'[{vlast}]', '-map', '[ao]',
             '-c:v', 'libx264', '-preset', 'ultrafast' if draft else 'medium', '-crf', '23' if draft else '18', '-pix_fmt', 'yuv420p',
             '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(out)]
    subprocess.run(args, check=True)
    return segs, t


# ---------------------------------------------------------------- captions (drawn with PIL, overlaid by ffmpeg)
def caption_groups(E, base, segs):
    cap = E['captions']; mw = int(cap.get('max_words', 3)); groups = []
    cache = {}
    for sg, c in zip(segs, E['clips']):
        src = (base / c['src']).resolve()
        tp = cap.get('transcripts', {}).get(c['src'])
        tp = (base / tp) if tp else src.parent / f'{src.stem}_transcript' / 'transcript.json'
        if not tp.exists(): sys.exit(f'captions: no transcript for {c["src"]} (run tools/edit/transcribe.py first)')
        words = cache.setdefault(str(tp), json.loads(tp.read_text())['words'])
        ws = [w for w in words if w['start'] >= sg['in'] - 0.05 and w['end'] <= sg['out'] + 0.15]
        cur = []
        for w in ws:
            s = sg['start'] + (max(w['start'], sg['in']) - sg['in']) / sg['speed']
            e = min(sg['start'] + (min(w['end'], sg['out']) - sg['in']) / sg['speed'], sg['end'])
            if cur and (len(cur) >= mw or re.search(r'[.,!?;:…]$', cur[-1][0]) or s - cur[-1][2] > 0.4 or e - cur[0][1] > 1.8):
                groups.append(cur); cur = []
            cur.append((w['w'], s, e))
        if cur: groups.append(cur)
    for i in range(len(groups) - 1):            # hold until the next group if the gap is short (no flicker)
        if groups[i + 1][0][1] - groups[i][-1][2] < 0.3:
            w, s, e = groups[i][-1]; groups[i][-1] = (w, s, groups[i + 1][0][1])
    return groups


def burn_captions(E, base, segs, src_video, out, TW, TH, fps, draft):
    from PIL import Image, ImageDraw, ImageFont
    cap = E['captions']; groups = caption_groups(E, base, segs)
    if draft: TW, TH = TW // 2, TH // 2
    size = int(TH * (0.050 if TH > TW else 0.060 if TW > TH else 0.058) * float(cap.get("scale", 1)))
    font = ImageFont.truetype(str(HERE / 'fonts/Inter.ttf'), size)
    try: font.set_variation_by_axes([32, 800 if cap.get('style', 'bold') == 'bold' else 600])
    except Exception: pass
    accent = cap.get('accent', '#FFD43B'); stroke = max(2, size // 12); y = int(TH * cap.get('position', 0.68 if TH > TW else 0.82))
    starts = [g[0][1] for g in groups]
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(src_video)],
                               capture_output=True, text=True).stdout)
    nfr = int(math.ceil(dur * fps))
    ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-i', str(src_video), '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{TW}x{TH}',
                           '-r', str(fps), '-i', '-', '-filter_complex', '[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]',
                           '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-preset', 'ultrafast' if draft else 'medium',
                           '-crf', '23' if draft else '18', '-c:a', 'copy', '-movflags', '+faststart', str(out)], stdin=subprocess.PIPE)
    blank = Image.new('RGBA', (TW, TH), (0, 0, 0, 0)).tobytes(); last_key, last_bytes = None, blank
    for f in range(nfr):
        t = f / fps; gi = bisect.bisect_right(starts, t) - 1
        key = None
        if gi >= 0 and t <= groups[gi][-1][2] + 1e-6:
            g = groups[gi]; ai = max(j for j, w in enumerate(g) if w[1] <= t + 1e-6)
            key = (gi, ai)
        if key != last_key:
            if key is None: last_bytes = blank
            else:
                im = Image.new('RGBA', (TW, TH), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
                words = [(w[0].upper() if cap.get('upper') else w[0]) for w in groups[key[0]]]
                widths = [d.textlength(w + ' ', font=font) for w in words]; total = sum(widths) - d.textlength(' ', font=font)
                x = (TW - total) / 2
                for j, w in enumerate(words):
                    d.text((x, y), w, font=font, fill=accent if j == key[1] else 'white', stroke_width=stroke, stroke_fill='black', anchor='ls')
                    x += widths[j]
                last_bytes = im.tobytes()
            last_key = key
        ff.stdin.write(last_bytes)
    ff.stdin.close(); ff.wait()
    if ff.returncode: sys.exit('caption overlay failed')
    return len(groups)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('edl'); ap.add_argument('--draft', action='store_true')
    a = ap.parse_args()
    ep = Path(a.edl).resolve(); base = ep.parent; E = json.loads(ep.read_text())
    TW, TH = FORMATS[E.get('format', '16x9')]; fps = int(E.get('fps', 30))
    out = base / E.get('output', 'renders/out.mp4')
    if a.draft: out = out.with_name(out.stem + '_draft' + out.suffix)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.stem + '.nocap.mp4') if E.get('captions') else out
    segs, total = render_cut(E, base, TW, TH, fps, tmp, a.draft)
    msg = ''
    if E.get('captions'):
        n = burn_captions(E, base, segs, tmp, out, TW, TH, fps, a.draft); tmp.unlink(); msg = f', {n} caption groups'
    out.with_suffix('.segments.json').write_text(json.dumps(segs, indent=1))
    print(f'wrote {out}  {total:.1f}s  {len(segs)} clips{msg}')


if __name__ == '__main__':
    main()
