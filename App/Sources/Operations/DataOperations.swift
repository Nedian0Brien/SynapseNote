import Foundation
import UniformTypeIdentifiers

/// Morrow's data operations (src/app/operations.ts): exports, the published website, backups and their restore,
/// imports and unused files, made from the Swift session's workspace with the core ports (Portability, Site,
/// Importer) and saved through the app's file saver. Messages are Morrow's, its names renamed for SynapseNote as
/// the editor bundle renames them.
extension EditorController {
    /// what the file picker is open for
    enum FilePickPurpose: Equatable {
        /// Morrow's restoreBackup: one JSON file
        case backup
        /// Morrow's importMarkdown into a page, or the top level
        case markdown(parentId: String?)

        var types: [UTType] {
            switch self {
            case .backup: [.json]
            case .markdown:
                // '.md,.markdown,.mdown,.txt,.zip,text/markdown,text/plain,application/zip'
                [UTType(filenameExtension: "md"), UTType(filenameExtension: "markdown"), UTType(filenameExtension: "mdown"),
                 .plainText, .zip].compactMap { $0 }
            }
        }

        var multiple: Bool { self != .backup }
    }

    /// Morrow's MAX_IMPORT_BYTES
    nonisolated static let maxImportBytes = 500 * 1024 * 1024

    /// Morrow's stamp(): the local date and time in a file name
    nonisolated static func stamp(_ date: Date = Date()) -> String {
        let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        func pad(_ value: Int?) -> String { String(format: "%02d", value ?? 0) }
        return "\(parts.year ?? 0)-\(pad(parts.month))-\(pad(parts.day))-\(pad(parts.hour))\(pad(parts.minute))"
    }

    nonisolated static func plural(_ count: Int, _ word: String) -> String { "\(count) \(word)\(count == 1 ? "" : "s")" }

    private var state: WorkspaceState? {
        get async { await host?.workspace()?.state }
    }

    /// the vault's files by id
    private func fileIndex() async -> JSRecord<FileMeta> {
        JSRecord((await host?.files() ?? []).map { ($0.id, $0) })
    }

    /// the stored files a set of paths names, read into zip entries under a prefix
    private func attachmentEntries(_ paths: JSMap<String>, prefix: String) async -> [(path: String, data: Data)] {
        var entries: [(String, Data)] = []
        for id in paths.keys {
            if let file = await host?.file(id), let path = paths[id] { entries.append(("\(prefix)\(path)", file.data)) }
        }
        return entries
    }

    // MARK: exports

    /// Morrow's exportPageMarkdown: the page as Markdown, or a zip with its attachments when it has some
    func exportMarkdown(_ pageId: String) {
        Task {
            guard let state = await state, let page = state.pages[pageId], let doc = state.docs[pageId] else { return }
            if page.encrypted {
                showToast("Encrypted pages are not exported as plain text. Remove the encryption first if you mean to.", error: true)
                return
            }
            let name = Portability.safeFileName(Model.displayTitle(page))
            let ids = Doc.fileIdsInDoc(doc)
            if ids.isEmpty {
                exportFile = ExportFile(name: "\(name).md", data: Data(Portability.pageMarkdown(state, pageId).utf8))
                return
            }
            let names = Portability.attachmentNames(ids, await fileIndex())
            var paths = JSMap<String>()
            for id in names.keys { paths[id] = "attachments/\(names[id]!)" }
            let markdown = Portability.pageMarkdown(state, pageId, filePath: { paths[$0] })
            let entries = [("\(name)/\(name).md", Data(markdown.utf8))] + (await attachmentEntries(paths, prefix: "\(name)/"))
            exportFile = ExportFile(name: "\(name).zip", data: Zip.write(entries))
        }
    }

    /// Morrow's exportAllMarkdown: every page as Markdown in folders, with the attachments, in one zip
    func exportAllMarkdown() {
        Task {
            guard let state = await state else { return }
            let (files, attachments) = Portability.workspaceMarkdownFiles(state, await fileIndex())
            if files.isEmpty {
                showToast("There are no pages to export yet.")
                return
            }
            let entries = files.map { ("SynapseNote/\($0.path)", Data($0.content.utf8)) } + (await attachmentEntries(attachments, prefix: "SynapseNote/"))
            exportFile = ExportFile(name: "synapsenote-markdown-\(Self.stamp()).zip", data: Zip.write(entries))
        }
    }

    /// Morrow's publishSite: a folder of plain HTML pages for any web host, formulas as MathML
    func publish(_ rootId: String?) {
        Task {
            guard let state = await state else { return }
            let root = rootId.flatMap { state.pages[$0] }
            let title = root.map(Model.displayTitle) ?? vaultURL.map(\.lastPathComponent).flatMap { $0.isEmpty ? nil : $0 } ?? "SynapseNote"
            let site = Site.buildSite(state, Site.Options(rootId: rootId, title: title, renderMath: Katex.mathML))
            let folder = Portability.safeFileName(title)
            var entries = site.files.map { ("\(folder)/\($0.path)", Data($0.content.utf8)) }
            for id in site.assets.keys {
                if let file = await host?.file(id), let path = site.assets[id] { entries.append(("\(folder)/\(path)", file.data)) }
            }
            let pages = site.files.filter { $0.path.hasSuffix(".html") }.count
            exportFile = ExportFile(name: "\(folder)-website-\(Self.stamp()).zip", data: Zip.write(entries))
            showToast("Made a website of \(Self.plural(pages, "page")). Unzip it and upload the folder to any web host.", duration: .seconds(10))
        }
    }

