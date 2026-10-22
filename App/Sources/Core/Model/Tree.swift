import Foundation

/// Morrow's core/tree.ts.
nonisolated enum Tree {
    typealias Pages = JSRecord<PageMeta>

    static func compareSiblings(_ a: PageMeta, _ b: PageMeta) -> Int {
        if a.order != b.order { return a.order < b.order ? -1 : 1 }
        if a.createdAt != b.createdAt { return a.createdAt < b.createdAt ? -1 : 1 }
        return JSCollator.compare(a.id, b.id, locale: JSEnvironment.locale)
    }

    /// a page with a missing parent shows at the top level instead of vanishing
    static func effectiveParent(_ pages: Pages, _ page: PageMeta) -> String? {
        guard let parentId = page.parentId, pages.has(parentId) else { return nil }
        return parentId
    }

    static func childrenOf(_ pages: Pages, _ parentId: String?, includeTrashed: Bool = false) -> [PageMeta] {
        pages.valuesInOrder
            .filter { effectiveParent(pages, $0) == parentId && (includeTrashed || $0.trashedAt == nil) }
            .jsSorted(compareSiblings)
    }

    /// nearest parent first, stops on missing parents and corrupted cycles
    static func ancestorsOf(_ pages: Pages, _ id: String) -> [PageMeta] {
        var result: [PageMeta] = []
        var seen = JSSet([id])
        var current = pages[id]?.parentId
        while let next = current, result.count < Model.maxTreeDepth, !seen.has(next) {
            guard let parent = pages[next] else { break }
            seen.insert(next)
            result.append(parent)
            current = parent.parentId
        }
        return result
    }

    static func descendantsOf(_ pages: Pages, _ id: String) -> [PageMeta] {
        let byParent = groupByParent(pages)
        var result: [PageMeta] = []
        var seen = JSSet([id])
        var queue = [id]
        while !queue.isEmpty {
            let next = queue.removeFirst()
            for child in byParent[next] ?? [] where seen.insert(child.id) {
                result.append(child)
                queue.append(child.id)
            }
        }
        return result
    }

    static func isDescendantOf(_ pages: Pages, _ id: String, _ ancestorId: String) -> Bool {
        ancestorsOf(pages, id).contains { $0.id == ancestorId }
    }

    static func isEffectivelyTrashed(_ pages: Pages, _ id: String) -> Bool {
        guard let page = pages[id] else { return true }
        if page.trashedAt != nil { return true }
        return ancestorsOf(pages, id).contains { $0.trashedAt != nil }
    }

    static func livePages(_ pages: Pages) -> [PageMeta] {
        var trashed: [JSKey: Bool] = [:]
        func resolve(_ id: String, _ depth: Int) -> Bool {
            if let known = trashed[JSKey(id)] { return known }
            let value: Bool
            if let page = pages[id], page.trashedAt == nil {
                if let parentId = page.parentId, depth <= Model.maxTreeDepth, pages.has(parentId) {
                    value = resolve(parentId, depth + 1)
                } else {
                    value = false
                }
            } else {
                value = true
            }
            trashed[JSKey(id)] = value
            return value
        }
        return pages.valuesInOrder.filter { !resolve($0.id, 0) }
    }

    static func trashedPages(_ pages: Pages) -> [PageMeta] {
        pages.valuesInOrder.filter { $0.trashedAt != nil }.jsSorted { a, b in
            let d = (b.trashedAt ?? 0) - (a.trashedAt ?? 0)
            return d == 0 ? 0 : d < 0 ? -1 : 1
        }
    }

    static func flattenTree(_ pages: Pages) -> [(page: PageMeta, depth: Int)] {
        let byParent = groupByParent(pages, includeTrashed: false)
        var result: [(page: PageMeta, depth: Int)] = []
        var seen = JSSet()
        func visit(_ parentId: String?, _ depth: Int) {
            if depth > Model.maxTreeDepth { return }
            for page in byParent[parentId] ?? [] where seen.insert(page.id) {
                result.append((page, depth))
                visit(page.id, depth + 1)
            }
        }
        visit(nil, 0)
        return result
    }

    /// pages grouped by effective parent, each group sorted as siblings
    static func groupByParent(_ pages: Pages, includeTrashed: Bool = true) -> ParentIndex {
        var index = ParentIndex()
        for page in pages.valuesInOrder where includeTrashed || page.trashedAt == nil {
            index.append(page, to: effectiveParent(pages, page))
        }
        index.sortGroups(compareSiblings)
        return index
    }

    /// A JavaScript `Map<PageId | null, PageMeta[]>`: groups in the order their first page arrived.
    struct ParentIndex {
        private(set) var parents: [String?] = []
        private var groups: [JSKey?: [PageMeta]] = [:]

        subscript(_ parent: String?) -> [PageMeta]? { groups[parent.map(JSKey.init)] }

        mutating func append(_ page: PageMeta, to parent: String?) {
            let key = parent.map(JSKey.init)
            if groups[key] == nil {
                parents.append(parent)
                groups[key] = [page]
            } else {
                groups[key]!.append(page)
            }
        }

        mutating func sortGroups(_ compare: (PageMeta, PageMeta) -> Int) {
            for key in groups.keys { groups[key] = groups[key]!.jsSorted(compare) }
        }
    }
}

