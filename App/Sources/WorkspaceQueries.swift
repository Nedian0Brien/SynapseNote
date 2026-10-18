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

/// The queries the editor page answers, by the name `window.synapse.query` takes.
nonisolated enum WorkspaceQuery: Sendable {
    case search(String, limit: Int)
    case recent(limit: Int)
    case home
    case backlinks(String)
    case mentions(String)
    case outline(String)

    var name: String {
        switch self {
        case .search: "search"
        case .recent: "recent"
        case .home: "home"
        case .backlinks: "backlinks"
        case .mentions: "mentions"
        case .outline: "outline"
        }
    }

    var params: [String: any Sendable] {
        switch self {
        case .search(let query, let limit): ["query": query, "limit": limit]
        case .recent(let limit): ["limit": limit]
        case .home: [:]
        case .backlinks(let id), .mentions(let id), .outline(let id): ["id": id]
        }
    }

    /// Reads the page's answer, JSON text, or nil when there was none.
    static func decode<T: Decodable>(_ answer: Any?, as type: T.Type = T.self) throws -> T? {
        guard let text = answer as? String else { return nil }
        return try JSONDecoder().decode(T.self, from: Data(text.utf8))
    }
}
