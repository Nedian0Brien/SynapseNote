import Foundation

/// Morrow's core/portability.ts: whole-workspace backups (JSON), restoring them, Markdown import and export.
nonisolated enum Portability {
    static let backupFormat = "morrow-backup"

    struct BackupFile: Equatable, Sendable {
        var meta: FileMeta
        /// base64 encoded bytes
        var data: String

        var json: JSValue {
            var object = meta.json.object!
            object["data"] = .string(data)
            return .object(object)
        }
    }

    struct ParsedBackup {
        var pages: [PageMeta]
        var docs: JSRecord<DocNode>
        var files: [BackupFile]
        var problems: [String]
    }

    struct InsertPlan {
        var pages: [PageMeta]
        var docs: JSRecord<DocNode>
        var skipped: Int
        var problems: [String]
    }

    /// `createBackup`; `exportedAt` is `Date.toISOString()` of `now` (milliseconds since 1970)
    static func createBackup(_ state: WorkspaceState, now: Double, files: [BackupFile] = []) -> JSValue {
        var docs = JSObject()
        for (id, doc) in state.docs where state.pages[id]?.encrypted != true { docs[id] = .object(doc) }
        return [
            "format": .string(backupFormat),
            "schemaVersion": .number(Double(Model.schemaVersion)),
            "exportedAt": .string(isoString(now)),
            // encrypted pages are left out, their encrypted files in the vault are their backup
            "pages": .array(state.pages.valuesInOrder.filter { !$0.encrypted }.map(\.json)),
            "docs": .object(docs),
            "files": .array(files.map(\.json)),
        ]
    }

    /// `Date.prototype.toISOString`
    static func isoString(_ time: Double) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter.string(from: Date(timeIntervalSince1970: time / 1000))
    }

    /// every file referenced by any page, including pages in the trash
    static func referencedFileIds(_ state: WorkspaceState) -> JSSet {
        var ids = JSSet()
        for (_, doc) in state.docs { for id in Doc.fileIdsInDoc(doc) { ids.insert(id) } }
        return ids
    }

    private static let backupFileId = JSRegex(#"^[A-Za-z0-9_-]{1,64}$"#)
    private static let base64Text = JSRegex(#"^[A-Za-z0-9+/]*={0,2}$"#)

    static func parseBackup(_ text: String) -> Result<ParsedBackup, CommandFailure> {
        let data: JSValue
        do {
            data = try JSJSON.parse(text)
        } catch {
            return .failure(CommandFailure(message: "This file is not valid JSON (\(error.localizedDescription))."))
        }
        guard case .object(let fields) = data, fields["format"] == .string(backupFormat) else {
            return .failure(CommandFailure(message: "This file is not a SynapseNote backup."))
        }
        guard case .array(let pages) = fields["pages"], case .object(let docs) = fields["docs"] else {
            return .failure(CommandFailure(message: "The backup is incomplete."))
        }
        switch Migrations.readWorkspace(Database.toNumber(fields["schemaVersion"] ?? .null), pages: pages, docs: docs) {
        case .failure(let error): return .failure(error)
        case .success(let loaded):
            var files: [BackupFile] = []
            var problems = loaded.problems
            for raw in fields["files"]?.array ?? [] {
                if let file = readBackupFile(raw) { files.append(file) } else {
                    problems.append("An attachment in the backup could not be read and was skipped.")
                }
            }
            return .success(ParsedBackup(pages: loaded.pages, docs: loaded.docs, files: files, problems: problems))
        }
    }

    private static func readBackupFile(_ raw: JSValue) -> BackupFile? {
        guard case .object(let object) = raw, case .string(let id) = object["id"], backupFileId.test(id),
              case .string(let data) = object["data"], base64Text.test(data) else { return nil }
        var name = "file"
        if case .string(let given) = object["name"], !given.isEmpty { name = JSText.string(JSText.slice(given.units, 0, 255)) }
        var type = "application/octet-stream"
        if case .string(let given) = object["type"] { type = JSText.string(JSText.slice(given.units, 0, 120)) }
        func finite(_ key: String) -> Double {
            if case .number(let value) = object[key], value.isFinite { return value }
            return 0
        }
        return BackupFile(meta: FileMeta(id: id, name: name, type: type, size: finite("size"), createdAt: finite("createdAt")), data: data)
    }

    /// restoring only ever adds pages, conflicting ids get fresh ids and identical pages are skipped
    static func planRestore(_ state: WorkspaceState, _ backup: ParsedBackup, _ newId: () -> String) -> InsertPlan {
        var remap = JSMap<String>()
        var skip = JSSet()
        for page in backup.pages {
            guard let existing = state.pages[page.id] else { continue }
            if existing.updatedAt == page.updatedAt, existing.title.jsEquals(page.title) { skip.insert(page.id) } else { remap[page.id] = newId() }
        }
        let hasJournal = Daily.findJournal(state) != nil
        func mapId(_ id: String) -> String { remap[id] ?? id }
        let incoming = JSSet(backup.pages.map(\.id))
        var plan = InsertPlan(pages: [], docs: JSRecord(), skipped: skip.items.count, problems: backup.problems)
        for page in backup.pages where !skip.has(page.id) {
            let id = mapId(page.id)
            var copy = page
            copy.id = id
            let parentKnown = page.parentId.map { incoming.has($0) || state.pages.has($0) } ?? false
            copy.parentId = parentKnown ? mapId(page.parentId!) : nil
            if remap.has(page.id) { copy.title = "\(page.title.isEmpty ? "Untitled" : page.title) (restored)" }
            if page.kind == .journal, hasJournal { copy.kind = .page }
            if let date = page.dailyDate, !date.isEmpty, Daily.findDailyNote(state, date) != nil { copy.dailyDate = nil }
            plan.pages.append(copy)
            if let doc = backup.docs[page.id] { plan.docs[id] = remapLinks(doc, mapId) }
        }
        return plan
    }

    private static func remapLinks(_ doc: DocNode, _ mapId: (String) -> String) -> DocNode {
        func visit(_ node: DocNode) -> DocNode {
            var next = node
            if let content = node.content, node.has("content") { next = node.with(content: content.map(visit)) }
            if node.type == "pageLink", case .string(let id) = node.attr("id") {
                var attrs = node.attrs ?? JSObject()
                attrs["id"] = .string(mapId(id))
                next = next.with("attrs", .object(attrs))
            }
            return next
        }
        return visit(Doc.cloneDoc(doc))
    }

    struct MarkdownFile: Sendable {
        var name: String
        var text: String
    }

    private static let markdownExtension = JSRegex(#"\.(md|markdown|mdown|txt)$"#, ignoreCase: true)
    private static let firstHeading = JSRegex(#"^#\s+(.+)$"#)

    /// each file becomes a page, [[links]] resolve against existing and imported pages
    static func planMarkdownImport(_ state: WorkspaceState, _ files: [MarkdownFile], _ parentId: String?, _ newId: () -> String, now: Double) -> InsertPlan {
        let base = Tree.childrenOf(state.pages, parentId).count
        struct Draft {
            var id: String
            var file: MarkdownFile
            var fallback: String
            var title: String
        }
        let drafts = files.map { file -> Draft in
            let stripped = JSText.trim(JSText.string(markdownExtension.replaceAll(file.name.units) { _ in [] }))
            let fallback = stripped.isEmpty ? "Untitled" : stripped
            // /^#\s+(.+)$/m on the first line that is not blank
            let line = JSText.split(file.text, on: 0x0A).first { !JSText.trim($0).isEmpty } ?? ""
            let title = headingTitle(line).map { JSText.trim($0) } ?? fallback
            return Draft(id: newId(), file: file, fallback: fallback, title: title)
        }
        let resolvePage: (String) -> String? = { title in
            let wanted = JSText.lowercased(title.units)
            if let imported = drafts.first(where: { JSText.lowercased($0.title.units) == wanted }) { return imported.id }
            return Search.pageIdByTitle(state, title)
        }
        var plan = InsertPlan(pages: [], docs: JSRecord(), skipped: 0, problems: [])
        for (index, draft) in drafts.enumerated() {
            var options = MarkdownParse.Options()
            options.resolvePage = resolvePage
            let parsed = MarkdownParse.markdownToPage(draft.file.text, fallbackTitle: draft.fallback, options)
            var page = PageMeta(id: draft.id, parentId: parentId, createdAt: now)
            page.title = parsed.title
            page.order = Double(base + index)
            plan.pages.append(page)
            plan.docs[draft.id] = parsed.doc
        }
        return plan
    }

    /// `/^#\s+(.+)$/m.exec(line)?.[1]`: the line has no line feed in it, but `$` with `m` also stops at a carriage return
    private static func headingTitle(_ line: String) -> String? {
        for part in line.split(separator: "\r", omittingEmptySubsequences: false) {
            if let match = firstHeading.exec(String(part).units), let title = match.group(1) { return JSText.string(title) }
        }
        return nil
    }

    static func pageMarkdown(_ state: WorkspaceState, _ id: String, filePath: ((String) -> String?)? = nil) -> String {
        guard let page = state.pages[id], let doc = state.docs[id] else { return "" }
        let titleOf: (String) -> String? = { state.pages[$0].map(Model.displayTitle) }
        var options = MarkdownSerialize.Options(titleOf: titleOf)
        if let filePath { options.filePath = filePath }
        return MarkdownSerialize.pageToMarkdown(title: Model.displayTitle(page), doc: Links.refreshLinkLabels(doc, titleOf), options)
    }

    private static let notExtensionChars = JSRegex(#"[^.A-Za-z0-9]"#)

    /// attachments share one folder, each file gets a stable unique name
    static func attachmentNames(_ ids: [String], _ files: JSRecord<FileMeta>) -> JSMap<String> {
        var names = JSMap<String>()
        var used = JSSet()
        for id in ids {
            guard let meta = files[id], !names.has(id) else { continue }
            let name = meta.name.units
            let dot = JSText.lastIndexOf(name, 0x2E)
            let ext = dot > 0 ? JSText.string(notExtensionChars.replaceAll(Array(name[dot...])) { _ in [] }.prefix(10)) : ""
            let base = safeFileName(JSText.string(dot > 0 ? Array(name[..<dot]) : name))
            names[id] = uniqueName("\(base)\(ext)", &used)
        }
        return names
    }

    struct ExportFile: Equatable, Sendable {
        var path: String
        var content: String
    }

    /// a page with subpages exports as title.md next to a folder named after it, files go in attachments
    static func workspaceMarkdownFiles(_ state: WorkspaceState, _ fileMetas: JSRecord<FileMeta> = JSRecord()) -> (files: [ExportFile], attachments: JSMap<String>) {
        let live = Tree.livePages(state.pages).filter { !$0.encrypted }
        let referenced = live.flatMap { page in state.docs[page.id].map(Doc.fileIdsInDoc) ?? [] }
        var attachments = JSMap<String>()
        for (id, name) in attachmentNames(referenced, fileMetas) { attachments[id] = "attachments/\(name)" }
        var files: [ExportFile] = []
        func visit(_ parentId: String?, _ folder: String, _ depth: Int) {
            if depth > 32 { return }
            var used = JSSet(["attachments"])
            let up = String(repeating: "../", count: depth)
            for page in Tree.childrenOf(state.pages, parentId) where !page.encrypted {
                let name = uniqueName(safeFileName(Model.displayTitle(page)), &used)
                let filePath: (String) -> String? = { id in attachments[id].map { "\(up)\($0)" } }
                files.append(ExportFile(path: "\(folder)\(name).md", content: pageMarkdown(state, page.id, filePath: filePath)))
                visit(page.id, "\(folder)\(name)/", depth + 1)
            }
        }
        visit(nil, "", 0)
        return (files, attachments)
    }

    private static let unsafe = JSRegex(#"[<>:"/\\|?*]"#)
    private static let spaces = JSRegex(#"\s+"#)
    private static let edges = JSRegex(#"^[.\s]+|[.\s]+$"#)
    private static let reserved = JSRegex(#"^(con|prn|aux|nul|com\d|lpt\d)$"#, ignoreCase: true)

    /// this module's own safeFileName (vault/paths has another): control characters become spaces, 60 units
    static func safeFileName(_ title: String) -> String {
        // [...title] walks code points; a code point whose first unit is below 32 is a control character
        var printable: [UInt16] = []
        for scalar in title.unicodeScalars {
            if scalar.value < 32 { printable.append(0x20) } else { printable += String(scalar).utf16 }
        }
        var units = unsafe.replaceAll(printable) { _ in [0x20] }
        units = spaces.replaceAll(units) { _ in [0x20] }
        units = edges.replaceAll(units) { _ in [] }
        let cleaned = JSText.string(JSText.trim(JSText.slice(units, 0, 60)))
        return cleaned.isEmpty || reserved.test(cleaned) ? "Untitled" : cleaned
    }

    private static func uniqueName(_ name: String, _ used: inout JSSet) -> String {
        var candidate = name
        var n = 2
        while used.has(JSText.string(JSText.lowercased(candidate.units))) {
            candidate = "\(name) (\(n))"
            n += 1
        }
        used.insert(JSText.string(JSText.lowercased(candidate.units)))
        return candidate
    }
}
