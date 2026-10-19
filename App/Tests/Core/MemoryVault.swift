import Foundation
@testable import SynapseNote

/// Morrow's storage/memoryVault.ts: a vault folder kept in memory, for tests.
final class MemoryVault: VaultBridge {
    private(set) var files = JSMap<String>()
    private(set) var dirs = JSSet()
    private(set) var trashed: [String] = []
    private(set) var log: [VaultOp] = []
    /// every operation, page history included, and every file made with `createFile`, as storage-fixtures.ts records them
    private(set) var fullLog: [JSValue] = []
    private(set) var bytes = JSMap<Data>()
    let clock = 1_000_000.0

    init(_ initial: JSObject = JSObject()) {
        for (path, text) in initial { put(path, text.string ?? "") }
    }

    private func put(_ path: String, _ data: String) {
        files[path] = data
        var dir = Paths.dirname(path)
        while !dir.isEmpty {
            dirs.insert(dir)
            dir = Paths.dirname(dir)
        }
    }

    func text(_ path: String) -> String? { files[path] }

    func scan() throws -> VaultLoad.Scan {
        var scan = VaultLoad.Scan()
        for (path, data) in files {
            if Paths.isPageFile(path), !Paths.isHiddenPath(path) {
                scan.files.append(.init(path: path, text: data, mtime: clock, birthtime: clock))
            } else if !Paths.isHiddenPath(path) {
                scan.others.append(path)
            }
        }
        let everything = files.keys + dirs.items
        for path in dirs where !Paths.isHiddenPath(path) || path == ".trash" {
            let empty = !everything.contains { $0.utf16.starts(with: (path + "/").utf16) }
            scan.folders.append(.init(path: path, mtime: clock, empty: empty))
        }
        func json(_ path: String) throws -> JSValue? {
            guard let text = text(path), !text.isEmpty else { return nil }
            return try JSJSON.parse(text)
        }
        scan.registry = try json(".morrow/workspace.json")
        scan.recent = try json(".morrow/recent.json")
        return scan
    }

    func apply(_ ops: [VaultOp]) -> [VaultOpResult] {
        fullLog += ops.map(\.json)
        // what core-fixtures.ts records: every operation handed over, page history left out
        log += ops.filter { op in
            if case .write(let path, _, _, _) = op { return !path.utf16.starts(with: ".morrow/history/".utf16) }
            if case .delete(let path) = op { return !path.utf16.starts(with: ".morrow/history/".utf16) }
            return true
        }
        var results: [VaultOpResult] = []
        for op in ops {
            let result = applyOne(op)
            results.append(result)
            if result != .ok { break }
        }
        return results
    }

    private func lower(_ text: String) -> [UInt16] { JSText.lowercased(text.units) }

    private func applyOne(_ op: VaultOp) -> VaultOpResult {
        switch op {
        case .write(let path, let text, let expect, _):
            if let expect {
                let current = self.text(path)
                if !(current == nil && expect == nil) && !(current != nil && expect != nil && current!.jsEquals(expect!)) {
                    return .conflict(message: "changed on disk", current: current)
                }
            }
            put(path, text)
            return .ok
        case .rename(let from, let to, let optional):
            let isFile = files.has(from)
            let isDir = dirs.has(from)
            if !isFile, !isDir { return optional ? .ok : .error(message: "\(from) is missing") }
            let caseOnly = lower(from) == lower(to)
            if !caseOnly, files.has(to) || dirs.has(to) { return .exists(message: "\(to) exists") }
            if isFile {
                let data = files[from]!
                files[from] = nil
                put(to, data)
            } else {
                let prefix = (from + "/").utf16
                for (path, data) in files where path.utf16.starts(with: prefix) {
                    files[path] = nil
                    put(to + JSText.string(path.units[from.utf16.count...]), data)
                }
                for dir in dirs.items where dir.jsEquals(from) || dir.utf16.starts(with: prefix) {
                    dirs.remove(dir)
                    dirs.insert(to + JSText.string(dir.units[from.utf16.count...]))
                }
                var dir = Paths.dirname(to)
                while !dir.isEmpty {
                    dirs.insert(dir)
                    dir = Paths.dirname(dir)
                }
            }
            return .ok
        case .remove(let path):
            if files.has(path) || bytes.has(path) {
                files[path] = nil
                bytes[path] = nil
                trashed.append(path)
            }
            return .ok
        case .delete(let path):
            files[path] = nil
            return .ok
        case .rmdir(let path):
            let prefix = (path + "/").utf16
            let busy = (files.keys + dirs.items).contains { $0.utf16.starts(with: prefix) }
            if !busy { dirs.remove(path) }
            return .ok
        }
    }

    func takeLog() -> [VaultOp] {
        defer { log = [] }
        return log
    }

    func takeFullLog() -> [JSValue] {
        defer { fullLog = [] }
        return fullLog
    }

    func readText(_ path: String) -> String? { files[path] }

    func readBytes(_ path: String) -> Data? { bytes[path] ?? files[path].map { Data($0.utf8) } }

    func createFile(_ path: String, _ data: Data) throws {
        fullLog.append(["op": "create", "path": .string(path), "size": .number(Double(data.count))])
        if files.has(path) || bytes.has(path) { throw VaultWriteError(message: "\(path) exists") }
        bytes[path] = data
        var dir = Paths.dirname(path)
        while !dir.isEmpty {
            dirs.insert(dir)
            dir = Paths.dirname(dir)
        }
    }

    func exists(_ path: String) -> Bool { files.has(path) || bytes.has(path) || dirs.has(path) }

    func listFiles(_ dir: String) -> [VaultFileInfo] {
        let prefix = (dir + "/").utf16
        return files.keys.filter { $0.utf16.starts(with: prefix) }.map { VaultFileInfo(path: $0, size: Double(files[$0]!.utf16.count), mtime: clock) }
            + bytes.keys.filter { $0.utf16.starts(with: prefix) }.map { VaultFileInfo(path: $0, size: Double(bytes[$0]!.count), mtime: clock) }
    }

    /// an edit made by another app: the files change, the watcher's report is handed back
    func external(_ changes: [VaultChange]) {
        for change in changes where !change.dir {
            if let text = change.text { put(change.path, text) } else { files[change.path] = nil }
        }
    }
}