/// Morrow's core/daily.ts.
nonisolated enum Daily {
    static let journalTitle = "Journal"

    /// local calendar date as yyyy mm dd joined by hyphens, which sorts naturally
    static func dateKey(_ date: Date) -> String {
        let parts = JSEnvironment.calendar.dateComponents([.year, .month, .day], from: date)
        func pad(_ value: Int) -> String { value < 10 ? "0\(value)" : "\(value)" }
        return "\(parts.year!)-\(pad(parts.month!))-\(pad(parts.day!))"
    }

    private static let keyPattern = JSRegex(#"^(\d{4})-(\d{2})-(\d{2})$"#)

    /// `new Date(year, month - 1, day)` in local time, rolling over out of range months and days as JavaScript does
    static func parseDateKey(_ key: String) -> Date? {
        guard let match = keyPattern.exec(key.units),
              var year = Int(JSText.string(match.group(1)!)), let month = Int(JSText.string(match.group(2)!)),
              let day = Int(JSText.string(match.group(3)!))
        else { return nil }
        // the Date constructor reads years 0 to 99 as 1900 to 1999
        if year <= 99 { year += 1900 }
        var parts = DateComponents()
        parts.year = year
        parts.month = 1
        parts.day = 1
        let calendar = JSEnvironment.calendar
        guard let start = calendar.date(from: parts),
              let withMonth = calendar.date(byAdding: .month, value: month - 1, to: start),
              let date = calendar.date(byAdding: .day, value: day - 1, to: withMonth)
        else { return nil }
        return date
    }

    /// `date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })`
    static func dailyTitle(_ date: Date, locale: Locale = JSEnvironment.locale) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = JSEnvironment.timeZone
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.setLocalizedDateFormatFromTemplate("yMMMMEEEEd")
        return formatter.string(from: date)
    }

    static func findJournal(_ state: WorkspaceState) -> PageMeta? {
        Tree.livePages(state.pages).first { $0.kind == .journal && $0.parentId == nil }
    }

    static func findDailyNote(_ state: WorkspaceState, _ key: String) -> PageMeta? {
        Tree.livePages(state.pages).first { $0.dailyDate == key }
    }

    /// where a new daily note goes so the journal stays newest first
    static func dailyInsertIndex(_ siblings: [PageMeta], _ key: String) -> Int {
        siblings.firstIndex { $0.dailyDate.map { $0.jsLess(key) } ?? false } ?? siblings.count
    }
}
