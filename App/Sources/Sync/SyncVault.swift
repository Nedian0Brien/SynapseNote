import CryptoKit
import Foundation

/// The vault side of sync, as lines 418 to 540 of Morrow's `electron/vault.cts`: which files are shared and
/// their hashes, the vault's identity, what two computers last agreed on, and writing files that came from
/// another computer.
nonisolated final class SyncVault: @unchecked Sendable {
    let files: VaultFileSystem
    /// The name the other computer shows when the vaults differ.
    let name: String
    private let lock = NSLock()
    private var hashes: [String: (size: Int, mtime: Date, hash: String)] = [:]

    init(files: VaultFileSystem, name: String) {
        self.files = files
        self.name = name
    }

    enum WriteResult: Equatable {
        case ok
        /// The file changed here since the plan saw it.
        case changed
    }

    static let identityFile = ".morrow/vault.json"
    /// Morrow's id rule, `/^[\w-]{8,64}$/`: 8 to 64 ASCII letters, digits, underscores or dashes.
    static func isValidId(_ id: String) -> Bool {
        (8...64).contains(id.utf8.count) && id.utf8.allSatisfy { byte in
            (byte >= 0x30 && byte <= 0x39) || (byte >= 0x41 && byte <= 0x5A) || (byte >= 0x61 && byte <= 0x7A) || byte == 0x5F || byte == 0x2D
        }
    }

    // MARK: identity

    /// The vault's id, made the first time it is asked for, so two computers only sync copies of the same vault.
    func identity() throws -> String {
        if let data = files.readBytes(Self.identityFile),
           let value = try? JSONDecoder().decode(JSONValue.self, from: data),
           let id = value["id"]?.stringValue, Self.isValidId(id) {
            return id
        }
        let id = UUID().uuidString.lowercased()
        try files.writeBytes(Self.identityFile, data: Self.identityJSON(id))
        return id
    }

    /// Morrow's `vault.json`, written by `JSON.stringify(…, null, 1)`: one space of indent, then a new line.
    static func identityJSON(_ id: String) -> Data {
        Data("{\n \"version\": 1,\n \"id\": \"\(id)\"\n}\n".utf8)
    }

    /// Makes an empty folder the start of a copy of a vault on another computer.
    static func prepareCopy(in folder: URL, vaultId: String) throws {
        guard isValidId(vaultId) else { throw VaultFileSystem.Failure.notAllowed("Invalid folder.") }
        let names = try FileManager.default.contentsOfDirectory(atPath: folder.path(percentEncoded: false))
        guard names.allSatisfy({ $0.hasPrefix(".") }) else {
            throw VaultFileSystem.Failure.notAllowed("Choose an empty folder for the copy.")
        }
        let morrow = folder.appending(path: ".morrow", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: morrow, withIntermediateDirectories: true)
        try identityJSON(vaultId).write(to: morrow.appending(path: "vault.json"))
    }

    // MARK: manifest

    /// Every shared file with a SHA-256 of its bytes, hashed again only when its size or date changed.
    func manifest() throws -> SyncManifest {
        var manifest: SyncManifest = [:]
        var count = 0
        let keys: Set<URLResourceKey> = [.isDirectoryKey, .isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey, .contentModificationDateKey]
        func walk(_ folder: URL, depth: Int) {
            guard depth <= VaultPaths.maxDepth, count <= VaultPaths.maxFiles else { return }
            let entries = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: Array(keys))) ?? []
            for url in entries {
                count += 1
                guard count <= VaultPaths.maxFiles else { return }
                guard let values = try? url.resourceValues(forKeys: keys), values.isSymbolicLink != true else { continue }
                let relative = VaultPaths.relative(url, to: files.root)
                if values.isDirectory == true {
                    if SyncRules.isSynced(relative) || relative == ".morrow" { walk(url, depth: depth + 1) }
                } else if values.isRegularFile == true, SyncRules.isSynced(relative) {
                    let size = values.fileSize ?? 0
                    guard size <= VaultPaths.maxFileBytes else { continue }
                    if let hash = hash(url, size: size, mtime: values.contentModificationDate ?? .distantPast) {
                        manifest[relative] = hash
                    }
                }
            }
        }
        walk(files.root, depth: 0)
        return manifest
    }

    private func hash(_ url: URL, size: Int, mtime: Date) -> String? {
        let key = url.path(percentEncoded: false)
        if let cached = lock.withLock({ hashes[key] }), cached.size == size, cached.mtime == mtime { return cached.hash }
        guard let data = try? Data(contentsOf: url) else { return nil }
        let hash = Self.hash(data)
        lock.withLock { hashes[key] = (size, mtime, hash) }
        return hash
    }

    static func hash(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    // MARK: files from another computer

    /// A shared file's bytes, nil for anything that is not shared.
    func read(_ path: String) -> Data? {
        guard SyncRules.isSynced(path) else { return nil }
        return files.readBytes(path)
    }

    /// Writes a file that came from another computer, only while this computer's copy is still the one the
    /// plan saw (`expect` is its hash, nil when there was none).
    func write(_ path: String, data: Data, expect: String?) throws -> WriteResult {
        guard SyncRules.isSynced(path) else { throw VaultFileSystem.Failure.notAllowed("Invalid file.") }
        let current = files.readBytes(path).map(Self.hash)
        guard current == expect else { return .changed }
        try files.writeBytes(path, data: data)
        return .ok
    }

    /// Moves a file to the trash as Morrow's `remove` does. True when it is gone.
    func remove(_ path: String) -> Bool {
        files.apply([.remove(path: path)]).first?.isOK == true
    }

    // MARK: what two computers last agreed on

    private static func basePath(_ peerId: String) -> String { ".morrow/sync/\(peerId).json" }

    func base(for peerId: String) -> SyncManifest {
        guard Self.isValidId(peerId), let data = files.readBytes(Self.basePath(peerId)),
              let value = try? JSONDecoder().decode(JSONValue.self, from: data),
              let fields = value["files"]?.objectValue
        else { return [:] }
        return fields.compactMapValues(\.stringValue)
    }

    func saveBase(_ base: SyncManifest, for peerId: String) throws {
        guard Self.isValidId(peerId) else { return }
        let value = JSONValue.object(["version": .number(1), "files": .object(base.mapValues(JSONValue.string))])
        try files.writeBytes(Self.basePath(peerId), data: try JSONEncoder().encode(value))
    }
}
