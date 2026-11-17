"""
Low-poly athlete model + rig for Blender (tested with bpy 5.1; uses only long-standing API: bmesh, vertex groups, Armature modifier).

    from athlete_model import build_athlete
    obj, arm = build_athlete(kit='football', colors={'jersey': (0.04, 0.16, 0.44), 'pants': (0.92, 0.92, 0.95)}, build=1)

* One skinned mesh (rigid weights: every part belongs to ONE bone, joint "balls" hide the gaps when elbows/knees bend) parented to
  an armature with these bones: hips, spine, head, upper_F/B, fore_F/B, thigh_F/B, shin_F/B (F = facing side, B = far side).
* Athlete faces +X, is 1.80 m tall (build 0 slim / 1 medium / 2 heavy changes widths, not height). Z up, units = metres.
* Kits: 'football' (helmet + facemask + shoulder pads), 'hockey' (helmet, wide sweater, skates, optional stick),
  'goalie' (hockey + leg pads, chest protector, mask, blocker/catcher), 'baseball' (cap, glove, optional bat),
  'ref' (black/white striped shirt, white cap). Hand props (stick/bat) extend along the FOREARM so poses read naturally. Props are separate meshes parented to a hand bone, so they can be hidden.
* Budget (triangles, measured by tools/blender/report_budget.py): see docs/anim/BLENDER_NOTES.md.
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix

# ---- body dimensions (metres) ----
HIP_Z, SH_Z, HEAD_Z = 0.92, 1.48, 1.68
THIGH, SHIN = 0.46, 0.46
UPPER, FORE, HAND = 0.30, 0.27, 0.09
SH_HALF = 0.23          # shoulder joint half width (y)
HIP_HALF = 0.115

SKINS = [(0.96, 0.78, 0.65), (0.86, 0.63, 0.47), (0.70, 0.48, 0.34), (0.50, 0.33, 0.23), (0.34, 0.22, 0.16)]
BONES = ['hips', 'spine', 'head', 'upper_F', 'fore_F', 'upper_B', 'fore_B', 'thigh_F', 'shin_F', 'thigh_B', 'shin_B']


def _material(name, rgb, rough=0.7):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    col = (*rgb, 1.0)
    if bsdf:
        bsdf.inputs['Base Color'].default_value = col; bsdf.inputs['Roughness'].default_value = rough
    mat.diffuse_color = col  # viewport / Workbench colour
    return mat


class _Parts:
    """Collects bmesh parts, each with a bone name and a material slot, then bakes ONE mesh object."""
    def __init__(self):
        self.parts = []  # (bm, bone, material_name)

    def add(self, bm, bone, mat):
        self.parts.append((bm, bone, mat))

    # --- primitives (all return a fresh bmesh) ---
    @staticmethod
    def box(center, size, scale_top=None):
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            top = v.co.z > 0
            sx, sy = (scale_top if (scale_top and top) else (1.0, 1.0))
            v.co = Vector((v.co.x * size[0] * sx, v.co.y * size[1] * sy, v.co.z * size[2])) + Vector(center)
        return bm

    @staticmethod
    def limb(p0, p1, r0, r1, seg=8):
        """Tapered cylinder from p0 to p1 (radius r0 -> r1), capped."""
        p0, p1 = Vector(p0), Vector(p1); d = p1 - p0; L = d.length
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r0, radius2=r1, depth=L)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=d.to_track_quat('Z', 'Y').to_matrix())
        bmesh.ops.translate(bm, verts=bm.verts, vec=(p0 + p1) / 2)
        return bm

    @staticmethod
    def ball(center, radius, sx=1.0, sy=1.0, sz=1.0, sub=1):
        bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=radius)
        for v in bm.verts: v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz)) + Vector(center)
        return bm

    @staticmethod
    def torso(z0, z1, w_top, w_bot, d_top, d_bot):
        """V-shaped torso: wide shoulders (z1) narrowing to the waist (z0)."""
        bm = bmesh.new()
        def ring(z, w, d): return [bm.verts.new((x * d / 2, y * w / 2, z)) for x, y in ((1, -1), (1, 1), (-1, 1), (-1, -1))]
        a, b = ring(z0, w_bot, d_bot), ring(z1, w_top, d_top)
        for i in range(4): bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]))
        bm.faces.new(a[::-1]); bm.faces.new(b)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return bm

    def bake(self, name):
        """Join every part into one mesh, add vertex groups (rigid weights) and one material slot per colour."""
        mesh = bpy.data.meshes.new(name); obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        bm = bmesh.new(); groups = {}; mats = {}
        for pbm, bone, mat in self.parts:
            idx = mats.setdefault(mat, len(mats))
            vmap = {}
            for v in pbm.verts:
                nv = bm.verts.new(v.co); vmap[v] = nv; groups.setdefault(bone, []).append(nv)
            bm.verts.ensure_lookup_table()
            for f in pbm.faces:
                nf = bm.faces.new([vmap[v] for v in f.verts]); nf.material_index = idx; nf.smooth = False
            pbm.free()
        bm.verts.index_update()
        gi = {b: [v.index for v in vs] for b, vs in groups.items()}
        bm.to_mesh(mesh); bm.free()
        for b, ids in gi.items():
            vg = obj.vertex_groups.new(name=b); vg.add(ids, 1.0, 'REPLACE')
        return obj, mats


def _armature(lean_pose=None):
    arm = bpy.data.armatures.new('asu_rig'); obj = bpy.data.objects.new('asu_rig', arm)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj; obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones
    def bone(name, head, tail, parent=None, connect=False):
        b = eb.new(name); b.head = Vector(head); b.tail = Vector(tail)
        if parent: b.parent = eb[parent]; b.use_connect = connect
        return b
    bone('hips', (0, 0, HIP_Z), (0, 0, HIP_Z + 0.12))
    bone('spine', (0, 0, HIP_Z), (0, 0, SH_Z), 'hips')
    bone('head', (0, 0, SH_Z), (0, 0, HEAD_Z + 0.14), 'spine')
    for s, y in (('F', -SH_HALF), ('B', SH_HALF)):                                   # arms hang straight down (angle 0)
        bone(f'upper_{s}', (0, y, SH_Z - 0.04), (0, y, SH_Z - 0.04 - UPPER), 'spine')
        bone(f'fore_{s}', (0, y, SH_Z - 0.04 - UPPER), (0, y, SH_Z - 0.04 - UPPER - FORE), f'upper_{s}', True)
    for s, y in (('F', -HIP_HALF), ('B', HIP_HALF)):
        bone(f'thigh_{s}', (0, y, HIP_Z), (0, y, HIP_Z - THIGH), 'hips')
        bone(f'shin_{s}', (0, y, HIP_Z - THIGH), (0, y, 0.0), f'thigh_{s}', True)
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj


def build_athlete(kit='football', colors=None, build=1, skin=1, number=None, with_prop=True):
    """Create the athlete. colors: dict of RGB tuples: jersey, pants, helmet, trim, boots."""
    c = {'jersey': (0.04, 0.16, 0.44), 'pants': (0.92, 0.92, 0.95), 'helmet': (0.92, 0.92, 0.95), 'trim': (0.95, 0.95, 0.95), 'boots': (0.07, 0.07, 0.08)}
    c.update(colors or {})
    if kit == 'ref': c.update({'jersey': (0.04, 0.04, 0.05), 'pants': (0.05, 0.05, 0.06), 'helmet': (0.97, 0.97, 0.97), 'trim': (0.97, 0.97, 0.97)})
    k = {0: 0.90, 1: 1.0, 2: 1.16}[build]            # width scale (slim / medium / heavy)
    P = _Parts(); sk = SKINS[skin % len(SKINS)]
    M = lambda n, rgb, rough=0.7: _material(f'asu_{n}', rgb, rough)
    jersey, pants, skinm, boots = 'jersey', 'pants', 'skin', 'boots'
    for n, rgb in (('jersey', c['jersey']), ('pants', c['pants']), ('skin', sk), ('boots', c['boots']), ('helmet', c['helmet']), ('trim', c['trim'])): M(n, rgb)
    M('dark', (0.05, 0.05, 0.06)); M('metal', (0.65, 0.68, 0.72), 0.35); M('accent', c.get('accent', (0.95, 0.95, 0.95)))   # accent = team secondary colour (mask channel B)

    # ---- torso, neck, head ----
    sw, ww = 0.5 * k, 0.34 * k
    if kit == 'ref':      # 12-sided shirt with alternating black/white vertical stripes that wrap around the body (visible from every direction)
        n = 12; ring = lambda z, w, d: [(math.cos(a * math.tau / n) * d / 2, math.sin(a * math.tau / n) * w / 2, z) for a in range(n)]
        lo, hi = ring(HIP_Z - 0.03, ww * 1.05, 0.24 * k), ring(SH_Z + 0.02, sw * 0.95, 0.28 * k)
        for parity, mat in ((0, 'jersey'), (1, 'trim')):
            bm = bmesh.new()
            for a in range(n):
                if a % 2 != parity: continue
                b = (a + 1) % n; vs = [bm.verts.new(v) for v in (lo[a], lo[b], hi[b], hi[a])]; bm.faces.new(vs)
            if parity == 0:  # shoulder cap
                bm.faces.new([bm.verts.new(v) for v in hi])
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces); P.add(bm, 'spine', mat)
    else:
        P.add(_Parts.torso(HIP_Z - 0.03, SH_Z + 0.02, sw, ww, 0.3 * k, 0.24 * k), 'spine', 'jersey')
    P.add(_Parts.box((0, 0, HIP_Z - 0.03), (ww * 1.02, 0.23 * k, 0.1)), 'hips', 'pants')                      # pelvis
    P.add(_Parts.limb((0, 0, SH_Z), (0, 0, SH_Z + 0.12), 0.055 * k, 0.05 * k, 6), 'head', 'skin')               # neck
    P.add(_Parts.ball((0, 0, HEAD_Z), 0.115, 0.95, 0.88, 1.12, 1), 'head', 'skin')                            # head
    # ---- arms (+ joint balls to hide gaps) ----
    for s, y in (('F', -SH_HALF), ('B', SH_HALF)):
        z0 = SH_Z - 0.04; z1 = z0 - UPPER; z2 = z1 - FORE
        P.add(_Parts.limb((0, y, z0), (0, y, z1), 0.064 * k, 0.052 * k), f'upper_{s}', 'jersey' if kit != 'ref' else 'trim')
        P.add(_Parts.ball((0, y, z1), 0.054 * k, sub=1), f'fore_{s}', 'skin')
        P.add(_Parts.limb((0, y, z1), (0, y, z2), 0.052 * k, 0.04), f'fore_{s}', 'skin')
        P.add(_Parts.ball((0, y, z2 - 0.04), 0.045, 1, 0.8, 1.1, 1), f'fore_{s}', 'skin')                      # hand
    # ---- legs ----
    for s, y in (('F', -HIP_HALF), ('B', HIP_HALF)):
        P.add(_Parts.limb((0, y, HIP_Z), (0, y, HIP_Z - THIGH), 0.108 * k, 0.074 * k), f'thigh_{s}', 'pants')
        P.add(_Parts.ball((0, y, HIP_Z - THIGH), 0.074 * k, sub=1), f'shin_{s}', 'pants')
        P.add(_Parts.limb((0, y, HIP_Z - THIGH), (0, y, 0.07), 0.074 * k, 0.052), f'shin_{s}', 'trim' if kit == 'football' else 'pants')
        P.add(_Parts.box((0.07, y, 0.04), (0.28, 0.1, 0.08)), f'shin_{s}', 'boots')                              # boot
        if kit == 'hockey':
            P.add(_Parts.box((0.07, y, -0.0), (0.3, 0.012, 0.035)), f'shin_{s}', 'metal')                       # skate blade
    # ---- team accents (mask channel B = secondary colour): sleeve bands, pants stripe / sock bands, helmet stripe ----
    if kit != 'ref':
        for s, y in (('F', -SH_HALF), ('B', SH_HALF)):
            zb = SH_Z - 0.04 - UPPER * (0.62 if kit != 'baseball' else 0.9)
            P.add(_Parts.limb((0, y, zb), (0, y, zb - 0.045), 0.067 * k, 0.065 * k, 8), f'upper_{s}', 'accent')                 # sleeve / cuff band
        for s, y in (('F', -HIP_HALF), ('B', HIP_HALF)):
            side = -1 if s == 'F' else 1
            if kit == 'football':
                P.add(_Parts.box((0, y + side * 0.1 * k, HIP_Z - THIGH * 0.5), (0.035, 0.012, THIGH * 0.86)), f'thigh_{s}', 'jersey')   # pants stripe in the jersey colour
            else:
                zs = 0.30 if kit != 'baseball' else 0.34
                P.add(_Parts.limb((0, y, zs), (0, y, zs - 0.05), 0.079 * k, 0.074 * k, 8), f'shin_{s}', 'accent')               # sock band
        if kit in ('hockey', 'goalie'):
            P.add(_Parts.torso(HIP_Z - 0.125, HIP_Z - 0.07, ww * 1.25, ww * 1.25, 0.29 * k, 0.29 * k), 'spine', 'accent')    # sweater hem band
    # ---- kit ----
    if kit == 'ref':
        P.add(_Parts.ball((0, 0, HEAD_Z + 0.04), 0.122, 1.0, 0.95, 0.7, 1), 'head', 'helmet'); P.add(_Parts.box((0.13, 0, HEAD_Z + 0.03), (0.1, 0.17, 0.012)), 'head', 'helmet')
    elif kit == 'football':
        for s, y in (('F', -1), ('B', 1)):                                                                        # shoulder pads
            P.add(_Parts.ball((0, y * (SH_HALF + 0.02), SH_Z - 0.01), 0.1, 0.95, 1.15 * k, 0.7, 1), 'spine', 'jersey')
        P.add(_Parts.ball((0, 0, HEAD_Z + 0.015), 0.135, 1.1, 1.0, 1.05, 1), 'head', 'helmet')                    # helmet shell
        for dz in (-0.045, -0.005, 0.035):                                                                        # facemask bars
            P.add(_Parts.box((0.13, 0, HEAD_Z + dz), (0.015, 0.2, 0.012)), 'head', 'metal')
        P.add(_Parts.box((0.135, 0, HEAD_Z - 0.01), (0.015, 0.012, 0.1)), 'head', 'metal')
        P.add(_Parts.box((0.0, 0, HEAD_Z + 0.128), (0.24, 0.035, 0.026)), 'head', 'accent')                          # helmet centre stripe
    elif kit in ('hockey', 'goalie'):
        P.add(_Parts.torso(HIP_Z - 0.12, SH_Z + 0.01, sw * 1.12, ww * 1.2, 0.3 * k, 0.28 * k), 'spine', 'jersey')   # loose sweater
        P.add(_Parts.ball((0, 0, HEAD_Z + 0.02), 0.128, 1.0, 0.95, 0.95, 1), 'head', 'helmet')
        P.add(_Parts.box((0.0, 0, HEAD_Z - 0.035), (0.25, 0.2, 0.012)), 'head', 'dark')
        if kit == 'goalie':   # mask cage, bulky leg pads, chest protector, blocker (front hand) and catcher (back hand)
            for dz in (-0.05, 0.0, 0.05): P.add(_Parts.box((0.13, 0, HEAD_Z + dz), (0.015, 0.2, 0.012)), 'head', 'metal')
            P.add(_Parts.torso(HIP_Z - 0.02, SH_Z + 0.02, sw * 1.2, ww * 1.35, 0.36 * k, 0.32 * k), 'spine', 'trim')
            for s, y in (('F', -HIP_HALF), ('B', HIP_HALF)): P.add(_Parts.box((0.03, y, 0.28), (0.2, 0.17, 0.62)), f'shin_{s}', 'trim')
            P.add(_Parts.box((0.07, -SH_HALF, SH_Z - 0.04 - UPPER - FORE - 0.06), (0.1, 0.24, 0.3)), 'fore_F', 'dark')
            P.add(_Parts.ball((0.0, SH_HALF, SH_Z - 0.04 - UPPER - FORE - 0.06), 0.1, 0.55, 1.0, 1.0, 1), 'fore_B', 'trim')
    elif kit == 'baseball':
        P.add(_Parts.ball((0, 0, HEAD_Z + 0.04), 0.122, 1.0, 0.95, 0.7, 1), 'head', 'helmet')                     # cap crown
        P.add(_Parts.box((0.13, 0, HEAD_Z + 0.03), (0.1, 0.17, 0.012)), 'head', 'helmet')                         # brim
        P.add(_Parts.ball((0.0, SH_HALF, SH_Z - 0.04 - UPPER - FORE - 0.04), 0.075, 0.8, 0.5, 1.0, 1), 'fore_B', 'trim')   # glove
    obj, mats = P.bake('asu_athlete')
    for name, idx in sorted(mats.items(), key=lambda kv: kv[1]): obj.data.materials.append(bpy.data.materials[f'asu_{name}'])
    rig = _armature()
    obj.parent = rig; mod = obj.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
    # smooth shading on organic parts only would need per-face data; flat shading keeps the low-poly look and the glTF clean
    # ---- optional prop (hockey stick / bat) attached to the front hand ----
    prop = None
    if with_prop and kit in ('hockey', 'goalie', 'baseball'):
        hand = Vector((0, -SH_HALF, SH_Z - 0.04 - UPPER - FORE - 0.04))
        if kit in ('hockey', 'goalie'):   # shaft along the forearm direction (down in the rest pose), blade pointing forward at the end
            Ls = 1.25 if kit == 'hockey' else 1.1
            parts = [_Parts.limb(hand, hand + Vector((0, 0, -Ls)), 0.016, 0.016, 6), _Parts.box(hand + Vector((0.12, 0, -Ls + 0.03)), (0.3, 0.02, 0.07))]
        else:                 # bat: thin grip at the hand, barrel at the far end, along the forearm direction
            parts = [_Parts.limb(hand, hand + Vector((0, 0, -0.86)), 0.016, 0.034, 8)]
        bm = bmesh.new()
        for part in parts:
            tmp = bpy.data.meshes.new('tmp'); part.to_mesh(tmp); part.free(); bm.from_mesh(tmp); bpy.data.meshes.remove(tmp)
        pm = bpy.data.meshes.new('asu_prop'); bm.to_mesh(pm); bm.free()
        prop = bpy.data.objects.new('asu_prop', pm); bpy.context.collection.objects.link(prop)
        pm.materials.append(bpy.data.materials['asu_metal'] if kit in ('hockey', 'goalie') else bpy.data.materials['asu_trim'])
        prop.parent = rig; prop.parent_type = 'BONE'; prop.parent_bone = 'fore_F'
        # BONE parenting is relative to the bone TAIL: cancel it so the prop keeps the world-space coordinates above (rest pose)
        prop.matrix_parent_inverse = (rig.matrix_world @ Matrix.Translation(rig.data.bones['fore_F'].tail_local)).inverted()
    return obj, rig, prop


def triangle_count(obj):
    mesh = obj.data; return sum(max(1, len(p.vertices) - 2) for p in mesh.polygons)
