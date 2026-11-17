#!/usr/bin/env bash
# Builds a sideloadable APK of the game WITHOUT the Android SDK / Gradle: only the Debian/Ubuntu packages
#   apt install aapt apksigner zipalign dalvik-exchange libandroid-23-java openjdk-21-jdk-headless
# Output: android/build/ASU2D-<version>.apk  (debug-signed with android/asu-debug.keystore: fine for sideloading; Play Store needs your own release key).
#   bash android/build_apk.sh
set -euo pipefail
cd "$(dirname "$0")/.."; ROOT=$PWD; B=$ROOT/android/build; SDKJAR=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
VER=$(grep -o 'versionName="[^"]*"' android/AndroidManifest.xml | cut -d'"' -f2)
rm -rf "$B"; mkdir -p "$B/classes" "$B/assets" "$B/res"
# 1. web files -> assets (only what the game needs at run time)
rsync -a --prune-empty-dirs \
  --include='*/' --include='index.html' --include='manifest.webmanifest' \
  --include='core/***' --include='nfl/***' --include='nhl/***' --include='mlb/***' --include='career/***' \
  --include='assets/icons/***' --include='assets/sprites/***' \
  --exclude='tests/***' --exclude='*.md' --exclude='*.bat' --exclude='package*.json' --exclude='*' ./ "$B/assets/"
# 2. launcher icons from assets/icons/icon-512.png
python3 - "$ROOT" "$B" <<'PY'
import sys, os
from PIL import Image
root, b = sys.argv[1:3]; src = Image.open(f'{root}/assets/icons/icon-512.png').convert('RGBA')
for d, px in (('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)):
    os.makedirs(f'{b}/res/mipmap-{d}', exist_ok=True); src.resize((px, px), Image.LANCZOS).save(f'{b}/res/mipmap-{d}/ic_launcher.png', optimize=True)
PY
cp -r android/res/values "$B/res/"
# 3. compile Java -> dex
find android/src -name '*.java' > "$B/sources.txt"
javac --release 8 -encoding UTF-8 -classpath "$SDKJAR" -d "$B/classes" @"$B/sources.txt" 2>&1 | grep -v "^Picked up\|^Note:" || true
dalvik-exchange --dex --min-sdk-version=23 --output="$B/classes.dex" "$B/classes" 2>&1 | grep -v "^Picked up" || true
# 4. package resources + assets, add the dex, align, sign
aapt package -f -M android/AndroidManifest.xml -S "$B/res" -A "$B/assets" -I "$SDKJAR" -0 webp --min-sdk-version 23 --target-sdk-version 30 -F "$B/unsigned.apk"
( cd "$B" && aapt add unsigned.apk classes.dex >/dev/null )
zipalign -f -p 4 "$B/unsigned.apk" "$B/aligned.apk"
KS=android/asu-debug.keystore
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias asu -keyalg RSA -keysize 2048 -validity 36500 -dname "CN=ASU 2D Debug, O=ASU, C=BR" 2>&1 | grep -v "^Picked up\|Warning\|^$" || true
OUT="$B/ASU2D-$VER.apk"
apksigner sign --ks "$KS" --ks-pass pass:android --key-pass pass:android --ks-key-alias asu --min-sdk-version 23 --out "$OUT" "$B/aligned.apk" 2>&1 | grep -v "^Picked up" || true
apksigner verify --verbose "$OUT" 2>&1 | grep -v "^Picked up" | head -5
ls -la "$OUT" | awk '{print $5, $9}'
