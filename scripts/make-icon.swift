#!/usr/bin/env swift
// Draws the app icon into App/Assets.xcassets/AppIcon.appiconset: one 1024 px square for iOS and iPadOS, which
// the system rounds, and the macOS sizes, which carry their own rounded shape and shadow on the macOS icon grid
// (an 824 px shape centred on a 1024 px canvas). Run from the repository root: swift scripts/make-icon.swift
//
// The mark is a page with three linked points: notes that connect, in the Ocean to Violet accents of the app.
import AppKit
import CoreGraphics
import Foundation

let output = URL(fileURLWithPath: "App/Assets.xcassets/AppIcon.appiconset", isDirectory: true)

func color(_ hex: UInt32, _ alpha: CGFloat = 1) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: alpha)
}

let ocean = color(0x1e88d8)
let violet = color(0x7353e0)

/// The background gradient and the page with its linked points, drawn into `rect`.
func drawMark(in context: CGContext, rect: CGRect) {
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    let gradient = CGGradient(colorsSpace: space, colors: [ocean, violet] as CFArray, locations: [0, 1])!
    context.saveGState()
    context.clip(to: rect)
    // top left to bottom right; core graphics has its origin at the bottom left
    context.drawLinearGradient(gradient, start: CGPoint(x: rect.minX, y: rect.maxY), end: CGPoint(x: rect.maxX, y: rect.minY), options: [])
    context.restoreGState()

    let unit = rect.width
    // the page
    let page = CGRect(x: rect.minX + unit * 0.27, y: rect.minY + unit * 0.19, width: unit * 0.46, height: unit * 0.60)
    context.saveGState()
    context.setShadow(offset: CGSize(width: 0, height: -unit * 0.012), blur: unit * 0.04, color: color(0x000000, 0.22))
    context.addPath(CGPath(roundedRect: page, cornerWidth: unit * 0.05, cornerHeight: unit * 0.05, transform: nil))
    context.setFillColor(color(0xffffff, 0.96))
    context.fillPath()
    context.restoreGState()

    // two lines of writing at the top of the page
    context.setFillColor(color(0x1e88d8, 0.28))
    for (index, width) in [0.30, 0.21].enumerated() {
        let line = CGRect(x: page.minX + unit * 0.065, y: page.maxY - unit * (0.105 + Double(index) * 0.06), width: unit * width, height: unit * 0.028)
        context.addPath(CGPath(roundedRect: line, cornerWidth: unit * 0.014, cornerHeight: unit * 0.014, transform: nil))
        context.fillPath()
    }

    // three linked points below them
    let points = [
        CGPoint(x: page.minX + unit * 0.12, y: page.minY + unit * 0.30),
        CGPoint(x: page.maxX - unit * 0.11, y: page.minY + unit * 0.22),
        CGPoint(x: page.minX + unit * 0.17, y: page.minY + unit * 0.10),
    ]
    context.setStrokeColor(color(0x5a6fdc, 0.85))
    context.setLineWidth(unit * 0.022)
    context.setLineCap(.round)
    for (from, to) in [(0, 1), (1, 2), (0, 2)] {
        context.move(to: points[from])
        context.addLine(to: points[to])
    }
    context.strokePath()
    for (index, point) in points.enumerated() {
        let radius = unit * (index == 1 ? 0.052 : 0.042)
        context.setFillColor(index == 1 ? violet : ocean)
        context.fillEllipse(in: CGRect(x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2))
        context.setFillColor(color(0xffffff))
        let inner = radius * 0.42
        context.fillEllipse(in: CGRect(x: point.x - inner, y: point.y - inner, width: inner * 2, height: inner * 2))
    }
}

func image(pixels: Int, draw: (CGContext, CGFloat) -> Void) -> Data {
    let context = CGContext(data: nil, width: pixels, height: pixels, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.interpolationQuality = .high
    draw(context, CGFloat(pixels))
    let rep = NSBitmapImageRep(cgImage: context.makeImage()!)
    return rep.representation(using: .png, properties: [:])!
}

/// iOS: a full square without transparency, the system applies the shape.
let ios = image(pixels: 1024) { context, size in
    drawMark(in: context, rect: CGRect(x: 0, y: 0, width: size, height: size))
}

/// macOS: the rounded shape on the icon grid with a soft shadow, transparent around it.
func mac(_ pixels: Int) -> Data {
    image(pixels: pixels) { context, size in
        let scale = size / 1024
        let shape = CGRect(x: 100 * scale, y: 100 * scale, width: 824 * scale, height: 824 * scale)
        let path = CGPath(roundedRect: shape, cornerWidth: 185 * scale, cornerHeight: 185 * scale, transform: nil)
        context.saveGState()
        context.setShadow(offset: CGSize(width: 0, height: -10 * scale), blur: 20 * scale, color: color(0x000000, 0.3))
        context.addPath(path)
        context.setFillColor(ocean)
        context.fillPath()
        context.restoreGState()
        context.saveGState()
        context.addPath(path)
        context.clip()
        drawMark(in: context, rect: shape)
        context.restoreGState()
    }
}

try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
try ios.write(to: output.appending(path: "icon-ios-1024.png"))
var images: [[String: String]] = [["filename": "icon-ios-1024.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"]]
for points in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let name = "icon-mac-\(points)@\(scale)x.png"
        try mac(points * scale).write(to: output.appending(path: name))
        images.append(["filename": name, "idiom": "mac", "scale": "\(scale)x", "size": "\(points)x\(points)"])
    }
}
let contents: [String: Any] = ["images": images, "info": ["author": "xcode", "version": 1]]
let json = try JSONSerialization.data(withJSONObject: contents, options: [.prettyPrinted, .sortedKeys])
try json.write(to: output.appending(path: "Contents.json"))
print("wrote \(images.count) icons to \(output.path)")
