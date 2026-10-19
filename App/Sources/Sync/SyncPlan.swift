import Foundation

/// Path to a hash of the file's bytes, as Morrow's sync `Manifest`.
typealias SyncManifest = [String: String]

/// What one pull does to this vault, as Morrow's `SyncAction`.
nonisolated enum SyncAction: Equatable, Sendable {
    case download(path: String, hash: String)
    /// Both sides changed the file and theirs wins the name; ours is first kept beside it as `copy`.
    case conflict(path: String, hash: String, copy: String)
    case delete(path: String, hash: String)
}

/// The actions of a pull and what both sides agree on once they are done, saved as the base for next time.
nonisolated struct SyncPlan: Equatable, Sendable {
    var actions: [SyncAction]
    var base: SyncManifest
}

/// Morrow's `core/sync.ts`, the rules both computers follow to pull from each other without a server.
nonisolated enum SyncRules {
    /// Morrow's own bookkeeping that is shared, keeping this computer's copy when both changed.
    static let keepLocal: Set<String> = [".morrow/workspace.json", ".morrow/review.json"]

    /// Files every computer shares: pages, attachments, the trash and the shared part of Morrow's
    /// bookkeeping. Other hidden folders belong to other tools, history and sync state stay per computer.
    static func isSynced(_ path: String) -> Bool {
        if path.isEmpty || path.contains(".morrow-tmp-") || path.contains(".morrow-move-") { return false }
        if keepLocal.contains(path) { return true }
        let parts = path.split(separator: "/", omittingEmptySubsequences: false)
        return !parts.enumerated().contains { index, part in part.hasPrefix(".") && !(index == 0 && part == ".trash") }
    }

    /// The name this computer's version keeps when the other computer's takes the file's name.
    static func conflictName(_ path: String, device: String, date: Date, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        let day = String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
        let ext = MorrowPath.extension(path)
        let stem = MorrowPath.basename(MorrowPath.stripExtension(path))
        let refused = Set("<>:\"/\\|?*#^[]")
        let cleaned = String(device.map { refused.contains($0) ? " " : $0 }).trimmingCharacters(in: .whitespacesAndNewlines)
        let safeDevice = cleaned.isEmpty ? "another computer" : String(cleaned.prefix(40))
        return MorrowPath.join(MorrowPath.dirname(path), "\(stem) (conflict from \(safeDevice) \(day))\(ext.isEmpty ? "" : ".\(ext)")")
    }

    /// One pull: `local` and `remote` are now, `base` is what both had after the last sync, `device` names
    /// this computer.
    static func planPull(local: SyncManifest, remote: SyncManifest, base: SyncManifest, device: String, now: Date) -> SyncPlan {
        var actions: [SyncAction] = []
        var next: SyncManifest = [:]
        let paths = Set(local.keys).union(remote.keys).union(base.keys)
        var taken = Set(local.keys.map { $0.lowercased() })
        // javascript's sort, by utf-16 code units
        for path in paths.sorted(by: { $0.utf16.lexicographicallyPrecedes($1.utf16) }) {
            guard isSynced(path) else { continue }
            let l = local[path]
            let r = remote[path]
            let b = base[path]
            if l == r {
                if let l { next[path] = l }
                continue
            }
            let remoteChanged = r != b
            let localChanged = l != b
            if remoteChanged && !localChanged {
                // only the other side changed it, take theirs
                if let r {
                    actions.append(.download(path: path, hash: r))
                    next[path] = r
                } else if let l {
                    actions.append(.delete(path: path, hash: l))
                }
                continue
            }
            if !remoteChanged && localChanged {
                // only this side changed it, the other side picks it up when it pulls
                if let b { next[path] = b }
                continue
            }
            // both changed it differently
            guard let r else { continue } // deleted there, edited here: the edit wins
            guard let l else {
                // deleted here, edited there: the edit wins
                actions.append(.download(path: path, hash: r))
                next[path] = r
                continue
            }
            if keepLocal.contains(path) {
                if let b { next[path] = b }
                continue
            }
            // both computers pick the same winner without talking: the larger hash keeps the name, and
            // whichever computer loses saves its own version as a copy named after itself
            if l.utf16.lexicographicallyPrecedes(r.utf16) {
                var copy = conflictName(path, device: device, date: now)
                var n = 2
                while taken.contains(copy.lowercased()) {
                    copy = conflictName(path, device: "\(device) \(n)", date: now)
                    n += 1
                }
                taken.insert(copy.lowercased())
                actions.append(.conflict(path: path, hash: r, copy: copy))
                next[path] = r
            } else if let b {
                next[path] = b
            }
        }
        return SyncPlan(actions: actions, base: next)
    }
}

/// Morrow's `core/vault/paths.ts` helpers for vault paths, which always use forward slashes.
nonisolated enum MorrowPath {
    static func dirname(_ path: String) -> String {
        guard let index = path.lastIndex(of: "/") else { return "" }
        return String(path[..<index])
    }

    static func basename(_ path: String) -> String {
        guard let index = path.lastIndex(of: "/") else { return path }
        return String(path[path.index(after: index)...])
    }

    /// The extension in lower case, empty for names without one or that start with their only dot.
    static func `extension`(_ path: String) -> String {
        let name = basename(path)
        guard let dot = name.lastIndex(of: "."), dot > name.startIndex else { return "" }
        return name[name.index(after: dot)...].lowercased()
    }

    static func stripExtension(_ path: String) -> String {
        let name = basename(path)
        guard let dot = name.lastIndex(of: "."), dot > name.startIndex else { return path }
        let suffix = name.distance(from: dot, to: name.endIndex)
        return String(path.dropLast(suffix))
    }

    static func join(_ parts: String...) -> String {
        parts.filter { !$0.isEmpty }.joined(separator: "/")
    }
}
