import Foundation
@testable import SynapseNote

/// Morrow's storage/memoryVault.ts: a vault folder kept in memory, for tests.
final class MemoryVault: VaultBridge {
    private(set) var files = JSMap<String>()
    private(set) var dirs = JSSet()
    private(set) var trashed: [String] = []
    private(set) var log: [VaultOp] = []
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
            if files.has(path) {
                files[path] = nil
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
}
