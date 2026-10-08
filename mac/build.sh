#!/bin/bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
app="$root/LogPad.app"

rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"

swiftc -O -o "$app/Contents/MacOS/LogPad" "$root/mac/main.swift" \
  -framework Cocoa \
  -framework WebKit

cp "$root/mac/Info.plist" "$app/Contents/Info.plist"
sed -E 's/(styles\.css|app\.js)\?v=[0-9]+/\1/g' "$root/index.html" > "$app/Contents/Resources/index.html"
cp "$root/styles.css" "$root/app.js" "$root/icon.png" "$app/Contents/Resources/"

iconset="$(mktemp -d)/AppIcon.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$root/icon.png" --out "$iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$root/icon.png" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$app/Contents/Resources/AppIcon.icns"
rm -rf "$(dirname "$iconset")"

codesign --force --sign - "$app"

echo "Built $app"
