import AppKit

let input = CommandLine.arguments[1]
let output = CommandLine.arguments[2]
let appPath = CommandLine.arguments.count > 3 ? CommandLine.arguments[3] : nil

guard let image = NSImage(contentsOfFile: input) else {
    fputs("Could not read icon\n", stderr)
    exit(1)
}

let side = 1024
guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: side,
    pixelsHigh: side,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
) else {
    fputs("Could not create icon bitmap\n", stderr)
    exit(1)
}

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSColor(deviceRed: 192 / 255, green: 192 / 255, blue: 192 / 255, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: side, height: side).fill()
image.draw(
    in: NSRect(x: 0, y: 0, width: side, height: side),
    from: .zero,
    operation: .sourceOver,
    fraction: 1
)
NSGraphicsContext.restoreGraphicsState()

guard let png = rep.representation(using: .png, properties: [:]) else {
    exit(1)
}
try png.write(to: URL(fileURLWithPath: output))

if let appPath {
    guard let stamped = NSImage(data: png) else { exit(1) }
    if !NSWorkspace.shared.setIcon(stamped, forFile: appPath, options: []) {
        fputs("Could not set the app file icon\n", stderr)
        exit(1)
    }
}
