import Foundation
import Observation
import os
import WebKit

/// Owns the editor web page and the open vault. The page runs Morrow's workspace session; this side does
/// the file work it asks for and draws the page list it reports.
@Observable
final class EditorController {
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
    var selection: String?
    var fileRequest: FileInputPresenter.Request?

    @ObservationIgnored let page: WebPage
    @ObservationIgnored var openURL: (URL) -> Void = { _ in }
    @ObservationIgnored private let location: VaultLocation
    @ObservationIgnored private let access = VaultAccess()
    @ObservationIgnored private let fileInput = FileInputPresenter()
    @ObservationIgnored private var opened: VaultLocation.Opened?
    @ObservationIgnored private var rpc: VaultRPC?
    @ObservationIgnored private var watcher: VaultWatcher?
    @ObservationIgnored private var darkMode = false
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
    }

    /// A folder picked in the file importer.
    func choose(folder url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            try location.remember(folder: url)
            restoreVault()
        } catch {
            phase = .choosing(reason: "The folder could not be opened: \(error.localizedDescription)")
        }
    }

    /// Makes a new vault: a folder the person confirms on macOS, the app's documents folder on iOS.
    func createVault() async {
        #if os(macOS)
        guard let url = await VaultLocation.chooseNewFolder() else { return }
        do {
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            try location.remember(folder: url)
            restoreVault()
        } catch {
            phase = .choosing(reason: "The folder could not be created: \(error.localizedDescription)")
        }
        #else
        location.rememberAppDocuments()
        restoreVault()
        #endif
    }

    private func use(_ opened: VaultLocation.Opened) {
        close()
        self.opened = opened
        vaultName = opened.name
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
        page.load(URLRequest(url: EditorSchemeHandler.entry))
    }

    func setDarkMode(_ dark: Bool) {
        darkMode = dark
        send(.theme(dark: dark))
    }

    func showSelection() {
        guard phase == .ready else { return }
        send(.show(pageId: selection.flatMap { workspace.isShowable($0) ? $0 : nil }))
    }

    func createPage(parent: String? = nil) {
        send(.createPage(parentId: parent))
    }

    func trash(_ pageId: String) {
        send(.trashPage(pageId: pageId))
    }

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
            workspace.pages = pages
            saveState = switch state {
            case "pending": .pending
            case "saving": .saving
            case "error": .failed(error ?? "Changes could not be saved.")
            default: .saved
            }
            if phase == .opening {
                phase = .ready
                logger.info("vault opened with \(pages.count) pages")
                if selection == nil || !workspace.isShowable(selection!) { selection = workspace.rows.first?.id }
                showSelection()
            } else if let selection, !workspace.isShowable(selection) {
                self.selection = nil
            }
        case .openPage(let pageId):
            selection = pageId
            showSelection()
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