    // MARK: backups

    /// Morrow's backupJson: the pages, and the stored files they and their history point at when asked
    func backupJSON(attachments: Bool) async -> String? {
        guard let host, await host.flushAlone(), let state = await state else { return nil }
        var files: [Portability.BackupFile] = []
        if attachments {
            var ids = Portability.referencedFileIds(state)
            for snapshot in await host.allSnapshots() { for id in Doc.fileIdsInDoc(snapshot.doc) { ids.insert(id) } }
            for id in ids.items {
                if let file = await host.file(id) { files.append(Portability.BackupFile(meta: file.meta, data: file.data.base64EncodedString())) }
            }
        }
        return JSJSON.stringify(Portability.createBackup(state, now: JSEnvironment.now(), files: files))
    }

    /// Morrow's exportBackup
    func backup() {
        Task {
            guard let json = await backupJSON(attachments: true) else {
                showToast("The backup could not be created: the vault could not be saved first.", error: true)
                return
            }
            exportFile = ExportFile(name: "synapsenote-backup-\(Self.stamp()).json", data: Data(json.utf8))
            showToast("Backup saved. Keep it somewhere safe.")
        }
    }

    /// Morrow's restoreBackup: asks for the file first
    func restoreBackup() {
        pickFiles(.backup)
    }

    /// Morrow's importMarkdown: asks for the files first
    func importMarkdown(into parentId: String? = nil) {
        pickFiles(.markdown(parentId: parentId))
    }

    func pickFiles(_ purpose: FilePickPurpose) {
        guard phase == .ready else { return }
        filePick = purpose
        pickingFiles = true
    }

    /// the files the picker gave, read away from the main thread
    func picked(_ urls: [URL]) {
        guard let purpose = filePick else { return }
        filePick = nil
        Task {
            let read = await Task.detached { () -> [(name: String, size: Int, data: Data?)] in
                urls.map { url in
                    let scoped = url.startAccessingSecurityScopedResource()
                    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                    let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                    return (url.lastPathComponent, size, size > Self.maxImportBytes ? nil : try? Data(contentsOf: url))
                }
            }.value
            switch purpose {
            case .backup: if let file = read.first { await restore(file.data ?? Data()) }
            case .markdown(let parentId): await importFiles(read, into: parentId)
            }
        }
    }

    private func restore(_ data: Data) async {
        guard let host, let state = await state else { return }
        let parsed: Portability.ParsedBackup
        switch Portability.parseBackup(Importer.decode(data)) {
        case .success(let value): parsed = value
        case .failure(let failure):
            showToast(failure.message, error: true)
            return
        }
        let plan = Portability.planRestore(state, parsed, Self.newId)
        let existing = JSSet((await host.files()).map(\.id))
        let missing = parsed.files.filter { !existing.has($0.meta.id) }
        if plan.pages.isEmpty && missing.isEmpty {
            showToast("Everything in this backup is already in your workspace.")
            return
        }
        // files go first, so no restored page ever points at something that is not saved yet
        var fileIds = JSMap<String>()
        if !missing.isEmpty {
            switch await host.addFiles(missing.map { (meta: $0.meta, data: Data(base64Encoded: $0.data) ?? Data()) }) {
            case .success(let stored): for (file, meta) in zip(missing, stored) { fileIds[file.meta.id] = meta.id }
            case .failure(let failure):
                showToast("Restore failed: \(failure.message)", error: true)
                return
            }
        }
        if !plan.pages.isEmpty { insert(plan.pages, plan.docs, fileIds: fileIds) }
        let notes = [plan.skipped > 0 ? "\(plan.skipped) already present" : "",
                     plan.problems.isEmpty ? "" : "\(plan.problems.count) could not be read"].filter { !$0.isEmpty }
        showToast("Restored \(Self.plural(plan.pages.count, "page"))\(notes.isEmpty ? "" : " (\(notes.joined(separator: ", ")))").")
    }

    /// `pages.insert` with the documents pointed at the stored files
    private func insert(_ pages: [PageMeta], _ docs: JSRecord<DocNode>, fileIds: JSMap<String>) {
        var remapped = JSObject()
        for (id, doc) in docs { remapped[id] = .object(Doc.remapFileIds(doc, fileIds)) }
        perform(.raw(["type": "pages.insert", "pages": .array(pages.map(\.json)), "docs": .object(remapped)]))
    }

