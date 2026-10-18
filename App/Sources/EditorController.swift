import Foundation
import Observation
import os
import WebKit
#if os(macOS)
import AppKit
#endif

/// Owns the editor web page and the open vault. The page runs Morrow's workspace session; this side does
/// the file work it asks for, draws the page list it reports and sends it the changes native screens make.
@Observable
final class EditorController: WorkspaceService {
    enum Phase: Equatable {
        /// No vault chosen yet, or the chosen one could not be opened.
        case choosing(reason: String?)
        case opening
        case ready
    }

    enum SaveState: Equatable {
        case saved, pending, saving
        case failed(String)
    }

    private(set) var phase: Phase = .opening
    private(set) var workspace = Workspace()
    private(set) var saveState: SaveState = .saved
    private(set) var vaultName: String?
    private(set) var isPageReady = false
    private(set) var recents: [VaultLocation.RecentVault] = []
    var selection: String?
    /// The trash screen is showing instead of a page.
    var showingTrash = false

    /// What the sidebar has selected: a page or the trash.
    enum SidebarItem: Hashable {
        case page(String)
        case trash
    }

    var sidebarItem: SidebarItem? {
        get { showingTrash ? .trash : selection.map(SidebarItem.page) }
        set {
            switch newValue {
            case .trash: showTrash()
            case .page(let id): selection = id
            case nil:
                selection = nil
                showingTrash = false
            }
        }
    }
    /// Pages whose subpages the sidebar shows, kept per vault.
    var expanded: Set<String> = [] {
        didSet { saveExpanded() }
    }
    var fileRequest: FileInputPresenter.Request?
    /// The page whose icon is being chosen.
    var iconPage: String?
    /// The page being moved with Move to….
    var movingPage: String?
    /// The folder picker for Open Folder… is showing.
    var choosingFolder = false

    @ObservationIgnored let page: WebPage
    @ObservationIgnored var openURL: (URL) -> Void = { _ in }
    @ObservationIgnored private let location: VaultLocation
    @ObservationIgnored private let access = VaultAccess()
    @ObservationIgnored private let fileInput = FileInputPresenter()
    @ObservationIgnored private var opened: VaultLocation.Opened?
    @ObservationIgnored private var rpc: VaultRPC?
    @ObservationIgnored private var watcher: VaultWatcher?
    @ObservationIgnored private var darkMode = false
    @ObservationIgnored private var navigationWatch: Task<Void, Never>?
    @ObservationIgnored private let logger = Logger(subsystem: "com.synapsenote.native", category: "editor")

    init(location: VaultLocation = VaultLocation()) {
        self.location = location
        let root = Bundle.main.resourceURL!.appending(path: "Editor")
        var configuration = WebPage.Configuration()
        // nothing the editor shows is kept between launches, the vault folder is the only storage
        configuration.websiteDataStore = .nonPersistent()
        configuration.urlSchemeHandlers[URLScheme(EditorSchemeHandler.scheme)!] = EditorSchemeHandler(root: root)
        configuration.urlSchemeHandlers[URLScheme(VaultSchemeHandler.scheme)!] = VaultSchemeHandler(access: access)
        let box = EventBox()
        configuration.userContentController.add(EditorMessageHandler { event in box.receive?(event) }, name: EditorMessageHandler.name)
        page = WebPage(configuration: configuration, navigationDecider: EditorNavigationDecider(), dialogPresenter: fileInput)
        #if DEBUG
        page.isInspectable = true
        #endif
        box.receive = { [weak self] event in self?.handle(event) }
        fileInput.onRequest = { [weak self] request in self?.fileRequest = request }
        recents = location.recents
        restoreVault()
    }

    // MARK: vault

    private func restoreVault() {
        do {
            if let opened = try location.open() {
                use(opened)
            } else {
                phase = .choosing(reason: nil)
            }
        } catch {
            phase = .choosing(reason: error.localizedDescription)
        }
        recents = location.recents
    }

