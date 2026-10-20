import Foundation

/// Pictures, files, formulas and kept-as-written blocks in the native editor (Media.ts, Extras.ts), as
/// Morrow's editor adds and edits them.
extension EditorStore {
    /// Morrow's SourceDialog: a formula with its preview, or markdown kept as written
    struct SourceEdit: Identifiable, Equatable {
        enum Target: Equatable {
            case blockMath(Path)
            /// an inline formula: its text block and its offset in it
            case inlineMath(Path, Int)
            case raw(Path)
        }

        let id = UUID()
        var target: Target
        var value: String

        var title: String {
            switch target {
            case .blockMath: "Edit formula"
            case .inlineMath: "Edit inline formula"
            case .raw: "Edit as written"
            }
        }

        var latex: Bool { if case .raw = target { false } else { true } }
        var display: Bool { if case .blockMath = target { true } else { false } }
    }

    struct FilePick: Identifiable, Equatable {
        let id = UUID()
        /// the slash menu's Image takes pictures only (`pickFiles('image/*')`)
        var images: Bool
        var caret: EditorEdits.Caret
    }

    // MARK: files

    /// the slash menu's Image and File: the picker, the files then put in at the caret (Morrow's insertFiles)
    func pickFiles(images: Bool) {
        guard let focus else { return }
        filePick = FilePick(images: images, caret: EditorEdits.Caret(path: focus.path, offset: focus.range.location))
        pickingFiles = true
    }

    func picked(_ urls: [URL]) {
        guard let pick = filePick else { return }
        filePick = nil
        Task {
            let stored = await controller.storeFiles(urls)
            insertFiles(stored, at: pick.caret)
        }
    }

    /// files dropped or pasted: stored first, then put in where the caret was, or after the last block
    func addFiles(_ files: [(name: String, data: Data)], at caret: EditorEdits.Caret?) {
        let place = caret ?? focus.map { EditorEdits.Caret(path: $0.path, offset: $0.range.location) }
        Task {
            let stored = await controller.storeFiles(files)
            insertFiles(stored, at: place)
        }
    }

    func addFiles(_ urls: [URL], at caret: EditorEdits.Caret?) {
        let place = caret ?? focus.map { EditorEdits.Caret(path: $0.path, offset: $0.range.location) }
        Task {
            let stored = await controller.storeFiles(urls)
            insertFiles(stored, at: place)
        }
    }

    /// stored files' blocks at a caret that is still there, otherwise at the end of the page
    private func insertFiles(_ files: [FileMeta], at caret: EditorEdits.Caret?) {
        guard !files.isEmpty else { return }
        let content = doc.content ?? []
        var place = caret.flatMap { caret in block(caret.path).map { min(caret.offset, EditorEdits.length($0)) }.map { EditorEdits.Caret(path: caret.path, offset: $0) } }
        if place == nil, let last = content.indices.last {
            place = EditorEdits.Caret(path: [last], offset: block([last]).map(EditorEdits.length) ?? 0)
        }
        guard let place else { return }
        let (next, after) = EditorEdits.insertMedia(doc, place.path, place.offset, files)
        apply(next, caret: after)
    }

    /// a picture, sound or other file in the vault
    func fileData(_ id: String) async -> Data? {
        await controller.vaultFile(id)
    }

    // MARK: formulas and kept-as-written blocks

    /// the slash menu's Formula: an empty formula block, opened for typing straight away (editMathNear)
    func insertFormula() {
        guard let focus else { return }
        let math = DocNode.node("blockMath", ("attrs", ["latex": ""]))
        let (next, caret) = EditorEdits.insertContent(doc, focus.path, focus.range.location, [math])
        apply(next, caret: caret)
        let parent = Array(focus.path.dropLast())
        let index = focus.path.last ?? 0
        for candidate in [index, index + 1] {
            let path = parent + [candidate]
            if let node = block(path), node.type == "blockMath", node.attr("latex")?.string == "" {
                sourceEdit = SourceEdit(target: .blockMath(path), value: "")
                return
            }
        }
    }

    /// the slash menu's Inline formula: `x^2` at the caret
    func insertInlineFormula() {
        guard let focus else { return }
        let math = DocNode.node("inlineMath", ("attrs", ["latex": "x^2"]))
        let (next, caret) = EditorEdits.insertInline(doc, focus.path, NSRange(location: focus.range.location, length: 0), [math])
        apply(next, caret: caret)
    }

    /// the slash menu's table of contents and diagram: insertContent at the caret
    func insertContent(_ node: DocNode) {
        guard let focus else { return }
        let (next, caret) = EditorEdits.insertContent(doc, focus.path, focus.range.location, [node])
        apply(next, caret: caret)
    }

    func editFormula(_ path: Path) {
        guard editable else { return }
        guard let node = block(path), node.type == "blockMath" else { return }
        sourceEdit = SourceEdit(target: .blockMath(path), value: node.attr("latex")?.string ?? "")
    }

    func editInlineFormula(_ path: Path, at offset: Int, _ node: DocNode) {
        guard editable else { return }
        sourceEdit = SourceEdit(target: .inlineMath(path, offset), value: node.attr("latex")?.string ?? "")
    }

    func editRaw(_ path: Path) {
        guard editable else { return }
        guard let node = block(path), node.type == "rawBlock" else { return }
        sourceEdit = SourceEdit(target: .raw(path), value: node.attr("text")?.string ?? "")
    }

    /// the dialog saved: a formula left empty goes (editMath), a kept-as-written block takes the text as it is
    func saveSource(_ edit: SourceEdit, _ value: String) {
        sourceEdit = nil
        let empty = JSText.trim(value).isEmpty
        switch edit.target {
        case .blockMath(let path):
            guard var node = block(path), node.type == "blockMath" else { return }
            node.attrs = (node.attrs ?? JSObject()).with("latex", .string(value))
            apply(EditorEdits.settingBlock(doc, path, empty ? nil : node))
        case .inlineMath(let path, let offset):
            let atom = block(path).flatMap { InlineText.attributed($0.content ?? []).attributeIfAtom(at: offset) }
            guard var node = atom, node.type == "inlineMath" else { return }
            node.attrs = (node.attrs ?? JSObject()).with("latex", .string(value))
            apply(EditorEdits.settingInlineAtom(doc, path, offset, empty ? nil : node), caret: EditorEdits.Caret(path: path, offset: empty ? offset : offset + 1))
        case .raw(let path):
            guard var node = block(path), node.type == "rawBlock" else { return }
            node.attrs = (node.attrs ?? JSObject()).with("text", .string(value))
            apply(EditorEdits.settingBlock(doc, path, node))
        }
    }
}

extension NSAttributedString {
    /// the inline node at a UTF-16 offset, when an atom is there
    func attributeIfAtom(at offset: Int) -> DocNode? {
        guard offset >= 0, offset < length else { return nil }
        return (attribute(.editorAtom, at: offset, effectiveRange: nil) as? EditorAtom)?.node
    }
}
