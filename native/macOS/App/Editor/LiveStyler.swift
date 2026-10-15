import AppKit
import EditingCore

/// Turns the editing model's layout into text attributes. The text storage
/// always holds the Markdown source: hidden syntax keeps its characters but is
/// drawn with a near-zero font and a clear color, so storage offsets stay equal
/// to source offsets (SPEC.md §2–3). Block decorations (list markers, quote
/// bars, rules) are drawn by `DecoratedLayoutFragment` from a paragraph attribute.
@MainActor
final class LiveStyler {
    let bodyFont = NSFont.systemFont(ofSize: 15)
    let monoFont = NSFont.monospacedSystemFont(ofSize: 13.5, weight: .regular)
    /// The source view: the whole Markdown source in a fixed-width font.
    var sourceMode = false

    private let headingSizes: [CGFloat] = [28, 23, 19, 17, 15, 15]

    private func paragraphStyle(indent: CGFloat = 0) -> NSParagraphStyle {
        let style = NSMutableParagraphStyle()
        style.lineSpacing = 3
        style.paragraphSpacing = 6
        // Lines whose characters are all hidden (an empty list item, a rule) keep a body line's height.
        style.minimumLineHeight = 19
        style.firstLineHeadIndent = indent
        style.headIndent = indent
        return style
    }

    private lazy var plainParagraph = paragraphStyle()

    var baseAttributes: [NSAttributedString.Key: Any] {
        [.font: sourceMode ? monoFont : bodyFont, .foregroundColor: NSColor.labelColor, .paragraphStyle: plainParagraph]
    }

