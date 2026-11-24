"""
HD athlete built from scratch (no external mesh): smooth anatomical shapes lofted from cross-sections, a real face (eyes, brows, nose, mouth, ears) in geometry,
helmet with a face-mask, pads, gloves, boots / skates. Same contract as athlete_model.build_athlete:

    obj, rig, prop = build_athlete_hd(kit='football', colors={...}, build=1, skin=1, with_prop=True)

* Same armature (hips, spine, head, upper_F/B, fore_F/B, thigh_F/B, shin_F/B), same 1.80 m size, +X forward, Z up, same material names asu_jersey / pants /
  skin / boots / helmet / trim / accent / dark / metal -> the game's team-colour zones and the 147 clips work unchanged.
* Smooth shading; body parts are skinned by proximity to the bone segments (soft joints), helmet / face / pads are rigid on their bone.
* UV-mapped (smart project) so a detail texture can be added; the number / name decals are runtime quads (core/render3d/decals.js).
* Budget ~10-14k triangles per athlete (measured by triangle_count).
"""
import math
import bpy
import bmesh
from mathutils import Vector

import athlete_model as AM
from athlete_model import _material, _armature, SKINS, HIP_Z, SH_Z, HEAD_Z, THIGH, SHIN, UPPER, FORE, SH_HALF, HIP_HALF


class Parts:
    def __init__(self): self.items = []          # (bmesh, bone, material, soft)
    def add(self, bm, bone, mat, soft=False): self.items.append((bm, bone, mat, soft))


DENSIFY = 2   # extra smooth cross-sections between each pair of rings of a loft (Catmull-Rom): rounder silhouettes for ~2x the triangles of the lofted parts


def _dense(rings, sub):
    """Insert `sub-1` Catmull-Rom interpolated rings between the given ones (only when there are 4+ rings: short lofts are deliberate bands / cylinders)."""
    if sub <= 1 or len(rings) < 4: return list(rings)
    out = []; n = len(rings)
    for i in range(n - 1):
        p0, p1, p2, p3 = rings[max(i - 1, 0)], rings[i], rings[i + 1], rings[min(i + 2, n - 1)]
        for t in [j / sub for j in range(sub)]:
            out.append(tuple(0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3) for a, b, c, d in zip(p0, p1, p2, p3)))
    out.append(tuple(rings[-1])); return out


def loft_z(rings, seg=16, caps=(True, True)):
    """Vertical loft. rings: [(z, cx, cy, rx, ry)] -> elliptical cross-sections (x radius rx, y radius ry) stacked along z."""
    bm = bmesh.new(); rs = []
    for (z, cx, cy, rx, ry) in _dense(rings, DENSIFY):
        rs.append([bm.verts.new((cx + math.cos(a * math.tau / seg) * rx, cy + math.sin(a * math.tau / seg) * ry, z)) for a in range(seg)])
    for i in range(len(rs) - 1):
        for a in range(seg): bm.faces.new((rs[i][a], rs[i][(a + 1) % seg], rs[i + 1][(a + 1) % seg], rs[i + 1][a]))
    if caps[0]: bm.faces.new(rs[0][::-1])
    if caps[1]: bm.faces.new(rs[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); return bm


def loft_x(rings, seg=12):
    """Loft along +X (boots / forearm props). rings: [(x, cy, cz, ry, rz)]."""
    bm = bmesh.new(); rs = []
    for (x, cy, cz, ry, rz) in _dense(rings, DENSIFY):
        rs.append([bm.verts.new((x, cy + math.cos(a * math.tau / seg) * ry, cz + math.sin(a * math.tau / seg) * rz)) for a in range(seg)])
    for i in range(len(rs) - 1):
        for a in range(seg): bm.faces.new((rs[i][a], rs[i][(a + 1) % seg], rs[i + 1][(a + 1) % seg], rs[i + 1][a]))
    bm.faces.new(rs[0][::-1]); bm.faces.new(rs[-1]); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); return bm


def ball(c, r, sx=1.0, sy=1.0, sz=1.0, sub=2):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in bm.verts: v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz)) + Vector(c)
    return bm


def uvball(c, r, sx=1.0, sy=1.0, sz=1.0, seg=28, rings=18):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    for v in bm.verts: v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz)) + Vector(c)
    return bm


