import Foundation

/// Line-level Markdown scanner for the spike's subset: headings, emphasis,
/// inline code, links, lists, tasks, quotes, fenced code, frontmatter, a
/// self-closing `<DatabaseView … />`, and `<Accordion …>` / `</Accordion>`.
///
/// It is not the SynapseNote parser (that stays in core, TypeScript); it only
/// finds the ranges live preview needs. Ranges are UTF-16 (`NSString`).
enum MarkdownScanner {
    enum State: Equatable {
        case normal
        case frontmatter
        case code
    }

    enum Kind: Equatable {
        case blank
        case paragraph
        case heading(level: Int)
        case listItem(ordered: Bool)
        case task(checked: Bool, box: Int)  // box = location of the space/x
        case quote
        case fence
        case code
        case frontmatter
        case component(name: String)
        case accordionOpen(title: NSRange?)
        case accordionClose
    }

    enum SpanStyle: Equatable {
        case strong, emphasis, code, link
    }

    struct Span: Equatable {
        var range: NSRange
        var style: SpanStyle
    }

    struct Line: Equatable {
        /// The line without its terminator.
        var range: NSRange
        /// The line including its terminator.
        var fullRange: NSRange
        var kind: Kind
        /// Leading marker (`## `, `- `, `- [ ] `, `> `) — hidden off the caret line.
        var marker: NSRange?
        /// Inline syntax characters (`**`, `` ` ``, `[`, `](url)`) — hidden off the caret line.
        var syntax: [NSRange]
        var spans: [Span]
        /// Scanner state after this line.
        var stateAfter: State

        mutating func shift(by delta: Int) {
            range.location += delta
            fullRange.location += delta
            marker?.location += delta
            if case .task(let checked, let box) = kind { kind = .task(checked: checked, box: box + delta) }
            if case .accordionOpen(let title?) = kind { kind = .accordionOpen(title: NSRange(location: title.location + delta, length: title.length)) }
            for i in syntax.indices { syntax[i].location += delta }
            for i in spans.indices { spans[i].range.location += delta }
        }
    }

    // MARK: - Line scanning

    private static func regex(_ pattern: String) -> NSRegularExpression {
        try! NSRegularExpression(pattern: pattern)
    }

    private static let heading = regex("^(#{1,6})[ \\t]+")
    private static let task = regex("^[ \\t]*[-*+][ \\t]\\[([ xX])\\][ \\t]")
    private static let list = regex("^[ \\t]*(?:([-*+])|(\\d{1,9}[.)]))[ \\t]")
    private static let quote = regex("^>[ \\t]?")
    private static let component = regex("^<(DatabaseView)\\b[^\\n]*/>[ \\t]*$")
    private static let accordionOpen = regex("^<Accordion\\b(?:[^\\n>]*?\\btitle=\"([^\"]*)\")?[^\\n]*>[ \\t]*$")
    private static let accordionClose = regex("^</Accordion>[ \\t]*$")
    private static let fence = regex("^[ \\t]*(```|~~~)")

    private static let inlineCode = regex("`([^`\\n]+)`")
    private static let strong = regex("\\*\\*([^*\\n]+)\\*\\*")
    private static let emphasis = regex("(?<![*\\w])[*_]([^*_\\n]+)[*_](?![*\\w])")
    private static let link = regex("\\[([^\\]\\n]+)\\]\\(([^)\\n]*)\\)")

    /// Scan every line that intersects `range` (expanded to whole lines),
    /// starting in `state`.
    static func scan(_ string: NSString, range: NSRange, state initial: State) -> [Line] {
        var lines: [Line] = []
        var state = initial
        guard range.location < string.length else { return [] }
        var location = string.lineRange(for: NSRange(location: range.location, length: 0)).location
        let end = NSMaxRange(range)
        // A text ending in a newline has no line after it: TextKit's empty
        // last paragraph carries no syntax, so it is not scanned.
        while location < string.length && (location < end || lines.isEmpty) {
            var lineEnd = 0
            var contentsEnd = 0
            string.getLineStart(nil, end: &lineEnd, contentsEnd: &contentsEnd, for: NSRange(location: location, length: 0))
            let lineRange = NSRange(location: location, length: contentsEnd - location)
            let full = NSRange(location: location, length: lineEnd - location)
            let line = scanLine(string, lineRange, full, state: state, isFirstLine: location == 0)
            lines.append(line)
            state = line.stateAfter
            location = lineEnd
        }
        return lines
    }

