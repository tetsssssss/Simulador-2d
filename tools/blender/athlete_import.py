"""
Import an EXTERNAL athlete mesh (e.g. a Meshy AI .glb: one static, untextured, unrigged mesh) and turn it into a game athlete:

    obj, rig, prop = import_athlete('model.glb', kit='football', colors={'jersey': (...)}, skin=1)

Same contract as athlete_model.build_athlete (so build_nfl_sprites.py / the clip animations work unchanged):
  * normalised to 1.80 m, feet on z = 0, centred, facing +X;
  * decimated (the source has 50-70k triangles, a 96 px sprite needs ~10k);
  * rigged with the game armature (hips, spine, head, upper_F/B, fore_F/B, thigh_F/B, shin_F/B), bones placed on the body's own landmarks
    (measured from the mesh: leg / arm centre lines), skin weights by proximity to the bone segments (2 nearest bones, steep falloff);
  * zones painted as the game materials by dominant bone + height: jersey, pants, skin, helmet, boots, trim (socks / stick), accent
    (sleeve bands, sock bands, helmet stripe) -> the colour pass and the team-colour mask pass of build_nfl_sprites.py work as for the low-poly athlete.
The mesh is treated as untrusted data: only geometry is read; nothing from the file is executed.
"""
import math
import bpy
import bmesh
from mathutils import Vector

import athlete_model as AM
from athlete_model import _material, SKINS

BODY_H = 1.8
HIP_Z, SH_Z, NECK_Z = 0.92, 1.44, 1.52


def _load_mesh(path):
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes: raise RuntimeError('no mesh in ' + path)
    for o in bpy.context.scene.objects: o.select_set(o in meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    for o in [o for o in bpy.context.scene.objects if o is not ob]: bpy.data.objects.remove(o, do_unlink=True)   # empties / cameras from the file
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    ob.parent = None; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


def _normalise(ob, kit):
    """glTF import is Y-up -> Blender Z-up with the character facing -Y. Rotate to face +X, scale to 1.8 m, feet at z = 0, body centred on x = y = 0."""
    me = ob.data; vs = [v.co.copy() for v in me.vertices]
    zmin = min(v.z for v in vs); zmax = max(v.z for v in vs); s = BODY_H / (zmax - zmin)
    for v in me.vertices:
        c = v.co; v.co = Vector((-c.y * s, c.x * s, (c.z - zmin) * s))
    # centre: median x/y of the torso band (stick / feet do not bias it)
    band = [v.co for v in me.vertices if 1.0 < v.co.z < 1.35 and abs(v.co.y) < 0.2]
    cx = sorted(p.x for p in band)[len(band) // 2] if band else 0.0
    for v in me.vertices: v.co.x -= cx
    me.update()


def _decimate(ob, target):
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if tris <= target: return
    m = ob.modifiers.new('dec', 'DECIMATE'); m.ratio = target / tris
    bpy.ops.object.modifier_apply(modifier=m.name)


def _centroid(pts):
    return sum(pts, Vector()) / max(1, len(pts))


def _landmarks(ob, kit):
    """Joint positions measured from the mesh. Returns {'F': {...}, 'B': {...}} with F = the y<0 side (the camera side of the game renders)."""
    P = [v.co for v in ob.data.vertices]
    lm = {}
    arm_cut = 0.31 if kit == 'hockey' else 0.27       # |y| beyond which a vertex at chest height belongs to an arm (sweater / pads are wider than the torso)
    for s, sg in (('F', -1), ('B', 1)):
        def leg(z0, z1): return _centroid([p for p in P if z0 <= p.z < z1 and p.y * sg > 0.02])
        def arm(z0, z1): return _centroid([p for p in P if z0 <= p.z < z1 and p.y * sg > arm_cut and p.x > -0.6])
        knee = leg(0.40, 0.52); ankle = leg(0.05, 0.14); hip = Vector((0.0, 0.115 * sg, HIP_Z))
        sh = Vector((0.0, 0.255 * sg, SH_Z)); elbow = arm(1.02, 1.18); wrist = arm(0.78, 0.92)
        if elbow.length == 0 or wrist.length == 0: elbow = sh + Vector((0.0, 0.06 * sg, -0.30)); wrist = elbow + Vector((0.0, 0.05 * sg, -0.28))
        lm[s] = dict(hip=hip, knee=Vector((knee.x, knee.y, 0.47)), ankle=Vector((ankle.x, ankle.y, 0.06)), shoulder=sh,
                     elbow=Vector((elbow.x, elbow.y, elbow.z)), wrist=Vector((wrist.x, wrist.y, wrist.z)))
    return lm


def _rig(lm):
    arm = bpy.data.armatures.new('asu_rig'); obj = bpy.data.objects.new('asu_rig', arm)
    bpy.context.collection.objects.link(obj); bpy.context.view_layer.objects.active = obj; obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); eb = arm.edit_bones
    def bone(name, head, tail, parent=None, connect=False):
        b = eb.new(name); b.head = Vector(head); b.tail = Vector(tail)
        if parent: b.parent = eb[parent]; b.use_connect = connect
    bone('hips', (0, 0, HIP_Z), (0, 0, HIP_Z + 0.12)); bone('spine', (0, 0, HIP_Z), (0, 0, NECK_Z), 'hips'); bone('head', (0, 0, NECK_Z), (0, 0, BODY_H), 'spine')
    for s in ('F', 'B'):
        L = lm[s]
        bone(f'upper_{s}', L['shoulder'], L['elbow'], 'spine'); bone(f'fore_{s}', L['elbow'], L['wrist'] + Vector((0, 0, -0.06)), f'upper_{s}', True)
        bone(f'thigh_{s}', L['hip'], L['knee'], 'hips'); bone(f'shin_{s}', L['knee'], L['ankle'] + Vector((0, 0, -0.06)), f'thigh_{s}', True)
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj


def _seg_dist(p, a, b):
    ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.dot(ab)))); return (p - (a + ab * t)).length


