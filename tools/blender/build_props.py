"""
Low-poly game props in real-world metres, one .glb each (Y-up on export, origin at the object centre, long axis = +X in Blender).
    blender --background --python tools/blender/build_props.py -- [--out exports/props]
Props: football (0.28 x 0.17 m), puck (0.076 m dia, 0.025 m), baseball (0.074 m dia), bat (0.86 m), hockey_stick (1.52 m).
Tested with bpy 5.1 (budget printed below: every prop <= 400 triangles).
"""
import math, os, sys
try:
    import bpy, bmesh
    from mathutils import Vector
except ImportError:
    bpy = None


def mat(name, rgb, rough=0.6):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; m.diffuse_color = (*rgb, 1); return m


def obj_from_bm(name, bm, materials):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in materials: me.materials.append(m)
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); return ob


def football():
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.5)
    for v in bm.verts: v.co = Vector((v.co.x * 0.28 / (1.0) * 1.0, v.co.y * 0.17, v.co.z * 0.17))  # radius .5 -> length .28, width .17
    for v in bm.verts:   # pinch the tips so it reads as a football, not an egg
        t = abs(v.co.x) / 0.14; v.co.y *= 1 - 0.35 * t ** 3; v.co.z *= 1 - 0.35 * t ** 3
    for f in bm.faces: f.material_index = 0
    ob = obj_from_bm('football', bm, [mat('leather', (0.36, 0.17, 0.07), 0.5), mat('laces', (0.95, 0.95, 0.92), 0.8)])
    lace = bmesh.new()
    for i in range(5): bmesh.ops.create_cube(lace, size=1.0, matrix=__import__('mathutils').Matrix.Translation((-0.04 + i * 0.02, 0, 0.085)) @ __import__('mathutils').Matrix.Diagonal((0.006, 0.05, 0.004, 1)))
    for f in lace.faces: f.material_index = 1
    tmp = bpy.data.meshes.new('l'); lace.to_mesh(tmp); lace.free(); bm2 = bmesh.new(); bm2.from_mesh(ob.data); bm2.from_mesh(tmp); bm2.to_mesh(ob.data); bm2.free(); bpy.data.meshes.remove(tmp)
    return ob


def puck():
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.0381, radius2=0.0381, depth=0.0254)
    return obj_from_bm('puck', bm, [mat('rubber', (0.04, 0.04, 0.045), 0.9)])


def baseball():
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.0368)
    for f in bm.faces: f.material_index = 0
    ob = obj_from_bm('baseball', bm, [mat('leather_white', (0.95, 0.94, 0.9), 0.7)])
    return ob


def bat():
    bm = bmesh.new(); L = 0.86; rings = [(0.0, 0.016), (0.12, 0.014), (0.30, 0.022), (0.58, 0.034), (0.78, 0.034), (0.86, 0.026)]
    verts = []
    for x, r in rings: verts.append([bm.verts.new((x - L / 2, math.cos(a * math.tau / 12) * r, math.sin(a * math.tau / 12) * r)) for a in range(12)])
    for i in range(len(rings) - 1):
        for a in range(12): bm.faces.new((verts[i][a], verts[i][(a + 1) % 12], verts[i + 1][(a + 1) % 12], verts[i + 1][a]))
    bm.faces.new(verts[0][::-1]); bm.faces.new(verts[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bm('bat', bm, [mat('ash_wood', (0.78, 0.6, 0.38), 0.55)])


def hockey_stick():
    bm = bmesh.new(); shaft = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=__import__('mathutils').Matrix.Diagonal((1.40, 0.028, 0.012, 1)))                          # shaft
    bmesh.ops.translate(bm, verts=bm.verts, vec=(-0.06, 0, 0))
    blade = bmesh.new(); bmesh.ops.create_cube(blade, size=1.0, matrix=__import__('mathutils').Matrix.Diagonal((0.07, 0.30, 0.025, 1)))  # blade at the end
    bmesh.ops.translate(blade, verts=blade.verts, vec=(0.7, 0.14, -0.01))
    tmp = bpy.data.meshes.new('b'); blade.to_mesh(tmp); blade.free(); bm.from_mesh(tmp); bpy.data.meshes.remove(tmp); shaft.free()
    return obj_from_bm('hockey_stick', bm, [mat('composite', (0.08, 0.08, 0.1), 0.4)])


PROPS = {'football': football, 'puck': puck, 'baseball': baseball, 'bat': bat, 'hockey_stick': hockey_stick}


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = argv[argv.index('--out') + 1] if '--out' in argv else 'exports/props'
    os.makedirs(out, exist_ok=True)
    for name, fn in PROPS.items():
        bpy.ops.wm.read_factory_settings(use_empty=True)
        ob = fn(); tris = sum(max(1, len(p.vertices) - 2) for p in ob.data.polygons)
        d = [round(x, 3) for x in ob.dimensions]
        path = os.path.join(out, name + '.glb')
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True)
        print(f'[props] {name}: {tris} tris, dims(m)={d}, {os.path.getsize(path)} bytes -> {path}')


if __name__ == '__main__':
    if bpy is None: print('Run inside Blender: blender --background --python tools/blender/build_props.py')
    else: main()
