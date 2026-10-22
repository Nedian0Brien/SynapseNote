import Foundation
import Observation

/// A page open in the native editor, as Morrow's PageEditor keeps it: the document opened as TipTap opens it,
/// every change made through `EditorEdits` and saved as the whole document 250 ms after the last one
/// (`page.setDoc`), the document set again when it changed elsewhere and nothing here is waiting, and a page-wide
/// undo history in place of ProseMirror's.
@Observable @MainActor
final class EditorStore {
    typealias Path = EditorEdits.Path

    let controller: EditorController
    let pageId: String
    private(set) var doc: DocNode = .node("doc", ("content", [.object(.node("paragraph"))]))
    private(set) var loaded = false
    /// the page's document could not be opened as TipTap opens it
    private(set) var failed = false

    /// where the caret is, as the focused text view reports it
    struct Focus: Equatable {
        var path: Path
        var range: NSRange
    }
    private(set) var focus: Focus?
    /// the selection or caret in the window, where the menus float
    var selectionRect: CGRect?
    /// a place for the caret to go; the text view at the path takes it and clears it
    struct FocusRequest: Equatable {
        let id: Int
        var path: Path
        var range: NSRange
    }
    private(set) var focusRequest: FocusRequest?
    private var requests = 0

    /// the menu typed into the text: "/" for blocks, "[[" for a page link, "@" for a date or page; where its
    /// trigger starts, and the text typed after it
    struct Slash: Equatable {
        enum Kind: Equatable {
            case block
            case link
            case mention
        }

        var path: Path
        var start: Int
        var query: String
        var selected = 0
        var kind: Kind = .block
        /// how long the trigger is: 1 for "/" and "@", 2 for "[["
        var trigger = 1
    }
    /// what written link targets find, for links made before their page existed
    var resolvedTargets: [String: String] = [:]
    /// the pages the "[[" and "@" menus offer for their query, looked up as it is typed
    var pageResults: [DatabaseSnapshot.RelatedPage] = []
    @ObservationIgnored private var pageLookup: Task<Void, Never>?
    var slash: Slash?

    /// the find bar
    struct Find: Equatable {
        var query = ""
        var replacement = ""
        var current = 0
    }
    var find: Find?
    /// the link field over the selection
    var editingLink = false
    /// the formatting bar's colour panel
    var coloring = false
    /// a typed mark, such as bold turned on with nothing selected: what the next characters get (stored marks)
    var storedMarks: [DocMark]?
    /// the formula or kept-as-written text open for editing (Morrow's SourceDialog)
    var sourceEdit: SourceEdit?
    /// the file picker the slash menu's Image and File open, and the caret the files go to
    var filePick: FilePick?
    /// whether that picker is up; kept apart from `filePick`, which SwiftUI would clear before the picked files
    /// arrive
    var pickingFiles = false

    /// what was last sent to the session or read from it, to tell an outside change from this editor's own
    @ObservationIgnored private var committed: DocNode?
    @ObservationIgnored private var dirty = false
    @ObservationIgnored private var timer: Task<Void, Never>?
    @ObservationIgnored private var saving: Task<Void, Never>?

    // page-wide undo: the documents before each group of changes, ProseMirror's 500 ms grouping for typing
    struct Snapshot {
        var doc: DocNode
        var caret: Focus?
    }
    @ObservationIgnored private var undoStack: [Snapshot] = []
    @ObservationIgnored private var redoStack: [Snapshot] = []
    @ObservationIgnored private var lastTyping: ContinuousClock.Instant?
    /// set while one action makes several changes, so they undo as one
    @ObservationIgnored private var batching = false
    static let groupDelay = Duration.milliseconds(500)
    static let saveDelay = Duration.milliseconds(250)
    static let maxHistory = 100

    /// false for a page shown inside another page or a version in its history: drawn as the editor draws it,
    /// never changed from here
    let editable: Bool
    /// how far inside other pages this document is shown; a page shown inside one draws its own embeds as links,
    /// as Morrow's docToHtml does, so pages never show each other in a loop
    let embedDepth: Int
    /// a version from the history: the document given, never read again
    @ObservationIgnored private var fixed = false