def _skin(ob, rig, power=5.0):
    """Skin weights: the two nearest bone SEGMENTS, weight ~ 1/d^power (steep = near-rigid limbs with a soft blend at the joints)."""
    bones = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in rig.data.bones}
    # keep the head / neck rigid and stop the arms from stealing torso vertices: arms only claim vertices outside the torso column
    groups = {n: ob.vertex_groups.new(name=n) for n in bones}
    for v in ob.data.vertices:
        p = v.co; ds = []
        for n, (a, b) in bones.items():
            d = _seg_dist(p, a, b)
            if n.startswith(('upper_', 'fore_')) and abs(p.y) < 0.19 and p.z > 0.95: d += 0.25      # inside the torso column: not an arm
            if n in ('spine', 'hips', 'head'): d *= 0.78                                                # trunk bones are fat: favour them near the centre line
            ds.append((d, n))
        ds.sort(); near = ds[:2]; ws = [1.0 / max(1e-4, d) ** power for d, _ in near]; tot = sum(ws)
        for (d, n), w in zip(near, ws):
            if w / tot > 0.02: groups[n].add([v.index], w / tot, 'REPLACE')
    mod = ob.modifiers.new('rig', 'ARMATURE'); mod.object = rig; ob.parent = rig


def _dominant(ob):
    idx2name = {g.index: g.name for g in ob.vertex_groups}; out = []
    for v in ob.data.vertices:
        best = max(v.groups, key=lambda g: g.weight) if v.groups else None
        out.append(idx2name[best.group] if best else 'spine')
    return out


def _paint(ob, kit, c, sk):
    M = lambda n, rgb, rough=0.7: _material(f'asu_{n}', rgb, rough)
    for n, rgb in (('jersey', c['jersey']), ('pants', c['pants']), ('skin', sk), ('boots', c['boots']), ('helmet', c['helmet']), ('trim', c['trim']), ('accent', c.get('accent', (0.95, 0.95, 0.95)))): M(n, rgb)
    M('dark', (0.05, 0.05, 0.06)); M('metal', (0.65, 0.68, 0.72), 0.35)
    names = ['jersey', 'pants', 'skin', 'boots', 'helmet', 'trim', 'accent', 'dark', 'metal']; idx = {n: i for i, n in enumerate(names)}
    for n in names: ob.data.materials.append(bpy.data.materials[f'asu_{n}'])
    dom = _dominant(ob); me = ob.data
    for poly in me.polygons:
        vs = [me.vertices[i] for i in poly.vertices]; cz = sum(v.co.z for v in vs) / len(vs); cx = sum(v.co.x for v in vs) / len(vs); cy = sum(v.co.y for v in vs) / len(vs)
        g = max(set(dom[i] for i in poly.vertices), key=[dom[i] for i in poly.vertices].count)   # majority bone of the face
        m = 'jersey'
        if kit == 'hockey' and cx > 0.26 and 0.5 < cz < 1.1: m = 'dark'                              # the stick blade / shaft in front of the body
        elif kit == 'hockey' and cx < -0.26 and 0.6 < cz < 1.1: m = 'dark'                           # the stick's butt end behind
        elif g == 'head': m = 'skin' if cz < NECK_Z + 0.05 else 'helmet'
        elif g in ('spine',): m = 'jersey'
        elif g == 'hips': m = 'pants'
        elif g.startswith('upper_'): m = 'accent' if (SH_Z - 0.50 < cz < SH_Z - 0.42 and False) else 'jersey'
        elif g.startswith('fore_'): m = 'skin' if cz > 0.80 else 'dark'                               # gloves at the wrist
        elif g.startswith('thigh_'): m = 'pants'
        elif g.startswith('shin_'):
            if cz < 0.12: m = 'boots'
            elif cz < 0.34: m = 'accent' if 0.20 < cz < 0.28 else 'trim'                              # sock band / socks
            else: m = 'pants'
        poly.material_index = idx[m]
    # helmet centre stripe + sleeve bands (accent): thin zones painted after the main pass
    for poly in me.polygons:
        vs = [me.vertices[i] for i in poly.vertices]; cz = sum(v.co.z for v in vs) / len(vs); cy = sum(v.co.y for v in vs) / len(vs)
        if poly.material_index == idx['helmet'] and abs(cy) < 0.022 and cz > NECK_Z + 0.2: poly.material_index = idx['accent']
        elif poly.material_index == idx['jersey'] and abs(cy) > 0.27 and 1.06 < cz < 1.13: poly.material_index = idx['accent']   # sleeve band
    me.update()


def import_athlete(path, kit='football', colors=None, skin=1, target_tris=12000, with_prop=False):
    c = {'jersey': (0.04, 0.16, 0.44), 'pants': (0.92, 0.92, 0.95), 'helmet': (0.92, 0.92, 0.95), 'trim': (0.95, 0.95, 0.95), 'boots': (0.07, 0.07, 0.08)}
    c.update(colors or {})
    ob = _load_mesh(path); ob.name = 'asu_athlete'
    _normalise(ob, kit); _decimate(ob, target_tris)
    lm = _landmarks(ob, kit); rig = _rig(lm)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    _skin(ob, rig); _paint(ob, kit, c, SKINS[skin % len(SKINS)])
    for p in ob.data.polygons: p.use_smooth = False
    return ob, rig, None
