import UIKit

/// Keeps a TextKit 2 `UITextView`'s text storage and `Y.Text('source')` equal.
///
/// The text storage *is* the Markdown source. Local edits arrive through
/// `didProcessEditing`, which reports the edited range after the fact; the
/// deleted text is gone by then, but its length is `editedRange.length -
/// changeInLength`, and Y.Text still holds it, so a remove + insert at
/// `editedRange.location` reproduces the edit. Remote deltas are applied to
/// the storage with `applyingRemote` set so they are not echoed back.
@MainActor
final class TextBinding: NSObject, NSTextStorageDelegate {
    let doc: SpikeDoc
    let client: HocuspocusClient
    weak var textView: UITextView?

    /// Called after every local edit with the time spent in the binding
    /// (storage edit → yrs transaction → send), for the keystroke metric.
    var onLocalEdit: ((_ elapsed: TimeInterval, _ range: NSRange, _ inserted: String) -> Void)?
    /// Called with the text a remote change inserted, and the range it now occupies.
    var onRemoteInsert: ((_ text: String, _ range: NSRange) -> Void)?
    /// Called after remote deltas were applied.
    var onRemoteApplied: (() -> Void)?
    var onLog: ((String) -> Void)?

    private(set) var applyingRemote = false
    private(set) var divergenceCount = 0

    init(doc: SpikeDoc, client: HocuspocusClient, textView: UITextView) {
        self.doc = doc
        self.client = client
        self.textView = textView
        super.init()
        textView.textStorage.delegate = self
    }

    nonisolated func textStorage(
        _ textStorage: NSTextStorage,
        didProcessEditing editedMask: NSTextStorage.EditActions,
        range editedRange: NSRange,
        changeInLength delta: Int
    ) {
        MainActor.assumeIsolated {
            handleEdit(textStorage, editedMask: editedMask, range: editedRange, delta: delta)
        }
    }

    private func handleEdit(_ storage: NSTextStorage, editedMask: NSTextStorage.EditActions, range: NSRange, delta: Int) {
        guard editedMask.contains(.editedCharacters), !applyingRemote else { return }
        let start = CACurrentMediaTime()
        let deleted = range.length - delta
        let inserted = (storage.string as NSString).substring(with: range)
        do {
            if let message = try doc.localEdit(
                index: UInt32(range.location),
                deleteLen: UInt32(deleted),
                insert: inserted
            ) {
                client.sendYMessage(message)
            }
        } catch {
            onLog?("local edit rejected: \(error)")
        }
        if doc.len() != UInt32(storage.length) {
            divergenceCount += 1
            onLog?("length diverged: doc \(doc.len()) vs view \(storage.length)")
        }
        onLocalEdit?(CACurrentMediaTime() - start, range, inserted)
    }

    /// Apply remote deltas to the view, moving the selection with the text.
    func apply(_ deltas: [[TextDelta]]) {
        guard let textView else { return }
        let storage = textView.textStorage
        var selection = textView.selectedRange
        var inserts: [(String, NSRange)] = []

        applyingRemote = true
        storage.beginEditing()
        for delta in deltas {
            var index = 0
            for op in delta {
                switch op {
                case .retain(let len):
                    index += Int(len)
                case .insert(let text):
                    let length = (text as NSString).length
                    storage.replaceCharacters(in: NSRange(location: index, length: 0), with: text)
                    selection = Self.shift(selection, insertAt: index, length: length)
                    inserts.append((text, NSRange(location: index, length: length)))
                    index += length
                case .delete(let len):
                    let length = Int(len)
                    storage.deleteCharacters(in: NSRange(location: index, length: length))
                    selection = Self.shift(selection, deleteAt: index, length: length)
                }
            }
        }
        storage.endEditing()
        applyingRemote = false

        textView.selectedRange = selection
        for (text, range) in inserts { onRemoteInsert?(text, range) }
        onRemoteApplied?()
    }

    nonisolated static func shift(_ selection: NSRange, insertAt index: Int, length: Int) -> NSRange {
        var s = selection
        if index <= s.location {
            s.location += length
        } else if index < s.location + s.length {
            s.length += length
        }
        return s
    }

    nonisolated static func shift(_ selection: NSRange, deleteAt index: Int, length: Int) -> NSRange {
        let deleteEnd = index + length
        var start = selection.location
        var end = selection.location + selection.length
        func move(_ position: Int) -> Int {
            if position <= index { return position }
            if position >= deleteEnd { return position - length }
            return index
        }
        start = move(start)
        end = move(end)
        return NSRange(location: start, length: end - start)
    }
}
