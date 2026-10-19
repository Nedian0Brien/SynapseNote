import Foundation

/// Morrow's core/search.ts.
nonisolated enum Search {
    struct Snippet: Equatable, Sendable {
        var before: String
        var match: String
        var after: String

        var json: JSValue { ["before": .string(before), "match": .string(match), "after": .string(after)] }
    }

    struct Result: Sendable {
        var page: PageMeta
        var score: Double
        var titleMatch: Bool
        var snippet: Snippet?
        /// text to highlight when the page opens
        var firstMatch: String?
        var path: [String]
    }

    /// `foldText`: canonical decomposition without combining diacritics, lower case
    static func foldText(_ text: String) -> String {
        let units = text.decomposedStringWithCanonicalMapping.utf16.filter { !(0x0300...0x036F).contains($0) }
        return JSText.string(JSText.lowercased(Array(units)))
    }

    private struct Body {
        let raw: [UInt16]
        let folded: [UInt16]
    }

    private static func textOf(_ doc: DocNode?) -> Body {
        guard let doc else { return Body(raw: [], folded: []) }
        let raw = Doc.docToPlainText(doc)
        // folding can change string length, so offsets are only trusted when lengths agree
        return Body(raw: raw.units, folded: foldText(raw).units)
    }

    /// `text.split(/\s+/)` with JavaScript's whitespace: a run of it is one separator
    static func splitOnSpace(_ text: String) -> [String] {
        let units = text.units
        var parts: [String] = []
        var current: [UInt16] = []
        var index = 0
        while index < units.count {
            if JSText.isSpace(units[index]) {
                parts.append(JSText.string(current))
                current = []
                while index < units.count, JSText.isSpace(units[index]) { index += 1 }
            } else {
                current.append(units[index])
                index += 1
            }
        }
        parts.append(JSText.string(current))
        return parts
    }

    static func tokenize(_ query: String) -> [String] {
        Array(splitOnSpace(foldText(query)).map(JSText.trim).filter { !$0.isEmpty }.prefix(12))
    }

    /// `/^#[^#\s]+$/`
    private static func isTagTerm(_ term: String) -> Bool {
        let units = term.units
        return units.count >= 2 && units[0] == 0x23 && units.dropFirst().allSatisfy { $0 != 0x23 && !JSText.isSpace($0) }
    }

    /// #tag in a query keeps only pages with that tag, the other words are searched as usual
    static func searchWorkspace(_ state: WorkspaceState, _ query: String, limit: Int = 50, now: Double) -> [Result] {
        let all = tokenize(query)
        let wantedTags = all.filter(isTagTerm).map { String($0.dropFirst()) }
        let terms = all.filter { !isTagTerm($0) }
        if terms.isEmpty, wantedTags.isEmpty { return [] }
        let phrase = terms.joined(separator: " ").units
        var results: [Result] = []
        for page in Tree.livePages(state.pages) {
            if !wantedTags.isEmpty {
                let tags = Tags.tagsOf(page, state.docs[page.id])
                if !wantedTags.allSatisfy({ wanted in tags.contains { Tags.tagMatches(foldText($0), wanted) } }) { continue }
            }
            let title = foldText(Model.displayTitle(page)).units
            let body = textOf(state.docs[page.id])
            var score = 0.0
            var matchedAll = true
            for term in terms.map(\.units) {
                let inTitle = JSText.indexOf(title, term) != -1
                let inBody = JSText.indexOf(body.folded, term) != -1
                if !inTitle, !inBody {
                    matchedAll = false
                    break
                }
                if inTitle { score += JSText.startsWith(title, term) ? 12 : 8 }
                if inBody { score += Double(min(5, countOccurrences(body.folded, term))) }
            }
            if !matchedAll { continue }
            let titleMatch = terms.allSatisfy { JSText.indexOf(title, $0.units) != -1 }
            if !phrase.isEmpty, title == phrase { score += 30 } else if !phrase.isEmpty, JSText.startsWith(title, phrase) { score += 15 }
            if !phrase.isEmpty, JSText.indexOf(body.folded, phrase) != -1 { score += 6 }
            // small recency bonus so fresh notes win ties
            score += max(0, 2 - (now - page.updatedAt) / (1000 * 60 * 60 * 24 * 30))
            let bodyTerm: [UInt16]? = !phrase.isEmpty && JSText.indexOf(body.folded, phrase) != -1
                ? phrase : terms.map(\.units).first { JSText.indexOf(body.folded, $0) != -1 }
            let snippet = bodyTerm.map { makeSnippet(body, $0) }
            results.append(Result(
                page: page, score: score, titleMatch: titleMatch, snippet: snippet, firstMatch: snippet?.match,
                path: Tree.ancestorsOf(state.pages, page.id).reversed().map(Model.displayTitle),
            ))
        }
        return Array(results.jsSorted { a, b in
            if a.score != b.score { return b.score < a.score ? -1 : 1 }
            if a.page.updatedAt != b.page.updatedAt { return b.page.updatedAt < a.page.updatedAt ? -1 : 1 }
            return 0
        }.prefix(limit))
    }

    private static func countOccurrences(_ haystack: [UInt16], _ needle: [UInt16]) -> Int {
        var count = 0
        var index = JSText.indexOf(haystack, needle)
        while index != -1, count < 50 {
            count += 1
            index = JSText.indexOf(haystack, needle, from: index + needle.count)
        }
        return count
    }

    private static func makeSnippet(_ body: Body, _ term: [UInt16], radius: Int = 60) -> Snippet {
        let aligned = body.raw.count == body.folded.count
        let source = aligned ? body.raw : body.folded
        let index = JSText.indexOf(body.folded, term)
        let lineStart = JSText.lastIndexOf(source, 0x0A, from: index) + 1
        let lineEndRaw = JSText.indexOf(source, 0x0A, from: index + term.count)
        let lineEnd = lineEndRaw == -1 ? source.count : lineEndRaw
        let start = max(lineStart, index - radius)
        let end = min(lineEnd, index + term.count + radius)
        return Snippet(
            before: (start > lineStart ? "…" : "") + JSText.string(JSText.trimStart(JSText.slice(source, start, index))),
            match: JSText.string(JSText.slice(source, index, index + term.count)),
            after: JSText.string(JSText.trimEnd(JSText.slice(source, index + term.count, end))) + (end < lineEnd ? "…" : ""),
        )
    }

    static func findPagesByTitle(_ state: WorkspaceState, _ query: String, limit: Int = 8) -> [PageMeta] {
        let folded = foldText(JSText.trim(query)).units
        let pages = Tree.livePages(state.pages)
        if folded.isEmpty {
            return Array(pages.jsSorted { a, b in
                let x = b.lastOpenedAt ?? b.updatedAt, y = a.lastOpenedAt ?? a.updatedAt
                return x == y ? 0 : x < y ? -1 : 1
            }.prefix(limit))
        }
        let entries = pages.map { (page: $0, title: foldText(Model.displayTitle($0)).units) }.filter { JSText.indexOf($0.title, folded) != -1 }
        return Array(entries.jsSorted { a, b in
            let start = (JSText.startsWith(b.title, folded) ? 1 : 0) - (JSText.startsWith(a.title, folded) ? 1 : 0)
            return start != 0 ? start : a.title.count - b.title.count
        }.prefix(limit).map(\.page))
    }

    static func pageIdByTitle(_ state: WorkspaceState, _ title: String) -> String? {
        let folded = foldText(JSText.trim(title)).units
        return Tree.livePages(state.pages).first { foldText(Model.displayTitle($0)).units == folded }?.id
    }

    private static let pageExtension = JSRegex(#"\.(md|canvas)$"#, ignoreCase: true)

    /// a written [[target]] to a page: by title, by file name, or by the last part of a path
    static func resolveLinkTarget(_ state: WorkspaceState, _ target: String) -> String? {
        let clean = JSText.string(pageExtension.replaceAll(JSText.trim(target.units)) { _ in [] })
        if clean.isEmpty { return nil }
        let last = JSText.split(clean, on: 0x2F).last ?? clean
        return pageIdByTitle(state, clean) ?? pageIdByTitle(state, last)
    }
}
