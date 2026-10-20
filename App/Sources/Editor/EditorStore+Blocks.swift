import Foundation

/// The native editor's structure blocks and links (11d-5b): what the "[[" and "@" menus put in, the blocks the
/// slash menu adds, tables, callouts and toggles, the block menu, the pages and dates links open, and pasted
/// Markdown.
extension EditorStore {
    // MARK: menus

    /// a page, a new page or a date from the "[[" or "@" menu, in place of the trigger and what was typed after it
    func choose(_ action: SlashItem.Action, _ open: Slash, _ block: DocNode) {
        let text = InlineText.attributed(block.content ?? [])
        var start = open.start
        let end = min(open.start + open.trigger + open.query.utf16.count, text.length)
        // typing ![[ embeds the page instead of linking it
        var embed = false
        if open.kind == .link, start > 0, (text.string as NSString).substring(with: NSRange(location: start - 1, length: 1)) == "!" {
            embed = true
            start -= 1
        }
        let node: DocNode
        switch action {
        case .page(let id, let title):
            node = open.kind == .mention ? Self.pageLink(id, title, embed: false) : Self.pageLink(id, title, embed: embed)
        case .newPage(let title):
            let id = Self.newId()
            controller.perform(.newPage(id: id, parentId: pageId, title: title, kind: "page", database: nil, doc: nil))
            node = Self.pageLink(id, title, embed: embed)
        case .date(let key):
            node = .node("dateMention", ("attrs", ["date": .string(key)]))
        case .block:
            return
        }
        let space = JSObject([("type", "text"), ("text", " ")])
        let (next, caret) = EditorEdits.insertInline(doc, open.path, NSRange(location: start, length: end - start), [node, space])
        apply(next, caret: caret)
    }

    /// the attributes TipTap gives a page link it puts in: id and label, and embed when it is one
    static func pageLink(_ id: String, _ label: String, embed: Bool) -> DocNode {
        var attrs = JSObject([("id", .string(id)), ("label", .string(label))])
        if embed { attrs["embed"] = true }
        return .node("pageLink", ("attrs", .object(attrs)))
    }

    static func newId() -> String { UUID().uuidString.lowercased() }

    /// the slash menu's Date, Link and Embed items type their menu's trigger, which opens that menu
    func typeTrigger(_ trigger: String) {
        guard let focus, let block = block(focus.path) else { return }
        let (next, caret) = EditorEdits.insertInline(doc, focus.path, focus.range, [JSObject([("type", "text"), ("text", .string(trigger))])])
        apply(next, caret: caret)
        let end = caret.offset
        if trigger == "@" {
            slash = Slash(path: focus.path, start: end - 1, query: "", kind: .mention)
        } else {
            slash = Slash(path: focus.path, start: end - 2, query: "", kind: .link, trigger: 2)
        }
        _ = block
        typedTrigger()
    }

    private func typedTrigger() {
        Task { [weak self] in
            guard let self else { return }
            pageResults = await controller.findPages("", excluding: pageId, limit: 8)
        }
    }

    // MARK: blocks

    /// a block at the caret, as the slash menu's table, columns and table of contents put one in
    func insertBlock(_ node: DocNode) {
        guard let focus else { return }
        let (next, caret) = EditorEdits.insertBlock(doc, focus.path, focus.range.location, node)
        apply(next, caret: caret)
    }

    func wrapCallout() {
        guard let focus else { return }
        let (next, caret) = EditorEdits.wrapInCallout(doc, focus.path)
        apply(next, caret: EditorEdits.Caret(path: caret.path, offset: focus.range.location))
    }

    func wrapDetails() {
        guard let focus else { return }
        let (next, caret) = EditorEdits.wrapInDetails(doc, focus.path)
        // the summary opens open so its content shows as it is typed
        var opened = next
        let detailsPath = Array(caret.path.dropLast())
        if var details = EditorEdits.node(opened, detailsPath), details.type == "details" {
            details.attrs = JSObject([("open", true)])
            opened = EditorEdits.replacing(opened, detailsPath, with: details)
        }
        apply(opened, caret: caret)
    }

