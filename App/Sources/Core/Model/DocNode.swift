import Foundation

/// A document node as Morrow keeps it (`DocNode` in core/model.ts): a JSON object with `type`, and optional
/// `attrs`, `content`, `marks` and `text`. It is kept as the object itself so unknown node types, unknown
/// attributes and the key order JavaScript gives them survive a read and a write unchanged.
typealias DocNode = JSObject

/// A mark (`DocMark`): an object with `type` and optional `attrs`.
typealias DocMark = JSObject

extension JSObject {
    nonisolated var type: String { self["type"]?.string ?? "" }

    nonisolated var attrs: JSObject? {
        get { self["attrs"]?.object }
        set { self["attrs"] = newValue.map(JSValue.object) }
    }

    /// `content`, nil where the node has none. Entries that are not objects are dropped, as no Morrow code
    /// that reads `content` handles them.
    nonisolated var content: [DocNode]? {
        get { self["content"]?.array?.compactMap(\.object) }
        set { self["content"] = newValue.map { .array($0.map(JSValue.object)) } }
    }

    nonisolated var marks: [DocMark]? {
        get { self["marks"]?.array?.compactMap(\.object) }
        set { self["marks"] = newValue.map { .array($0.map(JSValue.object)) } }
    }

    nonisolated var text: String? {
        get { self["text"]?.string }
        set { self["text"] = newValue.map(JSValue.string) }
    }

    /// `node.attrs?.[name]`
    nonisolated func attr(_ name: String) -> JSValue? { attrs?[name] }

    /// An object literal: `{ type, ...fields }` in the order given.
    nonisolated static func node(_ type: String, _ fields: (String, JSValue)...) -> JSObject {
        var object = JSObject()
        object["type"] = .string(type)
        for (key, value) in fields { object[key] = value }
        return object
    }

    /// `{ ...self, [key]: value }`: a key already present keeps its place.
    nonisolated func with(_ key: String, _ value: JSValue) -> JSObject {
        var copy = self
        copy[key] = value
        return copy
    }

    nonisolated func with(content: [DocNode]) -> JSObject {
        var copy = self
        copy.content = content
        return copy
    }
}

extension JSValue {
    /// JavaScript's `String(value)` for the values documents hold.
    nonisolated var jsString: String {
        switch self {
        case .null: "null"
        case .bool(let flag): flag ? "true" : "false"
        case .number(let number): JSNumber.string(number)
        case .string(let text): text
        case .array(let items): items.map { $0.isNull ? "" : $0.jsString }.joined(separator: ",")
        case .object: "[object Object]"
        }
    }

    /// JavaScript truthiness.
    nonisolated var truthy: Bool {
        switch self {
        case .null: false
        case .bool(let flag): flag
        case .number(let number): number != 0 && !number.isNaN
        case .string(let text): !text.isEmpty
        case .array, .object: true
        }
    }
}

nonisolated enum Model {
    /// `emptyDoc()`
    static func emptyDoc() -> DocNode { .node("doc", ("content", .array([.object(.node("paragraph"))]))) }

    static let colors = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"]

    static let textHex: [(String, String)] = [
        ("gray", "#787774"), ("brown", "#9f6b53"), ("orange", "#d9730d"), ("yellow", "#cb912f"), ("green", "#448361"),
        ("blue", "#337ea9"), ("purple", "#9065b0"), ("pink", "#c14c8a"), ("red", "#d44c47"),
    ]

    static let backgroundHex: [(String, String)] = [
        ("gray", "#f1f1ef"), ("brown", "#f4eeee"), ("orange", "#fbecdd"), ("yellow", "#fbf3db"), ("green", "#edf3ec"),
        ("blue", "#e7f3f8"), ("purple", "#f6f3f9"), ("pink", "#faf1f5"), ("red", "#fdebec"),
    ]

    /// `nearestColor`: the palette colour closest to a css colour written as `#rgb` or `#rrggbb`.
    static func nearestColor(_ hex: String, _ palette: [(String, String)]) -> String? {
        func parse(_ value: String) -> [Int]? {
            var units = JSText.trim(value.units)
            if units.first == 0x23 { units.removeFirst() }
            let isHex = units.allSatisfy { (0x30...0x39).contains($0) || (0x41...0x46).contains($0) || (0x61...0x66).contains($0) }
            guard isHex, units.count == 3 || units.count == 6 else { return nil }
            let digits = units.count == 3 ? units.flatMap { [$0, $0] } : units
            return [0, 2, 4].map { Int(MD.parseDigits(digits[$0..<($0 + 2)], radix: 16)) }
        }
        guard let wanted = parse(hex) else { return nil }
        var best: String?
        var distance = Int.max
        for (name, value) in palette {
            let rgb = parse(value)!
            let d = zip(rgb, wanted).reduce(0) { $0 + ($1.0 - $1.1) * ($1.0 - $1.1) }
            if d < distance {
                distance = d
                best = name
            }
        }
        return best
    }

    private static let calloutKindTones: [String: String] = [
        "tip": "tip", "hint": "tip", "important": "tip", "success": "tip", "check": "tip", "done": "tip",
        "warning": "warning", "caution": "warning", "attention": "warning", "question": "warning", "help": "warning",
        "faq": "warning", "danger": "danger", "error": "danger", "failure": "danger", "fail": "danger",
        "missing": "danger", "bug": "danger",
    ]

    /// `calloutTone`. Morrow looks the kind up on a plain object, so `constructor` or `toString` find
    /// Object.prototype members there; those reach files and the editor as a missing tone, which reads as `note`.
    static func calloutTone(_ kind: String) -> String {
        calloutKindTones[JSText.string(JSText.lowercased(kind.units))] ?? "note"
    }
}

