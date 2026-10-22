import Foundation

/// Morrow's core/commands.ts: every workspace change goes through here, pure and never throwing.
nonisolated enum CoreCommand: Sendable {
    case create(Create)
    case rename(id: String, title: JSValue, now: Double)
    case setIcon(id: String, icon: JSValue, now: Double)
    case move(id: String, parentId: String?, index: Double?)
    case duplicate(id: String, newId: String, now: Double)
    case setDoc(id: String, doc: JSValue, now: Double)
    case setFavorite(id: String, favorite: JSValue)
    case markOpened(id: String, now: Double)
    case trash(id: String, now: Double)
    case restore(id: String)
    case deleteForever(id: String)
    case emptyTrash
    case setTaskChecked(pageId: String, index: Double, checked: JSValue, now: Double)
    case setTags(id: String, tags: JSValue, now: Double)
    /// a missing cover (undefined) is refused, null removes the cover
    case setCover(id: String, cover: JSValue?, now: Double)
    case setEncrypted(id: String, encrypted: JSValue, now: Double)
    case setKind(id: String, kind: String, now: Double)
    /// merges values into a database row, null clears a value
    case setProperties(id: String, values: JSObject, now: Double)
    case setDatabase(id: String, database: JSValue, now: Double)
    case insert(pages: [PageMeta], docs: JSObject)

    struct Create: Sendable {
        var id: String
        var parentId: String?
        var now: Double
        var title: JSValue?
        var icon: JSValue?
        var kind: String?
        var dailyDate: JSValue?
        var doc: JSValue?
        var index: Double?
        var tags: JSValue?
        var properties: JSObject?
        var database: JSValue?
    }

    var type: String {
        switch self {
        case .create: "page.create"
        case .rename: "page.rename"
        case .setIcon: "page.setIcon"
        case .move: "page.move"
        case .duplicate: "page.duplicate"
        case .setDoc: "page.setDoc"
        case .setFavorite: "page.setFavorite"
        case .markOpened: "page.markOpened"
        case .trash: "page.trash"
        case .restore: "page.restore"
        case .deleteForever: "page.deleteForever"
        case .emptyTrash: "trash.empty"
        case .setTaskChecked: "task.setChecked"
        case .setTags: "page.setTags"
        case .setCover: "page.setCover"
        case .setEncrypted: "page.setEncrypted"
        case .setKind: "page.setKind"
        case .setProperties: "page.setProperties"
        case .setDatabase: "database.set"
        case .insert: "pages.insert"
        }
    }

    /// A command as Morrow's `Command` object. nil for an unknown type or a missing id.
    init?(json: JSValue) {
        guard case .object(let fields) = json, case .string(let type) = fields["type"] else { return nil }
        let id = fields["id"]?.string
        let now = fields["now"]?.number ?? .nan
        switch type {
        case "page.create":
            guard let id else { return nil }
            self = .create(Create(
                id: id, parentId: fields["parentId"]?.string, now: now, title: fields["title"], icon: fields["icon"],
                kind: fields["kind"]?.string, dailyDate: fields["dailyDate"], doc: fields["doc"], index: fields["index"]?.number,
                tags: fields["tags"], properties: fields["properties"]?.object, database: fields["database"],
            ))
        case "page.rename": guard let id else { return nil }; self = .rename(id: id, title: fields["title"] ?? .null, now: now)
        case "page.setIcon": guard let id else { return nil }; self = .setIcon(id: id, icon: fields["icon"] ?? .null, now: now)
        case "page.move": guard let id else { return nil }; self = .move(id: id, parentId: fields["parentId"]?.string, index: fields["index"]?.number)
        case "page.duplicate":
            guard let id, let newId = fields["newId"]?.string else { return nil }
            self = .duplicate(id: id, newId: newId, now: now)
        case "page.setDoc": guard let id else { return nil }; self = .setDoc(id: id, doc: fields["doc"] ?? .null, now: now)
        case "page.setFavorite": guard let id else { return nil }; self = .setFavorite(id: id, favorite: fields["favorite"] ?? .null)
        case "page.markOpened": guard let id else { return nil }; self = .markOpened(id: id, now: now)
        case "page.trash": guard let id else { return nil }; self = .trash(id: id, now: now)
        case "page.restore": guard let id else { return nil }; self = .restore(id: id)
        case "page.deleteForever": guard let id else { return nil }; self = .deleteForever(id: id)
        case "trash.empty": self = .emptyTrash
        case "task.setChecked":
            guard let pageId = fields["pageId"]?.string else { return nil }
            self = .setTaskChecked(pageId: pageId, index: fields["index"]?.number ?? .nan, checked: fields["checked"] ?? .null, now: now)
        case "page.setTags": guard let id else { return nil }; self = .setTags(id: id, tags: fields["tags"] ?? .null, now: now)
        case "page.setCover": guard let id else { return nil }; self = .setCover(id: id, cover: fields["cover"], now: now)
        case "page.setEncrypted": guard let id else { return nil }; self = .setEncrypted(id: id, encrypted: fields["encrypted"] ?? .null, now: now)
        case "page.setKind": guard let id else { return nil }; self = .setKind(id: id, kind: fields["kind"]?.string ?? "", now: now)
        case "page.setProperties":
            guard let id else { return nil }
            self = .setProperties(id: id, values: fields["values"]?.object ?? JSObject(), now: now)
        case "database.set": guard let id else { return nil }; self = .setDatabase(id: id, database: fields["database"] ?? .null, now: now)
        case "pages.insert":
            let pages = (fields["pages"]?.array ?? []).compactMap(PageMeta.init(json:))
            self = .insert(pages: pages, docs: fields["docs"]?.object ?? JSObject())
        default:
            return nil
        }
    }
}

