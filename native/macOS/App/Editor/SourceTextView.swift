import AppKit
import EditingCore
import QuartzCore
import SyncCore

/// Time spent on one edit, in milliseconds.
struct EditTiming {
    /// The editing model in JavaScriptCore (`EditorSession.edit`).
    var model: Double
    /// Applying the changes, restyling the dirty blocks and sending them to Y.Text.
    var apply: Double
}

/// A TextKit 2 text view whose storage is the document's Markdown source.
///
/// In the live view the editing model decides what every key does (SPEC.md
/// §4–9): input, deletion, Enter, Tab, ←/→, paste and the format shortcuts
/// become `EditAction`s, and the source changes the model returns are written
/// back into the storage and sent to Y.Text. Edits the text system makes on
/// its own — the source view, find & replace — are caught as storage edits
/// and passed to the model and Y.Text as plain changes.
@MainActor
final class SourceTextView: NSTextView, NSTextStorageDelegate {
    weak var controller: DocumentController?
    private(set) var session: EditorSession?
    let styler = LiveStyler()
    private(set) var lastTiming: EditTiming?
    private(set) var sourceMode = false

    /// True while the view changes its own storage or selection.
    private var applying = false
    /// Storage edits the text system made itself, waiting to reach the model.
    private var externalEdits: [SequentialChange] = []
    /// Remote changes that arrived during IME composition.
    private var deferredRemote: [[SequentialChange]] = []

    var sourceLength: Int { textStorage?.length ?? 0 }
    /// `NSTextLayoutManager.delegate` is weak; the view keeps it alive.
    private let fragmentDelegate = DecoratedLayoutManagerDelegate()

