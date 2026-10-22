import Foundation

/// The edits Morrow's editor makes to its structure blocks, as pure functions over the document: tables
/// (prosemirror-tables through TipTap's table commands), columns, callouts and toggles, inline atoms put in at the
/// caret, a block moved, copied or removed from the block menu, and blocks pasted from Markdown.
nonisolated extension EditorEdits {
    static func paragraph() -> DocNode { .node("paragraph") }

    // MARK: putting a block at the caret

    /// ProseMirror's replaceSelectionWith for a block node: it takes the place of an empty text block, goes after
    /// one with the caret at its end, before one with the caret at its start, and splits one in the middle. The
    /// caret goes into the first text block of the new node, or after it.
    static func insertBlock(_ doc: DocNode, _ path: Path, _ offset: Int, _ node: DocNode) -> (doc: DocNode, caret: Caret) {
        guard let block = self.node(doc, path) else { return (doc, Caret(path: path, offset: offset)) }
        let content = block.content ?? []
        let parentPath = Array(path.dropLast())
        let index = path.last ?? 0
        let replacement: [DocNode]
        let at: Int
        if content.isEmpty {
            (replacement, at) = ([node], index)
        } else if offset >= InlineText.length(content) {
            (replacement, at) = ([block, node], index + 1)
        } else if offset == 0 {
            (replacement, at) = ([node, block], index)
        } else {
            (replacement, at) = ([withInline(block, slice(content, 0, offset)), node, withInline(block, slice(content, offset))], index + 1)
        }
        var updated = replacing(doc, path, with: replacement)
        if let inner = edgeTextBlock(node, last: false) { return (updated, Caret(path: parentPath + [at] + inner, offset: 0)) }
        // a block with no text in it, such as a table of contents: the caret goes to the text block after it,
        // made when there is none
        let next = parentPath + [at + 1]
        if let after = self.node(updated, next), EditorSchema.textBlocks.contains(after.type) { return (updated, Caret(path: next, offset: 0)) }
        var siblings = children(updated, parentPath)
        siblings.insert(paragraph(), at: at + 1)
        updated = settingChildren(updated, parentPath, siblings)
        return (updated, Caret(path: next, offset: 0))
    }

    /// inline nodes and text in place of a range of a text block, the caret after them (TipTap's insertContentAt)
    static func insertInline(_ doc: DocNode, _ path: Path, _ range: NSRange, _ nodes: [DocNode]) -> (doc: DocNode, caret: Caret) {
        guard let block = node(doc, path) else { return (doc, Caret(path: path, offset: range.location)) }
        let text = NSMutableAttributedString(attributedString: InlineText.attributed(block.content ?? []))
        let safe = NSRange(location: min(range.location, text.length), length: min(range.length, max(0, text.length - range.location)))
        let inserted = InlineText.attributed(nodes)
        text.replaceCharacters(in: safe, with: inserted)
        let updated = replacing(doc, path, with: withInline(block, InlineText.content(text, plain: block.type == "codeBlock")))
        return (updated, Caret(path: path, offset: safe.location + inserted.length))
    }

    // MARK: wrapping

    /// a text block wrapped in a callout (TipTap's wrapIn)
    static func wrapInCallout(_ doc: DocNode, _ path: Path) -> (doc: DocNode, caret: Caret) {
        wrap(doc, path) { block in
            DocNode.node("callout", ("attrs", .object(EditorSchema.computeAttrs(EditorSchema.nodes["callout"]!.attrs, nil))),
                         ("content", [.object(block)]))
        } inner: { [0] }
    }

    /// a block wrapped in a toggle, the caret in its empty summary (setDetails)
    static func wrapInDetails(_ doc: DocNode, _ path: Path) -> (doc: DocNode, caret: Caret) {
        wrap(doc, path) { block in
            DocNode.node("details", ("attrs", ["open": false]),
                         ("content", [.object(.node("detailsSummary")), .object(.node("detailsContent", ("content", [.object(block)])))]))
        } inner: { [0] }
    }

    private static func wrap(_ doc: DocNode, _ path: Path, _ make: (DocNode) -> DocNode, inner: () -> Path) -> (doc: DocNode, caret: Caret) {
        guard let block = node(doc, path) else { return (doc, Caret(path: path, offset: 0)) }
        // the first block of a list item stays a paragraph
        if let parent = node(doc, Array(path.dropLast())), itemTypes.contains(parent.type), path.last == 0 {
            return (doc, Caret(path: path, offset: 0))
        }
        let wrapped = make(block)
        let caretInner = wrapped.type == "details" ? [0] : [0] + (edgeTextBlock(block, last: false) ?? [])
        _ = inner
        return (replacing(doc, path, with: wrapped), Caret(path: path + caretInner, offset: 0))
    }

    /// Morrow's setColumns: two to four columns, each with an empty paragraph, typing in the first
    static func columns(_ count: Int) -> DocNode {
        let column = DocNode.node("column", ("content", [.object(paragraph())]))
        return .node("columns", ("content", .array(Array(repeating: JSValue.object(column), count: min(4, max(2, count))))))
    }

    // MARK: tables

    /// TipTap's insertTable with a header row: the first row of header cells, the rest plain cells
    static func table(rows: Int, columns: Int, headerRow: Bool = true) -> DocNode {
        let rowNodes = (0..<rows).map { row in
            JSValue.object(.node("tableRow", ("content", .array((0..<columns).map { _ in
                .object(cell(header: headerRow && row == 0))
            }))))
        }
        return .node("table", ("content", .array(rowNodes)))
    }

    /// a cell as `createAndFill` makes it: default attributes and an empty paragraph
    static func cell(header: Bool) -> DocNode {
        let type = header ? "tableHeader" : "tableCell"
        return .node(type, ("attrs", .object(EditorSchema.computeAttrs(EditorSchema.nodes[type]!.attrs, nil))), ("content", [.object(paragraph())]))
    }

    /// where a text block sits in a table: the table's path and the cell's row and column
    struct CellPlace: Equatable, Sendable {
        var table: Path
        var row: Int
        var column: Int
    }

    static func cellPlace(_ doc: DocNode, _ path: Path) -> CellPlace? {
        var cursor = path
        while cursor.count >= 3 {
            let cellPath = Array(cursor.dropLast())
            if let cell = node(doc, cellPath), cell.type == "tableCell" || cell.type == "tableHeader",
               let column = cellPath.last, let row = cellPath.dropLast().last {
                return CellPlace(table: Array(cellPath.dropLast(2)), row: row, column: column)
            }
            cursor.removeLast()
        }
        return nil
    }

    private static func rows(_ table: DocNode) -> [DocNode] { table.content ?? [] }

    /// a column is a header column when every row has a header cell there (columnIsHeader)
    private static func columnIsHeader(_ table: DocNode, _ column: Int) -> Bool {
        let all = rows(table)
        return !all.isEmpty && all.allSatisfy { row in
            let cells = row.content ?? []
            return cells.indices.contains(column) && cells[column].type == "tableHeader"
        }
    }

    /// a row is a header row when all its cells are header cells (rowIsHeader)
    private static func rowIsHeader(_ row: DocNode) -> Bool {
        let cells = row.content ?? []
        return !cells.isEmpty && cells.allSatisfy { $0.type == "tableHeader" }
    }

    /// addRowAfter: a row of empty cells below the row, header cells where the column is a header column
    static func addRow(_ doc: DocNode, _ place: CellPlace) -> (doc: DocNode, caret: Caret) {
        guard let table = node(doc, place.table) else { return (doc, Caret(path: place.table, offset: 0)) }
        var all = rows(table)
        let width = all.map { ($0.content ?? []).count }.max() ?? 0
        let row = DocNode.node("tableRow", ("content", .array((0..<width).map { .object(cell(header: columnIsHeader(table, $0))) })))
        all.insert(row, at: place.row + 1)
        let updated = replacing(doc, place.table, with: table.with(content: all))
        return (updated, Caret(path: place.table + [place.row + 1, min(place.column, max(0, width - 1)), 0], offset: 0))
    }

    /// addColumnAfter: a cell after the column in every row, a header cell in a header row
    static func addColumn(_ doc: DocNode, _ place: CellPlace) -> (doc: DocNode, caret: Caret) {
        guard let table = node(doc, place.table) else { return (doc, Caret(path: place.table, offset: 0)) }
        let all = rows(table).map { row -> DocNode in
            var cells = row.content ?? []
            cells.insert(cell(header: rowIsHeader(row)), at: min(place.column + 1, cells.count))
            return row.with(content: cells)
        }
        let updated = replacing(doc, place.table, with: table.with(content: all))
        return (updated, Caret(path: place.table + [place.row, place.column + 1, 0], offset: 0))
    }

    /// deleteRow; the last row takes the table with it
    static func deleteRow(_ doc: DocNode, _ place: CellPlace) -> (doc: DocNode, caret: Caret) {
        guard let table = node(doc, place.table) else { return (doc, Caret(path: place.table, offset: 0)) }
        var all = rows(table)
        guard all.count > 1 else { return deleteTable(doc, place) }
        all.remove(at: place.row)
        let updated = replacing(doc, place.table, with: table.with(content: all))
        let row = min(place.row, all.count - 1)
        return (updated, Caret(path: place.table + [row, min(place.column, max(0, (all[row].content ?? []).count - 1)), 0], offset: 0))
    }

    /// deleteColumn; the last column takes the table with it
    static func deleteColumn(_ doc: DocNode, _ place: CellPlace) -> (doc: DocNode, caret: Caret) {
        guard let table = node(doc, place.table) else { return (doc, Caret(path: place.table, offset: 0)) }
        let width = rows(table).map { ($0.content ?? []).count }.max() ?? 0
        guard width > 1 else { return deleteTable(doc, place) }
        let all = rows(table).map { row -> DocNode in
            var cells = row.content ?? []
            if cells.indices.contains(place.column) { cells.remove(at: place.column) }
            return row.with(content: cells)
        }
        let updated = replacing(doc, place.table, with: table.with(content: all))
        return (updated, Caret(path: place.table + [place.row, min(place.column, width - 2), 0], offset: 0))
    }

    /// the table goes; a paragraph takes its place when the page would be left without one there
    static func deleteTable(_ doc: DocNode, _ place: CellPlace) -> (doc: DocNode, caret: Caret) {
        let parentPath = Array(place.table.dropLast())
        let index = place.table.last ?? 0
        var updated = replacing(doc, place.table, with: [])
        if children(updated, parentPath).isEmpty || index >= children(updated, parentPath).count {
            var siblings = children(updated, parentPath)
            siblings.insert(paragraph(), at: min(index, siblings.count))
            updated = settingChildren(updated, parentPath, siblings)
        }
        return (updated, Caret(path: parentPath + [min(index, children(updated, parentPath).count - 1)], offset: 0))
    }

    /// toggleHeaderRow: the first row's cells turn into header cells, or back
    static func toggleHeaderRow(_ doc: DocNode, _ place: CellPlace) -> DocNode {
        guard let table = node(doc, place.table), var first = rows(table).first else { return doc }
        let header = !rowIsHeader(first)
        first = first.with(content: (first.content ?? []).map { cell in
            var copy = cell
            copy["type"] = .string(header ? "tableHeader" : "tableCell")
            return copy
        })
        var all = rows(table)
        all[0] = first
        return replacing(doc, place.table, with: table.with(content: all))
    }

    /// Tab and Shift-Tab in a table: the next or previous cell's first text block; nil past either end
    static func neighbourCell(_ doc: DocNode, _ place: CellPlace, forward: Bool) -> Path? {
        guard let table = node(doc, place.table) else { return nil }
        var cells: [(Int, Int)] = []
        for (r, row) in rows(table).enumerated() { for c in (row.content ?? []).indices { cells.append((r, c)) } }
        guard let index = cells.firstIndex(where: { $0 == (place.row, place.column) }) else { return nil }
        let next = forward ? index + 1 : index - 1
        guard cells.indices.contains(next) else { return nil }
        let (row, column) = cells[next]
        guard let cell = node(doc, place.table + [row, column]), let inner = edgeTextBlock(cell, last: !forward) else { return nil }
        return place.table + [row, column] + inner
    }

    // MARK: the block menu

    /// the block the menu and the move keys act on: the nearest list item around the path, otherwise the
    /// top-level block (BlockHandle's movableBlock)
    static func movable(_ doc: DocNode, _ path: Path) -> Path? {
        guard !path.isEmpty else { return nil }
        for length in stride(from: path.count, through: 1, by: -1) {
            let candidate = Array(path.prefix(length))
            if let node = node(doc, candidate), itemTypes.contains(node.type) { return candidate }
        }
        return [path[0]]
    }

    /// moveBlock: the block swaps places with its neighbour; the path it has afterwards
    static func move(_ doc: DocNode, _ path: Path, by direction: Int) -> (doc: DocNode, path: Path)? {
        guard let index = path.last else { return nil }
        let parentPath = Array(path.dropLast())
        var siblings = children(doc, parentPath)
        let target = index + direction
        guard siblings.indices.contains(index), siblings.indices.contains(target) else { return nil }
        siblings.swapAt(index, target)
        return (settingChildren(doc, parentPath, siblings), parentPath + [target])
    }

    static func duplicate(_ doc: DocNode, _ path: Path) -> DocNode {
        guard let block = node(doc, path), let index = path.last else { return doc }
        let parentPath = Array(path.dropLast())
        var siblings = children(doc, parentPath)
        siblings.insert(block, at: index + 1)
        return settingChildren(doc, parentPath, siblings)
    }

    /// the block goes; a page left empty gets a paragraph, as ProseMirror fills `block+`
    static func delete(_ doc: DocNode, _ path: Path) -> DocNode {
        var updated = removePruning(doc, path)
        if (updated.content ?? []).isEmpty { updated = updated.with(content: [paragraph()]) }
        return updated
    }

    // MARK: pasting Markdown

    /// MarkdownPaste's looksLikeMarkdown
    static func looksLikeMarkdown(_ text: String) -> Bool {
        let hints: [(String, NSRegularExpression.Options)] = [
            ("^#{1,6}\\s+\\S", .anchorsMatchLines), ("^\\s*[-*+]\\s+\\S", .anchorsMatchLines), ("^\\s*\\d+[.)]\\s+\\S", .anchorsMatchLines),
            ("^\\s*>\\s?\\S", .anchorsMatchLines), ("^```", .anchorsMatchLines), ("^\\s*\\|.+\\|\\s*$", .anchorsMatchLines),
            ("\\*\\*[^*\\n]+\\*\\*", []), ("\\[[^\\]\\n]+\\]\\([^)\\s]+\\)", []),
        ]
        let range = NSRange(location: 0, length: (text as NSString).length)
        return hints.contains { pattern, options in
            (try? NSRegularExpression(pattern: pattern, options: options))?.firstMatch(in: text, range: range) != nil
        }
    }

    /// blocks pasted at the caret, as ProseMirror fits a slice that is open at both ends: the text before the
    /// caret joins the first pasted text block and the text after it the last, when those are paragraphs
    static func insertBlocks(_ doc: DocNode, _ path: Path, _ offset: Int, _ blocks: [DocNode]) -> (doc: DocNode, caret: Caret) {
        guard let block = node(doc, path), !blocks.isEmpty else { return (doc, Caret(path: path, offset: offset)) }
        let content = block.content ?? []
        let before = slice(content, 0, offset)
        let after = slice(content, offset)
        var pasted = blocks
        var caretIndex = pasted.count - 1
        var caretOffset = 0
        // the text before the caret goes in front of a first paragraph, or stays its own block
        if let first = pasted.first, first.type == "paragraph" {
            pasted[0] = withInline(first, EditorSchema.joinText(before + (first.content ?? [])))
        } else if !before.isEmpty {
            pasted.insert(withInline(block, before), at: 0)
            caretIndex += 1
        }
        if let last = pasted.last, last.type == "paragraph", pasted.count > 0 {
            caretOffset = InlineText.length(last.content ?? [])
            pasted[pasted.count - 1] = withInline(last, EditorSchema.joinText((last.content ?? []) + after))
        } else if !after.isEmpty || block.type != "paragraph" {
            pasted.append(withInline(block, after))
            caretIndex = pasted.count - 1
        } else {
            pasted.append(paragraph())
            caretIndex = pasted.count - 1
        }
        let parentPath = Array(path.dropLast())
        let index = path.last ?? 0
        let updated = replacing(doc, path, with: pasted)
        let target = pasted[caretIndex]
        let inner = edgeTextBlock(target, last: true) ?? []
        let landing = EditorSchema.textBlocks.contains(target.type) ? caretOffset : node(updated, parentPath + [index + caretIndex] + inner).map(length) ?? 0
        return (updated, Caret(path: parentPath + [index + caretIndex] + inner, offset: landing))
    }
}
