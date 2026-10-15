import Foundation
import JavaScriptCore

// Swift mirrors of the JSON the editing bundle returns
// (`packages/core/src/editing-model/layout.ts`, `native-session.ts`).
// Every offset is a UTF-16 code unit index, the unit `NSString` uses.

public struct SourceRange: Codable, Equatable, Sendable {
    public var from: Int
    public var to: Int

    public init(from: Int, to: Int) {
        self.from = from
        self.to = to
    }

    public var nsRange: NSRange { NSRange(location: from, length: to - from) }
}

public struct HiddenRange: Codable, Equatable, Sendable {
    public var from: Int
    public var to: Int
    /// `open`, `close`, `prefix`, `escape` or `break`.
    public var kind: String
}

public struct WidgetRange: Codable, Equatable, Sendable {
    public var from: Int
    public var to: Int
    /// `list-marker`, `entity`, `inline` or `block`.
    public var kind: String
    /// The mdast node type the widget stands for (`table`, `code`, `listItem`, …).
    public var node: String
    public var label: String?
}

public struct MarkSpan: Codable, Equatable, Sendable {
    /// `strong`, `emphasis`, `delete`, `mark`, `inlineCode`, `link`, `linkReference` or `wikiLink`.
    public var type: String
    public var open: [Int]
    public var close: [Int]
    public var inclusive: Bool

    /// The text between the opening and closing syntax.
    public var content: SourceRange { SourceRange(from: open[1], to: close[0]) }
}

public struct StyledSpan: Codable, Equatable, Sendable {
    public var from: Int
    public var to: Int
    public var node: String
}

public struct Layout: Codable, Equatable, Sendable {
    public var hidden: [HiddenRange]
    public var widgets: [WidgetRange]
    public var marks: [MarkSpan]
    public var spans: [StyledSpan]
}

/// A top-level block: its source range and mdast type (`heading`, `code`, `list`, …).
public struct Block: Codable, Equatable, Sendable {
    public var from: Int
    public var to: Int
    public var type: String

    public var nsRange: NSRange { NSRange(location: from, length: to - from) }
}

public struct Snapshot: Codable, Equatable, Sendable {
    public var layout: Layout
    public var blocks: [Block]
}

public struct SourceChange: Codable, Equatable, Sendable {
    public var from: Int
    public var to: Int
    public var insert: String

    public init(from: Int, to: Int, insert: String) {
        self.from = from
        self.to = to
        self.insert = insert
    }
}

public struct Clipboard: Codable, Equatable, Sendable {
    public var markdown: String
}

public struct EditResult: Codable, Equatable, Sendable {
    /// Changes in the offsets of the source before the edit, ascending and
    /// non-overlapping. Apply them from last to first.
    public var changes: [SourceChange]
    public var anchor: Int
    public var head: Int
    /// The source range to restyle, in the new source.
    public var dirty: SourceRange
    /// Layout entries that intersect `dirty`.
    public var layout: Layout
    /// Blocks that intersect `dirty`.
    public var blocks: [Block]
    public var clipboard: Clipboard?
    /// A UI request from the model, such as opening the link dialog.
    public var ui: String?
}

public struct RemoteResult: Codable, Equatable, Sendable {
    public var anchor: Int
    public var head: Int
    public var dirty: SourceRange
    public var layout: Layout
    public var blocks: [Block]
}

/// The actions the editing model understands (`EditAction` in `fixtures.ts`).
public enum EditAction: Encodable, Equatable, Sendable {
    public enum Key: String, Sendable {
        case backspace = "Backspace", delete = "Delete", enter = "Enter", shiftEnter = "Shift-Enter"
        case tab = "Tab", shiftTab = "Shift-Tab", arrowRight = "ArrowRight", arrowLeft = "ArrowLeft"
    }

    public enum Mark: String, Sendable { case bold, italic, code, strike, highlight }

    public enum Block: String, Sendable {
        case paragraph, h1, h2, h3, h4, h5, h6, bullet, ordered, task, quote, code
    }

    case text(String)
    case key(Key)
    case toggle(Mark)
    case block(Block)
    case moveUp, moveDown
    case paste(text: String?, html: String?, asMarkdown: Bool)
    case link(href: String, label: String?)
    case footnote
    case copy

    private enum CodingKeys: String, CodingKey { case type, text, key, mark, block, direction, html, `as`, href, label }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .text(let text):
            try c.encode("text", forKey: .type)
            try c.encode(text, forKey: .text)
        case .key(let key):
            try c.encode("key", forKey: .type)
            try c.encode(key.rawValue, forKey: .key)
        case .toggle(let mark):
            try c.encode("toggle", forKey: .type)
            try c.encode(mark.rawValue, forKey: .mark)
        case .block(let block):
            try c.encode("block", forKey: .type)
            try c.encode(block.rawValue, forKey: .block)
        case .moveUp, .moveDown:
            try c.encode("move", forKey: .type)
            try c.encode(self == .moveUp ? "up" : "down", forKey: .direction)
        case .paste(let text, let html, let asMarkdown):
            try c.encode("paste", forKey: .type)
            try c.encodeIfPresent(text, forKey: .text)
            try c.encodeIfPresent(html, forKey: .html)
            if asMarkdown { try c.encode("markdown", forKey: .as) }
        case .link(let href, let label):
            try c.encode("link", forKey: .type)
            try c.encode(href, forKey: .href)
            try c.encodeIfPresent(label, forKey: .label)
        case .footnote:
            try c.encode("footnote", forKey: .type)
        case .copy:
            try c.encode("copy", forKey: .type)
        }
    }
}

/// A document's source, cursor state and layout, held in JavaScriptCore
/// (`NativeEditorSession` in `native-session.ts`).
@MainActor
public final class EditorSession {
    private let runtime: EditingRuntime
    private let value: JSValue

    init(runtime: EditingRuntime, value: JSValue) {
        self.runtime = runtime
        self.value = value
    }

    public var source: String { value.forProperty("source").toString() }

    /// The whole document's layout and blocks, for the first paint.
    public func snapshot() throws -> Snapshot {
        try runtime.decode(Snapshot.self, from: runtime.call(value, "snapshot", []))
    }

    /// A selection the text view made itself (click, drag, arrow keys).
    public func select(anchor: Int, head: Int) throws {
        _ = try runtime.call(value, "select", [anchor, head])
    }

    public func edit(_ actions: [EditAction]) throws -> EditResult {
        let json = String(decoding: try JSONEncoder().encode(actions), as: UTF8.self)
        return try edit(actionsJSON: json)
    }

    /// Run actions given as the JSON array `edit.json` uses.
    public func edit(actionsJSON: String) throws -> EditResult {
        try runtime.decode(EditResult.self, from: runtime.call(value, "edit", [actionsJSON]))
    }

    /// Changes made elsewhere (another device, an agent). Each change is in the
    /// offsets the previous one left, the order a Y.Text delta arrives in.
    public func applyRemote(_ changes: [SourceChange]) throws -> RemoteResult {
        let json = String(decoding: try JSONEncoder().encode(changes), as: UTF8.self)
        return try runtime.decode(RemoteResult.self, from: runtime.call(value, "applyRemote", [json]))
    }
}
