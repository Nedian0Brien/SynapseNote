import AppKit

/// What a paragraph draws in its leading indent. The storage keeps the
/// Markdown source; the marker characters themselves are hidden.
struct ParagraphDecoration: Equatable {
    enum Marker: Equatable {
        case bullet
        case ordered(String)
        case checkbox(checked: Bool)
    }

    /// The list item marker drawn just before the text.
    var marker: Marker?
    /// Nested blockquotes: one bar each.
    var quoteDepth = 0
    /// A thematic break (`---`) drawn as a line across the paragraph.
    var rule = false
    /// Where the text starts, from the container's left edge (the paragraph's head indent).
    var textIndent: CGFloat = 0

    var isEmpty: Bool { marker == nil && quoteDepth == 0 && !rule }
}

/// Boxes a `ParagraphDecoration` for an attribute value.
final class DecorationBox: NSObject {
    let value: ParagraphDecoration
    init(_ value: ParagraphDecoration) { self.value = value }

    // Equal boxes keep restyling from rewriting a paragraph that did not change.
    override func isEqual(_ object: Any?) -> Bool {
        (object as? DecorationBox)?.value == value
    }

    override var hash: Int { 1 }
}

extension NSAttributedString.Key {
    /// A `DecorationBox` on the first character of a decorated paragraph.
    static let synapseDecoration = NSAttributedString.Key("SynapseDecoration")
    /// Characters the caret skips over to the end of the run: a list item's
    /// indentation and marker, a thematic break.
    static let synapseCaretSkip = NSAttributedString.Key("SynapseCaretSkip")
    /// The target of a link (URL, wiki link name or relative document path), followed with ⌘-click.
    static let synapseLinkTarget = NSAttributedString.Key("SynapseLinkTarget")
}

enum DecorationMetrics {
    /// Head indent per list level.
    static let listStep: CGFloat = 24
    /// Head indent per blockquote level; the bar sits in this space.
    static let quoteStep: CGFloat = 18
    static let checkboxSize: CGFloat = 14
}