/// records touched by a command, storage writes exactly these
nonisolated struct Changes: Equatable, Sendable {
    var pages = JSSet()
    var docs = JSSet()
    var removed = JSSet()
}

nonisolated struct Applied: Sendable {
    var state: WorkspaceState
    var changes: Changes
    /// the command changed nothing and handed back the very state it got
    var unchanged = false
}

nonisolated struct CommandFailure: Error, Equatable, Sendable {
    let message: String
}

nonisolated enum CoreCommands {
    private static let idPattern = JSRegex(#"^[A-Za-z0-9_-]{1,64}$"#)
    private static let datePattern = JSRegex(#"^\d{4}-\d{2}-\d{2}$"#)
    private static let lineBreaks = JSRegex(#"[\r\n\t]+"#)

    typealias Outcome = Result<Applied, CommandFailure>

    private static func fail(_ message: String) -> Outcome { .failure(CommandFailure(message: message)) }

    static func applyCommand(_ state: WorkspaceState, _ command: CoreCommand) -> Outcome {
        switch command {
        case .create(let create):
            return createPage(state, create)
        case .rename(let id, let title, let now):
            guard var page = state.pages[id] else { return missing }
            let normalized = normalizeTitle(title)
            if normalized.jsEquals(page.title) { return unchanged(state) }
            page.title = normalized
            page.updatedAt = now
            return updatePage(state, page)
        case .setIcon(let id, let icon, let now):
            guard var page = state.pages[id] else { return missing }
            switch normalizeIcon(icon) {
            case .failure(let error): return .failure(error)
            case .success(let value):
                page.icon = value
                page.updatedAt = now
                return updatePage(state, page)
            }
        case .move(let id, let parentId, let index):
            return movePage(state, id, parentId, index)
        case .duplicate(let id, let newId, let now):
            return duplicatePage(state, id, newId, now)
        case .setDoc(let id, let doc, let now):
            guard var page = state.pages[id] else { return missing }
            if let error = Doc.validateDoc(doc) { return fail(error) }
            page.updatedAt = now
            return setDocs(withChanges(state, [page]), [(id, doc.object!)])
        case .setFavorite(let id, let favorite):
            guard var page = state.pages[id] else { return missing }
            if favorite == .bool(page.favorite) { return unchanged(state) }
            page.favorite = favorite == .bool(true)
            return updatePage(state, page)
        case .markOpened(let id, let now):
            guard var page = state.pages[id] else { return missing }
            page.lastOpenedAt = now
            return updatePage(state, page)
        case .trash(let id, let now):
            guard var page = state.pages[id] else { return missing }
            if page.trashedAt != nil { return unchanged(state) }
            page.trashedAt = now
            return updatePage(state, page)
        case .restore(let id):
            return restorePage(state, id)
        case .deleteForever(let id):
            guard state.pages.has(id) else { return missing }
            if !Tree.isEffectivelyTrashed(state.pages, id) { return fail("Only pages in the trash can be deleted permanently.") }
            return removePages(state, [id] + Tree.descendantsOf(state.pages, id).map(\.id))
        case .emptyTrash:
            let live = JSSet(Tree.livePages(state.pages).map(\.id))
            return removePages(state, state.pages.keys.filter { !live.has($0) })
        case .setTaskChecked(let pageId, let index, let checked, let now):
            guard var page = state.pages[pageId] else { return missing }
            guard let doc = state.docs[pageId], let next = Tasks.setTaskChecked(doc, index, checked == .bool(true)) else {
                return fail("That checklist item no longer exists.")
            }
            page.updatedAt = now
            return setDocs(withChanges(state, [page]), [(pageId, next)])
        case .insert(let pages, let docs):
            return insertPages(state, pages, docs)
        case .setTags(let id, let tags, let now):
            guard var page = state.pages[id] else { return missing }
            let normalized = normalizeTags(tags)
            if normalized.joined(separator: "\n").jsEquals(page.tags.joined(separator: "\n")) { return unchanged(state) }
            page.tags = normalized
            page.updatedAt = now
            return updatePage(state, page)
        case .setCover(let id, let cover, let now):
            guard var page = state.pages[id] else { return missing }
            let valid = cover?.isNull == true ? nil : Model.validCover(cover)
            if cover?.isNull != true, valid == nil { return fail("Invalid cover.") }
            if same(valid, page.cover) { return unchanged(state) }
            page.cover = valid
            page.updatedAt = now
            return updatePage(state, page)
        case .setEncrypted(let id, let encrypted, let now):
            guard var page = state.pages[id] else { return missing }
            if page.kind != .page { return fail("Only ordinary pages can be encrypted.") }
            if encrypted == .bool(page.encrypted) { return unchanged(state) }
            page.encrypted = encrypted == .bool(true)
            page.updatedAt = now
            return updatePage(state, page)
        case .setKind(let id, let kind, let now):
            guard var page = state.pages[id] else { return missing }
            guard let known = PageKind(rawValue: kind) else { return fail("Unknown page kind.") }
            if page.kind == known { return unchanged(state) }
            page.database = known == .database ? (page.database ?? DatabaseDef(properties: [], views: [])) : nil
            page.kind = known
            page.updatedAt = now
            return updatePage(state, page)
        case .setProperties(let id, let values, let now):
            guard var page = state.pages[id] else { return missing }
            var properties = page.properties
            for (key, value) in values {
                if !idPattern.test(key) { return fail("Invalid property.") }
                if value.isNull || value == .string("") || value.array?.isEmpty == true {
                    properties[key] = nil
                } else if validValue(value) {
                    properties[key] = value
                } else {
                    return fail("Invalid property value.")
                }
            }
            page.properties = properties
            page.updatedAt = now
            return updatePage(state, page)
        case .setDatabase(let id, let database, let now):
            guard var page = state.pages[id] else { return missing }
            if page.kind != .database { return fail("That page is not a database.") }
            guard let normalized = Migrations.normalizeDatabase(database) else { return fail("Invalid database.") }
            page.database = normalized
            page.updatedAt = now
            return updatePage(state, page)
        }
    }

    private static var missing: Outcome { fail("That page no longer exists.") }

    private static func same(_ a: String?, _ b: String?) -> Bool {
        switch (a, b) {
        case (nil, nil): true
        case (let a?, let b?): a.jsEquals(b)
        default: false
        }
    }

    private static func createPage(_ state: WorkspaceState, _ command: CoreCommand.Create) -> Outcome {
        if !idPattern.test(command.id) { return fail("Invalid page id.") }
        if state.pages.has(command.id) { return fail("A page with this id already exists.") }
        if let error = checkParent(state, command.parentId) { return .failure(error) }
        let icon: String?
        switch normalizeIcon(command.icon ?? .null) {
        case .failure(let error): return .failure(error)
        case .success(let value): icon = value
        }
        var dailyDate: String?
        if let date = command.dailyDate, !date.isNull {
            guard case .string(let text) = date, datePattern.test(text) else { return fail("Invalid daily date.") }
            dailyDate = text
        }
        let doc = command.doc.flatMap { $0.isNull ? nil : $0 } ?? .object(Model.emptyDoc())
        if let error = Doc.validateDoc(doc) { return fail(error) }
        let kind = command.kind.flatMap(PageKind.init(rawValue:)) ?? .page
        var page = PageMeta(id: command.id, parentId: command.parentId, createdAt: command.now)
        page.title = normalizeTitle(command.title ?? .string(""))
        page.icon = icon
        page.kind = kind
        page.dailyDate = dailyDate
        page.tags = normalizeTags(command.tags ?? .array([]))
        page.properties = command.properties ?? JSObject()
        page.database = kind == .database ? (Migrations.normalizeDatabase(command.database) ?? DatabaseDef(properties: [], views: [])) : nil
        let siblings = Tree.childrenOf(state.pages, command.parentId)
        let placed = placeAmong(siblings, page, command.index)
        return setDocs(withChanges(state, placed), [(page.id, doc.object!)])
    }

    private static func movePage(_ state: WorkspaceState, _ id: String, _ parentId: String?, _ index: Double?) -> Outcome {
        guard var page = state.pages[id] else { return missing }
        if let parentId, parentId.jsEquals(id) { return fail("A page cannot be moved inside itself.") }
        if let error = checkParent(state, parentId) { return .failure(error) }
        if let parentId, Tree.isDescendantOf(state.pages, parentId, id) {
            return fail("A page cannot be moved inside one of its own subpages.")
        }
        let siblings = Tree.childrenOf(state.pages, parentId).filter { !$0.id.jsEquals(id) }
        page.parentId = parentId
        return .success(withChanges(state, placeAmong(siblings, page, index)))
    }

    private static func duplicatePage(_ state: WorkspaceState, _ id: String, _ newId: String, _ now: Double) -> Outcome {
        guard let source = state.pages[id] else { return missing }
        if !idPattern.test(newId) || state.pages.has(newId) { return fail("Invalid id for the copy.") }
        let siblings = Tree.childrenOf(state.pages, source.parentId)
        var copy = source
        copy.id = newId
        copy.title = normalizeTitle(.string(source.title.isEmpty ? "" : "\(source.title) (copy)"))
        copy.kind = .page
        copy.dailyDate = nil
        copy.favorite = false
        copy.createdAt = now
        copy.updatedAt = now
        copy.lastOpenedAt = nil
        copy.trashedAt = nil
        let index = Double((siblings.firstIndex { $0.id.jsEquals(source.id) } ?? -1) + 1)
        let doc = state.docs[source.id] ?? Model.emptyDoc()
        let cloned = (try? JSJSON.parse(JSJSON.stringify(.object(doc))))?.object ?? doc
        return setDocs(withChanges(state, placeAmong(siblings, copy, index)), [(copy.id, cloned)])
    }

    private static func restorePage(_ state: WorkspaceState, _ id: String) -> Outcome {
        guard var restored = state.pages[id] else { return missing }
        restored.trashedAt = nil
        // a parent that is gone or still trashed sends the page to the top level
        if let parentId = restored.parentId, Tree.isEffectivelyTrashed(state.pages, parentId) { restored.parentId = nil }
        let siblings = Tree.childrenOf(state.pages, restored.parentId).filter { !$0.id.jsEquals(id) }
        return .success(withChanges(state, placeAmong(siblings, restored, nil)))
    }

    private static func insertPages(_ state: WorkspaceState, _ pages: [PageMeta], _ docs: JSObject) -> Outcome {
        if pages.isEmpty { return fail("Nothing to insert.") }
        var incoming = JSMap<PageMeta>()
        for page in pages {
            if !idPattern.test(page.id) { return fail("Invalid page id in import.") }
            if state.pages.has(page.id) || incoming.has(page.id) { return fail("Duplicate page id: \(page.id)") }
            var normalized = page
            normalized.title = normalizeTitle(.string(page.title))
            incoming[page.id] = normalized
        }
        var combined = state.pages
        for (id, page) in incoming { combined[id] = page }
        for page in incoming.valuesInOrder {
            guard let parentId = page.parentId else { continue }
            if !combined.has(parentId) { return fail("Imported page has a missing parent.") }
            if Tree.isDescendantOf(combined, parentId, page.id) { return fail("Imported pages contain a cycle.") }
        }
        var validDocs: [(String, DocNode)] = []
        for id in incoming.keys {
            let doc = docs[id] ?? .object(Model.emptyDoc())
            if let error = Doc.validateDoc(doc) { return fail("Page \(id): \(error)") }
            validDocs.append((id, doc.object!))
        }
        return setDocs(withChanges(state, incoming.valuesInOrder), validDocs)
    }

    private static func removePages(_ state: WorkspaceState, _ ids: [String]) -> Outcome {
        if ids.isEmpty { return unchanged(state) }
        var next = state
        var changes = Changes()
        for id in ids {
            next.pages[id] = nil
            next.docs[id] = nil
            changes.removed.insert(id)
        }
        return .success(Applied(state: next, changes: changes))
    }

    /// inserts the page at index and renumbers only the siblings that moved
    private static func placeAmong(_ siblings: [PageMeta], _ page: PageMeta, _ index: Double?) -> [PageMeta] {
        var list: [(page: PageMeta, isNew: Bool)] = siblings.map { ($0, false) }
        let at: Int
        if let index, index.isFinite { at = Int(min(Double(list.count), max(0, index.rounded(.down)))) } else { at = list.count }
        list.insert((page, true), at: at)
        var updated: [PageMeta] = []
        for (position, item) in list.enumerated() {
            if item.isNew {
                var placed = item.page
                placed.order = Double(position)
                updated.append(placed)
            } else if item.page.order != Double(position) {
                var moved = item.page
                moved.order = Double(position)
                updated.append(moved)
            }
        }
        return updated
    }

    private static func checkParent(_ state: WorkspaceState, _ parentId: String?) -> CommandFailure? {
        guard let parentId else { return nil }
        if !state.pages.has(parentId) { return CommandFailure(message: "The parent page does not exist.") }
        if Tree.isEffectivelyTrashed(state.pages, parentId) { return CommandFailure(message: "Pages cannot be added inside a page in the trash.") }
        return nil
    }

    private static func updatePage(_ state: WorkspaceState, _ page: PageMeta) -> Outcome {
        .success(withChanges(state, [page]))
    }

    private static func unchanged(_ state: WorkspaceState) -> Outcome {
        .success(Applied(state: state, changes: Changes(), unchanged: true))
    }

    private static func withChanges(_ state: WorkspaceState, _ pages: [PageMeta]) -> Applied {
        var next = state
        var changes = Changes()
        for page in pages {
            next.pages[page.id] = page
            changes.pages.insert(page.id)
        }
        return Applied(state: next, changes: changes)
    }

    private static func setDocs(_ applied: Applied, _ docs: [(String, DocNode)]) -> Outcome {
        var next = applied
        for (id, doc) in docs {
            next.state.docs[id] = doc
            next.changes.docs.insert(id)
        }
        return .success(next)
    }

    static func normalizeTags(_ tags: JSValue) -> [String] {
        guard case .array(let items) = tags else { return [] }
        var result = JSSet()
        for item in items {
            if case .string(let tag) = item, let normalized = Frontmatter.normalizeTag(tag) { result.insert(normalized) }
        }
        return Array(result.items.prefix(100))
    }

    private static func validValue(_ value: JSValue) -> Bool {
        switch value {
        case .string(let text): text.utf16.count <= 10_000
        case .number(let number): number.isFinite
        case .bool: true
        case .array(let items): items.count <= 200 && items.allSatisfy { $0.string != nil }
        default: false
        }
    }

    static func normalizeTitle(_ title: JSValue) -> String {
        guard case .string(let text) = title else { return "" }
        return JSText.string(JSText.slice(lineBreaks.replaceAll(text.units) { _ in [0x20] }, 0, Model.maxTitleLength))
    }

    private static func normalizeIcon(_ icon: JSValue) -> Result<String?, CommandFailure> {
        if icon.isNull || icon == .string("") { return .success(nil) }
        guard case .string(let text) = icon, text.unicodeScalars.count <= Model.maxIconLength else {
            return .failure(CommandFailure(message: "Invalid page icon."))
        }
        return .success(text)
    }
}

extension PageMeta {
    /// A page record as Morrow passes it around (a PageMeta object), read without the checks normalizePage makes.
    nonisolated init?(json: JSValue) {
        guard case .object(let raw) = json, case .string(let id) = raw["id"] else { return nil }
        func number(_ key: String) -> Double? { raw[key]?.number }
        self.init(id: id, parentId: raw["parentId"]?.string, createdAt: number("createdAt") ?? 0, updatedAt: number("updatedAt"))
        title = raw["title"]?.string ?? ""
        icon = raw["icon"]?.string
        kind = raw["kind"]?.string.flatMap(PageKind.init(rawValue:)) ?? .page
        order = number("order") ?? 0
        trashedAt = number("trashedAt")
        favorite = raw["favorite"] == .bool(true)
        dailyDate = raw["dailyDate"]?.string
        lastOpenedAt = number("lastOpenedAt")
        tags = raw["tags"]?.array?.compactMap(\.string) ?? []
        properties = raw["properties"]?.object ?? JSObject()
        database = Migrations.normalizeDatabase(raw["database"])
        cover = raw["cover"]?.string
        encrypted = raw["encrypted"] == .bool(true)
    }
}

/// Morrow's core/tasks.ts.
nonisolated enum Tasks {
    struct Ref: Equatable, Sendable {
        var pageId: String
        /// position among the page's checklist items in document order
        var index: Int
        var text: String
        var checked: Bool
    }

    static func tasksInDoc(_ pageId: String, _ doc: DocNode) -> [Ref] {
        var tasks: [Ref] = []
        func visit(_ node: DocNode) {
            if node.type == "taskItem" {
                let first = node.content?.first
                tasks.append(Ref(pageId: pageId, index: tasks.count, text: first.map { JSText.trim(Doc.inlineText($0)) } ?? "",
                                 checked: node.attr("checked") == .bool(true)))
            }
            for child in node.content ?? [] { visit(child) }
        }
        visit(doc)
        return tasks
    }

    static func collectTasks(_ state: WorkspaceState) -> [Ref] {
        Tree.livePages(state.pages).flatMap { page in state.docs[page.id].map { tasksInDoc(page.id, $0) } ?? [] }
    }

    /// copies only the path to the task, nil when the index no longer exists
    static func setTaskChecked(_ doc: DocNode, _ index: Double, _ checked: Bool) -> DocNode? {
        var seen = 0.0
        var found = false
        func visit(_ node: DocNode) -> DocNode {
            if found { return node }
            if node.type == "taskItem" {
                let position = seen
                seen += 1
                if position == index {
                    found = true
                    var attrs = node.attrs ?? JSObject()
                    attrs["checked"] = .bool(checked)
                    return node.with("attrs", .object(attrs))
                }
            }
            guard let content = node["content"]?.array else { return node }
            var changed = false
            let next: [JSValue] = content.map { child in
                guard case .object(let object) = child else { return child }
                let visited = visit(object)
                if visited != object { changed = true }
                return .object(visited)
            }
            return changed ? node.with("content", .array(next)) : node
        }
        let next = visit(doc)
        return found ? next : nil
    }
}
