"""
Blender script: builds the low-poly athlete (tools/blender/athlete_model.py), bakes every clip of exports/anim/nfl_clips.json into an
Action and (a) renders transparent PNG frames (orthographic camera, athlete faces +X) and/or (b) exports a rigged glTF (.glb) with
all clips as animations.

    blender --background --python tools/blender/build_nfl_sprites.py -- \
        --clips exports/anim/nfl_clips.json --out exports/anim/frames --size 128 --kit football \
        [--only qb_overhand,mv_run] [--step 1] [--azimuth 30] [--engine workbench|eevee|cycles] \
        [--glb exports/anim/athlete_football.glb] [--no-render] [--build 1] [--skin 1] [--jersey 0.04,0.16,0.44]

Also runs headless with the pip wheel:  pip install bpy ; xvfb-run -a python -c "..."  (see docs/anim/BLENDER_NOTES.md).
STATUS: executed with bpy 5.1.0 (Linux, software GL). Rendering with Workbench is a few seconds/frame there; EEVEE needs a real GPU to be fast.
Conventions (single constants): SIGN = rotation sign so that positive clip angles swing a hanging limb toward +X (forward).
"""
import json, math, os, sys

try:
    import bpy
    from mathutils import Vector, Quaternion
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from athlete_model import build_athlete, triangle_count, THIGH, SHIN
except ImportError:  # allows `python3 build_nfl_sprites.py` outside Blender (prints usage)
    bpy = None

SIGN = -1.0          # Blender Ry(+θ) swings a bone that hangs down (-Z) toward -X; clips use + = forward (+X)
U = 0.18             # 1 u = body height / 10 (1.8 m athlete)
LEG = THIGH + SHIN if bpy else 0.92
LEG_SCALE = 1.3      # same stride exaggeration as the 2D "athlete" style (legS)


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    a = {'clips': 'exports/anim/nfl_clips.json', 'out': 'exports/anim/frames', 'size': 128, 'only': None, 'step': 1, 'render': True, 'kit': 'football',
         'azimuth': 30.0, 'engine': 'workbench', 'glb': None, 'build': 1, 'skin': 1, 'jersey': None}
    i = 0
    while i < len(argv):
        k = argv[i]
        if k == '--no-render': a['render'] = False; i += 1; continue
        v = argv[i + 1] if i + 1 < len(argv) else None
        if k == '--only': a['only'] = set(v.split(','))
        elif k == '--size': a['size'] = int(v)
        elif k == '--step': a['step'] = max(1, int(v))
        elif k == '--azimuth': a['azimuth'] = float(v)
        elif k == '--jersey': a['jersey'] = tuple(float(x) for x in v.split(','))
        elif k in ('--build', '--skin'): a[k[2:]] = int(v)
        elif k in ('--clips', '--out', '--kit', '--engine', '--glb'): a[k[2:]] = v
        i += 2
    return a


def leg_angles(l, k):
    """Planar approximation: foot forward offset l (u) and lift k (u) -> thigh angle and knee flexion (radians)."""
    thigh = math.asin(max(-0.95, min(0.95, (l * U * LEG_SCALE) / LEG)))
    knee = math.asin(max(0.0, min(0.95, (k * U * LEG_SCALE) / LEG))) * 2.0
    return thigh, -knee  # the shin flexes backward relative to the thigh


