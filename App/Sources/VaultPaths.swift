import Foundation

/// Vault paths are relative to the vault folder and use forward slashes. The rules follow
/// `resolveInVault`, `isHidden` and `isPage` in Morrow's `electron/vault.cts`.
nonisolated enum VaultPaths {
    /// Files Morrow writes beside a target before renaming it into place.
    static let tempMark = ".morrow-tmp-"
    static let morrowDir = ".morrow"
    static let trashDir = ".trash"
    static let maxFiles = 200_000
    static let maxDepth = 64
    static let maxTextBytes = 32 * 1024 * 1024
    static let maxFileBytes = 1024 * 1024 * 1024

    enum Failure: Error, Equatable, LocalizedError {
        case invalid
        case outside

        var errorDescription: String? {
            switch self {
            case .invalid: "Invalid path."
            case .outside: "That path is outside the vault."
            }
        }
    }

    /// Hidden folders belong to other tools or to Morrow's bookkeeping, only the vault's own trash shows.
    static func isHidden(_ relative: String) -> Bool {
        relative.split(separator: "/").enumerated().contains { index, part in
            part.hasPrefix(".") && !(index == 0 && part == trashDir)
        }
    }

    static func isPage(_ relative: String) -> Bool {
        let lower = relative.lowercased()
        return lower.hasSuffix(".md") || lower.hasSuffix(".canvas")
    }

    /// The absolute location of a vault path, refusing anything that would leave the vault.
    static func resolve(_ relative: String, in root: URL) throws -> URL {
        guard !relative.isEmpty, relative.utf8.count <= 4096, !relative.contains("\0"),
              !relative.hasPrefix("/"), !relative.contains("\\")
        else { throw Failure.invalid }
        let base = root.standardizedFileURL
        let absolute = base.appending(path: relative).standardizedFileURL
        let basePath = base.path(percentEncoded: false).trimmingSuffix("/")
        let path = absolute.path(percentEncoded: false).trimmingSuffix("/")
        guard path == basePath || path.hasPrefix(basePath + "/") else { throw Failure.outside }
        return absolute
    }

    /// Writes must not follow a link out of the vault: the nearest existing folder has to resolve inside it.
    static func checkReal(_ absolute: URL, in root: URL) throws {
        let fileManager = FileManager.default
        var folder = absolute.deletingLastPathComponent()
        while !fileManager.fileExists(atPath: folder.path(percentEncoded: false)), folder.pathComponents.count > 1 {
            folder = folder.deletingLastPathComponent()
        }
        let real = folder.resolvingSymlinksInPath().path(percentEncoded: false).trimmingSuffix("/")
        let realRoot = root.resolvingSymlinksInPath().path(percentEncoded: false).trimmingSuffix("/")
        guard real == realRoot || real.hasPrefix(realRoot + "/") else { throw Failure.outside }
    }

    /// The vault path of a location inside the vault.
    static func relative(_ absolute: URL, to root: URL) -> String {
        let base = root.standardizedFileURL.path(percentEncoded: false).trimmingSuffix("/")
        // folder urls end with a slash, vault paths never do
        let path = absolute.standardizedFileURL.path(percentEncoded: false).trimmingSuffix("/")
        return path.hasPrefix(base + "/") ? String(path.dropFirst(base.count + 1)) : path
    }
}

extension String {
    nonisolated func trimmingSuffix(_ suffix: String) -> String {
        hasSuffix(suffix) && count > suffix.count ? String(dropLast(suffix.count)) : self
    }
}
