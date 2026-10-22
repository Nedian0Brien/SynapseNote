import Foundation

/// Morrow's core/markdown/serialize.ts: a document tree to Markdown, the text Morrow writes into page files.
nonisolated enum MarkdownSerialize {
    struct Options {
        /// current title for a linked page, nil keeps the stored label
        var titleOf: ((String) -> String?)?
        /// how a wiki link names its page, a file name or a vault path, defaults to the title
        var linkTarget: ((String) -> String?)?
        /// relative path an exported file is written to, nil when it is not exported
        var filePath: ((String) -> String?)?

        init(titleOf: ((String) -> String?)? = nil, linkTarget: ((String) -> String?)? = nil,
             filePath: ((String) -> String?)? = nil) {
            self.titleOf = titleOf
            self.linkTarget = linkTarget
            self.filePath = filePath
        }
    }

    private static let markOrder = ["link", "bold", "italic", "strike", "underline", "highlight", "textColor"]

    private static func hexOf(_ palette: [(String, String)], _ mark: DocMark) -> String? {
        guard case .string(let color) = mark.attr("color") else { return nil }
        return palette.first { $0.0 == color }?.1
    }

    private static func markOpen(_ mark: DocMark) -> String {
        switch mark.type {
        case "link": "["
        case "bold": "**"
        case "italic": "*"
        case "strike": "~~"
        case "underline": "<u>"
        case "highlight": hexOf(Model.backgroundHex, mark).map { "<mark style=\"background: \($0)\">" } ?? "=="
        default: "<span style=\"color: \(hexOf(Model.textHex, mark) ?? "#787774")\">"
        }
    }

    private static func markClose(_ mark: DocMark) -> String {
        switch mark.type {
        case "link": "](\(formatHref(string(mark.attr("href"), default: ""))))"
        case "bold": "**"
        case "italic": "*"
        case "strike": "~~"
        case "underline": "</u>"
        case "highlight": hexOf(Model.backgroundHex, mark) != nil ? "</mark>" : "=="
        default: "</span>"
        }
    }

    /// `String(value ?? fallback)`
    private static func string(_ value: JSValue?, default fallback: String) -> String {
        guard let value, !value.isNull else { return fallback }
        return value.jsString
    }

    private static func stringAttr(_ node: DocNode, _ name: String) -> String? {
        if case .string(let value) = node.attr(name) { value } else { nil }
    }

    // MARK: documents

    static func docToMarkdown(_ doc: DocNode, _ options: Options = Options()) -> String {
        let out = JSText.trim(blocks(doc.content ?? [], options))
        return out.isEmpty ? "" : out + "\n"
    }

    /// title becomes a leading heading so the file is readable on its own
    static func pageToMarkdown(title: String, doc: DocNode, _ options: Options = Options()) -> String {
        let body = docToMarkdown(doc, options)
        let trimmed = JSText.trim(title)
        let heading = "# \(escapeText(trimmed.isEmpty ? "Untitled" : trimmed))\n"
        return body.isEmpty ? heading : "\(heading)\n\(body)"
    }

    private static func blocks(_ nodes: [DocNode], _ options: Options) -> String {
        nodes.compactMap { block($0, options) }.joined(separator: "\n\n")
    }

    private static func block(_ node: DocNode, _ options: Options) -> String? {
        switch node.type {
        case "paragraph":
            return escapeLineStart(inline(node.content ?? [], options))
        case "heading":
            return "\(String(repeating: "#", count: clampLevel(node.attr("level")))) \(inline(node.content ?? [], options))"
        case "blockquote":
            return prefixLines(blocks(node.content ?? [], options), "> ", ">")
        case "bulletList":
            return listItems(node, { _, _ in "- " }, options)
        case "orderedList":
            var start = 1.0
            if case .number(let value) = node.attr("start") { start = max(0, value.rounded(.down)) }
            return listItems(node, { index, _ in "\(JSNumber.string(start + Double(index))). " }, options)
        case "taskList":
            return listItems(node, { _, item in item.attr("checked") == .bool(true) ? "- [x] " : "- [ ] " }, options)
        case "codeBlock":
            let code = (node.content ?? []).map { $0.text ?? "" }.joined()
            let fence = String(repeating: "`", count: max(3, longestRun(code, 0x60) + 1))
            let language = stringAttr(node, "language") ?? ""
            return "\(fence)\(language)\n\(code)\n\(fence)"
        case "blockMath":
            return "$$\n\(JSText.trim(string(node.attr("latex"), default: "")))\n$$"
        case "rawBlock":
            return string(node.attr("text"), default: "")
        case "horizontalRule":
            return "---"
        case "table":
            return table(node, options)
        case "image":
            let alt = JSText.removing(string(node.attr("alt"), default: ""), [0x5B, 0x5D])
            let target = stringAttr(node, "fileId").flatMap { options.filePath?($0) }
            let src = target ?? stringAttr(node, "src")
            if let src, !src.isEmpty { return "![\(alt)](\(formatHref(src)))" }
            return "*[image\(alt.isEmpty ? "" : ": \(alt)")]*"
        case "fileAttachment":
            let name = escapeText(string(node.attr("name"), default: "file"))
            let target = options.filePath?(string(node.attr("fileId"), default: ""))
            if let target, !target.isEmpty { return "[\(name)](\(formatHref(target)))" }
            return "*[attachment: \(name)]*"
        case "callout":
            let storedKind = stringAttr(node, "kind") ?? ""
            let kind = storedKind.isEmpty ? string(node.attr("tone"), default: "note") : storedKind
            let fold = stringAttr(node, "fold").flatMap { $0 == "+" || $0 == "-" ? $0 : nil } ?? ""
            let storedTitle = stringAttr(node, "title") ?? ""
            let title = storedTitle.isEmpty ? "" : " \(storedTitle)"
            let body = blocks(node.content ?? [], options)
            return prefixLines("[!\(kind)]\(fold)\(title)\n\(body)", "> ", ">")
        case "tableOfContents":
            return "<!-- toc -->"
        case "columns":
            // plain html wrappers, other markdown apps show the columns one after another
            let columns = (node.content ?? []).map { "<div data-column>\n\n\(blocks($0.content ?? [], options))\n\n</div>" }
            return "<div data-columns>\n\(columns.joined(separator: "\n"))\n</div>"
        case "details":
            let parts = node.content ?? []
            let title = parts.first.map { escapeHtml(inline($0.content ?? [], options)) } ?? ""
            let body = parts.count > 1 ? blocks(parts[1].content ?? [], options) : ""
            return "<details>\n<summary>\(title)</summary>\n\n\(body)\n\n</details>"
        default:
            // unknown blocks keep their text so nothing silently disappears from an export
            guard let content = node.content else { return nil }
            if content.contains(where: { $0.type == "text" }) { return inline(content, options) }
            return blocks(content, options)
        }
    }

    private static func listItems(_ list: DocNode, _ marker: (Int, DocNode) -> String, _ options: Options) -> String {
        (list.content ?? []).enumerated().map { index, item in
            let bullet = marker(index, item)
            var body = ""
            for (childIndex, child) in (item.content ?? []).enumerated() {
                let text = block(child, options) ?? ""
                body += childIndex == 0 ? text : (isList(child) ? "\n" : "\n\n") + text
            }
            let indent = String(repeating: " ", count: bullet.hasPrefix("- [") ? 2 : bullet.utf16.count)
            let lines = JSText.split(body, on: 0x0A).enumerated().map { i, line in
                i == 0 || line.isEmpty ? line : indent + line
            }
            return bullet + lines.joined(separator: "\n")
        }.joined(separator: "\n")
    }

    private static func isList(_ node: DocNode) -> Bool {
        node.type == "bulletList" || node.type == "orderedList" || node.type == "taskList"
    }

    private static func table(_ node: DocNode, _ options: Options) -> String {
        let rows = (node.content ?? []).map { row in
            (row.content ?? []).map { cell in
                let text = (cell.content ?? []).map { inline($0.content ?? [], options, inTable: true) }.joined(separator: "<br>")
                // .replace(/(?<!\\)\|/g, '\\|')
                let units = text.units
                var out: [UInt16] = []
                for (i, unit) in units.enumerated() {
                    if unit == 0x7C, i == 0 || units[i - 1] != 0x5C { out.append(0x5C) }
                    out.append(unit)
                }
                return JSText.trim(JSText.string(out))
            }
        }
        if rows.isEmpty { return "" }
        let width = max(1, rows.map(\.count).max() ?? 0)
        func line(_ row: [String]) -> String {
            "| " + (0..<width).map { $0 < row.count ? row[$0] : "" }.joined(separator: " | ") + " |"
        }
        return ([line(rows[0]), line(Array(repeating: "---", count: width))] + rows.dropFirst().map(line)).joined(separator: "\n")
    }

    static func wikiLink(_ node: DocNode, _ options: Options, inTable: Bool = false) -> String {
        let id = stringAttr(node, "id")
        let stored = stringAttr(node, "target")
        var resolved: String?
        if let id, !id.isEmpty { resolved = options.linkTarget?(id) ?? options.titleOf?(id) }
        let target = resolved ?? stored ?? string(node.attr("label"), default: "")
        let anchor = stringAttr(node, "anchor").map { "#\($0)" } ?? ""
        let alias = stringAttr(node, "alias").map { (inTable ? "\\|" : "|") + $0 } ?? ""
        let embed = node.attr("embed") == .bool(true) ? "!" : ""
        let cleanTarget = JSText.removing(target, [0x5B, 0x5D, 0x7C])
        let cleanAlias = JSText.removing(alias, [0x5B, 0x5D])
        return "\(embed)[[\(cleanTarget)\(anchor)\(cleanAlias)]]"
    }

    // MARK: inline

    private static func inline(_ nodes: [DocNode], _ options: Options, inTable: Bool = false) -> String {
        var out = ""
        var open: [DocMark] = []
        var pendingSpace = ""
        func closeTo(_ keep: Int) {
            while open.count > keep { out += markClose(open.removeLast()) }
        }
        for node in nodes {
            switch node.type {
            case "hardBreak":
                closeTo(0)
                out += pendingSpace + (inTable ? "<br>" : "\\\n")
                pendingSpace = ""
                continue
            case "pageLink":
                closeTo(0)
                out += pendingSpace + wikiLink(node, options, inTable: inTable)
                pendingSpace = ""
                continue
            case "dateMention":
                // dates are written as links to that day's note, the way obsidian names daily notes
                closeTo(0)
                out += "\(pendingSpace)[[\(string(node.attr("date"), default: ""))]]"
                pendingSpace = ""
                continue
            case "inlineMath":
                closeTo(0)
                out += "\(pendingSpace)$\(JSText.trim(string(node.attr("latex"), default: "")))$"
                pendingSpace = ""
                continue
            default:
                break
            }
            guard node.type == "text", let text = node.text, !text.isEmpty else { continue }
            let marks = sortMarks(node.marks ?? [])
            let isCode = marks.contains { $0.type == "code" }
            let wrapping = marks.filter { $0.type != "code" }
            // /^(\s*)([\s\S]*?)(\s*)$/
            let units = text.units
            let leadEnd = units.firstIndex { !JSText.isSpace($0) } ?? units.count
            let trailStart = leadEnd == units.count ? units.count : (units.lastIndex { !JSText.isSpace($0) }! + 1)
            let lead = JSText.string(units[..<leadEnd])
            let core = JSText.string(units[leadEnd..<trailStart])
            let trail = JSText.string(units[trailStart...])
            var keep = 0
            while keep < open.count, keep < wrapping.count, sameMark(open[keep], wrapping[keep]) { keep += 1 }
            closeTo(keep)
            out += pendingSpace + lead
            if core.isEmpty {
                pendingSpace = trail
                continue
            }
            for mark in wrapping.dropFirst(keep) {
                out += markOpen(mark)
                open.append(mark)
            }
            out += isCode ? codeSpan(core) : escapeText(core)
            pendingSpace = trail
        }
        closeTo(0)
        return out + pendingSpace
    }

    /// marks Morrow writes, in its order, code first; a stable sort as JavaScript's is
    private static func sortMarks(_ marks: [DocMark]) -> [DocMark] {
        marks.filter { $0.type == "code" || markOrder.contains($0.type) }
            .enumerated()
            .sorted { a, b in
                let ra = markOrder.firstIndex(of: a.element.type) ?? -1
                let rb = markOrder.firstIndex(of: b.element.type) ?? -1
                return ra != rb ? ra < rb : a.offset < b.offset
            }
            .map(\.element)
    }

    private static func sameMark(_ a: DocMark, _ b: DocMark) -> Bool {
        func color(_ mark: DocMark) -> JSValue { mark.attr("color") ?? .null }
        return a.type.jsEquals(b.type) && a.attr("href") == b.attr("href") && color(a) == color(b)
    }

    private static func codeSpan(_ text: String) -> String {
        let fence = String(repeating: "`", count: longestRun(text, 0x60) + 1)
        let padded = text.utf16.first == 0x60 || text.utf16.last == 0x60 ? " \(text) " : text
        return "\(fence)\(padded)\(fence)"
    }

    private static func escapeHtml(_ text: String) -> String {
        JSText.replacing(JSText.replacing(text, 0x3C, with: "&lt;"), 0x3E, with: "&gt;")
    }

    /// `/[\p{L}\p{N}]/u` on one UTF-16 unit, as `all[index - 1]` gives it: a lone surrogate is neither.
    private static func isLetterOrNumber(_ unit: UInt16?) -> Bool {
        guard let unit, let scalar = Unicode.Scalar(unit) else { return false }
        switch scalar.properties.generalCategory {
        case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter,
             .decimalNumber, .letterNumber, .otherNumber: return true
        default: return false
        }
    }

    private static func isWordUnit(_ unit: UInt16) -> Bool {
        unit == 0x5F || (0x30...0x39).contains(unit) || (0x41...0x5A).contains(unit) || (0x61...0x7A).contains(unit)
    }

    /// escapes only what would turn into formatting, so files stay pleasant to read in other editors
    static func escapeText(_ text: String) -> String {
        var units: [UInt16] = []
        for unit in text.utf16 {
            if unit == 0x5C || unit == 0x60 || unit == 0x2A || unit == 0x3C { units.append(0x5C) }
            units.append(unit)
        }
        // intraword underscores like snake_case never start emphasis
        var step: [UInt16] = []
        for (i, unit) in units.enumerated() {
            if unit == 0x5F, !(isLetterOrNumber(i > 0 ? units[i - 1] : nil) && isLetterOrNumber(i + 1 < units.count ? units[i + 1] : nil)) {
                step.append(0x5C)
            }
            step.append(unit)
        }
        units = step
        // /~~/g and /==/g, left to right without overlap
        for pair: UInt16 in [0x7E, 0x3D] {
            step = []
            var i = 0
            while i < units.count {
                if units[i] == pair, i + 1 < units.count, units[i + 1] == pair {
                    step += [0x5C, pair, 0x5C, pair]
                    i += 2
                } else {
                    step.append(units[i])
                    i += 1
                }
            }
            units = step
        }
        // /\[(?=\[)/g, /\](?=[([])/g and /&(?=#?\w+;)/g, each looking at the text before that step
        step = []
        for (i, unit) in units.enumerated() {
            if unit == 0x5B, units.at(i + 1) == 0x5B { step.append(0x5C) }
            step.append(unit)
        }
        units = step
        step = []
        for (i, unit) in units.enumerated() {
            if unit == 0x5D, units.at(i + 1) == 0x28 || units.at(i + 1) == 0x5B { step.append(0x5C) }
            step.append(unit)
        }
        units = step
        step = []
        for (i, unit) in units.enumerated() {
            if unit == 0x26 {
                var at = i + 1
                if units.at(at) == 0x23 { at += 1 }
                let wordStart = at
                while at < units.count, isWordUnit(units[at]) { at += 1 }
                if at > wordStart, units.at(at) == 0x3B { step.append(0x5C) }
            }
            step.append(unit)
        }
        return JSText.string(escapeMath(step))
    }

    /// escapes only the dollar signs the parser would read as the start of a formula
    private static func escapeMath(_ text: [UInt16]) -> [UInt16] {
        var out: [UInt16] = []
        var i = 0
        while i < text.count {
            let char = text[i]
            if char == 0x5C {
                out.append(char)
                if i + 1 < text.count { out.append(text[i + 1]) }
                i += 2
                continue
            }
            if char == 0x24, opensMath(text, i) { out += [0x5C, 0x24] } else { out.append(char) }
            i += 1
        }
        return out
    }

    private static func opensMath(_ text: [UInt16], _ start: Int) -> Bool {
        let display = text.at(start + 1) == 0x24
        let open = display ? 2 : 1
        let next = text.at(start + open)
        if next == -1 || JSText.isSpace(UInt16(next)) || next == 0x24 { return false }
        let closer: [UInt16] = display ? [0x24, 0x24] : [0x24]
        var end = JSText.indexOf(text, closer, from: start + open)
        while end != -1, text.at(end - 1) == 0x5C { end = JSText.indexOf(text, closer, from: end + 1) }
        if end == -1 { return false }
        if let last = JSText.slice(text, start + open, end).last, JSText.isSpace(last) { return false }
        return display || !(0x30...0x39).contains(text.at(end + 1))
    }

    private static let lineStartMarker = JSRegex(#"^(\s*)(#{1,6}(?=\s|$)|>|[-+](?=\s)|={3,}|-{3,}|\$\$)"#)
    private static let lineStartReference = JSRegex(#"^(\s*)\[([^\]]*)\]:"#)
    private static let lineStartNumber = JSRegex(#"^(\s*\d+)([.)])(?=\s)"#)

    private static func escapeLineStart(_ text: String) -> String {
        var units = text.units
        if let match = lineStartMarker.exec(units) {
            units = match.group(1)! + [0x5C] + match.group(2)! + Array(units[match.range.upperBound...])
        }
        if let match = lineStartReference.exec(units) {
            units = match.group(1)! + [0x5C, 0x5B] + match.group(2)! + [0x5D, 0x3A] + Array(units[match.range.upperBound...])
        }
        if let match = lineStartNumber.exec(units) {
            units = match.group(1)! + [0x5C] + match.group(2)! + Array(units[match.range.upperBound...])
        }
        return JSText.string(units)
    }

    private static func formatHref(_ href: String) -> String {
        let units = href.units
        guard units.contains(where: { JSText.isSpace($0) || $0 == 0x28 || $0 == 0x29 || $0 == 0x3C || $0 == 0x3E }) else { return href }
        return "<" + JSText.replacing(JSText.replacing(href, 0x3C, with: "%3C"), 0x3E, with: "%3E") + ">"
    }

    private static func prefixLines(_ text: String, _ prefix: String, _ emptyPrefix: String) -> String {
        JSText.split(text, on: 0x0A)
            .map { $0.isEmpty ? emptyPrefix : prefix + $0 }
            .joined(separator: "\n")
    }

    private static func longestRun(_ text: String, _ char: UInt16) -> Int {
        var longest = 0
        var current = 0
        for unit in text.utf16 {
            current = unit == char ? current + 1 : 0
            longest = max(longest, current)
        }
        return longest
    }

    private static func clampLevel(_ level: JSValue?) -> Int {
        guard case .number(let value) = level else { return 1 }
        if value.isNaN { return 0 }
        return Int(min(6, max(1, value.rounded(.down))))
    }
}
