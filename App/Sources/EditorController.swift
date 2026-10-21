import Foundation
import Observation
import os
import UniformTypeIdentifiers
#if os(macOS)
import AppKit
#endif

/// Owns the open vault and what the window shows of it. The vault's Swift session (SessionHost) holds the
/// workspace and writes the files; this side sends it the changes the screens make and keeps the page list and
/// the save state it reports.
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
    /// Counts the session's reports, saves included, for screens that ask again when anything changes.
    private(set) var revision = 0
    private(set) var saveState: SaveState = .saved
    private(set) var vaultName: String?
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
    /// What is typed in the page shown as its source, saved before anything leaves it.
    @ObservationIgnored private var sourceDraft: SourceDraft?
    @ObservationIgnored private var waitingSaves: [String: @MainActor () async -> Void] = [:]
    /// Morrow's toasts, at most four at once.
    private(set) var toasts: [Toast] = []
    /// what the toasts' buttons do, by toast id
    @ObservationIgnored private var toastActions: [Int: () -> Void] = [:]
    /// what the file picker is open for, and whether it is up (kept apart: SwiftUI clears the binding before
    /// the picked files arrive)
    var filePick: FilePickPurpose?
    var pickingFiles = false
    /// the newest page change the last automatic backup held (Morrow's lastAutoBackup)
    @ObservationIgnored var lastAutoBackup = 0.0
    @ObservationIgnored var autoBackupTimer: Task<Void, Never>?
    /// A file waiting for the person to say where it goes.
    var exportFile: ExportFile?
    /// the page whose history dialog is open
    var historyPage: String?
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
    /// The quick note sheet; asked for before the vault is open, it opens once it is.
    var showingQuickNote = false

    @ObservationIgnored var openURL: (URL) -> Void = { _ in }
    @ObservationIgnored private let location: VaultLocation
    @ObservationIgnored private let access = VaultAccess()
    /// the open vault's Swift session, which the operations (Operations/) read too
    @ObservationIgnored private(set) var host: SessionHost?
    @ObservationIgnored private var opened: VaultLocation.Opened?
    @ObservationIgnored private var watcher: VaultWatcher?
    @ObservationIgnored private var darkMode = false
    /// the page last shown, whose opening was recorded
    @ObservationIgnored private var shownPage: String?
    /// Text to select in the page shown next.
    @ObservationIgnored private var pendingFind: String?
    /// the page the editor (App/Sources/Editor) shows, nil when another screen is up
    @ObservationIgnored private(set) var nativeEditorPage: String?
    /// what the app asks of the page in the native editor: find, a heading, a search's term, the link field
    struct EditorRequest: Equatable {
        enum Kind: Equatable {
            case find
            case heading(Int)
            case select(String)
            case link
        }
        let id: Int
        let pageId: String
        let kind: Kind
    }
    private(set) var editorRequest: EditorRequest?
    @ObservationIgnored private var editorRequests = 0
    /// asks the title field of a page to take the caret, as the editor's arrow up at its top does
    private(set) var titleFocus: (id: Int, pageId: String)?
    @ObservationIgnored private var toastCount = 0
    /// A device to pull from once the vault just copied from it is open.
    @ObservationIgnored private var syncWhenOpen: String?
    @ObservationIgnored private var quickNoteWhenOpen = false
    @ObservationIgnored private var afterSettings: (() -> Void)?
    @ObservationIgnored private let logger = Logger(subsystem: "com.synapsenote.native", category: "editor")

    init(location: VaultLocation = VaultLocation()) {
        self.location = location
        recents = location.recents
        restoreVault()
        connectSync()
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

    /// Saves what is waiting in the current vault, then opens the remembered one.
    private func switchVault() async {
        if phase == .ready { await flush() }
        await host?.close()
        close()
        workspace = Workspace()
        restoreVault()
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
        let host = SessionHost(files: files, report: { [weak self] report in self?.take(report) },
                               failed: { [weak self] message in self?.showToast(message, error: true) })
        self.host = host
        self.watcher = watcher
        watcher.start()
        phase = .opening
        shownPage = nil
        // a folder about to be filled from another device never gets the welcome guide, as in morrow
        host.begin(guide: syncWhenOpen == nil) { [weak self, weak host] result in
            guard let self, let host, self.host === host else { return }
            vaultOpened(result)
        }
    }

    /// The session opened the vault, or could not.
    private func vaultOpened(_ result: Result<SessionHost.Opened, CommandFailure>) {
        switch result {
        case .failure(let failure):
            logger.error("vault failed: \(failure.message, privacy: .public)")
            close()
            location.forget()
            phase = .choosing(reason: failure.message)
        case .success(let opened):
            take(opened.report)
            phase = .ready
            logger.info("vault opened with \(opened.report.pages.count) pages")
            startAutoBackup()
            settleActiveTab()
            // Morrow's main.tsx, after the vault opens
            if opened.problems > 0 {
                let count = opened.problems
                showToast("\(count) item\(count == 1 ? "" : "s") could not be read and \(count == 1 ? "was" : "were") left untouched.",
                          error: true, duration: .seconds(12))
            }
            if let peerId = syncWhenOpen {
                syncWhenOpen = nil
                Task { await sync.syncNow(peerId) }
            }
            if quickNoteWhenOpen {
                quickNoteWhenOpen = false
                showingQuickNote = true
            }
        }
    }

    /// What the session reports: the page list, locked pages and saving.
    private func take(_ report: SessionHost.Report) {
        let before = workspace
        workspace = Workspace(pages: report.pages, locked: report.locked)
        revision += 1
        let wasSaved = saveState == .saved
        saveState = switch report.save.state {
        case .pending: .pending
        case .saving: .saving
        case .error: .failed(report.save.error ?? "Changes could not be saved.")
        case .saved: .saved
        }
        // edits were saved: other devices hear of them a little later, as in morrow
        if !wasSaved, saveState == .saved { sync.savesSettled() }
        guard phase == .ready else { return }
        if let selection, before.infos[selection] != nil, !workspace.isShowable(selection) {
            // the page on screen went to the trash or was deleted
            go(to: .home)
        } else if let selection, before.infos[selection] == nil, workspace.infos[selection] != nil {
            // a page made a moment ago opens before its report; its folders open now
            for ancestor in workspace.ancestors(of: selection) { expanded.insert(ancestor.id) }
        }
    }

    private func close() {
        autoBackupTimer?.cancel()
        autoBackupTimer = nil
        watcher?.stop()
        watcher = nil
        if let host {
            // the session saves what is waiting before it lets go
            Task { await host.close() }
        }
        host = nil
        sourceDraft = nil
        access.set(nil)
        sync.vault = nil
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

    /// Paths another app or a sync changed. What is typed in the open editors goes to the session first, as Morrow's
    /// `beforeExternal`, so a page with unsaved typing keeps it; the session then reads the files.
    func report(_ paths: Set<String>) {
        guard let host else { return }
        Task {
            await commitEditors()
            host.changed(paths)
        }
    }

    /// Morrow's commitEditors: typing the editors and screens still hold goes to the session.
    private func commitEditors() async {
        await sourceDraft?.flush()
        for flush in waitingSaves.values { await flush() }
    }

    /// Looks for edits made while the app was away, for writers that do not use file coordination.
    func checkForOutsideChanges() {
        watcher?.checkForChanges()
    }

    /// The theme the window shows, for Morrow's switch theme.
    func setDarkMode(_ dark: Bool) {
        darkMode = dark
    }

    /// Morrow's switch light or dark theme, from the one the window shows now.
    func switchTheme() {
        preferences.switchTheme(showingDark: darkMode)
    }

    // MARK: settings

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

    /// Shows the open tab's place. A page made a moment ago may not be in the page list yet; its screen asks the
    /// session, which has it.
    func showDestination() {
        guard phase == .ready else { return }
        // the sidebar opens the folders down to the page on screen
        if let id = selection { for ancestor in workspace.ancestors(of: id) { expanded.insert(ancestor.id) } }
        if selection != shownPage {
            shownPage = selection
            // when the page was last opened, for recent pages, as Morrow's PageView records it
            if let id = selection { host?.markOpened(id) }
        }
        if let find = pendingFind, let id = selection { ask(id, .select(find)) }
        pendingFind = nil
    }

    // MARK: WorkspaceService

    /// Applies a command; one the session refuses is told in an error toast, as Morrow's `run`.
    func perform(_ command: WorkspaceCommand) {
        execute([command.morrow()])
        if case .move(_, let parent?, _) = command { expanded.insert(parent) }
    }

    /// Commands that only make sense together, such as a property's new type and every row's converted value:
    /// the session applies all of them or none, as Morrow's `runAll`.
    func performAll(_ commands: [WorkspaceCommand]) {
        guard !commands.isEmpty else { return }
        let now = JSEnvironment.now()
        execute(commands.map { $0.morrow(now: now) }, all: true)
    }

    /// Sends commands to the session at once, so they apply in the order they were made; `done` runs once they are
    /// applied.
    private func execute(_ commands: [JSValue], all: Bool = false, done: (@MainActor @Sendable () -> Void)? = nil) {
        guard let host else { return }
        host.execute(commands, all: all) { [weak self] failure in
            Task { @MainActor in
                if let failure { self?.showToast(failure.message, error: true) }
                done?()
            }
        }
    }

    /// The same, returning once the session has applied them.
    private func executed(_ commands: [JSValue]) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            if host == nil { return continuation.resume() }
            execute(commands) { continuation.resume() }
        }
    }

    func createPage(parent: String? = nil) {
        makePage(parent: parent)
    }

    /// A database with Morrow's default properties and table view, opened once it is made.
    func createDatabase(parent: String? = nil) {
        makePage(parent: parent, kind: .database)
    }

    /// An empty canvas, opened once it is made.
    func createCanvas(parent: String? = nil) {
        makePage(parent: parent, kind: .canvas)
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
        host?.grade(cardId, grade)
    }

    // MARK: history and encryption

    /// Morrow's page history, shown over the page.
    func openHistory(_ pageId: String) {
        if selection != pageId { go(to: .page(pageId)) }
        historyPage = pageId
    }

    /// The page's versions, for the history dialog.
    func versions(_ pageId: String) async -> [Snapshot] {
        await host?.snapshots(pageId) ?? []
    }

    /// Morrow's restoreVersion: the editors' typing goes in first, and a toast says how it went.
    func restoreVersion(_ snapshot: Snapshot) {
        guard let host else { return }
        Task {
            await commitEditors()
            if let error = await host.restore(snapshot) {
                showToast(error, error: true)
            } else {
                showToast("Version restored. The version it replaced is kept in the page history.")
            }
        }
    }

    /// Encrypts a page with a password. Returns the reason when it did not work.
    func encrypt(_ pageId: String, password: String) async -> String? {
        guard let host else { return "No vault is open." }
        await commitEditors()
        return await host.protect(pageId, password: password)
    }

    /// Opens a locked page with its password. Returns the reason when it did not work.
    func unlock(_ pageId: String, password: String) async -> String? {
        guard let host else { return "No vault is open." }
        return await host.unlock(pageId, password: password)
    }

    /// Saves the page and forgets its content until the password is given again.
    func lock(_ pageId: String) {
        guard let host else { return }
        Task {
            await commitEditors()
            await host.lock(pageId)
        }
    }

    func removeEncryption(_ pageId: String) {
        guard let host else { return }
        Task {
            await commitEditors()
            if let error = await host.unprotect(pageId) { showToast(error, error: true) }
        }
    }

    // MARK: data

    /// Morrow's exportAllMarkdown, see Operations/DataOperations.swift.
    func exportAll() {
        exportAllMarkdown()
    }

    /// Shows a page as its Markdown source, or every page in the editor again with nil. What is typed in the
    /// source or the editor is saved first, so the other opens on it.
    func setSourceMode(_ pageId: String?) {
        if let pageId, selection != pageId { go(to: .page(pageId)) }
        let draft = sourceDraft
        if draft?.pageId != pageId { sourceDraft = nil }
        Task {
            await draft?.flush()
            for flush in waitingSaves.values { await flush() }
            sourceMode = pageId
        }
    }

    // MARK: native page screens

    /// Which screen shows the page (App/Sources/Pages).
    func pageScreen(_ pageId: String) async -> PageScreen {
        guard phase == .ready, let host else { return .none }
        return await host.screen(of: pageId, sourceMode: sourceMode == pageId)
    }

    /// The page's document for the native editor.
    func editorDoc(_ pageId: String) async -> DocNode? {
        guard phase == .ready, let host else { return nil }
        return await host.editorDoc(pageId)
    }

    /// Pasted Markdown as blocks, for the native editor.
    func pasteDoc(_ text: String) async -> DocNode? { await host?.pasteDoc(text) }

    func resolveTargets(_ targets: [String]) async -> [String: String] { await host?.resolveTargets(targets) ?? [:] }

    /// The editor shows a page, which find and the link field go to.
    func nativeEditorShows(_ pageId: String) {
        nativeEditorPage = pageId
    }

    /// The editor stopped showing a page; one that took over since is left alone.
    func nativeEditorLeft(_ pageId: String) {
        guard nativeEditorPage == pageId else { return }
        nativeEditorPage = nil
    }

    private func ask(_ pageId: String, _ kind: EditorRequest.Kind) {
        editorRequests += 1
        editorRequest = EditorRequest(id: editorRequests, pageId: pageId, kind: kind)
    }

    func focusTitle(_ pageId: String) {
        editorRequests += 1
        titleFocus = (editorRequests, pageId)
    }

    /// The page's title field takes the caret request once: as it comes, or when the field appears after it, as
    /// for a page made a moment ago whose screen is drawn once the session has it.
    func takeTitleFocus(_ pageId: String) -> Bool {
        guard titleFocus?.pageId == pageId else { return false }
        titleFocus = nil
        return true
    }

    /// The database screen's data from the session.
    func databaseSnapshot(_ pageId: String) async -> DatabaseSnapshot? {
        guard phase == .ready, let host else { return nil }
        return await host.database(pageId)
    }

    func findPages(_ query: String, excluding rowId: String, limit: Int = 12) async -> [DatabaseSnapshot.RelatedPage] {
        await host?.findPages(query, excluding: rowId, limit: limit) ?? []
    }

    /// The canvas screen's data from the session.
    func canvasSnapshot(_ pageId: String) async -> CanvasSnapshot? {
        guard phase == .ready, let host else { return nil }
        return await host.canvas(pageId)
    }

    /// A page's whole document from a screen, returned once the session has applied it, so a save that follows
    /// includes it.
    func setDoc(_ pageId: String, _ doc: DocNode) async {
        await executed([WorkspaceCommand.setDoc(id: pageId, doc: doc).morrow()])
    }

    /// Screens with changes waiting to be saved, such as a canvas; each is saved before the vault is.
    func holdSave(_ key: String, _ flush: @escaping @MainActor () async -> Void) { waitingSaves[key] = flush }
    func releaseSave(_ key: String) { waitingSaves[key] = nil }

    /// The page's Markdown source as typed so far, opened from the session's copy of the page when it is new.
    func sourceDraft(for pageId: String) async -> SourceDraft? {
        if let draft = sourceDraft, draft.pageId == pageId { return draft }
        await sourceDraft?.flush()
        guard let host, let text = await host.markdown(of: pageId) else { return nil }
        if let draft = sourceDraft, draft.pageId == pageId { return draft }
        let draft = SourceDraft(pageId: pageId, text: text) { [weak self] text in
            await self?.saveSource(text, of: pageId) ?? false
        }
        sourceDraft = draft
        return draft
    }

    /// Morrow's SourceEditor save: the text read back by the session, then the page set to it. It returns once
    /// the session has applied it, so a save of the vault that follows, such as when the app goes to the
    /// background, includes it.
    private func saveSource(_ text: String, of pageId: String) async -> Bool {
        guard let host, let doc = await host.readMarkdown(text) else { return false }
        await setDoc(pageId, doc)
        return true
    }

    /// A picture picked on this device, stored in the vault as Morrow's storeFiles stores one; its vault path,
    /// nil when it could not be stored, which a toast says.
    func storeImage(_ url: URL) async -> String? {
        await storeFiles([url]).first?.id
    }

    /// Files picked or dropped on this device, read away from the main thread and stored in the vault.
    func storeFiles(_ urls: [URL]) async -> [FileMeta] {
        let read = await Task.detached { () -> [(name: String, data: Data?)] in
            urls.map { url in
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                // a file over the limit is not read; an empty one stands for it
                if let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size > Self.maxFileBytes { return (url.lastPathComponent, Data()) }
                return (url.lastPathComponent, try? Data(contentsOf: url))
            }
        }.value
        let unreadable = read.filter { $0.data == nil }.map(\.name)
        if !unreadable.isEmpty { showToast("\(unreadable.joined(separator: ", ")) could not be read.", error: true) }
        let tooLarge = read.filter { $0.data?.isEmpty == true }.count
        return await storeFiles(read.compactMap { item in item.data.flatMap { $0.isEmpty ? nil : (item.name, $0) } }, leftOut: tooLarge)
    }

    /// morrow's MAX_FILE_BYTES, src/app/platform/attachments.ts
    nonisolated static let maxFileBytes = 100 * 1024 * 1024

    /// Morrow's storeFiles: files over 100 MB are left out with a toast, the rest stored together; their records
    /// once every one is stored, none when storing failed, which a toast says. `leftOut` counts files already
    /// found too large.
    func storeFiles(_ files: [(name: String, data: Data)], leftOut: Int = 0) async -> [FileMeta] {
        let accepted = files.filter { $0.data.count <= Self.maxFileBytes }
        if accepted.count < files.count || leftOut > 0 { showToast("Files larger than 100 MB were not added.", error: true) }
        guard let host, !accepted.isEmpty else { return [] }
        let stored = accepted.map { file in
            (meta: FileMeta(id: UUID().uuidString.lowercased(), name: file.name.isEmpty ? "file" : file.name,
                            type: UTType(filenameExtension: (file.name as NSString).pathExtension)?.preferredMIMEType ?? "application/octet-stream",
                            size: Double(file.data.count), createdAt: JSEnvironment.now()),
             data: file.data)
        }
        switch await host.addFiles(stored) {
        case .success(let metas): return metas
        case .failure(let failure):
            showToast(failure.message, error: true)
            return []
        }
    }

    /// The page printed to a PDF on A4 paper. Morrow's desktop app prints the editor; the app prints the page as
    /// Morrow's published site shows it (Site.printPage), formulas as MathML. Canvases are not printed.
    func exportPDF(_ pageId: String) {
        guard !exportingPDF, let info = workspace.infos[pageId], info.kind != "canvas" else { return }
        exportingPDF = true
        Task {
            defer { exportingPDF = false }
            do {
                guard let state = await host?.workspace()?.state,
                      let html = Site.printPage(state, pageId, assetPath: { VaultSchemeHandler.url(for: $0)?.absoluteString ?? "" }) else {
                    throw PDFExporter.Failure.notLoaded
                }
                let data = try await PDFExporter(access: access).pdf(html: html)
                exportFile = ExportFile(name: "\(ExportFile.safeName(info.displayTitle)).pdf", data: data) { name in "Saved \(name)." }
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
        let action = toastActions[id]
        dismissToast(id)
        action?()
    }

    func dismissToast(_ id: Int) {
        toasts.removeAll { $0.id == id }
        toastActions[id] = nil
    }

    /// Morrow's ui.ts `toast`: gone after five seconds, eight for errors, or after `duration`; at most four at
    /// once. `action` is the button's label and what it does.
    func showToast(_ message: String, error: Bool = false, action: (label: String, run: () -> Void)? = nil, duration: Duration? = nil) {
        toastCount += 1
        let toast = Toast(id: toastCount, message: message, tone: error ? "error" : "info", action: action?.label)
        toasts = Array((toasts + [toast]).suffix(4))
        if let action { toastActions[toast.id] = action.run }
        for gone in Set(toastActions.keys).subtracting(toasts.map(\.id)) { toastActions[gone] = nil }
        Task {
            try? await Task.sleep(for: duration ?? .seconds(error ? 8 : 5))
            dismissToast(toast.id)
        }
    }

    /// Works the answer out with the Swift core from the session's workspace.
    private func answer<T: Decodable>(_ query: WorkspaceQuery) async -> T? {
        guard phase == .ready, let host else { return nil }
        let name = query.name
        let params = query.jsParams
        guard let context = await host.context(), let value = await Task.detached(operation: { CoreQueries.answer(name, params, context) }).value else {
            return nil
        }
        let text = JSJSON.stringify(value)
        do {
            return try WorkspaceQuery.decode(text)
        } catch {
            logger.error("\(query.name, privacy: .public) answer could not be read: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    // MARK: the page on screen

    func scrollToHeading(_ index: Int) {
        if let page = nativeEditorPage, page == selection { ask(page, .heading(index)) }
    }

    func findInPage() {
        if let page = nativeEditorPage, page == selection { ask(page, .find) }
    }

    /// Cmd K: the link editor when text is selected in the editor, as there, otherwise search. The editor opens
    /// the palette itself when nothing is selected.
    func searchOrLink() async {
        if let page = nativeEditorPage, page == selection {
            ask(page, .link)
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
    /// The editors' typing goes to the session, the session saves, then an automatic backup as Morrow's flush.
    @discardableResult
    func flush() async -> Bool {
        await commitEditors()
        guard let host else { return true }
        let saved = await host.flush()
        await autoBackup()
        return saved
    }

    /// Morrow's startAutoBackup: half a minute after the vault opens, then every ten minutes
    private func startAutoBackup() {
        autoBackupTimer?.cancel()
        lastAutoBackup = 0
        autoBackupTimer = Task { [weak self] in
            try? await Task.sleep(for: .seconds(30))
            while !Task.isCancelled {
                await self?.autoBackup()
                try? await Task.sleep(for: .seconds(10 * 60))
            }
        }
    }
}
