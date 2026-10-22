import Foundation

/// Morrow's core/links.ts.
nonisolated enum Links {
    struct Occurrence: Equatable, Sendable {
        var targetId: String
        var context: String
    }

    static func pageHref(_ id: String) -> String { "#/page/\(id)" }

    /// `/^#\/page\/([A-Za-z0-9_-]+)/`
    static func pageIdFromHref(_ href: JSValue?) -> String? {
        guard case .string(let text) = href else { return nil }
        let units = text.units
        let prefix = "#/page/".units
        guard JSText.startsWith(units, prefix) else { return nil }
        let id = units[prefix.count...].prefix {
            (0x30...0x39).contains($0) || (0x41...0x5A).contains($0) || (0x61...0x7A).contains($0) || $0 == 0x5F || $0 == 0x2D
        }
        return id.isEmpty ? nil : JSText.string(id)
    }

    /// page link nodes plus ordinary links that point at a page
    static func linksInDoc(_ doc: DocNode) -> [Occurrence] {
        var result: [Occurrence] = []
        func visitBlock(_ block: DocNode) {
            var targets: [String] = []
            func collect(_ node: DocNode) {
                if node.type == "pageLink", case .string(let id) = node.attr("id") { targets.append(id) }
                for mark in node.marks ?? [] where mark.type == "link" {
                    if let id = pageIdFromHref(mark.attr("href")) { targets.append(id) }
                }
                for child in node.content ?? [] { collect(child) }
            }
            collect(block)
            if targets.isEmpty { return }
            let context = JSText.trim(Doc.inlineText(block))
            for targetId in JSSet(targets) { result.append(Occurrence(targetId: targetId, context: context)) }
        }
        func visit(_ node: DocNode) {
            if node.type == "paragraph" || node.type == "heading" { return visitBlock(node) }
            for child in node.content ?? [] { visit(child) }
        }
        visit(doc)
        return result
    }

    struct Backlink: Sendable {
        var source: PageMeta
        var contexts: [String]
    }

    private static func newestFirst(_ a: PageMeta, _ b: PageMeta) -> Int {
        a.updatedAt == b.updatedAt ? 0 : b.updatedAt < a.updatedAt ? -1 : 1
    }

    static func backlinksTo(_ state: WorkspaceState, _ targetId: String) -> [Backlink] {
        var result: [Backlink] = []
        for page in Tree.livePages(state.pages) where !page.id.jsEquals(targetId) {
            guard let doc = state.docs[page.id] else { continue }
            let contexts = linksInDoc(doc).filter { $0.targetId.jsEquals(targetId) }.map(\.context)
            if !contexts.isEmpty { result.append(Backlink(source: page, contexts: contexts)) }
        }
        return result.jsSorted { newestFirst($0.source, $1.source) }
    }

    /// swaps stored link labels for current titles before export
    static func refreshLinkLabels(_ doc: DocNode, _ titleOf: (String) -> String?) -> DocNode {
        func visit(_ node: DocNode) -> DocNode {
            if node.type == "pageLink", case .string(let id) = node.attr("id") {
                guard let title = titleOf(id) else { return node }
                var attrs = node.attrs ?? JSObject()
                attrs["label"] = .string(title)
                return node.with("attrs", .object(attrs))
            }
            guard let content = node.content, node.has("content") else { return node }
            return node.with(content: content.map(visit))
        }
        return visit(doc)
    }

    struct Mention: Sendable {
        var source: PageMeta
        var context: String
    }

    /// pages that name this page in their text without linking to it, so a link is easy to add.
    /// Morrow's pattern is `(^|[^\p{L}\p{N}])TITLE(?=$|[^\p{L}\p{N}])` with `iu`; ICU's case-insensitive
    /// matching stands in for JavaScript's simple case folding.
    static func unlinkedMentions(_ state: WorkspaceState, _ targetId: String, limit: Int = 20) -> [Mention] {
        let title = state.pages[targetId].map { JSText.trim(Model.displayTitle($0)) } ?? ""
        if title.utf16.count < 3 || title == Model.untitled { return [] }
        let escaped = NSRegularExpression.escapedPattern(for: title)
        guard let pattern = try? NSRegularExpression(pattern: "(^|[^\\p{L}\\p{N}])\(escaped)(?=(?![\\s\\S])|[^\\p{L}\\p{N}])",
                                                     options: [.caseInsensitive]) else { return [] }
        var result: [Mention] = []
        for page in Tree.livePages(state.pages) {
            if page.id.jsEquals(targetId) || result.count >= limit { continue }
            guard let doc = state.docs[page.id], !linksInDoc(doc).contains(where: { $0.targetId.jsEquals(targetId) }) else { continue }
            let text = Doc.docToPlainText(doc)
            let units = text.units
            let string = NSString(characters: units, length: units.count)
            guard let match = pattern.firstMatch(in: string as String, range: NSRange(location: 0, length: units.count)) else { continue }
            let at = match.range.location + match.range(at: 1).length
            let lineStart = JSText.lastIndexOf(units, 0x0A, from: at) + 1
            let lineEnd = JSText.indexOf(units, 0x0A, from: at)
            let line = JSText.slice(units, lineStart, lineEnd == -1 ? units.count : lineEnd)
            result.append(Mention(source: page, context: JSText.string(line.prefix(200))))
        }
        return result.jsSorted { newestFirst($0.source, $1.source) }
    }
}