    init(controller: EditorController, pageId: String, editable: Bool = true, embedDepth: Int = 0) {
        self.controller = controller
        self.pageId = pageId
        self.editable = editable
        self.embedDepth = embedDepth
    }

    /// a version of the page from its history, opened as TipTap opens it and drawn read only
    init(controller: EditorController, pageId: String, version: DocNode) {
        self.controller = controller
        self.pageId = pageId
        editable = false
        embedDepth = 1
        fixed = true
        if let opened = try? EditorSchema.normalize(version) { doc = opened } else { failed = true }
        loaded = true
    }

    // MARK: the document

    /// the page's document from the session; set here only when it changed elsewhere and nothing is waiting
    func load() async {
        guard !fixed, let source = await controller.editorDoc(pageId) else { return }
        if loaded, let committed, JSJSON.stringify(.object(committed)) == JSJSON.stringify(.object(source)) { return }
        guard !dirty, saving == nil else { return }
        do {
            let opened = try EditorSchema.normalize(source)
            committed = source
            if loaded {
                // content changed outside this editor, for example a task ticked in the tasks view
                doc = opened
                if let focus, EditorEdits.node(doc, focus.path) == nil { self.focus = nil }
            } else {
                doc = opened
                loaded = true
            }
        } catch {
            failed = true
            loaded = true
        }
    }

    func block(_ path: Path) -> DocNode? { EditorEdits.node(doc, path) }

    /// a change to the document: recorded for undo, then saved after the delay
    func apply(_ next: DocNode, caret: EditorEdits.Caret? = nil, range: NSRange? = nil, typing: Bool = false) {
        guard editable else { return }
        guard next != doc else {
            if let caret { requestFocus(caret.path, range ?? NSRange(location: caret.offset, length: 0)) }
            return
        }
        record(typing: typing)
        // once edited, a document ends in a paragraph (Morrow's TrailingNode)
        doc = EditorSchema.trailingParagraph(next)
        markDirty()
        if let caret { requestFocus(caret.path, range ?? NSRange(location: caret.offset, length: 0)) }
    }

    private func record(typing: Bool) {
        guard !batching else { return }
        let now = ContinuousClock.now
        if typing, let last = lastTyping, now - last < Self.groupDelay {
            lastTyping = now
            return
        }
        lastTyping = typing ? now : nil
        undoStack.append(Snapshot(doc: doc, caret: focus))
        if undoStack.count > Self.maxHistory { undoStack.removeFirst() }
        redoStack.removeAll()
    }

    var canUndo: Bool { !undoStack.isEmpty }
    var canRedo: Bool { !redoStack.isEmpty }

    func undo() {
        guard let previous = undoStack.popLast() else { return }
        redoStack.append(Snapshot(doc: doc, caret: focus))
        restore(previous)
    }

    func redo() {
        guard let next = redoStack.popLast() else { return }
        undoStack.append(Snapshot(doc: doc, caret: focus))
        restore(next)
    }

    private func restore(_ snapshot: Snapshot) {
        lastTyping = nil
        doc = snapshot.doc
        markDirty()
        if let caret = snapshot.caret, EditorEdits.node(doc, caret.path) != nil {
            requestFocus(caret.path, caret.range)
        } else if let first = EditorEdits.textBlocks(doc).first {
            requestFocus(first, NSRange(location: 0, length: 0))
        }
    }

    private func markDirty() {
        dirty = true
        controller.holdSave("editor:\(pageId)") { [weak self] in await self?.flush() }
        timer?.cancel()
        timer = Task { [weak self] in
            try? await Task.sleep(for: Self.saveDelay)
            guard !Task.isCancelled else { return }
            await self?.flush()
        }
    }

    /// sends the document now if it changed, and returns once the session has it
    func flush() async {
        timer?.cancel()
        timer = nil
        guard dirty else {
            await saving?.value
            return
        }
        dirty = false
        let sent = doc
        committed = sent
        let task = Task { await controller.setDoc(pageId, sent) }
        saving = task
        await task.value
        if saving == task { saving = nil }
        if !dirty { controller.releaseSave("editor:\(pageId)") }
    }

