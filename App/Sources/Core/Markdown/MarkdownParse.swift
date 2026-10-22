import Foundation

/// Morrow's core/markdown/parse.ts: Markdown to a document tree, through the markdown-it token stream.
nonisolated enum MarkdownParse {
    struct FileRef {
        let fileId: String
        let name: String
        let image: Bool
    }

    struct Options {
        /// resolves a [[wiki link]] target, a title or a path inside the vault, to a page id
        var resolvePage: ((String) -> String?)?
        /// resolves relative links such as notion exports use between pages
        var resolveLink: ((String) -> String?)?
        /// resolves image and file paths, and ![[embeds]], to stored files
        var resolveFile: ((String) -> FileRef?)?
        /// links to pages that do not exist yet stay live and create the page when followed, on by default
        var keepUnresolved = true

        init(resolvePage: ((String) -> String?)? = nil, resolveLink: ((String) -> String?)? = nil,
             resolveFile: ((String) -> FileRef?)? = nil, keepUnresolved: Bool = true) {
            self.resolvePage = resolvePage
            self.resolveLink = resolveLink
            self.resolveFile = resolveFile
            self.keepUnresolved = keepUnresolved
        }
    }

    private static let maxInput = 5_000_000
    private static let taskPrefix = JSRegex(#"^\[([ xX])\](?:\s+|$)"#)
    // obsidian callouts and github alerts: > [!type]+ optional title
    private static let callout = JSRegex(#"^\[!([A-Za-z][\w-]{0,30})\]([+-]?)[ \t]*"#)

    /// Each fileRef object is told apart by identity in Morrow (`===`), so each one carries a number under this
    /// key while the tree is built; the key is removed before the tree is returned.
    private static let identityKey = "\u{0}identity"

    // MARK: markdownToDoc

    static func markdownToDoc(_ source: String, _ options: Options = Options()) -> DocNode {
        let parser = Parser(options: options)
        return strip(parser.markdownToDoc(source.units))
    }

    /// `markdownToPage`: the first level one heading becomes the page title.
    static func markdownToPage(_ source: String, fallbackTitle: String, _ options: Options = Options()) -> (title: String, doc: DocNode) {
        let doc = markdownToDoc(source, options)
        if let first = doc.content?.first, first.type == "heading", first.attr("level") == .number(1) {
            let rest = Array(doc.content!.dropFirst())
            let title = JSText.trim(Doc.inlineText(first))
            return (title.isEmpty ? fallbackTitle : title, rest.isEmpty ? Model.emptyDoc() : .node("doc", ("content", .array(rest.map(JSValue.object)))))
        }
        return (fallbackTitle, doc)
    }

    private static func strip(_ value: JSObject) -> JSObject {
        var object = value
        if object.has(identityKey) { object[identityKey] = nil }
        for (key, item) in value {
            switch item {
            case .object(let child): object[key] = .object(strip(child))
            case .array(let items): object[key] = .array(items.map { item in item.object.map { .object(strip($0)) } ?? item })
            default: break
            }
        }
        return object
    }

    // MARK: building the tree

    private final class Parser {
        let options: Options
        var nextIdentity = 0

        init(options: Options) { self.options = options }

        func markdownToDoc(_ source: [UInt16]) -> DocNode {
            let text = source.count > MarkdownParse.maxInput ? Array(source[..<MarkdownParse.maxInput]) : source
            let tokens = MarkdownIt.parse(text)
            let builder = Builder()
            for token in tokens {
                switch token.type {
                case "paragraph_open": builder.open(.node("paragraph", ("content", [])))
                case "heading_open":
                    let level = Double(token.tag.dropFirst()) ?? 0
                    builder.open(.node("heading", ("attrs", ["level": .number(level == 0 ? 1 : level)]), ("content", [])))
                case "blockquote_open": builder.open(.node("blockquote", ("content", [])))
                case "bullet_list_open": builder.open(.node("bulletList", ("content", [])))
                case "ordered_list_open":
                    var start = 1.0
                    if case .number(let value) = token.attrGet("start") { start = value }
                    builder.open(.node("orderedList", ("attrs", ["start": .number(start.isFinite ? start : 1)]), ("content", [])))
                case "list_item_open": builder.open(.node("listItem", ("content", [])))
                case "table_open": builder.open(.node("table", ("content", [])))
                case "tr_open": builder.open(.node("tableRow", ("content", [])))
                case "th_open", "td_open":
                    builder.open(.node(token.type == "th_open" ? "tableHeader" : "tableCell", ("content", [])))
                    builder.open(.node("paragraph", ("content", [])))
                case "th_close", "td_close":
                    builder.close()
                    builder.close()
                case "paragraph_close", "heading_close", "blockquote_close", "bullet_list_close", "ordered_list_close",
                     "list_item_close", "table_close", "tr_close":
                    builder.close()
                case "inline":
                    builder.appendToTop(inlineNodes(token.children ?? []))
                case "fence", "code_block":
                    var code = token.content
                    if code.last == 0x0A { code.removeLast() }
                    let info = JSText.trim(token.info)
                    let language = Array(info.prefix { !JSText.isSpace($0) })
                    builder.push(.node(
                        "codeBlock",
                        ("attrs", ["language": language.isEmpty ? .null : .string(JSText.string(language))]),
                        ("content", code.isEmpty ? [] : [.object(.node("text", ("text", .string(JSText.string(code)))))]),
                    ))
                case "math_block":
                    builder.push(.node("blockMath", ("attrs", ["latex": .string(token.text)])))
                case "hr":
                    builder.push(.node("horizontalRule"))
                case "html_block":
                    htmlBlock(token.content, builder)
                default:
                    break
                }
            }
            let doc = normalize(builder.finish())
            return (doc.content ?? []).isEmpty ? Model.emptyDoc() : doc
        }

        // MARK: html blocks

        private static let toc = JSRegex(#"^<!--\s*toc\s*-->$"#, ignoreCase: true)
        private static let layoutTag = JSRegex(#"<div data-columns>|<div data-column>|<\/div>"#, ignoreCase: true)
        private static let columnsOpen = JSRegex(#"<div data-columns>"#, ignoreCase: true)
        private static let dataColumns = JSRegex(#"data-columns"#, ignoreCase: true)
        private static let dataColumn = JSRegex(#"data-column"#, ignoreCase: true)
        private static let detailsOpen = JSRegex(#"^<details[^>]*>"#, ignoreCase: true)
        private static let asideOpen = JSRegex(#"^<aside[^>]*>"#, ignoreCase: true)
        private static let summary = JSRegex(#"<summary[^>]*>([\s\S]*?)<\/summary>"#, ignoreCase: true)
        private static let tagRE = JSRegex(#"<[^>]+>"#)
        private static let detailsClose = JSRegex(#"<\/details>\s*$"#, ignoreCase: true)
        private static let detailsCloseStart = JSRegex(#"^<\/details>"#, ignoreCase: true)
        private static let asideClose = JSRegex(#"<\/aside>\s*$"#, ignoreCase: true)
        private static let asideCloseStart = JSRegex(#"^<\/aside>"#, ignoreCase: true)

        /// toggles and notion asides become blocks, any other html is kept exactly as written
        private func htmlBlock(_ source: [UInt16], _ b: Builder) {
            let html = JSText.trim(source)
            if Self.toc.test(html) {
                b.push(.node("tableOfContents"))
                return
            }
            // column wrappers come as runs of bare tags, each one opens or closes a level
            let layoutTags = Self.layoutTag.all(html)
            if !layoutTags.isEmpty, JSText.trim(Self.layoutTag.replaceAll(html) { _ in [] }).isEmpty {
                let inLayout = b.stack.contains { $0.type == "columns" }
                if inLayout || Self.columnsOpen.test(html) {
                    for tag in layoutTags {
                        if Self.dataColumns.test(tag.text) {
                            b.open(.node("columns", ("content", [])))
                        } else if Self.dataColumn.test(tag.text) {
                            if b.top.type != "columns" { continue }
                            b.open(.node("column", ("content", [])))
                        } else if b.top.type == "column" || b.top.type == "columns" {
                            b.close()
                        }
                    }
                    return
                }
            }
            let details = Self.detailsOpen.exec(html)
            let aside = Self.asideOpen.exec(html)
            if let details {
                let summary = Self.summary.exec(html)
                let summaryText = summary?.group(1) ?? []
                let title = JSText.trim(MarkdownParse.decodeEntities(Self.tagRE.replaceAll(summaryText) { _ in [] }))
                var body = DocNode.node("detailsContent", ("content", []))
                let after = JSText.slice(html, summary.map { $0.range.upperBound } ?? details.range.count)
                let closed = Self.detailsClose.test(after)
                let inner = JSText.trim(Self.detailsClose.replaceAll(after) { _ in [] })
                if !inner.isEmpty { body.content = markdownToDoc(inner).content ?? [] }
                let summaryNode = DocNode.node("detailsSummary", ("content", title.isEmpty ? [] : [.object(.node("text", ("text", .string(JSText.string(title)))))]))
                let node = DocNode.node("details", ("attrs", ["open": false]), ("content", [.object(summaryNode)]))
                if closed {
                    b.push(node.with(content: [summaryNode, body]))
                } else {
                    b.open(node)
                    b.open(body)
                }
            } else if Self.detailsCloseStart.test(html) {
                if b.top.type == "detailsContent" {
                    b.close()
                    b.close()
                }
            } else if let aside {
                let closed = Self.asideClose.test(html)
                let inner = JSText.trim(Self.asideClose.replaceAll(JSText.slice(html, aside.range.count)) { _ in [] })
                var node = DocNode.node("callout", ("attrs", ["tone": "note", "kind": "note"]), ("content", []))
                if !inner.isEmpty { node.content = markdownToDoc(inner).content ?? [] }
                if closed { b.push(node) } else { b.open(node) }
            } else if Self.asideCloseStart.test(html) {
                if b.top.type == "callout" { b.close() }
            } else if !html.isEmpty {
                var text = source
                while text.last == 0x0A { text.removeLast() }
                b.push(.node("rawBlock", ("attrs", ["text": .string(JSText.string(text))])))
            }
        }

        // MARK: inline

        private func newFileRef(_ file: FileRef, embed: Bool = false) -> JSValue {
            nextIdentity += 1
            var ref = JSObject()
            ref["fileId"] = .string(file.fileId)
            ref["name"] = .string(file.name)
            ref["image"] = .bool(file.image)
            if embed { ref["embed"] = true }
            ref[MarkdownParse.identityKey] = .number(Double(nextIdentity))
            return .object(ref)
        }

        private static let styled = JSRegex(#"^<(span|mark)\s+style\s*=\s*["']\s*(color|background(?:-color)?)\s*:\s*(#[0-9a-f]{3,6})\s*;?\s*["']\s*>$"#)
        private static let br = JSRegex(#"^<br\s*\/?>$"#)

        private func inlineNodes(_ tokens: [MDToken]) -> [DocNode] {
            var out: [DocNode] = []
            var marks: [DocMark] = []
            func add(_ text: [UInt16], _ extra: [DocMark] = []) {
                if text.isEmpty { return }
                let all = marks + extra
                let value = JSValue.string(JSText.string(text))
                out.append(all.isEmpty ? .node("text", ("text", value)) : .node("text", ("text", value), ("marks", .array(all.map(JSValue.object)))))
            }
            func remove(_ type: String) {
                if let index = marks.lastIndex(where: { $0.type == type }) { marks.remove(at: index) }
            }
            var pageTarget: (id: String, label: [UInt16])?

            for token in tokens {
                if pageTarget != nil, token.type != "link_close" {
                    pageTarget!.label += token.content
                    continue
                }
                switch token.type {
                case "text": add(token.content)
                // kept until callout titles are read, then becomes a space
                case "softbreak": out.append(.node("softBreak"))
                case "hardbreak": out.append(.node("hardBreak"))
                case "strong_open": marks.append(.node("bold"))
                case "em_open": marks.append(.node("italic"))
                case "s_open": marks.append(.node("strike"))
                case "mark_open": marks.append(.node("highlight"))
                case "link_open":
                    var href = ""
                    if case .string(let value) = token.attrGet("href") { href = JSText.string(value) }
                    let pageId = options.resolveLink?(href)
                    let file = pageId != nil ? nil : options.resolveFile?(href)
                    if let pageId {
                        pageTarget = (pageId, [])
                    } else if let file {
                        marks.append(.node("link", ("attrs", .object(JSObject([("href", .string(href)), ("fileRef", newFileRef(file))])))))
                    } else {
                        marks.append(.node("link", ("attrs", ["href": .string(href)])))
                    }
                case "strong_close": remove("bold")
                case "em_close": remove("italic")
                case "s_close": remove("strike")
                case "mark_close": remove("highlight")
                case "link_close":
                    if let target = pageTarget {
                        out.append(.node("pageLink", ("attrs", ["id": .string(target.id), "label": .string(JSText.trim(JSText.string(target.label)))])))
                        pageTarget = nil
                    } else {
                        remove("link")
                    }
                case "code_inline": add(token.content, [.node("code")])
                case "math_inline": out.append(.node("inlineMath", ("attrs", ["latex": .string(token.text)])))
                case "wikilink": out += wikiNode(token.wiki!, token.markup, marks)
                case "image":
                    var src = ""
                    if case .string(let value) = token.attrGet("src") { src = JSText.string(value) }
                    var alt = token.text
                    if alt.isEmpty, case .string(let value) = token.attrGet("alt") { alt = JSText.string(value) }
                    let file = options.resolveFile?(src)
                    if let file, file.image {
                        out.append(.node("image", ("attrs", ["fileId": .string(file.fileId), "alt": .string(alt)])))
                    } else if let file {
                        add((alt.isEmpty ? file.name : alt).units, [.node("link", ("attrs", .object(JSObject([("href", .string(src)), ("fileRef", newFileRef(file))]))))])
                    } else {
                        out.append(.node("image", ("attrs", ["fileId": .null, "src": .string(src), "alt": .string(alt)])))
                    }
                case "html_inline":
                    let tag = JSText.lowercased(JSText.trim(token.content))
                    let styled = Self.styled.exec(tag)
                    let property = styled.map { JSText.string($0.group(2)!) }
                    let color = styled.flatMap { match in
                        Model.nearestColor(JSText.string(match.group(3)!), property == "color" ? Model.textHex : Model.backgroundHex)
                    }
                    let element = styled.map { JSText.string($0.group(1)!) }
                    let tagText = JSText.string(tag)
                    if styled != nil, let color, element == "span", property == "color" {
                        marks.append(.node("textColor", ("attrs", ["color": .string(color)])))
                    } else if styled != nil, let color, element == "mark" {
                        marks.append(.node("highlight", ("attrs", ["color": .string(color)])))
                    } else if tagText == "</span>", marks.contains(where: { $0.type == "textColor" }) {
                        remove("textColor")
                    } else if tagText == "<u>" {
                        marks.append(.node("underline"))
                    } else if tagText == "</u>" {
                        remove("underline")
                    } else if tagText == "<mark>" {
                        marks.append(.node("highlight"))
                    } else if tagText == "</mark>" {
                        remove("highlight")
                    } else if Self.br.test(tag) {
                        out.append(.node("hardBreak"))
                    } else {
                        add(token.content)
                    }
                default:
                    if !token.content.isEmpty { add(token.content) }
                }
            }
            return MarkdownParse.mergeText(out)
        }

        private static let dateKey = JSRegex(#"^\d{4}-\d{2}-\d{2}$"#)

        private func wikiNode(_ link: WikiLink, _ markup: [UInt16], _ marks: [DocMark]) -> [DocNode] {
            if link.embed {
                let file = link.target.isEmpty ? nil : options.resolveFile?(link.target)
                if let file, file.image {
                    return [.node("image", ("attrs", ["fileId": .string(file.fileId), "alt": .string(link.alias ?? "")]))]
                }
                if let file {
                    let fileMarks = marks + [.node("link", ("attrs", .object(JSObject([("href", .string(link.target)), ("fileRef", newFileRef(file, embed: true))]))))]
                    return [.node("text", ("text", .string(link.alias ?? file.name)), ("marks", .array(fileMarks.map(JSValue.object))))]
                }
            }
            let id = link.target.isEmpty ? nil : options.resolvePage?(link.target)
            // [[2026-10-16]] with no page of that name is a date, it opens that day's note
            if id == nil, !link.embed, link.alias == nil, link.anchor == nil, Self.dateKey.test(link.target) {
                return [.node("dateMention", ("attrs", ["date": .string(link.target)]))]
            }
            if id == nil, !options.keepUnresolved {
                let text = JSValue.string(JSText.string(markup))
                return [marks.isEmpty ? .node("text", ("text", text)) : .node("text", ("text", text), ("marks", .array(marks.map(JSValue.object))))]
            }
            let last = JSText.string(link.target.units.split(separator: 0x2F, omittingEmptySubsequences: false).last ?? [])
            let label = link.alias ?? (last.isEmpty ? link.target : last)
            // the written target is only needed while the page does not exist, resolved links follow the page
            var attrs = JSObject()
            attrs["id"] = id.map(JSValue.string) ?? .null
            attrs["label"] = .string(label)
            if id == nil { attrs["target"] = .string(link.target) }
            if let anchor = link.anchor { attrs["anchor"] = .string(anchor) }
            if let alias = link.alias { attrs["alias"] = .string(alias) }
            if link.embed { attrs["embed"] = true }
            return [.node("pageLink", ("attrs", .object(attrs)))]
        }
    }

    /// Open nodes, innermost last. A node is attached to its parent when it is closed, which gives the tree
    /// parse.ts builds by attaching each node when it is opened, since nothing else is added to the parent
    /// while the node is open.
    private final class Builder {
        var stack: [DocNode] = [.node("doc", ("content", []))]

        var top: DocNode { stack[stack.count - 1] }

        func push(_ node: DocNode) {
            var top = stack.removeLast()
            top.content = (top.content ?? []) + [node]
            stack.append(top)
        }

        func appendToTop(_ nodes: [DocNode]) {
            var top = stack.removeLast()
            top.content = (top.content ?? []) + nodes
            stack.append(top)
        }

        func open(_ node: DocNode) { stack.append(node) }

        func close() {
            guard stack.count > 1 else { return }
            push(stack.removeLast())
        }

        func finish() -> DocNode {
            while stack.count > 1 { close() }
            return stack[0]
        }
    }

    // MARK: shared helpers

    static func decodeEntities(_ text: [UInt16]) -> [UInt16] {
        var out = JSText.string(text)
        for (entity, char) in [("&lt;", "<"), ("&gt;", ">"), ("&quot;", "\""), ("&#39;", "'"), ("&amp;", "&")] {
            out = out.replacingOccurrences(of: entity, with: char, options: .literal)
        }
        return out.units
    }

    static func mergeText(_ nodes: [DocNode]) -> [DocNode] {
        var out: [DocNode] = []
        for node in nodes {
            if let last = out.last, last.type == "text", node.type == "text", sameMarks(last.marks, node.marks) {
                out[out.count - 1] = last.with("text", .string((last.text ?? "") + (node.text ?? "")))
            } else {
                out.append(node)
            }
        }
        return out
    }

    private static func sameMarks(_ a: [DocMark]?, _ b: [DocMark]?) -> Bool {
        let a = a ?? [], b = b ?? []
        return a.count == b.count && zip(a, b).allSatisfy { mark, other in
            mark.type.jsEquals(other.type)
                && mark.attr("href") == other.attr("href")
                && mark.attr("color") == other.attr("color")
                && mark.attr("fileRef")?.object?[identityKey] == other.attr("fileRef")?.object?[identityKey]
        }
    }

    // MARK: normalize

    /// shapes the tree so the editor schema accepts it
    static func normalize(_ input: DocNode) -> DocNode {
        // callouts read their title from the raw first line, before line breaks turn into spaces
        let node = input.type == "blockquote" ? toCallout(input) : input
        var next = node
        if let content = node.content, node.has("content") {
            next = node.with(content: content.flatMap { liftMedia(normalize($0)) })
        }
        if next.type == "callout" || next.type == "detailsContent", (next.content ?? []).isEmpty {
            next = next.with(content: [.node("paragraph", ("content", []))])
        }
        if ["listItem", "tableCell", "tableHeader", "blockquote"].contains(next.type) {
            let children = next.content ?? []
            if children.isEmpty || (next.type == "listItem" && children[0].type != "paragraph") {
                next = next.with(content: [.node("paragraph", ("content", []))] + children)
            }
        }
        if next.type == "bulletList" { return next }
        if let content = next.content, content.contains(where: { $0.type == "bulletList" }) {
            next = next.with(content: content.flatMap(splitTaskLists))
        }
        if ["paragraph", "heading", "detailsSummary"].contains(next.type) {
            let inline = mergeText((next.content ?? []).map { child in
                child.type == "softBreak" ? marksOf(child, .node("text", ("text", " "))) : child
            })
            next = next.with(content: inline.filter { $0.type != "text" || !($0.text ?? "").isEmpty })
        }
        return next
    }

    private static func marksOf(_ node: DocNode, _ into: DocNode) -> DocNode {
        if let marks = node.marks, !marks.isEmpty { return into.with("marks", .array(marks.map(JSValue.object))) }
        return into
    }

    private static func isBlank(_ child: DocNode) -> Bool {
        child.type == "hardBreak" || child.type == "softBreak"
            || (child.type == "text" && JSText.trim(child.text ?? "").isEmpty)
    }

    /// images and embeds become blocks, a paragraph that mixes them with text is split around them,
    /// so nothing an image or embed points at is ever lost
    private static func liftMedia(_ node: DocNode) -> [DocNode] {
        guard node.type == "paragraph", let children = node.content else { return [node] }
        let meaningful = children.filter { !isBlank($0) }
        // a lone link to a stored file is shown as an attachment
        // new Set(meaningful.map(fileRefOf)) holding one fileRef, by identity
        if let ref = meaningful.first.flatMap(fileRefOf),
           meaningful.allSatisfy({ fileRefOf($0)?[identityKey] == ref[identityKey] }) {
            return [mediaBlock(ref)]
        }
        if !meaningful.contains(where: { $0.type == "image" || fileRefOf($0)?["embed"]?.truthy == true }) {
            return [node.with(content: children.map(plainFileLink))]
        }
        var out: [DocNode] = []
        var run: [DocNode] = []
        func flush() {
            while let first = run.first, isBlank(first) { run.removeFirst() }
            while let last = run.last, isBlank(last) { run.removeLast() }
            if !run.isEmpty {
                var content = mergeText(run)
                let last = content[content.count - 1]
                if last.type == "text" { content[content.count - 1] = last.with("text", .string(JSText.trimEnd(last.text!))) }
                out.append(node.with(content: content.filter { $0.type != "text" || !($0.text ?? "").isEmpty }))
            }
            run = []
        }
        for child in children {
            let embed = fileRefOf(child)
            if child.type == "image" {
                flush()
                out.append(child)
            } else if let embed, embed["embed"]?.truthy == true {
                flush()
                out.append(mediaBlock(embed))
            } else {
                run.append(plainFileLink(child))
            }
        }
        flush()
        return out.isEmpty ? [node.with(content: [])] : out
    }

    private static func mediaBlock(_ ref: JSObject) -> DocNode {
        let fileId = ref["fileId"] ?? .null
        if ref["image"]?.truthy == true {
            return .node("image", ("attrs", .object(JSObject([("fileId", fileId), ("alt", "")]))))
        }
        return .node("fileAttachment", ("attrs", .object(JSObject([("fileId", fileId), ("name", ref["name"] ?? .null)]))))
    }

    /// a link to a file inside a sentence stays an ordinary link to it
    private static func plainFileLink(_ child: DocNode) -> DocNode {
        guard fileRefOf(child) != nil else { return child }
        let marks = (child.marks ?? []).map { mark -> DocMark in
            if let fileRef = mark.attr("fileRef"), fileRef.truthy {
                return .node("link", ("attrs", .object(JSObject([("href", mark.attr("href") ?? .null)]))))
            }
            return mark
        }
        return child.with("marks", .array(marks.map(JSValue.object)))
    }

    private static func fileRefOf(_ node: DocNode) -> JSObject? {
        node.marks?.first { $0.attr("fileRef")?.truthy == true }?.attr("fileRef")?.object
    }

    /// a quote that starts with [!type] is a callout, the rest of that first line is its title
    private static func toCallout(_ quote: DocNode) -> DocNode {
        let blocks = quote.content ?? []
        guard let first = blocks.first else { return quote }
        let rest = Array(blocks.dropFirst())
        guard first.type == "paragraph", let lead = first.content?.first else { return quote }
        guard lead.type == "text", lead.marks?.isEmpty ?? true,
              let match = callout.exec((lead.text ?? "").units)
        else { return quote }
        let leadText = (lead.text ?? "").units
        var inline: [DocNode] = []
        if leadText.count > match.range.count {
            inline.append(lead.with("text", .string(JSText.string(leadText[match.range.count...]))))
        }
        inline += (first.content ?? []).dropFirst()
        let breakAt = inline.firstIndex { $0.type == "softBreak" || $0.type == "hardBreak" }
        let titleNodes = breakAt.map { Array(inline[..<$0]) } ?? inline
        let body = breakAt.map { Array(inline[($0 + 1)...]) } ?? []
        let title = JSText.trim(titleNodes.map(Doc.inlineText).joined())
        let kind = JSText.string(JSText.lowercased(match.group(1)!))
        var attrs = JSObject()
        attrs["tone"] = .string(Model.calloutTone(kind))
        attrs["kind"] = .string(kind)
        if !title.isEmpty { attrs["title"] = .string(title) }
        let fold = match.group(2)!
        if !fold.isEmpty { attrs["fold"] = .string(JSText.string(fold)) }
        let content = body.isEmpty ? rest : [first.with(content: body)] + rest
        return .node("callout", ("attrs", .object(attrs)), ("content", .array((content.isEmpty ? [.node("paragraph", ("content", []))] : content).map(JSValue.object))))
    }

    /// a bullet list whose items start with [ ] or [x] becomes a checklist, mixed lists are split
    private static func splitTaskLists(_ node: DocNode) -> [DocNode] {
        guard node.type == "bulletList" else { return [node] }
        var groups: [DocNode] = []
        for item in node.content ?? [] {
            let task = toTaskItem(item)
            let type = task != nil ? "taskList" : "bulletList"
            if let last = groups.last, last.type == type {
                groups[groups.count - 1] = last.with(content: (last.content ?? []) + [task ?? item])
            } else {
                groups.append(.node(type, ("content", [.object(task ?? item)])))
            }
        }
        return groups
    }

    private static func toTaskItem(_ item: DocNode) -> DocNode? {
        guard let first = item.content?.first else { return nil }
        let lead = first.type == "paragraph" ? first.content?.first : nil
        guard let lead, lead.type == "text", lead.marks?.isEmpty ?? true else { return nil }
        let text = (lead.text ?? "").units
        guard let match = taskPrefix.exec(text) else { return nil }
        let rest = Array(text[match.range.count...])
        let inline = (rest.isEmpty ? [] : [lead.with("text", .string(JSText.string(rest)))]) + (first.content ?? []).dropFirst()
        return .node(
            "taskItem",
            ("attrs", ["checked": .bool(match.group(1)! != [0x20])]),
            ("content", .array(([first.with(content: inline)] + (item.content ?? []).dropFirst()).map(JSValue.object))),
        )
    }
}