def split_faces(bm, pred, lift=1.02):
    """Copy the faces matching pred(centre) into a NEW bmesh (slightly lifted off the surface: a stripe painted on the shell). The original keeps them."""
    out = bmesh.new(); vm = {}
    for f in bm.faces:
        if not pred(f.calc_center_median()): continue
        vs = []
        for v in f.verts:
            if v not in vm: vm[v] = out.verts.new(v.co * lift)
            vs.append(vm[v])
        out.faces.new(vs)
    bmesh.ops.recalc_face_normals(out, faces=out.faces); return out


def tube(p0, p1, r, seg=6):
    p0, p1 = Vector(p0), Vector(p1); d = p1 - p0
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=d.length)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=d.to_track_quat('Z', 'Y').to_matrix()); bmesh.ops.translate(bm, verts=bm.verts, vec=(p0 + p1) / 2); return bm


def cut_front(bm, c, ry, rz, x_min=0.0):
    """Delete the shell faces inside an ELLIPSE (half-width ry, half-height rz) centred at c=(y,z) on the front (x > x_min): a clean face opening."""
    bm.faces.ensure_lookup_table(); kill = []
    for f in bm.faces:
        m = f.calc_center_median()
        if m.x > x_min and ((m.y - c[0]) / ry) ** 2 + ((m.z - c[1]) / rz) ** 2 < 1.0: kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.edges.ensure_lookup_table()
    for v in {v for e in bm.edges if len(e.link_faces) == 1 for v in e.verts}:      # boundary vertices -> exactly on the ellipse (a smooth edge instead of stair steps)
        p, q = (v.co.y - c[0]) / ry, (v.co.z - c[1]) / rz; r = math.hypot(p, q)
        if r > 1e-6: v.co.y = c[0] + p / r * ry; v.co.z = c[1] + q / r * rz


def _seg_dist(p, a, b):
    ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.dot(ab)))); return (p - (a + ab * t)).length


def bake(parts, name='asu_athlete'):
    mesh = bpy.data.meshes.new(name); obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj)
    bm = bmesh.new(); mats = {}; vinfo = []                       # per vertex: (bone, soft)
    for pbm, bone, mat, soft in parts.items:
        idx = mats.setdefault(mat, len(mats)); vmap = {}
        for v in pbm.verts: vmap[v] = bm.verts.new(v.co); vinfo.append((bone, soft))
        bm.verts.ensure_lookup_table()
        for f in pbm.faces:
            try: nf = bm.faces.new([vmap[v] for v in f.verts])
            except ValueError: continue
            nf.material_index = idx; nf.smooth = True
        pbm.free()
    bm.verts.index_update(); bm.to_mesh(mesh); bm.free()
    return obj, mats, vinfo


def skin_mesh(obj, rig, vinfo, power=5.0):
    bones = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in rig.data.bones}; groups = {n: obj.vertex_groups.new(name=n) for n in bones}
    for v in obj.data.vertices:
        bone, soft = vinfo[v.index]
        if not soft: groups[bone].add([v.index], 1.0, 'REPLACE'); continue
        allow = soft if isinstance(soft, (tuple, list, set)) else None
        if allow is None and bone.startswith(('upper_', 'fore_')): allow = ('spine', f'upper_{bone[-1]}', f'fore_{bone[-1]}')       # a limb only blends with its own chain: no flips between overlapping surfaces ("fur" at knees / cuffs)
        elif allow is None and bone.startswith(('thigh_', 'shin_')): allow = ('hips', f'thigh_{bone[-1]}', f'shin_{bone[-1]}')   # soft may name the bones this part is allowed to blend between (stops left/right-leg flips at the hem)
        ds = sorted(((_seg_dist(v.co, a, b), n) for n, (a, b) in bones.items() if allow is None or n in allow), key=lambda t: t[0])[:2]
        ws = [1.0 / max(1e-4, d) ** power for d, _ in ds]; tot = sum(ws)
        for (d, n), w in zip(ds, ws):
            if w / tot > 0.02: groups[n].add([v.index], w / tot, 'REPLACE')
    mod = obj.modifiers.new('Armature', 'ARMATURE'); mod.object = rig; obj.parent = rig