    // MARK: focus


    /// the caret placed for an action that follows at once, without moving the view's
    func focusAt(_ path: Path) { focus = Focus(path: path, range: NSRange(location: 0, length: 0)) }

    func requestFocus(_ path: Path, _ range: NSRange) {
        requests += 1
        focusRequest = FocusRequest(id: requests, path: path, range: range)
    }

    func tookFocus(_ request: FocusRequest) {
        if focusRequest?.id == request.id { focusRequest = nil }
    }

    /// Text typed while the caret is on its way to another block, before that block's view has taken it: it
    /// goes where the caret is going, so fast typing after Enter or an input rule loses nothing.
    func typeAhead(_ text: String) {
        guard let request = focusRequest, let block = block(request.path) else { return }
        if text == "\n" {
            enter(request.path, request.range.location)
            return
        }
        let current = NSMutableAttributedString(attributedString: InlineText.attributed(block.content ?? []))
        let range = NSRange(location: min(request.range.location, current.length), length: min(request.range.length, max(0, current.length - request.range.location)))
        let marks = range.location > 0 ? current.attribute(.editorMarks, at: range.location - 1, effectiveRange: nil) : nil
        current.replaceCharacters(in: range, with: NSAttributedString(string: text, attributes: marks.map { [.editorMarks: $0] } ?? [:]))
        let caret = range.location + text.utf16.count
        // the input rules and the slash menu run as they would in the block's own view
        if text.utf16.count == 1, range.length == 0, typed(request.path, text: current, caret: caret, character: text) { return }
        let plain = block.type == "codeBlock"
        apply(EditorEdits.replacing(doc, request.path, with: EditorEdits.withInline(block, InlineText.content(current, plain: plain))), typing: true)
        requestFocus(request.path, NSRange(location: caret, length: 0))
    }

    /// text with line breaks in it, such as Return pressed while an autocorrection is pending, which comes as the
    /// corrected word and the newline together: each newline splits the block as Enter does
    func insertLines(_ path: Path, _ range: NSRange, _ text: String, in current: NSAttributedString) {
        guard let block = block(path) else { return }
        let parts = text.components(separatedBy: "\n")
        let updated = NSMutableAttributedString(attributedString: InlineText.attributed(block.content ?? []))
        _ = current
        let marks = range.location > 0 && range.location <= updated.length ? updated.attribute(.editorMarks, at: range.location - 1, effectiveRange: nil) : nil
        updated.replaceCharacters(in: range, with: NSAttributedString(string: parts[0], attributes: marks.map { [.editorMarks: $0] } ?? [:]))
        apply(EditorEdits.replacing(doc, path, with: EditorEdits.withInline(block, InlineText.content(updated))), typing: true)
        let caret = range.location + parts[0].utf16.count
        // a menu open here reads its query again: an accepted prediction or correction changed it
        if var open = slash, open.path == path {
            let from = open.start + open.trigger
            open.query = caret > from ? (updated.string as NSString).substring(with: NSRange(location: from, length: caret - from)) : ""
            slash = open
        }
        enter(path, caret)
        for part in parts.dropFirst().dropLast() {
            if !part.isEmpty { typeAhead(part) }
            typeAhead("\n")
        }
        if let last = parts.dropFirst().last, !last.isEmpty { typeAhead(last) }
    }

    /// a focus move is on its way to a block other than this one
    func caretLeaving(_ path: Path) -> Bool {
        guard let request = focusRequest else { return false }
        return request.path != path
    }

