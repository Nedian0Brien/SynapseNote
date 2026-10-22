import Foundation

/// The changes Morrow's canvas makes, src/app/components/CanvasView.tsx, as pure functions over the canvas data.
/// Nodes stay the JSON objects Morrow builds, in its key order; positions are rounded as `Math.round` rounds.
nonisolated enum CanvasEdits {
    typealias Data = CanvasFile.Data

    struct Point: Equatable, Sendable {
        var x: Double
        var y: Double
    }

    /// what part of the canvas the screen shows: the world's origin on screen and the zoom
    struct Viewport: Equatable, Sendable {
        var x: Double
        var y: Double
        var zoom: Double

        static let start = Viewport(x: 80, y: 80, zoom: 1)

        func toWorld(_ screen: Point) -> Point {
            Point(x: (screen.x - x) / zoom, y: (screen.y - y) / zoom)
        }
    }

    static let minZoom = 0.1
    static let maxZoom = 3.0
    static let saveDelay = Duration.milliseconds(400)
    static let maxHistory = 100
    static let inkWidths: [Double] = [2, 4, 8]
    /// the preset colours as ink, matching the card colours JSON Canvas defines
    static let inkColors: [String: String] = ["1": "#e5484d", "2": "#e8803a", "3": "#d6a72a", "4": "#4d9a5c", "5": "#3f9bb3", "6": "#8b5fc7"]
    static let colors = ["1", "2", "3", "4", "5", "6"]
    static let sides = ["top", "right", "bottom", "left"]

    private static func round(_ value: Double) -> Double { Formula.mathRound(value) }

    // MARK: nodes

    static func number(_ node: JSObject, _ key: String) -> Double { node[key]?.number ?? 0 }
    static func id(_ node: JSObject) -> String { node["id"]?.string ?? "" }
    static func type(_ node: JSObject) -> String { node["type"]?.string ?? "" }

    static func node(_ data: Data, _ id: String) -> JSObject? {
        data.nodes.first { Self.id($0).jsEquals(id) }
    }

    /// the point on a side of a card an edge meets
    static func anchor(_ node: JSObject, _ side: String) -> Point {
        let x = number(node, "x"), y = number(node, "y"), width = number(node, "width"), height = number(node, "height")
        switch side {
        case "top": return Point(x: x + width / 2, y: y)
        case "bottom": return Point(x: x + width / 2, y: y + height)
        case "left": return Point(x: x, y: y + height / 2)
        default: return Point(x: x + width, y: y + height / 2)
        }
    }

    /// the side of a card that faces a point, used when an edge does not say
    static func facing(_ node: JSObject, _ x: Double, _ y: Double) -> String {
        let width = number(node, "width"), height = number(node, "height")
        let dx = x - (number(node, "x") + width / 2)
        let dy = y - (number(node, "y") + height / 2)
        if abs(dx) / width > abs(dy) / height { return dx > 0 ? "right" : "left" }
        return dy > 0 ? "bottom" : "top"
    }

    static let normals: [String: Point] = ["top": Point(x: 0, y: -1), "bottom": Point(x: 0, y: 1), "left": Point(x: -1, y: 0), "right": Point(x: 1, y: 0)]

    /// edgePath's cubic curve: from a side, bending out along it, to a side or a loose point
    static func edgeControls(from: Point, fromSide: String, to: Point, toSide: String?) -> (Point, Point) {
        let distance = hypot(to.x - from.x, to.y - from.y)
        let bend = min(150, max(30, distance / 2))
        let a = normals[fromSide] ?? Point(x: 1, y: 0)
        let b = toSide.flatMap { normals[$0] } ?? Point(x: 0, y: 0)
        return (Point(x: from.x + a.x * bend, y: from.y + a.y * bend), Point(x: to.x + b.x * bend, y: to.y + b.y * bend))
    }

    /// where an edge starts and ends, and the sides, as CanvasView draws it
    static func edgeEnds(_ edge: JSObject, _ data: Data) -> (from: Point, fromSide: String, to: Point, toSide: String)? {
        guard let from = node(data, edge["fromNode"]?.string ?? ""), let to = node(data, edge["toNode"]?.string ?? "") else { return nil }
        let toCenter = Point(x: number(to, "x") + number(to, "width") / 2, y: number(to, "y") + number(to, "height") / 2)
        let fromSide = edge["fromSide"]?.string ?? facing(from, toCenter.x, toCenter.y)
        let start = anchor(from, fromSide)
        let toSide = edge["toSide"]?.string ?? facing(to, start.x, start.y)
        return (start, fromSide, anchor(to, toSide), toSide)
    }

    // MARK: viewport

    /// everything on the canvas in view, a little room around it, never closer than 120%
    static func fit(_ data: Data, width: Double, height: Double) -> Viewport {
        guard !data.nodes.isEmpty else { return .start }
        let minX = data.nodes.map { number($0, "x") }.min()!
        let minY = data.nodes.map { number($0, "y") }.min()!
        let maxX = data.nodes.map { number($0, "x") + number($0, "width") }.max()!
        let maxY = data.nodes.map { number($0, "y") + number($0, "height") }.max()!
        let spanX = maxX - minX == 0 ? 1 : maxX - minX
        let spanY = maxY - minY == 0 ? 1 : maxY - minY
        let zoom = min(maxZoom, max(minZoom, min((width - 120) / spanX, (height - 120) / spanY, 1.2)))
        return Viewport(x: width / 2 - (minX + maxX) / 2 * zoom, y: height / 2 - (minY + maxY) / 2 * zoom, zoom: zoom)
    }

    /// zooms by a factor around a point on screen, which stays where it is
    static func zoomAt(_ view: Viewport, _ factor: Double, _ point: Point) -> Viewport {
        let zoom = min(maxZoom, max(minZoom, view.zoom * factor))
        return Viewport(x: point.x - (point.x - view.x) / view.zoom * zoom, y: point.y - (point.y - view.y) / view.zoom * zoom, zoom: zoom)
    }

    // MARK: adding

    /// `newId().replace(/-/g, '').slice(0, 16)`
    static func newNodeId(_ uuid: () -> String) -> String {
        JSText.string(JSText.slice(uuid().replacingOccurrences(of: "-", with: "").units, 0, 16))
    }

    /// a text card centred on a point, as a double click or Add a card makes it
    static func textCard(at point: Point, id: String) -> JSObject {
        JSObject([("type", "text"), ("text", ""), ("x", .number(round(point.x - 125))), ("y", .number(round(point.y - 30))),
                  ("width", 250), ("height", 60), ("id", .string(id))])
    }

    static func groupNode(at point: Point, id: String) -> JSObject {
        JSObject([("type", "group"), ("label", "Group"), ("x", .number(round(point.x - 200))), ("y", .number(round(point.y - 150))),
                  ("width", 400), ("height", 300), ("id", .string(id))])
    }

    static func pageNode(_ pageId: String, at point: Point, id: String) -> JSObject {
        JSObject([("type", "page"), ("pageId", .string(pageId)), ("x", .number(round(point.x - 200))), ("y", .number(round(point.y - 120))),
                  ("width", 400), ("height", 240), ("id", .string(id))])
    }

    /// groups go first, so they are drawn under the cards
    static func add(_ data: Data, _ node: JSObject) -> Data {
        var next = data
        if type(node) == "group" { next.nodes.insert(node, at: 0) } else { next.nodes.append(node) }
        return next
    }

    /// `{ ...node, ...patch }`; a nil value takes the key away, as `undefined` leaves the file
    static func update(_ data: Data, _ id: String, _ patch: [(String, JSValue?)]) -> Data {
        var next = data
        next.nodes = data.nodes.map { node in
            guard Self.id(node).jsEquals(id) else { return node }
            var changed = node
            for (key, value) in patch { changed[key] = value }
            return changed
        }
        return next
    }

    // MARK: selecting

    /// a press on a card: shift adds or takes it away, otherwise it is chosen alone unless already chosen
    static func select(_ selected: Set<String>, _ id: String, shift: Bool) -> Set<String> {
        var next = shift ? selected : selected.contains(id) ? selected : []
        if shift && next.contains(id) { next.remove(id) } else { next.insert(id) }
        return next
    }

    /// removes the chosen edge, or the chosen cards and the edges touching them; nil when nothing is chosen
    static func remove(_ data: Data, nodes selected: Set<String>, edge: String?) -> Data? {
        if let edge {
            var next = data
            next.edges = data.edges.filter { !id($0).jsEquals(edge) }
            return next
        }
        if selected.isEmpty { return nil }
        return Data(nodes: data.nodes.filter { !selected.contains(id($0)) },
                    edges: data.edges.filter { !selected.contains($0["fromNode"]?.string ?? "") && !selected.contains($0["toNode"]?.string ?? "") })
    }

    // MARK: moving and sizing

    /// the cards a move takes: the chosen ones, and every card lying wholly inside a chosen group
    static func movingSet(_ data: Data, _ selected: Set<String>) -> [String: Point] {
        var moving = selected
        for group in data.nodes where type(group) == "group" && selected.contains(id(group)) {
            let gx = number(group, "x"), gy = number(group, "y")
            for inner in data.nodes
            where number(inner, "x") >= gx && number(inner, "y") >= gy
                && number(inner, "x") + number(inner, "width") <= gx + number(group, "width")
                && number(inner, "y") + number(inner, "height") <= gy + number(group, "height") {
                moving.insert(id(inner))
            }
        }
        var origins: [String: Point] = [:]
        for node in data.nodes where moving.contains(id(node)) { origins[id(node)] = Point(x: number(node, "x"), y: number(node, "y")) }
        return origins
    }

    /// a move starts once the cards would travel 3 world units
    static func startsMoving(dx: Double, dy: Double) -> Bool { hypot(dx, dy) >= 3 }

    static func move(_ data: Data, _ origins: [String: Point], dx: Double, dy: Double) -> Data {
        var next = data
        next.nodes = data.nodes.map { node in
            guard let origin = origins[id(node)] else { return node }
            return node.with("x", .number(round(origin.x + dx))).with("y", .number(round(origin.y + dy)))
        }
        return next
    }

    /// dragging the corner: never smaller than 60 by 40; `dx` and `dy` are on screen
    static func resize(_ data: Data, _ nodeId: String, width: Double, height: Double, dx: Double, dy: Double, zoom: Double) -> Data {
        update(data, nodeId, [("width", .number(max(60, round(width + dx / zoom)))), ("height", .number(max(40, round(height + dy / zoom))))])
    }

    /// the end of a resize: a drawing's lines are stretched with it; the undo entry is the size before
    static func finishResize(_ data: Data, _ nodeId: String, width: Double, height: Double) -> (data: Data, before: Data) {
        var current = data
        if let resized = node(data, nodeId), type(resized) == "drawing",
           number(resized, "width") != width || number(resized, "height") != height {
            let sx = number(resized, "width") / width
            let sy = number(resized, "height") / height
            let strokes: [JSValue] = (resized["strokes"]?.array ?? []).map { stroke in
                guard case .object(var object) = stroke else { return stroke }
                let points = (object["points"]?.array ?? []).enumerated().map { index, value in
                    JSValue.number((value.number ?? 0) * (index % 2 == 0 ? sx : sy))
                }
                object["points"] = .array(points)
                return .object(object)
            }
            current = update(data, nodeId, [("strokes", .array(strokes))])
        }
        return (current, update(current, nodeId, [("width", .number(width)), ("height", .number(height))]))
    }

    /// the arrow keys: 10, or 50 with shift
    static func nudge(_ data: Data, _ selected: Set<String>, dx: Double, dy: Double) -> Data {
        var next = data
        next.nodes = data.nodes.map { node in
            guard selected.contains(id(node)) else { return node }
            return node.with("x", .number(number(node, "x") + dx)).with("y", .number(number(node, "y") + dy))
        }
        return next
    }

    // MARK: connecting

    /// the card a dropped edge goes to: the topmost one under the point, not the card it starts from, not a group
    static func connectTarget(_ data: Data, from: String, at point: Point) -> JSObject? {
        data.nodes.reversed().first { node in
            !id(node).jsEquals(from) && type(node) != "group"
                && point.x >= number(node, "x") && point.x <= number(node, "x") + number(node, "width")
                && point.y >= number(node, "y") && point.y <= number(node, "y") + number(node, "height")
        }
    }

    /// an edge dropped on a card joins the two; dropped in empty space it makes a new card joined to this one,
    /// whose id comes back so it can be edited
    static func connect(_ data: Data, from: String, side: String, at point: Point, newId: () -> String) -> (data: Data, newCard: String?) {
        guard let source = node(data, from) else { return (data, nil) }
        let start = anchor(source, side)
        if let target = connectTarget(data, from: from, at: point) {
            var next = data
            next.edges.append(JSObject([("id", .string(newNodeId(newId))), ("fromNode", .string(from)), ("toNode", .string(id(target))),
                                        ("fromSide", .string(side)), ("toSide", .string(facing(target, start.x, start.y)))]))
            return (next, nil)
        }
        let cardId = newNodeId(newId)
        let card = textCard(at: point, id: cardId)
        var next = data
        next.nodes.append(card)
        next.edges.append(JSObject([("id", .string("\(cardId)e")), ("fromNode", .string(from)), ("toNode", .string(cardId)),
                                    ("fromSide", .string(side)), ("toSide", .string(facing(card, start.x, start.y)))]))
        return (next, cardId)
    }

    // MARK: ink

    struct Ink: Equatable, Sendable {
        /// a preset colour 1 to 6, or nil for the text colour
        var color: String?
        var width: Double = 4
    }

    /// inkColor: a preset as its colour, nil for the text colour, a hex colour as it is
    static func inkColor(_ color: String?) -> String? {
        guard let color else { return nil }
        return inkColors[color] ?? color
    }

    /// a finished line joins the drawing it was drawn on or next to, otherwise it starts a new one; the drawing's
    /// id comes back, the next line may join it
    static func finishStroke(_ data: Data, _ drawn: [Double], highlighter: Bool, ink: Ink, activeDrawing: String?,
                             newId: () -> String) -> (data: Data, drawing: String) {
        var points = drawn
        if points.count == 2 { points += [points[0] + 0.5, points[1] + 0.5] }
        let width = highlighter ? ink.width * 3.5 : ink.width
        let xs = stride(from: 0, to: points.count, by: 2).map { points[$0] }
        let ys = stride(from: 1, to: points.count, by: 2).map { points[$0] }
        let box = (minX: xs.min()!, minY: ys.min()!, maxX: xs.max()!, maxY: ys.max()!)
        let near = data.nodes.first { node in
            type(node) == "drawing" && activeDrawing.map(id(node).jsEquals) == true
                && box.maxX > number(node, "x") - 160 && box.minX < number(node, "x") + number(node, "width") + 160
                && box.maxY > number(node, "y") - 160 && box.minY < number(node, "y") + number(node, "height") + 160
        }
        // the drawing's lines in canvas coordinates, then the new one
        var all: [JSObject] = (near?["strokes"]?.array ?? []).compactMap { stroke in
            guard case .object(var object) = stroke, let near else { return nil }
            object["points"] = .array((object["points"]?.array ?? []).enumerated().map { index, value in
                .number((value.number ?? 0) + (index % 2 == 0 ? number(near, "x") : number(near, "y")))
            })
            return object
        }
        var stroke = JSObject([("points", .array(points.map(JSValue.number))), ("width", .number(width))])
        if let color = ink.color { stroke["color"] = .string(color) }
        if highlighter { stroke["highlighter"] = true }
        all.append(stroke)
        let pad = all.map { $0["width"]?.number ?? 0 }.max()! / 2 + 6
        let allX = all.flatMap { s in (s["points"]?.array ?? []).enumerated().filter { $0.offset % 2 == 0 }.map { $0.element.number ?? 0 } }
        let allY = all.flatMap { s in (s["points"]?.array ?? []).enumerated().filter { $0.offset % 2 == 1 }.map { $0.element.number ?? 0 } }
        let x = (allX.min()! - pad).rounded(.down)
        let y = (allY.min()! - pad).rounded(.down)
        let drawingId = near.map { id($0) } ?? newNodeId(newId)
        let relative: [JSValue] = all.map { item in
            .object(item.with("points", .array((item["points"]?.array ?? []).enumerated().map { index, value in
                .number(round(((value.number ?? 0) - (index % 2 == 0 ? x : y)) * 10) / 10)
            })))
        }
        let drawing = JSObject([("id", .string(drawingId)), ("type", "drawing"), ("x", .number(x)), ("y", .number(y)),
                                ("width", .number((allX.max()! + pad - x).rounded(.up))),
                                ("height", .number((allY.max()! + pad - y).rounded(.up))), ("strokes", .array(relative))])
        var next = data
        if let near {
            next.nodes = data.nodes.map { id($0).jsEquals(id(near)) ? drawing : $0 }
        } else {
            next.nodes.append(drawing)
        }
        return (next, drawingId)
    }

    /// removes every line passing under the eraser, drawings left empty, and edges that lost a card; nil when
    /// nothing was under it
    static func erase(_ data: Data, at point: Point, zoom: Double) -> Data? {
        let radius = 10 / zoom
        var changed = false
        let nodes: [JSObject] = data.nodes.compactMap { node in
            guard type(node) == "drawing" else { return node }
            let nx = number(node, "x"), ny = number(node, "y")
            if point.x < nx - radius || point.x > nx + number(node, "width") + radius
                || point.y < ny - radius || point.y > ny + number(node, "height") + radius {
                return node
            }
            let strokes = (node["strokes"]?.array ?? []).filter { stroke in
                let reach = radius + (stroke["width"]?.number ?? 0) / 2
                let points = stroke["points"]?.array ?? []
                for index in stride(from: 0, to: points.count - 1, by: 2)
                where hypot((points[index].number ?? 0) + nx - point.x, (points[index + 1].number ?? 0) + ny - point.y) <= reach {
                    return false
                }
                return true
            }
            if strokes.count == node["strokes"]?.array?.count { return node }
            changed = true
            return strokes.isEmpty ? nil : node.with("strokes", .array(strokes))
        }
        guard changed else { return nil }
        let ids = Set(nodes.map { id($0) })
        return Data(nodes: nodes, edges: data.edges.filter { ids.contains($0["fromNode"]?.string ?? "") && ids.contains($0["toNode"]?.string ?? "") })
    }

    /// Morrow's strokePath, a smooth line through the points with each corner a curve through the midpoints, as
    /// path commands
    enum Segment: Equatable {
        case move(Point)
        case line(Point)
        case quad(control: Point, to: Point)
    }

    static func strokeSegments(_ points: [Double]) -> [Segment] {
        if points.count < 2 { return [] }
        if points.count <= 4 {
            let start = Point(x: points[0], y: points[1])
            let end = points.count == 4 ? Point(x: points[2], y: points[3]) : Point(x: points[0] + 0.01, y: points[1])
            return [.move(start), .line(end)]
        }
        var segments: [Segment] = [.move(Point(x: points[0], y: points[1]))]
        var index = 2
        while index < points.count - 2 {
            let mid = Point(x: (points[index] + points[index + 2]) / 2, y: (points[index + 1] + points[index + 3]) / 2)
            segments.append(.quad(control: Point(x: points[index], y: points[index + 1]), to: mid))
            index += 2
        }
        segments.append(.line(Point(x: points[points.count - 2], y: points[points.count - 1])))
        return segments
    }

    /// the same line as Morrow's SVG path text, to compare with Morrow
    static func strokePath(_ points: [Double]) -> String {
        func text(_ value: Double) -> String { JSNumber.string(value) }
        return strokeSegments(points).map { segment in
            switch segment {
            case .move(let p): "M \(text(p.x)) \(text(p.y))"
            case .line(let p): "L \(text(p.x)) \(text(p.y))"
            case .quad(let c, let p): "Q \(text(c.x)) \(text(c.y)) \(text(p.x)) \(text(p.y))"
            }
        }.joined(separator: " ")
    }

    // MARK: colours and labels

    /// a colour for the chosen edge, or for the chosen cards; nil takes the colour away
    static func setColor(_ data: Data, nodes selected: Set<String>, edge: String?, _ color: String?) -> Data {
        var next = data
        let value = color.map(JSValue.string)
        if let edge {
            next.edges = data.edges.map { id($0).jsEquals(edge) ? setting($0, "color", value) : $0 }
        } else {
            next.nodes = data.nodes.map { selected.contains(id($0)) ? setting($0, "color", value) : $0 }
        }
        return next
    }

    /// a group's name or an edge's label: trimmed, and gone when blank
    static func setLabel(_ data: Data, node nodeId: String? = nil, edge edgeId: String? = nil, _ label: String) -> Data {
        let clean = JSText.trim(label)
        let value: JSValue? = clean.isEmpty ? nil : .string(clean)
        var next = data
        if let nodeId { next.nodes = data.nodes.map { id($0).jsEquals(nodeId) ? setting($0, "label", value) : $0 } }
        if let edgeId { next.edges = data.edges.map { id($0).jsEquals(edgeId) ? setting($0, "label", value) : $0 } }
        return next
    }

    private static func setting(_ object: JSObject, _ key: String, _ value: JSValue?) -> JSObject {
        var next = object
        next[key] = value
        return next
    }

    // MARK: what cards show

    enum CardLine: Equatable {
        case heading(level: Int, text: String)
        case bullet(String)
        case plain(String)
    }

    private static let heading = JSRegex(#"^(#{1,3})\s+(.*)$"#)
    private static let bullet = JSRegex(#"^\s*[-*]\s+(.*)$"#)

    /// TextCard: card text is markdown, headings and lists lightly styled; nil for an empty card
    static func cardLines(_ text: String) -> [CardLine]? {
        if JSText.trim(text).isEmpty { return nil }
        return JSText.split(text, on: 0x0A).map { line in
            if let match = heading.exec(line.units) {
                return .heading(level: match.group(1)?.count ?? 1, text: JSText.string(match.group(2) ?? []))
            }
            if let match = bullet.exec(line.units) { return .bullet(JSText.string(match.group(1) ?? [])) }
            return .plain(line.isEmpty ? " " : line)
        }
    }

    /// PageCard: the start of the page's text
    static func pageSnippet(_ doc: DocNode?) -> String {
        JSText.string(JSText.slice(Doc.docToPlainText(doc ?? (["type": "doc"] as JSValue).object!).units, 0, 400))
    }

    /// `new URL(url).host`, the url itself when it does not read as one
    static func safeHost(_ url: String) -> String {
        guard let parsed = URL(string: url), parsed.scheme != nil, let host = parsed.host(percentEncoded: false) else { return url }
        return parsed.port.map { "\(host):\($0)" } ?? host
    }

    // MARK: undo

    /// Morrow's undo stacks, the latest hundred states
    struct History: Sendable {
        private(set) var past: [Data] = []
        private(set) var future: [Data] = []

        mutating func record(_ state: Data) {
            past = Array((past + [state]).suffix(CanvasEdits.maxHistory))
            future = []
        }

        /// an entry pushed without clearing what can be redone, as a move or a resize does
        mutating func push(_ state: Data) { past.append(state) }

        mutating func dropLast() { _ = past.popLast() }

        mutating func undo(_ current: Data) -> Data? {
            guard let previous = past.popLast() else { return nil }
            future.append(current)
            return previous
        }

        mutating func redo(_ current: Data) -> Data? {
            guard let next = future.popLast() else { return nil }
            past.append(current)
            return next
        }
    }
}

