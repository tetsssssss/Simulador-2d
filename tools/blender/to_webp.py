"""Convert the sprite atlases PNG -> WebP (colour: lossy q88 + lossless alpha; mask: LOSSLESS so the R/G/B team-tint channels stay exact).
    python3 tools/blender/to_webp.py [assets/sprites]      (needs Pillow; removes the PNG after a successful conversion)
pack_atlas.py now writes WebP directly; this is for atlases packed earlier."""
import glob, os, sys
from PIL import Image
d = sys.argv[1] if len(sys.argv) > 1 else 'assets/sprites'
tot = [0, 0]
for f in sorted(glob.glob(os.path.join(d, '*_color.png')) + glob.glob(os.path.join(d, '*_mask.png'))):
    im = Image.open(f).convert('RGBA'); out = f[:-4] + '.webp'
    if f.endswith('_mask.png'): im.save(out, 'WEBP', lossless=True, method=4)
    else: im.save(out, 'WEBP', quality=88, alpha_quality=100, method=4)
    assert Image.open(out).size == im.size
    tot[0] += os.path.getsize(f); tot[1] += os.path.getsize(out); os.remove(f)
print(f'{tot[0] // 1024} KB PNG -> {tot[1] // 1024} KB WebP')