nonisolated enum Doc {
    /// `readableDate`: a date mention as people read it, like Oct 17, 2026, in the current locale as
    /// `toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })` writes it.
    static func readableDate(_ key: String) -> String {
        let units = key.units
        let isDate = units.count == 10 && units[4] == 0x2D && units[7] == 0x2D
            && [0, 1, 2, 3, 5, 6, 8, 9].allSatisfy { (0x30...0x39).contains(units[$0]) }
        guard isDate, let year = Int(key.prefix(4)), let month = Int(key.dropFirst(5).prefix(2)),
              let day = Int(key.suffix(2))
        else { return key }
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        guard let date = JSEnvironment.calendar.date(from: components) else { return key }
        let formatter = DateFormatter()
        formatter.locale = JSEnvironment.locale
        formatter.timeZone = JSEnvironment.timeZone
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.setLocalizedDateFormatFromTemplate("yMMMd")
        return formatter.string(from: date)
    }

    /// `validateDoc`: checks structure and size only, unknown node types are allowed and preserved. The error
    /// message, nil when the document is valid.
    static func validateDoc(_ value: JSValue) -> String? {
        guard case .object(let root) = value, root["type"] == .string("doc") else { return "Document must be an object of type \"doc\"." }
        var count = 0
        var stack: [(node: JSValue, depth: Int)] = [(value, 0)]
        while let (node, depth) = stack.popLast() {
            if depth > Model.maxDocDepth { return "Document is nested too deeply." }
            count += 1
            if count > Model.maxDocNodes { return "Document is too large." }
            guard case .object(let object) = node, case .string(let type) = object["type"], !type.isEmpty else {
                return "Document contains an invalid node."
            }
            if let text = object["text"], text.string == nil { return "Text node has invalid text." }
            if let attrs = object["attrs"], attrs.object == nil { return "Node has invalid attributes." }
            if let marks = object["marks"] {
                guard case .array(let list) = marks else { return "Node has invalid marks." }
                for mark in list where mark.object?["type"]?.string == nil { return "Node has an invalid mark." }
            }
            if let content = object["content"] {
                guard case .array(let children) = content else { return "Node has invalid content." }
                for child in children { stack.append((child, depth + 1)) }
            }
        }
        return nil
    }

    /// `inlineText`
    static func inlineText(_ node: DocNode) -> String {
        switch node.type {
        case "text": return node.text ?? ""
        case "hardBreak": return "\n"
        case "pageLink":
            let value = node.attr("alias").flatMap { $0.isNull ? nil : $0 } ?? node.attr("label").flatMap { $0.isNull ? nil : $0 }
            return value?.jsString ?? ""
        case "dateMention": return readableDate(node.attr("date").flatMap { $0.isNull ? nil : $0 }?.jsString ?? "")
        case "inlineMath": return node.attr("latex").flatMap { $0.isNull ? nil : $0 }?.jsString ?? ""
        default: return (node.content ?? []).map(inlineText).joined()
        }
    }
}
