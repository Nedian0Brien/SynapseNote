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
    /// Counts the page's workspace reports, saves included, for screens that ask again when anything changes.
    private(set) var revision = 0
    private(set) var saveState: SaveState = .saved
    private(set) var vaultName: String?
    private(set) var isPageReady = false
    private(set) var recents: [VaultLocation.RecentVault] = []
    /// The open tabs, kept per vault. The open tab's place is what the main column shows.
    private(set) var tabs = TabList() {
        didSet { saveTabs() }
    }

    var destination: Destination { tabs.active.destination }
    /// The page on screen.
    var selection: String? { destination.pageId }
    var showingTrash: Bool { destination == .trash }

    /// What the sidebar has selected. Choosing nothing keeps the place, a list can clear its selection.
    var sidebarItem: Destination? {
        get { destination }
        set {
            guard let newValue else { return }
            if newValue != destination { go(to: newValue) } else { detailRequests += 1 }
        }
    }
    /// Counts choices of the place already shown, so a one column layout still moves to it.
    private(set) var detailRequests = 0
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
    /// Search and commands, over the main column.
    var showingPalette = false
    var showingShortcuts = false
    /// The open page's outline and links beside it.
    var showingInspector = false
    /// The template list for New Page from Template.
    var choosingTemplate = false
    /// The person hid the sidebar.
    var sidebarHidden = false
    /// The page alone, without sidebar, tabs or inspector, as Morrow's focus mode.
    var focusMode = false

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
    /// Text to select in the page shown next.
    @ObservationIgnored private var pendingFind: String?
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
        tabs = TabList.restore(location.defaults.data(forKey: tabsKey)) ?? TabList()
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

    private var tabsKey: String {
        "tabs:\(opened?.url.standardizedFileURL.path(percentEncoded: false) ?? "")"
    }

    private func saveTabs() {
        guard opened != nil, let data = try? JSONEncoder().encode(tabs) else { return }
        location.defaults.set(data, forKey: tabsKey)
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

    // MARK: places and tabs

    /// The open tab goes to a place; `find` is text to select in the page.
    func go(to destination: Destination, find: String? = nil) {
        tabs.navigate(to: destination)
        pendingFind = find
        showDestination()
    }

    func openInNewTab(_ destination: Destination, find: String? = nil) {
        tabs.open(destination)
        pendingFind = find
        showDestination()
    }

    func newTab() { openInNewTab(.home) }

    /// Closes a tab, the open one when none is named. Returns false for the last tab, which stays.
    @discardableResult
    func closeTab(_ id: String? = nil) -> Bool {
        let wasActive = id == nil || id == tabs.activeId
        guard tabs.close(id) else { return false }
        if wasActive { settleActiveTab() }
        return true
    }

    func activateTab(_ id: String) {
        guard id != tabs.activeId else { return }
        tabs.activate(id)
        settleActiveTab()
    }

    func stepTab(_ direction: Int) {
        guard tabs.tabs.count > 1 else { return }
        tabs.step(direction)
        settleActiveTab()
    }

    func moveTab(_ id: String, to position: Int) {
        tabs.move(id, to: position)
    }

    /// A tab kept on a page that has since gone to the trash or been deleted opens Home instead.
    private func settleActiveTab() {
        if case .page(let id) = destination, !workspace.isShowable(id) { tabs.navigate(to: .home) }
        showDestination()
    }

    /// Sends the open tab's place to the page. The page decides what it can show: a page made a moment ago
    /// may not be in this side's list yet.
    func showDestination() {
        guard phase == .ready else { return }
        // the sidebar opens the folders down to the page on screen
        if let id = selection { for ancestor in workspace.ancestors(of: id) { expanded.insert(ancestor.id) } }
        send(.show(pageId: selection, find: pendingFind))
        pendingFind = nil
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
        go(to: .page(copy))
    }

    func search(_ query: String, limit: Int) async -> [SearchHit] {
        await answer(.search(query, limit: limit)) ?? []
    }

    func recentlyOpened(limit: Int) async -> [String] {
        await answer(.recent(limit: limit)) ?? []
    }

    func homeFacts() async -> HomeFacts? {
        await answer(.home)
    }

    func backlinks(of pageId: String) async -> [Backlink] {
        await answer(.backlinks(pageId)) ?? []
    }

    func mentions(of pageId: String) async -> [Mention] {
        await answer(.mentions(pageId)) ?? []
    }

    func outline(of pageId: String) async -> [Heading] {
        await answer(.outline(pageId)) ?? []
    }

    func tags() async -> [TagEntry] {
        await answer(.tags) ?? []
    }

    func pages(tagged tag: String) async -> [String] {
        await answer(.tagPages(tag)) ?? []
    }

    func tasks() async -> [TaskRef] {
        await answer(.tasks) ?? []
    }

    func templates() async -> TemplateList? {
        await answer(.templates)
    }

    func sidebarCounts() async -> SidebarCounts? {
        await answer(.counts)
    }

    // MARK: daily notes and templates, made by morrow's operations in the page, which then opens them

    /// Today's daily note, or the one for a yyyy-mm-dd day.
    func openToday(_ date: String? = nil) {
        send(.openToday(date: date))
    }

    func createPage(fromTemplate templateId: String, parent: String? = nil) {
        if let parent { expanded.insert(parent) }
        send(.createFromTemplate(templateId: templateId, parentId: parent))
    }

    func newTemplate() {
        send(.newTemplate)
    }

    func openTemplates() {
        send(.openTemplates)
    }

    func saveAsTemplate(_ pageId: String) {
        send(.saveAsTemplate(pageId: pageId))
    }

    /// Asks the editor page, which works it out from the workspace session it holds.
    private func answer<T: Decodable>(_ query: WorkspaceQuery) async -> T? {
        guard isPageReady, phase == .ready else { return nil }
        do {
            let answer = try await page.callJavaScript(
                "return window.synapse.query(name, params)",
                arguments: ["name": query.name, "params": query.params]
            )
            return try WorkspaceQuery.decode(answer)
        } catch {
            logger.error("\(query.name, privacy: .public) query failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    // MARK: the page on screen

    func scrollToHeading(_ index: Int) {
        send(.scrollToHeading(index: index))
    }

    func findInPage() {
        send(.find)
    }

    /// Cmd K: the link editor when text is selected in the editor, as there, otherwise search.
    func searchOrLink() async {
        if isPageReady, selection != nil,
           (try? await page.callJavaScript("return window.synapse.linkSelection()")) as? Bool == true {
            return
        }
        showingPalette = true
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

    /// Shows the vault folder in Finder.
    func revealVault() {
        guard let root = opened?.url else { return }
        NSWorkspace.shared.activateFileViewerSelecting([root])
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
            let before = workspace
            workspace = Workspace(pages: pages)
            revision += 1
            saveState = switch state {
            case "pending": .pending
            case "saving": .saving
            case "error": .failed(error ?? "Changes could not be saved.")
            default: .saved
            }
            if phase == .opening {
                phase = .ready
                logger.info("vault opened with \(pages.count) pages")
                settleActiveTab()
            } else if let selection, before.infos[selection] != nil, !workspace.isShowable(selection) {
                // the page on screen went to the trash or was deleted
                go(to: .home)
            }
        case .openPage(let pageId, let newTab, let find):
            let place = pageId.map(Destination.page) ?? .home
            if newTab { openInNewTab(place, find: find) } else { go(to: place, find: find) }
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
        case .shortcut(let name):
            if name == "escape", focusMode { focusMode = false }
        case .openView(let place):
            go(to: place)
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
