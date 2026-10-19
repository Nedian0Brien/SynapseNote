import Foundation

/// A version of a page kept in page history (Morrow's `Snapshot`).
nonisolated struct Snapshot: Equatable, Sendable {
    var id: String
    var pageId: String
    var title: String
    var doc: DocNode
    /// milliseconds since 1970
    var createdAt: Double
}

/// Runs the save queue's next write after a delay, one at a time: scheduling again replaces what was waiting.
nonisolated protocol SaveTimer: AnyObject {
    /// calls `fire` once after `delay` milliseconds unless `cancel` comes first
    func schedule(after delay: Double, _ fire: @escaping () -> Void)
    func cancel()
}

/// Morrow's storage/saveQueue.ts: changed records gathered into one write, written 300 ms after the last change,
/// and kept when a write fails until one lands, retrying after 1 s, 2 s, 4 s … up to 30 s. Writes here are
/// synchronous calls, so a write never overlaps another.
nonisolated final class SaveQueue {
    enum State: String, Sendable {
        case saved, pending, saving, error
    }

    struct Status: Equatable, Sendable {
        var state: State = .saved
        /// milliseconds since 1970
        var lastSavedAt: Double?
        var error: String?
        var failures = 0
    }

    struct Options {
        var delay = 300.0
        var maxRetry = 30_000.0
        var now: () -> Double = { Date().timeIntervalSince1970 * 1000 }
        /// versions to store alongside the documents being written
        var snapshotsFor: ([String], WorkspaceState) -> [Snapshot] = { _, _ in [] }
        var onSnapshotsWritten: ([Snapshot]) -> Void = { _ in }
    }

    private var dirtyPages = JSSet()
    private var dirtyDocs = JSSet()
    private var removed = JSSet()
    private var writing = JSSet()
    private var inFlight = false
    private(set) var status = Status()
    /// called after every change of `status`
    var onStatus: () -> Void = {}

    private let write: (WriteBatch) throws -> Void
    private let getState: () -> WorkspaceState
    private let timer: SaveTimer
    private let options: Options

    init(write: @escaping (WriteBatch) throws -> Void, getState: @escaping () -> WorkspaceState, timer: SaveTimer, options: Options = Options()) {
        self.write = write
        self.getState = getState
        self.timer = timer
        self.options = options
    }

    /// true while the page has changes that are not on disk yet; edits made elsewhere must not replace them
    func isDirty(_ id: String) -> Bool {
        dirtyPages.has(id) || dirtyDocs.has(id) || removed.has(id) || writing.has(id)
    }

    var hasPending: Bool { !dirtyPages.isEmpty || !dirtyDocs.isEmpty || !removed.isEmpty || inFlight }

    func enqueue(_ changes: Changes) {
        for id in changes.pages { dirtyPages.insert(id) }
        for id in changes.docs { dirtyDocs.insert(id) }
        for id in changes.removed {
            removed.insert(id)
            dirtyPages.remove(id)
            dirtyDocs.remove(id)
        }
        if !hasPending { return }
        if status.state != .error { setStatus { $0.state = .pending } }
        schedule(status.state == .error ? retryDelay : options.delay)
    }

    /// writes everything outstanding now; true when nothing is left unsaved
    @discardableResult
    func flush() -> Bool {
        timer.cancel()
        if !dirtyPages.isEmpty || !dirtyDocs.isEmpty || !removed.isEmpty {
            inFlight = true
            writeOnce()
        }
        return !hasPending
    }

    func dispose() {
        timer.cancel()
        onStatus = {}
    }

    private func writeOnce() {
        let pages = dirtyPages.items
        let docs = dirtyDocs.items
        let gone = removed.items
        dirtyPages = JSSet()
        dirtyDocs = JSSet()
        removed = JSSet()
        writing = JSSet(pages + docs + gone)
        setStatus { $0.state = .saving }

        let state = getState()
        var batch = WriteBatch(state: state)
        for id in pages { if let page = state.pages[id] { batch.pages.append(page) } }
        for id in docs { if let doc = state.docs[id] { batch.docs.append((id, doc)) } }
        for id in gone where !state.pages.has(id) { batch.removed.append(id) }

        do {
            batch.snapshots = options.snapshotsFor(batch.docs.map(\.id), state)
            try write(batch)
            if !batch.snapshots.isEmpty { options.onSnapshotsWritten(batch.snapshots) }
            writing = JSSet()
            inFlight = false
            let more = !dirtyPages.isEmpty || !dirtyDocs.isEmpty || !removed.isEmpty
            let now = options.now()
            setStatus { $0 = Status(state: more ? .pending : .saved, lastSavedAt: now, error: nil, failures: 0) }
            if more { schedule(options.delay) }
        } catch {
            // the ids go back so the next attempt writes the latest version of each record
            for id in pages where !removed.has(id) { dirtyPages.insert(id) }
            for id in docs where !removed.has(id) { dirtyDocs.insert(id) }
            for id in gone { removed.insert(id) }
            writing = JSSet()
            inFlight = false
            let message = (error as? VaultWriteError)?.message ?? error.localizedDescription
            setStatus {
                $0.state = .error
                $0.error = message
                $0.failures += 1
            }
            schedule(retryDelay)
        }
    }

    private var retryDelay: Double {
        min(options.maxRetry, 1000 * pow(2, Double(max(0, status.failures - 1))))
    }

    private func schedule(_ delay: Double) {
        timer.cancel()
        timer.schedule(after: delay) { [weak self] in self?.flush() }
    }

    private func setStatus(_ change: (inout Status) -> Void) {
        change(&status)
        onStatus()
    }
}
