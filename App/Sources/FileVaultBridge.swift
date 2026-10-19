import Foundation

/// The vault folder as the Swift session's `VaultBridge`: the same file system calls the editor page used to make
/// through the RPC server, now made by the session itself.
nonisolated final class FileVaultBridge: VaultBridge, @unchecked Sendable {
    let files: VaultFileSystem

    init(files: VaultFileSystem) {
        self.files = files
    }

    /// The folder as Morrow's `loadVault` reads it; the registry and recent list are read from their text so
    /// their keys keep the file's order.
    func scan() throws -> VaultLoad.Scan {
        let scan = try files.scan()
        return VaultLoad.Scan(
            files: scan.files.map { .init(path: $0.path, text: $0.text, mtime: $0.mtime, birthtime: $0.birthtime) },
            folders: scan.folders.map { .init(path: $0.path, mtime: $0.mtime, empty: $0.empty) },
            others: scan.others,
            registry: readText(VaultWriter.registryPath).flatMap { try? JSJSON.parse($0) },
            recent: readText(VaultWriter.recentPath).flatMap { try? JSJSON.parse($0) },
        )
    }

    func apply(_ ops: [VaultOp]) -> [VaultOpResult] {
        files.apply(ops.map(Self.op)).map { result in
            switch result {
            case .ok: .ok
            case .conflict(let message, let current): .conflict(message: message, current: current)
            case .exists(let message): .exists(message: message)
            case .error(let message): .error(message: message)
            }
        }
    }

    private static func op(_ op: VaultOp) -> VaultFileSystem.Op {
        switch op {
        case .write(let path, let text, let expect, _): .write(path: path, text: text, expect: expect)
        case .rename(let from, let to, let optional): .rename(from: from, to: to, optional: optional)
        case .remove(let path): .remove(path: path)
        case .rmdir(let path): .rmdir(path: path)
        case .delete(let path): .delete(path: path)
        }
    }

    func readText(_ path: String) -> String? { (try? files.readText(path)) ?? nil }

    func readBytes(_ path: String) -> Data? { files.readBytes(path) }

    func createFile(_ path: String, _ data: Data) throws { try files.createFile(path, data: data) }

    func exists(_ path: String) -> Bool { (try? files.exists(path)) ?? false }

    func listFiles(_ dir: String) -> [VaultFileInfo] {
        ((try? files.listFiles(dir)) ?? []).map { VaultFileInfo(path: $0.path, size: Double($0.size), mtime: $0.mtime) }
    }

    /// what the watcher saw at these paths, as the session reads outside edits
    func describe(_ paths: Set<String>) -> [VaultChange] {
        files.describe(paths).map { change in
            VaultChange(path: change.path, text: change.text, mtime: change.mtime, birthtime: change.birthtime,
                        dir: change.dir ?? false, other: change.other ?? false)
        }
    }
}
