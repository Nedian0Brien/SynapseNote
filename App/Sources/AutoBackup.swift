import Foundation
#if os(macOS)
import AppKit
#endif

/// Morrow's automatic backups on the desktop: a JSON copy of the pages in the app's own folder, the newest
/// twenty kept, as `writeBackup` in Morrow's `electron/main.cts` does.
nonisolated enum AutoBackup {
    static let keep = 20
    /// Morrow's limit for one backup.
    static let maximumBytes = 512 * 1024 * 1024
    static let prefix = "synapsenote-backup-"

    enum Failure: LocalizedError {
        case tooLarge
        var errorDescription: String? { "Invalid backup data." }
    }

    /// Backups in the app's Application Support folder.
    static var folder: URL {
        URL.applicationSupportDirectory.appending(path: "Backups", directoryHint: .isDirectory)
    }

    /// The time in a backup's name, as Morrow's: the ISO date with colons and dots made dashes.
    static func stamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter.string(from: date).replacingOccurrences(of: ":", with: "-").replacingOccurrences(of: ".", with: "-")
    }

    /// Writes to a temporary file first so a crash never leaves half a backup, then removes the oldest ones
    /// beyond twenty. Returns where it was written.
    @discardableResult
    static func write(_ json: String, in folder: URL = folder, at date: Date = Date()) throws -> URL {
        let data = Data(json.utf8)
        guard data.count <= maximumBytes else { throw Failure.tooLarge }
        let files = FileManager.default
        try files.createDirectory(at: folder, withIntermediateDirectories: true)
        let target = folder.appending(path: "\(prefix)\(stamp(date)).json")
        let temporary = folder.appending(path: target.lastPathComponent + ".tmp")
        try data.write(to: temporary)
        if files.fileExists(atPath: target.path(percentEncoded: false)) { try files.removeItem(at: target) }
        try files.moveItem(at: temporary, to: target)
        let backups = try files.contentsOfDirectory(atPath: folder.path(percentEncoded: false))
            .filter { $0.hasPrefix(prefix) && $0.hasSuffix(".json") }
            .sorted()
        for old in backups.dropLast(keep) {
            try? files.removeItem(at: folder.appending(path: old))
        }
        return target
    }
}

#if os(macOS)
extension AutoBackup {
    /// Opens the backups folder in Finder, made first when no backup has been written yet.
    @MainActor
    static func reveal() {
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        NSWorkspace.shared.open(folder)
    }
}
#endif