def apply_frame(rig, fr, i):
    """Key one clip frame. Pose-bone rotations live in each bone's own rest frame, so the world-Y swing axis is converted per bone
    (matrix_local^-1 @ Y). Hanging bones (arms, legs) swing forward with -angle; upright bones (spine, head) lean forward with +angle."""
    pb = rig.pose.bones
    def axis(name, v=(0, 1, 0)): return pb[name].bone.matrix_local.to_3x3().inverted() @ Vector(v)
    def rot(name, ang, sign=-1.0):
        b = pb[name]; b.rotation_mode = 'QUATERNION'; b.rotation_quaternion = Quaternion(axis(name), sign * ang); b.keyframe_insert('rotation_quaternion', frame=i)
    drop = fr['crouch'] * 0.16                                    # crouch: hips sink, knees bend so the feet stay planted
    pb['hips'].location = axis('hips', (0, 0, fr['air'] * U - drop)); pb['hips'].keyframe_insert('location', frame=i)
    rot('hips', 0.0); rot('spine', fr['lean'], +1.0); rot('head', -fr['lean'] * 0.5, +1.0)   # head counter-rotates to keep the eyes level
    for s in ('F', 'B'):
        rot(f'upper_{s}', fr['a' + s]); rot(f'fore_{s}', fr['f' + s] - fr['a' + s])          # forearm angles are absolute in the clip data
        th, kn = leg_angles(fr['l' + s], fr['k' + s]); th += fr['crouch'] * 0.55; kn -= fr['crouch'] * 1.1
        rot(f'thigh_{s}', th); rot(f'shin_{s}', kn)


def setup_scene(size, azimuth, engine):
    sc = bpy.context.scene; sc.render.resolution_x = sc.render.resolution_y = size; sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    eng = {'workbench': 'BLENDER_WORKBENCH', 'cycles': 'CYCLES', 'eevee': 'BLENDER_EEVEE'}[engine]
    try: sc.render.engine = eng
    except TypeError: sc.render.engine = 'BLENDER_EEVEE_NEXT' if engine == 'eevee' else eng
    if engine == 'workbench':                                     # flat, readable "game sprite" look with an outline
        sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'MATERIAL'; sh.show_object_outline = True; sh.show_cavity = False
        sc.render.film_transparent = True
    elif engine == 'cycles':
        sc.cycles.samples = 24; sc.cycles.device = 'CPU'
    cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'; cam_d.ortho_scale = 2.35
    cam = bpy.data.objects.new('cam', cam_d); bpy.context.collection.objects.link(cam); sc.camera = cam
    az = math.radians(azimuth); r = 8.0                           # azimuth 0 = pure side view (camera on -Y); 30 = three-quarter from the front-left
    cam.location = (math.sin(az) * r, -math.cos(az) * r, 0.95); cam.rotation_euler = (math.radians(90), 0, az)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(55), 0, math.radians(35)); bpy.context.collection.objects.link(sun)


def main():
    a = parse_args(); doc = json.load(open(a['clips']))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    colors = {'jersey': a['jersey']} if a['jersey'] else None
    obj, rig, prop = build_athlete(kit=a['kit'], colors=colors, build=a['build'], skin=a['skin'])
    print(f"[asu] athlete kit={a['kit']} tris={triangle_count(obj)}")
    setup_scene(a['size'], a['azimuth'], a['engine']); bpy.context.scene.render.fps = doc['fps']
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='POSE')
    done = []
    for c in doc['clips']:
        if a['only'] and c['id'] not in a['only']: continue
        rig.animation_data_create()
        act = bpy.data.actions.new(c['id']); rig.animation_data.action = act
        for i, fr in enumerate(c['frames']): apply_frame(rig, fr, i + 1)
        act.use_fake_user = True; done.append(act)
        bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, len(c['frames'])
        if a['render']:
            for i in range(0, len(c['frames']), a['step']):
                bpy.context.scene.frame_set(i + 1)
                d = os.path.join(a['out'], c['id']); os.makedirs(d, exist_ok=True)
                bpy.context.scene.render.filepath = os.path.join(d, f'frame_{i:04d}.png'); bpy.ops.render.render(write_still=True)
        print(f"[asu] {c['id']}: {len(c['frames'])} frames")
    bpy.ops.object.mode_set(mode='OBJECT')
    if a['glb']:
        os.makedirs(os.path.dirname(os.path.abspath(a['glb'])), exist_ok=True)
        bpy.ops.export_scene.gltf(filepath=a['glb'], export_format='GLB', export_animations=True, export_animation_mode='ACTIONS', export_apply=False)
        print(f"[asu] glb -> {a['glb']} ({os.path.getsize(a['glb']) // 1024} KB, {len(done)} animations)")


if __name__ == '__main__':
    if bpy is None: print('Run inside Blender: blender --background --python tools/blender/build_nfl_sprites.py -- --help')
    else: main()