    /// Database and Canvas in the slash menu: a subpage of that kind and a link to it (SlashCommand's linkChild)
    func linkChild(kind: String) {
        guard let focus else { return }
        let id = Self.newId()
        let database = kind == "database" ? Database.defaultDatabase(Self.newId) : nil
        let canvas = kind == "canvas" ? CanvasFile.canvasDoc(CanvasFile.emptyCanvas()) : nil
        controller.perform(.newPage(id: id, parentId: pageId, title: "", kind: kind, database: database, doc: canvas))
        let label = kind == "database" ? "Database" : "Canvas"
        let (next, caret) = EditorEdits.insertInline(doc, focus.path, focus.range,
                                                     [Self.pageLink(id, label, embed: false), JSObject([("type", "text"), ("text", " ")])])
        apply(next, caret: caret)
    }

    /// attributes of the block at a path, such as a callout's tone or a toggle's open
    func setAttrs(_ path: Path, _ values: [(String, JSValue)]) {
        guard var node = block(path) else { return }
        var attrs = node.attrs ?? JSObject()
        for (key, value) in values { attrs[key] = value }
        node.attrs = attrs
        apply(EditorEdits.replacing(doc, path, with: node))
    }

    // MARK: tables

    enum TableAction {
        case addRow, addColumn, deleteRow, deleteColumn, deleteTable, toggleHeaderRow
    }

    /// the table cell the caret is in
    var cellPlace: EditorEdits.CellPlace? { focus.flatMap { EditorEdits.cellPlace(doc, $0.path) } }

    func table(_ action: TableAction) {
        guard let place = cellPlace else { return }
        switch action {
        case .addRow: let (next, caret) = EditorEdits.addRow(doc, place); apply(next, caret: caret)
        case .addColumn: let (next, caret) = EditorEdits.addColumn(doc, place); apply(next, caret: caret)
        case .deleteRow: let (next, caret) = EditorEdits.deleteRow(doc, place); apply(next, caret: caret)
        case .deleteColumn: let (next, caret) = EditorEdits.deleteColumn(doc, place); apply(next, caret: caret)
        case .deleteTable: let (next, caret) = EditorEdits.deleteTable(doc, place); apply(next, caret: caret)
        case .toggleHeaderRow: apply(EditorEdits.toggleHeaderRow(doc, place))
        }
    }

    /// Tab in a table goes to the next cell, adding a row past the last one; Shift-Tab to the one before.
    /// False outside a table.
    func tabInTable(_ path: Path, back: Bool) -> Bool {
        guard let place = EditorEdits.cellPlace(doc, path) else { return false }
        if let next = EditorEdits.neighbourCell(doc, place, forward: !back) {
            requestFocus(next, NSRange(location: 0, length: block(next).map(EditorEdits.length) ?? 0))
        } else if !back {
            let (next, caret) = EditorEdits.addRow(doc, place)
            apply(next, caret: EditorEdits.Caret(path: Array(caret.path.dropLast(2)) + [0, 0], offset: 0))
        }
        return true
    }

    // MARK: the block menu

    /// the block the menu acts on: the nearest list item around the caret, otherwise its top-level block
    var menuBlock: Path? { focus.flatMap { EditorEdits.movable(doc, $0.path) } }

    func moveBlock(_ path: Path, by direction: Int) {
        guard let (next, moved) = EditorEdits.move(doc, path, by: direction) else { return }
        let inner = EditorEdits.node(next, moved).flatMap { EditorEdits.edgeTextBlock($0, last: false) } ?? []
        apply(next, caret: EditorEdits.Caret(path: moved + inner, offset: focus?.range.location ?? 0))
    }

    func duplicateBlock(_ path: Path) { apply(EditorEdits.duplicate(doc, path)) }

    func deleteBlock(_ path: Path) {
        let next = EditorEdits.delete(doc, path)
        let target = EditorEdits.textBlocks(next).last { EditorEdits.lexicographicallyBefore($0, path) } ?? EditorEdits.textBlocks(next).first
        apply(next, caret: target.map { EditorEdits.Caret(path: $0, offset: 0) })
    }

