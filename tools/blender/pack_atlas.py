"""Pack the colour + mask frame folders of one kit into game atlases (assets/sprites/<kit>_color.png, <kit>_mask.png) + a JSON index.
    python3 tools/blender/pack_atlas.py football exports/anim/atlas_frames assets/sprites          (needs Pillow)
Frames come from build_nfl_sprites.py (--layer color / --layer mask) at the size/step of tools/blender/atlas_plan.json.
Atlas layout: one ROW per clip, frames left to right. The index stores per-clip row/frames/duration/loop and the body box (feet row
and body height in pixels, measured on the idle frame) so the game can anchor the sprite at the feet and scale it to the avatar height."""
import json, os, sys
from PIL import Image

GAIN = 1.3   # Workbench shading leaves 'white' at ~0.6-0.75: lift the base so a white team jersey reads white (and dark teams stay dark)
def gain(im):
    r, g, b, a = im.split(); f = lambda v: min(255, int(v * GAIN))
    return Image.merge('RGBA', (r.point(f), g.point(f), b.point(f), a))

def main(kit, src, dst):
    plan = json.load(open(os.path.join(os.path.dirname(__file__), 'atlas_plan.json')))
    clips = json.load(open('exports/anim/nfl_clips.json'))['clips']; meta = {c['id']: c for c in clips}
    F, step = plan['frame'], plan['step']
    rows = []
    for cid in plan['kits'][kit]:
        cdir, mdir = os.path.join(src, kit + '_color', cid), os.path.join(src, kit + '_mask', cid)
        files = sorted(f for f in os.listdir(cdir) if f.endswith('.png')); 
        rows.append((cid, [Image.open(os.path.join(cdir, f)).convert('RGBA') for f in files], [Image.open(os.path.join(mdir, f)).convert('RGBA') for f in files]))
    W, H = max(len(r[1]) for r in rows) * F, len(rows) * F
    color, mask = Image.new('RGBA', (W, H), (0, 0, 0, 0)), Image.new('RGBA', (W, H), (0, 0, 0, 0)); index = {}
    for r, (cid, cf, mf) in enumerate(rows):
        for i, (a, b) in enumerate(zip(cf, mf)):
            color.paste(gain(a), (i * F, r * F))
            m = b.copy(); m.putalpha(a.getchannel('A')); mask.paste(m, (i * F, r * F))
        c = meta[cid]; index[cid] = {'row': r, 'n': len(cf), 'dur': c['duration'], 'loop': c['loop']}
    idle = rows[0][1][0].getchannel('A').getbbox()                     # (left, top, right, bottom) of the idle silhouette
    doc = {'kit': kit, 'frame': F, 'step': step, 'fps': 30 // step, 'feet': idle[3], 'top': idle[1], 'body': idle[3] - idle[1], 'clips': index}
    os.makedirs(dst, exist_ok=True)
    color.save(os.path.join(dst, f'{kit}_color.png'), optimize=True); mask.save(os.path.join(dst, f'{kit}_mask.png'), optimize=True)
    json.dump(doc, open(os.path.join(dst, f'{kit}.json'), 'w'), separators=(',', ':'))
    print(f'{kit}: {len(index)} clips, atlas {W}x{H}, body {doc["body"]}px, feet row {doc["feet"]}')

if __name__ == '__main__':
    main(*sys.argv[1:4])
