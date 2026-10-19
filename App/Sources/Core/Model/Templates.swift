import Foundation

/// Morrow's core/templates.ts: templates are the subpages of the templates page, a new page starts as a copy
/// of one.
nonisolated enum Templates {
    static let templatesTitle = "Templates"
    /// a template with this title is used for every new daily note
    static let dailyTemplateTitle = "Daily note"

    static func findTemplatesPage(_ state: WorkspaceState) -> PageMeta? {
        Tree.livePages(state.pages).first { $0.kind == .templates && $0.parentId == nil }
    }

    static func listTemplates(_ state: WorkspaceState) -> [PageMeta] {
        findTemplatesPage(state).map { Tree.childrenOf(state.pages, $0.id) } ?? []
    }

    static func dailyTemplate(_ state: WorkspaceState) -> PageMeta? {
        let wanted = JSText.lowercased(dailyTemplateTitle.units)
        return listTemplates(state).first { JSText.lowercased(JSText.trim($0.title).units) == wanted }
    }

    private static func pad(_ value: Int, _ size: Int = 2) -> String {
        let text = String(value)
        return String(repeating: "0", count: max(0, size - text.count)) + text
    }

    /// `date.toLocaleDateString(locale, options)` for one field, by its ICU skeleton
    private static func localized(_ date: Date, _ skeleton: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = JSEnvironment.locale
        formatter.timeZone = JSEnvironment.timeZone
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.setLocalizedDateFormatFromTemplate(skeleton)
        return formatter.string(from: date)
    }

    private static let tokenPattern = JSRegex(#"\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|mm|ss"#)

    /// the moment.js tokens obsidian templates use most, enough for dates like YYYY-MM-DD or dddd, D MMMM
    static func formatDate(_ date: Date, _ format: String) -> String {
        let parts = JSEnvironment.calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        let year = parts.year!, month = parts.month!, day = parts.day!
        return JSText.string(tokenPattern.replaceAll(format.units) { match in
            if let literal = match.group(1) { return literal }
            let text: String = switch JSText.string(match.text) {
            case "YYYY": String(year)
            case "YY": String(String(year).suffix(2))
            case "MMMM": localized(date, "MMMM")
            case "MMM": localized(date, "MMM")
            case "MM": pad(month)
            case "M": String(month)
            case "DD": pad(day)
            case "D": String(day)
            case "dddd": localized(date, "EEEE")
            case "ddd": localized(date, "EEE")
            case "HH": pad(parts.hour!)
            case "H": String(parts.hour!)
            case "mm": pad(parts.minute!)
            case "ss": pad(parts.second!)
            default: JSText.string(match.text)
            }
            return text.units
        })
    }

    struct Values {
        var title: String
        var date: Date
    }

    private static let placeholder = JSRegex(#"\{\{\s*(title|date|time)(?::([^}]*))?\s*\}\}"#, ignoreCase: true)

    /// fills {{title}}, {{date}}, {{time}} and {{date:FORMAT}} in every piece of text
    static func fillTemplate(_ text: String, _ values: Values) -> String {
        JSText.string(placeholder.replaceAll(text.units) { match in
            let key = JSText.string(JSText.lowercased(match.group(1)!))
            let format = match.group(2).map { JSText.trim($0) } ?? []
            if key == "title" { return values.title.units }
            if key == "time" { return formatDate(values.date, format.isEmpty ? "HH:mm" : JSText.string(format)).units }
            return formatDate(values.date, format.isEmpty ? "YYYY-MM-DD" : JSText.string(format)).units
        })
    }

    static func applyTemplate(_ doc: DocNode, _ values: Values) -> DocNode {
        let copy = Doc.cloneDoc(doc)
        func visit(_ node: DocNode) -> DocNode {
            var next = node
            if next.type == "text", let text = next.text, !text.isEmpty { next.text = fillTemplate(text, values) }
            if var attrs = next.attrs {
                for key in ["latex", "text", "title"] {
                    if case .string(let value) = attrs[key] { attrs[key] = .string(fillTemplate(value, values)) }
                }
                next.attrs = attrs
            }
            if let content = next["content"]?.array {
                next["content"] = .array(content.map { child in child.object.map { .object(visit($0)) } ?? child })
            }
            return next
        }
        return visit(copy)
    }
}

nonisolated extension Doc {
    /// `cloneDoc`: a copy through JSON, as Morrow makes it
    nonisolated static func cloneDoc(_ doc: DocNode) -> DocNode {
        (try? JSJSON.parse(JSJSON.stringify(.object(doc))))?.object ?? doc
    }

    /// `walk`: depth first, return false from the visitor to skip children
    nonisolated static func walk(_ doc: DocNode, _ visit: (DocNode, DocNode?) -> Bool) {
        var stack: [(node: DocNode, parent: DocNode?)] = [(doc, nil)]
        while let (node, parent) = stack.popLast() {
            if !visit(node, parent) { continue }
            for child in (node.content ?? []).reversed() { stack.append((child, node)) }
        }
    }

    static let knownNodeTypes: Set<String> = [
        "doc", "paragraph", "text", "heading", "bulletList", "orderedList", "listItem", "taskList", "taskItem", "blockquote",
        "codeBlock", "horizontalRule", "hardBreak", "table", "tableRow", "tableHeader", "tableCell", "pageLink", "image",
        "fileAttachment", "callout", "details", "detailsSummary", "detailsContent", "inlineMath", "blockMath", "rawBlock",
        "columns", "column", "tableOfContents", "dateMention",
    ]
    static let knownMarkTypes: Set<String> = ["bold", "italic", "underline", "strike", "code", "link", "highlight", "textColor"]

    /// node and mark types this version cannot edit safely
    nonisolated static func findUnknownTypes(_ doc: DocNode) -> [String] {
        var unknown = JSSet()
        walk(doc) { node, _ in
            if !knownNodeTypes.contains(node.type) { unknown.insert(node.type) }
            for mark in node.marks ?? [] where !knownMarkTypes.contains(mark.type) { unknown.insert(mark.type) }
            return true
        }
        return unknown.items
    }

    /// `docToPlainText`
    nonisolated static func docToPlainText(_ doc: DocNode) -> String {
        var lines: [String] = []
        func visit(_ node: DocNode) {
            if ["paragraph", "heading", "codeBlock", "detailsSummary"].contains(node.type) {
                let text = inlineText(node)
                if !text.isEmpty { lines.append(text) }
                return
            }
            func add(_ key: String) {
                if let value = node.attr(key), value.truthy { lines.append(value.jsString) }
            }
            if node.type == "image" { add("alt") }
            if node.type == "rawBlock" { add("text") }
            if node.type == "blockMath" { add("latex") }
            // canvases are searched by the words on their cards
            if node.type == "canvas", case .array(let cards) = node.attr("nodes") {
                for card in cards {
                    for key in ["text", "label", "url"] {
                        if case .string(let value) = card[key], !value.isEmpty { lines.append(value) }
                    }
                }
            }
            if node.type == "fileAttachment" { add("name") }
            for child in node.content ?? [] { visit(child) }
        }
        visit(doc)
        return lines.joined(separator: "\n")
    }

    /// every stored file a document points at, through images and attachments
    nonisolated static func fileIdsInDoc(_ doc: DocNode) -> [String] {
        var ids = JSSet()
        walk(doc) { node, _ in
            if node.type == "image" || node.type == "fileAttachment", case .string(let id) = node.attr("fileId") { ids.insert(id) }
            return true
        }
        return ids.items
    }
}