    static func scanLine(_ string: NSString, _ range: NSRange, _ full: NSRange, state: State, isFirstLine: Bool) -> Line {
        let text = string.substring(with: range)
        let local = NSRange(location: 0, length: (text as NSString).length)
        func abs(_ r: NSRange) -> NSRange { NSRange(location: r.location + range.location, length: r.length) }
        func line(_ kind: Kind, marker: NSRange? = nil, next: State, inline: Bool = false, contentFrom: Int = 0) -> Line {
            var syntax: [NSRange] = []
            var spans: [Span] = []
            if inline {
                (syntax, spans) = scanInline(text, from: contentFrom)
                syntax = syntax.map(abs)
                spans = spans.map { Span(range: abs($0.range), style: $0.style) }
            }
            return Line(range: range, fullRange: full, kind: kind, marker: marker.map(abs), syntax: syntax, spans: spans, stateAfter: next)
        }

        switch state {
        case .frontmatter:
            return line(.frontmatter, next: text == "---" || text == "..." ? .normal : .frontmatter)
        case .code:
            if fence.firstMatch(in: text, range: local) != nil { return line(.fence, next: .normal) }
            return line(.code, next: .code)
        case .normal:
            break
        }

        if isFirstLine && text == "---" { return line(.frontmatter, next: .frontmatter) }
        if text.trimmingCharacters(in: .whitespaces).isEmpty { return line(.blank, next: .normal) }
        if fence.firstMatch(in: text, range: local) != nil { return line(.fence, next: .code) }
        if let m = component.firstMatch(in: text, range: local) {
            return line(.component(name: (text as NSString).substring(with: m.range(at: 1))), next: .normal)
        }
        if accordionClose.firstMatch(in: text, range: local) != nil { return line(.accordionClose, next: .normal) }
        if let m = accordionOpen.firstMatch(in: text, range: local) {
            let title = m.range(at: 1).location == NSNotFound ? nil : abs(m.range(at: 1))
            return line(.accordionOpen(title: title), next: .normal)
        }
        if let m = heading.firstMatch(in: text, range: local) {
            return line(.heading(level: m.range(at: 1).length), marker: m.range, next: .normal, inline: true, contentFrom: m.range.length)
        }
        if let m = task.firstMatch(in: text, range: local) {
            let box = m.range(at: 1)
            let checked = (text as NSString).substring(with: box) != " "
            return line(.task(checked: checked, box: box.location + range.location), marker: m.range, next: .normal, inline: true, contentFrom: m.range.length)
        }
        if let m = list.firstMatch(in: text, range: local) {
            return line(.listItem(ordered: m.range(at: 2).location != NSNotFound), marker: m.range, next: .normal, inline: true, contentFrom: m.range.length)
        }
        if let m = quote.firstMatch(in: text, range: local) {
            return line(.quote, marker: m.range, next: .normal, inline: true, contentFrom: m.range.length)
        }
        return line(.paragraph, next: .normal, inline: true)
    }

