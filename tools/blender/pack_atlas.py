"""Pack the rendered frames of one kit into paged atlases + a JSON index.
    python3 tools/blender/pack_atlas.py <kit> exports/anim/atlas_frames assets/sprites        (needs Pillow)
Per page: <kit>_<page>_color.png / _mask.png. One ROW per (clip, direction): row = clip_index * dirs + direction, frames left to right.
Pages keep every PNG <= 4096 px tall (older mobile GPUs). The index (<kit>.json) lists pages, per-clip {page,row,n,dur,loop,dirs} and the body box."""
import json, os, sys
from PIL import Image

GAIN = 1.3   # Workbench shading leaves 'white' at ~0.6-0.75: lift the base so a white team jersey reads white (and dark teams stay dark)
def gain(im):
    r, g, b, a = im.split(); f = lambda v: min(255, int(v * GAIN))
    return Image.merge('RGBA', (r.point(f), g.point(f), b.point(f), a))

def load_dir(path):
    files = sorted(f for f in os.listdir(path) if f.endswith('.png')); return [Image.open(os.path.join(path, f)).convert('RGBA') for f in files]

def main(kit, src, dst):
    plan = json.load(open(os.path.join(os.path.dirname(__file__), 'atlas_plan.json'))); spec = plan['kits'][kit]
    clips = {c['id']: c for c in json.load(open('exports/anim/nfl_clips.json'))['clips']}
    F = plan['frame']; pages, index, body = [], {}, None
    os.makedirs(dst, exist_ok=True)
    for page in spec['pages']:
        dirs = page['dirs']; rows = []
        for cid in page['clips']:
            for d in range(dirs):
                sub = os.path.join(src, f"{kit}_%s_{page['name']}", cid) + (f'/d{d}' if dirs > 1 else '')
                rows.append((cid, d, load_dir(sub % 'color'), load_dir(sub % 'mask')))
        W, H = max(len(r[2]) for r in rows) * F, len(rows) * F
        assert H <= 4096, f'{kit}/{page["name"]}: {H}px tall; split the page in atlas_plan.json'
        color, mask = Image.new('RGBA', (W, H), (0, 0, 0, 0)), Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for r, (cid, d, cf, mf) in enumerate(rows):
            for i, (a, b) in enumerate(zip(cf, mf)):
                color.paste(gain(a), (i * F, r * F)); m = b.copy(); m.putalpha(a.getchannel('A')); mask.paste(m, (i * F, r * F))
            if d == 0:
                c = clips[cid]; index[cid] = {'page': len(pages), 'row': r, 'n': len(cf), 'dur': c['duration'], 'loop': c['loop'], 'dirs': dirs}
                if body is None: bb = cf[0].getchannel('A').getbbox(); body = {'feet': bb[3], 'top': bb[1], 'body': bb[3] - bb[1]}
        color.save(os.path.join(dst, f"{kit}_{page['name']}_color.png"), optimize=True); mask.save(os.path.join(dst, f"{kit}_{page['name']}_mask.png"), optimize=True)
        pages.append({'name': page['name'], 'dirs': dirs, 'w': W, 'h': H})
    ref = os.path.join(dst, 'football.json')   # one scale for every kit (same camera): body height comes from the football athlete, so hockey/ref/goalie keep their real relative size
    if kit != 'football' and os.path.exists(ref): body['body'] = json.load(open(ref))['body']
    doc = {'kit': kit, 'frame': F, 'step': plan['step'], 'fps': 30 // plan['step'], 'dirs': plan['dirs'], **body, 'pages': pages, 'clips': index}
    json.dump(doc, open(os.path.join(dst, f'{kit}.json'), 'w'), separators=(',', ':'))
    print(f"{kit}: {len(index)} clips in {len(pages)} page(s) {[(p['w'], p['h']) for p in pages]}, body {body['body']}px, feet row {body['feet']}")

if __name__ == '__main__':
    main(*sys.argv[1:4])
