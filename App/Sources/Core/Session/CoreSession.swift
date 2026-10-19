import Foundation

/// Morrow's storage/session.ts and saveQueue.ts without their timers: the workspace in memory, commands applied
/// to it, and the records they touched gathered until the next save. Saving goes through a VaultWriter; when to
/// save (Morrow waits 300 ms and retries with backoff) is the caller's, which 11c brings.
nonisolated final class CoreSession {
    private(set) var state: WorkspaceState
    private(set) var unreadable: JSSet
    let problems: [String]
    let firstRun: Bool
    private let writer: VaultWriter

    private var dirtyPages = JSSet()
    private var dirtyDocs = JSSet()
    private var removed = JSSet()

    private init(writer: VaultWriter, opened: VaultWriter.Opened) {
        self.writer = writer
        var state = WorkspaceState()
        for page in opened.pages { state.pages[page.id] = page }
        state.docs = opened.docs
        self.state = state
        unreadable = JSSet(opened.unreadable)
        problems = opened.problems
        firstRun = opened.firstRun
    }

    /// `WorkspaceSession.open` on a scanned vault.
    static func open(_ scan: VaultLoad.Scan, writer: VaultWriter) -> CoreSession {
        CoreSession(writer: writer, opened: writer.load(scan))
    }

    var hasPending: Bool { !dirtyPages.isEmpty || !dirtyDocs.isEmpty || !removed.isEmpty }

    func isDirty(_ id: String) -> Bool { dirtyPages.has(id) || dirtyDocs.has(id) || removed.has(id) }

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
            enqueue(applied.changes)
            return .success(state)
        }
    }

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
        enqueue(all)
        return .success(draft)
    }

    private func enqueue(_ changes: Changes) {
        for id in changes.pages { dirtyPages.insert(id) }
        for id in changes.docs { dirtyDocs.insert(id) }
        for id in changes.removed {
            removed.insert(id)
            dirtyPages.remove(id)
            dirtyDocs.remove(id)
        }
    }

    /// `SaveQueue.flush`: writes what is dirty, and on failure keeps it dirty for the next try.
    func flush() throws(VaultWriteError) {
        guard hasPending else { return }
        let pages = dirtyPages.items
        let docs = dirtyDocs.items
        let gone = removed.items
        dirtyPages = JSSet()
        dirtyDocs = JSSet()
        removed = JSSet()
        var batch = WriteBatch(state: state)
        for id in pages { if let page = state.pages[id] { batch.pages.append(page) } }
        for id in docs { if let doc = state.docs[id] { batch.docs.append((id, doc)) } }
        for id in gone where !state.pages.has(id) { batch.removed.append(id) }
        do {
            try writer.write(batch)
        } catch {
            for id in pages where !removed.has(id) { dirtyPages.insert(id) }
            for id in docs where !removed.has(id) { dirtyDocs.insert(id) }
            for id in gone { removed.insert(id) }
            throw error
        }
    }

    func markInitialized() throws(VaultWriteError) {
        try writer.markInitialized()
    }
}
