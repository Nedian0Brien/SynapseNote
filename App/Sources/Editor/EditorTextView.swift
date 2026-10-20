import SwiftUI

/// One text block of the native editor: a TextKit 2 text view (`UITextView`, `NSTextView`) as tall as its text.
/// The view holds the block's text with the editor's own attributes and the display attributes over them; what is
/// typed goes to the store once it is settled, so a Korean syllable being composed (marked text) is never
/// replaced or read back half done. Keys the block cannot handle by itself, such as Enter or Backspace at its
/// start, go to the store as edits of the document.
struct EditorTextBlock {
    let store: EditorStore
    let path: EditorEdits.Path
    let block: DocNode
    let style: EditorStyle.Block
    let context: EditorStyle.Context
    let font: AppPreferences.Font
    let editable: Bool
    /// find matches in this block, drawn over the text
    let matches: [NSRange]

    var model: NSAttributedString { InlineText.attributed(block.content ?? []) }
    var plain: Bool { block.type == "codeBlock" }

    func styled() -> NSAttributedString {
        let text = NSMutableAttributedString(attributedString: EditorStyle.styled(model, style, context, font))
        decorate(text)
        return text
    }

    func decorate(_ text: NSMutableAttributedString) {
        for match in matches where NSMaxRange(match) <= text.length {
            text.addAttribute(.backgroundColor, value: EditorStyle.mark, range: match)
        }
    }

    /// the text view's text as content, compared with the block's
    func same(_ text: NSAttributedString) -> Bool {
        let mine = InlineText.content(text, plain: plain)
        let theirs = block.content ?? []
        return mine.count == theirs.count && JSJSON.stringify(.array(mine.map(JSValue.object))) == JSJSON.stringify(.array(theirs.map(JSValue.object)))
    }
}

/// The store's undo behind the system's: the Edit menu, the keyboard's shortcuts bar and shake to undo all
/// reach the page's history.
final class EditorUndoManager: UndoManager {
    weak var store: EditorStore?

    override var canUndo: Bool { MainActor.assumeIsolated { store?.canUndo ?? false } }
    override var canRedo: Bool { MainActor.assumeIsolated { store?.canRedo ?? false } }
    override func undo() { MainActor.assumeIsolated { store?.undo() } }
    override func redo() { MainActor.assumeIsolated { store?.redo() } }
    override var undoActionName: String { "" }
    override var redoActionName: String { "" }
}

#if os(iOS)
import UIKit

extension EditorTextBlock: UIViewRepresentable {
    func makeUIView(context: Context) -> BlockTextView {
        let view = BlockTextView(usingTextLayoutManager: true)
        view.isScrollEnabled = false
        view.backgroundColor = .clear
        view.textContainerInset = .zero
        view.textContainer.lineFragmentPadding = 0
        view.delegate = context.coordinator
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.adjustsFontForContentSizeCategory = false
        view.smartQuotesType = plain ? .no : .default
        view.smartDashesType = plain ? .no : .default
        view.autocorrectionType = plain ? .no : .default
        view.autocapitalizationType = plain ? .none : .sentences
        view.attributedText = styled()
        context.coordinator.block = self
        view.owner = context.coordinator
        return view
    }

    func updateUIView(_ view: BlockTextView, context: Context) {
        let coordinator = context.coordinator
        let changedStyle = coordinator.block?.style != style || coordinator.block?.context != context.coordinator.block?.context
            || coordinator.block?.font != font || coordinator.block?.matches != matches || coordinator.block?.context != self.context
        // a pass where the block at this path is no longer text, before SwiftUI swaps the view out
        guard EditorSchema.textBlocks.contains(block.type) else { return }
        coordinator.block = self
        view.isEditable = editable
        view.undo.store = store
        guard view.markedTextRange == nil else { return }
        if !same(view.attributedText) {
            let selection = view.selectedRange
            coordinator.applying = true
            view.attributedText = styled()
            coordinator.applying = false
            if view.isFirstResponder {
                let length = view.attributedText.length
                view.selectedRange = NSRange(location: min(selection.location, length), length: 0)
            }
        } else if changedStyle {
            coordinator.restyle(view)
        }
        if view.isFirstResponder { coordinator.applyTypingAttributes(view) }
        if store.focusRequest?.path == path {
            DispatchQueue.main.async { coordinator.takeFocusIfAsked(view) }
        }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: BlockTextView, context: Context) -> CGSize? {
        let width = proposal.width ?? 600
        let size = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: width, height: max(size.height, EditorStyle.size(style, font) * 1.3))
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    @MainActor
    final class Coordinator: NSObject, UITextViewDelegate {
        var block: EditorTextBlock?
        var applying = false
        /// the text a key is about to insert, to run the input rules once it is in
        private var inserted: (text: String, location: Int)?

