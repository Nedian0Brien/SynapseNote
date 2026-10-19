import Foundation

/// The result of one vault operation, as Morrow's VaultOpResult.
nonisolated enum VaultOpResult: Equatable, Sendable {
    case ok
    /// the file changed on disk in the meantime; `current` is what it holds now
    case conflict(message: String, current: String?)
    case exists(message: String)
    case error(message: String)
}

/// Carries out vault operations in order and stops at the first that fails, as Morrow's VaultBridge.apply.
nonisolated protocol VaultBridge: AnyObject {
    func apply(_ ops: [VaultOp]) -> [VaultOpResult]
}

/// One save: the records a command touched and the whole workspace at that moment (Morrow's WriteBatch).
nonisolated struct WriteBatch: Sendable {
    var pages: [PageMeta] = []
    var docs: [(id: String, doc: DocNode)] = []
    var removed: [String] = []
    var state: WorkspaceState?
}

nonisolated struct VaultWriteError: Error, Equatable, Sendable {
    let message: String
}

/// The file side of Morrow's storage/vaultRepository.ts: what a vault holds on disk as far as Morrow knows, and
/// how a save turns into file operations. Page history, encryption keys and external edits are left to 11c;
/// a page that is encrypted is never written here, as in Morrow without its key.
nonisolated final class VaultWriter {
    static let registryPath = "\(Paths.morrowDir)/workspace.json"
    static let recentPath = "\(Paths.morrowDir)/recent.json"
    private static let maxRecent = 300
    private static let maxActivityDays = 400
    private static let dayPattern = JSRegex(#"^\d{4}-\d{2}-\d{2}$"#)

    private(set) var layout = VaultLayout.Map()
    private(set) var folderOnly = JSSet()
    private(set) var sources = JSMap<PageFile.Source>()
    /// what each page file holds on disk, as far as morrow knows
    private(set) var texts = JSMap<String>()
    private(set) var reserved = JSSet()
    /// pages that could not be read, their files are never rewritten
    private(set) var locked = JSSet()
    private(set) var others = JSSet()
    private(set) var registryText: String?
    private(set) var recentText: String?
    /// saves per day, for the activity chart on the home page
    private(set) var days = JSMap<Double>()
    private(set) var registryDirty = false
    private(set) var lastState: WorkspaceState?

    private let bridge: VaultBridge
    private let newId: () -> String
    /// milliseconds since 1970, `Date.now()`
    private let now: () -> Double

    init(bridge: VaultBridge, newId: @escaping () -> String, now: @escaping () -> Double = { Date().timeIntervalSince1970 * 1000 }) {
        self.bridge = bridge
        self.newId = newId
        self.now = now
    }

    func pathOf(_ id: String) -> String? {
        layout[id].map { $0.file ?? $0.folder }
    }

    struct Opened {
        var pages: [PageMeta]
        var docs: JSRecord<DocNode>
        var problems: [String]
        var unreadable: [String]
        var firstRun: Bool
    }

    /// `load`: reads the scanned vault and remembers how it lies on disk.
    func load(_ scan: VaultLoad.Scan) -> Opened {
        let loaded = VaultLoad.loadVault(scan, newId: newId, now: now())
        layout = loaded.layout
        folderOnly = loaded.folderOnly
        sources = loaded.sources
        texts = loaded.texts
        reserved = loaded.reserved
        locked = JSSet(loaded.unreadable)
        others = JSSet(scan.others)
        registryText = scan.registry.map { JSJSON.stringify($0) }
        recentText = scan.recent.map { JSJSON.stringify($0) }
        if case .object(let activity) = scan.recent?.object?["activity"] {
            for (day, count) in activity {
                if Self.dayPattern.test(day), case .number(let value) = count, value > 0 { days[day] = value }
            }
        }
        registryDirty = loaded.registryChanged
        var state = WorkspaceState()
        for page in loaded.pages { state.pages[page.id] = page }
        state.docs = loaded.docs
        lastState = state
        let firstRun = scan.files.isEmpty && scan.registry == nil
            && scan.folders.allSatisfy { Paths.isHiddenPath($0.path) || $0.path.jsEquals(Paths.trashDir) }
        return Opened(pages: loaded.pages, docs: loaded.docs, problems: loaded.problems, unreadable: loaded.unreadable, firstRun: firstRun)
    }

    func markInitialized() throws(VaultWriteError) {
        guard registryDirty, let lastState else { return }
        try write(WriteBatch(state: lastState))
    }

    private static func lower(_ text: String) -> String { JSText.string(JSText.lowercased(text.units)) }

    private static func same(_ a: String?, _ b: String?) -> Bool {
        switch (a, b) {
        case (nil, nil): true
        case (let a?, let b?): a.jsEquals(b)
        default: false
        }
    }

    // MARK: write

    func write(_ batch: WriteBatch) throws(VaultWriteError) {
        guard let state = batch.state ?? lastState else { throw VaultWriteError(message: "Nothing to write yet.") }
        lastState = state
        let docChanged = JSSet(batch.docs.map(\.id))
        let metaChanged = JSSet(batch.pages.map(\.id))
        let removed = JSSet(batch.removed.filter { !state.pages.has($0) })

        // a folder that gains content or properties gets a note of its own
        for id in docChanged.items + metaChanged.items where folderOnly.has(id) && wantsFile(state, id) { folderOnly.remove(id) }

        var previous = VaultLayout.Map()
        for (id, placement) in layout where !removed.has(id) { previous[id] = placement }
        let next = VaultLayout.placePages(state, previous: previous, folderOnly: folderOnly, reserved: reserved)
        var ops: [VaultOp] = []

        for id in removed { if let file = layout[id]?.file { ops.append(.remove(path: file)) } }
        ops += VaultPlan.planMoves(previous, next)

        let oldTargets = VaultLayout.linkTargets(previous)
        let newTargets = VaultLayout.linkTargets(next)
        var retargeted = JSSet()
        for (id, target) in newTargets { if let old = oldTargets[id], !old.jsEquals(target) { retargeted.insert(id) } }
        var movedPages = JSSet()
        for (id, placement) in next {
            if let before = previous[id], !Self.same(before.file, placement.file) || !before.folder.jsEquals(placement.folder) { movedPages.insert(id) }
        }

        var candidates = JSSet(docChanged.items + metaChanged.items)
        for (id, placement) in next where !previous.has(id) || movedPages.has(id) || (placement.file != nil && !texts.has(id)) {
            candidates.insert(id)
        }
        if !retargeted.isEmpty || !movedPages.isEmpty {
            for (id, doc) in state.docs where Self.linksTo(doc, retargeted) || (state.pages[id]?.kind == .canvas && Self.linksTo(doc, movedPages)) {
                candidates.insert(id)
            }
        }
        for id in metaChanged where state.pages[id]?.kind == .database {
            for child in Tree.childrenOf(state.pages, id, includeTrashed: true) { candidates.insert(child.id) }
        }

        let resolveOld = retargeted.isEmpty ? nil : VaultLoad.Resolver(state: state, layout: previous, sources: sources)
        for id in candidates {
            guard let page = state.pages[id], let placement = next[id], let file = placement.file, !locked.has(id) else { continue }
            guard let text = render(state, next, newTargets, id, docChanged.has(id), previous[id], resolveOld, retargeted) else { continue }
            // encrypted pages need their key, which 11c brings
            if page.encrypted { continue }
            if let known = texts[id], known.jsEquals(text) { continue }
            ops.append(.write(path: file, text: text, expect: .some(texts[id]), id: id))
        }

        // folders emptied by removals and moves are tidied away, folders with other files stay
        var emptied = JSSet()
        for id in removed { if let before = layout[id] { emptied.insert(before.folder) } }
        for id in movedPages {
            let parentFolder = Paths.dirname(previous[id]!.folder)
            if !parentFolder.isEmpty, !parentFolder.jsEquals(Paths.trashDir) { emptied.insert(parentFolder) }
        }

        if !batch.docs.isEmpty {
            let day = Daily.dateKey(Date(timeIntervalSince1970: now() / 1000))
            days[day] = (days[day] ?? 0) + Double(batch.docs.count)
        }
        let registry = registryFor(state, next)
        if registryText.map({ !$0.jsEquals(registry.workspace) }) ?? true {
            ops.append(.write(path: Self.registryPath, text: registry.workspace, expect: nil, id: nil))
        }
        if recentText.map({ !$0.jsEquals(registry.recent) }) ?? true {
            ops.append(.write(path: Self.recentPath, text: registry.recent, expect: nil, id: nil))
        }
        // the shell only removes empty folders, a folder page keeps its folder because the folder is the page
        let folderPages = JSSet(next.valuesInOrder.filter { $0.file == nil }.map { Self.lower($0.folder) })
        for folder in emptied.items.jsSorted({ $1.utf16.count - $0.utf16.count }) where !folderPages.has(Self.lower(folder)) {
            ops.append(.rmdir(path: folder))
        }

        try run(ops, next)
        registryText = registry.workspace
        recentText = registry.recent
        registryDirty = false
    }

    private func wantsFile(_ state: WorkspaceState, _ id: String) -> Bool {
        guard let page = state.pages[id] else { return false }
        if let doc = state.docs[id], !Doc.isDocEmpty(doc) { return true }
        let parent = page.parentId.flatMap { state.pages[$0] }
        let managed = PageFile.managedFrontmatter(page, fileBase: layout[id].map { Paths.basename($0.folder) } ?? "",
                                                  parentDatabase: parent?.kind == .database ? parent?.database : nil)
        return !managed.isEmpty
    }

    private func render(_ state: WorkspaceState, _ layout: VaultLayout.Map, _ targets: JSMap<String>, _ id: String, _ edited: Bool,
                        _ before: Placement?, _ resolveOld: VaultLoad.Resolver?, _ retargeted: JSSet) -> String? {
        let page = state.pages[id]!
        let placement = layout[id]!
        let doc = state.docs[id]
        if page.kind == .canvas { return CanvasFile.writeCanvas(CanvasFile.canvasFromDoc(doc)) { layout[$0]?.file } }
        guard let doc else { return nil }
        let dir = Paths.dirname(placement.file!)
        var source = sources[id]
        let movedDir = before.map { !Paths.dirname($0.folder).jsEquals(Paths.dirname(placement.folder)) } ?? false
        if var kept = source, kept.body != nil, edited || (movedDir && Self.hasFileRefs(doc)) {
            kept.body = nil
            source = kept
            sources[id] = kept
        }
        let body: String
        if var kept = source, let original = kept.body {
            if let resolveOld {
                body = Self.retargetLinks(original) { target in
                    guard let found = resolveOld.resolve(target, from: before.map { Paths.dirname($0.folder) } ?? dir),
                          retargeted.has(found) else { return nil }
                    return targets[found]
                }
            } else {
                body = original
            }
            if !body.jsEquals(original) {
                kept.body = body
                source = kept
                sources[id] = kept
            }
        } else {
            body = MarkdownSerialize.docToMarkdown(doc, .init(
                titleOf: { state.pages[$0].map(Model.displayTitle) },
                linkTarget: { targets[$0] },
                filePath: { $0.utf16.contains(0x2F) || $0.utf16.contains(0x2E) ? Paths.relativePath(dir, $0) : nil },
            ))
        }
        let parent = page.parentId.flatMap { state.pages[$0] }
        let managed = PageFile.managedFrontmatter(page, fileBase: Paths.basename(placement.folder),
                                                  parentDatabase: parent?.kind == .database ? parent?.database : nil)
        return PageFile.renderPageText(PageFile.composeFrontmatter(managed, source), source, body)
    }

    /// carries out the operations and keeps track of what reached the disk, even when something fails halfway
    private func run(_ ops: [VaultOp], _ next: VaultLayout.Map) throws(VaultWriteError) {
        var pending = ops
        var tracked = layout
        for _ in 0..<3 {
            if pending.isEmpty { break }
            let results = bridge.apply(pending)
            var failedAt = -1
            for (index, result) in results.enumerated() {
                if result == .ok {
                    applied(pending[index], &tracked, next)
                } else {
                    failedAt = index
                    break
                }
            }
            if failedAt == -1, results.count == pending.count {
                pending = []
                break
            }
            if failedAt == -1 { throw VaultWriteError(message: "The desktop shell stopped before finishing the save.") }
            let op = pending[failedAt]
            if case .conflict(_, let current) = results[failedAt], case .write(let path, let text, _, let id?) = op {
                // the file changed on disk in the meantime; Morrow keeps that version in page history (11c) and
                // writes again over what is there now
                pending = [.write(path: path, text: text, expect: .some(current), id: id)] + pending[(failedAt + 1)...]
                continue
            }
            layout = tracked
            switch results[failedAt] {
            case .conflict(let message, _), .exists(let message), .error(let message): throw VaultWriteError(message: message)
            case .ok: throw VaultWriteError(message: "Unknown error")
            }
        }
        if !pending.isEmpty {
            layout = tracked
            throw VaultWriteError(message: "The file kept changing on disk while Morrow tried to save it.")
        }
        layout = next
    }

    private func applied(_ op: VaultOp, _ tracked: inout VaultLayout.Map, _ next: VaultLayout.Map) {
        switch op {
        case .write(_, let text, _, let id?):
            texts[id] = text
            if let target = next[id] { tracked[id] = target }
        case .rename(let from, let to, _):
            VaultPlan.replayRename(&tracked, from, to)
        case .remove(let path):
            for (id, placement) in tracked where Self.same(placement.file, path) {
                tracked[id] = nil
                texts[id] = nil
                sources[id] = nil
                folderOnly.remove(id)
                locked.remove(id)
            }
        default:
            break
        }
    }

    private func registryFor(_ state: WorkspaceState, _ layout: VaultLayout.Map) -> (workspace: String, recent: String) {
        var pages = JSObject()
        var opened: [(String, Double)] = []
        let sorted = layout.map { ($0.key, $0.value) }.jsSorted { a, b in
            JSCollator.compare(a.1.file ?? a.1.folder, b.1.file ?? b.1.folder, locale: JSEnvironment.locale)
        }
        for (id, placement) in sorted {
            guard let page = state.pages[id] else { continue }
            var entry = JSObject([("id", .string(id)), ("created", .number(page.createdAt)), ("order", .number(page.order))])
            if page.favorite { entry["favorite"] = true }
            if let trashedAt = page.trashedAt, Paths.isInTrash(placement.folder), Paths.dirname(placement.folder).jsEquals(Paths.trashDir) {
                entry["trashed"] = .number(trashedAt)
                if let parentId = page.parentId, !parentId.isEmpty { entry["parent"] = .string(parentId) }
            }
            if let icon = page.icon, !icon.isEmpty, page.kind == .canvas || placement.file == nil { entry["icon"] = .string(icon) }
            pages[placement.file ?? placement.folder] = .object(entry)
            if let lastOpenedAt = page.lastOpenedAt { opened.append((id, lastOpenedAt)) }
        }
        opened = opened.jsSorted { a, b in b.1 == a.1 ? 0 : b.1 < a.1 ? -1 : 1 }
        var activity = JSObject()
        let days = self.days.map { ($0.key, $0.value) }.jsSorted { JSCollator.compare($1.0, $0.0, locale: JSEnvironment.locale) }
        for (day, count) in days.prefix(Self.maxActivityDays) { activity[day] = .number(count) }
        var openedObject = JSObject()
        for (id, time) in opened.prefix(Self.maxRecent) { openedObject[id] = .number(time) }
        let workspace: JSValue = ["version": 1, "pages": .object(pages)]
        let recent: JSValue = ["version": 1, "opened": .object(openedObject), "activity": .object(activity)]
        return (JSJSON.stringify(workspace, indent: 1) + "\n", JSJSON.stringify(recent) + "\n")
    }

    // MARK: helpers

    private static func walk(_ doc: DocNode, _ visit: (DocNode) -> Bool) {
        var stack = [doc]
        while let node = stack.popLast() {
            if !visit(node) { continue }
            for child in (node.content ?? []).reversed() { stack.append(child) }
        }
    }

    static func linksTo(_ doc: DocNode, _ ids: JSSet) -> Bool {
        if ids.isEmpty { return false }
        var found = false
        walk(doc) { node in
            if found { return false }
            if node.type == "pageLink", case .string(let id) = node.attr("id"), ids.has(id) { found = true }
            if node.type == "canvas", case .array(let nodes) = node.attr("nodes") {
                for item in nodes where item["type"] == .string("page") {
                    if case .string(let id) = item["pageId"], !id.isEmpty, ids.has(id) { found = true }
                }
            }
            return !found
        }
        return found
    }

    static func hasFileRefs(_ doc: DocNode) -> Bool {
        var found = false
        walk(doc) { node in
            if (node.type == "image" && node.attr("fileId")?.string != nil) || node.type == "fileAttachment" { found = true }
            return !found
        }
        return found
    }

    private static let fence = JSRegex(#"^\s*(```|~~~)"#)

    /// rewrites [[links]] in a file morrow has not otherwise touched, outside code
    static func retargetLinks(_ body: String, _ newTarget: (String) -> String?) -> String {
        var fenced = false
        return JSText.split(body, on: 0x0A).map { line -> String in
            if fence.test(line) {
                fenced.toggle()
                return line
            }
            let units = line.units
            if fenced || JSText.indexOf(units, [0x5B, 0x5B]) == -1 { return line }
            // line.split(/(`[^`]*`)/): text and code spans in turn
            var parts: [(text: [UInt16], code: Bool)] = []
            var start = 0
            var at = 0
            while let open = units[at...].firstIndex(of: 0x60), let close = units[(open + 1)...].firstIndex(of: 0x60) {
                parts.append((Array(units[start..<open]), false))
                parts.append((Array(units[open...close]), true))
                start = close + 1
                at = close + 1
            }
            parts.append((Array(units[start...]), false))
            return parts.map { part in part.code ? JSText.string(part.text) : retargetText(part.text, newTarget) }.joined()
        }.joined(separator: "\n")
    }

    /// `part.replace(/(!?)\[\[([^[\]\n]{0,400}?)\]\]/g, ...)`
    private static func retargetText(_ units: [UInt16], _ newTarget: (String) -> String?) -> String {
        var out: [UInt16] = []
        var index = 0
        while index < units.count {
            let bang = units[index] == 0x21
            let open = bang ? index + 1 : index
            if units.at(open) == 0x5B, units.at(open + 1) == 0x5B {
                var end = open + 2
                var matched = false
                while end < units.count, end - (open + 2) <= 400 {
                    let unit = units[end]
                    if unit == 0x5D {
                        matched = units.at(end + 1) == 0x5D
                        break
                    }
                    if unit == 0x5B || unit == 0x0A || end - (open + 2) == 400 { break }
                    end += 1
                }
                if matched {
                    let inner = Array(units[(open + 2)..<end])
                    let link = MDStateInline.parseWikiLink(inner, embed: bang)
                    let match = Array(units[index...(end + 1)])
                    if let target = newTarget(link.target), !target.jsEquals(link.target) {
                        let at = JSText.indexOf(inner, link.target.units)
                        let rest = Array(inner[(at + link.target.utf16.count)...])
                        out += (bang ? [0x21] : []) + [0x5B, 0x5B] + target.units + rest + [0x5D, 0x5D]
                    } else {
                        out += match
                    }
                    index = end + 2
                    continue
                }
            }
            out.append(units[index])
            index += 1
        }
        return JSText.string(out)
    }
}

nonisolated extension Doc {
    /// `isDocEmpty`
    nonisolated static func isDocEmpty(_ doc: DocNode) -> Bool {
        let blocks = doc.content ?? []
        if blocks.isEmpty { return true }
        if blocks.count > 1 { return false }
        return blocks[0].type == "paragraph" && (blocks[0].content ?? []).isEmpty
    }
}