/// Morrow's core/tags.ts: tags come from a page's tags property and from #tags written in its text.
nonisolated enum Tags {
    private static let inlineTag: NSRegularExpression = {
        let space = JSText.spaceClass
        // swiftlint:disable:next force_try
        return try! NSRegularExpression(pattern: "(?:^|[\(space)(])#([\\p{L}\\p{N}_\\-/]*[\\p{L}_\\-/][\\p{L}\\p{N}_\\-/]*)")
    }()

    static func inlineTags(_ doc: DocNode?) -> [String] {
        guard let doc else { return [] }
        var tags = JSSet()
        Doc.walk(doc) { node, parent in
            if node.type == "codeBlock" || node.type == "rawBlock" { return false }
            guard node.type == "text", let text = node.text, !text.isEmpty, parent?.type != "codeBlock" else { return true }
            if node.marks?.contains(where: { $0.type == "code" || $0.type == "link" }) == true { return true }
            let units = text.units
            let string = NSString(characters: units, length: units.count)
            for match in inlineTag.matches(in: string as String, range: NSRange(location: 0, length: units.count)) {
                let range = match.range(at: 1)
                if let tag = Frontmatter.normalizeTag(JSText.string(units[range.location..<(range.location + range.length)])) { tags.insert(tag) }
            }
            return true
        }
        return tags.items
    }

    static func tagsOf(_ page: PageMeta, _ doc: DocNode?) -> [String] {
        JSSet(page.tags + inlineTags(doc)).items
    }

    /// a page tagged project/garden also counts for project
    static func tagMatches(_ tag: String, _ wanted: String) -> Bool {
        let a = JSText.lowercased(tag.units)
        let b = JSText.lowercased(wanted.units)
        return a == b || JSText.startsWith(a, b + [0x2F])
    }

    struct Summary: Sendable {
        var tag: String
        var pages: [String]
    }

    static func collectTags(_ state: WorkspaceState) -> [Summary] {
        var byTag = JSMap<(tag: String, pages: JSSet)>()
        for page in Tree.livePages(state.pages) {
            for tag in tagsOf(page, state.docs[page.id]) {
                let key = JSText.string(JSText.lowercased(tag.units))
                var entry = byTag[key] ?? (tag, JSSet())
                entry.pages.insert(page.id)
                byTag[key] = entry
            }
        }
        return byTag.valuesInOrder.map { Summary(tag: $0.tag, pages: $0.pages.items) }
            .jsSorted { JSCollator.compare($0.tag, $1.tag, locale: JSEnvironment.locale, base: true) }
    }

    static func pagesWithTag(_ state: WorkspaceState, _ wanted: String) -> [PageMeta] {
        Tree.livePages(state.pages)
            .filter { page in tagsOf(page, state.docs[page.id]).contains { tagMatches($0, wanted) } }
            .jsSorted { a, b in a.updatedAt == b.updatedAt ? 0 : b.updatedAt < a.updatedAt ? -1 : 1 }
    }

    /// every tag keeps the same colour everywhere, picked from its name
    static func tagColor(_ tag: String) -> String {
        var hash: UInt64 = 0
        let first = JSText.split(JSText.string(JSText.lowercased(tag.units)), on: 0x2F)[0]
        // for (const char of ...) walks code points; charCodeAt(0) is the first unit of each
        for scalar in first.unicodeScalars {
            hash = (hash &* 31 &+ UInt64(String(scalar).utf16.first!)) & 0xFFFF_FFFF
        }
        // gray is left out so every tag gets a real colour
        let palette = Model.colors.filter { $0 != "gray" }
        return palette[Int(hash % UInt64(palette.count))]
    }
}