    func focused(_ path: Path, _ range: NSRange) {
        let next = Focus(path: path, range: range)
        if focus != next {
            if focus?.path != path || (focus?.range.location != range.location) { storedMarks = nil }
            focus = next
        }
        if let slash, slash.path != path || range.location <= slash.start { self.slash = nil }
        // the query runs to the caret, however the text before it changed (an accepted prediction, a correction)
        if var open = slash, let block = block(path) {
            let text = InlineText.string(block.content ?? []) as NSString
            let from = open.start + open.trigger
            let caret = min(range.location, text.length)
            let query = caret > from ? text.substring(with: NSRange(location: from, length: caret - from)) : ""
            if query != open.query {
                open.query = query
                open.selected = 0
                slash = open
                if open.kind != .block { lookUpPages(query) }
            }
        }
    }

    func blurred(_ path: Path) {
        if focus?.path == path { focus = nil }
        if slash?.path == path { slash = nil }
    }

    // MARK: typing

    /// the text of a block as the text view now holds it
    func textChanged(_ path: Path, _ text: NSAttributedString) {
        guard let block = block(path) else { return }
        let content = InlineText.content(text, plain: block.type == "codeBlock")
        guard JSJSON.stringify(.array(content.map(JSValue.object))) != JSJSON.stringify(.array((block.content ?? []).map(JSValue.object))) else { return }
        apply(EditorEdits.replacing(doc, path, with: EditorEdits.withInline(block, content)), typing: true)
    }

    /// a character typed at the caret: the input rules, then the slash menu. True when a rule changed the block,
    /// so the text view takes the new text instead of its own.
    func typed(_ path: Path, text: NSAttributedString, caret: Int, character: String) -> Bool {
        guard let block = block(path), block.type != "codeBlock" else { return false }
        let string = text.string as NSString
        let before = string.substring(to: min(caret, string.length))
        // TipTap runs no input rule next to code-marked text (run$1): the text node before the typed character,
        // or the one after when there is none
        let neighbour = caret - 2 >= 0 ? caret - 2 : caret < string.length ? caret : -1
        let inCode = neighbour >= 0 && (text.attribute(.editorMarks, at: neighbour, effectiveRange: nil) as? EditorMarkSet)?.has("code") == true
        if !inCode, let (next, place) = EditorEdits.blockInputRule(EditorEdits.replacing(doc, path, with: EditorEdits.withInline(block, InlineText.content(text))),
                                                           path, textBefore: before, caretAfter: caret) {
            apply(next, caret: place)
            slash = nil
            return true
        }
        if !inCode, let rule = EditorEdits.markInputRule(textBefore: before) {
            // the markers go and the text between them takes the mark (markInputRule)
            let marked = NSMutableAttributedString(attributedString: InlineText.addMark(text, rule.inner, InlineText.mark(rule.mark)))
            let innerText = marked.attributedSubstring(from: rule.inner)
            marked.replaceCharacters(in: rule.whole, with: innerText)
            let end = rule.whole.location + rule.inner.length
            apply(EditorEdits.replacing(doc, path, with: EditorEdits.withInline(block, InlineText.content(marked))),
                  caret: EditorEdits.Caret(path: path, offset: end))
            storedMarks = (storedMarks ?? []).filter { $0.type != rule.mark }
            return true
        }
        // the formula rules, after the marks' as the extensions are added (mathExtensions)
        if !inCode, let rule = EditorEdits.mathInputRule(textBefore: before) {
            let current = EditorEdits.replacing(doc, path, with: EditorEdits.withInline(block, InlineText.content(text)))
            switch rule {
            case .inline(let range, let latex):
                let math = DocNode.node("inlineMath", ("attrs", ["latex": .string(latex)]))
                let (next, place) = EditorEdits.insertInline(current, path, range, [math])
                apply(next, caret: place)
            case .block(let latex):
                let (next, place) = EditorEdits.applyBlockMath(current, path, textLength: string.length, caret: caret, latex: latex)
                apply(next, caret: place)
            }
            slash = nil
            return true
        }
        let start = caret - 1
        let previous = start > 0 ? string.substring(with: NSRange(location: start - 1, length: 1)) : " "
        // "/" and "@" open their menus at the start of a line or after a space (Suggestion's allowedPrefixes),
        // "[[" anywhere (PageLink's allowedPrefixes: null)
        let atWordStart = start == 0 || previous == " " || previous == "\n" || previous == "\u{2028}"
        if character == "/", atWordStart {
            slash = Slash(path: path, start: start, query: "")
        } else if character == "@", atWordStart {
            slash = Slash(path: path, start: start, query: "", kind: .mention)
            lookUpPages("")
        } else if character == "[", previous == "[", start > 0 {
            slash = Slash(path: path, start: start - 1, query: "", kind: .link, trigger: 2)
            lookUpPages("")
        } else if var open = slash, open.path == path {
            // allowSpaces: the query runs to the caret; two spaces in a row close it, and a slash query past 40
            let from = open.start + open.trigger
            let query = caret > from ? string.substring(with: NSRange(location: from, length: caret - from)) : ""
            if caret < from || query.contains("  ") || (open.kind == .block && query.utf16.count > 40) {
                slash = nil
            } else {
                open.query = query
                open.selected = 0
                slash = open
                if open.kind != .block { lookUpPages(query) }
            }
        }
        return false
    }

