import Foundation

/// A text block's inline content as the text a text view edits. Text stays text; its marks ride along as an
/// `editorMarks` attribute; a hard break is a line separator (U+2028) and any other inline node (page link, date,
/// formula) an object replacement character (U+FFFC), each carrying the node itself as an `editorAtom` attribute.
/// Reading it back gives the content ProseMirror would hold: text nodes split where their marks change.
nonisolated enum InlineText {
    static let lineSeparator: unichar = 0x2028
    static let objectReplacement: unichar = 0xFFFC

    /// the content as attributed text, with only the attributes this file defines
    static func attributed(_ content: [DocNode]) -> NSAttributedString {
        let out = NSMutableAttributedString()
        for node in content {
            switch node.type {
            case "text":
                var attributes: [NSAttributedString.Key: Any] = [:]
                if let marks = node.marks, !marks.isEmpty { attributes[.editorMarks] = EditorMarkSet(marks) }
                out.append(NSAttributedString(string: node.text ?? "", attributes: attributes))
            case "hardBreak":
                out.append(NSAttributedString(string: String(utf16CodeUnits: [lineSeparator], count: 1),
                                              attributes: [.editorAtom: EditorAtom(node)]))
            default:
                out.append(NSAttributedString(string: String(utf16CodeUnits: [objectReplacement], count: 1),
                                              attributes: [.editorAtom: EditorAtom(node)]))
            }
        }
        return out
    }

    /// the attributed text as inline content. A code block keeps text only, as its schema allows no marks.
    static func content(_ text: NSAttributedString, plain: Bool = false) -> [DocNode] {
        var out: [DocNode] = []
        let string = text.string as NSString
        func appendText(_ value: String, _ marks: [DocMark]) {
            guard !value.isEmpty else { return }
            var node = JSObject()
            node["type"] = "text"
            if !marks.isEmpty, !plain { node["marks"] = .array(marks.map(JSValue.object)) }
            node["text"] = .string(value)
            out.append(node)
        }
        text.enumerateAttributes(in: NSRange(location: 0, length: text.length)) { attributes, range, _ in
            let marks = (attributes[.editorMarks] as? EditorMarkSet)?.marks ?? []
            guard let atom = attributes[.editorAtom] as? EditorAtom, !plain else {
                appendText(string.substring(with: range), marks)
                return
            }
            // text typed against an atom takes its attributes; only the placeholder characters are the atom
            var start = range.location
            for index in range.location..<NSMaxRange(range) {
                let unit = string.character(at: index)
                guard unit == objectReplacement || unit == lineSeparator else { continue }
                appendText(string.substring(with: NSRange(location: start, length: index - start)), marks)
                out.append(atom.node)
                start = index + 1
            }
            appendText(string.substring(with: NSRange(location: start, length: NSMaxRange(range) - start)), marks)
        }
        return EditorSchema.joinText(out)
    }

    /// the UTF-16 length a node takes in the text: its text, or one character for anything else
    static func length(_ node: DocNode) -> Int {
        node.type == "text" ? (node.text ?? "").utf16.count : 1
    }

    static func length(_ content: [DocNode]) -> Int { content.reduce(0) { $0 + length($1) } }

    /// the plain text of a text block, atoms as their placeholder characters
    static func string(_ content: [DocNode]) -> String { attributed(content).string }
}

extension NSAttributedString.Key {
    nonisolated static let editorMarks = NSAttributedString.Key("SynapseNoteEditorMarks")
    nonisolated static let editorAtom = NSAttributedString.Key("SynapseNoteEditorAtom")
}

/// the marks on a run of text; two sets are equal when ProseMirror's `Mark.sameSet` would say so, so runs with the
/// same marks merge in the attributed string
nonisolated final class EditorMarkSet: NSObject, @unchecked Sendable {
    let marks: [DocMark]

    init(_ marks: [DocMark]) {
        self.marks = EditorSchema.sortMarks(marks)
    }

    override func isEqual(_ object: Any?) -> Bool {
        guard let other = object as? EditorMarkSet else { return false }
        return marks.count == other.marks.count && zip(marks, other.marks).allSatisfy { EditorSchema.sameMark($0, $1) }
    }

    override var hash: Int { marks.map(\.type).hashValue }

    func has(_ type: String) -> Bool { marks.contains { $0.type == type } }
    func mark(_ type: String) -> DocMark? { marks.first { $0.type == type } }
}

/// an inline node held by its placeholder character; each is its own object, so neighbouring atoms stay apart
nonisolated final class EditorAtom: NSObject, @unchecked Sendable {
    let node: DocNode

    init(_ node: DocNode) {
        self.node = node
    }

    override func isEqual(_ object: Any?) -> Bool { (object as AnyObject?) === self }
    override var hash: Int { ObjectIdentifier(self).hashValue }
}
