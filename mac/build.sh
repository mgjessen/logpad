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
printf 'APPL????' > "$app/Contents/PkgInfo"
sed -E 's/(styles\.css|app\.js)\?v=[0-9]+/\1/g' "$root/index.html" > "$app/Contents/Resources/index.html"
cp "$root/styles.css" "$root/app.js" "$root/icon.png" "$app/Contents/Resources/"

work="$(mktemp -d)"
swiftc -O -o "$work/stamp-icon" "$root/mac/stamp-icon.swift" -framework Cocoa
"$work/stamp-icon" "$root/icon.png" "$work/icon.png"

iconset="$work/AppIcon.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$work/icon.png" --out "$iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$work/icon.png" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$app/Contents/Resources/AppIcon.icns"

codesign --force --sign - "$app"
"$work/stamp-icon" "$root/icon.png" "$work/icon.png" "$app"
rm -rf "$work"

lsregister="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [[ -x "$lsregister" ]]; then
  "$lsregister" -f "$app"
fi

echo "Built $app"