def build_athlete_hd(kit='football', colors=None, build=1, skin_i=1, with_prop=True, skin=None):
    skin_i = skin if skin is not None else skin_i
    c = {'jersey': (0.04, 0.16, 0.44), 'pants': (0.92, 0.92, 0.95), 'helmet': (0.92, 0.92, 0.95), 'trim': (0.95, 0.95, 0.95), 'boots': (0.07, 0.07, 0.08)}; c.update(colors or {})
    if kit == 'ref': c.update(jersey=(0.96, 0.96, 0.96), pants=(0.06, 0.06, 0.07), helmet=(0.05, 0.05, 0.06), trim=(0.96, 0.96, 0.96), boots=(0.04, 0.04, 0.05), accent=(0.05, 0.05, 0.06))   # fixed uniform: black cap / pants, white shirt
    k = {0: 0.92, 1: 1.0, 2: 1.14}[build]; sk = SKINS[skin_i % len(SKINS)]
    M = lambda n, rgb, rough=0.7: _material(f'asu_{n}', rgb, rough)
    for n, rgb in (('jersey', c['jersey']), ('pants', c['pants']), ('skin', sk), ('boots', c['boots']), ('helmet', c['helmet']), ('trim', c['trim'])): M(n, rgb)
    M('bat', (0.62, 0.45, 0.24), 0.55); M('leather', (0.36, 0.2, 0.1), 0.6); M('dark', (0.05, 0.05, 0.06)); M('metal', (0.65, 0.68, 0.72), 0.35); M('accent', c.get('accent', (0.95, 0.95, 0.95)))
    P = Parts(); hock = kit in ('hockey', 'goalie'); fb = kit == 'football'; bb = kit == 'baseball'
    # ---- torso (jersey): hips -> shoulders, V taper; hockey sweater is looser and longer ----
    loose = 1.12 if hock else 1.0; low = HIP_Z - (0.12 if hock else 0.06)
    torso = loft_z([(low, 0, 0, 0.14 * k * loose, 0.2 * k * loose), (HIP_Z + 0.14, 0, 0, 0.128 * k * loose, 0.19 * k * loose), (HIP_Z + 0.30, 0, 0, 0.13 * k, 0.19 * k), (SH_Z - 0.14, 0, 0, 0.145 * k, 0.215 * k), (SH_Z - 0.04, 0, 0, 0.14 * k, 0.225 * k), (SH_Z + 0.02, 0, 0, 0.1 * k, 0.17 * k)], 20, (True, True))
    P.add(torso, 'spine', 'jersey', ('spine', 'hips'))
    if kit == 'ref':   # vertical black stripes (the classic referee shirt): copies of the torso faces in alternating bands across the body, lifted off the surface
        P.add(split_faces(torso, lambda q: q.z > HIP_Z - 0.02 and int((q.y + 1.0) / 0.052) % 2 == 0, 1.012), 'spine', 'dark', ('spine', 'hips'))
    # ---- pelvis + legs (pants), knees, socks / shins, boots ----
    P.add(loft_z([(HIP_Z + 0.04, 0, 0, 0.12 * k, 0.19 * k), (HIP_Z - 0.10, 0, 0, 0.125 * k, 0.2 * k)], 20, (False, False)), 'hips', 'pants', ('hips', 'thigh_F', 'thigh_B', 'spine'))
    for s, y in (('F', -HIP_HALF), ('B', HIP_HALF)):
        P.add(loft_z([(HIP_Z - 0.04, 0, y * 0.97, 0.112 * k, 0.1 * k), (HIP_Z - 0.20, 0, y, 0.105 * k, 0.098 * k), (HIP_Z - THIGH, 0, y, 0.078 * k, 0.074 * k)], 14, (False, False)), f'thigh_{s}', 'pants', ('hips', f'thigh_{s}', f'shin_{s}'))
        P.add(ball((0.01, y, HIP_Z - THIGH), 0.09 * k, 1.0, 0.95, 1.0, 2), f'shin_{s}', 'pants', True)
        P.add(loft_z([(HIP_Z - THIGH, 0, y, 0.074 * k, 0.07 * k), (0.34, 0, y, 0.062 * k, 0.058 * k), (0.12, 0, y, 0.05, 0.05)], 14, (False, False)), f'shin_{s}', 'pants' if hock else 'trim', True)
        P.add(loft_x([(-0.07, y, 0.07, 0.045, 0.06), (0.02, y, 0.05, 0.052, 0.05), (0.12, y, 0.04, 0.05, 0.04), (0.2, y, 0.03, 0.04, 0.028)], 12), f'shin_{s}', 'boots', True)
        if hock: P.add(tube((-0.05, y, -0.0), (0.2, y, 0.0), 0.008, 4), f'shin_{s}', 'metal')
        sg = -1 if s == 'F' else 1
        if fb: P.add(loft_z([(HIP_Z - 0.06, 0, y + sg * 0.1 * k, 0.03, 0.012), (HIP_Z - THIGH * 0.9, 0, y + sg * 0.085 * k, 0.025, 0.012)], 6, (True, True)), f'thigh_{s}', 'jersey')   # pants stripe
        zs = 0.30
        P.add(loft_z([(zs, 0, y, 0.066 * k, 0.062 * k), (zs - 0.05, 0, y, 0.064 * k, 0.06 * k)], 14, (False, False)), f'shin_{s}', 'accent', True)      # sock band
    # ---- arms: sleeve (jersey), bare forearm (skin) + gloves ----
    for s, y in (('F', -SH_HALF), ('B', SH_HALF)):
        z0 = SH_Z - 0.04; z1 = z0 - UPPER; z2 = z1 - FORE; sg = -1 if s == 'F' else 1
        P.add(loft_z([(z0 + 0.02, 0, y, 0.07 * k, 0.07 * k), (z0 - 0.12, 0, y, 0.066 * k, 0.064 * k), (z1, 0, y, 0.056 * k, 0.054 * k)], 14, (False, False)), f'upper_{s}', 'jersey', True)
        P.add(loft_z([(z0 - 0.17, 0, y, 0.069 * k, 0.067 * k), (z0 - 0.21, 0, y, 0.068 * k, 0.066 * k)], 14, (False, False)), f'upper_{s}', 'accent', True)          # sleeve band
        P.add(ball((0, y, z1), 0.062 * k, 1, 1, 1, 2), f'fore_{s}', 'skin', True)   # slightly bigger than the sleeve rim: a crisp seam instead of z-fighting "fuzz"
        P.add(loft_z([(z1, 0, y, 0.052 * k, 0.05 * k), (z1 - 0.12, 0, y, 0.048 * k, 0.046 * k), (z2, 0, y, 0.038, 0.036)], 12, (False, False)), f'fore_{s}', 'skin', True)
        P.add(ball((0.005, y, z2 - 0.045), 0.05, 0.9, 0.75, 1.15, 2), f'fore_{s}', 'trim' if (fb or hock) else ('leather' if (bb and s == 'B') else 'skin'), True)                  # hand / glove (baseball: leather glove on the far hand)
    # ---- neck + head (skin) with a geometric face ----
    P.add(loft_z([(SH_Z - 0.02, 0, 0, 0.065 * k, 0.07 * k), (SH_Z + 0.10, 0, 0, 0.055 * k, 0.057 * k)], 12, (False, False)), 'head', 'skin', True)
    hz = HEAD_Z; P.add(uvball((0.0, 0, hz), 0.113, 1.0, 0.9, 1.12, 24, 16), 'head', 'skin')
    for sgn in (-1, 1):
        P.add(ball((0.10, sgn * 0.037, hz + 0.02), 0.014, 0.8, 1.2, 1.0, 1), 'head', 'trim')                  # eye white
        P.add(ball((0.111, sgn * 0.037, hz + 0.02), 0.0075, 0.6, 1.0, 1.0, 1), 'head', 'dark')                 # pupil
        P.add(tube((0.106, sgn * 0.058, hz + 0.052), (0.106, sgn * 0.02, hz + 0.047), 0.004, 4), 'head', 'dark')  # brow
        P.add(ball((-0.005, sgn * 0.106, hz - 0.005), 0.026, 0.5, 0.28, 1.0, 1), 'head', 'skin')                # ear
    P.add(ball((0.112, 0, hz - 0.012), 0.017, 1.1, 0.8, 1.2, 1), 'head', 'skin')                                  # nose
    P.add(tube((0.104, -0.03, hz - 0.052), (0.104, 0.03, hz - 0.052), 0.0055, 4), 'head', 'dark')               # mouth
    # hockey stick: part of the skinned mesh, rigid on the front forearm (follows every pose; the shaft runs along the forearm like the low-poly prop did)
    if with_prop and hock:
        hy = -SH_HALF; hz0 = SH_Z - 0.04 - UPPER - FORE - 0.04; Ls = 1.25 if kit == 'hockey' else 1.1
        # shaft (slight taper toward the blade), butt-end grip tape, hosel and a CURVED blade with white tape
        P.add(loft_z([(hz0 + 0.05, 0, hy, 0.0175, 0.0135), (hz0 - 0.3, 0, hy, 0.0175, 0.0135), (hz0 - Ls + 0.1, 0, hy, 0.0155, 0.012), (hz0 - Ls, 0, hy, 0.0155, 0.012)], 8, (True, True)), 'fore_F', 'metal')
        P.add(loft_z([(hz0 + 0.052, 0, hy, 0.0195, 0.0155), (hz0 - 0.2, 0, hy, 0.0195, 0.0155)], 8, (True, True)), 'fore_F', 'dark')   # grip tape
        zb = hz0 - Ls + 0.035; xs = [0.0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.325]
        P.add(loft_x([(x, hy, zb + 0.016 * (x / 0.325) ** 2.2, 0.0095, 0.043 - 0.012 * (x / 0.325) ** 2) for x in xs], 8), 'fore_F', 'dark')            # blade (toe curls up and narrows)
        P.add(loft_x([(x, hy, zb + 0.016 * (x / 0.325) ** 2.2, 0.0105, 0.0445 - 0.012 * (x / 0.325) ** 2) for x in xs[1:6]], 8), 'fore_F', 'trim')      # tape wrap on the blade
        P.add(loft_z([(zb + 0.07, 0, hy, 0.0155, 0.012), (zb - 0.02, 0, hy, 0.022, 0.016)], 8, (True, True)), 'fore_F', 'dark')                         # hosel
    # ---- baseball: cap with a brim, leather glove, belt; the BAT is its own material (asu_bat) so the game can show it on the batter only ----
    if bb or kit == 'ref':
        cap = uvball((-0.008, 0, hz + 0.02), 0.123, 1.02, 0.98, 1.0, 40, 26); bmesh.ops.delete(cap, geom=[f for f in cap.faces if f.calc_center_median().z < (hz + 0.068 if f.calc_center_median().x > 0.02 else hz - 0.005)], context='FACES'); P.add(cap, 'head', 'helmet')
        P.add(ball((0.118, 0, hz + 0.07), 0.1, 0.9, 1.0, 0.1, 3), 'head', 'helmet')                                   # brim
        P.add(ball((-0.008, 0, hz + 0.158), 0.016, 1, 1, 0.8, 1), 'head', 'accent')                                    # cap button
    if bb:
        P.add(ball((0.01, SH_HALF, SH_Z - 0.04 - UPPER - FORE - 0.06), 0.085, 0.65, 1.0, 1.05, 3), 'fore_B', 'leather')   # glove
        P.add(loft_z([(HIP_Z + 0.05, 0, 0, 0.1305 * k, 0.1945 * k), (HIP_Z + 0.02, 0, 0, 0.1305 * k, 0.1945 * k)], 20, (False, False)), 'spine', 'dark', ('spine', 'hips'))   # belt
        bz = SH_Z - 0.04 - UPPER - FORE - 0.04
        bat_r = [(0.05, 0.008), (0.04, 0.021), (0.02, 0.022), (0.005, 0.0145), (-0.2, 0.0155), (-0.45, 0.025), (-0.62, 0.033), (-0.80, 0.036), (-0.87, 0.034), (-0.885, 0.02), (-0.89, 0.006)]   # knob, handle, flared barrel, rounded end
        P.add(loft_z([(bz + dz, 0, -SH_HALF, r, r) for dz, r in bat_r], 14, (True, True)), 'fore_F', 'bat')
    # ---- kit ----
    if fb:
        for sg in (-1, 1): P.add(ball((0, sg * (SH_HALF + 0.015), SH_Z - 0.005), 0.1, 1.0, 1.35 * k, 0.72, 3), 'spine', 'jersey')   # shoulder pads
        sh = uvball((-0.012, 0, hz + 0.012), 0.141, 1.08, 1.0, 1.06, 56, 36); cut_front(sh, (0.0, hz - 0.035), 0.098, 0.088, 0.03); stripe = split_faces(sh, lambda m: abs(m.y) < 0.016 and m.z > hz + 0.07 and m.x < 0.11); P.add(sh, 'head', 'helmet'); P.add(stripe, 'head', 'accent')   # shell with the face opening
        for dz in (0.035, 0.0, -0.04): P.add(tube((0.145, -0.085, hz + dz), (0.145, 0.085, hz + dz), 0.0075, 6), 'head', 'metal')
        for sgn in (-1, 1):
            P.add(tube((0.135, sgn * 0.09, hz + 0.05), (0.15, sgn * 0.03, hz - 0.075), 0.0075, 6), 'head', 'metal'); P.add(tube((0.15, sgn * 0.03, hz - 0.075), (0.13, sgn * 0.0, hz - 0.1), 0.0075, 6), 'head', 'metal')
        P.add(tube((0.15, 0, hz + 0.045), (0.15, 0, hz - 0.085), 0.0075, 6), 'head', 'metal')
    elif hock:
        P.add(loft_z([(HIP_Z - 0.118, 0, 0, 0.1595 * k, 0.2275 * k), (HIP_Z - 0.075, 0, 0, 0.1575 * k, 0.2245 * k)], 20, (False, False)), 'spine', 'accent', ('spine', 'hips'))   # sweater hem band
        sh = uvball((-0.01, 0, hz + 0.02), 0.13, 1.03, 0.96, 0.96, 48, 32); cut_front(sh, (0.0, hz - 0.03), 0.09, 0.075, 0.03); P.add(sh, 'head', 'helmet')
        if kit == 'goalie':
            for dz in (0.04, 0.0, -0.04): P.add(tube((0.145, -0.085, hz + dz), (0.145, 0.085, hz + dz), 0.0075, 6), 'head', 'metal')
            # goalie gear: big leg pads (rigid on the shins, with straps), chest protector, blocker (stick hand) and catcher (glove hand)
            for sgn, y in (('F', -HIP_HALF), ('B', HIP_HALF)):
                P.add(loft_z([(0.56, 0.015, y, 0.068, 0.1), (0.46, 0.02, y, 0.08, 0.118), (0.26, 0.022, y, 0.088, 0.125), (0.09, 0.02, y, 0.078, 0.108), (0.04, 0.02, y, 0.07, 0.1)], 14, (True, True)), f'shin_{sgn}', 'trim')
                for zz in (0.46, 0.30, 0.16): P.add(loft_z([(zz + 0.012, 0.02, y, 0.0885, 0.1265), (zz - 0.012, 0.02, y, 0.0885, 0.1265)], 14, (False, False)), f'shin_{sgn}', 'accent')   # pad straps / stripes
            P.add(loft_z([(SH_Z - 0.42, 0, 0, 0.17 * k, 0.245 * k), (SH_Z - 0.2, 0, 0, 0.18 * k, 0.26 * k), (SH_Z - 0.04, 0, 0, 0.15 * k, 0.24 * k)], 20, (True, True)), 'spine', 'jersey')   # chest protector bulk
            zh = SH_Z - 0.04 - UPPER - FORE
            P.add(ball((0.045, -SH_HALF, zh - 0.07), 0.085, 0.3, 1.0, 1.15, 2), 'fore_F', 'dark')    # blocker (flat pad on the stick hand)
            P.add(ball((0.06, SH_HALF, zh - 0.07), 0.12, 0.45, 1.0, 1.15, 2), 'fore_B', 'leather')   # catcher (big glove)
    obj, mats, vinfo = bake(P)
    for name, idx in sorted(mats.items(), key=lambda kv: kv[1]): obj.data.materials.append(bpy.data.materials[f'asu_{name}'])
    rig = _armature(); skin_mesh(obj, rig, vinfo)
    # UVs (detail textures / future face paint): one smart-project pass
    bpy.context.view_layer.objects.active = obj; obj.select_set(True)
    try:
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.01); bpy.ops.object.mode_set(mode='OBJECT')
    except Exception as e: print('[asu] uv unwrap skipped:', e); bpy.ops.object.mode_set(mode='OBJECT')
    prop = None
    return obj, rig, prop
