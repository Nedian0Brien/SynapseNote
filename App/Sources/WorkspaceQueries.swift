import Foundation

/// Answers native screens read from the workspace, as `web/src/queries.ts` sends them. Pages are named by id;
/// titles, icons and places come from the `Workspace` the screens already have.
nonisolated struct SearchHit: Decodable, Hashable, Sendable, Identifiable {
    struct Snippet: Decodable, Hashable, Sendable {
        let before: String
        let match: String
        let after: String
    }

    let id: String
    /// Titles of the pages above this one, the top first.
    let path: [String]
    let titleMatch: Bool
    let snippet: Snippet?
    /// Text to select when the page opens.
    let firstMatch: String?
}

nonisolated struct HomeFacts: Decodable, Hashable, Sendable {
    struct Day: Decodable, Hashable, Sendable {
        let key: String
        let count: Int
        let future: Bool
    }

    struct Rediscover: Decodable, Hashable, Sendable {
        let id: String
        let excerpt: String
    }

    let streak: Int
    let pages: Int
    let words: Int
    let openTasks: Int
    /// The first open tasks, as many as the home page shows.
    let tasks: [TaskRef]
    let recent: [String]
    /// Columns of seven days, Monday first, the last holding today.
    let weeks: [[Day]]
    let onThisDay: [String]
    let rediscover: Rediscover?
}

/// A checklist item, by its place among the page's checklist items, as Morrow's `TaskRef`.
nonisolated struct TaskRef: Decodable, Hashable, Sendable, Identifiable {
    let pageId: String
    let index: Int
    let text: String
    let checked: Bool

    var id: String { "\(pageId):\(index)" }
}

nonisolated struct Backlink: Decodable, Hashable, Sendable, Identifiable {
    let id: String
    /// The line the link is in.
    let context: String?
}

nonisolated struct Mention: Decodable, Hashable, Sendable, Identifiable {
    let id: String
    let context: String
}

nonisolated struct Heading: Decodable, Hashable, Sendable, Identifiable {
    /// Place among the page's top level headings, what `EditorCommand.scrollToHeading` takes.
    let index: Int
    let level: Int
    let text: String

    var id: Int { index }
}

nonisolated struct TagEntry: Decodable, Hashable, Sendable, Identifiable {
    let tag: String
    let pages: Int
    /// One of Morrow's colour names, the same for a tag everywhere.
    let color: String

    var id: String { tag.lowercased() }
}

nonisolated struct TemplateList: Decodable, Hashable, Sendable {
    /// The Templates page, nil when the vault has none.
    let container: String?
    let templates: [String]
}

/// The numbers beside the sidebar's Tasks, Tags and Review.
nonisolated struct SidebarCounts: Decodable, Hashable, Sendable {
    let openTasks: Int
    let tags: Int
    let dueCards: Int
}

/// A flashcard, a `question :: answer` line, as Morrow's `Card`.
nonisolated struct Flashcard: Decodable, Hashable, Sendable, Identifiable {
    let id: String
    let pageId: String
    let front: String
    let back: String
}

nonisolated struct ReviewData: Decodable, Hashable, Sendable {
    let cards: [Flashcard]
    /// The cards due now, cards seen before first.
    let due: [String]
}

/// Pages joined by links, Morrow's `buildGraph`.
nonisolated struct GraphData: Decodable, Hashable, Sendable {
    struct Node: Decodable, Hashable, Sendable, Identifiable {
        let id: String
        let label: String
        /// "page" or "tag".
        let kind: String
        let pageId: String?
        let degree: Int
        /// The top level page the node sits under, which picks its colour.
        let group: String
    }

    struct Link: Decodable, Hashable, Sendable {
        let source: String
        let target: String
        /// "link", "child" or "tag".
        let kind: String
    }

    let nodes: [Node]
    let links: [Link]
}

/// What the graph shows, Morrow's `GraphOptions`.
nonisolated struct GraphOptions: Codable, Hashable, Sendable {
    var tags = false
    var hierarchy = false
    var orphans = true
    var depth = 1
}

/// The queries the editor page answers, by the name `window.synapse.query` takes.
nonisolated enum WorkspaceQuery: Sendable {
    case search(String, limit: Int)
    case recent(limit: Int)
    case home
    case backlinks(String)
    case mentions(String)
    case outline(String)
    case tags
    case tagPages(String)
    case tasks
    case templates
    case counts
    case graph(GraphOptions, focus: String?)
    case review

    var name: String {
        switch self {
        case .search: "search"
        case .recent: "recent"
        case .home: "home"
        case .backlinks: "backlinks"
        case .mentions: "mentions"
        case .outline: "outline"
        case .tags: "tags"
        case .tagPages: "tagPages"
        case .tasks: "tasks"
        case .templates: "templates"
        case .counts: "counts"
        case .graph: "graph"
        case .review: "review"
        }
    }

    var params: [String: any Sendable] {
        switch self {
        case .search(let query, let limit): ["query": query, "limit": limit]
        case .recent(let limit): ["limit": limit]
        case .home, .tags, .tasks, .templates, .counts, .review: [:]
        case .backlinks(let id), .mentions(let id), .outline(let id): ["id": id]
        case .tagPages(let tag): ["tag": tag]
        case .graph(let options, let focus):
            // no focus is left out, the page reads that as the whole graph
            focus.map { ["tags": options.tags, "hierarchy": options.hierarchy, "orphans": options.orphans, "depth": options.depth, "focus": $0] }
                ?? ["tags": options.tags, "hierarchy": options.hierarchy, "orphans": options.orphans, "depth": options.depth]
        }
    }

    /// The parameters as the Swift core reads them, the same values `params` sends the page.
    var jsParams: JSObject {
        var object = JSObject()
        for (key, value) in params {
            switch value {
            case let text as String: object[key] = .string(text)
            case let flag as Bool: object[key] = .bool(flag)
            case let number as Int: object[key] = .number(Double(number))
            case let number as Double: object[key] = .number(number)
            default: break
            }
        }
        return object
    }

    /// Reads the page's answer, JSON text, or nil when there was none.
    static func decode<T: Decodable>(_ answer: Any?, as type: T.Type = T.self) throws -> T? {
        guard let text = answer as? String else { return nil }
        return try JSONDecoder().decode(T.self, from: Data(text.utf8))
    }
}