    /// the pages for a "[[" or "@" query: findPagesByTitle's eight, this page left out; a link query drops the
    /// "]]" typed after it
    private func lookUpPages(_ query: String) {
        pageLookup?.cancel()
        let title = query.replacingOccurrences(of: "\\]+$", with: "", options: .regularExpression).trimmingCharacters(in: .whitespaces)
        pageLookup = Task { [weak self] in
            guard let self else { return }
            let found = await controller.findPages(title, excluding: pageId, limit: 8)
            guard !Task.isCancelled else { return }
            pageResults = found
        }
    }

    // MARK: keys

    func enter(_ path: Path, _ offset: Int) {
        if slash != nil {
            runSlash()
            return
        }
        let (next, caret) = EditorEdits.enter(doc, path, offset)
        apply(next, caret: caret)
    }

    func hardBreak(_ path: Path, _ range: NSRange, _ text: NSAttributedString) {
        guard let block = block(path) else { return }
        // the store's text, which the view's copy can lag behind
        let updated = NSMutableAttributedString(attributedString: InlineText.attributed(block.content ?? []))
        _ = text
        if block.type == "codeBlock" {
            updated.replaceCharacters(in: range, with: "\n")
        } else {
            updated.replaceCharacters(in: range, with: InlineText.attributed([.node("hardBreak")]))
        }
        apply(EditorEdits.replacing(doc, path, with: EditorEdits.withInline(block, InlineText.content(updated, plain: block.type == "codeBlock"))),
              caret: EditorEdits.Caret(path: path, offset: range.location + 1))
    }

    func backspaceAtStart(_ path: Path) {
        if let (next, caret) = EditorEdits.backspaceAtStart(doc, path) { apply(next, caret: caret) }
        else if let previous = neighbour(path, before: true) { moveCaret(to: previous, atEnd: true) }
    }

    func deleteAtEnd(_ path: Path) {
        if let (next, caret) = EditorEdits.deleteAtEnd(doc, path) { apply(next, caret: caret) }
    }

    /// Tab and Shift-Tab: a list item in or out. False when the block is not in a list, so the key does its own thing.
    func indent(_ path: Path, out: Bool) -> Bool {
        // a list item that can move takes Tab first, then a table cell (TipTap runs StarterKit's keys before Table's)
        let movable = itemPath(path).flatMap { out ? EditorEdits.outdent(doc, $0) : EditorEdits.indent(doc, $0) }
        if movable == nil, tabInTable(path, back: out) { return true }
        guard let itemPath = itemPath(path) else { return false }
        let result = out ? EditorEdits.outdent(doc, itemPath) : EditorEdits.indent(doc, itemPath)
        if let (next, caret) = result {
            let offset = focus?.path == path ? focus?.range.location ?? 0 : 0
            apply(next, caret: EditorEdits.Caret(path: caret.path + Array(path.suffix(from: itemPath.count + 1)), offset: offset))
        }
        return true
    }

