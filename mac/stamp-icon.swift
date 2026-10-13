import AppKit

// Same superellipse macOS uses for app icons: full-bleed, smooth corners.
func macIconShape(side: CGFloat) -> NSBezierPath {
    let path = NSBezierPath()
    let exponent: CGFloat = 2.0 / 5.0
    let radius = side / 2
    let center = side / 2
    let steps = 720
    for i in 0...steps {
        let t = (CGFloat(i) / CGFloat(steps)) * 2 * .pi
        let ct = cos(t)
        let st = sin(t)
        let point = NSPoint(
            x: center + radius * copysign(pow(abs(ct), exponent), ct),
            y: center + radius * copysign(pow(abs(st), exponent), st)
        )
        if i == 0 {
            path.move(to: point)
        } else {
            path.line(to: point)
        }
    }
    path.close()
    return path
}

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
let context = NSGraphicsContext(bitmapImageRep: rep)
context?.imageInterpolation = .high
context?.shouldAntialias = true
NSGraphicsContext.current = context
NSColor.clear.setFill()
let bounds = NSRect(x: 0, y: 0, width: side, height: side)
bounds.fill()
image.draw(in: bounds, from: .zero, operation: .sourceOver, fraction: 1)

let punch = NSBezierPath(rect: bounds)
punch.append(macIconShape(side: CGFloat(side)))
punch.windingRule = .evenOdd
context?.compositingOperation = .destinationOut
NSColor.black.setFill()
punch.fill()
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