    func configure() {
        isRichText = true
        allowsUndo = false
        usesFindBar = true
        isIncrementalSearchingEnabled = true
        isAutomaticQuoteSubstitutionEnabled = false
        isAutomaticDashSubstitutionEnabled = false
        isAutomaticTextReplacementEnabled = false
        isAutomaticSpellingCorrectionEnabled = false
        isContinuousSpellCheckingEnabled = false
        smartInsertDeleteEnabled = false
        textContainerInset = NSSize(width: 48, height: 32)
        typingAttributes = styler.baseAttributes
        textStorage?.delegate = self
        textLayoutManager?.delegate = fragmentDelegate
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

    // MARK: Source view

    @objc func toggleSourceView(_ sender: Any?) {
        sourceMode.toggle()
        styler.sourceMode = sourceMode
        restyleAll()
    }

    private func restyleAll() {
        guard let session, let storage = textStorage, let snapshot = try? session.snapshot() else { return }
        applying = true
        editStorage {
            styler.restyle(storage, dirty: SourceRange(from: 0, to: storage.length), layout: snapshot.layout, blocks: snapshot.blocks)
        }
        typingAttributes = styler.baseAttributes
        applying = false
    }

    // MARK: Input

    override func insertText(_ string: Any, replacementRange: NSRange) {
        guard !sourceMode else {
            super.insertText(string, replacementRange: replacementRange)
            return
        }
        let text = (string as? NSAttributedString)?.string ?? (string as? String) ?? ""
        if hasMarkedText() {
            // IME commit: take the composing text out again; the model inserts the result.
            let marked = markedRange()
            applying = true
            super.setMarkedText("", selectedRange: NSRange(location: 0, length: 0), replacementRange: marked)
            super.unmarkText()
            applying = false
            flushDeferredRemote()
            setSelectionForModel(NSRange(location: marked.location, length: 0))
        } else if replacementRange.location != NSNotFound {
            setSelectionForModel(replacementRange)
        }
        guard !text.isEmpty else { return }
        run([.text(text)])
    }

    override func setMarkedText(_ string: Any, selectedRange: NSRange, replacementRange: NSRange) {
        guard !sourceMode else {
            super.setMarkedText(string, selectedRange: selectedRange, replacementRange: replacementRange)
            return
        }
        if !hasMarkedText(), self.selectedRange().length > 0 {
            // Composition replaces the selection; delete it through the model first.
            run([.key(.backspace)])
        }
        typingAttributes = styler.baseAttributes
        applying = true
        super.setMarkedText(string, selectedRange: selectedRange, replacementRange: replacementRange)
        applying = false
    }

    override func unmarkText() {
        super.unmarkText()
        flushDeferredRemote()
    }

    override func doCommand(by selector: Selector) {
        guard !sourceMode else {
            super.doCommand(by: selector)
            return
        }
        let empty = selectedRange().length == 0
        switch selector {
        case #selector(deleteBackward(_:)): run([.key(.backspace)])
        case #selector(deleteForward(_:)): run([.key(.delete)])
        case #selector(insertNewline(_:)): run([.key(.enter)])
        case #selector(insertLineBreak(_:)), #selector(insertNewlineIgnoringFieldEditor(_:)): run([.key(.shiftEnter)])
        case #selector(insertTab(_:)): run([.key(.tab)])
        case #selector(insertBacktab(_:)): run([.key(.shiftTab)])
        case #selector(moveRight(_:)) where empty: run([.key(.arrowRight)])
        case #selector(moveLeft(_:)) where empty: run([.key(.arrowLeft)])
        default: super.doCommand(by: selector)
        }
    }

    override func paste(_ sender: Any?) {
        guard !sourceMode else { return super.paste(sender) }
        let board = NSPasteboard.general
        let text = board.string(forType: .string)
        let html = board.string(forType: .html)
        guard text != nil || html != nil else { return }
        run([.paste(text: text, html: html, asMarkdown: false)])
    }

    override func pasteAsPlainText(_ sender: Any?) {
        guard !sourceMode else { return super.pasteAsPlainText(sender) }
        guard let text = NSPasteboard.general.string(forType: .string) else { return }
        run([.paste(text: text, html: nil, asMarkdown: true)])
    }

    override func copy(_ sender: Any?) {
        guard !sourceMode else { return super.copy(sender) }
        guard selectedRange().length > 0 else { return }
        run([.copy])
    }

    override func cut(_ sender: Any?) {
        guard !sourceMode else { return super.cut(sender) }
        guard selectedRange().length > 0 else { return }
        run([.copy, .key(.backspace)])
    }

    // MARK: Format commands (same keys as the web live editor)

    @objc func toggleBoldMark(_ sender: Any?) { formatAction(.toggle(.bold)) }
    @objc func toggleItalicMark(_ sender: Any?) { formatAction(.toggle(.italic)) }
    @objc func toggleCodeMark(_ sender: Any?) { formatAction(.toggle(.code)) }
    @objc func toggleStrikeMark(_ sender: Any?) { formatAction(.toggle(.strike)) }
    @objc func toggleHighlightMark(_ sender: Any?) { formatAction(.toggle(.highlight)) }
    @objc func setParagraphBlock(_ sender: Any?) { formatAction(.block(.paragraph)) }
    @objc func setHeading1(_ sender: Any?) { formatAction(.block(.h1)) }
    @objc func setHeading2(_ sender: Any?) { formatAction(.block(.h2)) }
    @objc func setHeading3(_ sender: Any?) { formatAction(.block(.h3)) }
    @objc func setHeading4(_ sender: Any?) { formatAction(.block(.h4)) }
    @objc func setHeading5(_ sender: Any?) { formatAction(.block(.h5)) }
    @objc func setHeading6(_ sender: Any?) { formatAction(.block(.h6)) }
    @objc func setBulletList(_ sender: Any?) { formatAction(.block(.bullet)) }
    @objc func setOrderedList(_ sender: Any?) { formatAction(.block(.ordered)) }
    @objc func setTaskList(_ sender: Any?) { formatAction(.block(.task)) }
    @objc func setQuoteBlock(_ sender: Any?) { formatAction(.block(.quote)) }
    @objc func setCodeBlock(_ sender: Any?) { formatAction(.block(.code)) }
    @objc func moveBlockUp(_ sender: Any?) { formatAction(.moveUp) }
    @objc func moveBlockDown(_ sender: Any?) { formatAction(.moveDown) }

    private func formatAction(_ action: EditAction) {
        guard !sourceMode, !hasMarkedText() else { return }
        run([action])
    }

    // MARK: Undo (yrs UndoManager: only this client's edits)

    @objc func undo(_ sender: Any?) {
        guard !hasMarkedText() else { return }
        controller?.undo()
    }

    @objc func redo(_ sender: Any?) {
        guard !hasMarkedText() else { return }
        controller?.redo()
    }

    override func validateUserInterfaceItem(_ item: any NSValidatedUserInterfaceItem) -> Bool {
        switch item.action {
        case #selector(undo(_:)): return controller?.canUndo ?? false
        case #selector(redo(_:)): return controller?.canRedo ?? false
        case #selector(toggleSourceView(_:)):
            (item as? NSMenuItem)?.state = sourceMode ? .on : .off
            return session != nil
        default: return super.validateUserInterfaceItem(item)
        }
    }

    // MARK: Mouse

    override func mouseDown(with event: NSEvent) {
        guard !sourceMode, let storage = textStorage else { return super.mouseDown(with: event) }
        let point = convert(event.locationInWindow, from: nil)
        if event.modifierFlags.contains(.command) {
            let index = characterIndexForInsertion(at: point)
            for i in [index, index - 1] where i >= 0 && i < storage.length {
                if let target = storage.attribute(.synapseLinkTarget, at: i, effectiveRange: nil) as? String {
                    controller?.openLink(target)
                    return
                }
            }
        }
        if toggleCheckbox(at: point) { return }
        super.mouseDown(with: event)
    }

    /// A click on a task checkbox flips `[ ]` ↔ `[x]` in the source, the one
    /// character the web live editor changes too.
    private func toggleCheckbox(at point: CGPoint) -> Bool {
        guard let manager = textLayoutManager, let contentManager = manager.textContentManager,
              let storage = textStorage else { return false }
        let containerPoint = CGPoint(x: point.x - textContainerOrigin.x, y: point.y - textContainerOrigin.y)
        guard let fragment = manager.textLayoutFragment(for: containerPoint) as? DecoratedLayoutFragment,
              let box = fragment.checkboxFrame, box.insetBy(dx: -4, dy: -4).contains(containerPoint) else { return false }
        let start = contentManager.offset(from: contentManager.documentRange.location, to: fragment.rangeInElement.location)
        let text = storage.string as NSString
        let line = text.lineRange(for: NSRange(location: start, length: 0))
        let bracket = text.range(of: #"\[[ xX]\]"#, options: .regularExpression, range: line)
        guard bracket.location != NSNotFound else { return false }
        let mark = NSRange(location: bracket.location + 1, length: 1)
        let checked = text.substring(with: mark) != " "
        replaceSourceLocally([SequentialChange(from: mark.location, to: NSMaxRange(mark), insert: checked ? " " : "x")])
        return true
    }

    /// Change the source directly (a widget edit) and send it like any local edit.
    func replaceSourceLocally(_ changes: [SequentialChange]) {
        guard let session, let storage = textStorage else { return }
        let mapped = changes.map { SourceChange(from: $0.from, to: $0.to, insert: $0.insert) }
        guard let result = try? session.applyRemote(mapped) else { return }
        let selection = selectedRange()
        applying = true
        editStorage {
            for change in changes {
                storage.replaceCharacters(in: NSRange(location: change.from, length: change.to - change.from), with: change.insert)
            }
            styler.restyle(storage, dirty: result.dirty, layout: result.layout, blocks: result.blocks)
        }
        setSelectedRange(selection)
        applying = false
        syncSelectionToModel()
        controller?.didEditLocally(changes)
    }

    // MARK: Selection

    override func setSelectedRanges(_ ranges: [NSValue], affinity: NSSelectionAffinity, stillSelecting: Bool) {
        super.setSelectedRanges(ranges, affinity: affinity, stillSelecting: stillSelecting)
        guard !applying, !stillSelecting, !hasMarkedText() else { return }
        snapCaretOutOfSkippedText()
        syncSelectionToModel()
        controller?.userMovedSelection()
    }

    /// A caret inside a list item's indentation and marker, or in a thematic
    /// break, has no place on screen; put it where the item's text starts.
    private func snapCaretOutOfSkippedText() {
        guard !sourceMode, let storage = textStorage else { return }
        let range = selectedRange()
        guard range.length == 0, range.location < storage.length else { return }
        var run = NSRange()
        guard storage.attribute(.synapseCaretSkip, at: range.location, longestEffectiveRange: &run,
                                in: NSRange(location: 0, length: storage.length)) != nil else { return }
        applying = true
        setSelectedRange(NSRange(location: NSMaxRange(run), length: 0))
        applying = false
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
        if !result.changes.isEmpty {
            controller?.didEditLocally(Self.sequential(result.changes))
        }
        scrollRangeToVisible(selectedRange())
        lastTiming = EditTiming(model: (modelDone - start) * 1000, apply: (CACurrentMediaTime() - modelDone) * 1000)
    }

    /// Changes the editing model did not make — other devices, agents, undo —
    /// in the order they happened.
    func applyExternal(_ changes: [SequentialChange], placeCaret: Bool) {
        guard !changes.isEmpty else { return }
        if hasMarkedText() {
            deferredRemote.append(changes)
            return
        }
        guard let session, let storage = textStorage else { return }
        let mapped = changes.map { SourceChange(from: $0.from, to: $0.to, insert: $0.insert) }
        let result: RemoteResult
        do {
            result = try session.applyRemote(mapped)
        } catch {
            NSLog("SynapseNote remote change failed: %@", String(describing: error))
            return
        }
        applying = true
        editStorage {
            for change in changes {
                storage.replaceCharacters(in: NSRange(location: change.from, length: change.to - change.from), with: change.insert)
            }
            styler.restyle(storage, dirty: result.dirty, layout: result.layout, blocks: result.blocks)
        }
        if placeCaret, let last = changes.last {
            let caret = last.from + (last.insert as NSString).length
            setSelectedRange(NSRange(location: caret, length: 0))
            syncSelectionToModel()
            scrollRangeToVisible(selectedRange())
        } else {
            let from = min(result.anchor, result.head)
            setSelectedRange(NSRange(location: from, length: abs(result.head - result.anchor)))
        }
        applying = false
    }

    private func flushDeferredRemote() {
        let pending = deferredRemote
        deferredRemote = []
        for changes in pending { applyExternal(changes, placeCaret: false) }
    }

    // MARK: Edits the text system made itself

    nonisolated func textStorage(
        _ textStorage: NSTextStorage,
        didProcessEditing editedMask: NSTextStorageEditActions,
        range editedRange: NSRange,
        changeInLength delta: Int
    ) {
        guard editedMask.contains(.editedCharacters) else { return }
        let inserted = (textStorage.string as NSString).substring(with: editedRange)
        MainActor.assumeIsolated {
            guard !applying, !hasMarkedText() else { return }
            externalEdits.append(SequentialChange(
                from: editedRange.location,
                to: editedRange.location + editedRange.length - delta,
                insert: inserted
            ))
            DispatchQueue.main.async { [weak self] in
                MainActor.assumeIsolated { self?.commitExternalEdits() }
            }
        }
    }

    private func commitExternalEdits() {
        let changes = externalEdits
        externalEdits = []
        guard !changes.isEmpty, let session, let storage = textStorage else { return }
        let mapped = changes.map { SourceChange(from: $0.from, to: $0.to, insert: $0.insert) }
        guard let result = try? session.applyRemote(mapped) else { return }
        applying = true
        editStorage {
            styler.restyle(storage, dirty: result.dirty, layout: result.layout, blocks: result.blocks)
        }
        applying = false
        syncSelectionToModel()
        controller?.didEditLocally(changes)
    }

    // MARK: Storage

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

    /// Ascending changes in pre-edit offsets → changes in sequence.
    static func sequential(_ changes: [SourceChange]) -> [SequentialChange] {
        var shift = 0
        return changes.map { change in
            let out = SequentialChange(from: change.from + shift, to: change.to + shift, insert: change.insert)
            shift += (change.insert as NSString).length - (change.to - change.from)
            return out
        }
    }
}
