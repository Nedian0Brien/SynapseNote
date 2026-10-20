import Foundation

/// A change to the workspace a native screen asks for. Each case is one Morrow `Command`; the data core checks it.
nonisolated enum WorkspaceCommand: Equatable, Sendable {
    case move(id: String, parent: String?, index: Int?)
    case setFavorite(id: String, favorite: Bool)
    case setIcon(id: String, icon: String?)
    case duplicate(id: String, newId: String)
    case restore(id: String)
    case deleteForever(id: String)
    case emptyTrash
    case setTaskChecked(pageId: String, index: Int, checked: Bool)
    case rename(id: String, title: String)
    case setTags(id: String, tags: [String])
    /// `gradient-1` to `gradient-12`, the vault path of a picture, or nil for none.
    case setCover(id: String, cover: String?)
    case setDoc(id: String, doc: DocNode)
    case setDatabase(id: String, database: DatabaseDef)
    /// values of a database row's properties, by property id
    case setProperties(id: String, values: JSObject)
    /// a new page; data.ts' createRow makes a database row with it
    case createPage(id: String, parentId: String?, title: String, properties: JSObject)
    /// operations.ts' createPage: a page, database or canvas under a page, with the database or canvas it starts with
    case newPage(id: String, parentId: String?, title: String, kind: String, database: DatabaseDef?, doc: DocNode?)

    /// The command as Morrow's `applyCommand` reads it, keys in the order Morrow's screens write them. `now` is
    /// in whole milliseconds, as `Date.now()`.
    func morrow(now: Double = JSEnvironment.now()) -> JSValue {
        let time = JSValue.number(now)
        func text(_ value: String?) -> JSValue { value.map(JSValue.string) ?? .null }
        switch self {
        case .move(let id, let parent, let index):
            var fields = JSObject([("type", "page.move"), ("id", .string(id)), ("parentId", text(parent))])
            if let index { fields["index"] = .number(Double(index)) }
            return .object(fields)
        case .setFavorite(let id, let favorite):
            return ["type": "page.setFavorite", "id": .string(id), "favorite": .bool(favorite)]
        case .setIcon(let id, let icon):
            return ["type": "page.setIcon", "id": .string(id), "icon": text(icon), "now": time]
        case .duplicate(let id, let newId):
            return ["type": "page.duplicate", "id": .string(id), "newId": .string(newId), "now": time]
        case .restore(let id):
            return ["type": "page.restore", "id": .string(id)]
        case .deleteForever(let id):
            return ["type": "page.deleteForever", "id": .string(id)]
        case .emptyTrash:
            return ["type": "trash.empty"]
        case .setTaskChecked(let pageId, let index, let checked):
            return ["type": "task.setChecked", "pageId": .string(pageId), "index": .number(Double(index)), "checked": .bool(checked), "now": time]
        case .rename(let id, let title):
            return ["type": "page.rename", "id": .string(id), "title": .string(title), "now": time]
        case .setTags(let id, let tags):
            return ["type": "page.setTags", "id": .string(id), "tags": .array(tags.map(JSValue.string)), "now": time]
        case .setCover(let id, let cover):
            return ["type": "page.setCover", "id": .string(id), "cover": text(cover), "now": time]
        case .setDoc(let id, let doc):
            return ["type": "page.setDoc", "id": .string(id), "doc": .object(doc), "now": time]
        case .setDatabase(let id, let database):
            return ["type": "database.set", "id": .string(id), "database": database.json, "now": time]
        case .setProperties(let id, let values):
            return ["type": "page.setProperties", "id": .string(id), "values": .object(values), "now": time]
        case .createPage(let id, let parentId, let title, let properties):
            return ["type": "page.create", "id": .string(id), "parentId": text(parentId), "now": time, "title": .string(title),
                    "properties": .object(properties)]
        case .newPage(let id, let parentId, let title, let kind, let database, let doc):
            var fields = JSObject([("type", "page.create"), ("id", .string(id)), ("parentId", text(parentId)), ("now", time),
                                   ("title", .string(title)), ("kind", .string(kind))])
            if let database { fields["database"] = database.json }
            if let doc { fields["doc"] = .object(doc) }
            return .object(fields)
        }
    }
}

/// What native screens use to read and change the workspace. Today the editor page's Morrow session answers;
/// a Swift data core can take its place later without the screens changing.
@MainActor
protocol WorkspaceService: AnyObject {
    var workspace: Workspace { get }
    func perform(_ command: WorkspaceCommand)
    func createPage(parent: String?)
    func trash(_ pageId: String)

    func search(_ query: String, limit: Int) async -> [SearchHit]
    /// Pages opened most recently, the latest first.
    func recentlyOpened(limit: Int) async -> [String]
    func homeFacts() async -> HomeFacts?
    func backlinks(of pageId: String) async -> [Backlink]
    /// Pages that name this page in their text without linking to it.
    func mentions(of pageId: String) async -> [Mention]
    func outline(of pageId: String) async -> [Heading]
    func tags() async -> [TagEntry]
    /// Pages with the tag or a tag below it, the latest edited first.
    func pages(tagged tag: String) async -> [String]
    func tasks() async -> [TaskRef]
    func templates() async -> TemplateList?
    func sidebarCounts() async -> SidebarCounts?
    /// The whole graph, or the pages near `focus`.
    func graph(_ options: GraphOptions, focus: String?) async -> GraphData?
    func review() async -> ReviewData?
}
