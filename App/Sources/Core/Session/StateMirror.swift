import Foundation

/// A copy of the editor page's Morrow session, kept from the state deltas the page sends (web/src/stateDelta.ts).
/// Since 11c-2 the Swift session owns the workspace and answers the native screens; debug builds keep this copy
/// to check that the page's session holds the same workspace.
nonisolated final class StateMirror {
    private(set) var revision = 0
    /// false until the whole workspace has arrived once
    private(set) var ready = false
    private(set) var state = WorkspaceState()
    private(set) var unreadable = JSSet()
    /// saves per day, as `repository.activity()`
    private(set) var activity = JSObject()
    /// flashcard progress, as `reviews.log()`
    private(set) var reviewLog = JSObject()

    func reset() {
        revision = 0
        ready = false
        state = WorkspaceState()
        unreadable = JSSet()
        activity = JSObject()
        reviewLog = JSObject()
    }

    /// Applies one delta; false when it is older than what is held, or not a delta.
    @discardableResult
    func apply(_ delta: JSValue) -> Bool {
        guard case .object(let fields) = delta, let revision = fields["revision"]?.number else { return false }
        let full = fields["full"] == .bool(true)
        if !full, !ready || Int(revision) <= self.revision { return false }
        if full { state = WorkspaceState() }
        for page in fields["pages"]?.array ?? [] {
            if let meta = PageMeta(json: page) { state.pages[meta.id] = meta }
        }
        for (id, doc) in fields["docs"]?.object ?? JSObject() {
            if let object = doc.object { state.docs[id] = object }
        }
        for id in (fields["removed"]?.array ?? []).compactMap(\.string) {
            state.pages[id] = nil
            state.docs[id] = nil
        }
        for id in (fields["removedDocs"]?.array ?? []).compactMap(\.string) { state.docs[id] = nil }
        unreadable = JSSet((fields["unreadable"]?.array ?? []).compactMap(\.string))
        if let activity = fields["activity"]?.object { self.activity = activity }
        if let log = fields["reviewLog"]?.object { reviewLog = log }
        self.revision = Int(revision)
        ready = true
        return true
    }
}
