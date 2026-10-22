import Foundation

/// The edits Morrow's editor makes to a page's blocks, as pure functions over the document: what ProseMirror's
/// commands and TipTap's keymaps (StarterKit, ListKeymap, code block) and input rules do to the document when a
/// key is pressed in a text block. A block is found by its path, the child indices from the document down; text
/// positions are UTF-16 offsets into the block's text as `InlineText` lays it out.
nonisolated enum EditorEdits {
    typealias Path = [Int]

    /// where the caret goes after an edit
    struct Caret: Equatable, Sendable {
        var path: Path
        var offset: Int
    }

    static let listTypes: Set<String> = ["bulletList", "orderedList", "taskList"]
    static let itemTypes: Set<String> = ["listItem", "taskItem"]

    // MARK: finding nodes

    static func node(_ doc: DocNode, _ path: Path) -> DocNode? {
        var node = doc
        for index in path {
            guard let content = node.content, content.indices.contains(index) else { return nil }
            node = content[index]
        }
        return node
    }

    /// the node at a path replaced by any number of nodes
    static func replacing(_ doc: DocNode, _ path: Path, with nodes: [DocNode]) -> DocNode {
        guard let first = path.first else { return nodes.first ?? doc }
        var content = doc.content ?? []
        guard content.indices.contains(first) else { return doc }
        if path.count == 1 {
            content.replaceSubrange(first...first, with: nodes)
        } else {
            content[first] = replacing(content[first], Array(path.dropFirst()), with: nodes)
        }
        return doc.with(content: content)
    }

    static func replacing(_ doc: DocNode, _ path: Path, with node: DocNode) -> DocNode { replacing(doc, path, with: [node]) }

    static func children(_ doc: DocNode, _ path: Path) -> [DocNode] { node(doc, path)?.content ?? [] }

    static func settingChildren(_ doc: DocNode, _ path: Path, _ children: [DocNode]) -> DocNode {
        guard let parent = node(doc, path) else { return doc }
        let updated = parent.with(content: children)
        return path.isEmpty ? updated : replacing(doc, path, with: updated)
    }

    /// every text block's path, in reading order
    static func textBlocks(_ doc: DocNode) -> [Path] {
        var out: [Path] = []
        func visit(_ node: DocNode, _ path: Path) {
            if EditorSchema.textBlocks.contains(node.type) {
                out.append(path)
                return
            }
            for (index, child) in (node.content ?? []).enumerated() { visit(child, path + [index]) }
        }
        visit(doc, [])
        return out
    }

    /// the first or last text block inside a node, as a path below it
    static func edgeTextBlock(_ node: DocNode, last: Bool) -> Path? {
        if EditorSchema.textBlocks.contains(node.type) { return [] }
        let content = node.content ?? []
        let indices = last ? Array(content.indices.reversed()) : Array(content.indices)
        for index in indices {
            if let inner = edgeTextBlock(content[index], last: last) { return [index] + inner }
        }
        return nil
    }

    // MARK: inline content

    static func length(_ block: DocNode) -> Int { InlineText.length(block.content ?? []) }

    /// the content between two text offsets
    static func slice(_ content: [DocNode], _ from: Int, _ to: Int? = nil) -> [DocNode] {
        let text = InlineText.attributed(content)
        let end = min(to ?? text.length, text.length)
        guard from < end else { return [] }
        return InlineText.content(text.attributedSubstring(from: NSRange(location: from, length: end - from)))
    }

    static func withInline(_ block: DocNode, _ content: [DocNode]) -> DocNode {
        var copy = block
        copy.content = content.isEmpty ? nil : content
        return copy
    }

    /// content moved into a code block: text only, a hard break a newline (TipTap's linebreak replacement)
    static func plain(_ content: [DocNode]) -> [DocNode] {
        let text = content.map { node in
            switch node.type {
            case "text": node.text ?? ""
            case "hardBreak": "\n"
            default: ""
            }
        }.joined()
        return text.isEmpty ? [] : [JSObject([("type", "text"), ("text", .string(text))])]
    }

    /// content moved out of a code block: newlines become hard breaks
    static func unplain(_ content: [DocNode]) -> [DocNode] {
        var out: [DocNode] = []
        for node in content {
            guard node.type == "text", let text = node.text, text.contains("\n") else {
                out.append(node)
                continue
            }
            for (index, part) in text.components(separatedBy: "\n").enumerated() {
                if index > 0 { out.append(.node("hardBreak")) }
                if !part.isEmpty { out.append(node.with("text", .string(part))) }
            }
        }
        return out
    }

    static func joined(_ first: DocNode, _ second: [DocNode]) -> DocNode {
        let addition = first.type == "codeBlock" ? plain(second) : second
        return withInline(first, EditorSchema.joinText((first.content ?? []) + addition))
    }

    // MARK: Enter

    /// Enter with the caret at `offset` in the text block at `path`
    static func enter(_ doc: DocNode, _ path: Path, _ offset: Int) -> (doc: DocNode, caret: Caret) {
        guard let block = node(doc, path) else { return (doc, Caret(path: path, offset: offset)) }
        let content = block.content ?? []
        let parentPath = Array(path.dropLast())
        let parent = node(doc, parentPath)
        let index = path.last ?? 0

        if block.type == "codeBlock" {
            let text = InlineText.string(content)
            // three Enters at the end leave the code block (exitOnTripleEnter)
            if offset == text.utf16.count, text.hasSuffix("\n\n") {
                let kept = slice(content, 0, text.utf16.count - 2)
                let next = replacing(doc, path, with: [withInline(block, kept), .node("paragraph")])
                return (next, Caret(path: parentPath + [index + 1], offset: 0))
            }
            let inserted = slice(content, 0, offset) + [JSObject([("type", "text"), ("text", "\n")])] + slice(content, offset)
            return (replacing(doc, path, with: withInline(block, EditorSchema.joinText(inserted))), Caret(path: path, offset: offset + 1))
        }

        if let parent, itemTypes.contains(parent.type) {
            return splitListItem(doc, path, offset)
        }

        // an empty block in a quote leaves it (liftEmptyBlock)
        if content.isEmpty, let parent, parent.type != "doc", !parentPath.isEmpty {
            return liftEmpty(doc, path)
        }

        let atEnd = offset >= InlineText.length(content)
        let first = withInline(block, slice(content, 0, offset))
        let second = atEnd ? DocNode.node("paragraph") : withInline(block, slice(content, offset))
        return (replacing(doc, path, with: [first, second]), Caret(path: parentPath + [index + 1], offset: 0))
    }

    /// TipTap's splitListItem, falling back to lifting an empty item out of its list
    static func splitListItem(_ doc: DocNode, _ path: Path, _ offset: Int) -> (doc: DocNode, caret: Caret) {
        let itemPath = Array(path.dropLast())
        guard let block = node(doc, path), let item = node(doc, itemPath) else { return (doc, Caret(path: path, offset: offset)) }
        let childIndex = path.last ?? 0
        let children = item.content ?? []
        let content = block.content ?? []
        if content.isEmpty, childIndex == children.count - 1 {
            if childIndex == 0 {
                return outdent(doc, itemPath) ?? (doc, Caret(path: path, offset: 0))
            }
            // an empty last block of an item becomes the next item
            let kept = item.with(content: Array(children.dropLast()))
            let next = newItem(like: item, [.node("paragraph")])
            let updated = replacing(doc, itemPath, with: [kept, next])
            return (updated, Caret(path: Array(itemPath.dropLast()) + [(itemPath.last ?? 0) + 1, 0], offset: 0))
        }
        let atEnd = offset >= InlineText.length(content)
        let firstBlock = withInline(block, slice(content, 0, offset))
        let secondBlock = atEnd && childIndex == 0 ? DocNode.node("paragraph") : withInline(block, slice(content, offset))
        let first = item.with(content: Array(children[..<childIndex]) + [firstBlock])
        let second = newItem(like: item, [secondBlock] + Array(children[(childIndex + 1)...]))
        let updated = replacing(doc, itemPath, with: [first, second])
        return (updated, Caret(path: Array(itemPath.dropLast()) + [(itemPath.last ?? 0) + 1, 0], offset: 0))
    }

    /// a new item after one: a task starts unticked, as `checked` does not keep on split
    static func newItem(like item: DocNode, _ content: [DocNode]) -> DocNode {
        item.type == "taskItem"
            ? .node("taskItem", ("attrs", ["checked": false]), ("content", .array(content.map(JSValue.object))))
            : .node("listItem", ("content", .array(content.map(JSValue.object))))
    }

    /// ProseMirror's liftEmptyBlock: an empty block that is not its parent's last child splits the parent before
    /// it; the last one moves out after the parent
    static func liftEmpty(_ doc: DocNode, _ path: Path) -> (doc: DocNode, caret: Caret) {
        let parentPath = Array(path.dropLast())
        guard let parent = node(doc, parentPath), let block = node(doc, path) else { return (doc, Caret(path: path, offset: 0)) }
        let index = path.last ?? 0
        let children = parent.content ?? []
        let parentIndex = parentPath.last ?? 0
        let outer = Array(parentPath.dropLast())
        if index < children.count - 1 {
            let before = Array(children[..<index])
            let after = Array(children[index...])
            var replacement: [DocNode] = []
            if !before.isEmpty { replacement.append(parent.with(content: before)) }
            replacement.append(parent.with(content: after))
            let updated = replacing(doc, parentPath, with: replacement)
            return (updated, Caret(path: outer + [parentIndex + (before.isEmpty ? 0 : 1), 0], offset: 0))
        }
        let rest = Array(children.dropLast())
        let replacement = (rest.isEmpty ? [] : [parent.with(content: rest)]) + [block]
        let updated = replacing(doc, parentPath, with: replacement)
        return (updated, Caret(path: outer + [parentIndex + (rest.isEmpty ? 0 : 1)], offset: 0))
    }

    // MARK: Backspace and Delete

    /// Backspace with the caret at the start of the text block at `path`; nil when nothing happens
    static func backspaceAtStart(_ doc: DocNode, _ path: Path) -> (doc: DocNode, caret: Caret)? {
        guard let block = node(doc, path) else { return nil }
        let parentPath = Array(path.dropLast())
        guard let parent = node(doc, parentPath) else { return nil }
        let index = path.last ?? 0
        let content = block.content ?? []

        // an empty heading or code block at the very start becomes a paragraph (TipTap's clearNodes)
        if content.isEmpty, block.type != "paragraph", textBlocks(doc).first == path {
            return (replacing(doc, path, with: .node("paragraph")), Caret(path: path, offset: 0))
        }
        // the first block of a list item lifts the item (ListKeymap)
        if itemTypes.contains(parent.type), index == 0 {
            return outdent(doc, parentPath)
        }
        if index > 0 {
            let siblings = parent.content ?? []
            let before = siblings[index - 1]
            let beforePath = parentPath + [index - 1]
            // a block right after a list joins the list's last item (ListKeymap)
            if listTypes.contains(before.type), !itemTypes.contains(parent.type),
               let inner = edgeTextBlock(before, last: true) {
                return join(doc, into: beforePath + inner, from: path)
            }
            if EditorSchema.textBlocks.contains(before.type) {
                return join(doc, into: beforePath, from: path)
            }
            if EditorSchema.nodes[before.type]?.content == nil || EditorSchema.nodes[before.type]?.atom == true {
                // a divider or other leaf before: an empty block goes, otherwise the leaf does
                if content.isEmpty {
                    let removed = replacing(doc, path, with: [])
                    if let previous = textBlocks(removed).last(where: { lexicographicallyBefore($0, path) }) {
                        let end = node(removed, previous).map(length) ?? 0
                        return (removed, Caret(path: previous, offset: end))
                    }
                    return (removed, Caret(path: beforePath, offset: 0))
                }
                return (replacing(doc, beforePath, with: []), Caret(path: beforePath, offset: 0))
            }
            // a container before (a quote): the block moves in as its last child
            let moved = before.with(content: (before.content ?? []) + [block])
            let updated = replacing(replacing(doc, path, with: []), beforePath, with: moved)
            return (updated, Caret(path: beforePath + [(before.content ?? []).count], offset: 0))
        }
        // the first block of a quote leaves it
        if !parentPath.isEmpty, parent.type == "blockquote" {
            return lift(doc, path)
        }
        return nil
    }

    /// the first block of a wrapper moves out before it
    static func lift(_ doc: DocNode, _ path: Path) -> (doc: DocNode, caret: Caret)? {
        let parentPath = Array(path.dropLast())
        guard let parent = node(doc, parentPath), let block = node(doc, path), !parentPath.isEmpty else { return nil }
        let rest = Array((parent.content ?? []).dropFirst())
        let replacement = [block] + (rest.isEmpty ? [] : [parent.with(content: rest)])
        return (replacing(doc, parentPath, with: replacement), Caret(path: parentPath, offset: 0))
    }

    /// the content of one text block appended to another, the emptied block and any container it leaves empty
    /// removed
    static func join(_ doc: DocNode, into target: Path, from source: Path) -> (doc: DocNode, caret: Caret) {
        guard let into = node(doc, target), let from = node(doc, source) else { return (doc, Caret(path: target, offset: 0)) }
        let caret = length(into)
        let joinedBlock = joined(into, from.content ?? [])
        var updated = removePruning(doc, source)
        // the target's path is unchanged: it comes before the source
        updated = replacing(updated, target, with: joinedBlock)
        return (updated, Caret(path: target, offset: caret))
    }

    /// removes a node and then any container left without children
    static func removePruning(_ doc: DocNode, _ path: Path) -> DocNode {
        var updated = replacing(doc, path, with: [])
        var parentPath = Array(path.dropLast())
        while !parentPath.isEmpty, let parent = node(updated, parentPath), (parent.content ?? []).isEmpty {
            updated = replacing(updated, parentPath, with: [])
            parentPath.removeLast()
        }
        return updated
    }

    /// Delete with the caret at the end of the text block at `path`: the next text block joins it
    static func deleteAtEnd(_ doc: DocNode, _ path: Path) -> (doc: DocNode, caret: Caret)? {
        let blocks = textBlocks(doc)
        guard let position = blocks.firstIndex(of: path) else { return nil }
        let parentPath = Array(path.dropLast())
        let index = path.last ?? 0
        // a divider right after goes first
        if let parent = node(doc, parentPath), index + 1 < (parent.content ?? []).count {
            let next = (parent.content ?? [])[index + 1]
            if !EditorSchema.textBlocks.contains(next.type), EditorSchema.nodes[next.type]?.content == nil || EditorSchema.nodes[next.type]?.atom == true {
                return (replacing(doc, parentPath + [index + 1], with: []), Caret(path: path, offset: node(doc, path).map(length) ?? 0))
            }
        }
        guard position + 1 < blocks.count else { return nil }
        return join(doc, into: path, from: blocks[position + 1])
    }

    static func lexicographicallyBefore(_ a: Path, _ b: Path) -> Bool {
        for (x, y) in zip(a, b) where x != y { return x < y }
        return a.count < b.count
    }

    // MARK: block types

    /// a text block turned into a paragraph, heading or code block; turning a heading into the same heading
    /// makes it a paragraph again, as TipTap's toggleHeading does
    static func setBlockType(_ doc: DocNode, _ path: Path, _ type: String, level: Int? = nil, language: String? = nil, toggle: Bool = false) -> DocNode {
        guard let block = node(doc, path) else { return doc }
        var target = type
        if toggle, type == "heading", block.type == "heading", block.attr("level")?.number.map(Int.init) == level { target = "paragraph" }
        if toggle, type == "codeBlock", block.type == "codeBlock" { target = "paragraph" }
        var content = block.content ?? []
        if target == "codeBlock", block.type != "codeBlock" { content = plain(content) }
        if target != "codeBlock", block.type == "codeBlock" { content = unplain(content) }
        var replacement: DocNode
        switch target {
        case "heading": replacement = .node("heading", ("attrs", ["level": .number(Double(level ?? 1))]))
        case "codeBlock": replacement = .node("codeBlock", ("attrs", ["language": language.map(JSValue.string) ?? .null]))
        default: replacement = .node(target)
        }
        replacement = withInline(replacement, content)
        // a list item must start with a paragraph
        if let parent = node(doc, Array(path.dropLast())), itemTypes.contains(parent.type), path.last == 0, target != "paragraph" {
            return doc
        }
        return replacing(doc, path, with: replacement)
    }

    /// TipTap's toggleList: out of a list of the same type, into one otherwise; an item of another kind of list
    /// moves into a list of this kind
    static func toggleList(_ doc: DocNode, _ path: Path, _ listType: String) -> (doc: DocNode, caret: Caret) {
        let itemPath = Array(path.dropLast())
        if let item = node(doc, itemPath), itemTypes.contains(item.type), path.last == 0,
           let list = node(doc, Array(itemPath.dropLast())) {
            if list.type == listType { return outdent(doc, itemPath) ?? (doc, Caret(path: path, offset: 0)) }
            // bullet and numbered lists hold the same items, so the whole list changes
            if list.type != "taskList", listType != "taskList" {
                let changed = listType == "orderedList"
                    ? DocNode.node("orderedList", ("attrs", ["start": 1, "type": .null]), ("content", .array((list.content ?? []).map(JSValue.object))))
                    : DocNode.node(listType, ("content", .array((list.content ?? []).map(JSValue.object))))
                return (replacing(doc, Array(itemPath.dropLast()), with: changed), Caret(path: path, offset: 0))
            }
            // to or from a checklist the item leaves its list and is wrapped anew
            let listPath = Array(itemPath.dropLast())
            let items = list.content ?? []
            let index = itemPath.last ?? 0
            let converted = convertItem(item, to: listType)
            var replacement: [DocNode] = []
            if index > 0 { replacement.append(list.with(content: Array(items[..<index]))) }
            replacement.append(listNode(listType, [converted]))
            if index + 1 < items.count { replacement.append(list.with(content: Array(items[(index + 1)...]))) }
            let updated = replacing(doc, listPath, with: replacement)
            return (updated, Caret(path: Array(listPath.dropLast()) + [(listPath.last ?? 0) + (index > 0 ? 1 : 0), 0, 0], offset: 0))
        }
        return wrapInList(doc, path, listType)
    }

    static func listNode(_ type: String, _ items: [DocNode], start: Int = 1) -> DocNode {
        type == "orderedList"
            ? .node("orderedList", ("attrs", ["start": .number(Double(start)), "type": .null]), ("content", .array(items.map(JSValue.object))))
            : .node(type, ("content", .array(items.map(JSValue.object))))
    }

    static func convertItem(_ item: DocNode, to listType: String) -> DocNode {
        let content = item.content ?? []
        return listType == "taskList"
            ? .node("taskItem", ("attrs", ["checked": item.attr("checked") ?? false]), ("content", .array(content.map(JSValue.object))))
            : .node("listItem", ("content", .array(content.map(JSValue.object))))
    }

    /// a text block wrapped in a new list, joined with a list of the same kind right before or after it
    static func wrapInList(_ doc: DocNode, _ path: Path, _ listType: String, start: Int = 1, checked: Bool = false) -> (doc: DocNode, caret: Caret) {
        guard var block = node(doc, path) else { return (doc, Caret(path: path, offset: 0)) }
        if block.type != "paragraph" {
            block = withInline(.node("paragraph"), block.type == "codeBlock" ? unplain(block.content ?? []) : block.content ?? [])
        }
        let item: DocNode = listType == "taskList"
            ? .node("taskItem", ("attrs", ["checked": .bool(checked)]), ("content", [.object(block)]))
            : .node("listItem", ("content", [.object(block)]))
        let parentPath = Array(path.dropLast())
        var siblings = children(doc, parentPath)
        var index = path.last ?? 0
        var items = [item]
        var itemIndex = 0
        var list = listNode(listType, [], start: start)
        if index > 0, siblings[index - 1].type == listType {
            list = siblings[index - 1]
            itemIndex = (list.content ?? []).count
            items = (list.content ?? []) + items
            siblings.remove(at: index - 1)
            index -= 1
        }
        if index + 1 < siblings.count, siblings[index + 1].type == listType {
            items += siblings[index + 1].content ?? []
            siblings.remove(at: index + 1)
        }
        siblings[index] = list.with(content: items)
        return (settingChildren(doc, parentPath, siblings), Caret(path: parentPath + [index, itemIndex, 0], offset: 0))
    }

    /// a text block wrapped in a quote (TipTap's setBlockquote)
    static func wrapInQuote(_ doc: DocNode, _ path: Path) -> (doc: DocNode, caret: Caret) {
        guard let block = node(doc, path) else { return (doc, Caret(path: path, offset: 0)) }
        // the first block of a list item cannot be a quote
        if let parent = node(doc, Array(path.dropLast())), itemTypes.contains(parent.type), path.last == 0 {
            return (doc, Caret(path: path, offset: 0))
        }
        return (replacing(doc, path, with: .node("blockquote", ("content", [.object(block)]))), Caret(path: path + [0], offset: 0))
    }

    /// a divider at the caret, with a paragraph after it to type into
    static func insertRule(_ doc: DocNode, _ path: Path, _ offset: Int) -> (doc: DocNode, caret: Caret) {
        guard let block = node(doc, path) else { return (doc, Caret(path: path, offset: offset)) }
        let content = block.content ?? []
        let parentPath = Array(path.dropLast())
        let index = path.last ?? 0
        if offset == 0 {
            let after = content.isEmpty && block.type != "paragraph" ? DocNode.node("paragraph") : block
            return (replacing(doc, path, with: [.node("horizontalRule"), after]), Caret(path: parentPath + [index + 1], offset: 0))
        }
        let rest = slice(content, offset)
        let second = rest.isEmpty ? DocNode.node("paragraph") : withInline(block, rest)
        let replacement = [withInline(block, slice(content, 0, offset)), .node("horizontalRule"), second]
        return (replacing(doc, path, with: replacement), Caret(path: parentPath + [index + 2], offset: 0))
    }

    // MARK: lists

    /// Tab in a list item: it moves into the item before it (sinkListItem); nil for the first item
    static func indent(_ doc: DocNode, _ itemPath: Path) -> (doc: DocNode, caret: Caret)? {
        guard let item = node(doc, itemPath), itemTypes.contains(item.type), let index = itemPath.last, index > 0 else { return nil }
        let listPath = Array(itemPath.dropLast())
        guard let list = node(doc, listPath) else { return nil }
        var items = list.content ?? []
        var previous = items[index - 1]
        var previousChildren = previous.content ?? []
        let nestedType = list.type
        let nestedIndex: Int
        if let last = previousChildren.last, last.type == nestedType {
            nestedIndex = (last.content ?? []).count
            previousChildren[previousChildren.count - 1] = last.with(content: (last.content ?? []) + [item])
        } else {
            nestedIndex = 0
            previousChildren.append(listNode(nestedType, [item]))
        }
        previous = previous.with(content: previousChildren)
        items[index - 1] = previous
        items.remove(at: index)
        let updated = replacing(doc, listPath, with: list.with(content: items))
        return (updated, Caret(path: listPath + [index - 1, previousChildren.count - 1, nestedIndex, 0], offset: 0))
    }

    /// Shift-Tab in a list item, or Backspace at its start: a nested item moves out to the list around it and takes
    /// the items after it as its children; a top-level item's blocks leave the list (liftListItem)
    static func outdent(_ doc: DocNode, _ itemPath: Path) -> (doc: DocNode, caret: Caret)? {
        guard let item = node(doc, itemPath), itemTypes.contains(item.type), let index = itemPath.last else { return nil }
        let listPath = Array(itemPath.dropLast())
        guard let list = node(doc, listPath) else { return nil }
        let items = list.content ?? []
        let before = Array(items[..<index])
        let after = Array(items[(index + 1)...])
        let outerItemPath = Array(listPath.dropLast())
        if let outerItem = node(doc, outerItemPath), itemTypes.contains(outerItem.type) {
            // nested: the item follows its parent item, the items after it become its children
            var lifted = item
            if !after.isEmpty {
                var children = lifted.content ?? []
                if let last = children.last, last.type == list.type {
                    children[children.count - 1] = last.with(content: (last.content ?? []) + after)
                } else {
                    children.append(list.with(content: after))
                }
                lifted = lifted.with(content: children)
            }
            var outerChildren = outerItem.content ?? []
            let listIndex = listPath.last ?? 0
            if before.isEmpty { outerChildren.remove(at: listIndex) } else { outerChildren[listIndex] = list.with(content: before) }
            let updatedOuter = outerItem.with(content: outerChildren)
            let converted = outerItem.type == item.type ? lifted : convertItem(lifted, to: outerItem.type == "taskItem" ? "taskList" : "bulletList")
            let updated = replacing(doc, outerItemPath, with: [updatedOuter, converted])
            let outerList = Array(outerItemPath.dropLast())
            return (updated, Caret(path: outerList + [(outerItemPath.last ?? 0) + 1, 0], offset: 0))
        }
        // top level: the list splits around the item's blocks
        var replacement: [DocNode] = []
        if !before.isEmpty { replacement.append(list.with(content: before)) }
        replacement += item.content ?? []
        // the list after keeps the list's attributes, a numbered one its start, as ProseMirror's split copies them
        if !after.isEmpty { replacement.append(list.with(content: after)) }
        let updated = replacing(doc, listPath, with: replacement)
        let parentPath = Array(listPath.dropLast())
        return (updated, Caret(path: parentPath + [(listPath.last ?? 0) + (before.isEmpty ? 0 : 1)], offset: 0))
    }

    static func setChecked(_ doc: DocNode, _ itemPath: Path, _ checked: Bool) -> DocNode {
        guard var item = node(doc, itemPath), item.type == "taskItem" else { return doc }
        var attrs = item.attrs ?? JSObject()
        attrs["checked"] = .bool(checked)
        item.attrs = attrs
        return replacing(doc, itemPath, with: item)
    }

    // MARK: input rules

    /// TipTap's block input rules, run when a character is typed at the end of `textBefore` in the block at
    /// `path`. The text before is the block's text from its start to the caret, the typed character included.
    static func blockInputRule(_ doc: DocNode, _ path: Path, textBefore: String, caretAfter offset: Int) -> (doc: DocNode, caret: Caret)? {
        guard let block = node(doc, path), block.type != "codeBlock" else { return nil }
        let parentPath = Array(path.dropLast())
        let parent = node(doc, parentPath)
        let firstOfItem = parent.map { itemTypes.contains($0.type) } == true && path.last == 0
        let content = block.content ?? []
        let rest = slice(content, offset)
        let cleared = withInline(block, rest)

        func matches(_ pattern: String) -> [String]? {
            guard let regex = try? NSRegularExpression(pattern: pattern),
                  let match = regex.firstMatch(in: textBefore, range: NSRange(textBefore.startIndex..., in: textBefore)) else { return nil }
            return (0..<match.numberOfRanges).map { index in
                Range(match.range(at: index), in: textBefore).map { String(textBefore[$0]) } ?? ""
            }
        }

        // headings: #, ## or ### and a space (textblockTypeInputRule)
        if let match = matches("^(#{1,3})\\s$"), !firstOfItem {
            let level = match[1].count
            let heading = withInline(.node("heading", ("attrs", ["level": .number(Double(level))])), rest)
            return (replacing(doc, path, with: heading), Caret(path: path, offset: 0))
        }
        if let match = matches("^```([a-z]+)?[\\s\\n]$") ?? matches("^~~~([a-z]+)?[\\s\\n]$"), !firstOfItem {
            let language = match[1].isEmpty ? JSValue.null : .string(match[1])
            let code = withInline(.node("codeBlock", ("attrs", ["language": language])), plain(rest))
            return (replacing(doc, path, with: code), Caret(path: path, offset: 0))
        }
        if matches("^(?:---|—-|___\\s|\\*\\*\\*\\s)$") != nil {
            let paragraph = withInline(.node("paragraph"), rest)
            return (replacing(doc, path, with: [.node("horizontalRule"), paragraph]), Caret(path: parentPath + [(path.last ?? 0) + 1], offset: 0))
        }
        // wrapping rules cannot wrap the first block of a list item
        guard !firstOfItem, block.type == "paragraph" else { return nil }
        let base = replacing(doc, path, with: cleared)
        if matches("^\\s*([-+*])\\s$") != nil { return wrapInList(base, path, "bulletList") }
        if let match = matches("^(\\d+)\\.\\s$") {
            let start = Int(match[1]) ?? 1
            // a numbered list right before joins only when the numbering carries on
            let siblings = children(base, parentPath)
            let index = path.last ?? 0
            if index > 0, siblings[index - 1].type == "orderedList",
               (siblings[index - 1].content ?? []).count + Int(siblings[index - 1].attr("start")?.number ?? 1) == start {
                return wrapInList(base, path, "orderedList", start: start)
            }
            return wrapInListAlone(base, path, start: start)
        }
        if let match = matches("^\\s*(\\[([( |x])?\\])\\s$") {
            return wrapInList(base, path, "taskList", checked: match.last == "x")
        }
        if matches("^\\s*>\\s$") != nil { return wrapInQuote(base, path) }
        return nil
    }

    /// a numbered list that does not join the one before it
    static func wrapInListAlone(_ doc: DocNode, _ path: Path, start: Int) -> (doc: DocNode, caret: Caret) {
        guard let block = node(doc, path) else { return (doc, Caret(path: path, offset: 0)) }
        let list = listNode("orderedList", [.node("listItem", ("content", [.object(block)]))], start: start)
        let parentPath = Array(path.dropLast())
        var siblings = children(doc, parentPath)
        let index = path.last ?? 0
        siblings[index] = list
        if index + 1 < siblings.count, siblings[index + 1].type == "orderedList" {
            siblings[index] = list.with(content: (list.content ?? []) + (siblings[index + 1].content ?? []))
            siblings.remove(at: index + 1)
        }
        return (settingChildren(doc, parentPath, siblings), Caret(path: parentPath + [index, 0, 0], offset: 0))
    }

    /// TipTap's mark input rules: the text typed between markers takes the mark and the markers go. Returns the
    /// marked range's new end, where the caret goes.
    struct MarkRule: Sendable {
        let pattern: String
        let mark: String
    }

    static let markRules: [MarkRule] = [
        MarkRule(pattern: "(?:^|\\s)(\\*\\*(?!\\s+\\*\\*)((?:[^*]+))\\*\\*(?!\\s+\\*\\*))$", mark: "bold"),
        MarkRule(pattern: "(?:^|\\s)(__(?!\\s+__)((?:[^_]+))__(?!\\s+__))$", mark: "bold"),
        MarkRule(pattern: "(?:^|\\s)(\\*(?!\\s+\\*)((?:[^*]+))\\*(?!\\s+\\*))$", mark: "italic"),
        MarkRule(pattern: "(?:^|\\s)(_(?!\\s+_)((?:[^_]+))_(?!\\s+_))$", mark: "italic"),
        MarkRule(pattern: "(?:^|\\s)(~~(?!\\s+~~)((?:[^~]+))~~(?!\\s+~~))$", mark: "strike"),
        MarkRule(pattern: "(?:^|[^`])(`([^`]+)`)(?!`)$", mark: "code"),
        MarkRule(pattern: "(?:^|\\s)(==(?!\\s+==)((?:[^=]+))==(?!\\s+==))$", mark: "highlight"),
    ]

    /// the mark rule that the text before the caret completes: the range of the markers and text (group 1) and of
    /// the text alone (group 2), as UTF-16 ranges in `textBefore`
    static func markInputRule(textBefore: String) -> (mark: String, whole: NSRange, inner: NSRange)? {
        let range = NSRange(location: 0, length: (textBefore as NSString).length)
        for rule in markRules {
            guard let regex = try? NSRegularExpression(pattern: rule.pattern),
                  let match = regex.firstMatch(in: textBefore, range: range) else { continue }
            return (rule.mark, match.range(at: 1), match.range(at: 2))
        }
        return nil
    }
}
