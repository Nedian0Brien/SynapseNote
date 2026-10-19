import Foundation

/// The answers native screens read from the workspace, as web/src/queries.ts and the editor page's `query`
/// give them: pages by id, the same JSON values.
nonisolated enum CoreQueries {
    struct Context: Sendable {
        var state: WorkspaceState
        /// saves per day (`repository.activity()`)
        var activity: JSObject
        /// flashcard progress (`reviews.log()`)
        var reviewLog: JSObject
        /// `new Date()` and `Date.now()`
        var now: Date
    }

    /// `query(name, params)` of web/src/main.tsx; nil for a query that is not known.
    static func answer(_ name: String, _ params: JSObject, _ context: Context) -> JSValue? {
        let state = context.state
        let id = params["id"]?.string ?? ""
        let limit = params["limit"]?.number ?? 30
        switch name {
        case "search": return search(state, params["query"]?.string ?? "", limit: limit, now: context.now)
        case "recent": return recent(state, limit: limit)
        case "home": return home(state, context.activity, context.now)
        case "backlinks": return backlinks(state, id)
        case "mentions": return mentions(state, id)
        case "outline": return outline(state.docs[id])
        case "tags": return tags(state)
        case "tagPages": return ids(Tags.pagesWithTag(state, params["tag"]?.string ?? ""))
        case "tasks": return .array(Tasks.collectTasks(state).map(taskJSON))
        case "templates":
            return ["container": Templates.findTemplatesPage(state).map { .string($0.id) } ?? .null, "templates": ids(Templates.listTemplates(state))]
        case "counts":
            let tasks = Tasks.collectTasks(state).filter { !$0.checked }.count
            let due = Flashcards.dueCards(Flashcards.collectCards(state), context.reviewLog, context.now).count
            return ["openTasks": .number(Double(tasks)), "tags": .number(Double(Tags.collectTags(state).count)), "dueCards": .number(Double(due))]
        case "review":
            let cards = Flashcards.collectCards(state)
            return [
                "cards": .array(cards.map(\.json)),
                "due": .array(Flashcards.dueCards(cards, context.reviewLog, context.now).map { .string($0.id) }),
            ]
        case "graph":
            let options = Graph.Options(
                tags: params["tags"] == .bool(true), hierarchy: params["hierarchy"] == .bool(true),
                orphans: params["orphans"] != .bool(false), focus: params["focus"]?.string, depth: params["depth"]?.number ?? 1,
            )
            return Graph.buildGraph(state, options)
        default: return nil
        }
    }

    private static func ids(_ pages: [PageMeta]) -> JSValue { .array(pages.map { .string($0.id) }) }

    private static func taskJSON(_ task: Tasks.Ref) -> JSValue {
        ["pageId": .string(task.pageId), "index": .number(Double(task.index)), "text": .string(task.text), "checked": .bool(task.checked)]
    }

    static func search(_ state: WorkspaceState, _ query: String, limit: Double, now: Date) -> JSValue {
        let results = Search.searchWorkspace(state, query, limit: limit.isFinite ? max(0, Int(limit)) : 0, now: now.timeIntervalSince1970 * 1000)
        return .array(results.map { result in
            [
                "id": .string(result.page.id), "path": .array(result.path.map(JSValue.string)), "titleMatch": .bool(result.titleMatch),
                "snippet": result.snippet?.json ?? .null, "firstMatch": result.firstMatch.map(JSValue.string) ?? .null,
            ]
        })
    }

    /// the palette's list before anything is typed, as morrow's CommandPalette
    static func recent(_ state: WorkspaceState, limit: Double) -> JSValue {
        let pages = Tree.livePages(state.pages).filter { $0.lastOpenedAt != nil }.jsSorted { a, b in
            let x = b.lastOpenedAt ?? 0, y = a.lastOpenedAt ?? 0
            return x == y ? 0 : x < y ? -1 : 1
        }
        return ids(Array(pages.prefix(limit.isFinite ? max(0, Int(limit)) : 0)))
    }

    /// the figures morrow's Home shows, the year of writing is 53 weeks as there
    static func home(_ state: WorkspaceState, _ activity: JSObject, _ now: Date) -> JSValue {
        let live = Tree.livePages(state.pages)
        let open = Tasks.collectTasks(state).filter { !$0.checked }
        let again = Insights.rediscover(state, now)
        let recent = live.filter { $0.kind != .journal && $0.kind != .templates }.jsSorted { a, b in
            let x = max(b.lastOpenedAt ?? 0, b.updatedAt), y = max(a.lastOpenedAt ?? 0, a.updatedAt)
            return x == y ? 0 : x < y ? -1 : 1
        }
        var rediscover = JSValue.null
        if let again {
            let text = Doc.docToPlainText(state.docs[again.id] ?? .node("doc"))
            rediscover = ["id": .string(again.id), "excerpt": .string(JSText.string(JSText.slice(text.units, 0, 180)))]
        }
        return [
            "streak": .number(Double(Insights.streak(activity, now))),
            "pages": .number(Double(live.count)),
            "words": .number(Double(Insights.totalWords(state))),
            "openTasks": .number(Double(open.count)),
            "tasks": .array(open.prefix(6).map(taskJSON)),
            "recent": ids(Array(recent.prefix(6))),
            "weeks": .array(Insights.activityWeeks(activity, now, weeks: 53).map { .array($0.map(\.json)) }),
            "onThisDay": ids(Insights.onThisDay(state, now)),
            "rediscover": rediscover,
        ]
    }

    static func backlinks(_ state: WorkspaceState, _ id: String) -> JSValue {
        .array(Links.backlinksTo(state, id).map { link in
            let context = link.contexts.first ?? ""
            return ["id": .string(link.source.id), "context": context.isEmpty ? .null : .string(context)]
        })
    }

    static func mentions(_ state: WorkspaceState, _ id: String) -> JSValue {
        .array(Links.unlinkedMentions(state, id).map { ["id": .string($0.source.id), "context": .string($0.context)] })
    }

    /// `Number(value)`
    private static func number(_ value: JSValue) -> Double {
        switch value {
        case .null: 0
        case .bool(let flag): flag ? 1 : 0
        case .number(let number): number
        case .string(let text): JSNumber.parse(text)
        case .array(let items): items.isEmpty ? 0 : items.count == 1 ? number(items[0]) : .nan
        case .object: .nan
        }
    }

    /// the page's headings as morrow's outline lists them; empty headings are left out of the list but still
    /// counted, so an index always points at the heading the editor shows
    static func outline(_ doc: DocNode?) -> JSValue {
        let headings = (doc?.content ?? []).filter { $0.type == "heading" }.enumerated().map { index, node -> (Int, Double, String) in
            let level = node.attr("level").flatMap { $0.isNull ? nil : $0 } ?? 1
            return (index, number(level), JSText.trim(Doc.inlineText(node)))
        }
        return .array(headings.filter { !$0.2.isEmpty }.map { ["index": .number(Double($0.0)), "level": .number($0.1), "text": .string($0.2)] })
    }

    /// every tag with how many pages carry it, as morrow's tags view
    static func tags(_ state: WorkspaceState) -> JSValue {
        .array(Tags.collectTags(state).map { entry in
            ["tag": .string(entry.tag), "pages": .number(Double(entry.pages.count)), "color": .string(Tags.tagColor(entry.tag))]
        })
    }
}