    /// the list item a block sits in directly
    func itemPath(_ path: Path) -> Path? {
        let parent = Array(path.dropLast())
        guard let item = EditorEdits.node(doc, parent), EditorEdits.itemTypes.contains(item.type) else { return nil }
        return parent
    }

    /// the text block before or after one, for the arrow keys
    func neighbour(_ path: Path, before: Bool) -> Path? {
        let blocks = EditorEdits.textBlocks(doc)
        guard let index = blocks.firstIndex(of: path) else { return nil }
        let other = before ? index - 1 : index + 1
        return blocks.indices.contains(other) ? blocks[other] : nil
    }

    func moveCaret(to path: Path, atEnd: Bool) {
        let length = block(path).map(EditorEdits.length) ?? 0
        requestFocus(path, NSRange(location: atEnd ? length : 0, length: 0))
    }

    /// the arrow keys past the edge of a block: the next block, or the title above the first
    func arrow(_ path: Path, up: Bool) -> Bool {
        if let next = neighbour(path, before: up) {
            moveCaret(to: next, atEnd: up)
            return true
        }
        if up {
            controller.focusTitle(pageId)
            return true
        }
        return false
    }

    // MARK: blocks and marks

    func setBlockType(_ type: String, level: Int? = nil, language: String? = nil, toggle: Bool = false) {
        guard let focus else { return }
        apply(EditorEdits.setBlockType(doc, focus.path, type, level: level, language: language, toggle: toggle),
              caret: EditorEdits.Caret(path: focus.path, offset: focus.range.location), range: focus.range)
    }

    func toggleList(_ listType: String) {
        guard let focus else { return }
        let (next, caret) = EditorEdits.toggleList(doc, focus.path, listType)
        apply(next, caret: EditorEdits.Caret(path: caret.path, offset: focus.range.location))
    }

    func quote() {
        guard let focus else { return }
        let (next, caret) = EditorEdits.wrapInQuote(doc, focus.path)
        apply(next, caret: EditorEdits.Caret(path: caret.path, offset: focus.range.location))
    }

    func rule() {
        guard let focus else { return }
        let (next, caret) = EditorEdits.insertRule(doc, focus.path, focus.range.location)
        apply(next, caret: caret)
    }

    func setChecked(_ itemPath: Path, _ checked: Bool) {
        apply(EditorEdits.setChecked(doc, itemPath, checked))
    }

    func setLanguage(_ path: Path, _ language: String?) {
        guard var block = block(path), block.type == "codeBlock" else { return }
        var attrs = block.attrs ?? JSObject()
        attrs["language"] = language.map(JSValue.string) ?? .null
        block.attrs = attrs
        apply(EditorEdits.replacing(doc, path, with: block))
    }

    /// the block's text with a change to the marks of the selection, or to the marks typed next when nothing is
    /// selected
    func changeMarks(_ change: (NSAttributedString, NSRange) -> NSAttributedString, stored: ([DocMark]) -> [DocMark]) {
        guard let focus, let block = block(focus.path), block.type != "codeBlock" else { return }
        let text = InlineText.attributed(block.content ?? [])
        guard focus.range.length > 0 else {
            let current = storedMarks ?? marks(at: focus.range.location, in: text)
            storedMarks = stored(current)
            return
        }
        let changed = change(text, focus.range)
        apply(EditorEdits.replacing(doc, focus.path, with: EditorEdits.withInline(block, InlineText.content(changed))),
              caret: EditorEdits.Caret(path: focus.path, offset: focus.range.location), range: focus.range)
    }

    func toggleMark(_ type: String) {
        let mark = InlineText.mark(type)
        let active = isMarkActive(type)
        changeMarks({ InlineText.toggleMark($0, $1, mark) },
                    stored: { active ? $0.filter { $0.type != type } : InlineText.addToSet($0, mark) })
    }

    func setColor(_ type: String, _ color: String?) {
        changeMarks({ text, range in
            color.map { InlineText.addMark(text, range, InlineText.mark(type, [("color", .string($0))])) } ?? InlineText.removeMark(text, range, type: type)
        }, stored: { marks in
            let kept = marks.filter { $0.type != type }
            return color.map { InlineText.addToSet(kept, InlineText.mark(type, [("color", .string($0))])) } ?? kept
        })
    }

