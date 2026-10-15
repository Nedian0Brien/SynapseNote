import AppKit
import EditingCore

/// Turns the editing model's layout into text attributes. The text storage
/// always holds the Markdown source: hidden syntax keeps its characters but is
/// drawn with a near-zero font and a clear color, so storage offsets stay equal
/// to source offsets (SPEC.md §2–3).
@MainActor
final class LiveStyler {
    let bodyFont = NSFont.systemFont(ofSize: 15)
    let monoFont = NSFont.monospacedSystemFont(ofSize: 13.5, weight: .regular)
    /// The source view: the whole Markdown source in a fixed-width font.
    var sourceMode = false

    private let headingSizes: [CGFloat] = [28, 23, 19, 17, 15, 15]

    private lazy var paragraph: NSParagraphStyle = {
        let style = NSMutableParagraphStyle()
        style.lineSpacing = 3
        style.paragraphSpacing = 6
        return style
    }()

    var baseAttributes: [NSAttributedString.Key: Any] {
        [.font: sourceMode ? monoFont : bodyFont, .foregroundColor: NSColor.labelColor, .paragraphStyle: paragraph]
    }

    private let hiddenAttributes: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: 0.01),
        .foregroundColor: NSColor.clear,
    ]

    func restyle(_ storage: NSTextStorage, dirty: SourceRange, layout: Layout, blocks: [Block]) {
        let text = storage.string as NSString
        guard let range = clamp(dirty.nsRange, storage.length) else { return }
        storage.setAttributes(baseAttributes, range: range)
        if sourceMode { return }

        for block in blocks {
            guard let r = clamp(block.nsRange, storage.length) else { continue }
            switch block.type {
            case "heading":
                let level = headingLevel(text, at: block.from)
                let size = headingSizes[max(0, min(level, 6) - 1)]
                storage.addAttribute(.font, value: NSFont.systemFont(ofSize: size, weight: .bold), range: r)
            case "code":
                storage.addAttributes([.font: monoFont, .backgroundColor: NSColor.quaternarySystemFill], range: r)
            case "blockquote":
                storage.addAttribute(.foregroundColor, value: NSColor.secondaryLabelColor, range: r)
            case "thematicBreak", "mdxJsxFlowElement", "html":
                storage.addAttribute(.foregroundColor, value: NSColor.tertiaryLabelColor, range: r)
            default:
                break
            }
        }

        for mark in layout.marks {
            guard let r = clamp(mark.content.nsRange, storage.length) else { continue }
            switch mark.type {
            case "strong": addTrait(.boldFontMask, storage, r)
            case "emphasis": addTrait(.italicFontMask, storage, r)
            case "delete": storage.addAttribute(.strikethroughStyle, value: NSUnderlineStyle.single.rawValue, range: r)
            case "mark": storage.addAttribute(.backgroundColor, value: NSColor.systemYellow.withAlphaComponent(0.35), range: r)
            case "inlineCode":
                storage.addAttributes([.font: monoFont, .backgroundColor: NSColor.quaternarySystemFill], range: r)
            case "link", "linkReference", "wikiLink":
                storage.addAttribute(.foregroundColor, value: NSColor.linkColor, range: r)
            default:
                break
            }
        }

        for widget in layout.widgets where widget.kind == "list-marker" {
            guard let r = clamp(NSRange(location: widget.from, length: widget.to - widget.from), storage.length) else { continue }
            storage.addAttribute(.foregroundColor, value: NSColor.secondaryLabelColor, range: r)
        }

        for hidden in layout.hidden {
            guard let r = clamp(NSRange(location: hidden.from, length: hidden.to - hidden.from), storage.length) else { continue }
            storage.addAttributes(hiddenAttributes, range: r)
        }
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

    private func addTrait(_ trait: NSFontTraitMask, _ storage: NSTextStorage, _ range: NSRange) {
        storage.enumerateAttribute(.font, in: range) { value, sub, _ in
            let font = (value as? NSFont) ?? bodyFont
            storage.addAttribute(.font, value: NSFontManager.shared.convert(font, toHaveTrait: trait), range: sub)
        }
    }

    private func clamp(_ range: NSRange, _ length: Int) -> NSRange? {
        let from = max(0, min(range.location, length))
        let to = max(from, min(range.location + range.length, length))
        return to > from ? NSRange(location: from, length: to - from) : nil
    }
}
