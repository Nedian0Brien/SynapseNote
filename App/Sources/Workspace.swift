import Foundation

/// The page records of the open vault, in the shape of Morrow's `PageMeta`, as the editor page reports them.
nonisolated struct Workspace: Hashable, Sendable {
    var pages: [String: JSONValue] = [:]

    /// A page as the sidebar shows it, in tree order.
    struct Row: Identifiable, Hashable, Sendable {
        let id: String
        let title: String
        let icon: String?
        let depth: Int
    }

    /// Every page that is not in the trash, parents before children, siblings by their order.
    var rows: [Row] {
        var children: [String?: [String]] = [:]
        for (id, page) in pages where page["trashedAt"] == .null || page["trashedAt"] == nil {
            children[page["parentId"]?.stringValue, default: []].append(id)
        }
        for key in children.keys {
            children[key]?.sort { lhs, rhs in
                let left = pages[lhs]?["order"]?.doubleValue ?? 0
                let right = pages[rhs]?["order"]?.doubleValue ?? 0
                return left == right ? lhs < rhs : left < right
            }
        }
        var rows: [Row] = []
        func visit(_ parent: String?, depth: Int) {
            for id in children[parent] ?? [] {
                let page = pages[id]
                let title = page?["title"]?.stringValue?.trimmingCharacters(in: .whitespaces) ?? ""
                rows.append(Row(id: id, title: title.isEmpty ? "Untitled" : title, icon: page?["icon"]?.stringValue, depth: depth))
                visit(id, depth: depth + 1)
            }
        }
        visit(nil, depth: 0)
        return rows
    }

    /// Whether the page exists and is not in the trash, itself or through a parent.
    func isShowable(_ id: String) -> Bool {
        var current: String? = id
        var seen = Set<String>()
        while let page = current.flatMap({ pages[$0] }), let pageId = current, seen.insert(pageId).inserted {
            if let trashed = page["trashedAt"], trashed != .null { return false }
            current = page["parentId"]?.stringValue
        }
        return pages[id] != nil
    }
}