    /// Turn into: the block made a paragraph first (clearNodes), then what was chosen
    func turnInto(_ path: Path, _ choice: String) {
        guard let first = EditorEdits.node(doc, path).flatMap({ EditorEdits.edgeTextBlock($0, last: false) }).map({ path + $0 }) else { return }
        focusAt(first)
        switch choice {
        case "paragraph": setBlockType("paragraph")
        case "h1": setBlockType("heading", level: 1)
        case "h2": setBlockType("heading", level: 2)
        case "h3": setBlockType("heading", level: 3)
        case "bulletList", "orderedList", "taskList": toggleList(choice)
        case "quote": quote()
        case "code": setBlockType("codeBlock")
        default: break
        }
    }

    // MARK: links

    /// the workspace as the inline chips read it
    var atomLookup: EditorAtoms.Lookup {
        let workspace = controller.workspace
        return EditorAtoms.Lookup(
            page: { id in
                guard let page = workspace.infos[id], workspace.isShowable(id) else { return nil }
                return (page.displayTitle, page.icon)
            },
            resolve: { [weak self] target in self?.resolvedTargets[target] },
            today: Daily.dateKey(Date()))
    }

    /// the targets of links to pages that may not exist, looked up again when the workspace changes
    func refreshTargets() async {
        var targets: [String] = []
        func visit(_ node: DocNode) {
            if node.type == "pageLink", let target = node.attr("target")?.string, !target.isEmpty { targets.append(target) }
            for child in node.content ?? [] { visit(child) }
        }
        visit(doc)
        guard !targets.isEmpty else { return }
        let found = await controller.resolveTargets(targets)
        if found != resolvedTargets { resolvedTargets = found }
    }

    /// a page link pressed: its page, or a new one made from its target and opened (createFromTarget)
    func openLink(_ node: DocNode) {
        if let id = EditorAtoms.resolved(node, atomLookup) {
            controller.go(to: .page(id))
            return
        }
        guard let target = node.attr("target")?.string, !target.isEmpty else { return }
        let id = Self.newId()
        // obsidian makes a missing linked page at the top of the vault, so does morrow
        let title = target.split(separator: "/").last.map(String.init) ?? target
        controller.perform(.newPage(id: id, parentId: nil, title: title.isEmpty ? target : title, kind: "page", database: nil, doc: nil))
        controller.go(to: .page(id))
    }

    /// a date mention pressed: that day's note
    func openDate(_ key: String) {
        guard Daily.parseDateKey(key) != nil else { return }
        controller.openToday(key)
    }

    func openTag(_ tag: String) { controller.go(to: .tag(tag)) }

    // MARK: pasting

    /// plain text that looks like Markdown becomes blocks at the caret (MarkdownPaste); false when it does not
    func paste(_ text: String, at path: Path, _ range: NSRange) -> Bool {
        guard let block = block(path), block.type != "codeBlock", EditorEdits.looksLikeMarkdown(text) else { return false }
        Task { [weak self] in
            guard let self, let parsed = await controller.pasteDoc(text), let blocks = parsed.content, !blocks.isEmpty else { return }
            guard let current = self.block(path) else { return }
            // the selection goes first
            let cleared = NSMutableAttributedString(attributedString: InlineText.attributed(current.content ?? []))
            let safe = NSRange(location: min(range.location, cleared.length), length: min(range.length, max(0, cleared.length - range.location)))
            cleared.deleteCharacters(in: safe)
            let base = EditorEdits.replacing(doc, path, with: EditorEdits.withInline(current, InlineText.content(cleared)))
            let normalized = (try? EditorSchema.normalize(.node("doc", ("content", .array(blocks.map(JSValue.object))))))?.content ?? blocks
            let (next, caret) = EditorEdits.insertBlocks(base, path, safe.location, normalized)
            apply(next, caret: caret)
        }
        return true
    }
}
