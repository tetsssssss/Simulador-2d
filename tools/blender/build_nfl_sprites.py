"""
Blender (4.x or 3.6) script: builds a simple football rig, bakes every clip of exports/anim/nfl_clips.json into an Action and
renders the frames as transparent PNGs (orthographic side camera, athlete faces +X).

    blender --background --python tools/blender/build_nfl_sprites.py -- \
        --clips exports/anim/nfl_clips.json --out exports/anim/frames --size 128 [--only qb_overhand,qb_bullet] [--step 1] [--no-render]

STATUS: NOT RUN YET (written without Blender available). Expect small fixes on the first run - see "Conventions to check".
Conventions to check on the first run (all are single constants below):
  * SIGN: rotation about Y that moves a down-pointing bone toward +X (forward). With Blender's right-handed axes a positive
    Y rotation swings a bone that points down (-Z) toward -X, so SIGN = -1. Flip it if the athlete swings backwards.
  * U (unit) = body height / 10 = 0.18 m  ->  a 1.8 m athlete.
  * Leg offsets (lF/kF, lB/kB) are converted to thigh/shin angles with a planar approximation (see leg_angles()).
Then pack the frames into sprite sheets with:  python3 tools/blender/pack_sheets.py exports/anim/frames exports/anim/sheets
"""
import json, math, os, sys

try:
    import bpy
    from mathutils import Vector
except ImportError:  # allows `python3 build_nfl_sprites.py --help` / import checks outside Blender
    bpy = None

SIGN = -1.0
U = 0.18
LEG = 3.2 * U

def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    a = {'clips': 'exports/anim/nfl_clips.json', 'out': 'exports/anim/frames', 'size': 128, 'only': None, 'step': 1, 'render': True}
    i = 0
    while i < len(argv):
        k = argv[i]
        if k == '--clips': a['clips'] = argv[i + 1]; i += 2
        elif k == '--out': a['out'] = argv[i + 1]; i += 2
        elif k == '--size': a['size'] = int(argv[i + 1]); i += 2
        elif k == '--only': a['only'] = set(argv[i + 1].split(',')); i += 2
        elif k == '--step': a['step'] = max(1, int(argv[i + 1])); i += 2
        elif k == '--no-render': a['render'] = False; i += 1
        else: i += 1
    return a

def leg_angles(l, k):
    """Planar approximation: foot forward offset l (u) and lift k (u) -> thigh angle and knee flexion (radians)."""
    thigh = math.asin(max(-0.95, min(0.95, (l * U) / LEG)))
    knee = math.asin(max(0.0, min(0.95, (k * U) / LEG))) * 2.0
    return thigh, -knee  # shin flexes backward relative to the thigh

