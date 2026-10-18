import Foundation

/// The fields of a Morrow `PageMeta` the native screens read.
nonisolated struct PageInfo: Hashable, Sendable, Identifiable {
    let id: String
    let parentId: String?
    let title: String
    let icon: String?
    let kind: String
    let order: Double
    let createdAt: Double
    let trashedAt: Double?
    let favorite: Bool
    let encrypted: Bool

    init?(_ value: JSONValue) {
        guard let id = value["id"]?.stringValue else { return nil }
        self.id = id
        parentId = value["parentId"]?.stringValue
        title = value["title"]?.stringValue ?? ""
        icon = value["icon"]?.stringValue
        kind = value["kind"]?.stringValue ?? "page"
        order = value["order"]?.doubleValue ?? 0
        createdAt = value["createdAt"]?.doubleValue ?? 0
        trashedAt = value["trashedAt"]?.doubleValue
        favorite = value["favorite"] == .bool(true)
        encrypted = value["encrypted"] == .bool(true)
    }

    /// The title as shown, Untitled when empty, as Morrow's `displayTitle`.
    var displayTitle: String {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "Untitled" : trimmed
    }
}

/// The page records of the open vault, as the editor page reports them, with the tree rules of Morrow's
/// `core/tree.ts` so the sidebar, trash and move screens agree with the data core.
nonisolated struct Workspace: Hashable, Sendable {
    private(set) var pages: [String: JSONValue] = [:]
    private(set) var infos: [String: PageInfo] = [:]
    /// Live pages by effective parent, sorted as siblings, built once per change.
    private var liveChildren: [String: [PageInfo]] = [:]

    init(pages: [String: JSONValue] = [:]) {
        self.pages = pages
        infos = pages.compactMapValues(PageInfo.init)
        var grouped: [String: [PageInfo]] = [:]
        for info in infos.values where info.trashedAt == nil {
            grouped[Self.key(effectiveParent(of: info)), default: []].append(info)
        }
        liveChildren = grouped.mapValues { $0.sorted(by: Self.siblingOrder) }
    }

    private static func key(_ parent: String?) -> String { parent ?? "" }

    /// Morrow's `compareSiblings`: order, then creation time, then id.
    static func siblingOrder(_ a: PageInfo, _ b: PageInfo) -> Bool {
        if a.order != b.order { return a.order < b.order }
        if a.createdAt != b.createdAt { return a.createdAt < b.createdAt }
        return a.id < b.id
    }

    /// A parent that no longer exists counts as the top of the vault, as Morrow's `effectiveParent`.
    func effectiveParent(of page: PageInfo) -> String? {
        guard let parent = page.parentId, infos[parent] != nil else { return nil }
        return parent
    }

    /// Children that are not in the trash themselves.
    func children(of parent: String?) -> [PageInfo] {
        liveChildren[Self.key(parent)] ?? []
    }

    /// In the trash itself or under a trashed page, as Morrow's `isEffectivelyTrashed`.
    func isTrashed(_ id: String) -> Bool {
        guard let page = infos[id] else { return true }
        if page.trashedAt != nil { return true }
        return ancestors(of: id).contains { $0.trashedAt != nil }
    }

    /// Whether the page exists and is not in the trash, itself or through a parent.
    func isShowable(_ id: String) -> Bool { infos[id] != nil && !isTrashed(id) }

    /// Nearest parent first; stops at missing parents and cycles.
    func ancestors(of id: String) -> [PageInfo] {
        var result: [PageInfo] = []
        var seen: Set<String> = [id]
        var current = infos[id]?.parentId
        while let parentId = current, let parent = infos[parentId], seen.insert(parentId).inserted {
            result.append(parent)
            current = parent.parentId
        }
        return result
    }

    /// Every page below, trashed or not, as Morrow's `descendantsOf`.
    func descendants(of id: String) -> [PageInfo] {
        var byParent: [String: [PageInfo]] = [:]
        for info in infos.values { byParent[Self.key(effectiveParent(of: info)), default: []].append(info) }
        var result: [PageInfo] = []
        var seen: Set<String> = [id]
        var queue = [id]
        while !queue.isEmpty {
            let next = queue.removeFirst()
            for child in byParent[next] ?? [] where seen.insert(child.id).inserted {
                result.append(child)
                queue.append(child.id)
            }
        }
        return result
    }

    /// A page as the sidebar shows it.
    struct Row: Identifiable, Hashable, Sendable {
        let page: PageInfo
        let depth: Int
        let hasChildren: Bool
        var id: String { page.id }
    }

    /// Live pages in tree order, children shown only under expanded pages.
    func rows(expanded: Set<String>) -> [Row] {
        var rows: [Row] = []
        func visit(_ parent: String?, depth: Int) {
            for page in children(of: parent) {
                let kids = !children(of: page.id).isEmpty
                rows.append(Row(page: page, depth: depth, hasChildren: kids))
                if kids && expanded.contains(page.id) { visit(page.id, depth: depth + 1) }
            }
        }
        visit(nil, depth: 0)
        return rows
    }

    /// Favourite pages that are not in the trash, by title as Morrow's sidebar sorts them.
    var favorites: [PageInfo] {
        infos.values
            .filter { $0.favorite && !isTrashed($0.id) }
            .sorted { $0.displayTitle.localizedCompare($1.displayTitle) == .orderedAscending }
    }

    /// Pages sent to the trash themselves, most recent first, as Morrow's `trashedPages`.
    var trashed: [PageInfo] {
        infos.values.filter { $0.trashedAt != nil }.sorted { ($0.trashedAt ?? 0) > ($1.trashedAt ?? 0) }
    }

    /// Whether `id` may be placed under `parent`: not itself, not one of its own subpages, not a trashed page.
    func canMove(_ id: String, under parent: String?) -> Bool {
        guard let parent else { return infos[id] != nil }
        if parent == id || isTrashed(parent) { return false }
        return !ancestors(of: parent).contains { $0.id == id }
    }

    enum DropZone: Equatable, Sendable { case before, inside, after }

    /// Where a dragged page lands, as Morrow's sidebar `onDrop`: inside a page, or among the target's siblings.
    func dropDestination(of dragged: String, onto target: String, zone: DropZone) -> (parent: String?, index: Int?)? {
        guard dragged != target, let targetPage = infos[target] else { return nil }
        if zone == .inside {
            return canMove(dragged, under: target) ? (target, nil) : nil
        }
        let parent = effectiveParent(of: targetPage)
        guard canMove(dragged, under: parent) else { return nil }
        let siblings = children(of: parent).filter { $0.id != dragged }
        guard let position = siblings.firstIndex(where: { $0.id == target }) else { return nil }
        return (parent, position + (zone == .after ? 1 : 0))
    }
}
