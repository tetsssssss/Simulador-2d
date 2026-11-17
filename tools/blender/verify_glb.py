"""Re-import an exported .glb and print what a game engine would see (meshes, triangles, bones, animations, bounds).
    blender --background --python tools/blender/verify_glb.py -- exports/anim/athlete_football.glb
Exit code 1 when the file has no armature/animations or the athlete is not ~1.8 m tall."""
import sys
import bpy
path = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']; arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
tris = sum(max(1, len(p.vertices) - 2) for o in meshes for p in o.data.polygons)
h = max((o.dimensions.z for o in meshes), default=0)   # glTF is Y-up; the importer converts back to Z-up
print(f'[verify] {path}: meshes={len(meshes)} tris={tris} armatures={len(arms)} bones={sum(len(a.data.bones) for a in arms)} actions={len(bpy.data.actions)} height={h:.2f} m')
sys.exit(0 if arms and bpy.data.actions and 1.6 < h < 2.1 else 1)