    /// the link over the selection, or over the link around the caret; nil takes it off
    func setLink(_ href: String?) {
        guard let focus, let block = block(focus.path) else { return }
        let text = InlineText.attributed(block.content ?? [])
        let range = focus.range.length > 0 ? focus.range : InlineText.markRange(text, at: focus.range.location, type: "link") ?? focus.range
        guard range.length > 0 else { return }
        let changed = href.map { InlineText.addMark(text, range, InlineText.mark("link", [("href", .string($0))])) }
            ?? InlineText.removeMark(text, range, type: "link")
        apply(EditorEdits.replacing(doc, focus.path, with: EditorEdits.withInline(block, InlineText.content(changed))),
              caret: EditorEdits.Caret(path: focus.path, offset: range.location), range: range)
    }

    /// the marks the next character typed at an offset gets: those of the character before it
    func marks(at offset: Int, in text: NSAttributedString) -> [DocMark] {
        guard text.length > 0 else { return [] }
        let index = offset > 0 ? min(offset - 1, text.length - 1) : 0
        return (text.attribute(.editorMarks, at: index, effectiveRange: nil) as? EditorMarkSet)?.marks ?? []
    }

    /// TipTap's isActive for a mark: the whole selection has it, or the caret's stored or inherited marks do
    func isMarkActive(_ type: String) -> Bool {
        guard let focus, let block = block(focus.path) else { return false }
        let text = InlineText.attributed(block.content ?? [])
        if focus.range.length > 0 { return InlineText.hasMark(text, focus.range, type: type) }
        return (storedMarks ?? marks(at: focus.range.location, in: text)).contains { $0.type == type }
    }

    func activeMark(_ type: String) -> DocMark? {
        guard let focus, let block = block(focus.path) else { return nil }
        let text = InlineText.attributed(block.content ?? [])
        let probe = focus.range.length > 0 ? focus.range.location : max(0, focus.range.location - 1)
        guard text.length > 0 else { return nil }
        return (text.attribute(.editorMarks, at: min(probe, text.length - 1), effectiveRange: nil) as? EditorMarkSet)?.mark(type)
    }

    var focusedBlockType: String? { focus.flatMap { block($0.path)?.type } }

    func isHeading(_ level: Int) -> Bool {
        guard let focus, let block = block(focus.path), block.type == "heading" else { return false }
        return block.attr("level")?.number.map(Int.init) == level
    }

    // MARK: the slash menu

    var slashItems: [SlashItem] {
        guard let slash else { return [] }
        switch slash.kind {
        case .block:
            return SlashItem.filter(slash.query)
        case .link:
            let title = slash.query.replacingOccurrences(of: "\\]+$", with: "", options: .regularExpression).trimmingCharacters(in: .whitespaces)
            var items = pageResults.map { pageItem($0) }
            if !title.isEmpty, !pageResults.contains(where: { $0.title.lowercased() == title.lowercased() }) {
                items.append(SlashItem(id: "create:\(title)", title: "New subpage “\(title)”", description: "", symbol: "doc.badge.plus",
                                       keywords: "", action: .newPage(title: title)))
            }
            return items
        case .mention:
            // a query past 30 finds nothing, as Morrow's date menu
            guard slash.query.utf16.count <= 30 else { return [] }
            let dates = DateMentions.suggestions(slash.query).map { date -> SlashItem in
                let key = Daily.dateKey(date)
                return SlashItem(id: "date:\(key)", title: DateMentions.describe(key), description: DateMentions.long(date), symbol: "calendar",
                                 keywords: "", action: .date(key: key))
            }
            return dates + pageResults.prefix(5).map { pageItem($0) }
        }
    }

    /// a page in the "[[" and "@" menus, with the pages it sits under
    private func pageItem(_ page: DatabaseSnapshot.RelatedPage) -> SlashItem {
        let path = controller.workspace.ancestors(of: page.id).reversed().map(\.displayTitle).joined(separator: " / ")
        return SlashItem(id: "page:\(page.id)", title: page.title, description: path, symbol: "doc.text", keywords: "",
                         action: .page(id: page.id, title: page.title))
    }

