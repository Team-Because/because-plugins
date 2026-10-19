# .venv/bin/python tools/trace-assets.py <client>
# Traces every real product image of a client into line art, once, so films can draw the client's own product in a
# line-drawing grammar instead of borrowing a reference's objects (L-156). Reads brand/assets/product/, the still images in
# brand/assets/site/named/, and brand/assets/kit/*.svg. Writes brand/assets/traced/<name>.png (white lines on transparent)
# and brand/assets/traced/index.json (name, source, size, what it is from the file name). Skips files already traced.
import os, sys, json, glob, subprocess, tempfile
import numpy as np, cv2
from PIL import Image

client = sys.argv[1]
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'clients', client, 'brand', 'assets')
out = os.path.join(root, 'traced'); os.makedirs(out, exist_ok=True)
srcs = sorted(glob.glob(f'{root}/product/*.*') + [p for p in glob.glob(f'{root}/site/named/*.*') if p.lower().endswith(('.png', '.webp', '.jpg', '.jpeg'))])
svgs = sorted(glob.glob(f'{root}/kit/*.svg'))
index = json.load(open(f'{out}/index.json')) if os.path.exists(f'{out}/index.json') else {}

def trace(rgb, lo, hi):
    g = cv2.GaussianBlur(cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY), (3, 3), 0)
    e = cv2.dilate(cv2.Canny(g, lo, hi), np.ones((2, 2), np.uint8))
    ys, xs = np.where(e > 0)
    if not len(xs): return None
    e = e[max(0, ys.min() - 8):ys.max() + 8, max(0, xs.min() - 8):xs.max() + 8]          # trim to the drawing
    a = Image.fromarray(e); im = Image.new('RGBA', a.size, (255, 255, 255, 0)); im.putalpha(a)
    return im

for p in srcs:
    name = os.path.splitext(os.path.basename(p))[0]
    if name in index: continue
    im = Image.open(p).convert('RGBA'); bg = Image.new('RGBA', im.size, (0, 0, 0, 255)); bg.alpha_composite(im)
    rgb = np.array(bg.convert('RGB'))
    if max(rgb.shape[:2]) > 2000: s = 2000 / max(rgb.shape[:2]); rgb = cv2.resize(rgb, (int(rgb.shape[1] * s), int(rgb.shape[0] * s)), interpolation=cv2.INTER_AREA)
    # pick thresholds so the drawing is clean: about 3 to 7% of pixels as line
    for lo, hi in ((40, 120), (60, 150), (90, 190), (120, 230)):
        t = trace(rgb, lo, hi)
        if t is None: continue
        share = (np.array(t)[..., 3] > 0).mean()
        if share < 0.07: break
    if t is None: continue
    t.save(f'{out}/{name}.png')
    index[name] = {'file': f'brand/assets/traced/{name}.png', 'source': os.path.relpath(p, os.path.join(root, '..', '..')), 'w': t.size[0], 'h': t.size[1],
                   'what': name.replace('-', ' ').replace('_', ' ')}
    print('traced', name, t.size)

# svg icons: rasterise in a browser, keep the strokes as white lines
todo = [s for s in svgs if os.path.splitext(os.path.basename(s))[0] not in index]
if todo:
    js = tempfile.mktemp(suffix='.mjs', dir=os.path.dirname(os.path.abspath(__file__)))
    open(js, 'w').write("""import { chromium } from 'playwright'; import { readFileSync } from 'node:fs';
const [,, out, ...files] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 600, height: 600 } });
for (const f of files) { const svg = readFileSync(f, 'utf8').replace(/<\\?xml[^>]*>/, '').replace(/stroke="[^"]*"/g, 'stroke="#ffffff"').replace(/fill="(?!none)[^"]*"/g, 'fill="#ffffff"');
  await p.setContent(`<body style="margin:0;background:transparent"><div style="width:600px;height:600px;display:flex;align-items:center;justify-content:center">${svg}</div></body>`);
  await p.evaluate(() => { const s = document.querySelector('svg'); s.setAttribute('width', 520); s.setAttribute('height', 520); });
  await p.screenshot({ path: `${out}/${f.split('/').pop().replace('.svg', '.png')}`, omitBackground: true }); }
await b.close();""")
    subprocess.run(['node', js, out, *todo], check=True); os.remove(js)
    for s in todo:
        name = os.path.splitext(os.path.basename(s))[0]; im = Image.open(f'{out}/{name}.png'); bb = im.getbbox()
        if bb: im = im.crop(bb); im.save(f'{out}/{name}.png')
        index[name] = {'file': f'brand/assets/traced/{name}.png', 'source': os.path.relpath(s, os.path.join(root, '..', '..')), 'w': im.size[0], 'h': im.size[1], 'what': name.replace('-', ' ') + ' (icon)'}
        print('traced icon', name)
json.dump(index, open(f'{out}/index.json', 'w'), indent=1)
print(len(index), 'traced assets in', os.path.relpath(out))

# a labelled sheet of every traced asset, so a model can see what each one looks like before choosing it
from PIL import ImageDraw, ImageFont
names = sorted(index); cols = 6; cw, chh = 260, 230; rows = (len(names) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cw, rows * chh), (0, 0, 0)); dr = ImageDraw.Draw(sheet)
try: fnt = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 15)
except Exception: fnt = ImageFont.load_default()
for i, n in enumerate(names):
    im = Image.open(os.path.join(out, n + '.png')).convert('RGBA'); im.thumbnail((cw - 20, chh - 40))
    x, y = (i % cols) * cw, (i // cols) * chh
    sheet.paste(im, (x + (cw - im.size[0]) // 2, y + 8 + (chh - 40 - im.size[1]) // 2), im); dr.text((x + 8, y + chh - 26), n, fill=(200, 200, 200), font=fnt)
sheet.save(os.path.join(out, 'sheet.png')); print('sheet', os.path.relpath(os.path.join(out, 'sheet.png')))
