import AppKit

let input = CommandLine.arguments[1]
let output = CommandLine.arguments[2]

guard let image = NSImage(contentsOfFile: input),
      let tiff = image.tiffRepresentation,
      let source = NSBitmapImageRep(data: tiff)
else {
    fputs("Could not read icon\n", stderr)
    exit(1)
}

let width = source.pixelsWide
let height = source.pixelsHigh
guard let background = source.colorAt(x: 0, y: 0) else {
    fputs("Could not read icon background\n", stderr)
    exit(1)
}

func isMargin(_ x: Int, _ y: Int) -> Bool {
    guard let color = source.colorAt(x: x, y: y) else { return true }
    let dr = abs(color.redComponent - background.redComponent)
    let dg = abs(color.greenComponent - background.greenComponent)
    let db = abs(color.blueComponent - background.blueComponent)
    return dr < 0.08 && dg < 0.08 && db < 0.08
}

var outside = Array(repeating: false, count: width * height)
var stack: [(Int, Int)] = []

func mark(_ x: Int, _ y: Int) {
    guard x >= 0, y >= 0, x < width, y < height else { return }
    let index = y * width + x
    guard !outside[index], isMargin(x, y) else { return }
    outside[index] = true
    stack.append((x, y))
}

for x in 0..<width {
    mark(x, 0)
    mark(x, height - 1)
}
for y in 0..<height {
    mark(0, y)
    mark(width - 1, y)
}

while let (x, y) = stack.popLast() {
    mark(x + 1, y)
    mark(x - 1, y)
    mark(x, y + 1)
    mark(x, y - 1)
}

var minX = width
var minY = height
var maxX = 0
var maxY = 0
for y in 0..<height {
    for x in 0..<width where !outside[y * width + x] {
        minX = min(minX, x)
        minY = min(minY, y)
        maxX = max(maxX, x)
        maxY = max(maxY, y)
    }
}

let cropWidth = maxX - minX + 1
let cropHeight = maxY - minY + 1
guard let cropped = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: cropWidth,
    pixelsHigh: cropHeight,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: cropWidth * 4,
    bitsPerPixel: 32
) else {
    fputs("Could not create icon\n", stderr)
    exit(1)
}

for y in 0..<cropHeight {
    for x in 0..<cropWidth {
        let sourceX = minX + x
        let sourceY = minY + y
        if outside[sourceY * width + sourceX] {
            cropped.setColor(NSColor.clear, atX: x, y: y)
        } else if let color = source.colorAt(x: sourceX, y: sourceY) {
            cropped.setColor(color, atX: x, y: y)
        }
    }
}

let side = max(cropWidth, cropHeight)
guard let square = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: side,
    pixelsHigh: side,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: side * 4,
    bitsPerPixel: 32
) else {
    fputs("Could not create square icon\n", stderr)
    exit(1)
}

let originX = (side - cropWidth) / 2
let originY = (side - cropHeight) / 2
for y in 0..<side {
    for x in 0..<side {
        let cropX = x - originX
        let cropY = y - originY
        if cropX >= 0, cropY >= 0, cropX < cropWidth, cropY < cropHeight,
           let color = cropped.colorAt(x: cropX, y: cropY) {
            square.setColor(color, atX: x, y: y)
        } else {
            square.setColor(NSColor.clear, atX: x, y: y)
        }
    }
}

guard let data = square.representation(using: .png, properties: [:]) else {
    fputs("Could not encode icon\n", stderr)
    exit(1)
}

try data.write(to: URL(fileURLWithPath: output))
print("\(side)x\(side)")
