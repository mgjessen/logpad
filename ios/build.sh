#!/bin/bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
app="$root/ios/build/LogPad.app"
sdk="$(xcrun --sdk iphonesimulator --show-sdk-path)"

rm -rf "$app"
mkdir -p "$app"

host="$(uname -m)"
if [[ "$host" == "arm64" ]]; then
  target="arm64-apple-ios17.0-simulator"
else
  target="x86_64-apple-ios17.0-simulator"
fi

xcrun --sdk iphonesimulator swiftc -O -parse-as-library \
  -target "$target" -sdk "$sdk" \
  -o "$app/LogPad" "$root/ios/LogPad.swift" \
  -framework UIKit \
  -framework WebKit \
  -framework UniformTypeIdentifiers

cp "$root/ios/Info.plist" "$app/Info.plist"
python3 - "$root/index.html" "$app/index.html" <<'PY'
import pathlib, re, sys
html = pathlib.Path(sys.argv[1]).read_text()
html = re.sub(r"(styles\.css|app\.js|goose-head\.png)\?v=[0-9]+", r"\1", html)
html = html.replace(
    "width=device-width, initial-scale=1.0",
    "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no",
)
html = html.replace(
    "</head>",
    "<style>.editor,textarea,input{font-size:16px}</style></head>",
)
pathlib.Path(sys.argv[2]).write_text(html)
PY
cp "$root/styles.css" "$root/app.js" "$root/icon.png" "$root/goose-head.png" "$app/"

work="$(mktemp -d)"
python3 - "$root/icon.png" "$work/AppIcon.png" <<'PY'
import struct, sys, zlib, pathlib

def read_png(path):
    data = pathlib.Path(path).read_bytes()
    pos = 8
    width = height = None
    idat = b""
    while pos < len(data):
        ln = struct.unpack(">I", data[pos:pos + 4])[0]
        typ = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + ln]
        if typ == b"IHDR":
            width, height = struct.unpack(">II", chunk[:8])
        elif typ == b"IDAT":
            idat += chunk
        elif typ == b"IEND":
            break
        pos += 12 + ln
    raw = zlib.decompress(idat)
    rows = []
    i = 0
    stride = width * 4
    prev = bytearray(stride)

    def paeth(a, b, c):
        p = a + b - c
        pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
        if pa <= pb and pa <= pc:
            return a
        if pb <= pc:
            return b
        return c

    for _y in range(height):
        f = raw[i]
        i += 1
        row = bytearray(raw[i:i + stride])
        i += stride
        if f == 1:
            for x in range(stride):
                left = row[x - 4] if x >= 4 else 0
                row[x] = (row[x] + left) & 255
        elif f == 2:
            for x in range(stride):
                row[x] = (row[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                left = row[x - 4] if x >= 4 else 0
                row[x] = (row[x] + ((left + prev[x]) // 2)) & 255
        elif f == 4:
            for x in range(stride):
                a = row[x - 4] if x >= 4 else 0
                b = prev[x]
                c = prev[x - 4] if x >= 4 else 0
                row[x] = (row[x] + paeth(a, b, c)) & 255
        rows.append(row)
        prev = row
    return width, height, rows

def write_png(path, width, height, rows):
    def chunk(tag, payload):
        return struct.pack(">I", len(payload)) + tag + payload + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw += rows[y][:stride]
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    pathlib.Path(path).write_bytes(png)

width, height, rows = read_png(sys.argv[1])
for y, row in enumerate(rows):
    # Same yellow gradient as the drawn icon, behind any transparent corner.
    t = y / max(height - 1, 1)
    br = round(255 + (230 - 255) * t)
    bg = round(208 + (161 - 208) * t)
    bb = 0
    for x in range(width):
        i = x * 4
        a = row[i + 3]
        if a == 255:
            continue
        row[i] = (row[i] * a + br * (255 - a)) // 255
        row[i + 1] = (row[i + 1] * a + bg * (255 - a)) // 255
        row[i + 2] = (row[i + 2] * a + bb * (255 - a)) // 255
        row[i + 3] = 255
write_png(sys.argv[2], width, height, rows)
PY

sips -z 120 120 "$work/AppIcon.png" --out "$app/AppIcon60x60@2x.png" >/dev/null
sips -z 180 180 "$work/AppIcon.png" --out "$app/AppIcon60x60@3x.png" >/dev/null
cp "$work/AppIcon.png" "$app/AppIcon1024.png"
rm -rf "$work"

codesign --force --sign - "$app"
echo "Built $app"
