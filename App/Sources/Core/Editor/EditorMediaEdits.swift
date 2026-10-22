import Foundation

/// The edits Morrow's editor makes for pictures, files and formulas (Media.ts, Extras.ts, tiptap's mathematics
/// nodes), as pure functions over the document.
nonisolated extension EditorEdits {
    // MARK: content at the caret

    /// TipTap's insertContentAt for blocks at a caret: they take the place of an empty text block (not a code
    /// block), go before a text block with the caret at its start, and otherwise split it as ProseMirror's
    /// replaceWith does (nothing is left after the caret at its end). The caret goes to the end of what went in
    /// (selectionToInsertionEnd): into its last text block, or the text block after it.
    static func insertContent(_ doc: DocNode, _ path: Path, _ offset: Int, _ nodes: [DocNode]) -> (doc: DocNode, caret: Caret) {
        guard let block = node(doc, path), !nodes.isEmpty else { return (doc, Caret(path: path, offset: offset)) }
        let content = block.content ?? []
        let parentPath = Array(path.dropLast())
        let index = path.last ?? 0
        let replacement: [DocNode]
        let first: Int
        if content.isEmpty, block.type != "codeBlock", EditorSchema.textBlocks.contains(block.type) {
            (replacement, first) = (nodes, index)
        } else if offset == 0, !content.isEmpty {
            (replacement, first) = (nodes + [block], index)
        } else {
            let after = slice(content, offset)
            (replacement, first) = ([withInline(block, slice(content, 0, offset))] + nodes + (after.isEmpty ? [] : [withInline(block, after)]), index + 1)
        }
        let updated = replacing(doc, path, with: replacement)
        let last = first + nodes.count - 1
        if let inner = edgeTextBlock(nodes[nodes.count - 1], last: true) {
            let target = parentPath + [last] + inner
            return (updated, Caret(path: target, offset: self.node(updated, target).map(length) ?? 0))
        }
        // an atom last: the caret goes on to the text block after it
        let next = parentPath + [last + 1]
        if let after = self.node(updated, next), let inner = edgeTextBlock(after, last: false) { return (updated, Caret(path: next + inner, offset: 0)) }
        // none: the paragraph the document gets after it (TrailingNode), at its top level
        return (updated, Caret(path: next, offset: 0))
    }

    /// Morrow's mediaNodes: a picture for an image file, its name without the extension as its text; any other
    /// file as an attachment with its name and size
    static func mediaNodes(_ files: [FileMeta]) -> [DocNode] {
        files.map { file in
            if file.type.hasPrefix("image/") {
                let alt = JSText.string(JSRegex(#"\.[^.]+$"#).replaceAll(file.name.units) { _ in [] })
                return .node("image", ("attrs", ["fileId": .string(file.id), "alt": .string(alt)]))
            }
            return .node("fileAttachment", ("attrs", ["fileId": .string(file.id), "name": .string(file.name), "size": .number(file.size)]))
        }
    }

    /// Morrow's insertFiles: the files' blocks at the caret and an empty paragraph after them, to type in
    static func insertMedia(_ doc: DocNode, _ path: Path, _ offset: Int, _ files: [FileMeta]) -> (doc: DocNode, caret: Caret) {
        insertContent(doc, path, offset, mediaNodes(files) + [paragraph()])
    }

    /// Morrow's mediaKind: files that play on the page
    enum MediaKind: Equatable { case audio, video, pdf }

    static func mediaKind(_ name: String) -> MediaKind? {
        let ext = JSRegex(#"\.([a-z0-9]+)$"#, ignoreCase: true).exec(Array(name.utf16))?.group(1).map { JSText.string(JSText.asciiLower($0)) } ?? ""
        if ["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "opus", "weba"].contains(ext) { return .audio }
        if ["mp4", "webm", "mov", "m4v", "ogv"].contains(ext) { return .video }
        if ext == "pdf" { return .pdf }
        return nil
    }

    /// Morrow's formatBytes
    static func formatBytes(_ bytes: Double) -> String {
        if bytes < 1024 { return "\(JSNumber.string(bytes)) B" }
        if bytes < 1024 * 1024 { return "\(JSNumber.toFixed(bytes / 1024, 0)) KB" }
        if bytes < 1024 * 1024 * 1024 { return "\(JSNumber.toFixed(bytes / 1024 / 1024, 1)) MB" }
        return "\(JSNumber.toFixed(bytes / 1024 / 1024 / 1024, 2)) GB"
    }

    // MARK: atoms in a text block

    /// the inline atom at a UTF-16 offset of a text block, replaced by another node or taken out
    static func settingInlineAtom(_ doc: DocNode, _ path: Path, _ offset: Int, _ node: DocNode?) -> DocNode {
        guard let block = self.node(doc, path) else { return doc }
        let text = NSMutableAttributedString(attributedString: InlineText.attributed(block.content ?? []))
        guard offset >= 0, offset < text.length, text.attribute(.editorAtom, at: offset, effectiveRange: nil) is EditorAtom else { return doc }
        let range = NSRange(location: offset, length: 1)
        if let node {
            text.replaceCharacters(in: range, with: InlineText.attributed([node]))
        } else {
            text.deleteCharacters(in: range)
        }
        return replacing(doc, path, with: withInline(block, InlineText.content(text)))
    }

    /// a block put in place by the same path, or removed
    static func settingBlock(_ doc: DocNode, _ path: Path, _ node: DocNode?) -> DocNode {
        guard self.node(doc, path) != nil else { return doc }
        if let node { return replacing(doc, path, with: node) }
        return replacing(doc, path, with: [DocNode]())
    }

    // MARK: formulas

    enum MathRule: Equatable {
        /// an inline formula in place of `range` of the text before the caret
        case inline(range: NSRange, latex: String)
        /// a formula block for the whole text block
        case block(latex: String)
    }

    /// the formula rules, in the order the editor's extensions add them after StarterKit's and the highlight's:
    /// InlineMath's `$$x$$` (findInlineMath), BlockMath's `$$$x$$$` for the whole block, and Morrow's
    /// InlineMathDollar `$x$`, where prices like $5 and $10 stay text. TipTap's run$1 only takes a match that ends
    /// at the caret and whose text is in the block, so none is taken across an atom.
    static func mathInputRule(textBefore: String) -> MathRule? {
        let units = Array(textBefore.utf16)
        func endsHere(_ range: Range<Int>) -> Bool { range.upperBound == units.count && !units[range].contains(0xFFFC) }
        // findInlineMath: the first `$$…$$` not after another `$`
        let double = JSRegex(#"\$\$([^$\n]+?)\$\$(?!\$)"#)
        var start = 0
        while let match = double.exec(units, from: start) {
            if match.range.lowerBound == 0 || units[match.range.lowerBound - 1] != 0x24 {
                if endsHere(match.range), let latex = match.group(1) {
                    return .inline(range: NSRange(location: match.range.lowerBound, length: match.range.count), latex: JSText.string(latex))
                }
                break
            }
            start = match.range.lowerBound + 1
        }
        if let match = JSRegex(#"^\$\$\$([^$]+)\$\$\$$"#).exec(units), endsHere(match.range), let latex = match.group(1) {
            return .block(latex: JSText.string(latex))
        }
        if let match = JSRegex(#"(?<![\\$\w])\$([^\s$](?:[^$\n]*[^\s$])?)\$$"#).exec(units), endsHere(match.range), let latex = match.group(1) {
            return .inline(range: NSRange(location: match.range.lowerBound, length: match.range.count), latex: JSText.string(latex))
        }
        return nil
    }

    /// BlockMath's input rule: the formula takes the text block's place when the rule covers all of it,
    /// otherwise it goes where the rule's text was, splitting the block
    static func applyBlockMath(_ doc: DocNode, _ path: Path, textLength: Int, caret: Int, latex: String) -> (doc: DocNode, caret: Caret) {
        let math = DocNode.node("blockMath", ("attrs", ["latex": .string(latex)]))
        guard let block = node(doc, path) else { return (doc, Caret(path: path, offset: caret)) }
        let content = block.content ?? []
        if caret >= textLength {
            return insertContent(replacing(doc, path, with: withInline(block, [])), path, 0, [math])
        }
        // inside the block: an empty block of its kind before the formula and the rest after it (replaceWith)
        let updated = replacing(doc, path, with: [withInline(block, []), math, withInline(block, slice(content, caret))])
        let next = Array(path.dropLast()) + [(path.last ?? 0) + 2]
        return (updated, Caret(path: next, offset: 0))
    }
}