    /// A folder picked in the file importer, opened in place of the current vault.
    func choose(folder url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            try location.remember(folder: url)
        } catch {
            phase = .choosing(reason: "The folder could not be opened: \(error.localizedDescription)")
            return
        }
        Task { await switchVault() }
    }

    /// Makes a new vault: a folder the person confirms on macOS, the app's documents folder on iOS.
    func createVault() async {
        #if os(macOS)
        guard let url = await VaultLocation.chooseNewFolder() else { return }
        // the panel's url carries the access the person granted; it is held while the folder is made and remembered
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            try location.remember(folder: url)
        } catch {
            phase = .choosing(reason: "The folder could not be created: \(error.localizedDescription)")
            return
        }
        #else
        location.rememberAppDocuments()
        #endif
        await switchVault()
    }

    /// Opens a vault from the recent list.
    func open(recent vault: VaultLocation.RecentVault) {
        location.select(vault)
        Task { await switchVault() }
    }

    /// Saves what is waiting in the current vault, then opens the remembered one in a fresh editor page.
    private func switchVault() async {
        if phase == .ready { await flush() }
        close()
        selection = nil
        showingTrash = false
        workspace = Workspace()
        isPageReady = false
        restoreVault()
        if case .opening = phase { reloadPage() }
    }

    private func use(_ opened: VaultLocation.Opened) {
        close()
        self.opened = opened
        vaultName = opened.name
        expanded = Set(location.defaults.stringArray(forKey: expandedKey) ?? [])
        let watcher = VaultWatcher(root: opened.url) { [weak self] paths in
            Task { @MainActor in self?.report(paths) }
        }
        #if os(macOS)
        let files = VaultFileSystem(root: opened.url)
        #else
        let files = VaultFileSystem(root: opened.url, presenter: watcher)
        #endif
        access.set(files)
        rpc = VaultRPC(files: files)
        self.watcher = watcher
        watcher.start()
        phase = .opening
        start()
        openInPage()
    }

    private func close() {
        watcher?.stop()
        watcher = nil
        rpc = nil
        access.set(nil)
        opened?.close()
        opened = nil
    }

    private var expandedKey: String {
        "expanded:\(opened?.url.standardizedFileURL.path(percentEncoded: false) ?? "")"
    }

    private func saveExpanded() {
        guard opened != nil else { return }
        location.defaults.set(Array(expanded), forKey: expandedKey)
    }

    private func report(_ paths: Set<String>) {
        guard let files = access.files else { return }
        let changes = files.describe(paths)
        if !changes.isEmpty { send(.vaultChanges(changes)) }
    }

    /// Looks for edits made while the app was away, for writers that do not use file coordination.
    func checkForOutsideChanges() {
        watcher?.checkForChanges()
    }

    private func openInPage() {
        guard isPageReady, let vaultName, phase == .opening else { return }
        send(.openVault(name: vaultName))
    }

    // MARK: page

    func start() {
        guard page.url == nil else { return }
        reloadPage()
    }

    /// Loads the editor page afresh and watches for its web content process ending.
    private func reloadPage() {
        isPageReady = false
        page.load(URLRequest(url: EditorSchemeHandler.entry))
        navigationWatch?.cancel()
        navigationWatch = Task { [weak self, page] in
            do {
                for try await _ in page.navigations {}
            } catch WebPage.NavigationError.webContentProcessTerminated {
                self?.recoverFromTermination()
            } catch {}
        }
    }

    /// The system ended the page's process, which also held the vault session; the page and the vault are
    /// opened again and the same page is shown.
    private func recoverFromTermination() {
        logger.error("editor web content process ended, reopening the vault")
        guard opened != nil else { return }
        phase = .opening
        workspace = Workspace()
        reloadPage()
    }

    func setDarkMode(_ dark: Bool) {
        darkMode = dark
        send(.theme(dark: dark))
    }

    /// The page decides what it can show: a page made a moment ago may not be in this side's list yet.
    func showSelection() {
        guard phase == .ready else { return }
        if selection != nil { showingTrash = false }
        send(.show(pageId: showingTrash ? nil : selection))
    }

    func showTrash() {
        selection = nil
        showingTrash = true
        send(.show(pageId: nil))
    }

    // MARK: WorkspaceService

    func perform(_ command: WorkspaceCommand) {
        send(.command(command.morrow()))
        if case .move(_, let parent?, _) = command { expanded.insert(parent) }
    }

    func createPage(parent: String? = nil) {
        if let parent { expanded.insert(parent) }
        send(.createPage(parentId: parent))
    }

    func trash(_ pageId: String) {
        send(.trashPage(pageId: pageId))
    }

    func duplicate(_ pageId: String) {
        let copy = UUID().uuidString.lowercased()
        perform(.duplicate(id: pageId, newId: copy))
        selection = copy
        showSelection()
    }

    #if os(macOS)
    /// Shows the page's file in Finder.
    func reveal(_ pageId: String) {
        guard let root = opened?.url else { return }
        Task {
            guard let path = try? await page.callJavaScript("return window.synapse.pathOf(id)", arguments: ["id": pageId]) as? String
            else { return }
            NSWorkspace.shared.activateFileViewerSelecting([root.appending(path: path)])
        }
    }
    #endif

    /// Writes every edit still waiting, such as before the app quits. Returns false when something stayed unsaved.
    @discardableResult
    func flush() async -> Bool {
        guard isPageReady, phase == .ready else { return true }
        do {
            let result = try await page.callJavaScript("return await window.synapse.flush()")
            return (result as? Bool) ?? false
        } catch {
            logger.error("saving before leaving failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    func handle(_ event: EditorEvent) {
        switch event {
        case .ready:
            logger.info("editor page is ready")
            isPageReady = true
            send(.theme(dark: darkMode))
            openInPage()
        case .rpc(let id, let method, let params):
            guard let rpc else {
                send(.rpcResult(id: id, result: .failure(.init(message: "No folder is open."))))
                return
            }
            rpc.handle(method: method, params: params) { [weak self] result in
                Task { @MainActor in self?.send(.rpcResult(id: id, result: result)) }
            }
        case .workspace(let pages, let state, let error):
            workspace = Workspace(pages: pages)
            saveState = switch state {
            case "pending": .pending
            case "saving": .saving
            case "error": .failed(error ?? "Changes could not be saved.")
            default: .saved
            }
            if phase == .opening {
                phase = .ready
                logger.info("vault opened with \(pages.count) pages")
                if selection == nil || !workspace.isShowable(selection!) {
                    selection = showingTrash ? nil : workspace.rows(expanded: expanded).first?.id
                }
                showSelection()
            } else if let selection, workspace.infos[selection] != nil, !workspace.isShowable(selection) {
                self.selection = nil
            }
        case .openPage(let pageId):
            if let pageId { for ancestor in workspace.ancestors(of: pageId) { expanded.insert(ancestor.id) } }
            selection = pageId
            showSelection()
        case .chooseIcon(let pageId):
            iconPage = pageId
        case .vaultFailed(let message):
            logger.error("vault failed: \(message, privacy: .public)")
            close()
            location.forget()
            phase = .choosing(reason: message)
        case .openExternal(let url):
            openURL(url)
        case .log(let level, let message):
            if level == "error" { logger.error("editor: \(message, privacy: .public)") }
            else { logger.warning("editor: \(message, privacy: .public)") }
        }
    }

    private func send(_ command: EditorCommand) {
        guard isPageReady,
              let data = try? JSONEncoder().encode(command.json),
              let json = String(data: data, encoding: .utf8)
        else { return }
        Task { [page, logger] in
            do {
                _ = try await page.callJavaScript("window.synapse.receive(JSON.parse(json))", arguments: ["json": json])
            } catch {
                logger.error("sending to the editor failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }
}

/// Holds the event closure until the controller exists, the message handler is created first.
private final class EventBox {
    var receive: ((EditorEvent) -> Void)?
}

/// The editor page stays on its own bundle. Links are opened by the app through the bridge.
private struct EditorNavigationDecider: WebPage.NavigationDeciding {
    func decidePolicy(for action: WebPage.NavigationAction, preferences: inout WebPage.NavigationPreferences) async -> WKNavigationActionPolicy {
        action.request.url?.scheme == EditorSchemeHandler.scheme ? .allow : .cancel
    }
}