        var store: EditorStore? { block?.store }
        var path: EditorEdits.Path { block?.path ?? [] }

        func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
            guard let block, let store else { return true }
            // the caret is on its way to another block: what is typed goes there
            if store.caretLeaving(path), textView.markedTextRange == nil {
                store.typeAhead(text)
                return false
            }
            if text == "\n", !block.plain || store.slash != nil {
                // Enter: the block splits; a syllable being composed is finished first
                textView.unmarkText()
                store.textChanged(path, textView.attributedText)
                store.enter(path, range.location)
                sync(textView)
                return false
            }
            inserted = text.utf16.count == 1 && range.length == 0 ? (text, range.location) : nil
            return true
        }

        func textViewDidChange(_ textView: UITextView) {
            guard !applying, let store else { return }
            guard textView.markedTextRange == nil else {
                // a syllable is being composed: it is read once it is done
                unsent = true
                return
            }
            unsent = false
            restyle(textView)
            let typed = inserted
            inserted = nil
            if let typed, store.typed(path, text: textView.attributedText, caret: typed.location + 1, character: typed.text) {
                sync(textView)
                return
            }
            store.textChanged(path, textView.attributedText)
        }

        /// composed text not yet given to the store
        private var unsent = false

        /// the view takes the block's text from the store at once after an edit it asked for, so nothing typed
        /// before SwiftUI draws again lands in old text
        func sync(_ textView: UITextView) {
            guard let block, let store, let current = store.block(path), EditorSchema.textBlocks.contains(current.type) else { return }
            let updated = EditorTextBlock(store: store, path: path, block: current, style: block.style, context: block.context, font: block.font,
                                          editable: block.editable, matches: block.matches)
            if !updated.same(textView.attributedText) {
                applying = true
                textView.attributedText = updated.styled()
                applying = false
            }
            // a caret meant for this block is placed now and the request is done, so a later pass does not move
            // the caret back once more has been typed
            if let request = store.focusRequest, request.path == path, textView.isFirstResponder {
                let length = textView.attributedText.length
                let location = min(request.range.location, length)
                applying = true
                textView.selectedRange = NSRange(location: location, length: min(request.range.length, length - location))
                applying = false
                store.tookFocus(request)
                reportSelection(textView)
            }
            self.block = updated
        }

        func textViewDidChangeSelection(_ textView: UITextView) {
            guard !applying, textView.isFirstResponder else { return }
            reportSelection(textView)
            applyTypingAttributes(textView)
        }

        func textViewDidBeginEditing(_ textView: UITextView) { reportSelection(textView) }

        /// the caret comes here when the store asks for it, once the view is in a window; a view not yet in one
        /// takes it when it arrives (`didMoveToWindow`), and one on its way out leaves it to the view replacing it
        func takeFocusIfAsked(_ view: UITextView) {
            guard let store, store.focusRequest?.path == path, view.window != nil else { return }
            sync(view)
            guard store.focusRequest?.path == path else { return }
            if !view.isFirstResponder, !view.becomeFirstResponder() { return }
            // the request as it is now: text typed ahead may have moved it
            guard let current = store.focusRequest, current.path == path else { return }
            let length = view.attributedText.length
            let location = min(current.range.location, length)
            applying = true
            view.selectedRange = NSRange(location: location, length: min(current.range.length, length - location))
            applying = false
            store.tookFocus(current)
            reportSelection(view)
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            guard let store else { return }
            // only what the store has not had yet: the view's text may be older than the store's by now
            if unsent {
                unsent = false
                store.textChanged(path, textView.attributedText)
            }
            store.blurred(path)
        }

        func reportSelection(_ textView: UITextView) {
            guard let store else { return }
            store.focused(path, textView.selectedRange)
            if let range = textView.selectedTextRange {
                let rect = textView.selectedRange.length > 0 ? textView.firstRect(for: range) : textView.caretRect(for: range.end)
                if !rect.isNull, !rect.isInfinite { store.selectionRect = textView.convert(rect, to: nil) }
            }
        }

