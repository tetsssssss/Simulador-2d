#!/usr/bin/env bash
# Build the game sprite atlases (assets/sprites/*) for football, hockey and baseball.
#   BLENDER="blender --background --python"   (default)   |   headless pip bpy:  BLENDER="xvfb-run -a python run_bpy.py"  (see docs/anim/BLENDER_NOTES.md)
# Usage: tools/blender/make_atlas.sh [kit ...]   (default: all kits). Needs: node (export_clips), Pillow (pack_atlas.py).
set -euo pipefail
cd "$(dirname "$0")/../.."
node tools/anim/export_clips.mjs >/dev/null
PLAN=tools/blender/atlas_plan.json; FR=$(python3 -c "import json;print(json.load(open('$PLAN'))['frame'])"); ST=$(python3 -c "import json;print(json.load(open('$PLAN'))['step'])"); AZ=$(python3 -c "import json;print(json.load(open('$PLAN'))['azimuth'])")
KITS=${@:-football hockey baseball}
OUT=exports/anim/atlas_frames
for kit in $KITS; do
  EXTRA=""; [ "$kit" = baseball ] && EXTRA="--no-prop"   # fielders/runners do not hold a bat in the atlas
  ONLY=$(python3 -c "import json;print(','.join(json.load(open('$PLAN'))['kits']['$kit']))")
  for layer in color mask; do
    rm -rf "$OUT/${kit}_$layer"
    ${BLENDER:-blender --background --python tools/blender/build_nfl_sprites.py} -- --kit "$kit" --layer "$layer" --size "$FR" --step "$ST" --azimuth "$AZ" --only "$ONLY" $EXTRA --out "$OUT/${kit}_$layer" > /dev/null
  done
  python3 tools/blender/pack_atlas.py "$kit" "$OUT" assets/sprites
done
