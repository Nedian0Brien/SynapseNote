import Foundation

/// The pages and documents the editor works on, in the shape of Morrow's `WorkspaceState`:
/// page records keyed by id, and one ProseMirror document per page.
nonisolated struct Workspace: Codable, Hashable, Sendable {
    var pages: [String: JSONValue]
    var docs: [String: JSONValue]

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
                rows.append(Row(
                    id: id,
                    title: title.isEmpty ? "Untitled" : title,
                    icon: page?["icon"]?.stringValue,
                    depth: depth
                ))
                visit(id, depth: depth + 1)
            }
        }
        visit(nil, depth: 0)
        return rows
    }

    static func load(from url: URL) throws -> Workspace {
        try JSONDecoder().decode(Workspace.self, from: Data(contentsOf: url))
    }
}
