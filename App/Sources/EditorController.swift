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
    /// The page whose password is being set.
    var encryptingPage: String?
    /// The person hid the sidebar.
    var sidebarHidden = false
    /// The page alone, without sidebar, tabs or inspector, as Morrow's focus mode.
    var focusMode = false
    /// The page shown as its Markdown source instead of in the editor.
    private(set) var sourceMode: String?
    /// Morrow's toasts as the editor page reports them.
    private(set) var toasts: [EditorToast] = []
    /// Toasts from this side, such as a PDF that could not be made; negative ids keep them apart.
    private(set) var ownToasts: [EditorToast] = []
    var allToasts: [EditorToast] { toasts + ownToasts }
    /// A file waiting for the person to say where it goes.
    var exportFile: ExportFile?
    /// A PDF is being made.
    private(set) var exportingPDF = false
    /// Sync between the person's own devices on the same network.
    let sync = SyncService()
    /// The sync settings, shown as a sheet where there is no Settings window.
    var showingSyncSettings = false
    /// A paired device whose vault is copied into the folder picked next.
    private(set) var copyingVaultFrom: String?
    /// The appearance and the name chosen in the settings.
    let preferences = AppPreferences()
    /// The settings sheet, on iOS; macOS opens its settings window.
    var showingSettings = false
    /// The custom CSS editor, over the settings.
    var editingCustomCss = false
    /// The open vault's custom CSS as saved, nil until the editor page has read it.
    private(set) var customCss: String?
    /// The quick note sheet; asked for before the vault is open, it opens once it is.
    var showingQuickNote = false

    @ObservationIgnored let page: WebPage
    @ObservationIgnored var openURL: (URL) -> Void = { _ in }
    @ObservationIgnored private let location: VaultLocation
    @ObservationIgnored private let access = VaultAccess()
    /// the editor page's copy of the workspace, kept from its state deltas in debug builds and compared with the
    /// Swift session, which is the one that writes the vault
    @ObservationIgnored let mirror = StateMirror()
    /// the open vault's Swift session
    @ObservationIgnored private var host: SessionHost?
    @ObservationIgnored private let fileInput = FileInputPresenter()
    @ObservationIgnored private var opened: VaultLocation.Opened?
    @ObservationIgnored private var rpc: VaultRPC?
    @ObservationIgnored private var watcher: VaultWatcher?
    @ObservationIgnored private var darkMode = false
    @ObservationIgnored private var navigationWatch: Task<Void, Never>?
    /// Text to select in the page shown next.
    @ObservationIgnored private var pendingFind: String?
    @ObservationIgnored private var ownToastCount = 0
    /// A device to pull from once the vault just copied from it is open.
    @ObservationIgnored private var syncWhenOpen: String?
    @ObservationIgnored private var quickNoteWhenOpen = false
    @ObservationIgnored private var afterSettings: (() -> Void)?
    @ObservationIgnored private let editorRoot = Bundle.main.resourceURL!.appending(path: "Editor")
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
        connectSync()
        preferences.changed = { [weak self] in
            guard let self else { return }
            send(.preferences(preferences.json))
        }
    }

    // MARK: sync

    private func connectSync() {
        sync.prepareForSync = { [weak self] in _ = await self?.flush() }
        sync.filesChanged = { [weak self] paths in self?.report(paths) }
        sync.notify = { [weak self] message, error in self?.showToast(message, error: error) }
        Task { await sync.refreshServices() }
    }

    /// Makes the vault open on a paired device a new vault here: the person picks an empty folder, which
    /// becomes a copy of it and fills on the first pull, as Morrow's Copy its vault here.
    func copyVault(from peerId: String) {
        copyingVaultFrom = peerId
        #if os(iOS)
        // the folder picker opens once the sync sheet is gone, a sheet cannot show another from below it
        showingSyncSettings = false
        showingSettings = false
        #else
        choosingFolder = true
        #endif
    }

    /// The settings or sync sheet closed; what was waiting for it, such as a vault copy asking for its folder,
    /// runs now.
    func settingsClosed() {
        let work = afterSettings
        afterSettings = nil
        work?()
        if copyingVaultFrom != nil { choosingFolder = true }
    }

    /// Runs something that shows a file dialog from the settings. On iOS the settings sheet closes first: the
    /// view below a sheet cannot show a dialog of its own.
    func closeSettings(then work: @escaping () -> Void) {
        #if os(iOS)
        afterSettings = work
        showingSettings = false
        #else
        work()
        #endif
    }

    func cancelVaultCopy() {
        copyingVaultFrom = nil
    }

    private func copyVault(from peerId: String, into url: URL) async {
        copyingVaultFrom = nil
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            let vaultId = try await sync.vaultId(of: peerId)
            try SyncVault.prepareCopy(in: url, vaultId: vaultId)
            try location.remember(folder: url)
        } catch {
            showToast(error.localizedDescription, error: true)
            return
        }
        syncWhenOpen = peerId
        await switchVault()
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
        if let peerId = copyingVaultFrom {
            Task { await copyVault(from: peerId, into: url) }
            return
        }
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
        await host?.close()
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
        sync.vault = SyncVault(files: files, name: opened.name)
        let host = SessionHost(
            files: files,
            sendExternal: { [weak self] id, json in self?.send(.external(id: id, json: json)) },
            sendInfo: { [weak self] json in self?.send(.vaultInfo(json: json)) },
            sendResync: { [weak self] json in self?.send(.resync(json: json)) },
        )
        host.begin { [weak self] reason in self?.handle(.vaultFailed(message: reason)) }
        self.host = host
        rpc = VaultRPC(host: host)
        self.watcher = watcher
        watcher.start()
        phase = .opening
        start()
        openInPage()
    }

    private func close() {
        watcher?.stop()
        watcher = nil
        if let host {
            // the session saves what is waiting before it lets go
            Task { await host.close() }
        }
        host = nil
        rpc = nil
        mirror.reset()
        access.set(nil)
        sync.vault = nil
        opened?.close()
        opened = nil
        customCss = nil
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

    /// Paths another app or a sync changed: the Swift session reads them, and the editor page decides what it takes.
    func report(_ paths: Set<String>) {
        host?.changed(paths)
    }

    /// Looks for edits made while the app was away, for writers that do not use file coordination.
    func checkForOutsideChanges() {
        watcher?.checkForChanges()
    }

    private func openInPage() {
        guard isPageReady, let vaultName, phase == .opening else { return }
        // a folder about to be filled from another device never gets the welcome guide, as in morrow
        #if DEBUG
        let compare = true
        #else
        let compare = false
        #endif
        send(.openVault(name: vaultName, guide: syncWhenOpen == nil, compare: compare))
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
        // the Swift session kept every edit the page sent; it saves them, and the page opened again gets it as it is
        host?.webGone()
        if let host { Task { await host.flushAlone() } }
        mirror.reset()
        phase = .opening
        workspace = Workspace()
        reloadPage()
    }

    func setDarkMode(_ dark: Bool) {
        darkMode = dark
        send(.theme(dark: dark))
    }

    /// Morrow's switch light or dark theme, from the one the window shows now.
    func switchTheme() {
        preferences.switchTheme(showingDark: darkMode)
    }

    // MARK: settings

    func previewCss(_ css: String) {
        send(.previewCss(css))
    }

    func saveCss(_ css: String) {
        send(.saveCss(css))
    }

    /// Morrow's images and files summary: how many files the vault holds, their size, and how many nothing uses.
    func filesSummary() async -> FilesSummary? {
        guard isPageReady, phase == .ready else { return nil }
        do {
            let answer = try await page.callJavaScript("return await window.synapse.files()")
            guard let text = answer as? String else { return nil }
            return try JSONDecoder().decode(FilesSummary.self, from: Data(text.utf8))
        } catch {
            logger.error("files summary failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    /// The open vault's folder, for the settings.
    var vaultURL: URL? { opened?.url }

    /// A file in the vault, such as a cover picture, read away from the main thread.
    func vaultFile(_ path: String) async -> Data? {
        guard let files = access.files else { return nil }
        return await Task.detached { files.readBytes(path) }.value
    }

    // MARK: quick note

    /// Opens the quick note sheet, at once when the vault is open and otherwise once it is.
    func requestQuickNote() {
        if phase == .ready { showingQuickNote = true } else { quickNoteWhenOpen = true }
    }

    /// Morrow's capture: the text goes to the end of today's note.
    func capture(_ text: String) {
        send(.capture(text))
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

    /// A database with Morrow's default properties and table view, opened once it is made.
    func createDatabase(parent: String? = nil) {
        if let parent { expanded.insert(parent) }
        send(.createPage(parentId: parent, kind: .database))
    }

    /// An empty canvas, opened once it is made.
    func createCanvas(parent: String? = nil) {
        if let parent { expanded.insert(parent) }
        send(.createPage(parentId: parent, kind: .canvas))
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

    func graph(_ options: GraphOptions, focus: String?) async -> GraphData? {
        await answer(.graph(options, focus: focus))
    }

    func review() async -> ReviewData? {
        await answer(.review)
    }

    /// Morrow's SM-2 grade for a card: again, hard, good or easy.
    func grade(_ cardId: String, _ grade: String) {
        send(.gradeCard(cardId: cardId, grade: grade))
    }

    // MARK: history and encryption

    /// Morrow's page history, shown over the page.
    func openHistory(_ pageId: String) {
        if selection != pageId { go(to: .page(pageId)) }
        send(.openHistory(pageId: pageId))
    }

    /// Encrypts a page with a password. Returns the reason when it did not work.
    func encrypt(_ pageId: String, password: String) async -> String? {
        await encryption("protect", pageId: pageId, password: password)
    }

    /// Opens a locked page with its password. Returns the reason when it did not work.
    func unlock(_ pageId: String, password: String) async -> String? {
        await encryption("unlock", pageId: pageId, password: password)
    }

    func lock(_ pageId: String) {
        send(.lockPage(pageId: pageId))
    }

    func removeEncryption(_ pageId: String) {
        send(.unprotectPage(pageId: pageId))
    }

    // MARK: data

    /// The page as Markdown, a zip with its attachments when it has any.
    func exportMarkdown(_ pageId: String) {
        send(.exportMarkdown(pageId: pageId))
    }

    /// The whole vault as a website when `pageId` is nil, otherwise the page and the pages inside it.
    func publish(_ pageId: String?) {
        send(.publish(pageId: pageId))
    }

    func exportAll() {
        send(.exportAll)
    }

    func backup() {
        send(.backup)
    }

    func restoreBackup() {
        send(.restore)
    }

    /// Markdown and zip files made into pages inside `parentId`, at the top level when it is nil.
    func importMarkdown(into parentId: String? = nil) {
        send(.importMarkdown(parentId: parentId))
    }

    func deleteUnusedFiles() {
        send(.deleteUnusedFiles)
    }

    /// Shows a page as its Markdown source, or every page in the editor again with nil.
    func setSourceMode(_ pageId: String?) {
        if let pageId, selection != pageId { go(to: .page(pageId)) }
        send(.setSourceMode(pageId: pageId))
    }

    /// The page printed to a PDF on A4 paper, as Morrow's desktop app does. Canvases are not printed.
    func exportPDF(_ pageId: String) {
        guard !exportingPDF, let info = workspace.infos[pageId], info.kind != "canvas" else { return }
        if selection != pageId { go(to: .page(pageId)) }
        exportingPDF = true
        Task {
            defer { exportingPDF = false }
            // pictures and diagrams get a moment to finish drawing, as in morrow
            try? await Task.sleep(for: .milliseconds(400))
            do {
                let answer = try await page.callJavaScript("return window.synapse.pdfSnapshot(id)", arguments: ["id": pageId])
                guard let snapshot = try WorkspaceQuery.decode(answer, as: PDFExporter.Snapshot.self) else {
                    throw PDFExporter.Failure.notLoaded
                }
                let data = try await PDFExporter(editorRoot: editorRoot, access: access).pdf(of: snapshot)
                exportFile = ExportFile(name: "\(ExportFile.safeName(snapshot.title)).pdf", data: data) { name in "Saved \(name)." }
            } catch {
                logger.error("pdf failed: \(error.localizedDescription, privacy: .public)")
                showToast("Could not export the PDF: \(error.localizedDescription)", error: true)
            }
        }
    }

    /// The person chose where the waiting file goes, or cancelled.
    func finishExport(_ file: ExportFile?, savedAs name: String?, error: (any Error)? = nil) {
        if exportFile?.id == file?.id { exportFile = nil }
        if let error {
            showToast("The file could not be saved: \(error.localizedDescription)", error: true)
        } else if let name, let message = file?.savedMessage {
            showToast(message(name))
        }
    }

    #if os(macOS)
    /// Asks where to keep the waiting file with the save panel.
    func saveExportFile() async {
        guard let file = exportFile else { return }
        do {
            finishExport(file, savedAs: try await SavePanel.save(file))
        } catch {
            finishExport(file, savedAs: nil, error: error)
        }
    }
    #endif

    func runToastAction(_ id: Int) {
        if id < 0 { dismissToast(id) } else { send(.toastAction(id: id)) }
    }

    func dismissToast(_ id: Int) {
        if id < 0 { ownToasts.removeAll { $0.id == id } } else { send(.dismissToast(id: id)) }
    }

    /// A toast from this side, gone after five seconds, eight for errors, as Morrow's.
    func showToast(_ message: String, error: Bool = false) {
        ownToastCount += 1
        let toast = EditorToast(id: -ownToastCount, message: message, tone: error ? "error" : "info", action: nil)
        ownToasts = Array((ownToasts + [toast]).suffix(4))
        Task {
            try? await Task.sleep(for: .seconds(error ? 8 : 5))
            ownToasts.removeAll { $0.id == toast.id }
        }
    }

    private struct EncryptionAnswer: Decodable {
        let ok: Bool
        let error: String?
    }

    private func encryption(_ action: String, pageId: String, password: String) async -> String? {
        guard isPageReady, phase == .ready else { return "No vault is open." }
        do {
            let answer = try await page.callJavaScript(
                "return await window.synapse.encryption(action, params)",
                arguments: ["action": action, "params": ["id": pageId, "password": password]]
            )
            guard let result = try WorkspaceQuery.decode(answer, as: EncryptionAnswer.self) else { return "No answer came back." }
            return result.ok ? nil : (result.error ?? "It did not work.")
        } catch {
            logger.error("\(action, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
            return error.localizedDescription
        }
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

    /// Works the answer out with the Swift core from the session's workspace. Debug builds ask the editor page as
    /// well, from its copy, and log where the two answers differ.
    private func answer<T: Decodable>(_ query: WorkspaceQuery) async -> T? {
        guard isPageReady, phase == .ready, let host else { return nil }
        let name = query.name
        let params = query.jsParams
        guard let context = await host.context(), let value = await Task.detached(operation: { CoreQueries.answer(name, params, context) }).value else {
            return nil
        }
        let text = JSJSON.stringify(value)
        #if DEBUG
        let revision = revision
        Task { await compareAnswer(query, text, revision: revision) }
        #endif
        do {
            return try WorkspaceQuery.decode(text)
        } catch {
            logger.error("\(query.name, privacy: .public) answer could not be read: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    #if DEBUG
    /// 11c-2: the page's copy of the workspace (its state deltas) against the Swift session, logged
    private func compareSession(revision: Int) async {
        guard mirror.ready, let host, let session = await host.workspace() else { return }
        let log = Logger(subsystem: "com.synapsenote.native", category: "core")
        let report = CoreDualRun.compare(session: session.state, unreadable: session.unreadable, web: mirror.state, webUnreadable: mirror.unreadable)
        if report.differences.isEmpty {
            log.notice("core session: same as the page, \(report.pages, privacy: .public) pages, \(report.docs, privacy: .public) docs (revision \(revision, privacy: .public))")
        } else {
            log.error("core session: \(report.differences.count, privacy: .public) differences from the page (revision \(revision, privacy: .public))")
            for difference in report.differences.prefix(20) { log.error("core session: \(difference, privacy: .public)") }
        }
    }

    /// 11b: the editor page's answer to the same query, logged where it differs from the Swift core's
    private func compareAnswer(_ query: WorkspaceQuery, _ swift: String, revision: Int) async {
        let log = Logger(subsystem: "com.synapsenote.native", category: "core")
        guard let answer = try? await page.callJavaScript(
            "return window.synapse.query(name, params)", arguments: ["name": query.name, "params": query.params]
        ) as? String, let web = try? JSJSON.parse(answer), let mine = try? JSJSON.parse(swift) else { return }
        if web == mine {
            log.notice("core query \(query.name, privacy: .public): same as the page (revision \(revision, privacy: .public))")
        } else {
            log.error("core query \(query.name, privacy: .public) differs (revision \(revision, privacy: .public)): Swift \(String(swift.prefix(400)), privacy: .public) page \(String(answer.prefix(400)), privacy: .public)")
        }
    }
    #endif

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
            guard let path = await host?.pathOf(pageId) else { return }
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
    /// The page saves its open editors and asks the session to save; the session then saves on its own as well,
    /// in case the page could not ask.
    @discardableResult
    func flush() async -> Bool {
        var saved = true
        if isPageReady, phase == .ready {
            do {
                saved = (try await page.callJavaScript("return await window.synapse.flush()") as? Bool) ?? false
            } catch {
                logger.error("the page could not save before leaving: \(error.localizedDescription, privacy: .public)")
                saved = false
            }
        }
        guard let host else { return saved }
        return await host.flushAlone() && saved
    }

    func handle(_ event: EditorEvent) {
        switch event {
        case .ready:
            logger.info("editor page is ready")
            isPageReady = true
            send(.theme(dark: darkMode))
            send(.preferences(preferences.json))
            openInPage()
        case .rpc(let id, let method, let params):
            guard let rpc else {
                send(.rpcResult(id: id, result: .failure(.init(message: "No folder is open."))))
                return
            }
            rpc.handle(method: method, params: params) { [weak self] result in
                Task { @MainActor in self?.send(.rpcResult(id: id, result: result)) }
            }
        case .workspace(let pages, let locked, let source, let state, let error):
            let before = workspace
            workspace = Workspace(pages: pages, locked: Set(locked))
            sourceMode = source
            revision += 1
            let wasSaved = saveState == .saved
            saveState = switch state {
            case "pending": .pending
            case "saving": .saving
            case "error": .failed(error ?? "Changes could not be saved.")
            default: .saved
            }
            // edits were saved: other devices hear of them a little later, as in morrow
            if !wasSaved, saveState == .saved { sync.savesSettled() }
            #if DEBUG
            Task { await compareSession(revision: revision) }
            #endif
            if phase == .opening {
                phase = .ready
                logger.info("vault opened with \(pages.count) pages")
                host?.webIsReady()
                settleActiveTab()
                if let peerId = syncWhenOpen {
                    syncWhenOpen = nil
                    Task { await sync.syncNow(peerId) }
                }
                if quickNoteWhenOpen {
                    quickNoteWhenOpen = false
                    showingQuickNote = true
                }
            } else if let selection, before.infos[selection] != nil, !workspace.isShowable(selection) {
                // the page on screen went to the trash or was deleted
                go(to: .home)
            } else if let selection, before.infos[selection] == nil, workspace.infos[selection] != nil {
                // a page made in the editor page opens before this side hears of it; its folders open now
                for ancestor in workspace.ancestors(of: selection) { expanded.insert(ancestor.id) }
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
        case .saveFile(let name, _, let data):
            exportFile = ExportFile(name: name, data: data)
            #if os(macOS)
            Task { await saveExportFile() }
            #endif
        case .toasts(let list):
            toasts = list
        case .customCss(let css):
            customCss = css
        case .state(let json):
            do {
                if !mirror.apply(try JSJSON.parse(json)) { logger.warning("a workspace delta arrived out of order") }
            } catch {
                logger.error("a workspace delta could not be read: \(error.localizedDescription, privacy: .public)")
            }
        case .commands(let json):
            host?.apply(commandsJSON: json)
        case .externalAccepted(let id, let accepted):
            host?.externalAccepted(id: id, accepted: accepted)
        case .reviewLog(let json):
            host?.setReviewLog(json: json)
        case .autoBackup(let json):
            #if os(macOS)
            // morrow keeps automatic backups on the desktop only
            Task {
                let failure = await Task.detached { () -> String? in
                    do { try AutoBackup.write(json); return nil } catch { return error.localizedDescription }
                }.value
                if let failure { showToast("Automatic backup failed: \(failure)", error: true) }
            }
            #else
            _ = json
            #endif
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