        /// the display attributes again after a change, keeping the selection
        func restyle(_ textView: UITextView) {
            guard let block, textView.markedTextRange == nil else { return }
            let selection = textView.selectedRange
            applying = true
            textView.textStorage.beginEditing()
            EditorStyle.restyle(textView.textStorage, block.style, block.context, block.font)
            block.decorate(textView.textStorage)
            textView.textStorage.endEditing()
            textView.selectedRange = selection
            applying = false
        }

        /// what the next character gets: the marks turned on with nothing selected, or those of the character
        /// before; never an atom's
        func applyTypingAttributes(_ textView: UITextView) {
            guard let block, let store else { return }
            var marks = store.storedMarks
            if marks == nil, textView.selectedRange.location > 0, textView.selectedRange.location <= textView.attributedText.length {
                marks = (textView.attributedText.attribute(.editorMarks, at: textView.selectedRange.location - 1, effectiveRange: nil) as? EditorMarkSet)?.marks
            }
            let set = marks.flatMap { $0.isEmpty ? nil : EditorMarkSet($0) }
            var attributes = EditorStyle.attributes(set, block.style, block.context, block.font)
            if let set { attributes[.editorMarks] = set }
            textView.typingAttributes = attributes
        }
    }
}

/// The text view with the keys the editor takes: Shift-Return for a line break, Tab and Shift-Tab in lists, the
/// formatting shortcuts, and the arrow keys and Backspace at the edges of the block.
final class BlockTextView: UITextView {
    weak var owner: EditorTextBlock.Coordinator?
    /// lazy: the text view's TextKit 2 initializer does not run Swift's property initializers
    lazy var undo = EditorUndoManager()