    func moveSlash(by step: Int) {
        guard var open = slash else { return }
        let count = slashItems.count
        guard count > 0 else { return }
        open.selected = (open.selected + step + count) % count
        slash = open
    }

    /// the chosen block, in place of the slash and what was typed after it
    func runSlash(_ chosen: SlashItem? = nil) {
        guard let open = slash, let block = block(open.path) else { return }
        let items = slashItems
        guard let item = chosen ?? (items.indices.contains(open.selected) ? items[open.selected] : nil) else {
            slash = nil
            return
        }
        slash = nil
        if item.action != .block {
            choose(item.action, open, block)
            return
        }
        let text = NSMutableAttributedString(attributedString: InlineText.attributed(block.content ?? []))
        let end = min(open.start + 1 + open.query.utf16.count, text.length)
        text.deleteCharacters(in: NSRange(location: open.start, length: max(0, end - open.start)))
        let cleared = EditorEdits.replacing(doc, open.path, with: EditorEdits.withInline(block, InlineText.content(text)))
        // the slash and its query go in the same step as the block, as one undo
        record(typing: false)
        batching = true
        defer { batching = false }
        apply(cleared, caret: EditorEdits.Caret(path: open.path, offset: open.start))
        focus = Focus(path: open.path, range: NSRange(location: open.start, length: 0))
        item.run(self, open.path, open.start)
    }

    // MARK: find

    /// every match of the find bar's text, by block, case folded as Morrow's FindReplace folds it
    var findMatches: [(path: Path, range: NSRange)] {
        guard let query = find?.query, !query.isEmpty else { return [] }
        let needle = query.lowercased() as NSString
        var out: [(Path, NSRange)] = []
        for path in EditorEdits.textBlocks(doc) {
            let text = InlineText.string(block(path)?.content ?? []).lowercased() as NSString
            var start = 0
            while start < text.length {
                let found = text.range(of: needle as String, range: NSRange(location: start, length: text.length - start))
                guard found.location != NSNotFound else { break }
                out.append((path, found))
                start = found.location + max(found.length, 1)
            }
        }
        return out
    }

    func findNext(_ step: Int) {
        guard var current = find else { return }
        let matches = findMatches
        guard !matches.isEmpty else { return }
        current.current = (current.current + step + matches.count) % matches.count
        find = current
        let match = matches[current.current]
        requestFocus(match.path, match.range)
    }

    func replace(all: Bool) {
        guard let current = find else { return }
        let matches = findMatches
        guard !matches.isEmpty else { return }
        let chosen = all ? matches : [matches[min(current.current, matches.count - 1)]]
        var next = doc
        // from the end so earlier ranges stay put
        for match in chosen.reversed() {
            guard let block = EditorEdits.node(next, match.path) else { continue }
            let text = NSMutableAttributedString(attributedString: InlineText.attributed(block.content ?? []))
            let marks = text.attributes(at: match.range.location, effectiveRange: nil)
            text.replaceCharacters(in: match.range, with: NSAttributedString(string: current.replacement, attributes: marks.filter { $0.key == .editorMarks }))
            next = EditorEdits.replacing(next, match.path, with: EditorEdits.withInline(block, InlineText.content(text, plain: block.type == "codeBlock")))
        }
        apply(next)
    }

    /// a search result opens with its first match selected, as PageEditor's find
    func select(_ term: String) {
        let needle = term.lowercased()
        for path in EditorEdits.textBlocks(doc) {
            let text = InlineText.string(block(path)?.content ?? []).lowercased() as NSString
            let found = text.range(of: needle)
            if found.location != NSNotFound {
                requestFocus(path, found)
                return
            }
        }
    }

    /// the headings in reading order, for the outline's scroll to heading
    var headingPaths: [Path] {
        EditorEdits.textBlocks(doc).filter { block($0)?.type == "heading" }
    }
}
