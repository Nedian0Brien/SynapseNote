import Foundation

/// Morrow's core/vault/load.ts: turns a scanned vault folder into pages, every file is read on its own so one
/// bad file never blocks the rest.
nonisolated enum VaultLoad {
    struct ScannedFile: Sendable {
        var path: String
        var text: String
        var mtime: Double
        var birthtime: Double
    }

    struct ScannedFolder: Sendable {
        var path: String
        var mtime: Double
        /// true when the folder holds nothing at all
        var empty: Bool
    }

    struct Scan: Sendable {
        /// markdown and canvas files
        var files: [ScannedFile] = []
        var folders: [ScannedFolder] = []
        /// every other file, such as images and pdfs
        var others: [String] = []
        /// parsed contents of .morrow/workspace.json and .morrow/recent.json, or nil
        var registry: JSValue?
        var recent: JSValue?
    }

    struct RegistryEntry: Equatable, Sendable {
        var id: String
        var created: Double?
        var order: Double?
        var favorite = false
        var trashed: Double?
        /// where a trashed page came from, so restoring puts it back
        var parent: String?
        /// icons of canvases and folders, which have no frontmatter
        var icon: String?
    }

    struct Loaded {
        var pages: [PageMeta]
        var docs: JSRecord<DocNode>
        var problems: [String]
        var unreadable: [String]
        var layout: VaultLayout.Map
        var folderOnly: JSSet
        var sources: JSMap<PageFile.Source>
        /// the exact text of each page file, so morrow can tell its own writes from edits made elsewhere
        var texts: JSMap<String>
        /// folders and files that are not pages, page names must not collide with them
        var reserved: JSSet
        /// true when pages were given new ids that the registry should remember
        var registryChanged: Bool
    }

    /// files this large are opened read only rather than risk cutting them short
    static let maxPageBytes = 4_000_000
    private static let datePattern = JSRegex(#"^\d{4}-\d{2}-\d{2}$"#)

    private static func finite(_ value: JSValue?) -> Double? {
        guard case .number(let number) = value, number.isFinite else { return nil }
        return number
    }

    static func readRegistry(_ raw: JSValue?) -> JSMap<RegistryEntry> {
        var result = JSMap<RegistryEntry>()
        let pages = raw?.object?["pages"]?.object ?? JSObject()
        var seen = JSSet()
        for (path, value) in pages {
            guard case .object(let fields) = value, case .string(let id) = fields["id"], Migrations.isID(id), !seen.has(id) else { continue }
            seen.insert(id)
            var entry = RegistryEntry(id: id)
            entry.created = finite(fields["created"])
            entry.order = finite(fields["order"])
            entry.favorite = fields["favorite"] == .bool(true)
            entry.trashed = finite(fields["trashed"])
            if case .string(let parent) = fields["parent"], Migrations.isID(parent) { entry.parent = parent }
            if case .string(let icon) = fields["icon"], icon.utf16.count <= 32 { entry.icon = icon }
            result[path] = entry
        }
        return result
    }

    static func readRecent(_ raw: JSValue?) -> JSMap<Double> {
        var result = JSMap<Double>()
        for (id, value) in raw?.object?["opened"]?.object ?? JSObject() {
            if Migrations.isID(id), let time = finite(value) { result[id] = time }
        }
        return result
    }

    private struct Candidate {
        var key: String
        var folder: String
        var file: ScannedFile?
        var mtime: Double
        var birthtime: Double
    }

    private static func lower(_ text: String) -> String { JSText.string(JSText.lowercased(text.units)) }

    /// `a || b`: a number that is 0 (or NaN) gives way to the next
    private static func or(_ values: Double...) -> Double {
        values.dropLast().first { $0 != 0 && !$0.isNaN } ?? values.last!
    }

    static func loadVault(_ scan: Scan, newId: () -> String, now: Double) -> Loaded {
        let registry = readRegistry(scan.registry)
        let recent = readRecent(scan.recent)
        var problems: [String] = []
        var unreadable: [String] = []
        var registryChanged = false

        // page files, the folder of each page is its path without the extension
        var candidates: [Candidate] = []
        var pageFolders = JSSet()
        for file in scan.files {
            if !Paths.isPageFile(file.path) || Paths.isHiddenPath(file.path) || file.path.jsEquals(Paths.trashDir) { continue }
            let folder = Paths.stripExtension(file.path)
            if folder.jsEquals(Paths.trashDir) { continue }
            candidates.append(Candidate(key: file.path, folder: folder, file: file, mtime: file.mtime, birthtime: file.birthtime))
            var dir = Paths.dirname(folder)
            while !dir.isEmpty, !dir.jsEquals(Paths.trashDir) {
                pageFolders.insert(dir)
                dir = Paths.dirname(dir)
            }
        }
        // folders holding pages without a note of their own, and empty folders, become pages too
        var filed = JSSet(candidates.map { lower($0.folder) })
        for folder in scan.folders {
            if folder.path.jsEquals(Paths.trashDir) || Paths.isHiddenPath(folder.path) { continue }
            // the attachments folder holds files, it only becomes a page if someone keeps notes in it
            if folder.path.jsEquals(Paths.attachmentsDir), !pageFolders.has(folder.path) { continue }
            if !pageFolders.has(folder.path), !folder.empty { continue }
            if filed.has(lower(folder.path)) { continue }
            filed.insert(lower(folder.path))
            candidates.append(Candidate(key: folder.path, folder: folder.path, file: nil, mtime: folder.mtime, birthtime: folder.mtime))
        }
        // a folder that holds pages but was not listed still needs a page
        for dir in pageFolders where !filed.has(lower(dir)) {
            filed.insert(lower(dir))
            candidates.append(Candidate(key: dir, folder: dir, file: nil, mtime: now, birthtime: now))
        }
        candidates = candidates.jsSorted { JSCollator.compare($0.key, $1.key, locale: JSEnvironment.locale) }

        var usedIds = JSSet()
        var idOf = JSMap<String>()
        for candidate in candidates {
            if let known = registry[candidate.key]?.id, !usedIds.has(known) {
                usedIds.insert(known)
                idOf[candidate.key] = known
            }
        }
        for candidate in candidates where !idOf.has(candidate.key) {
            var id = newId()
            while usedIds.has(id) { id = newId() }
            usedIds.insert(id)
            idOf[candidate.key] = id
            registryChanged = true
        }

        // the page that owns a folder: its note, else its canvas, else the bare folder
        var owner = JSMap<String>()
        func rank(_ candidate: Candidate) -> Int {
            guard let file = candidate.file else { return 2 }
            return JSText.endsWith(file.path.units, ".md".units) ? 0 : 1
        }
        for candidate in candidates.jsSorted({ rank($0) - rank($1) }) where !owner.has(lower(candidate.folder)) {
            owner[lower(candidate.folder)] = idOf[candidate.key]!
        }

        var pages = JSMap<PageMeta>()
        var layout = VaultLayout.Map()
        var folderOnly = JSSet()
        var sources = JSMap<PageFile.Source>()
        var texts = JSMap<String>()
        var bodies = JSMap<(body: String, file: String)>()
        var canvases = JSMap<JSValue>()
        var frontmatter = JSMap<JSObject>()

        for candidate in candidates {
            let id = idOf[candidate.key]!
            let entry = registry[candidate.key]
            let parentFolder = Paths.dirname(candidate.folder)
            let trashRoot = parentFolder.jsEquals(Paths.trashDir)
            var parentId: String?
            if trashRoot {
                if let parent = entry?.parent, !parent.jsEquals(id) { parentId = parent }
            } else if !parentFolder.isEmpty {
                parentId = owner[lower(parentFolder)]
            }
            if let parent = parentId, parent.jsEquals(id) { parentId = nil }

            var page = PageMeta(id: id, parentId: parentId, createdAt: entry?.created ?? or(candidate.birthtime, candidate.mtime, now),
                                updatedAt: or(candidate.mtime, now))
            page.title = Paths.basename(candidate.folder)
            page.trashedAt = trashRoot ? (entry?.trashed ?? or(candidate.mtime, now)) : nil
            page.favorite = entry?.favorite == true
            page.lastOpenedAt = recent[id]
            page.icon = entry?.icon
            page.order = entry?.order ?? 9_007_199_254_740_991
            layout[id] = Placement(file: candidate.file?.path, folder: candidate.folder)
            guard let file = candidate.file else {
                folderOnly.insert(id)
                pages[id] = page
                continue
            }
            texts[id] = file.text
            let label = file.path
            if file.text.utf16.count > maxPageBytes {
                unreadable.append(id)
                problems.append("“\(label)” is too large to edit in Morrow, so it is shown read only.")
                pages[id] = page
                continue
            }
            if Paths.extension(file.path) == "canvas" {
                page.kind = .canvas
                if let raw = try? JSJSON.parse(file.text.isEmpty ? "{}" : file.text) {
                    canvases[id] = raw
                } else {
                    unreadable.append(id)
                    problems.append("The canvas “\(label)” could not be read and was left untouched.")
                }
                pages[id] = page
                continue
            }
            // an encrypted page stays locked until someone gives its password
            if PageCrypto.isEncryptedText(file.text) {
                page.encrypted = true
                unreadable.append(id)
                pages[id] = page
                continue
            }
            let read = PageFile.readPageText(file.text)
            if let error = read.error {
                unreadable.append(id)
                problems.append("“\(label)”: \(error) It is shown read only.")
                pages[id] = page
                continue
            }
            if let title = read.title, !title.isEmpty { page.title = title }
            if let icon = read.icon, !icon.isEmpty { page.icon = icon }
            page.cover = read.cover
            if let kind = read.kind { page.kind = kind }
            page.tags = read.tags
            page.database = read.database
            sources[id] = read.source
            frontmatter[id] = read.data
            bodies[id] = (read.body, file.path)
            pages[id] = page
        }

        // daily notes are the date named pages inside the journal, their titles follow the date
        for id in pages.keys {
            var page = pages[id]!
            let parent = page.parentId.flatMap { pages[$0] }
            let name = Paths.basename(layout[page.id]!.folder)
            if parent?.kind == .journal, datePattern.test(name) {
                page.dailyDate = name
                if page.title.jsEquals(name) { page.title = PageFile.impliedTitle(name, name) }
                pages[id] = page
            }
        }

        // database rows read their property values from frontmatter keys named after each property
        for id in pages.keys {
            guard let parentId = pages[id]!.parentId, var parent = pages[parentId], parent.kind == .database,
                  var database = parent.database, let data = frontmatter[id], var source = sources[id]
            else { continue }
            var page = pages[id]!
            for index in database.properties.indices {
                let prop = database.properties[index]
                guard data.has(prop.name) else { continue }
                let read = PageFile.readProperty(prop, data[prop.name], newId)
                if !read.value.isNull { page.properties[prop.id] = read.value }
                if !read.added.isEmpty { database.properties[index].options += read.added }
                source.extra[prop.name] = nil
            }
            parent.database = database
            pages[parentId] = parent
            sources[id] = source
            pages[id] = page
        }

        // siblings keep the order the registry remembers, the rest follow by name, newest first in the journal
        var byParent = JSMap<[String]>()
        var rootIds: [String] = []
        var rootFirst = true
        var parentOrder: [String?] = []
        for page in pages.valuesInOrder {
            if let parentId = page.parentId, pages.has(parentId) {
                if !byParent.has(parentId) { parentOrder.append(parentId) }
                byParent[parentId] = (byParent[parentId] ?? []) + [page.id]
            } else {
                if rootFirst { parentOrder.append(nil); rootFirst = false }
                rootIds.append(page.id)
            }
        }
        for parentId in parentOrder {
            let ids = parentId.map { byParent[$0]! } ?? rootIds
            let journal = parentId.flatMap { pages[$0]?.kind } == .journal
            let siblings = ids.map { pages[$0]! }.jsSorted { a, b in
                if a.order != b.order { return a.order < b.order ? -1 : 1 }
                if journal {
                    let byDate = JSCollator.compare(b.dailyDate ?? "", a.dailyDate ?? "", locale: JSEnvironment.locale)
                    if byDate != 0 { return byDate }
                }
                return JSCollator.compare(a.title, b.title, locale: JSEnvironment.locale, titles: true)
            }
            for (index, sibling) in siblings.enumerated() {
                var page = pages[sibling.id]!
                page.order = Double(index)
                pages[sibling.id] = page
            }
        }

        var state = WorkspaceState()
        for page in pages.valuesInOrder { state.pages[page.id] = page }
        var otherIndex = JSMap<String>()
        var otherNames = JSMap<[String]>()
        for path in scan.others where !Paths.isHiddenPath(path) {
            otherIndex[lower(path)] = path
            let name = lower(Paths.basename(path))
            otherNames[name] = (otherNames[name] ?? []) + [path]
        }
        let resolver = Resolver(state: state, layout: layout, sources: sources)
        var docs = JSRecord<DocNode>()
        for (id, entry) in bodies {
            let dir = Paths.dirname(entry.file)
            let doc = MarkdownParse.markdownToDoc(entry.body, parseOptions(dir, resolver) { href in
                resolveFile(dir, href, otherIndex, otherNames)
            })
            if let error = Doc.validateDoc(.object(doc)) {
                unreadable.append(id)
                problems.append("“\(entry.file)” could not be read: \(error)")
            } else {
                docs[id] = doc
            }
        }
        for (id, raw) in canvases {
            if let data = CanvasFile.readCanvas(raw, { resolver.byPath(Paths.stripExtension($0)) }) {
                docs[id] = CanvasFile.canvasDoc(data)
            } else {
                unreadable.append(id)
                problems.append("The canvas “\(layout[id]?.file ?? "undefined")” could not be read and was left untouched.")
            }
        }

        var reserved = JSSet()
        for folder in scan.folders where !filed.has(lower(folder.path)) { reserved.insert(lower(folder.path)) }

        return Loaded(pages: pages.valuesInOrder, docs: docs, problems: problems, unreadable: unreadable, layout: layout,
                      folderOnly: folderOnly, sources: sources, texts: texts, reserved: reserved, registryChanged: registryChanged)
    }

    private static let scheme = JSRegex(#"^[a-z][a-z0-9+.-]*:"#, ignoreCase: true)
    private static let pageExtension = JSRegex(#"\.(md|canvas)$"#, ignoreCase: true)

    private static func safeDecode(_ text: String) -> String { JSURI.decodeURIComponent(text) ?? text }

    static func parseOptions(_ dir: String, _ resolver: Resolver, _ resolveFileHref: ((String) -> MarkdownParse.FileRef?)?) -> MarkdownParse.Options {
        MarkdownParse.Options(
            resolvePage: { resolver.resolve($0, from: dir) },
            resolveLink: { href in
                if scheme.test(href) || href.utf16.first == 0x23 { return nil }
                let decoded = safeDecode(JSText.split(href, on: 0x23)[0])
                if !pageExtension.test(decoded) { return nil }
                let path = Paths.resolveRelative(dir, decoded) ?? decoded
                return resolver.byPath(Paths.stripExtension(path)) ?? resolver.byPath(Paths.stripExtension(decoded))
            },
            resolveFile: resolveFileHref,
        )
    }

    private static let leadingSlashes = JSRegex(#"^\/+"#)

    static func resolveFile(_ dir: String, _ href: String, _ index: JSMap<String>, _ names: JSMap<[String]>) -> MarkdownParse.FileRef? {
        if scheme.test(href) { return nil }
        let decoded = safeDecode(JSText.split(JSText.split(href, on: 0x23)[0], on: 0x3F)[0])
        if decoded.isEmpty { return nil }
        let relative = Paths.resolveRelative(dir, decoded)
        var hit = relative.flatMap { index[lower($0)] }
        if hit == nil { hit = index[lower(JSText.string(leadingSlashes.replaceAll(decoded.units) { _ in [] }))] }
        if hit == nil, !decoded.utf16.contains(0x2F) {
            hit = names[lower(decoded)]?.jsSorted { $0.utf16.count - $1.utf16.count }.first
        }
        guard let hit else { return nil }
        return MarkdownParse.FileRef(fileId: hit, name: Paths.basename(hit), image: Paths.isImagePath(hit))
    }

    /// finds the page a [[link]] means, the way obsidian does: path, then file name, then title or alias
    struct Resolver {
        private var paths = JSMap<String>()
        private var names = JSMap<[String]>()
        private var titles = JSMap<[String]>()
        private let state: WorkspaceState
        private let layout: VaultLayout.Map

        init(state: WorkspaceState, layout: VaultLayout.Map, sources: JSMap<PageFile.Source>) {
            self.state = state
            self.layout = layout
            func add(_ map: inout JSMap<[String]>, _ key: String, _ id: String) { map[key] = (map[key] ?? []) + [id] }
            for (id, placement) in layout where state.pages.has(id) {
                let lower = VaultLoad.lower(placement.folder)
                if !paths.has(lower) || placement.file.map({ JSText.endsWith($0.units, ".md".units) }) == true { paths[lower] = id }
                add(&names, Search.foldText(Paths.basename(placement.folder)), id)
            }
            for page in state.pages.valuesInOrder {
                add(&titles, Search.foldText(JSText.trim(page.title)), page.id)
                for alias in sources[page.id]?.aliases ?? [] { add(&titles, Search.foldText(alias), page.id) }
            }
        }

        /// pages outside the trash and closer to the root win when names are shared
        private func best(_ ids: [String]?) -> String? {
            guard let ids, !ids.isEmpty else { return nil }
            return ids.jsSorted { a, b in
                let pa = layout[a]?.folder ?? ""
                let pb = layout[b]?.folder ?? ""
                let trash = (Paths.isInTrash(pa) ? 1 : 0) - (Paths.isInTrash(pb) ? 1 : 0)
                if trash != 0 { return trash }
                let depth = JSText.split(pa, on: 0x2F).count - JSText.split(pb, on: 0x2F).count
                if depth != 0 { return depth }
                return Tree.compareSiblings(state.pages[a]!, state.pages[b]!)
            }.first
        }

        func byPath(_ path: String) -> String? {
            paths[VaultLoad.lower(JSText.string(VaultLoad.leadingSlashes.replaceAll(path.units) { _ in [] }))]
        }

        func resolve(_ target: String, from fromDir: String) -> String? {
            let clean = JSText.string(VaultLoad.pageExtension.replaceAll(JSText.trim(target.units)) { _ in [] })
            if clean.isEmpty { return nil }
            if clean.utf16.first == 0x2E, let relative = Paths.resolveRelative(fromDir, clean), let id = byPath(relative) { return id }
            if clean.utf16.contains(0x2F) {
                if let exact = byPath(clean) { return exact }
                // obsidian also accepts a path that ends with the folders it names
                let suffix = "/" + VaultLoad.lower(clean)
                let tail = paths.filter { JSText.endsWith($0.key.units, suffix.units) }.map(\.value)
                if !tail.isEmpty { return best(tail) }
            }
            let folded = Search.foldText(clean)
            return best(names[folded]) ?? best(titles[folded])
        }
    }
}

extension JSMap {
    nonisolated var valuesInOrder: [Value] { keys.map { self[$0]! } }
}
