import EditingCore
import Foundation
import Observation
import SyncCore

/// Joins one document's sync (`DocumentSync`) to its text view.
@MainActor
@Observable
final class DocumentController {
    let documentName: String?
    private(set) var state: DocumentSync.State = .connecting
    private(set) var loaded = false

    let runtime: EditingRuntime
    @ObservationIgnored let sync: DocumentSync?
    @ObservationIgnored private var localSource: String?
    @ObservationIgnored private weak var textView: SourceTextView?
    @ObservationIgnored private var undoing = false

    /// A server document.
    init(documentName: String, collabURL: URL, runtime: EditingRuntime) {
        self.documentName = documentName
        self.runtime = runtime
        let sync = DocumentSync(collabURL: collabURL, documentName: documentName)
        self.sync = sync
        sync.onState = { [weak self] state in
            guard let self else { return }
            self.state = state
            if state == .synced, !self.loaded { self.loadIntoView() }
        }
        sync.onChanges = { [weak self] changes in
            guard let self else { return }
            self.textView?.applyExternal(changes, placeCaret: self.undoing)
            self.verify()
        }
        sync.onLog = { NSLog("SynapseNote %@", $0) }
        sync.connect()
    }

    /// A local document without a server (the keystroke probe).
    init(localSource: String, runtime: EditingRuntime) {
        documentName = nil
        self.runtime = runtime
        sync = nil
        self.localSource = localSource
        state = .synced
    }

    func attach(_ textView: SourceTextView) {
        self.textView = textView
        textView.controller = self
        if state == .synced { loadIntoView() }
    }

    func close() {
        sync?.disconnect()
    }

    private func loadIntoView() {
        guard let textView else { return }
        let source = sync?.text ?? localSource ?? ""
        do {
            try textView.load(source: source, runtime: runtime)
            loaded = true
        } catch {
            NSLog("SynapseNote could not open %@: %@", documentName ?? "document", String(describing: error))
        }
    }

    // MARK: Called by the text view

    /// Edits the view made and already shows.
    func didEditLocally(_ changes: [SequentialChange]) {
        guard let sync else { return }
        do {
            try sync.applyLocal(changes)
        } catch {
            NSLog("SynapseNote local edit failed: %@", String(describing: error))
        }
        verify()
    }

    func userMovedSelection() {
        sync?.stopCapturing()
    }

    var canUndo: Bool { sync?.canUndo ?? false }
    var canRedo: Bool { sync?.canRedo ?? false }

    func undo() { step { try $0.undo() } }
    func redo() { step { try $0.redo() } }

    private func step(_ body: (DocumentSync) throws -> Bool) {
        guard let sync else { return }
        undoing = true
        defer { undoing = false }
        _ = try? body(sync)
    }

    /// The view, the editing session and Y.Text must hold the same source.
    /// If the lengths drift, rebuild the view from Y.Text (the server's copy).
    private func verify() {
        guard let sync, let textView, loaded else { return }
        let expected = Int(sync.doc.len())
        if textView.sourceLength != expected {
            NSLog("SynapseNote view drifted from Y.Text (%d vs %d); reloading", textView.sourceLength, expected)
            loadIntoView()
        }
    }
}
