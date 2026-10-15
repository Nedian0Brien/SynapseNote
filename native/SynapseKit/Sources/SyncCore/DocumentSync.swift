import Foundation

/// Replace `[from, to)` with `insert`, in the offsets the previous change in
/// the same list left (UTF-16 code units).
public struct SequentialChange: Equatable, Sendable {
    public var from: Int
    public var to: Int
    public var insert: String

    public init(from: Int, to: Int, insert: String) {
        self.from = from
        self.to = to
        self.insert = insert
    }
}

/// Turn a Y.Text delta into sequential changes.
public func sequentialChanges(_ delta: [TextDelta]) -> [SequentialChange] {
    var changes: [SequentialChange] = []
    var at = 0
    for step in delta {
        switch step {
        case .retain(let len):
            at += Int(len)
        case .insert(let text):
            changes.append(SequentialChange(from: at, to: at, insert: text))
            at += (text as NSString).length
        case .delete(let len):
            changes.append(SequentialChange(from: at, to: at + Int(len), insert: ""))
        }
    }
    return changes
}

/// One document's `Y.Text('source')` kept in sync with the server.
///
/// The view applies its own edits with `applyLocal` and receives every other
/// change — remote edits and this client's undo/redo — through `onChanges`,
/// as sequential changes in the order they happened.
@MainActor
public final class DocumentSync {
    public enum State: Equatable, Sendable {
        case connecting
        /// The first full sync finished; `text` holds the server's document.
        case synced
        case offline
    }

    public let documentName: String
    public let doc = SourceDoc()
    public private(set) var state: State = .connecting {
        didSet { if state != oldValue { onState?(state) } }
    }

    public var onState: ((State) -> Void)?
    /// Changes the view did not make, in order.
    public var onChanges: (([SequentialChange]) -> Void)?
    public var onLog: ((String) -> Void)?

    private let connection: HocuspocusConnection
    private var hasSynced = false

    public init(collabURL: URL, documentName: String) {
        self.documentName = documentName
        connection = HocuspocusConnection(url: collabURL, documentName: documentName)
        connection.onAuthenticated = { [weak self] in
            guard let self else { return }
            self.connection.sendYMessage(self.doc.syncStep1())
        }
        connection.onFrame = { [weak self] frame in self?.handle(frame) }
        connection.onStatus = { [weak self] status in
            guard let self else { return }
            if status == .disconnected { self.state = .offline }
            if status == .connecting, !self.hasSynced { self.state = .connecting }
        }
        connection.onLog = { [weak self] message in self?.onLog?("[\(documentName)] \(message)") }
    }

    public var text: String { doc.text() }

    public func connect() { connection.connect() }
    public func disconnect() { connection.disconnect() }

    /// Apply edits the view already shows and broadcast them.
    public func applyLocal(_ changes: [SequentialChange]) throws {
        let mapped = changes.map { TextChange(from: UInt32($0.from), to: UInt32($0.to), insert: $0.insert) }
        if let update = try doc.localEdits(changes: mapped) {
            connection.sendYMessage(update)
        }
    }

    /// Undo this client's last step; the changes arrive through `onChanges`.
    @discardableResult
    public func undo() throws -> Bool { try finish(doc.undo()) }

    @discardableResult
    public func redo() throws -> Bool { try finish(doc.redo()) }

    public var canUndo: Bool { doc.canUndo() }
    public var canRedo: Bool { doc.canRedo() }

    /// Start a new undo step with the next edit (after a caret move, for example).
    public func stopCapturing() { doc.stopCapturing() }

    private func finish(_ result: UndoResult) throws -> Bool {
        if let update = result.update { connection.sendYMessage(update) }
        deliver(result.deltas)
        return result.applied
    }

    private func handle(_ frame: HocuspocusFrame.Incoming) {
        guard frame.type == HocuspocusFrame.MessageType.sync.rawValue else { return }
        var reader = Lib0.Reader(frame.body)
        let step = try? reader.readVarUint()
        do {
            let result = try doc.receive(message: frame.yMessage)
            for reply in result.replies { connection.sendYMessage(reply) }
            if hasSynced {
                deliver(result.deltas)
            }
            // SyncStep2 (1) answers our SyncStep1 and completes a (re)sync.
            if step == 1 {
                hasSynced = true
                state = .synced
            }
        } catch {
            onLog?("[\(documentName)] sync message failed: \(error)")
        }
    }

    private func deliver(_ deltas: [[TextDelta]]) {
        for delta in deltas {
            let changes = sequentialChanges(delta)
            if !changes.isEmpty { onChanges?(changes) }
        }
    }
}
