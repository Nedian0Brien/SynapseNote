import Foundation
import os

/// The open vault's Swift session on a serial queue of its own, the one place the workspace lives (Morrow's
/// WorkspaceSession behind its app). Native screens send it commands and ask it questions; every call is put on
/// the queue the moment it arrives, so commands apply in the order they were sent and a question asked after a
/// command sees it. Saving runs on the same queue: 300 ms after the last change, as Morrow's save queue, and at
/// once when the app asks (`flush`). What changed is reported to the screens, gathered over a few milliseconds.
nonisolated final class SessionHost: @unchecked Sendable {
    /// What the screens show of the session without asking: the pages, the locked ones, and saving.
    struct Report: Sendable {
        var pages: [PageMeta]
        /// encrypted pages whose password has not been given yet
        var locked: Set<String>
        var save: SaveQueue.Status
    }

    /// What opening found.
    struct Opened: Sendable {
        /// stored records that could not be read and were left untouched
        var problems: Int
        var report: Report
    }

    let bridge: FileVaultBridge
    private let queue = DispatchQueue(label: "com.synapsenote.native.session")
    private let logger = Logger(subsystem: "com.synapsenote.native", category: "session")
    /// hears what changed, on the main actor
    private let report: @MainActor @Sendable (Report) -> Void
    /// hears a save made in the background that failed, such as flashcard progress
    private let failed: @MainActor @Sendable (String) -> Void

    // only touched on `queue`
    private var session: CoreSession?
    /// flashcard progress, kept in .morrow/review.json
    private var reviewLog = JSObject()
    private var reviewSave: DispatchWorkItem?
    private var reportQueued = false

    init(files: VaultFileSystem, report: @escaping @MainActor @Sendable (Report) -> Void,
         failed: @escaping @MainActor @Sendable (String) -> Void = { _ in }) {
        bridge = FileVaultBridge(files: files)
        self.report = report
        self.failed = failed
    }

    // MARK: running work

    /// puts the work on the queue now and hands its result to `done` there
    private func submit<T>(_ body: @escaping () -> T, done: @escaping (T) -> Void) {
        // both run on `queue` only, which is what confines the session and everything they touch
        nonisolated(unsafe) let body = body
        nonisolated(unsafe) let done = done
        queue.async { done(body()) }
    }

    private func run<T: Sendable>(_ body: @escaping () -> T) async -> T {
        await withCheckedContinuation { continuation in
            submit(body) { continuation.resume(returning: $0) }
        }
    }

    // MARK: the vault

    /// Opens the session, reading the folder. A vault opened for the first time gets Morrow's welcome guide unless
    /// `guide` is false (a folder about to be filled from another device), is saved, and is marked as set up, in
    /// the order of Morrow's main.tsx. `done` hears what opening found, or why the folder could not be opened.
    func begin(guide: Bool, done: @escaping @MainActor @Sendable (Result<Opened, CommandFailure>) -> Void) {
        submit({ [self] () -> Result<Opened, CommandFailure> in
            do {
                let writer = VaultWriter(bridge: bridge, newId: { UUID().uuidString.lowercased() })
                let session = CoreSession.open(try bridge.scan(), writer: writer, timer: QueueTimer(queue: queue))
                session.queue.onStatus = { [weak self] in self?.reportSoon() }
                if session.firstRun, guide {
                    let commands = (WelcomeGuide.commands(newId: { UUID().uuidString.lowercased() }, now: JSEnvironment.now()) ?? [])
                        .compactMap(CoreCommand.init(json:))
                    if case .success = session.executeAll(commands) { session.flush() } else { logger.error("the welcome guide could not be added") }
                }
                try session.markInitialized()
                self.session = session
                reviewLog = Flashcards.readReviewLog(session.readMeta("review.json").flatMap { try? JSJSON.parse($0) })
                return .success(Opened(problems: session.problems.count, report: currentReport(session)))
            } catch let error as VaultWriteError {
                return .failure(CommandFailure(message: error.message))
            } catch {
                return .failure(CommandFailure(message: "Could not open the folder: \(error.localizedDescription)"))
            }
        }, done: { result in
            Task { @MainActor in done(result) }
        })
    }

    /// Saves what is waiting, flashcard progress included. True when nothing is left unsaved.
    @discardableResult
    func flush() async -> Bool {
        await run { [self] in
            saveReviews()
            return session?.flush() ?? true
        }
    }

    /// Saves what is waiting and lets the session go, when the vault closes.
    func close() async {
        await run { [self] in
            saveReviews()
            session?.close()
            session = nil
        }
    }

    // MARK: reports

    private func currentReport(_ session: CoreSession) -> Report {
        let pages = session.state.pages
        return Report(pages: pages.valuesInOrder, locked: Set(session.unreadable.items.filter { pages[$0]?.encrypted == true }),
                      save: session.saveStatus)
    }

    /// tells the screens a few milliseconds from now, so a burst of changes is one report (16 ms, as the editor's
    /// web host waited before 11e-2)
    private func reportSoon() {
        if reportQueued { return }
        reportQueued = true
        queue.asyncAfter(deadline: .now() + .milliseconds(16)) { [self] in
            reportQueued = false
            guard let session else { return }
            let current = currentReport(session)
            Task { @MainActor [report] in report(current) }
        }
    }

    // MARK: commands

    /// Applies Morrow commands in order, all of them or none with `all`; `done` hears why one was refused, on the
    /// session's queue.
    func execute(_ commands: [JSValue], all: Bool = false, done: @escaping @Sendable (CommandFailure?) -> Void = { _ in }) {
        submit({ [self] () -> CommandFailure? in
            guard let session else { return CommandFailure(message: "The vault is not open.") }
            let parsed = commands.compactMap(CoreCommand.init(json:))
            guard parsed.count == commands.count else {
                logger.error("a command is not one the session knows")
                return CommandFailure(message: "That change could not be made.")
            }
            var refused: CommandFailure?
            if all {
                if case .failure(let error) = session.executeAll(parsed) { refused = error }
            } else {
                for command in parsed { if case .failure(let error) = session.execute(command) { refused = error } }
            }
            reportSoon()
            return refused
        }, done: done)
    }

    /// Morrow's PageView records when a page was opened, for recent pages; not for canvases, whose page record is
    /// saved by rewriting the canvas file.
    func markOpened(_ id: String) {
        submit({ [self] in
            guard let session, let page = session.state.pages[id], page.kind != .canvas else { return }
            if case .success = session.execute(.markOpened(id: id, now: JSEnvironment.now())) { reportSoon() }
        }, done: { _ in })
    }

    // MARK: encrypted pages, history and flashcards

    /// Morrow's protectPage: a new key, then the page saved encrypted. The reason when it did not work.
    func protect(_ id: String, password: String) async -> String? {
        await change { $0.protectPage(id, password) }
    }

    func unlock(_ id: String, password: String) async -> String? {
        await change { $0.unlockPage(id, password) }
    }

    func unprotect(_ id: String) async -> String? {
        await change { $0.unprotectPage(id) }
    }

    func lock(_ id: String) async {
        _ = await change {
            $0.lockPage(id)
            return .success($0.state)
        }
    }

    /// Morrow's restoreSnapshot: the current content is kept as a version first. The reason when it did not work.
    func restore(_ snapshot: Snapshot) async -> String? {
        await change { $0.restoreSnapshot(snapshot) }
    }

    private func change(_ body: @escaping (CoreSession) -> Result<WorkspaceState, CommandFailure>) async -> String? {
        await run { [self] in
            guard let session else { return "The vault is not open." }
            let result = body(session)
            reportSoon()
            if case .failure(let error) = result { return error.message }
            return nil
        }
    }

    /// Morrow's gradeCard: the card's next review from the grade, saved 800 ms later (app/review.ts).
    func grade(_ cardId: String, _ grade: String, today: Date = Date()) {
        submit({ [self] in
            guard let session, let card = Flashcards.collectCards(session.state).first(where: { $0.id == cardId }) else { return }
            reviewLog[card.id] = .object(Flashcards.schedule(reviewLog[card.id]?.object, grade, today))
            reviewSave?.cancel()
            let save = DispatchWorkItem { [weak self] in self?.saveReviews() }
            reviewSave = save
            queue.asyncAfter(deadline: .now() + .milliseconds(800), execute: save)
            reportSoon()
        }, done: { _ in })
    }

    /// writes flashcard progress still waiting for its delay
    private func saveReviews() {
        guard let save = reviewSave, let session else { return }
        save.cancel()
        reviewSave = nil
        do {
            try session.writeMeta("review.json", Flashcards.writeReviewLog(reviewLog))
        } catch {
            let message = "Review progress could not be saved: Error: \(error.message)"
            Task { @MainActor [failed] in failed(message) }
        }
    }

    // MARK: outside edits

    /// Paths the file watcher or a sync saw change: Morrow's path for an outside edit. A page with unsaved changes
    /// keeps them, and the other version goes to its history when this one is saved. The open editors' typing is
    /// handed over before this is called, as Morrow's `beforeExternal`.
    func changed(_ paths: Set<String>) {
        submit({ [self] in
            guard let session, let received = session.receive(bridge.describe(paths)) else { return }
            if !received.accepted.isEmpty { reportSoon() }
        }, done: { _ in })
    }

    // MARK: reading

    /// The workspace for the native screens' questions, with the activity count and flashcard progress.
    func context(now: Date = Date()) async -> CoreQueries.Context? {
        await run { [self] in
            session.map { CoreQueries.Context(state: $0.state, activity: $0.activity(), reviewLog: reviewLog, now: now) }
        }
    }

    /// The session's workspace and its unreadable pages, for the operations (Operations/).
    func workspace() async -> (state: WorkspaceState, unreadable: JSSet)? {
        await run { [self] in session.map { ($0.state, $0.unreadable) } }
    }

    func pathOf(_ id: String) async -> String? {
        await run { [self] in session?.pathOf(id) }
    }

    // MARK: native page screens

    /// Which screen draws a page, by the rules of Morrow's PageView. Nothing is drawn for a page that is gone or in
    /// the trash, or for a locked one, whose password view the main column shows instead.
    func screen(of id: String, sourceMode: Bool) async -> PageScreen {
        await run { [self] in
            guard let session, let page = session.state.pages[id], !Tree.isEffectivelyTrashed(session.state.pages, id)
            else { return .none }
            if page.kind == .canvas { return .canvas(unreadable: session.unreadable.has(id)) }
            // Morrow's PageView, in its order: a database is editable unless its folder note could not be read
            if page.kind == .database { return .database(editable: !session.unreadable.has(id)) }
            if session.unreadable.has(id) { return page.encrypted ? .none : .unreadable }
            if sourceMode, page.kind == .page { return .source }
            let doc = session.state.docs[id] ?? Model.emptyDoc()
            let unknown = Doc.findUnknownTypes(doc)
            guard unknown.isEmpty else { return .unknown(types: unknown, plain: Doc.docToPlainText(doc)) }
            return EditorScreen.draws(doc) ? .editor : .invalid(plain: Doc.docToPlainText(doc))
        }
    }

    /// the page's versions in its history, newest first as the session lists them
    func snapshots(_ pageId: String) async -> [Snapshot] {
        await run { [self] in session?.listSnapshots(pageId) ?? [] }
    }

    /// The page's document as the session holds it, for the native editor.
    func editorDoc(_ id: String) async -> DocNode? {
        await run { [self] in
            guard let session, session.state.pages[id] != nil else { return nil }
            return session.state.docs[id] ?? Model.emptyDoc()
        }
    }

    /// The text Morrow's SourceEditor opens with: the page's Markdown, links under their pages' titles and files
    /// under their vault paths.
    func markdown(of id: String) async -> String? {
        await run { [self] in
            guard let session, session.state.pages[id] != nil else { return nil }
            let doc = session.state.docs[id] ?? Model.emptyDoc()
            let pages = session.state.pages
            return MarkdownSerialize.docToMarkdown(doc, .init(titleOf: { pages[$0].map { Model.displayTitle($0) } }, filePath: { $0 }))
        }
    }

    /// SourceEditor's reading back of the text: links to pages by Morrow's link rules, files by vault path or
    /// by name. Nil when the text gives no document Morrow takes, or names a file in a broken escape, where
    /// Morrow's `decodeURIComponent` throws and nothing is saved.
    func readMarkdown(_ text: String) async -> DocNode? {
        await run { [self] in
            guard let session else { return nil }
            let state = session.state
            var byId: [String: FileMeta] = [:]
            var byName: [String: FileMeta] = [:]
            for file in session.listFiles() {
                byId[file.id] = file
                byName[file.name.lowercased()] = file
            }
            var broken = false
            let options = MarkdownParse.Options(
                resolvePage: { Search.resolveLinkTarget(state, $0) },
                resolveFile: { href in
                    var path = Substring(href)
                    if path.hasPrefix("./") { path = path.dropFirst(2) } else if path.hasPrefix("/") { path = path.dropFirst() }
                    guard let clean = JSURI.decodeURIComponent(String(path)) else {
                        broken = true
                        return nil
                    }
                    let last = clean.split(separator: "/", omittingEmptySubsequences: false).last.map(String.init) ?? clean
                    guard let file = byId[clean] ?? byName[last.lowercased()] else { return nil }
                    return MarkdownParse.FileRef(fileId: file.id, name: file.name, image: file.type.hasPrefix("image/"))
                })
            let doc = MarkdownParse.markdownToDoc(text, options)
            return broken || Doc.validateDoc(.object(doc)) != nil ? nil : doc
        }
    }

    /// MarkdownPaste: pasted text as blocks, [[links]] to the page with that title (pageIdByTitle).
    func pasteDoc(_ text: String) async -> DocNode? {
        await run { [self] in
            guard let session else { return nil }
            let state = session.state
            return MarkdownParse.markdownToDoc(text, .init(resolvePage: { Search.pageIdByTitle(state, $0) }))
        }
    }

    /// The pages written link targets mean, by Morrow's resolveLinkTarget; a target with none is left out.
    func resolveTargets(_ targets: [String]) async -> [String: String] {
        await run { [self] in
            guard let session else { return [:] }
            var out: [String: String] = [:]
            for target in targets { if let id = Search.resolveLinkTarget(session.state, target) { out[target] = id } }
            return out
        }
    }

    /// The database screen's data: the database, its rows, what only the rows' documents tell, and the pages its
    /// relation values name. Nil when the page is not a database.
    func database(_ id: String) async -> DatabaseSnapshot? {
        await run { [self] in
            guard let session, let page = session.state.pages[id], page.kind == .database else { return nil }
            let state = session.state
            let database = page.database ?? DatabaseDef(properties: [], views: [])
            let rows = Database.rowsOf(state, id)
            let relationProps = database.properties.filter { $0.type == "relation" }
            var snapshot = DatabaseSnapshot(page: page, database: database, rows: rows, firstImages: [:], progress: [:],
                                            relations: [:], now: JSEnvironment.now())
            for row in rows {
                let doc = state.docs[row.id]
                snapshot.firstImages[row.id] = DatabaseEdits.firstImage(doc)
                snapshot.progress[row.id] = DatabaseEdits.taskProgress(doc)
                for prop in relationProps {
                    for target in DatabaseEdits.relationTargets(row.properties[prop.id]) where snapshot.relations[target] == nil {
                        if let found = Search.resolveLinkTarget(state, target), let related = state.pages[found] {
                            snapshot.relations[target] = .init(id: related.id, title: Model.displayTitle(related))
                        }
                    }
                }
            }
            return snapshot
        }
    }

    /// The canvas screen's data: the canvas as Morrow reads it from the page's document, and the pages its page
    /// cards show. Nil when the page is not a canvas.
    func canvas(_ id: String) async -> CanvasSnapshot? {
        await run { [self] in
            guard let session, let page = session.state.pages[id], page.kind == .canvas else { return nil }
            let doc = session.state.docs[id]
            let data = CanvasFile.canvasFromDoc(doc)
            var pages: [String: CanvasSnapshot.PageCard] = [:]
            for pageId in CanvasFile.pagesInCanvas(data) {
                guard let shown = session.state.pages[pageId] else { continue }
                pages[pageId] = .init(title: Model.displayTitle(shown), icon: shown.icon,
                                      snippet: CanvasEdits.pageSnippet(session.state.docs[pageId]))
            }
            return CanvasSnapshot(doc: doc, data: data, pages: pages)
        }
    }

    /// RelationPicker's search: pages by title, not the row itself
    func findPages(_ query: String, excluding rowId: String, limit: Int = 12) async -> [DatabaseSnapshot.RelatedPage] {
        await run { [self] in
            guard let session else { return [] }
            return Search.findPagesByTitle(session.state, query, limit: limit)
                .filter { !$0.id.jsEquals(rowId) }
                .map { .init(id: $0.id, title: Model.displayTitle($0)) }
        }
    }

    /// The vault's files, as Morrow's `listFiles`.
    func files() async -> [FileMeta] {
        await run { [self] in session?.listFiles() ?? [] }
    }

    /// A file's record and bytes, nil when it is not there.
    func file(_ id: String) async -> (meta: FileMeta, data: Data)? {
        await run { [self] in session?.getFile(id) }
    }

    /// the files pages are kept in, so a note kept in the attachments folder is never taken for a stored file
    func pageFiles() async -> JSSet {
        await run { [self] in
            guard let session else { return JSSet() }
            return JSSet(session.state.pages.keys.compactMap { session.pathOf($0) })
        }
    }

    /// Every page's versions, for what backups and the unused file check count as used.
    func allSnapshots() async -> [Snapshot] {
        await run { [self] in session?.allSnapshots() ?? [] }
    }

    func deleteFiles(_ ids: [String]) async -> CommandFailure? {
        await run { [self] in
            guard let session else { return CommandFailure(message: "The vault is not open.") }
            do { try session.deleteFiles(ids) } catch { return CommandFailure(message: (error as? VaultWriteError)?.message ?? "\(error)") }
            return nil
        }
    }

    /// Files a native screen adds, such as a cover picture, stored before a page refers to them.
    func addFiles(_ files: [(meta: FileMeta, data: Data)]) async -> Result<[FileMeta], CommandFailure> {
        await run { [self] in
            session?.addFiles(files) ?? .failure(CommandFailure(message: "The vault is not open."))
        }
    }
}

/// Runs the save queue's delayed writes on the session's queue.
private nonisolated final class QueueTimer: SaveTimer, @unchecked Sendable {
    private let queue: DispatchQueue
    private var waiting: DispatchWorkItem?

    init(queue: DispatchQueue) {
        self.queue = queue
    }

    func schedule(after delay: Double, _ fire: @escaping () -> Void) {
        cancel()
        let item = DispatchWorkItem(block: fire)
        waiting = item
        queue.asyncAfter(deadline: .now() + .milliseconds(Int(delay)), execute: item)
    }

    func cancel() {
        waiting?.cancel()
        waiting = nil
    }
}
