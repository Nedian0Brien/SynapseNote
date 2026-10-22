import Foundation

/// An image or file stored in the vault and referenced by its path (Morrow's FileMeta).
nonisolated struct FileMeta: Equatable, Sendable {
    /// the path in the vault, for files kept there
    var id: String
    var name: String
    var type: String
    var size: Double
    var createdAt: Double

    var json: JSValue {
        ["id": .string(id), "name": .string(name), "type": .string(type), "size": .number(size), "createdAt": .number(createdAt)]
    }
}

/// Attachments, Morrow's own small files, the activity count and the keys of encrypted pages (vaultRepository.ts).
nonisolated extension VaultWriter {
    // MARK: morrow's own files

    private static let metaName = JSRegex(#"^[\w-]+\.(json|css)$"#)

    /// a small file of morrow's own beside the pages, such as flashcard progress
    func readMeta(_ name: String) -> String? {
        guard Self.metaName.test(name) else { return nil }
        return bridge.readText("\(Paths.morrowDir)/\(name)")
    }

    func writeMeta(_ name: String, _ text: String) throws(VaultWriteError) {
        guard Self.metaName.test(name) else { return }
        if let result = bridge.apply([.write(path: "\(Paths.morrowDir)/\(name)", text: text, expect: nil, id: nil)]).first {
            switch result {
            case .ok: break
            case .conflict(let message, _), .exists(let message), .error(let message): throw VaultWriteError(message: message)
            }
        }
    }

    /// how many saves happened on each day, keyed yyyy-mm-dd
    func activity() -> JSObject {
        var object = JSObject()
        for (day, count) in days { object[day] = .number(count) }
        return object
    }

    // MARK: encrypted pages

    /// the page is locked again, its key and plain text leave memory
    func lockPage(_ id: String) {
        keys[id] = nil
        plainTexts[id] = nil
        locked.insert(id)
    }

    /// a new password for a page, its next save is encrypted
    func protectPage(_ id: String, _ password: String) throws(PageCrypto.Failure) {
        keys[id] = try PageCrypto.newPageKey(password, random: random)
        history[id] = []
        historyCleared.remove(id)
    }

    func unprotectPage(_ id: String) {
        keys[id] = nil
        plainTexts[id] = nil
    }

    /// decrypts a locked page and reads it as if it had just been loaded
    func unlockPage(_ id: String, _ password: String, _ state: WorkspaceState) -> Result<(page: PageMeta, doc: DocNode), CommandFailure> {
        guard let text = texts[id], let file = layout[id]?.file, let base = state.pages[id] else {
            return .failure(CommandFailure(message: "This page is not on disk."))
        }
        guard let opened = PageCrypto.decryptPage(text, password) else { return .failure(CommandFailure(message: "That password is not right.")) }
        guard let read = readFile(file, opened.plain, base, state, layout) else {
            return .failure(CommandFailure(message: "The page was decrypted but could not be read."))
        }
        keys[id] = opened.pageKey
        plainTexts[id] = opened.plain
        if let source = read.source { sources[id] = source }
        locked.remove(id)
        var page = read.page
        page.encrypted = true
        return .success((page, read.doc))
    }

    // MARK: attachments

    private static let notExtensionChars = JSRegex(#"[^.A-Za-z0-9]"#)

    /// stores files in the attachments folder under free names and returns their records, whose ids are the paths
    func putFiles(_ files: [(meta: FileMeta, data: Data)]) throws -> [FileMeta] {
        var metas: [FileMeta] = []
        for file in files {
            let name = file.meta.name.units
            let dot = JSText.lastIndexOf(name, 0x2E, from: name.count)
            let ext = dot > 0
                ? JSText.string(JSText.lowercased(Array(Self.notExtensionChars.replaceAll(Array(name[dot...])) { _ in [] }.prefix(10))))
                : ""
            let base = Paths.safeFileName(JSText.string(dot > 0 ? Array(name[..<dot]) : name), maxLength: 80)
            var path = Paths.joinPath(Paths.attachmentsDir, "\(base)\(ext)")
            var n = 2
            while others.has(path) || bridge.exists(path) {
                path = Paths.joinPath(Paths.attachmentsDir, "\(base) \(n)\(ext)")
                n += 1
            }
            try bridge.createFile(path, file.data)
            others.insert(path)
            var meta = file.meta
            meta.id = path
            meta.name = Paths.basename(path)
            metas.append(meta)
        }
        return metas
    }

    func getFile(_ id: String) -> (meta: FileMeta, data: Data)? {
        guard let data = bridge.readBytes(id) else { return nil }
        return (FileMeta(id: id, name: Paths.basename(id), type: Self.mimeOf(id), size: Double(data.count), createdAt: 0), data)
    }

    func listFiles() -> [FileMeta] {
        bridge.listFiles(Paths.attachmentsDir).map { file in
            FileMeta(id: file.path, name: Paths.basename(file.path), type: Self.mimeOf(file.path), size: file.size, createdAt: file.mtime)
        }
    }

    func deleteFiles(_ ids: [String]) throws(VaultWriteError) {
        let results = bridge.apply(ids.map { .remove(path: $0) })
        for id in ids { others.remove(id) }
        for result in results {
            switch result {
            case .ok: continue
            case .conflict(let message, _), .exists(let message), .error(let message): throw VaultWriteError(message: message)
            }
        }
    }

    private static let mime: [String: String] = [
        "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp",
        "svg": "image/svg+xml", "avif": "image/avif", "bmp": "image/bmp", "pdf": "application/pdf", "txt": "text/plain",
        "csv": "text/csv", "json": "application/json", "zip": "application/zip", "mp3": "audio/mpeg", "wav": "audio/wav",
        "mp4": "video/mp4", "webm": "video/webm", "mov": "video/quicktime",
    ]

    static func mimeOf(_ path: String) -> String {
        mime[Paths.extension(path)] ?? (Paths.isImagePath(path) ? "image/*" : "application/octet-stream")
    }
}
