"""Pack the per-frame PNGs written by build_nfl_sprites.py into one horizontal sprite sheet per clip + a JSON atlas.
    python3 tools/blender/pack_sheets.py exports/anim/frames exports/anim/sheets      (needs Pillow: pip install pillow)
"""
import json, os, sys
from PIL import Image

def main(src, dst):
    os.makedirs(dst, exist_ok=True); atlas = {}
    for clip in sorted(os.listdir(src)):
        d = os.path.join(src, clip); files = sorted(f for f in os.listdir(d) if f.endswith('.png')) if os.path.isdir(d) else []
        if not files: continue
        ims = [Image.open(os.path.join(d, f)).convert('RGBA') for f in files]; w, h = ims[0].size
        sheet = Image.new('RGBA', (w * len(ims), h)); [sheet.paste(im, (i * w, 0)) for i, im in enumerate(ims)]
        sheet.save(os.path.join(dst, clip + '.png')); atlas[clip] = {'frame_w': w, 'frame_h': h, 'frames': len(ims)}
    json.dump(atlas, open(os.path.join(dst, 'atlas.json'), 'w'), indent=1); print(f'{len(atlas)} sheets -> {dst}')

if __name__ == '__main__':
    main(*(sys.argv[1:3] if len(sys.argv) >= 3 else ('exports/anim/frames', 'exports/anim/sheets')))