/// Morrow's core/graph.ts: the graph of pages joined by links, used by the graph view.
nonisolated enum Graph {
    struct Options: Sendable {
        var tags = false
        var hierarchy = false
        var orphans = true
        /// only pages within depth links of this page
        var focus: String?
        var depth = 1.0
    }

    static func buildGraph(_ state: WorkspaceState, _ options: Options) -> JSValue {
        let pages = Tree.livePages(state.pages)
        let live = JSSet(pages.map(\.id))
        var nodes = JSMap<JSObject>()
        var links: [(source: String, target: String, kind: String)] = []
        var seen = JSSet()
        func addLink(_ source: String, _ target: String, _ kind: String) {
            if source.jsEquals(target) { return }
            let key = source.jsLess(target) ? "\(source)|\(target)" : "\(target)|\(source)"
            if !seen.insert(key) { return }
            links.append((source, target, kind))
        }
        func rootOf(_ id: String) -> String {
            Tree.ancestorsOf(state.pages, id).last?.id ?? id
        }
        for page in pages {
            nodes[page.id] = JSObject([
                ("id", .string(page.id)), ("label", .string(Model.displayTitle(page))), ("kind", "page"),
                ("pageId", .string(page.id)), ("degree", 0), ("group", .string(rootOf(page.id))),
            ])
        }
        for page in pages {
            guard let doc = state.docs[page.id] else { continue }
            if page.kind == .canvas {
                for target in CanvasFile.pagesInCanvas(CanvasFile.canvasFromDoc(doc)) where live.has(target) { addLink(page.id, target, "link") }
            }
            for link in Links.linksInDoc(doc) where live.has(link.targetId) { addLink(page.id, link.targetId, "link") }
            if options.hierarchy, let parentId = page.parentId, live.has(parentId) { addLink(parentId, page.id, "child") }
            if options.tags {
                for tag in Tags.tagsOf(page, doc) {
                    let id = "#" + JSText.string(JSText.lowercased(tag.units))
                    if !nodes.has(id) {
                        nodes[id] = JSObject([
                            ("id", .string(id)), ("label", .string("#\(tag)")), ("kind", "tag"), ("pageId", .null),
                            ("degree", 0), ("group", .string(id)),
                        ])
                    }
                    addLink(page.id, id, "tag")
                }
            }
        }
        for link in links {
            for end in [link.source, link.target] {
                var node = nodes[end]!
                node["degree"] = .number((node["degree"]?.number ?? 0) + 1)
                nodes[end] = node
            }
        }
        var kept = nodes.valuesInOrder
        if let focus = options.focus, !focus.isEmpty, nodes.has(focus) {
            var near = JSSet([focus])
            for _ in 0..<Int(max(1, options.depth.rounded(.up))) {
                for link in links {
                    if near.has(link.source) { near.insert(link.target) } else if near.has(link.target) { near.insert(link.source) }
                }
            }
            kept = kept.filter { near.has($0["id"]!.string!) }
        } else if !options.orphans {
            kept = kept.filter { ($0["degree"]?.number ?? 0) > 0 }
        }
        let ids = JSSet(kept.map { $0["id"]!.string! })
        let keptLinks = links.filter { ids.has($0.source) && ids.has($0.target) }
            .map { JSValue.object(JSObject([("source", .string($0.source)), ("target", .string($0.target)), ("kind", .string($0.kind))])) }
        return ["nodes": .array(kept.map(JSValue.object)), "links": .array(keptLinks)]
    }
}
