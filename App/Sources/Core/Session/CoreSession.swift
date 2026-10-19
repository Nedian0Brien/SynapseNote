import Foundation

/// Morrow's storage/session.ts: the single place where commands run, the workspace lives and changes are queued
/// for disk. Saving goes through a SaveQueue into a VaultWriter; page history is taken as documents are saved;
/// edits made by other apps come in through `receive` (or `readChanges`, `applyExternal` and `commitExternal`
/// when someone else decides what to accept).
nonisolated final class CoreSession {
    private(set) var state: WorkspaceState
    private(set) var unreadable: JSSet
    let problems: [String]
    let firstRun: Bool
    let writer: VaultWriter
    private(set) var queue: SaveQueue!
    private var lastSnapshot = JSMap<Double>()
    private let now: () -> Double
    private let newSnapshotId: () -> String

    private init(writer: VaultWriter, opened: VaultWriter.Opened, timer: SaveTimer, now: @escaping () -> Double, newSnapshotId: @escaping () -> String) {
        self.writer = writer
        self.now = now
        self.newSnapshotId = newSnapshotId
        var state = WorkspaceState()
        for page in opened.pages { state.pages[page.id] = page }
        state.docs = opened.docs
        self.state = state
        unreadable = JSSet(opened.unreadable)
        problems = opened.problems
        firstRun = opened.firstRun
        var options = SaveQueue.Options(now: now)
        options.snapshotsFor = { [unowned self] ids, state in
            let time = self.now()
            return ids.filter { id in
                // an empty page has nothing worth going back to, an encrypted one never keeps a plain copy
                guard let doc = state.docs[id] else { return false }
                return !Doc.isDocEmpty(doc) && state.pages[id]?.encrypted != true && History.snapshotDue(self.lastSnapshot[id], time)
            }.map { self.snapshotOf($0, state, time) }
        }
        options.onSnapshotsWritten = { [unowned self] snapshots in
            for snapshot in snapshots { self.lastSnapshot[snapshot.pageId] = snapshot.createdAt }
        }
        queue = SaveQueue(write: { [unowned self] batch in try self.writer.write(batch) }, getState: { [unowned self] in self.state },
                          timer: timer, options: options)
    }

    /// `WorkspaceSession.open` on a scanned vault. The timer runs the queue's delayed saves; without one, nothing
    /// is saved until `flush`.
    static func open(_ scan: VaultLoad.Scan, writer: VaultWriter, timer: SaveTimer = ManualTimer(),
                     now: @escaping () -> Double = JSEnvironment.now,
                     newSnapshotId: @escaping () -> String = { UUID().uuidString.lowercased() }) -> CoreSession {
        CoreSession(writer: writer, opened: writer.load(scan), timer: timer, now: now, newSnapshotId: newSnapshotId)
    }

    /// A timer that never fires by itself, for tests and for callers that save with `flush`.
    final class ManualTimer: SaveTimer {
        func schedule(after delay: Double, _ fire: @escaping () -> Void) {}
        func cancel() {}
    }

    var saveStatus: SaveQueue.Status { queue.status }
    var hasPending: Bool { queue.hasPending }
    func isDirty(_ id: String) -> Bool { queue.isDirty(id) }
    func pathOf(_ id: String) -> String? { writer.pathOf(id) }

    // MARK: commands

    @discardableResult
    func execute(_ command: CoreCommand) -> Result<WorkspaceState, CommandFailure> {
        switch command {
        case .setDoc(let id, _, _) where unreadable.has(id), .setTaskChecked(let id, _, _, _) where unreadable.has(id):
            return .failure(CommandFailure(message: "This page could not be read, so it is protected from changes."))
        default:
            break
        }
        switch CoreCommands.applyCommand(state, command) {
        case .failure(let error):
            return .failure(error)
        case .success(let applied):
            if applied.unchanged { return .success(state) }
            state = applied.state
            queue.enqueue(applied.changes)
            return .success(state)
        }
    }

    /// several commands as one unit, nothing is applied if any of them fails
    @discardableResult
    func executeAll(_ commands: [CoreCommand]) -> Result<WorkspaceState, CommandFailure> {
        var draft = state
        var all = Changes()
        for command in commands {
            switch CoreCommands.applyCommand(draft, command) {
            case .failure(let error): return .failure(error)
            case .success(let applied):
                draft = applied.state
                for id in applied.changes.pages { all.pages.insert(id) }
                for id in applied.changes.docs { all.docs.insert(id) }
                for id in applied.changes.removed { all.removed.insert(id) }
            }
        }
        state = draft
        queue.enqueue(all)
        return .success(draft)
    }

    /// writes everything outstanding now; true when nothing is left unsaved
    @discardableResult
    func flush() -> Bool { queue.flush() }

    func markInitialized() throws(VaultWriteError) {
        try writer.markInitialized()
    }

    func close() {
        flush()
        queue.dispose()
    }

    // MARK: encrypted pages

    func unlockPage(_ id: String, _ password: String) -> Result<WorkspaceState, CommandFailure> {
        switch writer.unlockPage(id, password, state) {
        case .failure(let error): return .failure(error)
        case .success(let opened):
            unreadable.remove(id)
            state.pages[id] = opened.page
            state.docs[id] = opened.doc
            return .success(state)
        }
    }

    /// saves the page, then forgets its key and its content until it is unlocked again
    func lockPage(_ id: String) {
        flush()
        writer.lockPage(id)
        unreadable.insert(id)
        state.docs[id] = nil
    }

    func protectPage(_ id: String, _ password: String) -> Result<WorkspaceState, CommandFailure> {
        flush()
        do {
            try writer.protectPage(id, password)
        } catch {
            return .failure(CommandFailure(message: "The page could not be encrypted."))
        }
        let result = execute(.setEncrypted(id: id, encrypted: true, now: now()))
        if case .success = result { flush() }
        return result
    }

    func unprotectPage(_ id: String) -> Result<WorkspaceState, CommandFailure> {
        let result = execute(.setEncrypted(id: id, encrypted: false, now: now()))
        guard case .success = result else { return result }
        flush()
        writer.unprotectPage(id)
        return result
    }

    // MARK: morrow's own files, attachments and history

    func readMeta(_ name: String) -> String? { writer.readMeta(name) }
    func writeMeta(_ name: String, _ text: String) throws(VaultWriteError) { try writer.writeMeta(name, text) }
    func activity() -> JSObject { writer.activity() }

    /// files are written straight away, a page only references them once they are safely stored
    func addFiles(_ files: [(meta: FileMeta, data: Data)]) -> Result<[FileMeta], CommandFailure> {
        do {
            return .success(try writer.putFiles(files))
        } catch {
            let message = (error as? VaultWriteError)?.message ?? error.localizedDescription
            return .failure(CommandFailure(message: "The file could not be saved: \(message)"))
        }
    }

    func getFile(_ id: String) -> (meta: FileMeta, data: Data)? { writer.getFile(id) }
    func listFiles() -> [FileMeta] { writer.listFiles() }
    func deleteFiles(_ ids: [String]) throws(VaultWriteError) { try writer.deleteFiles(ids) }
    func listSnapshots(_ pageId: String) -> [Snapshot] { writer.listSnapshots(pageId) }
    func allSnapshots() -> [Snapshot] { writer.allSnapshots() }

    /// earlier versions brought over from another storage, written as they are
    func importSnapshots(_ snapshots: [Snapshot]) throws(VaultWriteError) {
        if snapshots.isEmpty { return }
        flush()
        try writer.write(WriteBatch(snapshots: snapshots, state: state))
    }

    /// the current content is kept as a version first, so restoring can always be undone. `at` is the time the
    /// restored document is set at, given when someone else applies the same edit.
    func restoreSnapshot(_ snapshot: Snapshot, at: Double? = nil) -> Result<WorkspaceState, CommandFailure> {
        guard state.pages.has(snapshot.pageId) else { return .failure(CommandFailure(message: "That page no longer exists.")) }
        flush()
        let current = snapshotOf(snapshot.pageId, state, now())
        do {
            try writer.write(WriteBatch(snapshots: [current]))
        } catch {
            return .failure(CommandFailure(message: "The current version could not be kept, so nothing was restored: Error: \(error.message)"))
        }
        lastSnapshot[snapshot.pageId] = current.createdAt
        return execute(.setDoc(id: snapshot.pageId, doc: .object(snapshot.doc), now: at ?? now()))
    }

    private func snapshotOf(_ pageId: String, _ state: WorkspaceState, _ time: Double) -> Snapshot {
        Snapshot(id: newSnapshotId(), pageId: pageId, title: state.pages[pageId]?.title ?? "", doc: state.docs[pageId] ?? JSObject(), createdAt: time)
    }

    // MARK: edits made elsewhere

    /// reads what the file watcher saw against the live workspace, nil when no page changed
    func readChanges(_ changes: [VaultChange]) -> VaultWriter.ExternalRead? {
        writer.readChanges(changes, state)
    }

    /// takes in pages changed by another app; a page with unsaved changes here keeps them, and the other version
    /// goes to its history when this one is saved. `only` limits it further to what someone else accepted.
    @discardableResult
    func applyExternal(_ patch: ExternalPatch, only: JSSet? = nil) -> [String] {
        var accepted: [String] = []
        for page in patch.pages where !queue.isDirty(page.id) && only?.has(page.id) != false {
            state.pages[page.id] = page
            if let doc = patch.docs[page.id] { state.docs[page.id] = doc }
            accepted.append(page.id)
        }
        for id in patch.removed where !queue.isDirty(id) && only?.has(id) != false {
            state.pages[id] = nil
            state.docs[id] = nil
            accepted.append(id)
        }
        let acceptedSet = JSSet(accepted)
        for id in patch.unreadable where acceptedSet.has(id) { unreadable.insert(id) }
        for id in patch.readable where acceptedSet.has(id) { unreadable.remove(id) }
        return accepted
    }

    func commitExternal(_ read: VaultWriter.ExternalRead, accepted: [String]) {
        writer.commit(read, accepted: JSSet(accepted))
    }

    /// Morrow's whole path for an outside edit, when this session decides alone
    func receive(_ changes: [VaultChange]) -> (patch: ExternalPatch, accepted: [String])? {
        guard let read = readChanges(changes) else { return nil }
        let accepted = applyExternal(read.patch)
        commitExternal(read, accepted: accepted)
        return (read.patch, accepted)
    }
}
