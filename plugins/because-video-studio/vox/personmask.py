"""Speaker cut-out masks for a folder of frames, on Mac and Windows.

  personmask.py <in_dir> <out_dir> [--engine vision|birefnet] [--size 512|1024]

Every .png or .jpg in in_dir -> <same name>.png in out_dir: an 8-bit mask at the input's full size (white = person).
  vision    Apple Vision (Mac only, the studio's proven matte): runs <studio>/bin/personmask, built by setup.mjs --vox.
  birefnet  BiRefNet (MIT, https://huggingface.co/ZhengPeng7/BiRefNet), local on CPU or an NVIDIA GPU. Default on Windows.
            --size 512 (default) looked the same as 1024 on a real testimonial and runs about 4x faster on CPU
            (1.6 vs 7.2 s a frame on an Apple M4 Pro CPU, 21-10-2026); 1024 for fine hair on a big close-up.
Default: vision on a Mac that has the binary, birefnet everywhere else. Any python can launch it: the birefnet engine
re-executes itself in <studio>/.venv-voice, which holds torch.
"""
import os
import subprocess
import sys

STUDIO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VISION_BIN = os.path.join(STUDIO, "bin", "personmask")
VENV = os.path.join(STUDIO, ".venv-voice")
VENV_PY = os.path.join(VENV, "Scripts", "python.exe") if os.name == "nt" else os.path.join(VENV, "bin", "python")
REPO, REVISION = "ZhengPeng7/BiRefNet", "e2bf8e4460fc8fa32bba5ea4d94b3233d367b0e4"   # pinned: remote code runs only at this commit


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("dst")
    ap.add_argument("--engine", choices=["vision", "birefnet"])
    ap.add_argument("--size", type=int, choices=[512, 1024], default=512)
    a = ap.parse_args()
    engine = a.engine or ("vision" if sys.platform == "darwin" and os.path.exists(VISION_BIN) else "birefnet")
    if engine == "vision":
        if not os.path.exists(VISION_BIN):
            sys.exit("Apple Vision matte is not built: run setup with the vox step on a Mac, or use --engine birefnet")
        sys.exit(subprocess.call([VISION_BIN, a.src, a.dst]))
    if os.path.realpath(sys.prefix) != os.path.realpath(VENV):
        if not os.path.exists(VENV_PY):
            sys.exit("The cut-out model is not installed: run setup with the vox step (setup.mjs --vox)")
        sys.exit(subprocess.call([VENV_PY, os.path.abspath(__file__), a.src, a.dst, "--engine", "birefnet", "--size", str(a.size)]))
    birefnet(a.src, a.dst, a.size)


def birefnet(src, dst, size=512):
    import numpy as np
    import torch
    from PIL import Image
    from torchvision import transforms
    from transformers import AutoModelForImageSegmentation

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = AutoModelForImageSegmentation.from_pretrained(REPO, revision=REVISION, trust_remote_code=True)
    model = (model.half() if device == "cuda" else model.float()).to(device).eval()   # the weights ship in half precision; CPUs need float
    prep = transforms.Compose([transforms.Resize((size, size)), transforms.ToTensor(),
                               transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
    os.makedirs(dst, exist_ok=True)
    files = sorted(f for f in os.listdir(src) if f.lower().endswith((".png", ".jpg", ".jpeg")))
    for i, f in enumerate(files, 1):
        im = Image.open(os.path.join(src, f)).convert("RGB")
        with torch.no_grad():
            x = prep(im).unsqueeze(0).to(device)
            pred = model(x.half() if device == "cuda" else x)[-1].sigmoid().cpu()[0, 0].numpy()
        mask = Image.fromarray((np.clip(pred, 0, 1) * 255).astype("uint8")).resize(im.size, Image.BILINEAR)
        mask.save(os.path.join(dst, os.path.splitext(f)[0] + ".png"))
        if i % 25 == 0 or i == len(files):
            print(f"{i}/{len(files)} masks", flush=True)


if __name__ == "__main__":
    main()
