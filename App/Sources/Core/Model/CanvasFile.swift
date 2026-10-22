import Foundation

/// Morrow's core/canvas.ts: canvases follow the open JSON Canvas format (jsoncanvas.org). Nodes and edges are
/// kept as the objects Morrow builds, in its key order, since the file is their JSON.
nonisolated enum CanvasFile {
    struct Data: Equatable {
        var nodes: [JSObject] = []
        var edges: [JSObject] = []
    }

    static let sides = ["top", "right", "bottom", "left"]
    private static let maxPoints = 20_000
    private static let maxNodes = 5000
    private static let maxCoord = 1e7
    private static let preset = JSRegex(#"^[1-6]$"#)
    private static let hex = JSRegex(#"^#[0-9a-f]{3,8}$"#, ignoreCase: true)

    private static func color(_ value: JSValue?) -> String? {
        guard case .string(let text) = value, preset.test(text) || hex.test(text) else { return nil }
        return text
    }

    private static func num(_ value: JSValue?, _ fallback: Double) -> Double {
        guard case .number(let number) = value, number.isFinite else { return fallback }
        return max(-maxCoord, min(maxCoord, number))
    }

    private static func str(_ value: JSValue?) -> String? { value?.string }

    static func readStrokes(_ raw: JSValue?) -> [JSValue] {
        guard case .array(let items) = raw else { return [] }
        var strokes: [JSValue] = []
        for item in items.prefix(2000) {
            guard case .object(let object) = item, case .array(let rawPoints) = object["points"] else { continue }
            var points = rawPoints.prefix(maxPoints * 2).compactMap { $0.number.flatMap { $0.isFinite ? JSValue.number($0) : nil } }
            if points.count < 2 { continue }
            if points.count % 2 == 1 { points.removeLast() }
            var stroke = JSObject()
            stroke["points"] = .array(points)
            if case .number(let width) = object["width"], width > 0 { stroke["width"] = .number(min(80, width)) } else { stroke["width"] = 3 }
            if let tint = color(object["color"]) { stroke["color"] = .string(tint) }
            if object["highlighter"] == .bool(true) { stroke["highlighter"] = true }
            strokes.append(.object(stroke))
        }
        return strokes
    }

    static func emptyCanvas() -> Data { Data() }

    static func canvasDoc(_ data: Data) -> DocNode {
        let canvas = DocNode.node("canvas", ("attrs", ["nodes": .array(data.nodes.map(JSValue.object)), "edges": .array(data.edges.map(JSValue.object))]))
        return .node("doc", ("content", [.object(canvas)]))
    }

    static func canvasFromDoc(_ doc: DocNode?) -> Data {
        guard let node = doc?.content?.first(where: { $0.type == "canvas" }) else { return emptyCanvas() }
        var raw = JSObject()
        if let nodes = node.attr("nodes") { raw["nodes"] = nodes }
        if let edges = node.attr("edges") { raw["edges"] = edges }
        return readCanvas(.object(raw)) { _ in nil } ?? emptyCanvas()
    }

    /// reads either the file format or the in memory shape, resolving file paths to pages when it can
    static func readCanvas(_ raw: JSValue, _ pageAt: (String) -> String?) -> Data? {
        guard case .object(let object) = raw else { return nil }
        var data = Data()
        var ids = JSSet()
        for item in (object["nodes"]?.array ?? []).prefix(maxNodes) {
            guard case .object(let fields) = item, case .string(let id) = fields["id"], !id.isEmpty, !ids.has(id) else { continue }
            var base = JSObject()
            base["id"] = .string(JSText.string(JSText.slice(id.units, 0, 64)))
            base["x"] = .number(num(fields["x"], 0))
            base["y"] = .number(num(fields["y"], 0))
            base["width"] = .number(max(20, num(fields["width"], 250)))
            base["height"] = .number(max(20, num(fields["height"], 60)))
            if let tint = color(fields["color"]) { base["color"] = .string(tint) }
            let subpath = str(fields["subpath"])
            var node: JSObject?
            switch fields["type"]?.string {
            case "text":
                node = base.with("type", "text").with("text", .string(str(fields["text"]) ?? ""))
            case "page" where fields["pageId"]?.string != nil:
                node = base.with("type", "page").with("pageId", fields["pageId"]!)
                if let subpath, !subpath.isEmpty { node!["subpath"] = .string(subpath) }
            case "file" where fields["file"]?.string != nil:
                let file = fields["file"]!.string!
                if let pageId = pageAt(file), !pageId.isEmpty {
                    node = base.with("type", "page").with("pageId", .string(pageId))
                } else {
                    node = base.with("type", "file").with("file", .string(file))
                }
                if let subpath, !subpath.isEmpty { node!["subpath"] = .string(subpath) }
            case "link" where fields["url"]?.string != nil:
                node = base.with("type", "link").with("url", fields["url"]!)
            case "group":
                node = base.with("type", "group")
                if let label = str(fields["label"]), !label.isEmpty { node!["label"] = .string(label) }
            case "drawing":
                let strokes = readStrokes(fields["strokes"])
                if !strokes.isEmpty { node = base.with("type", "drawing").with("strokes", .array(strokes)) }
            default:
                break
            }
            guard let node else { continue }
            ids.insert(node["id"]!.string!)
            data.nodes.append(node)
        }
        var edgeIds = JSSet()
        for item in (object["edges"]?.array ?? []).prefix(maxNodes * 2) {
            guard case .object(let fields) = item, case .string(let id) = fields["id"], !edgeIds.has(id),
                  case .string(let from) = fields["fromNode"], case .string(let to) = fields["toNode"],
                  ids.has(from), ids.has(to)
            else { continue }
            var edge = JSObject()
            edge["id"] = .string(JSText.string(JSText.slice(id.units, 0, 64)))
            edge["fromNode"] = .string(from)
            edge["toNode"] = .string(to)
            if let side = fields["fromSide"]?.string, sides.contains(side) { edge["fromSide"] = .string(side) }
            if let side = fields["toSide"]?.string, sides.contains(side) { edge["toSide"] = .string(side) }
            if let end = fields["fromEnd"]?.string, end == "none" || end == "arrow" { edge["fromEnd"] = .string(end) }
            if let end = fields["toEnd"]?.string, end == "none" || end == "arrow" { edge["toEnd"] = .string(end) }
            if let tint = color(fields["color"]) { edge["color"] = .string(tint) }
            if let label = str(fields["label"]), !label.isEmpty { edge["label"] = .string(label) }
            edgeIds.insert(edge["id"]!.string!)
            data.edges.append(edge)
        }
        return data
    }

    /// the json canvas file, with pages written as the path of their file
    static func writeCanvas(_ data: Data, _ pathOf: (String) -> String?) -> String {
        let nodes: [JSValue] = data.nodes.map { node in
            var rest = node
            let type = rest["type"] ?? .null
            rest["type"] = nil
            if type == .string("page") {
                let pageId = rest["pageId"]?.string ?? ""
                rest["pageId"] = nil
                return .object(rest.with("type", "file").with("file", .string(pathOf(pageId) ?? "")))
            }
            return .object(rest.with("type", type))
        }
        let file: JSValue = ["nodes": .array(nodes), "edges": .array(data.edges.map(JSValue.object))]
        return JSJSON.stringify(file, gap: "\t") + "\n"
    }

    static func canvasText(_ data: Data) -> String {
        data.nodes.compactMap { node -> String? in
            let text: String? = switch node["type"]?.string {
            case "text": node["text"]?.string
            case "group": node["label"]?.string ?? ""
            case "link": node["url"]?.string
            default: ""
            }
            return text.flatMap { $0.isEmpty ? nil : $0 }
        }.joined(separator: "\n")
    }

    static func pagesInCanvas(_ data: Data) -> [String] {
        var ids = JSSet()
        for node in data.nodes where node["type"] == .string("page") {
            if let id = node["pageId"]?.string { ids.insert(id) }
        }
        return ids.items
    }
}
