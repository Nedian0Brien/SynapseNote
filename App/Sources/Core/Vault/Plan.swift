import Foundation

/// Morrow's core/vault/plan.ts: turns a change of layout into file operations carried out in order.
nonisolated enum VaultOp: Equatable, Sendable {
    /// expect is the text the file must still have, `.some(nil)` when it must not exist yet, nil to skip the check
    case write(path: String, text: String, expect: String??, id: String?)
    /// optional renames are skipped when the source is missing, used for folders that may not exist
    case rename(from: String, to: String, optional: Bool)
    /// moves the file to the system trash rather than deleting it
    case remove(path: String)
    /// removes a folder only when it is empty
    case rmdir(path: String)
    /// deletes one of morrow's own files for good, used for history that must not outlive encryption
    case delete(path: String)

    /// The operation as Morrow's VaultOp object.
    var json: JSValue {
        switch self {
        case .write(let path, let text, let expect, let id):
            var object = JSObject([("op", "write"), ("path", .string(path)), ("text", .string(text))])
            if let expect { object["expect"] = expect.map(JSValue.string) ?? .null }
            if let id { object["id"] = .string(id) }
            return .object(object)
        case .rename(let from, let to, let optional):
            var object = JSObject([("op", "rename"), ("from", .string(from)), ("to", .string(to))])
            if optional { object["optional"] = true }
            return .object(object)
        case .remove(let path): return ["op": "remove", "path": .string(path)]
        case .rmdir(let path): return ["op": "rmdir", "path": .string(path)]
        case .delete(let path): return ["op": "delete", "path": .string(path)]
        }
    }
}

nonisolated enum VaultPlan {
    /// `a === b` on two paths that may be null
    private static func same(_ a: String?, _ b: String?) -> Bool {
        switch (a, b) {
        case (nil, nil): true
        case (let a?, let b?): a.jsEquals(b)
        default: false
        }
    }

    private static func depth(_ path: String) -> Int { path.isEmpty ? 0 : JSText.split(path, on: 0x2F).count }
    private static func lower(_ text: String) -> String { JSText.string(JSText.lowercased(text.units)) }

    /// renames that take every page from where it is to where it should be, parents before children
    static func planMoves(_ previous: VaultLayout.Map, _ next: VaultLayout.Map) -> [VaultOp] {
        var ops: [VaultOp] = []
        var current = previous
        var owner = JSMap<String>()
        func claim(_ placement: Placement, _ id: String) {
            owner[lower(placement.folder)] = id
            if let file = placement.file { owner[lower(file)] = id }
        }
        func release(_ placement: Placement) {
            owner[lower(placement.folder)] = nil
            if let file = placement.file { owner[lower(file)] = nil }
        }
        for (id, placement) in current { claim(placement, id) }

        func rebase(_ from: String, _ to: String) {
            let prefix = (from + "/").units
            func move(_ path: String) -> String {
                let units = path.units
                return JSText.startsWith(units, prefix) ? to + JSText.string(units[from.utf16.count...]) : path
            }
            for id in current.keys {
                var placement = current[id]!
                let folder = placement.folder.jsEquals(from) ? to : move(placement.folder)
                let file = placement.file.map(move)
                if folder.jsEquals(placement.folder), same(file, placement.file) { continue }
                release(placement)
                placement.folder = folder
                placement.file = file
                current[id] = placement
                claim(placement, id)
            }
        }

        func moveFolder(_ id: String, _ to: String) {
            var placement = current[id]!
            ops.append(.rename(from: placement.folder, to: to, optional: true))
            release(placement)
            let from = placement.folder
            current[id] = placement
            rebase(from, to)
            placement = current[id]!
            placement.folder = to
            current[id] = placement
            claim(placement, id)
        }
        func moveFile(_ id: String, _ to: String) {
            var placement = current[id]!
            guard let file = placement.file else { return }
            ops.append(.rename(from: file, to: to, optional: false))
            release(placement)
            placement.file = to
            current[id] = placement
            claim(placement, id)
        }

        // something else sits where this page is going, it steps aside to a hidden name until its own turn
        func makeRoom(_ path: String, _ id: String) {
            guard let other = owner[lower(path)], !other.jsEquals(id) else { return }
            let placement = current[other]!
            let temp = Paths.joinPath(Paths.dirname(placement.folder), ".morrow-move-\(other)-\(Paths.basename(placement.folder))")
            let ext = placement.file.map { JSText.string($0.units[placement.folder.utf16.count...]) } ?? ""
            moveFolder(other, temp)
            if current[other]!.file != nil { moveFile(other, temp + ext) }
        }

        let moving = next.filter { id, target in
            guard let before = previous[id] else { return false }
            if !before.folder.jsEquals(target.folder) { return true }
            if let a = before.file, let b = target.file, !a.jsEquals(b) { return true }
            return false
        }.jsSorted { depth($0.value.folder) - depth($1.value.folder) }

        for (id, target) in moving {
            if !current[id]!.folder.jsEquals(target.folder) {
                makeRoom(target.folder, id)
                moveFolder(id, target.folder)
            }
            if let file = current[id]!.file, let wanted = target.file, !file.jsEquals(wanted) {
                makeRoom(wanted, id)
                moveFile(id, wanted)
            }
        }
        return ops
    }

    /// what a list of applied operations did to the layout, used to keep track after a partial failure
    static func replayRename(_ layout: inout VaultLayout.Map, _ from: String, _ to: String) {
        let prefix = (from + "/").units
        func move(_ path: String) -> String {
            if path.jsEquals(from) { return to }
            let units = path.units
            return JSText.startsWith(units, prefix) ? to + JSText.string(units[from.utf16.count...]) : path
        }
        for id in layout.keys {
            let placement = layout[id]!
            let folder = move(placement.folder)
            let file = placement.file.map(move)
            if !folder.jsEquals(placement.folder) || !same(file, placement.file) { layout[id] = Placement(file: file, folder: folder) }
        }
    }
}
