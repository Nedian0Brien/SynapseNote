import SwiftUI
import UniformTypeIdentifiers

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
    /// page links and dates are drawn as pictures, in the light or dark look
    var dark = false
    /// the renderer's count when this block has inline formulas, so a finished one redraws the block
    var rendered = 0

    var model: NSAttributedString { InlineText.attributed(block.content ?? []) }
    var plain: Bool { block.type == "codeBlock" }

    func styled() -> NSAttributedString {
        let text = NSMutableAttributedString(attributedString: EditorStyle.styled(model, style, context, font))
        decorate(text)
        return text
    }

    func decorate(_ text: NSMutableAttributedString) {
        let whole = NSRange(location: 0, length: text.length)
        if !plain {
            // page links and dates as chips (PageLink, DateMention)
            let lookup = store.atomLookup
            text.enumerateAttribute(.editorAtom, in: whole) { value, range, _ in
                guard let atom = value as? EditorAtom, atom.node.type != "hardBreak" else { return }
                if atom.node.type == "inlineMath" {
                    let font = (text.attribute(.font, at: range.location, effectiveRange: nil) as? PlatformFont) ?? EditorStyle.font(style, self.font)
                    for index in range.location..<NSMaxRange(range) {
                        let node = (text.attribute(.editorAtom, at: index, effectiveRange: nil) as? EditorAtom)?.node ?? atom.node
                        if let attachment = EditorAtoms.formula(node.attr("latex")?.string ?? "", font: font, dark: dark) {
                            text.addAttribute(.attachment, value: attachment, range: NSRange(location: index, length: 1))
                        }
                    }
                    return
                }
                let embed = store.embed(atom.node)
                if embed?.live == true {
                    text.addAttribute(.attachment, value: EditorAtoms.nothing, range: range)
                    return
                }
                guard let chip = EditorAtoms.chip(atom.node, lookup, embed: embed != nil) else { return }
                let font = (text.attribute(.font, at: range.location, effectiveRange: nil) as? PlatformFont) ?? EditorStyle.font(style, self.font)
                for index in range.location..<NSMaxRange(range) {
                    if let attachment = EditorAtoms.attachment(chip, font: font, dark: dark) {
                        text.addAttribute(.attachment, value: attachment, range: NSRange(location: index, length: 1))
                    }
                }
            }
            // #tags (Extras.ts Tags): the accent on a soft accent, or the tag's solid colour in colourful mode
            let colorful = store.controller.preferences.colorful
            for tag in EditorAtoms.tags(in: text) {
                if colorful {
                    let name = Tags.tagColor(tag.name)
                    text.addAttribute(.backgroundColor, value: PlatformColor(TagColor.solid(name, dark: dark)), range: tag.range)
                    text.addAttribute(.foregroundColor, value: name == "yellow" ? EditorStyle.rgb(0x2b2100) : PlatformColor.white, range: tag.range)
                } else {
                    text.addAttribute(.backgroundColor, value: EditorStyle.accent.withAlphaComponent(0.14), range: tag.range)
                    text.addAttribute(.foregroundColor, value: EditorStyle.accent, range: tag.range)
                }
            }
        }
        // highlighted code (Extras.ts CodeBlock): each run's colour and style from features.css
        if block.type == "codeBlock" {
            for run in CodeHighlight.runs(text.string, language: block.attr("language")?.string) where NSMaxRange(run.range) <= text.length {
                let look = CodeHighlight.style(run.classes)
                if let tone = look.tone { text.addAttribute(.foregroundColor, value: EditorStyle.highlight(tone), range: run.range) }
                if look.italic || look.bold {
                    text.addAttribute(.font, value: EditorStyle.font(.code, font, bold: look.bold, italic: look.italic), range: run.range)
                }
            }
        }
        for match in matches where NSMaxRange(match) <= text.length {
            text.addAttribute(.backgroundColor, value: EditorStyle.mark, range: match)
        }
    }

    /// a page link or date pressed opens it; a #tag opens with the command key held, as Morrow's ctrl or cmd click
    /// (the caret goes there otherwise). True when the press was taken.
    @MainActor func press(_ text: NSAttributedString, at index: Int, inside: (NSRange) -> Bool, command: Bool) -> Bool {
        guard !plain else { return false }
        for candidate in [index, index - 1] where candidate >= 0 && candidate < text.length {
            let range = NSRange(location: candidate, length: 1)
            if let atom = text.attribute(.editorAtom, at: candidate, effectiveRange: nil) as? EditorAtom, inside(range) {
                switch atom.node.type {
                case "pageLink": store.openLink(atom.node)
                case "inlineMath": store.editInlineFormula(path, at: candidate, atom.node)
                case "dateMention": store.openDate(atom.node.attr("date")?.string ?? "")
                default: return false
                }
                return true
            }
        }
        if command, let tag = EditorAtoms.tags(in: text).first(where: { NSLocationInRange(index, $0.range) }) {
            store.openTag(tag.name)
            return true
        }
        return false
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
        view.pasteDelegate = context.coordinator
        // pictures and files paste too, as files (Media.ts FileDrop), as well as text
        if !plain {
            let configuration = view.pasteConfiguration ?? UIPasteConfiguration(acceptableTypeIdentifiers: [UTType.text.identifier, UTType.url.identifier])
            configuration.addAcceptableTypeIdentifiers([UTType.image.identifier, UTType.fileURL.identifier])
            view.pasteConfiguration = configuration
        }
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.tapped(_:)))
        tap.delegate = context.coordinator
        view.addGestureRecognizer(tap)
        return view
    }

    func updateUIView(_ view: BlockTextView, context: Context) {
        let coordinator = context.coordinator
        let changedStyle = coordinator.block?.style != style || coordinator.block?.context != context.coordinator.block?.context
            || coordinator.block?.font != font || coordinator.block?.matches != matches || coordinator.block?.context != self.context
            || coordinator.block?.dark != dark || coordinator.block?.rendered != rendered
        // a pass where the block at this path is no longer text, before SwiftUI swaps the view out
        guard EditorSchema.textBlocks.contains(block.type) else { return }
        coordinator.block = self
        view.isEditable = editable
        view.undo.store = store
        // while a menu is open here, the keyboard offers no inline prediction: Return would take the prediction
        // into the text after the menu has put its choice in
        let prediction: UITextInlinePredictionType = store.slash?.path == path ? .no : .default
        if view.inlinePredictionType != prediction {
            view.inlinePredictionType = prediction
            if view.isFirstResponder { view.reloadInputViews() }
        }
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
        // the caret moves in this same pass, so no key pressed meanwhile finds no text view to go to
        if store.focusRequest?.path == path { coordinator.takeFocusIfAsked(view) }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: BlockTextView, context: Context) -> CGSize? {
        let width = proposal.width ?? 600
        let size = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: width, height: max(size.height, EditorStyle.size(style, font) * 1.3))
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    @MainActor
    final class Coordinator: NSObject, UITextViewDelegate, UIGestureRecognizerDelegate, UITextPasteDelegate {
        /// MarkdownPaste: pasted plain text that looks like Markdown becomes blocks; HTML and anything else paste
        /// as the system pastes them. The text comes through the paste item, as the system hands it over.
        func textPasteConfigurationSupporting(_ supporting: any UITextPasteConfigurationSupporting, transform item: UITextPasteItem) {
            let provider = item.itemProvider
            // files first, as FileDrop's handlePaste: a file, or a picture with no text with it
            if let store, block?.plain == false, !provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
               let view = supporting as? UITextView {
                let caret = EditorEdits.Caret(path: path, offset: view.selectedRange.location)
                if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
                    _ = provider.loadObject(ofClass: URL.self) { url, _ in
                        DispatchQueue.main.async {
                            guard let url else { return item.setDefaultResult() }
                            store.addFiles([url], at: caret)
                            item.setNoResult()
                        }
                    }
                    return
                }
                if let type = provider.registeredContentTypes.first(where: { $0.conforms(to: .image) }) {
                    let name = (provider.suggestedName ?? "image") + "." + (type.preferredFilenameExtension ?? "png")
                    _ = provider.loadDataRepresentation(for: type) { data, _ in
                        DispatchQueue.main.async {
                            guard let data else { return item.setDefaultResult() }
                            store.addFiles([(name: name, data: data)], at: caret)
                            item.setNoResult()
                        }
                    }
                    return
                }
            }
            guard !provider.hasItemConformingToTypeIdentifier("public.html"), provider.canLoadObject(ofClass: NSString.self) else {
                item.setDefaultResult()
                return
            }
            _ = provider.loadObject(ofClass: NSString.self) { [weak self] object, _ in
                let text = object as? String
                DispatchQueue.main.async {
                    guard let self, let store = self.store, let text, let view = supporting as? UITextView,
                          store.paste(text, at: self.path, view.selectedRange) else {
                        item.setDefaultResult()
                        return
                    }
                    item.setNoResult()
                }
            }
        }

        /// a chip or tag under a tap opens; any other tap places the caret as usual
        @objc func tapped(_ recognizer: UITapGestureRecognizer) {
            guard let view = recognizer.view as? UITextView, let block else { return }
            let point = recognizer.location(in: view)
            guard let position = view.closestPosition(to: point) else { return }
            let index = view.offset(from: view.beginningOfDocument, to: position)
            _ = block.press(view.attributedText, at: index, inside: { range in
                guard let start = view.position(from: view.beginningOfDocument, offset: range.location),
                      let end = view.position(from: start, offset: range.length),
                      let textRange = view.textRange(from: start, to: end) else { return false }
                return view.firstRect(for: textRange).insetBy(dx: -4, dy: -4).contains(point)
            }, command: recognizer.modifierFlags.contains(.command))
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }

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
                pushUnsent(textView.attributedText)
                store.enter(path, range.location)
                sync(textView)
                return false
            }
            // pasted plain text that looks like Markdown becomes blocks
            if (textView as? BlockTextView)?.pastingPlain == true, text.utf16.count > 1, store.paste(text, at: path, range) {
                return false
            }
            if !block.plain, text.contains("\n"), textView.markedTextRange == nil {
                store.insertLines(path, range, text, in: textView.attributedText)
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
        var unsent = false
        /// the last focus request this view has carried out
        var taken: Int?

        /// composed text the store has not had yet; text the store already has is never sent again, as the view's
        /// copy can be older than the store's
        func pushUnsent(_ text: NSAttributedString) {
            guard unsent, let store else { return }
            unsent = false
            store.textChanged(path, text)
        }

        /// the view takes the block's text from the store at once after an edit it asked for, so nothing typed
        /// before SwiftUI draws again lands in old text
        func sync(_ textView: UITextView) {
            guard let block, let store, let current = store.block(path), EditorSchema.textBlocks.contains(current.type) else { return }
            let updated = EditorTextBlock(store: store, path: path, block: current, style: block.style, context: block.context, font: block.font,
                                          editable: block.editable, matches: block.matches, dark: block.dark, rendered: block.rendered)
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

        func textViewDidBeginEditing(_ textView: UITextView) {
            guard !applying else { return }
            reportSelection(textView)
        }

        /// the caret comes here when the store asks for it, once the view is in a window; a view not yet in one
        /// takes it when it arrives (`didMoveToWindow`), and one on its way out leaves it to the view replacing it
        func takeFocusIfAsked(_ view: UITextView, attempt: Int = 0) {
            // a request is taken once: until the store hears of it, later passes would put the caret back
            guard let store, let current = store.focusRequest, current.path == path, current.id != taken, view.window != nil, let block,
                  let model = store.block(path), EditorSchema.textBlocks.contains(model.type) else { return }
            // this can run while SwiftUI updates its views: the view changes now, the store a moment later
            let updated = EditorTextBlock(store: store, path: path, block: model, style: block.style, context: block.context, font: block.font,
                                          editable: block.editable, matches: block.matches, dark: block.dark, rendered: block.rendered)
            applying = true
            if !updated.same(view.attributedText) { view.attributedText = updated.styled() }
            let became = view.isFirstResponder || view.becomeFirstResponder()
            if became {
                let length = view.attributedText.length
                let location = min(current.range.location, length)
                view.selectedRange = NSRange(location: location, length: min(current.range.length, length - location))
            }
            applying = false
            guard became else {
                // UIKit can refuse while it is changing its views; the next turn of the run loop takes it
                if attempt < 5 { DispatchQueue.main.async { [weak self] in self?.takeFocusIfAsked(view, attempt: attempt + 1) } }
                return
            }
            taken = current.id
            self.block = updated
            DispatchQueue.main.async { [weak self] in
                store.tookFocus(current)
                self?.reportSelection(view)
                self?.applyTypingAttributes(view)
            }
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            guard let store else { return }
            let path = path
            // only what the store has not had yet: the view's text may be older than the store's by now
            let pending = unsent ? NSAttributedString(attributedString: textView.attributedText) : nil
            unsent = false
            // the caret can leave while SwiftUI updates its views, so the store hears of it a moment later
            DispatchQueue.main.async {
                if let pending { store.textChanged(path, pending) }
                store.blurred(path)
            }
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
            textView.invalidateIntrinsicContentSize()
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

    /// a picture or a file on the pasteboard pastes too (Media.ts FileDrop); these checks read no content, so
    /// the system asks nothing until the paste itself
    override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
        if action == #selector(paste(_:)), isEditable, owner?.block?.plain == false,
           UIPasteboard.general.hasImages || UIPasteboard.general.hasURLs {
            return true
        }
        return super.canPerformAction(action, withSender: sender)
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }
        owner?.takeFocusIfAsked(self)
    }

    private var store: EditorStore? { owner?.store }
    private var path: EditorEdits.Path { owner?.path ?? [] }

    /// iOS reads pasted text through the paste delegate (Coordinator), never here
    var pastingPlain: Bool { false }

    override func deleteBackward() {
        if let store, store.caretLeaving(path), markedTextRange == nil { return }
        if markedTextRange == nil, selectedRange == NSRange(location: 0, length: 0), let store {
            owner?.pushUnsent(attributedText)
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
            owner?.pushUnsent(attributedText)
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
            || coordinator.block?.dark != dark || coordinator.block?.rendered != rendered
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
        if store.focusRequest?.path == path { coordinator.takeFocusIfAsked(view) }
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
            if let store, let text, (textView as? BlockTextView)?.pastingPlain == true, text.utf16.count > 1, store.paste(text, at: path, range) {
                return false
            }
            if let store, let text, block?.plain == false, text.contains("\n"), !textView.hasMarkedText(), let storage = textView.textStorage {
                store.insertLines(path, range, text, in: storage)
                sync(textView)
                return false
            }
            inserted = text.flatMap { $0.utf16.count == 1 && range.length == 0 ? ($0, range.location) : nil }
            return true
        }

        /// composed text not yet given to the store
        var unsent = false
        /// the last focus request this view has carried out
        var taken: Int?

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

        func pushUnsent(_ text: NSAttributedString) {
            guard unsent, let store else { return }
            unsent = false
            store.textChanged(path, text)
        }

        /// the view takes the block's text from the store at once after an edit it asked for
        func sync(_ view: NSTextView) {
            guard let block, let store, let storage = view.textStorage, let current = store.block(path),
                  EditorSchema.textBlocks.contains(current.type) else { return }
            let updated = EditorTextBlock(store: store, path: path, block: current, style: block.style, context: block.context, font: block.font,
                                          editable: block.editable, matches: block.matches, dark: block.dark, rendered: block.rendered)
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
            guard !applying, let view = notification.object as? NSTextView else { return }
            reportSelection(view)
        }

        func takeFocusIfAsked(_ view: NSTextView) {
            guard let store, let current = store.focusRequest, current.path == path, current.id != taken, let window = view.window, let block,
                  let storage = view.textStorage, let model = store.block(path), EditorSchema.textBlocks.contains(model.type) else { return }
            let updated = EditorTextBlock(store: store, path: path, block: model, style: block.style, context: block.context, font: block.font,
                                          editable: block.editable, matches: block.matches, dark: block.dark, rendered: block.rendered)
            applying = true
            if !updated.same(storage) { storage.setAttributedString(updated.styled()) }
            let became = window.firstResponder === view || window.makeFirstResponder(view)
            if became {
                let location = min(current.range.location, storage.length)
                view.setSelectedRange(NSRange(location: location, length: min(current.range.length, storage.length - location)))
            }
            applying = false
            guard became else { return }
            taken = current.id
            self.block = updated
            DispatchQueue.main.async { [weak self] in
                store.tookFocus(current)
                self?.reportSelection(view)
                self?.applyTypingAttributes(view)
            }
        }

        func textDidEndEditing(_ notification: Notification) {
            guard let view = notification.object as? NSTextView, let store, let storage = view.textStorage else { return }
            let path = path
            let pending = unsent ? NSAttributedString(attributedString: storage) : nil
            unsent = false
            DispatchQueue.main.async {
                if let pending { store.textChanged(path, pending) }
                store.blurred(path)
            }
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
                pushUnsent(storage)
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
                pushUnsent(storage)
                store.backspaceAtStart(path)
                return true
            case #selector(NSResponder.deleteForward(_:)) where range == NSRange(location: length, length: 0):
                pushUnsent(storage)
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
            view.invalidateIntrinsicContentSize()
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
        owner?.takeFocusIfAsked(self)
    }

    override var intrinsicContentSize: NSSize {
        guard let layout = textLayoutManager else { return super.intrinsicContentSize }
        layout.ensureLayout(for: layout.documentRange)
        return NSSize(width: NSView.noIntrinsicMetric, height: ceil(layout.usageBoundsForTextContainer.height))
    }

    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        let index = characterIndexForInsertion(at: point)
        if let block = owner?.block, let storage = textStorage,
           block.press(storage, at: index, inside: { range in
               guard let window else { return false }
               let screen = firstRect(forCharacterRange: range, actualRange: nil)
               let inView = convert(window.convertFromScreen(screen), from: nil)
               return inView.insetBy(dx: -4, dy: -4).contains(point)
           }, command: event.modifierFlags.contains(.command)) {
            return
        }
        super.mouseDown(with: event)
    }

    /// set while the system pastes, so pasted plain text that looks like Markdown can become blocks
    private(set) var pastingPlain = false

    override func paste(_ sender: Any?) {
        let board = NSPasteboard.general
        // files first, as FileDrop's handlePaste: files copied in the Finder, or a picture with no text with it
        if let owner, let store = owner.store, owner.block?.plain == false {
            let caret = EditorEdits.Caret(path: owner.path, offset: selectedRange().location)
            if let urls = board.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL], !urls.isEmpty {
                store.addFiles(urls, at: caret)
                return
            }
            if board.string(forType: .string) == nil {
                for (type, ext) in [(NSPasteboard.PasteboardType.png, "png"), (.tiff, "tiff")] {
                    if let data = board.data(forType: type) {
                        store.addFiles([(name: "image.\(ext)", data: data)], at: caret)
                        return
                    }
                }
            }
        }
        pastingPlain = !(board.types?.contains(.html) ?? false)
        defer { pastingPlain = false }
        super.paste(sender)
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
