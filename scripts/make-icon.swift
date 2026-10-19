#!/usr/bin/env swift
// Writes the layers of the app icon as SVG into design/app-icon/, for Icon Composer, which builds
// App/AppIcon.icon from them: the background gradient and the dark appearance are set there, and the system
// adds the shape, the glass and the shadow. Run from the repository root: swift scripts/make-icon.swift
//
// The mark is a page with two lines of writing and three linked points: notes that connect, in the Ocean and
// Violet accents of the app. Sizes are fractions of the 1024 px canvas.
import Foundation

let canvas = 1024.0
let output = URL(fileURLWithPath: "design/app-icon", isDirectory: true)

func n(_ value: Double) -> String { String(format: "%.2f", value) }

func svg(_ body: String) -> String {
    """
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    \(body)
    </svg>

    """
}

// the page: a rounded sheet in the middle of the canvas
let page = (x: 0.27 * canvas, y: 0.21 * canvas, width: 0.46 * canvas, height: 0.60 * canvas)
let pageLayer = svg("""
  <rect x="\(n(page.x))" y="\(n(page.y))" width="\(n(page.width))" height="\(n(page.height))" rx="\(n(0.05 * canvas))" fill="#FFFFFF"/>
""")

// two lines of writing at the top of the page
let lines = [0.30, 0.21].enumerated().map { index, width in
    let y = page.y + canvas * (0.077 + Double(index) * 0.06)
    return """
      <rect x="\(n(page.x + 0.065 * canvas))" y="\(n(y))" width="\(n(width * canvas))" height="\(n(0.028 * canvas))" rx="\(n(0.014 * canvas))" fill="#1E88D8"/>
    """
}
let linesLayer = svg(lines.joined(separator: "\n"))

// three linked points below them, the middle one larger and violet
let points = [
    (x: page.x + 0.12 * canvas, y: page.y + page.height - 0.30 * canvas, radius: 0.042 * canvas, color: "#1E88D8"),
    (x: page.x + page.width - 0.11 * canvas, y: page.y + page.height - 0.22 * canvas, radius: 0.052 * canvas, color: "#7353E0"),
    (x: page.x + 0.17 * canvas, y: page.y + page.height - 0.10 * canvas, radius: 0.042 * canvas, color: "#1E88D8"),
]
let links = [(0, 1), (1, 2), (0, 2)].map { from, to in
    """
      <line x1="\(n(points[from].x))" y1="\(n(points[from].y))" x2="\(n(points[to].x))" y2="\(n(points[to].y))" stroke="#5A6FDC" stroke-width="\(n(0.022 * canvas))" stroke-linecap="round"/>
    """
}
let dots = points.map { point in
    """
      <circle cx="\(n(point.x))" cy="\(n(point.y))" r="\(n(point.radius))" fill="\(point.color)"/>
      <circle cx="\(n(point.x))" cy="\(n(point.y))" r="\(n(point.radius * 0.42))" fill="#FFFFFF"/>
    """
}
let graphLayer = svg((links + dots).joined(separator: "\n"))

// the dark appearance, as the system apps do theirs: the background goes to the system's dark and the page takes
// the brand colours, so the graph is drawn in white, each point a ring the page shows through
// the rings are open in the middle, so a link stops at each ring's edge instead of reaching its centre
let darkLinks = [(0, 1), (1, 2), (0, 2)].map { from, to in
    let (a, b) = (points[from], points[to])
    let length = ((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y)).squareRoot()
    let (dx, dy) = ((b.x - a.x) / length, (b.y - a.y) / length)
    return """
      <line x1="\(n(a.x + dx * a.radius))" y1="\(n(a.y + dy * a.radius))" x2="\(n(b.x - dx * b.radius))" y2="\(n(b.y - dy * b.radius))" stroke="#FFFFFF" stroke-opacity="0.85" stroke-width="\(n(0.022 * canvas))"/>
    """
}
let darkDots = points.map { point in
    // a ring as wide as the coloured part of the light point
    let width = point.radius * 0.58
    return """
      <circle cx="\(n(point.x))" cy="\(n(point.y))" r="\(n(point.radius - width / 2))" fill="none" stroke="#FFFFFF" stroke-width="\(n(width))"/>
    """
}
let graphDarkLayer = svg((darkLinks + darkDots).joined(separator: "\n"))

try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
for (name, text) in [("page", pageLayer), ("lines", linesLayer), ("graph", graphLayer), ("graph-dark", graphDarkLayer)] {
    try text.write(to: output.appending(path: "\(name).svg"), atomically: true, encoding: .utf8)
}
print("wrote page.svg, lines.svg, graph.svg and graph-dark.svg to \(output.path)")
