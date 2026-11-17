"""Build the game sprite atlases (assets/sprites/*) from tools/blender/atlas_plan.json.
    BLENDER="blender --background --python tools/blender/build_nfl_sprites.py" python3 tools/blender/make_atlas.py [kit ...]
Headless with the pip wheel (see docs/anim/BLENDER_NOTES.md):  BLENDER="xvfb-run -a python run_bpy.py"  where run_bpy.py emulates `blender … -- args`.
Per kit and page it renders a COLOUR pass (tintable white jersey/pants) and a MASK pass (R = jersey+helmet, G = pants), 5 facing directions for
locomotion pages (E, SE, S, NE, N; W/NW/SW are mirrored at runtime) and 1 for event pages, then packs them with pack_atlas.py (Pillow)."""
import json, os, shlex, shutil, subprocess, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')); os.chdir(ROOT)
plan = json.load(open('tools/blender/atlas_plan.json'))
blender = shlex.split(os.environ.get('BLENDER', 'blender --background --python tools/blender/build_nfl_sprites.py'))
OUT = 'exports/anim/atlas_frames'
subprocess.run(['node', 'tools/anim/export_clips.mjs'], check=True, stdout=subprocess.DEVNULL)
for kit in (sys.argv[1:] or plan['kits']):
    spec = plan['kits'][kit]
    for layer in ('color', 'mask'):
        for page in spec['pages']:
            yaws = ','.join(str(y) for y in plan['yaws']) if page['dirs'] > 1 else '0'
            out = f"{OUT}/{kit}_{layer}_{page['name']}"
            shutil.rmtree(out, ignore_errors=True)
            cmd = blender + ['--', '--kit', spec['build'], '--layer', layer, '--size', str(plan['frame']), '--step', str(plan['step']), '--azimuth', str(plan['azimuth']),
                             '--elevation', str(plan['elevation']), '--yaws', yaws, '--only', ','.join(page['clips']), '--out', out] + ([] if spec['prop'] else ['--no-prop'])
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)
    subprocess.run([sys.executable, 'tools/blender/pack_atlas.py', kit, OUT, 'assets/sprites'], check=True)