    /// Morrow's unzipAll: Notion exports sometimes wrap their parts in further zips, two levels are opened
    nonisolated static func unzipAll(_ data: Data, depth: Int = 0) throws(Zip.Failure) -> [Importer.Entry] {
        var entries: [Importer.Entry] = []
        for entry in try Zip.read(data) {
            if entry.path.lowercased().hasSuffix(".zip"), depth < 2 {
                entries += try unzipAll(entry.data, depth: depth + 1)
            } else {
                entries.append(Importer.Entry(path: entry.path, data: entry.data))
            }
        }
        return entries
    }

    private func importFiles(_ picked: [(name: String, size: Int, data: Data?)], into parentId: String?) async {
        guard let host, let state = await state, !picked.isEmpty else { return }
        let tooLarge = picked.filter { $0.size > Self.maxImportBytes }.count
        var entries: [Importer.Entry] = []
        var texts: [Portability.MarkdownFile] = []
        do {
            for file in picked where file.size <= Self.maxImportBytes {
                guard let data = file.data else { continue }
                if file.name.lowercased().hasSuffix(".zip") {
                    entries += try Self.unzipAll(data)
                } else {
                    texts.append(Portability.MarkdownFile(name: file.name, text: Importer.decode(data)))
                }
            }
        } catch {
            showToast("Import failed: \(error.message)", error: true)
            return
        }
        if entries.isEmpty && texts.isEmpty {
            showToast("Import failed: Files larger than 500 MB are not imported.", error: true)
            return
        }
        let now = JSEnvironment.now()
        let archive = entries.isEmpty ? nil : Importer.planArchiveImport(state, entries, parentId, Self.newId, now: now)
        let loose = texts.isEmpty ? nil : Portability.planMarkdownImport(state, texts, parentId, Self.newId, now: now)
        // attachments are saved first so no imported page points at a file that is not stored
        var fileIds = JSMap<String>()
        if let archive, !archive.files.isEmpty {
            switch await host.addFiles(archive.files) {
            case .success(let stored): for (file, meta) in zip(archive.files, stored) { fileIds[file.meta.id] = meta.id }
            case .failure(let failure):
                showToast("Import failed: \(failure.message)", error: true)
                return
            }
        }
        let pages = (archive?.pages ?? []) + (loose?.pages ?? [])
        if pages.isEmpty {
            showToast("Import failed: No Markdown files were found.", error: true)
            return
        }
        var docs = archive?.docs ?? JSRecord()
        for (id, doc) in loose?.docs ?? JSRecord() { docs[id] = doc }
        insert(pages, docs, fileIds: fileIds)
        if let parentId { expanded.insert(parentId) }
        let notes = [tooLarge > 0 ? "\(Self.plural(tooLarge, "file")) too large" : "",
                     archive.map { $0.files.isEmpty ? "" : Self.plural($0.files.count, "attachment") } ?? ""] + (archive?.problems ?? [])
        let shown = notes.filter { !$0.isEmpty }
        showToast("Imported \(Self.plural(pages.count, "page"))\(shown.isEmpty ? "" : " (\(shown.joined(separator: ", ")))").")
        let top = pages.filter { $0.parentId == parentId }
        if top.count == 1 { go(to: .page(top[0].id)) }
    }

    // MARK: files

    /// Morrow's unusedFiles: files nothing points at, not pages, not the trash, not page history
    func unusedFiles() async -> [FileMeta] {
        guard let host, let state = await state else { return [] }
        var used = Portability.referencedFileIds(state)
        for snapshot in await host.allSnapshots() { for id in Doc.fileIdsInDoc(snapshot.doc) { used.insert(id) } }
        return await host.files().filter { !used.has($0.id) }
    }

    /// Morrow's settings: how many files the vault holds, their size, and how many are unused
    func filesSummary() async -> FilesSummary? {
        guard phase == .ready, let host else { return nil }
        let all = await host.files()
        return FilesSummary(count: all.count, bytes: Int(all.reduce(0) { $0 + $1.size }), unused: await unusedFiles().count)
    }

    /// Morrow's deleteUnusedFiles
    func deleteUnusedFiles() {
        Task {
            let unused = await unusedFiles()
            if unused.isEmpty {
                showToast("There are no unused files.")
                return
            }
            if let failure = await host?.deleteFiles(unused.map(\.id)) {
                showToast(failure.message, error: true)
                return
            }
            showToast("Removed \(Self.plural(unused.count, "unused file")).")
        }
    }

    // MARK: automatic backups

    /// Morrow's automatic backup on the desktop: half a minute after opening, then every ten minutes, and before
    /// the app closes, only when a page changed since the last one. A vault's files are on disk as they are, so
    /// it holds the pages without attachments.
    func autoBackup() async {
        #if os(macOS)
        guard phase == .ready, let state = await state else { return }
        let latest = state.pages.valuesInOrder.map(\.updatedAt).max() ?? 0
        guard latest > lastAutoBackup else { return }
        lastAutoBackup = latest
        guard let json = await backupJSON(attachments: false) else { return }
        let failure = await Task.detached { () -> String? in
            do { try AutoBackup.write(json); return nil } catch { return error.localizedDescription }
        }.value
        if let failure { showToast("Automatic backup failed: \(failure)", error: true) }
        #endif
    }
}
