#!/usr/bin/env bash
# Thin wrapper kept for compatibility: the real builder is tools/blender/make_atlas.py (paged atlases, 5 directions, 6 kits).
exec python3 "$(dirname "$0")/make_atlas.py" "$@"