def build_rig():
    arm = bpy.data.armatures.new('asu_rig'); obj = bpy.data.objects.new('asu_rig', arm)
    bpy.context.collection.objects.link(obj); bpy.context.view_layer.objects.active = obj; obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    def bone(name, head, tail, parent=None):
        b = arm.edit_bones.new(name); b.head = Vector(head); b.tail = Vector(tail)
        if parent: b.parent = arm.edit_bones[parent]
        return b
    hip_z, sh_z = 3.5 * U, 6.2 * U
    bone('hips', (0, 0, hip_z), (0, 0, hip_z + 0.5 * U))
    bone('spine', (0, 0, hip_z), (0, 0, sh_z), 'hips')
    bone('head', (0, 0, sh_z), (0, 0, sh_z + 3.2 * U), 'spine')
    for side, y in (('F', -0.3 * U), ('B', 0.3 * U)):
        bone(f'upper_{side}', (0, y, sh_z), (0, y, sh_z - 1.3 * U), 'spine')
        bone(f'fore_{side}', (0, y, sh_z - 1.3 * U), (0, y, sh_z - 2.6 * U), f'upper_{side}')
        bone(f'thigh_{side}', (0, y * 1.6, hip_z), (0, y * 1.6, hip_z - LEG / 2), 'hips')
        bone(f'shin_{side}', (0, y * 1.6, hip_z - LEG / 2), (0, y * 1.6, 0.0), f'thigh_{side}')
    bpy.ops.object.mode_set(mode='OBJECT')
    # blocky body so renders show something (replace with the real mesh later; keep the bone names)
    def box(name, bone_name, size, loc, color):
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc); m = bpy.context.active_object; m.name = name; m.scale = size
        mat = bpy.data.materials.new(name); mat.diffuse_color = color; m.data.materials.append(mat)
        m.parent = obj; m.parent_type = 'BONE'; m.parent_bone = bone_name
    box('torso', 'spine', (1.6 * U, 1.2 * U, 2.7 * U), (0, 0, (hip_z + sh_z) / 2), (0.05, 0.16, 0.44, 1))
    box('helmet', 'head', (2.0 * U, 1.7 * U, 1.9 * U), (0, 0, sh_z + 1.5 * U), (0.9, 0.9, 0.95, 1))
    for s, y in (('F', -0.3 * U), ('B', 0.3 * U)):
        box(f'upper_{s}', f'upper_{s}', (0.5 * U, 0.5 * U, 1.3 * U), (0, y, sh_z - 0.65 * U), (0.05, 0.16, 0.44, 1))
        box(f'fore_{s}', f'fore_{s}', (0.45 * U, 0.45 * U, 1.3 * U), (0, y, sh_z - 1.95 * U), (0.85, 0.65, 0.5, 1))
        box(f'thigh_{s}', f'thigh_{s}', (0.6 * U, 0.6 * U, LEG / 2), (0, y * 1.6, hip_z - LEG / 4), (0.9, 0.9, 0.95, 1))
        box(f'shin_{s}', f'shin_{s}', (0.55 * U, 0.55 * U, LEG / 2), (0, y * 1.6, LEG / 4), (0.9, 0.9, 0.95, 1))
    return obj

def apply_frame(obj, fr, i):
    pb = obj.pose.bones
    for b in pb: b.rotation_mode = 'XYZ'
    def rot(name, ang): pb[name].rotation_euler = (0, SIGN * ang, 0); pb[name].keyframe_insert('rotation_euler', frame=i)
    pb['hips'].location = (0, 0, (fr['air'] - fr['crouch'] * 1.5) * U); pb['hips'].keyframe_insert('location', frame=i)
    rot('spine', fr['lean'])
    for s in ('F', 'B'):
        rot(f'upper_{s}', fr['a' + s]); rot(f'fore_{s}', fr['f' + s] - fr['a' + s])     # forearm angles are absolute in the clip data
        th, kn = leg_angles(fr['l' + s], fr['k' + s]); rot(f'thigh_{s}', th); rot(f'shin_{s}', kn - th)

def setup_scene(size):
    sc = bpy.context.scene; sc.render.resolution_x = sc.render.resolution_y = size; sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError: sc.render.engine = 'BLENDER_EEVEE'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.data.type = 'ORTHO'; cam.data.ortho_scale = 12 * U
    cam.location = (0, -10, 5.2 * U); cam.rotation_euler = (math.radians(90), 0, 0); bpy.context.collection.objects.link(cam); sc.camera = cam
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.rotation_euler = (math.radians(50), 0, math.radians(20)); bpy.context.collection.objects.link(sun)

def main():
    a = parse_args(); doc = json.load(open(a['clips']))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    obj = build_rig(); setup_scene(a['size']); bpy.context.scene.render.fps = doc['fps']
    for c in doc['clips']:
        if a['only'] and c['id'] not in a['only']: continue
        act = bpy.data.actions.new(c['id']); obj.animation_data_create(); obj.animation_data.action = act
        for i, fr in enumerate(c['frames']): apply_frame(obj, fr, i + 1)
        bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, len(c['frames'])
        if a['render']:
            for i in range(0, len(c['frames']), a['step']):
                bpy.context.scene.frame_set(i + 1)
                d = os.path.join(a['out'], c['id']); os.makedirs(d, exist_ok=True)
                bpy.context.scene.render.filepath = os.path.join(d, f'frame_{i:04d}.png'); bpy.ops.render.render(write_still=True)
        print(f"[asu] {c['id']}: {len(c['frames'])} frames")

if __name__ == '__main__':
    if bpy is None: print('Run inside Blender: blender --background --python tools/blender/build_nfl_sprites.py -- --help')
    else: main()
