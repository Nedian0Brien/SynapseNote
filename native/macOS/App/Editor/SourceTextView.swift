import AppKit
import EditingCore
import QuartzCore

/// Time spent on one edit, in milliseconds.
struct EditTiming {
    /// The editing model in JavaScriptCore (`EditorSession.edit`).
    var model: Double
    /// Applying the changes and restyling the dirty blocks.
    var apply: Double
}

/// A TextKit 2 text view whose storage is the document's Markdown source.
///
/// The editing model decides what every key does (SPEC.md §4–9): input,
/// deletion, Enter, Tab, ←/→ and paste become `EditAction`s, and the source
/// changes the model returns are written back into the storage. The view
/// never edits the storage on its own, except for IME composition, which is
/// removed again before the committed text goes through the model.
@MainActor
final class SourceTextView: NSTextView {
    private(set) var session: EditorSession?
    let styler = LiveStyler()
    private(set) var lastTiming: EditTiming?
    /// True while the view changes its own storage or selection.
    private var applying = false

    func configure() {
        isRichText = true
        allowsUndo = false
        isAutomaticQuoteSubstitutionEnabled = false
        isAutomaticDashSubstitutionEnabled = false
        isAutomaticTextReplacementEnabled = false
        isAutomaticSpellingCorrectionEnabled = false
        isContinuousSpellCheckingEnabled = false
        smartInsertDeleteEnabled = false
        textContainerInset = NSSize(width: 48, height: 32)
        typingAttributes = styler.baseAttributes
    }

    func load(source: String, runtime: EditingRuntime) throws {
        let session = try runtime.makeSession(source: source)
        let snapshot = try session.snapshot()
        self.session = session
        guard let storage = textStorage else { return }
        applying = true
        editStorage {
            storage.setAttributedString(NSAttributedString(string: source, attributes: styler.baseAttributes))
            styler.restyle(storage, dirty: SourceRange(from: 0, to: storage.length), layout: snapshot.layout, blocks: snapshot.blocks)
        }
        setSelectedRange(NSRange(location: 0, length: 0))
        applying = false
        scroll(.zero)
    }

    /// TextKit 2 sees storage edits only inside the content storage's editing
    /// transaction; edits made outside it leave stale paragraph layout.
    private func editStorage(_ body: () -> Void) {
        guard let storage = textStorage else { return }
        withoutActuallyEscaping(body) { body in
            let apply = {
                storage.beginEditing()
                body()
                storage.endEditing()
            }
            if let contentStorage = textLayoutManager?.textContentManager as? NSTextContentStorage {
                contentStorage.performEditingTransaction(apply)
            } else {
                apply()
            }
        }
    }

    // MARK: Input

    override func insertText(_ string: Any, replacementRange: NSRange) {
        let text = (string as? NSAttributedString)?.string ?? (string as? String) ?? ""
        if hasMarkedText() {
            // IME commit: take the composing text out again; the model inserts the result.
            let marked = markedRange()
            applying = true
            super.setMarkedText("", selectedRange: NSRange(location: 0, length: 0), replacementRange: marked)
            super.unmarkText()
            applying = false
            setSelectionForModel(NSRange(location: marked.location, length: 0))
        } else if replacementRange.location != NSNotFound {
            setSelectionForModel(replacementRange)
        }
        guard !text.isEmpty else { return }
        run([.text(text)])
    }

    override func setMarkedText(_ string: Any, selectedRange: NSRange, replacementRange: NSRange) {
        if !hasMarkedText(), self.selectedRange().length > 0 {
            // Composition replaces the selection; delete it through the model first.
            run([.key(.backspace)])
        }
        typingAttributes = styler.baseAttributes
        applying = true
        super.setMarkedText(string, selectedRange: selectedRange, replacementRange: replacementRange)
        applying = false
    }

    override func doCommand(by selector: Selector) {
        switch selector {
        case #selector(deleteBackward(_:)): run([.key(.backspace)])
        case #selector(deleteForward(_:)): run([.key(.delete)])
        case #selector(insertNewline(_:)): run([.key(.enter)])
        case #selector(insertLineBreak(_:)), #selector(insertNewlineIgnoringFieldEditor(_:)): run([.key(.shiftEnter)])
        case #selector(insertTab(_:)): run([.key(.tab)])
        case #selector(insertBacktab(_:)): run([.key(.shiftTab)])
        case #selector(moveRight(_:)): run([.key(.arrowRight)])
        case #selector(moveLeft(_:)): run([.key(.arrowLeft)])
        default: super.doCommand(by: selector)
        }
    }

    override func paste(_ sender: Any?) {
        let board = NSPasteboard.general
        let text = board.string(forType: .string)
        let html = board.string(forType: .html)
        guard text != nil || html != nil else { return }
        run([.paste(text: text, html: html, asMarkdown: false)])
    }

    override func pasteAsPlainText(_ sender: Any?) {
        guard let text = NSPasteboard.general.string(forType: .string) else { return }
        run([.paste(text: text, html: nil, asMarkdown: true)])
    }

    override func copy(_ sender: Any?) {
        guard selectedRange().length > 0 else { return }
        run([.copy])
    }

    override func cut(_ sender: Any?) {
        guard selectedRange().length > 0 else { return }
        run([.copy, .key(.backspace)])
    }

    // MARK: Selection

    override func setSelectedRanges(_ ranges: [NSValue], affinity: NSSelectionAffinity, stillSelecting: Bool) {
        super.setSelectedRanges(ranges, affinity: affinity, stillSelecting: stillSelecting)
        guard !applying, !stillSelecting, !hasMarkedText() else { return }
        syncSelectionToModel()
    }

    private func setSelectionForModel(_ range: NSRange) {
        applying = true
        setSelectedRange(range)
        applying = false
        syncSelectionToModel()
    }

    private func syncSelectionToModel() {
        let range = selectedRange()
        try? session?.select(anchor: range.location, head: range.location + range.length)
    }

    // MARK: Applying the model's result

    func run(_ actions: [EditAction]) {
        guard let session, let storage = textStorage else { return }
        let start = CACurrentMediaTime()
        let result: EditResult
        do {
            result = try session.edit(actions)
        } catch {
            NSLog("SynapseNote edit failed: %@", String(describing: error))
            NSSound.beep()
            return
        }
        let modelDone = CACurrentMediaTime()

        applying = true
        if !result.changes.isEmpty {
            editStorage {
                for change in result.changes.reversed() {
                    storage.replaceCharacters(in: NSRange(location: change.from, length: change.to - change.from), with: change.insert)
                }
                styler.restyle(storage, dirty: result.dirty, layout: result.layout, blocks: result.blocks)
            }
        }
        let from = min(result.anchor, result.head)
        setSelectedRange(NSRange(location: from, length: abs(result.head - result.anchor)))
        typingAttributes = styler.baseAttributes
        applying = false

        if let markdown = result.clipboard?.markdown {
            let board = NSPasteboard.general
            board.clearContents()
            board.setString(markdown, forType: .string)
        }
        scrollRangeToVisible(selectedRange())
        lastTiming = EditTiming(model: (modelDone - start) * 1000, apply: (CACurrentMediaTime() - modelDone) * 1000)
    }
}