    override var undoManager: UndoManager? { undo }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.owner?.takeFocusIfAsked(self)
        }
    }

    private var store: EditorStore? { owner?.store }
    private var path: EditorEdits.Path { owner?.path ?? [] }

    override func deleteBackward() {
        if let store, store.caretLeaving(path), markedTextRange == nil { return }
        if markedTextRange == nil, selectedRange == NSRange(location: 0, length: 0), let store {
            store.textChanged(path, attributedText)
            store.backspaceAtStart(path)
            return
        }
        super.deleteBackward()
    }

    override var keyCommands: [UIKeyCommand]? {
        var commands = [
            UIKeyCommand(input: "\r", modifierFlags: .shift, action: #selector(lineBreak)),
            UIKeyCommand(input: "\t", modifierFlags: [], action: #selector(tab)),
            UIKeyCommand(input: "\t", modifierFlags: .shift, action: #selector(backTab)),
            UIKeyCommand(title: "Bold", action: #selector(bold), input: "b", modifierFlags: .command),
            UIKeyCommand(title: "Italic", action: #selector(italic), input: "i", modifierFlags: .command),
            UIKeyCommand(title: "Underline", action: #selector(underline), input: "u", modifierFlags: .command),
            UIKeyCommand(title: "Strikethrough", action: #selector(strike), input: "s", modifierFlags: [.command, .shift]),
            UIKeyCommand(title: "Inline Code", action: #selector(code), input: "e", modifierFlags: .command),
            UIKeyCommand(title: "Highlight", action: #selector(highlight), input: "h", modifierFlags: [.command, .shift]),
            UIKeyCommand(title: "Link", action: #selector(link), input: "k", modifierFlags: .command),
            UIKeyCommand(title: "Find", action: #selector(openFind), input: "f", modifierFlags: .command),
            UIKeyCommand(title: "Save", action: #selector(save), input: "s", modifierFlags: .command),
            UIKeyCommand(title: "Paragraph", action: #selector(paragraph), input: "0", modifierFlags: [.command, .alternate]),
            UIKeyCommand(title: "Heading 1", action: #selector(heading1), input: "1", modifierFlags: [.command, .alternate]),
            UIKeyCommand(title: "Heading 2", action: #selector(heading2), input: "2", modifierFlags: [.command, .alternate]),
            UIKeyCommand(title: "Heading 3", action: #selector(heading3), input: "3", modifierFlags: [.command, .alternate]),
            UIKeyCommand(title: "Code Block", action: #selector(codeBlock), input: "c", modifierFlags: [.command, .alternate]),
            UIKeyCommand(title: "Numbered List", action: #selector(ordered), input: "7", modifierFlags: [.command, .shift]),
            UIKeyCommand(title: "Bulleted List", action: #selector(bullets), input: "8", modifierFlags: [.command, .shift]),
            UIKeyCommand(title: "Checklist", action: #selector(tasks), input: "9", modifierFlags: [.command, .shift]),
            UIKeyCommand(title: "Quote", action: #selector(quote), input: "b", modifierFlags: [.command, .shift]),
        ]
        if store?.slash != nil {
            commands += [
                UIKeyCommand(input: UIKeyCommand.inputUpArrow, modifierFlags: [], action: #selector(slashUp)),
                UIKeyCommand(input: UIKeyCommand.inputDownArrow, modifierFlags: [], action: #selector(slashDown)),
                UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(escape)),
            ]
        }
        for command in commands { command.wantsPriorityOverSystemBehavior = true }
        return commands
    }

    @objc private func lineBreak() {
        guard let store else { return }
        unmarkText()
        store.hardBreak(path, selectedRange, attributedText)
    }

    @objc private func tab() {
        guard let store, store.indent(path, out: false) else {
            insertText("\t")
            return
        }
    }

    @objc private func backTab() { _ = store?.indent(path, out: true) }
    @objc private func bold() { store?.toggleMark("bold") }
    @objc private func italic() { store?.toggleMark("italic") }
    @objc private func underline() { store?.toggleMark("underline") }
    @objc private func strike() { store?.toggleMark("strike") }
    @objc private func code() { store?.toggleMark("code") }
    @objc private func highlight() { store?.toggleMark("highlight") }
    @objc private func link() { if selectedRange.length > 0 || store?.activeMark("link") != nil { store?.editingLink = true } }
    @objc private func openFind() { store?.find = store?.find ?? EditorStore.Find() }
    @objc private func save() { Task { await store?.flush() } }
    @objc private func paragraph() { store?.setBlockType("paragraph") }
    @objc private func heading1() { store?.setBlockType("heading", level: 1, toggle: true) }
    @objc private func heading2() { store?.setBlockType("heading", level: 2, toggle: true) }
    @objc private func heading3() { store?.setBlockType("heading", level: 3, toggle: true) }
    @objc private func codeBlock() { store?.setBlockType("codeBlock", toggle: true) }
    @objc private func ordered() { store?.toggleList("orderedList") }
    @objc private func bullets() { store?.toggleList("bulletList") }
    @objc private func tasks() { store?.toggleList("taskList") }
    @objc private func quote() { store?.quote() }
    @objc private func slashUp() { store?.moveSlash(by: -1) }
    @objc private func slashDown() { store?.moveSlash(by: 1) }
    @objc private func escape() { store?.slash = nil }

    /// arrow keys at the first or last line move to the block above or below
    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        guard let key = presses.first?.key, key.modifierFlags.intersection([.shift, .command, .alternate]).isEmpty,
              markedTextRange == nil, let store else {
            super.pressesBegan(presses, with: event)
            return
        }
        let length = attributedText.length
        switch key.keyCode {
        case .keyboardUpArrow where store.slash == nil && onFirstLine:
            if store.arrow(path, up: true) { return }
        case .keyboardDownArrow where store.slash == nil && onLastLine:
            if store.arrow(path, up: false) { return }
        case .keyboardLeftArrow where selectedRange == NSRange(location: 0, length: 0):
            if let previous = store.neighbour(path, before: true) {
                store.moveCaret(to: previous, atEnd: true)
                return
            }
        case .keyboardRightArrow where selectedRange == NSRange(location: length, length: 0):
            if let next = store.neighbour(path, before: false) {
                store.moveCaret(to: next, atEnd: false)
                return
            }
        case .keyboardDeleteForward where selectedRange == NSRange(location: length, length: 0):
            store.textChanged(path, attributedText)
            store.deleteAtEnd(path)
            return
        default:
            break
        }
        super.pressesBegan(presses, with: event)
    }

    private var onFirstLine: Bool {
        guard let range = selectedTextRange, selectedRange.length == 0 else { return false }
        return caretRect(for: range.start).minY <= caretRect(for: beginningOfDocument).minY + 1
    }

    private var onLastLine: Bool {
        guard let range = selectedTextRange, selectedRange.length == 0 else { return false }
        return caretRect(for: range.end).minY >= caretRect(for: endOfDocument).minY - 1
    }
}

#else
import AppKit

extension EditorTextBlock: NSViewRepresentable {
    func makeNSView(context: Context) -> BlockTextView {
        let view = BlockTextView(usingTextLayoutManager: true)
        view.drawsBackground = false
        view.textContainerInset = .zero
        view.textContainer?.lineFragmentPadding = 0
        view.isRichText = true
        view.allowsUndo = false
        view.isAutomaticQuoteSubstitutionEnabled = !plain
        view.isAutomaticDashSubstitutionEnabled = !plain
        view.isAutomaticSpellingCorrectionEnabled = false
        view.isVerticallyResizable = true
        view.isHorizontallyResizable = false
        view.textContainer?.widthTracksTextView = true
        view.delegate = context.coordinator
        view.owner = context.coordinator
        context.coordinator.block = self
        view.textStorage?.setAttributedString(styled())
        return view
    }

    func updateNSView(_ view: BlockTextView, context: Context) {
        let coordinator = context.coordinator
        let changedStyle = coordinator.block?.style != style || coordinator.block?.font != font
            || coordinator.block?.matches != matches || coordinator.block?.context != self.context
        guard EditorSchema.textBlocks.contains(block.type) else { return }
        coordinator.block = self
        view.isEditable = editable
        view.undo.store = store
        guard !view.hasMarkedText(), let storage = view.textStorage else { return }
        if !same(storage) {
            let selection = view.selectedRange()
            coordinator.applying = true
            storage.setAttributedString(styled())
            coordinator.applying = false
            if view.window?.firstResponder === view {
                view.setSelectedRange(NSRange(location: min(selection.location, storage.length), length: 0))
            }
            view.invalidateIntrinsicContentSize()
        } else if changedStyle {
            coordinator.restyle(view)
        }
        if view.window?.firstResponder === view { coordinator.applyTypingAttributes(view) }
        if store.focusRequest?.path == path {
            DispatchQueue.main.async { coordinator.takeFocusIfAsked(view) }
        }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView: BlockTextView, context: Context) -> CGSize? {
        let width = proposal.width ?? 600
        nsView.textContainer?.size = CGSize(width: width, height: .greatestFiniteMagnitude)
        var height: CGFloat = 0
        if let layout = nsView.textLayoutManager {
            layout.ensureLayout(for: layout.documentRange)
            height = layout.usageBoundsForTextContainer.height
        }
        return CGSize(width: width, height: max(ceil(height), EditorStyle.size(style, font) * 1.3))
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    @MainActor
    final class Coordinator: NSObject, NSTextViewDelegate {
        var block: EditorTextBlock?
        var applying = false
        private var inserted: (text: String, location: Int)?

        var store: EditorStore? { block?.store }
        var path: EditorEdits.Path { block?.path ?? [] }

        func textView(_ textView: NSTextView, shouldChangeTextIn range: NSRange, replacementString text: String?) -> Bool {
            // the caret is on its way to another block: what is typed goes there
            if let store, let text, store.caretLeaving(path), !textView.hasMarkedText() {
                store.typeAhead(text)
                return false
            }
            inserted = text.flatMap { $0.utf16.count == 1 && range.length == 0 ? ($0, range.location) : nil }
            return true
        }

        /// composed text not yet given to the store
        private var unsent = false

        func textDidChange(_ notification: Notification) {
            guard !applying, let view = notification.object as? NSTextView, let store, let storage = view.textStorage else { return }
            guard !view.hasMarkedText() else {
                unsent = true
                return
            }
            unsent = false
            restyle(view)
            let typed = inserted
            inserted = nil
            if let typed, store.typed(path, text: storage, caret: typed.location + 1, character: typed.text) {
                sync(view)
                return
            }
            store.textChanged(path, storage)
            view.invalidateIntrinsicContentSize()
        }

        /// the view takes the block's text from the store at once after an edit it asked for
        func sync(_ view: NSTextView) {
            guard let block, let store, let storage = view.textStorage, let current = store.block(path),
                  EditorSchema.textBlocks.contains(current.type) else { return }
            let updated = EditorTextBlock(store: store, path: path, block: current, style: block.style, context: block.context, font: block.font,
                                          editable: block.editable, matches: block.matches)
            if !updated.same(storage) {
                applying = true
                storage.setAttributedString(updated.styled())
                applying = false
                view.invalidateIntrinsicContentSize()
            }
            if let request = store.focusRequest, request.path == path, view.window?.firstResponder === view {
                let location = min(request.range.location, storage.length)
                applying = true
                view.setSelectedRange(NSRange(location: location, length: min(request.range.length, storage.length - location)))
                applying = false
                store.tookFocus(request)
                reportSelection(view)
            }
            self.block = updated
        }

        func textViewDidChangeSelection(_ notification: Notification) {
            guard !applying, let view = notification.object as? NSTextView, view.window?.firstResponder === view else { return }
            reportSelection(view)
            applyTypingAttributes(view)
        }

        func textDidBeginEditing(_ notification: Notification) {
            if let view = notification.object as? NSTextView { reportSelection(view) }
        }

        func takeFocusIfAsked(_ view: NSTextView) {
            guard let store, store.focusRequest?.path == path, let window = view.window else { return }
            sync(view)
            guard store.focusRequest?.path == path else { return }
            if window.firstResponder !== view, !window.makeFirstResponder(view) { return }
            guard let current = store.focusRequest, current.path == path else { return }
            let length = view.textStorage?.length ?? 0
            let location = min(current.range.location, length)
            applying = true
            view.setSelectedRange(NSRange(location: location, length: min(current.range.length, length - location)))
            applying = false
            store.tookFocus(current)
            reportSelection(view)
        }

        func textDidEndEditing(_ notification: Notification) {
            guard let view = notification.object as? NSTextView, let store, let storage = view.textStorage else { return }
            if unsent {
                unsent = false
                store.textChanged(path, storage)
            }
            store.blurred(path)
        }

        func textView(_ textView: NSTextView, doCommandBy selector: Selector) -> Bool {
            guard let store, let storage = textView.textStorage else { return false }
            let range = textView.selectedRange()
            let length = storage.length
            let shift = NSApp.currentEvent?.modifierFlags.contains(.shift) == true
            switch selector {
            case #selector(NSResponder.insertNewline(_:)):
                if store.caretLeaving(path) {
                    store.typeAhead("\n")
                    return true
                }
                textView.unmarkText()
                store.textChanged(path, storage)
                defer { sync(textView) }
                if shift {
                    store.hardBreak(path, range, storage)
                } else if block?.plain == true, store.slash == nil {
                    return false
                } else {
                    store.enter(path, range.location)
                }
                return true
            case #selector(NSResponder.insertLineBreak(_:)):
                store.hardBreak(path, range, storage)
                return true
            case #selector(NSResponder.deleteBackward(_:)) where range == NSRange(location: 0, length: 0):
                store.textChanged(path, storage)
                store.backspaceAtStart(path)
                return true
            case #selector(NSResponder.deleteForward(_:)) where range == NSRange(location: length, length: 0):
                store.textChanged(path, storage)
                store.deleteAtEnd(path)
                return true
            case #selector(NSResponder.insertTab(_:)):
                return store.indent(path, out: false)
            case #selector(NSResponder.insertBacktab(_:)):
                return store.indent(path, out: true)
            case #selector(NSResponder.moveUp(_:)):
                if store.slash != nil { store.moveSlash(by: -1); return true }
                return onEdgeLine(textView, first: true) && store.arrow(path, up: true)
            case #selector(NSResponder.moveDown(_:)):
                if store.slash != nil { store.moveSlash(by: 1); return true }
                return onEdgeLine(textView, first: false) && store.arrow(path, up: false)
            case #selector(NSResponder.moveLeft(_:)) where range == NSRange(location: 0, length: 0):
                guard let previous = store.neighbour(path, before: true) else { return false }
                store.moveCaret(to: previous, atEnd: true)
                return true
            case #selector(NSResponder.moveRight(_:)) where range == NSRange(location: length, length: 0):
                guard let next = store.neighbour(path, before: false) else { return false }
                store.moveCaret(to: next, atEnd: false)
                return true
            case #selector(NSResponder.cancelOperation(_:)):
                if store.slash != nil { store.slash = nil; return true }
                if store.find != nil { store.find = nil; return true }
                return false
            default:
                return false
            }
        }

        private func onEdgeLine(_ view: NSTextView, first: Bool) -> Bool {
            let range = view.selectedRange()
            guard range.length == 0, let storage = view.textStorage else { return false }
            let caret = view.firstRect(forCharacterRange: range, actualRange: nil)
            let edge = view.firstRect(forCharacterRange: NSRange(location: first ? 0 : storage.length, length: 0), actualRange: nil)
            return abs(caret.minY - edge.minY) < 1
        }

        func reportSelection(_ view: NSTextView) {
            guard let store else { return }
            let range = view.selectedRange()
            store.focused(path, range)
            // screen coordinates, flipped into the window's top-left space SwiftUI uses
            let screenRect = view.firstRect(forCharacterRange: range, actualRange: nil)
            if let window = view.window, !screenRect.isNull {
                let inWindow = window.convertFromScreen(screenRect)
                let height = window.contentView?.bounds.height ?? window.frame.height
                store.selectionRect = CGRect(x: inWindow.minX, y: height - inWindow.maxY, width: inWindow.width, height: inWindow.height)
            }
        }

        func restyle(_ view: NSTextView) {
            guard let block, !view.hasMarkedText(), let storage = view.textStorage else { return }
            let selection = view.selectedRange()
            applying = true
            storage.beginEditing()
            EditorStyle.restyle(storage, block.style, block.context, block.font)
            block.decorate(storage)
            storage.endEditing()
            view.setSelectedRange(selection)
            applying = false
        }

        func applyTypingAttributes(_ view: NSTextView) {
            guard let block, let store, let storage = view.textStorage else { return }
            var marks = store.storedMarks
            let location = view.selectedRange().location
            if marks == nil, location > 0, location <= storage.length {
                marks = (storage.attribute(.editorMarks, at: location - 1, effectiveRange: nil) as? EditorMarkSet)?.marks
            }
            let set = marks.flatMap { $0.isEmpty ? nil : EditorMarkSet($0) }
            var attributes = EditorStyle.attributes(set, block.style, block.context, block.font)
            if let set { attributes[.editorMarks] = set }
            view.typingAttributes = attributes
        }
    }
}

/// The text view with the editor's shortcuts and its undo going to the page's history.
final class BlockTextView: NSTextView {
    weak var owner: EditorTextBlock.Coordinator?
    /// lazy: the text view's TextKit 2 initializer does not run Swift's property initializers
    lazy var undo = EditorUndoManager()

    override var undoManager: UndoManager? { undo }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        guard window != nil else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.owner?.takeFocusIfAsked(self)
        }
    }

    override var intrinsicContentSize: NSSize {
        guard let layout = textLayoutManager else { return super.intrinsicContentSize }
        layout.ensureLayout(for: layout.documentRange)
        return NSSize(width: NSView.noIntrinsicMetric, height: ceil(layout.usageBoundsForTextContainer.height))
    }

    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        guard window?.firstResponder === self, let store = owner?.store,
              let key = event.charactersIgnoringModifiers?.lowercased() else { return super.performKeyEquivalent(with: event) }
        let flags = event.modifierFlags.intersection([.command, .shift, .option, .control])
        switch (flags, key) {
        case ([.command], "b"): store.toggleMark("bold")
        case ([.command], "i"): store.toggleMark("italic")
        case ([.command], "u"): store.toggleMark("underline")
        case ([.command, .shift], "s"): store.toggleMark("strike")
        case ([.command], "e"): store.toggleMark("code")
        case ([.command, .shift], "h"): store.toggleMark("highlight")
        case ([.command], "k"): if selectedRange().length > 0 || store.activeMark("link") != nil { store.editingLink = true } else { return false }
        case ([.command], "f"): store.find = store.find ?? EditorStore.Find()
        case ([.command], "s"): Task { await store.flush() }
        case ([.command, .option], "0"): store.setBlockType("paragraph")
        case ([.command, .option], "1"): store.setBlockType("heading", level: 1, toggle: true)
        case ([.command, .option], "2"): store.setBlockType("heading", level: 2, toggle: true)
        case ([.command, .option], "3"): store.setBlockType("heading", level: 3, toggle: true)
        case ([.command, .option], "c"): store.setBlockType("codeBlock", toggle: true)
        case ([.command, .shift], "7"), ([.command, .shift], "&"): store.toggleList("orderedList")
        case ([.command, .shift], "8"), ([.command, .shift], "*"): store.toggleList("bulletList")
        case ([.command, .shift], "9"), ([.command, .shift], "("): store.toggleList("taskList")
        case ([.command, .shift], "b"): store.quote()
        default: return super.performKeyEquivalent(with: event)
        }
        return true
    }
}
#endif
