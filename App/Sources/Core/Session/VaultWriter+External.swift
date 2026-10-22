import Foundation

/// What the file watcher saw at one path (Morrow's VaultChange).
nonisolated struct VaultChange: Equatable, Sendable {
    /// a page file, or a folder when `dir` is set
    var path: String
    /// nil when the path no longer exists
    var text: String?
    var mtime: Double
    var birthtime: Double
    var dir = false
    /// set for files other than pages, such as images
    var other = false
}

/// Pages changed by another app while the vault was open (Morrow's ExternalPatch).
nonisolated struct ExternalPatch: Equatable, Sendable {
    var pages: [PageMeta] = []
    var docs = JSRecord<DocNode>()
    var removed: [String] = []
    var unreadable: [String] = []
    var readable: [String] = []

    var json: JSValue {
        var docs = JSObject()
        for (id, doc) in self.docs { docs[id] = .object(doc) }
        return [
            "pages": .array(pages.map(\.json)), "docs": .object(docs), "removed": .array(removed.map(JSValue.string)),
            "unreadable": .array(unreadable.map(JSValue.string)), "readable": .array(readable.map(JSValue.string)),
        ]
    }
}

/// Edits made by other apps, sync tools or git (vaultRepository.ts `readChanges`): the changed files are read
/// against the live workspace into a patch, and what the session accepts of it is then committed to what this
/// side knows of the disk. Pages it refuses keep their old disk text, so their next save meets the conflict and
/// keeps the other version in page history.
nonisolated extension VaultWriter {
    struct ExternalRead {
        let patch: ExternalPatch
        fileprivate let layout: VaultLayout.Map
        fileprivate let removed: JSSet
        fileprivate let unreadable: JSSet
        fileprivate let readable: JSSet
        fileprivate let texts: JSMap<String>
        fileprivate let sources: JSMap<PageFile.Source>
        fileprivate let becameFolders: JSSet
    }

    private static let datePattern = JSRegex(#"^\d{4}-\d{2}-\d{2}$"#)

    func readChanges(_ changes: [VaultChange], _ state: WorkspaceState) -> ExternalRead? {
        var latest = JSMap<VaultChange>()
        for change in changes where !Paths.isHiddenPath(change.path) { latest[change.path] = change }
        for change in latest.valuesInOrder where change.other {
            if change.text == nil { others.remove(change.path) } else { others.insert(change.path) }
        }
        // a path that disappeared may have been a folder of pages
        let pageChanges = latest.valuesInOrder.filter { ($0.dir && $0.text == nil) || (!$0.other && Paths.isPageFile($0.path)) }
        if pageChanges.isEmpty { return nil }

        var byFile = JSMap<String>()
        for (id, placement) in self.layout { if let file = placement.file { byFile[Self.lower(file)] = id } }
        var layout = self.layout
        var pages = JSMap<PageMeta>()
        var docs = JSRecord<DocNode>()
        var removed = JSSet()
        var unreadable = JSSet()
        var readable = JSSet()
        var texts = JSMap<String>()
        var sources = JSMap<PageFile.Source>()
        var becameFolders = JSSet()
        func pageOf(_ id: String) -> PageMeta? { pages[id] ?? state.pages[id] }

        // gone: a removed file whose text shows up at a new path is a rename and keeps its page
        let deleted = pageChanges.filter { $0.text == nil }
        let written = pageChanges.filter { $0.text != nil && !$0.dir }
        var moves = JSMap<String>()
        for change in deleted {
            let lower = Self.lower(change.path)
            func inside(_ path: String) -> Bool {
                let candidate = Self.lower(path)
                return candidate.jsEquals(lower) || JSText.startsWith(candidate.units, (lower + "/").units)
            }
            // a page's note sits beside its subpage folder, so the folder going away only removes what was in it
            let ids = change.dir
                ? self.layout.filter { inside($0.value.file ?? $0.value.folder) }.map(\.key)
                : [byFile[lower]].compactMap { $0 }
            for id in ids {
                if let text = self.texts[id], let target = written.first(where: { candidate in
                    candidate.text!.jsEquals(text) && !byFile.has(Self.lower(candidate.path)) && !moves.has(candidate.path)
                }) {
                    moves[target.path] = id
                    continue
                }
                let hasChildren = Tree.childrenOf(state.pages, id, includeTrashed: true).contains { child in !ids.contains { $0.jsEquals(child.id) } }
                if hasChildren, !change.dir {
                    becameFolders.insert(id)
                    layout[id] = Placement(file: nil, folder: self.layout[id]!.folder)
                    docs[id] = Model.emptyDoc()
                    var page = state.pages[id]!
                    page.updatedAt = change.mtime != 0 ? change.mtime : now()
                    pages[id] = page
                    texts[id] = nil
                } else {
                    removed.insert(id)
                }
            }
        }

        func ownerOf(_ folder: String) -> String? {
            let lower = Self.lower(folder)
            for (id, placement) in layout where Self.lower(placement.folder).jsEquals(lower) && !removed.has(id) { return id }
            return nil
        }
        func ensureFolder(_ folder: String) -> String? {
            if folder.isEmpty || folder.jsEquals(Paths.trashDir) { return nil }
            if let known = ownerOf(folder) { return known }
            let parentId = ensureFolder(Paths.dirname(folder))
            let id = newId()
            var page = PageMeta(id: id, parentId: parentId, createdAt: now())
            page.title = Paths.basename(folder)
            page.order = 9_007_199_254_740_991
            pages[id] = page
            docs[id] = Model.emptyDoc()
            layout[id] = Placement(file: nil, folder: folder)
            becameFolders.insert(id)
            return id
        }

        for change in written {
            let text = change.text!
            let known = byFile[Self.lower(change.path)] ?? moves[change.path]
            if let known, let had = self.texts[known], text.jsEquals(had), !moves.has(change.path) { continue }
            let folder = Paths.stripExtension(change.path)
            let parentFolder = Paths.dirname(folder)
            var id = known
            if id == nil {
                // a note appearing next to a folder page becomes that folder's note
                if let folderPage = ownerOf(folder), let placement = layout[folderPage], placement.file == nil { id = folderPage } else { id = newId() }
            }
            let pageId = id!
            let current = pageOf(pageId)
            let parentId = parentFolder.jsEquals(Paths.trashDir) ? current?.parentId : ensureFolder(parentFolder)
            var page = current ?? {
                var fresh = PageMeta(id: pageId, parentId: parentId, createdAt: change.birthtime != 0 ? change.birthtime : now())
                fresh.order = 9_007_199_254_740_991
                return fresh
            }()
            page.parentId = parentId
            page.updatedAt = change.mtime != 0 ? change.mtime : now()
            if parentFolder.jsEquals(Paths.trashDir) {
                page.trashedAt = page.trashedAt ?? now()
            } else if Paths.dirname(self.layout[pageId]?.folder ?? "").jsEquals(Paths.trashDir) {
                page.trashedAt = nil
            }
            layout[pageId] = Placement(file: change.path, folder: folder)
            texts[pageId] = text
            if let read = readFile(change.path, text, page, state, layout) {
                pages[pageId] = read.page
                docs[pageId] = read.doc
                sources[pageId] = read.source
                if locked.has(pageId) { readable.insert(pageId) }
            } else {
                page.encrypted = PageCrypto.isEncryptedText(text) || page.encrypted
                pages[pageId] = page
                unreadable.insert(pageId)
            }
        }

        if pages.isEmpty, removed.isEmpty { return nil }
        let patch = ExternalPatch(pages: pages.valuesInOrder, docs: docs, removed: removed.items, unreadable: unreadable.items, readable: readable.items)
        return ExternalRead(patch: patch, layout: layout, removed: removed, unreadable: unreadable, readable: readable, texts: texts,
                            sources: sources, becameFolders: becameFolders)
    }

    /// what the session took of the patch becomes what this side knows of the disk
    func commit(_ read: ExternalRead, accepted: JSSet) {
        for id in accepted {
            if read.removed.has(id) {
                layout[id] = nil
                texts[id] = nil
                sources[id] = nil
                folderOnly.remove(id)
                locked.remove(id)
                continue
            }
            if let placement = read.layout[id] { layout[id] = placement }
            if read.becameFolders.has(id) { folderOnly.insert(id) } else { folderOnly.remove(id) }
            if let text = read.texts[id] { texts[id] = text } else if read.becameFolders.has(id) { texts[id] = nil }
            if let source = read.sources[id] { sources[id] = source }
            if read.unreadable.has(id) { locked.insert(id) }
            if read.readable.has(id) { locked.remove(id) }
        }
        // registry ids for new pages are written with the next save
        if read.patch.pages.contains(where: { !registryHas($0.id) }) { registryDirty = true }
    }

    private func registryHas(_ id: String) -> Bool {
        guard let registryText, let raw = try? JSJSON.parse(registryText) else { return false }
        return VaultLoad.readRegistry(raw).valuesInOrder.contains { $0.id.jsEquals(id) }
    }

    struct ReadPage {
        var page: PageMeta
        var doc: DocNode
        var source: PageFile.Source?
    }

    /// reads one page file against the live workspace, nil when it cannot be read
    func readFile(_ path: String, _ text: String, _ base: PageMeta, _ state: WorkspaceState, _ layout: VaultLayout.Map) -> ReadPage? {
        if text.utf16.count > VaultLoad.maxPageBytes || PageCrypto.isEncryptedText(text) { return nil }
        let folder = Paths.stripExtension(path)
        let name = Paths.basename(folder)
        let parent = base.parentId.flatMap { state.pages[$0] }
        let dailyDate = parent?.kind == .journal && Self.datePattern.test(name) ? name : nil
        var merged = state
        merged.pages[base.id] = base
        let resolver = VaultLoad.Resolver(state: merged, layout: layout, sources: sources)
        if Paths.extension(path) == "canvas" {
            guard let raw = try? JSJSON.parse(text.isEmpty ? "{}" : text),
                  let data = CanvasFile.readCanvas(raw, { resolver.byPath(Paths.stripExtension($0)) })
            else { return nil }
            var page = base
            page.kind = .canvas
            page.title = name
            return ReadPage(page: page, doc: CanvasFile.canvasDoc(data), source: nil)
        }
        var read = PageFile.readPageText(text)
        if read.error != nil { return nil }
        var page = base
        page.title = read.title ?? PageFile.impliedTitle(name, dailyDate)
        page.icon = read.icon
        page.cover = read.cover
        page.kind = read.kind ?? .page
        page.tags = read.tags
        page.database = read.database
        page.dailyDate = dailyDate
        page.properties = JSObject()
        let database = parent?.kind == .database ? parent?.database : nil
        for prop in database?.properties ?? [] where read.data.has(prop.name) {
            let value = PageFile.readProperty(prop, read.data[prop.name], newId)
            if !value.value.isNull { page.properties[prop.id] = value.value }
            read.source.extra[prop.name] = nil
        }
        var index = JSMap<String>()
        var names = JSMap<[String]>()
        for other in others { index[Self.lower(other)] = other }
        for other in others {
            let key = Self.lower(Paths.basename(other))
            names[key] = (names[key] ?? []) + [other]
        }
        let dir = Paths.dirname(path)
        let doc = MarkdownParse.markdownToDoc(read.body, VaultLoad.parseOptions(dir, resolver) { VaultLoad.resolveFile(dir, $0, index, names) })
        guard Doc.validateDoc(.object(doc)) == nil else { return nil }
        return ReadPage(page: page, doc: doc, source: read.source)
    }
}
