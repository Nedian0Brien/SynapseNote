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

    /// The command as Morrow's `applyCommand` reads it.
    func morrow(now: Date = Date()) -> JSONValue {
        let time = JSONValue.number((now.timeIntervalSince1970 * 1000).rounded())
        switch self {
        case .move(let id, let parent, let index):
            var fields: [String: JSONValue] = ["type": .string("page.move"), "id": .string(id), "parentId": parent.map(JSONValue.string) ?? .null]
            if let index { fields["index"] = .number(Double(index)) }
            return .object(fields)
        case .setFavorite(let id, let favorite):
            return .object(["type": .string("page.setFavorite"), "id": .string(id), "favorite": .bool(favorite)])
        case .setIcon(let id, let icon):
            return .object(["type": .string("page.setIcon"), "id": .string(id), "icon": icon.map(JSONValue.string) ?? .null, "now": time])
        case .duplicate(let id, let newId):
            return .object(["type": .string("page.duplicate"), "id": .string(id), "newId": .string(newId), "now": time])
        case .restore(let id):
            return .object(["type": .string("page.restore"), "id": .string(id)])
        case .deleteForever(let id):
            return .object(["type": .string("page.deleteForever"), "id": .string(id)])
        case .emptyTrash:
            return .object(["type": .string("trash.empty")])
        case .setTaskChecked(let pageId, let index, let checked):
            return .object([
                "type": .string("task.setChecked"), "pageId": .string(pageId), "index": .number(Double(index)),
                "checked": .bool(checked), "now": time,
            ])
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
}
