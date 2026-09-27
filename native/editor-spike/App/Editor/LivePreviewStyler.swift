import UIKit

/// What `DecoratedLayoutFragment` draws in a paragraph's leading indent.
enum Decoration: Equatable {
    case bullet
    case checkbox(checked: Bool)
    case quoteBar
    case codeBackground
    case disclosure(folded: Bool)
}

extension NSAttributedString.Key {
    /// Carries a `Decoration` (boxed) on the first character of a paragraph.
    static let spikeDecoration = NSAttributedString.Key("SpikeDecoration")
}

final class DecorationBox: NSObject {
    let value: Decoration
    init(_ value: Decoration) { self.value = value }
}

/// Applies live-preview attributes to the text storage, which stays the
/// Markdown source. Syntax outside the caret's line is collapsed with a
/// near-zero font and a clear color, so every character keeps its place and
/// offsets never diverge from `Y.Text`.
@MainActor
final class LivePreviewStyler {
    let index = LineIndex()
    private(set) var activeLines = Set<Int>()
    /// Locations of `<Accordion` lines that are folded (maintained by `FoldingController`).
    var isFolded: (Int) -> Bool = { _ in false }

    static let indentStep: CGFloat = 22
    static let componentHeight: CGFloat = 132

    private let body = UIFont.systemFont(ofSize: 17)
    private let mono = UIFont.monospacedSystemFont(ofSize: 15, weight: .regular)
    private let hidden: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 0.01),
        .foregroundColor: UIColor.clear,
    ]

    func rebuild(_ storage: NSTextStorage, selection: NSRange) {
        index.rebuild(storage.string as NSString)
        activeLines = lines(intersecting: selection)
        restyle(storage, lines: 0..<index.lines.count)
    }

    /// After a character edit (local or remote). Called inside `processEditing`.
    func charactersEdited(_ storage: NSTextStorage, editedRange: NSRange, delta: Int, selection: NSRange) {
        let changed = index.applyEdit(storage.string as NSString, editedRange: editedRange, delta: delta)
        let newActive = lines(intersecting: selection)
        let toStyle = Set(changed).union(newActive).union(activeLines.filter { $0 < index.lines.count })
        activeLines = newActive
        restyle(storage, lines: toStyle.sorted())
    }

    /// After a selection change: restyle the lines that gained or lost the caret.
    func selectionChanged(_ storage: NSTextStorage, selection: NSRange) {
        let newActive = lines(intersecting: selection)
        guard newActive != activeLines else { return }
        let toStyle = newActive.symmetricDifference(activeLines).filter { $0 < index.lines.count }
        activeLines = newActive
        storage.beginEditing()
        restyle(storage, lines: toStyle.sorted())
        storage.endEditing()
    }

    func lines(intersecting selection: NSRange) -> Set<Int> {
        guard let first = index.lineIndex(at: selection.location) else { return [] }
        let last = index.lineIndex(at: NSMaxRange(selection)) ?? first
        return Set(first...last)
    }

    func restyle<S: Sequence>(_ storage: NSTextStorage, lines indices: S) where S.Element == Int {
        for i in indices {
            style(storage, index.lines[i], active: activeLines.contains(i))
        }
    }

    private func paragraph(indent: CGFloat = 0, spacing: CGFloat = 4, minHeight: CGFloat = 0) -> NSParagraphStyle {
        let p = NSMutableParagraphStyle()
        p.firstLineHeadIndent = indent
        p.headIndent = indent
        p.paragraphSpacing = spacing
        p.minimumLineHeight = minHeight
        return p
    }

    private func leadingSpaces(_ storage: NSTextStorage, _ line: MarkdownScanner.Line) -> Int {
        let s = storage.string as NSString
        var n = 0
        while n < line.range.length, s.character(at: line.range.location + n) == 32 { n += 1 }
        return n
    }

    private func style(_ storage: NSTextStorage, _ line: MarkdownScanner.Line, active: Bool) {
        let full = line.fullRange
        guard NSMaxRange(full) <= storage.length else { return }
        storage.setAttributes([.font: body, .foregroundColor: UIColor.label, .paragraphStyle: paragraph()], range: full)
        var decoration: Decoration?

        switch line.kind {
        case .blank, .paragraph:
            break
        case .heading(let level):
            let sizes: [CGFloat] = [30, 24, 20, 18, 17, 16]
            storage.addAttribute(.font, value: UIFont.systemFont(ofSize: sizes[level - 1], weight: .bold), range: line.range)
            storage.addAttribute(.paragraphStyle, value: paragraph(spacing: 8), range: full)
        case .listItem(let ordered):
            let depth = CGFloat(leadingSpaces(storage, line) / 2)
            storage.addAttribute(.paragraphStyle, value: paragraph(indent: Self.indentStep * (depth + 1)), range: full)
            if !ordered && !active { decoration = .bullet }
        case .task(let checked, _):
            let depth = CGFloat(leadingSpaces(storage, line) / 2)
            storage.addAttribute(.paragraphStyle, value: paragraph(indent: Self.indentStep * (depth + 1)), range: full)
            if checked { storage.addAttributes([.foregroundColor: UIColor.secondaryLabel, .strikethroughStyle: 1], range: line.range) }
            if !active { decoration = .checkbox(checked: checked) }
        case .quote:
            storage.addAttributes([.foregroundColor: UIColor.secondaryLabel, .paragraphStyle: paragraph(indent: Self.indentStep)], range: full)
            if !active { decoration = .quoteBar }
        case .fence:
            storage.addAttributes([.font: mono, .foregroundColor: UIColor.tertiaryLabel], range: full)
            if !active { storage.addAttributes(hidden, range: full) }
        case .code:
            storage.addAttributes([.font: mono, .paragraphStyle: paragraph(indent: 12, spacing: 0)], range: full)
            decoration = .codeBackground
        case .frontmatter:
            storage.addAttributes([.font: UIFont.monospacedSystemFont(ofSize: 13, weight: .regular), .foregroundColor: UIColor.secondaryLabel], range: full)
        case .component:
            // The text stays in storage but takes no width; the line is tall
            // enough to hold the native view placed over it.
            storage.addAttributes(hidden, range: full)
            storage.addAttribute(.paragraphStyle, value: paragraph(spacing: 8, minHeight: Self.componentHeight), range: full)
        case .accordionOpen(let title):
            storage.addAttribute(.paragraphStyle, value: paragraph(indent: Self.indentStep, spacing: 6), range: full)
            if !active {
                storage.addAttributes(hidden, range: line.range)
                if let title { storage.addAttributes([.font: UIFont.systemFont(ofSize: 17, weight: .semibold), .foregroundColor: UIColor.label], range: title) }
            }
            decoration = .disclosure(folded: isFolded(line.range.location))
        case .accordionClose:
            storage.addAttribute(.foregroundColor, value: UIColor.tertiaryLabel, range: full)
            if !active { storage.addAttributes(hidden, range: full) }
        }

        for span in line.spans {
            switch span.style {
            case .strong: storage.addAttribute(.font, value: bolded(storage, at: span.range.location), range: span.range)
            case .emphasis: storage.addAttribute(.font, value: italicized(storage, at: span.range.location), range: span.range)
            case .code: storage.addAttributes([.font: mono, .backgroundColor: UIColor.secondarySystemFill], range: span.range)
            case .link: storage.addAttributes([.foregroundColor: UIColor.link, .underlineStyle: NSUnderlineStyle.single.rawValue], range: span.range)
            }
        }

        let syntax = line.syntax + (line.marker.map { [$0] } ?? [])
        for r in syntax where NSMaxRange(r) <= storage.length {
            if active {
                storage.addAttribute(.foregroundColor, value: UIColor.tertiaryLabel, range: r)
            } else if case .listItem(ordered: true) = line.kind, r == line.marker {
                storage.addAttribute(.foregroundColor, value: UIColor.secondaryLabel, range: r)
            } else {
                storage.addAttributes(hidden, range: r)
            }
        }

        if let decoration, full.length > 0 {
            storage.addAttribute(.spikeDecoration, value: DecorationBox(decoration), range: NSRange(location: full.location, length: 1))
        }
    }

    private func bolded(_ storage: NSTextStorage, at location: Int) -> UIFont {
        let current = storage.attribute(.font, at: location, effectiveRange: nil) as? UIFont ?? body
        return UIFont(descriptor: current.fontDescriptor.withSymbolicTraits(.traitBold) ?? current.fontDescriptor, size: current.pointSize)
    }

    private func italicized(_ storage: NSTextStorage, at location: Int) -> UIFont {
        let current = storage.attribute(.font, at: location, effectiveRange: nil) as? UIFont ?? body
        return UIFont(descriptor: current.fontDescriptor.withSymbolicTraits(.traitItalic) ?? current.fontDescriptor, size: current.pointSize)
    }
}
