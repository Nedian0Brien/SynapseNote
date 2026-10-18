import Foundation

/// The file operations Morrow's `VaultBridge` asks for, with the behaviour of Morrow's `electron/vault.cts`.
/// Texts are written byte for byte as the editor produced them, and every read and write goes through
/// file coordination so iCloud Drive and other apps see consistent files.
nonisolated final class VaultFileSystem: @unchecked Sendable {
    let root: URL
    /// Set on iOS so this app's own coordinated writes are not reported back to it.
    private let presenter: (any NSFilePresenter)?
    /// Moves a file to the system trash; replaced in tests so they never fill the real trash.
    private let trash: @Sendable (URL) throws -> Void

    init(
        root: URL,
        presenter: (any NSFilePresenter)? = nil,
        trash: @escaping @Sendable (URL) throws -> Void = { try FileManager.default.trashItem(at: $0, resultingItemURL: nil) }
    ) {
        self.root = root.standardizedFileURL
        self.presenter = presenter
        self.trash = trash
    }

    // MARK: shapes shared with the editor, see VaultScan, VaultOp and VaultChange in Morrow

    struct ScannedFile: Codable, Equatable, Sendable {
        let path: String
        let text: String
        let mtime: Double
        let birthtime: Double
    }

    struct ScannedFolder: Codable, Equatable, Sendable {
        let path: String
        let mtime: Double
        let empty: Bool
    }

    struct Scan: Codable, Equatable, Sendable {
        var files: [ScannedFile] = []
        var folders: [ScannedFolder] = []
        var others: [String] = []
        var registry: JSONValue = .null
        var recent: JSONValue = .null
    }

    enum Op: Decodable, Equatable, Sendable {
        /// `expect` is the text the file must still have; `.some(nil)` means it must not exist yet.
        case write(path: String, text: String, expect: String??)
        case rename(from: String, to: String, optional: Bool)
        case remove(path: String)
        case rmdir(path: String)
        case delete(path: String)

        private enum Keys: String, CodingKey { case op, path, text, expect, from, to, optional }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: Keys.self)
            switch try container.decode(String.self, forKey: .op) {
            case "write":
                let expect: String?? = container.contains(.expect)
                    ? .some(try container.decodeNil(forKey: .expect) ? nil : try container.decode(String.self, forKey: .expect))
                    : .none
                self = .write(path: try container.decode(String.self, forKey: .path),
                              text: try container.decode(String.self, forKey: .text), expect: expect)
            case "rename":
                self = .rename(from: try container.decode(String.self, forKey: .from),
                               to: try container.decode(String.self, forKey: .to),
                               optional: try container.decodeIfPresent(Bool.self, forKey: .optional) ?? false)
            case "remove": self = .remove(path: try container.decode(String.self, forKey: .path))
            case "rmdir": self = .rmdir(path: try container.decode(String.self, forKey: .path))
            case "delete": self = .delete(path: try container.decode(String.self, forKey: .path))
            default:
                throw DecodingError.dataCorruptedError(forKey: .op, in: container, debugDescription: "Unknown operation.")
            }
        }
    }

    enum OpResult: Encodable, Equatable, Sendable {
        case ok
        case conflict(message: String, current: String?)
        case exists(message: String)
        case error(message: String)

        private enum Keys: String, CodingKey { case ok, code, message, current }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: Keys.self)
            switch self {
            case .ok:
                try container.encode(true, forKey: .ok)
            case .conflict(let message, let current):
                try container.encode(false, forKey: .ok)
                try container.encode("conflict", forKey: .code)
                try container.encode(message, forKey: .message)
                if let current { try container.encode(current, forKey: .current) } else { try container.encodeNil(forKey: .current) }
            case .exists(let message):
                try container.encode(false, forKey: .ok)
                try container.encode("exists", forKey: .code)
                try container.encode(message, forKey: .message)
            case .error(let message):
                try container.encode(false, forKey: .ok)
                try container.encode("error", forKey: .code)
                try container.encode(message, forKey: .message)
            }
        }

        var isOK: Bool { self == .ok }
    }

    struct FileInfo: Codable, Equatable, Sendable {
        let path: String
        let size: Int
        let mtime: Double
    }

    struct Change: Codable, Equatable, Sendable {
        let path: String
        let text: String?
        let mtime: Double
        let birthtime: Double
        var dir: Bool? = nil
        var other: Bool? = nil
    }

    enum Failure: Error, LocalizedError {
        case missing(String)
        case exists(String)
        case notAllowed(String)

        var errorDescription: String? {
            switch self {
            case .missing(let path): "\(path) is missing."
            case .exists(let path): "\(path) already exists."
            case .notAllowed(let message): message
            }
        }
    }

    // MARK: reading

    func scan() throws -> Scan {
        var scan = Scan()
        var count = 0
        try coordinateReading(root) { root in
            func walk(_ folder: URL, depth: Int) {
                guard depth <= VaultPaths.maxDepth, count <= VaultPaths.maxFiles else { return }
                for entry in entries(of: folder) {
                    count += 1
                    if count > VaultPaths.maxFiles { return }
                    let relative = VaultPaths.relative(entry.url, to: root)
                    if entry.name.contains(VaultPaths.tempMark) || entry.isSymbolicLink || VaultPaths.isHidden(relative) { continue }
                    if entry.isDirectory {
                        let children = (try? FileManager.default.contentsOfDirectory(atPath: entry.url.path(percentEncoded: false))) ?? ["?"]
                        scan.folders.append(ScannedFolder(path: relative, mtime: entry.mtime, empty: children.isEmpty))
                        walk(entry.url, depth: depth + 1)
                    } else if entry.isFile {
                        guard VaultPaths.isPage(relative) else {
                            scan.others.append(relative)
                            continue
                        }
                        if entry.size > VaultPaths.maxTextBytes {
                            scan.others.append(relative)
                            continue
                        }
                        guard let data = try? Data(contentsOf: entry.url) else { continue }
                        scan.files.append(ScannedFile(path: relative, text: String(decoding: data, as: UTF8.self),
                                                      mtime: entry.mtime, birthtime: entry.birthtime))
                    }
                }
            }
            walk(root, depth: 0)
        }
        scan.registry = readJSON(".morrow/workspace.json")
        scan.recent = readJSON(".morrow/recent.json")
        return scan
    }

    func readText(_ relative: String) throws -> String? {
        let url = try VaultPaths.resolve(relative, in: root)
        return try coordinateReading(url) { url in
            guard FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) else { return nil }
            return String(decoding: try Data(contentsOf: url), as: UTF8.self)
        }
    }

    func readBytes(_ relative: String) -> Data? {
        guard let url = try? VaultPaths.resolve(relative, in: root) else { return nil }
        return try? coordinateReading(url) { url in
            let values = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
            guard values.isRegularFile == true, (values.fileSize ?? 0) <= VaultPaths.maxFileBytes else { return nil }
            return try Data(contentsOf: url)
        }
    }

    func exists(_ relative: String) throws -> Bool {
        FileManager.default.fileExists(atPath: try VaultPaths.resolve(relative, in: root).path(percentEncoded: false))
    }

    func listFiles(_ relative: String) throws -> [FileInfo] {
        let folder = try VaultPaths.resolve(relative, in: root)
        var result: [FileInfo] = []
        func walk(_ folder: URL, depth: Int) {
            guard depth <= 16 else { return }
            for entry in entries(of: folder) where !entry.name.contains(VaultPaths.tempMark) && !entry.isSymbolicLink {
                if entry.isDirectory { walk(entry.url, depth: depth + 1) }
                else if entry.isFile { result.append(FileInfo(path: VaultPaths.relative(entry.url, to: root), size: entry.size, mtime: entry.mtime)) }
            }
        }
        walk(folder, depth: 0)
        return result
    }

    // MARK: writing

    /// Runs operations in order and stops at the first one that fails, one result per attempt.
    func apply(_ ops: [Op]) -> [OpResult] {
        var results: [OpResult] = []
        for op in ops {
            let result: OpResult
            do {
                result = try applyOne(op)
            } catch {
                result = .error(message: error.localizedDescription)
            }
            results.append(result)
            if !result.isOK { break }
        }
        return results
    }

    /// Creates a new file and never replaces one.
    func createFile(_ relative: String, data: Data) throws {
        let url = try VaultPaths.resolve(relative, in: root)
        guard !FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) else {
            throw Failure.notAllowed("A file with that name already exists.")
        }
        try writeAtomic(data, to: url)
    }

    private func applyOne(_ op: Op) throws -> OpResult {
        switch op {
        case .write(let path, let text, let expect):
            let url = try VaultPaths.resolve(path, in: root)
            if case .some(let expected) = expect {
                let current = try readText(path)
                if current != expected { return .conflict(message: "\(path) changed on disk.", current: current) }
            }
            try writeAtomic(Data(text.utf8), to: url)
            return .ok
        case .rename(let fromPath, let toPath, let optional):
            let from = try VaultPaths.resolve(fromPath, in: root)
            let to = try VaultPaths.resolve(toPath, in: root)
            let fileManager = FileManager.default
            guard fileManager.fileExists(atPath: from.path(percentEncoded: false)) else {
                return optional ? .ok : .error(message: "\(fromPath) is missing.")
            }
            let caseOnly = from.path(percentEncoded: false).lowercased() == to.path(percentEncoded: false).lowercased()
            if !caseOnly && fileManager.fileExists(atPath: to.path(percentEncoded: false)) {
                return .exists(message: "\(toPath) already exists.")
            }
            try VaultPaths.checkReal(from, in: root)
            try VaultPaths.checkReal(to, in: root)
            try coordinateMove(from: from, to: to) { from, to in
                try fileManager.createDirectory(at: to.deletingLastPathComponent(), withIntermediateDirectories: true)
                // rename(2) as Node does, so a change of case alone works on case-insensitive volumes
                guard Darwin.rename(from.path(percentEncoded: false), to.path(percentEncoded: false)) == 0 else {
                    throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
                }
            }
            return .ok
        case .remove(let path):
            let url = try VaultPaths.resolve(path, in: root)
            let fileManager = FileManager.default
            guard fileManager.fileExists(atPath: url.path(percentEncoded: false)) else { return .ok }
            try VaultPaths.checkReal(url, in: root)
            try coordinateWriting(url, options: .forDeleting) { url in
                do {
                    try trash(url)
                } catch {
                    // without a system trash the file is kept in the vault's own deleted folder instead
                    let keep = root.appending(path: ".morrow/deleted/\(Int(Date().timeIntervalSince1970 * 1000))-\(url.lastPathComponent)")
                    try fileManager.createDirectory(at: keep.deletingLastPathComponent(), withIntermediateDirectories: true)
                    try fileManager.moveItem(at: url, to: keep)
                }
            }
            return .ok
        case .delete(let path):
            // only Morrow's own bookkeeping is ever deleted outright, pages always go to the trash
            guard path.hasPrefix(".morrow/") else { return .error(message: "Only SynapseNote files can be deleted.") }
            let url = try VaultPaths.resolve(path, in: root)
            try coordinateWriting(url, options: .forDeleting) { url in
                if FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) {
                    try FileManager.default.removeItem(at: url)
                }
            }
            return .ok
        case .rmdir(let path):
            let url = try VaultPaths.resolve(path, in: root)
            // folders that still hold something stay
            _ = Darwin.rmdir(url.path(percentEncoded: false))
            return .ok
        }
    }

    /// Writes beside the target and renames it into place, so a crash never leaves half a file.
    private func writeAtomic(_ data: Data, to url: URL) throws {
        try VaultPaths.checkReal(url, in: root)
        try coordinateWriting(url, options: .forReplacing) { url in
            let folder = url.deletingLastPathComponent()
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let temp = folder.appending(path: VaultPaths.tempMark + UUID().uuidString.prefix(12))
            try data.write(to: temp)
            guard Darwin.rename(temp.path(percentEncoded: false), url.path(percentEncoded: false)) == 0 else {
                let code = errno
                try? FileManager.default.removeItem(at: temp)
                throw POSIXError(POSIXErrorCode(rawValue: code) ?? .EIO)
            }
        }
    }

    // MARK: changes

    /// What happened at each changed path, in Morrow's VaultChange form.
    func describe(_ paths: Set<String>) -> [Change] {
        var changes: [Change] = []
        for relative in paths.sorted() where !relative.contains(VaultPaths.tempMark) && !VaultPaths.isHidden(relative) {
            guard let url = try? VaultPaths.resolve(relative, in: root) else { continue }
            let entry = Entry(url: url)
            if !entry.exists {
                let page = VaultPaths.isPage(relative)
                changes.append(Change(path: relative, text: nil, mtime: Date().timeIntervalSince1970 * 1000, birthtime: 0,
                                      dir: !page, other: !page))
            } else if entry.isDirectory {
                changes.append(contentsOf: describeFolder(url, depth: 0))
            } else if entry.isFile {
                changes.append(contentsOf: describeFile(entry))
            }
        }
        return changes
    }

    private func describeFile(_ entry: Entry) -> [Change] {
        let relative = VaultPaths.relative(entry.url, to: root)
        guard VaultPaths.isPage(relative) else {
            return [Change(path: relative, text: "", mtime: entry.mtime, birthtime: entry.birthtime, other: true)]
        }
        guard entry.size <= VaultPaths.maxTextBytes, let data = try? coordinateReading(entry.url, { try Data(contentsOf: $0) }) else { return [] }
        return [Change(path: relative, text: String(decoding: data, as: UTF8.self), mtime: entry.mtime, birthtime: entry.birthtime)]
    }

    private func describeFolder(_ folder: URL, depth: Int) -> [Change] {
        guard depth <= 16 else { return [] }
        var changes: [Change] = []
        for entry in entries(of: folder) {
            let relative = VaultPaths.relative(entry.url, to: root)
            if entry.name.contains(VaultPaths.tempMark) || entry.isSymbolicLink || VaultPaths.isHidden(relative) { continue }
            if entry.isDirectory { changes.append(contentsOf: describeFolder(entry.url, depth: depth + 1)) }
            else if entry.isFile { changes.append(contentsOf: describeFile(entry)) }
        }
        return changes
    }

    // MARK: helpers

    private struct Entry {
        let url: URL
        let name: String
        let exists: Bool
        let isDirectory: Bool
        let isFile: Bool
        let isSymbolicLink: Bool
        let size: Int
        let mtime: Double
        let birthtime: Double

        init(url: URL) {
            self.url = url
            name = url.lastPathComponent
            let values = try? url.resourceValues(forKeys: [
                .isDirectoryKey, .isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey,
                .contentModificationDateKey, .creationDateKey,
            ])
            exists = values != nil && FileManager.default.fileExists(atPath: url.path(percentEncoded: false))
            isSymbolicLink = values?.isSymbolicLink ?? false
            isDirectory = !isSymbolicLink && (values?.isDirectory ?? false)
            isFile = !isSymbolicLink && (values?.isRegularFile ?? false)
            size = values?.fileSize ?? 0
            mtime = (values?.contentModificationDate?.timeIntervalSince1970 ?? 0) * 1000
            let created = values?.creationDate?.timeIntervalSince1970 ?? 0
            birthtime = created > 0 ? created * 1000 : mtime
        }
    }

    private func entries(of folder: URL) -> [Entry] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: folder.path(percentEncoded: false))) ?? []
        return names.map { Entry(url: folder.appending(path: $0)) }
    }

    private func readJSON(_ relative: String) -> JSONValue {
        guard let text = try? readText(relative), let value = try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8)) else {
            return .null
        }
        return value
    }

    private func coordinator() -> NSFileCoordinator {
        NSFileCoordinator(filePresenter: presenter)
    }

    private func coordinateReading<T>(_ url: URL, _ body: (URL) throws -> T) throws -> T {
        var error: NSError?
        var result: Result<T, Error>?
        coordinator().coordinate(readingItemAt: url, options: [], error: &error) { url in
            result = Result { try body(url) }
        }
        if let error { throw error }
        return try result!.get()
    }

    private func coordinateWriting(_ url: URL, options: NSFileCoordinator.WritingOptions, _ body: (URL) throws -> Void) throws {
        var error: NSError?
        var result: Result<Void, Error>?
        coordinator().coordinate(writingItemAt: url, options: options, error: &error) { url in
            result = Result { try body(url) }
        }
        if let error { throw error }
        try result!.get()
    }

    private func coordinateMove(from: URL, to: URL, _ body: (URL, URL) throws -> Void) throws {
        var error: NSError?
        var result: Result<Void, Error>?
        coordinator().coordinate(writingItemAt: from, options: .forMoving, writingItemAt: to, options: .forReplacing, error: &error) { from, to in
            result = Result { try body(from, to) }
        }
        if let error { throw error }
        try result!.get()
    }
}
