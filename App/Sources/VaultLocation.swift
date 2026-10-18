import Foundation
#if os(macOS)
import AppKit
#endif

/// Where the vault is, remembered between launches.
/// A folder the person picked is kept as a security-scoped bookmark; on iOS and iPadOS the vault can
/// also be the app's own documents folder, which the Files app shows.
struct VaultLocation {
    private static let kindKey = "vault.kind"
    private static let bookmarkKey = "vault.bookmark"

    enum Failure: Error, LocalizedError {
        case unreachable(String)

        var errorDescription: String? {
            switch self {
            case .unreachable(let reason): reason
            }
        }
    }

    /// An opened vault folder; `close()` gives up the access it holds.
    struct Opened {
        let url: URL
        let scoped: Bool
        /// The app's own documents folder is named after the app rather than "Documents".
        var appFolder = false

        var name: String { appFolder ? "SynapseNote" : url.lastPathComponent }

        func close() {
            if scoped { url.stopAccessingSecurityScopedResource() }
        }
    }

    let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    var isSet: Bool { defaults.string(forKey: Self.kindKey) != nil }

    /// Opens the remembered vault, nil when none was chosen yet.
    func open() throws -> Opened? {
        #if DEBUG
        // debug builds only: `-SynapseNoteDebugVault <folder>` opens a test vault without a file panel;
        // the folder must be one the sandbox already allows, such as the app container
        if let path = defaults.string(forKey: "SynapseNoteDebugVault") {
            let url = URL(filePath: path, directoryHint: .isDirectory)
            guard Self.isFolder(url) else { throw Failure.unreachable("\(path) is not a folder.") }
            return Opened(url: url, scoped: false)
        }
        #endif
        switch defaults.string(forKey: Self.kindKey) {
        case "appDocuments":
            return Opened(url: try Self.appDocuments(), scoped: false, appFolder: true)
        case "bookmark":
            guard let data = defaults.data(forKey: Self.bookmarkKey) else { return nil }
            var stale = false
            let url: URL
            do {
                url = try URL(resolvingBookmarkData: data, options: Self.resolveOptions, relativeTo: nil, bookmarkDataIsStale: &stale)
            } catch {
                throw Failure.unreachable("The folder could not be found. It may have been moved, renamed or deleted.")
            }
            let scoped = url.startAccessingSecurityScopedResource()
            guard Self.isFolder(url) else {
                if scoped { url.stopAccessingSecurityScopedResource() }
                throw Failure.unreachable("\(url.lastPathComponent) is no longer available.")
            }
            if stale { try? remember(folder: url) }
            return Opened(url: url, scoped: scoped)
        default:
            return nil
        }
    }

    /// Remembers a folder the person picked. The caller must already have access to it.
    func remember(folder url: URL) throws {
        let data = try url.bookmarkData(options: Self.bookmarkOptions, includingResourceValuesForKeys: nil, relativeTo: nil)
        defaults.set(data, forKey: Self.bookmarkKey)
        defaults.set("bookmark", forKey: Self.kindKey)
        addRecent(RecentVault(name: url.lastPathComponent, path: url.standardizedFileURL.path(percentEncoded: false), bookmark: data))
    }

    func rememberAppDocuments() {
        defaults.removeObject(forKey: Self.bookmarkKey)
        defaults.set("appDocuments", forKey: Self.kindKey)
        addRecent(RecentVault(name: "SynapseNote", path: Self.appDocumentsMarker, bookmark: nil))
    }

    // MARK: recent vaults

    private static let recentsKey = "vault.recents"
    private static let appDocumentsMarker = "app-documents"
    static let recentLimit = 5

    /// A vault opened before, newest first in `recents`.
    struct RecentVault: Codable, Hashable, Identifiable {
        let name: String
        /// The folder's path when it was opened, used to tell vaults apart; the bookmark is what reopens it.
        let path: String
        let bookmark: Data?

        var id: String { path }
        var isAppDocuments: Bool { path == VaultLocation.appDocumentsMarker }
    }

    var recents: [RecentVault] {
        guard let data = defaults.data(forKey: Self.recentsKey) else { return [] }
        return (try? PropertyListDecoder().decode([RecentVault].self, from: data)) ?? []
    }

    private func addRecent(_ vault: RecentVault) {
        var list = recents.filter { $0.path != vault.path }
        list.insert(vault, at: 0)
        if let data = try? PropertyListEncoder().encode(Array(list.prefix(Self.recentLimit))) {
            defaults.set(data, forKey: Self.recentsKey)
        }
    }

    /// Makes a recent vault the one to open next.
    func select(_ vault: RecentVault) {
        if vault.isAppDocuments {
            rememberAppDocuments()
        } else if let bookmark = vault.bookmark {
            defaults.set(bookmark, forKey: Self.bookmarkKey)
            defaults.set("bookmark", forKey: Self.kindKey)
            addRecent(vault)
        }
    }

    func removeRecent(_ vault: RecentVault) {
        let list = recents.filter { $0.path != vault.path }
        if let data = try? PropertyListEncoder().encode(list) { defaults.set(data, forKey: Self.recentsKey) }
    }

    func forget() {
        defaults.removeObject(forKey: Self.bookmarkKey)
        defaults.removeObject(forKey: Self.kindKey)
    }

    static func appDocuments() throws -> URL {
        try FileManager.default.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    }

    static func isFolder(_ url: URL) -> Bool {
        (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
    }

    #if os(macOS)
    private static let bookmarkOptions: URL.BookmarkCreationOptions = .withSecurityScope
    private static let resolveOptions: URL.BookmarkResolutionOptions = .withSecurityScope

    /// The person's real Documents folder; inside the sandbox the usual lookups return the app container.
    static func userDocuments() -> URL {
        if let entry = getpwuid(getuid()), let home = entry.pointee.pw_dir {
            return URL(filePath: String(cString: home), directoryHint: .isDirectory).appending(path: "Documents")
        }
        return FileManager.default.homeDirectoryForCurrentUser.appending(path: "Documents")
    }

    /// Asks where to make a new vault folder, Documents/SynapseNote unless the person picks elsewhere.
    /// The sandbox only lets the app write where the person confirmed in this panel.
    @MainActor
    static func chooseNewFolder() async -> URL? {
        let panel = NSSavePanel()
        panel.title = "New SynapseNote Folder"
        panel.prompt = "Create"
        panel.nameFieldLabel = "Folder name:"
        panel.nameFieldStringValue = "SynapseNote"
        panel.directoryURL = userDocuments()
        panel.canCreateDirectories = true
        panel.showsTagField = false
        guard await panel.begin() == .OK, let url = panel.url else { return nil }
        return url
    }
    #else
    private static let bookmarkOptions: URL.BookmarkCreationOptions = .minimalBookmark
    private static let resolveOptions: URL.BookmarkResolutionOptions = []
    #endif
}