    /// Inline spans in `text` from `start`, as line-local ranges.
    static func scanInline(_ text: String, from start: Int) -> (syntax: [NSRange], spans: [Span]) {
        let ns = text as NSString
        let searchRange = NSRange(location: start, length: ns.length - start)
        var taken: [NSRange] = []
        var syntax: [NSRange] = []
        var spans: [Span] = []
        func free(_ r: NSRange) -> Bool { !taken.contains { NSIntersectionRange($0, r).length > 0 } }

        for m in inlineCode.matches(in: text, range: searchRange) where free(m.range) {
            taken.append(m.range)
            syntax.append(NSRange(location: m.range.location, length: 1))
            syntax.append(NSRange(location: NSMaxRange(m.range) - 1, length: 1))
            spans.append(Span(range: m.range(at: 1), style: .code))
        }
        for m in link.matches(in: text, range: searchRange) where free(m.range) {
            taken.append(m.range)
            let label = m.range(at: 1)
            syntax.append(NSRange(location: m.range.location, length: 1))
            syntax.append(NSRange(location: NSMaxRange(label), length: NSMaxRange(m.range) - NSMaxRange(label)))
            spans.append(Span(range: label, style: .link))
        }
        for m in strong.matches(in: text, range: searchRange) where free(m.range) {
            taken.append(m.range)
            syntax.append(NSRange(location: m.range.location, length: 2))
            syntax.append(NSRange(location: NSMaxRange(m.range) - 2, length: 2))
            spans.append(Span(range: m.range(at: 1), style: .strong))
        }
        for m in emphasis.matches(in: text, range: searchRange) where free(m.range) {
            taken.append(m.range)
            syntax.append(NSRange(location: m.range.location, length: 1))
            syntax.append(NSRange(location: NSMaxRange(m.range) - 1, length: 1))
            spans.append(Span(range: m.range(at: 1), style: .emphasis))
        }
        return (syntax, spans)
    }
}

/// The scanned lines of a document, updated incrementally on each edit.
final class LineIndex {
    private(set) var lines: [MarkdownScanner.Line] = []

    func rebuild(_ string: NSString) {
        lines = string.length == 0 ? [] : MarkdownScanner.scan(string, range: NSRange(location: 0, length: string.length), state: .normal)
    }

    /// Index of the line containing `location` (or the last line).
    func lineIndex(at location: Int) -> Int? {
        guard !lines.isEmpty else { return nil }
        var lo = 0
        var hi = lines.count - 1
        while lo < hi {
            let mid = (lo + hi + 1) / 2
            if lines[mid].fullRange.location <= location { lo = mid } else { hi = mid - 1 }
        }
        return lo
    }

    /// Apply an edit already made to `string`: `editedRange` is in new
    /// coordinates and `delta` is the change in length. Returns the indices of
    /// lines whose content or kind may have changed (to restyle).
    @discardableResult
    func applyEdit(_ string: NSString, editedRange: NSRange, delta: Int) -> Range<Int> {
        guard !lines.isEmpty, string.length > 0 else {
            rebuild(string)
            return 0..<lines.count
        }
        let oldStart = editedRange.location
        let oldEnd = NSMaxRange(editedRange) - delta  // end of the replaced span, old coordinates
        let first = lineIndex(at: oldStart) ?? 0
        var last = lineIndex(at: max(oldStart, oldEnd)) ?? first
        // An edit touching a terminator merges into the following line too.
        if last + 1 < lines.count, oldEnd >= NSMaxRange(lines[last].fullRange) - 1 { last += 1 }

        let state = first == 0 ? MarkdownScanner.State.normal : lines[first - 1].stateAfter
        let newStart = lines[first].fullRange.location
        let newEnd = min(string.length, NSMaxRange(lines[last].fullRange) + delta)
        var rescanned = MarkdownScanner.scan(string, range: NSRange(location: newStart, length: max(0, newEnd - newStart)), state: state)
        // Drop lines the rescan ran into that belong after the span.
        rescanned = rescanned.filter { $0.fullRange.location < max(newEnd, newStart + 1) }

        var tail = Array(lines[(last + 1)...])
        for i in tail.indices { tail[i].shift(by: delta) }
        lines = Array(lines[..<first]) + rescanned + tail
        var changed = first..<(first + rescanned.count)

        // If the scanner state after the span changed (a fence opened or
        // closed), the lines after it must be rescanned until states agree.
        var index = changed.upperBound
        while index < lines.count {
            let before = lines[index - 1].stateAfter
            let line = lines[index]
            let rescannedLine = MarkdownScanner.scanLine(string, line.range, line.fullRange, state: before, isFirstLine: line.range.location == 0)
            if rescannedLine == line { break }
            lines[index] = rescannedLine
            index += 1
        }
        changed = changed.lowerBound..<index
        return changed
    }
}