    private let hiddenAttributes: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: 0.01),
        .foregroundColor: NSColor.clear,
    ]

    /// Restyle `dirty`. The attributes are built off to the side and only
    /// paragraphs whose attributes changed are written back, so TextKit
    /// re-lays out the edited paragraph rather than every block around it.
    func restyle(_ storage: NSTextStorage, dirty: SourceRange, layout: Layout, blocks: [Block]) {
        let text = storage.string as NSString
        guard let range = clamp(dirty.nsRange, storage.length) else { return }
        let target = Target(
            string: NSMutableAttributedString(string: text.substring(with: range), attributes: baseAttributes),
            base: range.location
        )
        if !sourceMode { style(target, text, layout: layout, blocks: blocks) }

        let local = target.string.string as NSString
        local.enumerateSubstrings(in: NSRange(location: 0, length: local.length), options: [.byParagraphs, .substringNotRequired]) { _, _, paragraph, _ in
            let absolute = NSRange(location: paragraph.location + range.location, length: paragraph.length)
            let wanted = target.string.attributedSubstring(from: paragraph)
            if storage.attributedSubstring(from: absolute).isEqual(to: wanted) { return }
            wanted.enumerateAttributes(in: NSRange(location: 0, length: wanted.length)) { attributes, run, _ in
                storage.setAttributes(attributes, range: NSRange(location: absolute.location + run.location, length: run.length))
            }
        }
    }

    /// The attributes being built for `[base, base + string.length)` of the source.
    private struct Target {
        let string: NSMutableAttributedString
        let base: Int

        /// `range` (source offsets) clipped to the target, in target offsets.
        func local(_ range: NSRange) -> NSRange? {
            let from = max(range.location, base)
            let to = min(range.location + range.length, base + string.length)
            return to > from ? NSRange(location: from - base, length: to - from) : nil
        }

        func add(_ key: NSAttributedString.Key, _ value: Any, _ range: NSRange) {
            if let r = local(range) { string.addAttribute(key, value: value, range: r) }
        }

        func add(_ attributes: [NSAttributedString.Key: Any], _ range: NSRange) {
            if let r = local(range) { string.addAttributes(attributes, range: r) }
        }
    }

    private func style(_ target: Target, _ text: NSString, layout: Layout, blocks: [Block]) {
        for block in blocks {
            let r = block.nsRange
            switch block.type {
            case "heading":
                let level = headingLevel(text, at: block.from)
                let size = headingSizes[max(0, min(level, 6) - 1)]
                target.add(.font, NSFont.systemFont(ofSize: size, weight: .bold), r)
            case "code":
                target.add([.font: monoFont, .backgroundColor: NSColor.quaternarySystemFill], r)
            case "blockquote":
                styleQuote(target, text, r)
            case "list":
                styleList(target, text, r, layout: layout)
            case "thematicBreak":
                target.add(hiddenAttributes, r)
                target.add(.synapseCaretSkip, true, r)
                decorate(target, text, paragraphAt: r.location, ParagraphDecoration(rule: true))
            case "mdxJsxFlowElement", "html":
                target.add(.foregroundColor, NSColor.tertiaryLabelColor, r)
            default:
                break
            }
        }

        for mark in layout.marks {
            let r = mark.content.nsRange
            switch mark.type {
            case "strong": addTrait(.boldFontMask, target, r)
            case "emphasis": addTrait(.italicFontMask, target, r)
            case "delete": target.add(.strikethroughStyle, NSUnderlineStyle.single.rawValue, r)
            case "mark": target.add(.backgroundColor, NSColor.systemYellow.withAlphaComponent(0.35), r)
            case "inlineCode":
                target.add([.font: monoFont, .backgroundColor: NSColor.quaternarySystemFill], r)
            case "link", "wikiLink":
                target.add(.foregroundColor, NSColor.linkColor, r)
                if let destination = linkTarget(mark, text) {
                    target.add(.synapseLinkTarget, destination, r)
                }
            case "linkReference":
                target.add(.foregroundColor, NSColor.linkColor, r)
            default:
                break
            }
        }

        for span in layout.spans where span.node == "tag" {
            target.add([
                .foregroundColor: NSColor.controlAccentColor,
                .backgroundColor: NSColor.controlAccentColor.withAlphaComponent(0.14),
            ], NSRange(location: span.from, length: span.to - span.from))
        }

        for widget in layout.widgets where widget.kind == "inline" && widget.node == "footnoteReference" {
            styleFootnoteReference(target, text, NSRange(location: widget.from, length: widget.to - widget.from))
        }

        for hidden in layout.hidden {
            target.add(hiddenAttributes, NSRange(location: hidden.from, length: hidden.to - hidden.from))
        }
    }

    // MARK: Blocks

    /// Each list line: hide its indentation and marker, indent by depth, and
    /// draw the marker. Continuation lines indent to their item's text.
    private func styleList(_ target: Target, _ text: NSString, _ range: NSRange, layout: Layout) {
        var markers: [Int: WidgetRange] = [:]
        for widget in layout.widgets where widget.kind == "list-marker" {
            markers[text.lineRange(for: NSRange(location: widget.from, length: 0)).location] = widget
        }
        text.enumerateSubstrings(in: range, options: [.byLines, .substringNotRequired]) { _, line, _, _ in
            guard line.length > 0 else { return }
            let indentEnd = self.leadingSpaceEnd(text, line)
            let columns = self.columns(text, from: line.location, to: indentEnd)
            if let widget = markers[line.location] {
                let depth = columns / 2
                let textIndent = CGFloat(depth + 1) * DecorationMetrics.listStep
                let skip = NSRange(location: line.location, length: max(0, widget.to - line.location))
                target.add(self.hiddenAttributes, skip)
                target.add(.synapseCaretSkip, true, skip)
                target.add(.paragraphStyle, self.paragraphStyle(indent: textIndent), line)
                let marker = self.marker(text, widget)
                self.decorate(target, text, paragraphAt: line.location, ParagraphDecoration(marker: marker, textIndent: textIndent))
            } else {
                let indent = CGFloat(max(1, (columns + 1) / 2)) * DecorationMetrics.listStep
                let skip = NSRange(location: line.location, length: indentEnd - line.location)
                if skip.length > 0 { target.add(self.hiddenAttributes, skip) }
                target.add(.paragraphStyle, self.paragraphStyle(indent: indent), line)
            }
        }
    }

    private func marker(_ text: NSString, _ widget: WidgetRange) -> ParagraphDecoration.Marker {
        if let label = widget.label { return .ordered(label) }
        let source = text.substring(with: NSRange(location: widget.from, length: widget.to - widget.from))
        if let box = source.range(of: #"\[[ xX]\]"#, options: .regularExpression) {
            return .checkbox(checked: source[box].contains(where: { $0 == "x" || $0 == "X" }))
        }
        return .bullet
    }

    /// Quote lines: a bar per level and a matching indent. The `>` markers are hidden by the layout.
    private func styleQuote(_ target: Target, _ text: NSString, _ range: NSRange) {
        target.add(.foregroundColor, NSColor.secondaryLabelColor, range)
        text.enumerateSubstrings(in: range, options: [.byLines, .substringNotRequired]) { _, line, _, _ in
            guard line.length > 0 else { return }
            var depth = 0
            var i = line.location
            while i < line.location + line.length {
                let c = text.character(at: i)
                if c == 0x3E { depth += 1 } else if c != 0x20 { break }
                i += 1
            }
            depth = max(depth, 1)
            let indent = CGFloat(depth) * DecorationMetrics.quoteStep
            target.add(.paragraphStyle, self.paragraphStyle(indent: indent), line)
            self.decorate(target, text, paragraphAt: line.location, ParagraphDecoration(quoteDepth: depth, textIndent: indent))
        }
    }

    private func decorate(_ target: Target, _ text: NSString, paragraphAt location: Int, _ decoration: ParagraphDecoration) {
        let paragraph = text.paragraphRange(for: NSRange(location: location, length: 0))
        guard paragraph.length > 0 else { return }
        target.add(.synapseDecoration, DecorationBox(decoration), NSRange(location: paragraph.location, length: 1))
    }

    // MARK: Inline

    /// `[^1]` shows as a raised `1`; the brackets and caret are hidden.
    private func styleFootnoteReference(_ target: Target, _ text: NSString, _ range: NSRange) {
        guard range.length > 3, NSMaxRange(range) <= text.length,
              text.substring(with: NSRange(location: range.location, length: 2)) == "[^" else { return }
        target.add(hiddenAttributes, NSRange(location: range.location, length: 2))
        target.add(hiddenAttributes, NSRange(location: range.location + range.length - 1, length: 1))
        target.add([
            .font: NSFont.systemFont(ofSize: 11, weight: .semibold),
            .baselineOffset: 6,
            .foregroundColor: NSColor.controlAccentColor,
        ], NSRange(location: range.location + 2, length: range.length - 3))
    }

    /// The target a ⌘-click follows: the URL of `[text](url "title")` or `<url>`,
    /// the document name of `[[name|label]]`.
    private func linkTarget(_ mark: MarkSpan, _ text: NSString) -> String? {
        let open = text.substring(with: NSRange(location: mark.open[0], length: mark.open[1] - mark.open[0]))
        let close = text.substring(with: NSRange(location: mark.close[0], length: mark.close[1] - mark.close[0]))
        if mark.type == "wikiLink" {
            if open.count > 2 { return String(open.dropFirst(2).dropLast()) }
            return text.substring(with: mark.content.nsRange)
        }
        if open == "<" { return text.substring(with: mark.content.nsRange) }
        guard close.hasPrefix("](") else { return nil }
        var inner = close.dropFirst(2).dropLast()
        if inner.hasPrefix("<"), let end = inner.firstIndex(of: ">") {
            inner = inner[inner.index(after: inner.startIndex)..<end]
        } else if let space = inner.firstIndex(where: { $0 == " " || $0 == "\t" }) {
            inner = inner[..<space]
        }
        return inner.isEmpty ? nil : String(inner)
    }

    // MARK: Helpers

    private func leadingSpaceEnd(_ text: NSString, _ line: NSRange) -> Int {
        var i = line.location
        while i < line.location + line.length {
            let c = text.character(at: i)
            if c != 0x20 && c != 0x09 { break }
            i += 1
        }
        return i
    }

    /// Indentation width in columns (a tab counts as four).
    private func columns(_ text: NSString, from: Int, to: Int) -> Int {
        var n = 0
        for i in from..<to { n += text.character(at: i) == 0x09 ? 4 : 1 }
        return n
    }

    private func headingLevel(_ text: NSString, at location: Int) -> Int {
        var level = 0
        var i = location
        while i < text.length, text.character(at: i) == 0x23 /* # */ {
            level += 1
            i += 1
        }
        return max(level, 1)
    }

    private func addTrait(_ trait: NSFontTraitMask, _ target: Target, _ range: NSRange) {
        guard let r = target.local(range) else { return }
        target.string.enumerateAttribute(.font, in: r) { value, sub, _ in
            let font = (value as? NSFont) ?? bodyFont
            target.string.addAttribute(.font, value: NSFontManager.shared.convert(font, toHaveTrait: trait), range: sub)
        }
    }

    private func clamp(_ range: NSRange, _ length: Int) -> NSRange? {
        let from = max(0, min(range.location, length))
        let to = max(from, min(range.location + range.length, length))
        return to > from ? NSRange(location: from, length: to - from) : nil
    }
}
