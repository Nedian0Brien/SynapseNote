import Foundation

/// The schema Morrow's editor builds from its extensions (src/app/editor/extensions.ts on TipTap), and what
/// opening a document in it does: ProseMirror's `Node.fromJSON` followed by `toJSON`, which is the document the
/// editor saves after an edit. Checked against `getSchema(createExtensions(...))` by web/scripts/editor-fixtures.ts.
nonisolated enum EditorSchema {
    struct NodeSpec: Sendable {
        let name: String
        /// attributes in the order the extensions declare them, with their defaults
        let attrs: [(String, JSValue)]
        /// ProseMirror's content expression, nil for leaves
        let content: String?
        let group: String?
        let inline: Bool
        let atom: Bool
    }

    struct MarkSpec: Sendable {
        let name: String
        let attrs: [(String, JSValue)]
        /// `excludes`: "_" for a mark that allows no other, nil for the default (only itself)
        let excludes: String?
    }

    /// the order `schema.spec.nodes` lists them in
    static let nodeSpecs: [NodeSpec] = [
        NodeSpec(name: "paragraph", attrs: [], content: "inline*", group: "block", inline: false, atom: false),
        NodeSpec(name: "blockquote", attrs: [], content: "block+", group: "block", inline: false, atom: false),
        NodeSpec(name: "bulletList", attrs: [], content: "listItem+", group: "block list", inline: false, atom: false),
        NodeSpec(name: "doc", attrs: [], content: "block+", group: nil, inline: false, atom: false),
        NodeSpec(name: "hardBreak", attrs: [], content: nil, group: "inline", inline: true, atom: false),
        NodeSpec(name: "heading", attrs: [("level", 1)], content: "inline*", group: "block", inline: false, atom: false),
        NodeSpec(name: "horizontalRule", attrs: [], content: nil, group: "block", inline: false, atom: false),
        NodeSpec(name: "listItem", attrs: [], content: "paragraph block*", group: nil, inline: false, atom: false),
        NodeSpec(name: "orderedList", attrs: [("start", 1), ("type", .null)], content: "listItem+", group: "block list", inline: false, atom: false),
        NodeSpec(name: "text", attrs: [], content: nil, group: "inline", inline: false, atom: false),
        NodeSpec(name: "codeBlock", attrs: [("language", .null)], content: "text*", group: "block", inline: false, atom: false),
        NodeSpec(name: "rawBlock", attrs: [("text", "")], content: nil, group: "block", inline: false, atom: true),
        NodeSpec(name: "inlineMath", attrs: [("latex", "")], content: nil, group: "inline", inline: true, atom: true),
        NodeSpec(name: "blockMath", attrs: [("latex", "")], content: nil, group: "block", inline: false, atom: true),
        NodeSpec(name: "taskList", attrs: [], content: "taskItem+", group: "block list", inline: false, atom: false),
        NodeSpec(name: "taskItem", attrs: [("checked", false)], content: "paragraph block*", group: nil, inline: false, atom: false),
        NodeSpec(name: "table", attrs: [], content: "tableRow+", group: "block", inline: false, atom: false),
        NodeSpec(name: "tableRow", attrs: [], content: "(tableCell | tableHeader)*", group: nil, inline: false, atom: false),
        NodeSpec(name: "tableHeader", attrs: [("colspan", 1), ("rowspan", 1), ("colwidth", .null), ("align", .null)],
                 content: "block+", group: nil, inline: false, atom: false),
        NodeSpec(name: "tableCell", attrs: [("colspan", 1), ("rowspan", 1), ("colwidth", .null), ("align", .null)],
                 content: "block+", group: nil, inline: false, atom: false),
        NodeSpec(name: "pageLink", attrs: [("id", .null), ("label", ""), ("target", .null), ("anchor", .null), ("alias", .null), ("embed", .null)],
                 content: nil, group: "inline", inline: true, atom: true),
        NodeSpec(name: "image", attrs: [("fileId", .null), ("src", .null), ("alt", "")], content: nil, group: "block", inline: false, atom: true),
        NodeSpec(name: "fileAttachment", attrs: [("fileId", .null), ("name", "file"), ("size", .null)],
                 content: nil, group: "block", inline: false, atom: true),
        NodeSpec(name: "callout", attrs: [("tone", "note"), ("kind", .null), ("title", .null), ("fold", .null)],
                 content: "block+", group: "block", inline: false, atom: false),
        NodeSpec(name: "columns", attrs: [], content: "column{2,4}", group: "block", inline: false, atom: false),
        NodeSpec(name: "column", attrs: [], content: "block+", group: nil, inline: false, atom: false),
        NodeSpec(name: "tableOfContents", attrs: [], content: nil, group: "block", inline: false, atom: true),
        NodeSpec(name: "dateMention", attrs: [("date", .null)], content: nil, group: "inline", inline: true, atom: true),
        NodeSpec(name: "details", attrs: [("open", false)], content: "detailsSummary detailsContent", group: "block", inline: false, atom: false),
        NodeSpec(name: "detailsSummary", attrs: [], content: "text*", group: nil, inline: false, atom: false),
        NodeSpec(name: "detailsContent", attrs: [], content: "block+", group: nil, inline: false, atom: false),
    ]

    /// in rank order: a node's marks are sorted by it
    static let markSpecs: [MarkSpec] = [
        MarkSpec(name: "link", attrs: [("href", .null), ("target", .null), ("rel", "noopener noreferrer nofollow"), ("class", .null), ("title", .null)],
                 excludes: nil),
        MarkSpec(name: "bold", attrs: [], excludes: nil),
        MarkSpec(name: "code", attrs: [], excludes: "_"),
        MarkSpec(name: "italic", attrs: [], excludes: nil),
        MarkSpec(name: "strike", attrs: [], excludes: nil),
        MarkSpec(name: "underline", attrs: [], excludes: nil),
        MarkSpec(name: "highlight", attrs: [("color", .null)], excludes: nil),
        MarkSpec(name: "textColor", attrs: [("color", .null)], excludes: nil),
    ]

    static let nodes: [String: NodeSpec] = Dictionary(uniqueKeysWithValues: nodeSpecs.map { ($0.name, $0) })
    static let marks: [String: MarkSpec] = Dictionary(uniqueKeysWithValues: markSpecs.map { ($0.name, $0) })
    static let markRank: [String: Int] = Dictionary(uniqueKeysWithValues: markSpecs.enumerated().map { ($1.name, $0) })

    /// nodes whose content is inline: the blocks text is typed into
    static let textBlocks: Set<String> = ["paragraph", "heading", "codeBlock", "detailsSummary"]

    enum Failure: Error, Equatable {
        /// what ProseMirror throws on the same input
        case invalid(String)
    }

    // MARK: opening a document

    /// `schema.nodeFromJSON(doc).toJSON()`
    static func normalize(_ node: DocNode) throws -> DocNode {
        let type = node["type"]?.string ?? ""
        let marks = try normalizeMarks(node["marks"])
        if type == "text" {
            guard case .string(let text)? = node["text"] else { throw Failure.invalid("Invalid text node in JSON") }
            guard !text.isEmpty else { throw Failure.invalid("Empty text nodes are not allowed") }
            var out = JSObject()
            out["type"] = "text"
            if !marks.isEmpty { out["marks"] = .array(marks.map(JSValue.object)) }
            out["text"] = .string(text)
            return out
        }
        guard let spec = nodes[type] else { throw Failure.invalid("Unknown node type: \(type)") }
        var children: [DocNode] = []
        if let content = node["content"] {
            guard case .array(let items) = content else { throw Failure.invalid("Invalid input for Fragment.fromJSON") }
            for item in items {
                guard case .object(let child) = item else { throw Failure.invalid("Invalid input for Node.fromJSON") }
                children.append(try normalize(child))
            }
        }
        var out = JSObject()
        out["type"] = .string(type)
        let attrs = computeAttrs(spec.attrs, node["attrs"])
        if !attrs.isEmpty { out["attrs"] = .object(attrs) }
        let joined = joinText(children)
        if !joined.isEmpty { out["content"] = .array(joined.map(JSValue.object)) }
        if !marks.isEmpty { out["marks"] = .array(marks.map(JSValue.object)) }
        return out
    }

    /// `Mark.fromJSON` for each, then `Mark.setFrom`: a stable sort by rank
    static func normalizeMarks(_ value: JSValue?) throws -> [DocMark] {
        guard let value, !value.isNull else { return [] }
        guard case .array(let items) = value else { throw Failure.invalid("Invalid mark data for Node.fromJSON") }
        var out: [DocMark] = []
        for item in items {
            let type = item.object?["type"]?.string ?? ""
            guard let spec = Self.marks[type] else { throw Failure.invalid("There is no mark type \(type) in this schema") }
            var mark = JSObject()
            mark["type"] = .string(type)
            let attrs = computeAttrs(spec.attrs, item.object?["attrs"])
            if !attrs.isEmpty { mark["attrs"] = .object(attrs) }
            out.append(mark)
        }
        return sortMarks(out)
    }

    static func sortMarks(_ marks: [DocMark]) -> [DocMark] {
        marks.enumerated()
            .sorted { ($0.element.rank, $0.offset) < ($1.element.rank, $1.offset) }
            .map(\.element)
    }

    /// `computeAttrs`: every declared attribute in declaration order, the given value unless it is missing
    static func computeAttrs(_ declared: [(String, JSValue)], _ given: JSValue?) -> JSObject {
        var attrs = JSObject()
        let object = given?.object
        for (name, fallback) in declared { attrs[name] = object?[name] ?? fallback }
        return attrs
    }

    /// `Fragment.fromArray`: neighbouring text nodes with the same marks become one
    static func joinText(_ nodes: [DocNode]) -> [DocNode] {
        var out: [DocNode] = []
        for node in nodes {
            if let last = out.last, last.type == "text", node.type == "text", sameMarks(last, node) {
                out[out.count - 1]["text"] = .string((last.text ?? "") + (node.text ?? ""))
            } else {
                out.append(node)
            }
        }
        return out
    }

    static func sameMarks(_ a: DocNode, _ b: DocNode) -> Bool {
        let left = a.marks ?? [], right = b.marks ?? []
        return left.count == right.count && zip(left, right).allSatisfy { sameMark($0, $1) }
    }

    /// `Mark.eq`: same type and attributes deeply equal, in any key order
    static func sameMark(_ a: DocMark, _ b: DocMark) -> Bool {
        a.type == b.type && deepEqual(a["attrs"] ?? .object(JSObject()), b["attrs"] ?? .object(JSObject()))
    }

    /// ProseMirror's `compareDeep`
    static func deepEqual(_ a: JSValue, _ b: JSValue) -> Bool {
        switch (a, b) {
        case (.object(let left), .object(let right)):
            left.count == right.count && left.allSatisfy { key, value in right[key].map { deepEqual(value, $0) } ?? false }
        case (.array(let left), .array(let right)):
            left.count == right.count && zip(left, right).allSatisfy { deepEqual($0, $1) }
        default:
            a == b
        }
    }

    // MARK: after an edit

    /// Morrow's TrailingNode: once a document is edited, one that does not end in a paragraph gets an empty one
    static func trailingParagraph(_ doc: DocNode) -> DocNode {
        var content = doc.content ?? []
        guard content.last?.type != "paragraph" else { return doc }
        content.append(.node("paragraph"))
        return doc.with(content: content)
    }

    /// every node and mark type in a document
    static func types(_ doc: DocNode) -> (nodes: Set<String>, marks: Set<String>) {
        var nodes = Set<String>(), marks = Set<String>()
        func visit(_ node: DocNode) {
            nodes.insert(node.type)
            for mark in node.marks ?? [] { marks.insert(mark.type) }
            for child in node.content ?? [] { visit(child) }
        }
        visit(doc)
        return (nodes, marks)
    }
}

private extension JSObject {
    nonisolated var rank: Int { EditorSchema.markRank[type] ?? Int.max }
}
