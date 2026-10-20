import SwiftUI

/// Morrow's PageView with its PageEditor, drawn by the app: cover, header, then the page's blocks as
/// `EditorStore` holds them. Lists, quotes and code blocks are containers around text blocks; the formatting
/// bar, the link field, the slash menu and the find bar float over the page as Morrow's menus do.
struct EditorScreenView: View {
    let controller: EditorController
    let page: PageInfo
    @State private var store: EditorStore?

    var body: some View {
        Group {
            if let store {
                EditorPage(controller: controller, page: page, store: store)
            } else {
                Color.clear
            }
        }
        .background(.background)
        .task(id: page.id) {
            let opened = EditorStore(controller: controller, pageId: page.id)
            await opened.load()
            store = opened
        }
    }
}

private struct EditorPage: View {
    let controller: EditorController
    let page: PageInfo
    let store: EditorStore

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 0) {
                    CoverBanner(controller: controller, page: page, editable: true)
                    PageColumn(controller: controller) {
                        VStack(alignment: .leading, spacing: 0) {
                            PageHeaderView(controller: controller, page: page, editable: true, onEnter: enterFromTitle)
                            if store.failed {
                                PageBanner(text: "This page could not be opened in the editor.", error: true)
                            } else {
                                BlockList(store: store, nodes: store.doc.content ?? [], path: [], context: .init(), depth: 0)
                                    .padding(.top, 4)
                                // the space below the last block puts the caret at its end, as clicking below the text does
                                Color.clear
                                    .frame(height: 160)
                                    .contentShape(.rect)
                                    .onTapGesture { focusEnd() }
                            }
                        }
                    }
                    .padding(.top, page.cover == nil ? 32 : 0)
                }
            }
            .onChange(of: store.focusRequest) { _, request in
                guard let request else { return }
                withAnimation(.easeOut(duration: 0.15)) { proxy.scrollTo(BlockList.key(request.path)) }
            }
        }
        .overlay(alignment: .topLeading) { EditorMenus(store: store, font: controller.preferences.font) }
        .overlay(alignment: .top) {
            if store.find != nil { FindBar(store: store).padding(.top, 8) }
            else if store.cellPlace != nil { TableBar(store: store).padding(.top, 8) }
        }
        .sheet(item: Bindable(store).sourceEdit) { edit in SourceEditSheet(store: store, edit: edit) }
        .fileImporter(isPresented: Bindable(store).pickingFiles,
                      allowedContentTypes: store.filePick?.images == true ? [.image] : [.item], allowsMultipleSelection: true) { result in
            if case .success(let urls) = result { store.picked(urls) } else { store.filePick = nil }
        }
        // files dropped on the page go in at the caret, or after the last block (Media.ts FileDrop)
        .dropDestination(for: URL.self) { urls, _ in
            let files = urls.filter(\.isFileURL)
            guard !files.isEmpty else { return false }
            store.addFiles(files, at: nil)
            return true
        }
        .task(id: controller.revision) { await store.refreshTargets() }
        .task(id: controller.revision) { await store.load() }
        .task(id: controller.editorRequest) { handle(controller.editorRequest) }
        .onAppear { controller.nativeEditorShows(page.id) }
        .onDisappear {
            controller.nativeEditorLeft(page.id)
            Task { await store.flush() }
        }
    }

    private func enterFromTitle() {
        if let first = EditorEdits.textBlocks(store.doc).first { store.requestFocus(first, NSRange(location: 0, length: 0)) }
    }

    private func focusEnd() {
        guard let last = EditorEdits.textBlocks(store.doc).last else { return }
        store.moveCaret(to: last, atEnd: true)
    }

    /// find, the outline's headings and a search result's term, sent by the app to the page on screen
    private func handle(_ request: EditorController.EditorRequest?) {
        guard let request, request.pageId == page.id else { return }
        switch request.kind {
        case .find:
            store.find = store.find ?? EditorStore.Find()
        case .heading(let index):
            let headings = store.headingPaths
            if headings.indices.contains(index) { store.requestFocus(headings[index], NSRange(location: 0, length: 0)) }
        case .select(let term):
            store.select(term)
        case .link:
            // with nothing selected Cmd K searches, as in Morrow
            if store.focus.map({ $0.range.length > 0 }) == true || store.activeMark("link") != nil { store.editingLink = true }
            else { controller.showingPalette = true }
        }
    }
}

/// a run of blocks: a page, a list item's or a quote's
struct BlockList: View {
    let store: EditorStore
    let nodes: [DocNode]
    let path: EditorEdits.Path
    let context: EditorStyle.Context
    let depth: Int

    static func key(_ path: EditorEdits.Path) -> String { path.map(String.init).joined(separator: ".") }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // blocks are kept by position: a block's path is where it is in the document, and the text view at a
            // path takes whatever block is there now
            ForEach(Array(nodes.enumerated()), id: \.offset) { index, node in
                BlockView(store: store, node: node, path: path + [index], context: context, depth: depth)
                    .overlay(alignment: .topLeading) {
                        if depth == 0, store.menuBlock?.first == index { BlockHandle(store: store, path: path + [index]) }
                    }
                    .padding(.top, index == 0 ? 0 : spacing(before: node))
            }
        }
    }

    /// `.prose > * + *` 0.55em, a heading 1.5em, a list item's next block 0.2em
    private func spacing(before node: DocNode) -> CGFloat {
        let body = EditorStyle.bodySize(store.controller.preferences.font)
        if node.type == "heading" {
            let level = Int(node.attr("level")?.number ?? 1)
            return EditorStyle.size(.heading(level), store.controller.preferences.font) * 1.5 * (depth == 0 ? 1 : 0.5)
        }
        if node.type == "horizontalRule" { return body * 1.6 }
        return body * (depth == 0 ? 0.55 : 0.2)
    }
}

struct BlockView: View {
    let store: EditorStore
    let node: DocNode
    let path: EditorEdits.Path
    let context: EditorStyle.Context
    let depth: Int

    private var font: AppPreferences.Font { store.controller.preferences.font }

    var body: some View {
        switch node.type {
        case "paragraph", "heading":
            // one branch for both, so a paragraph that becomes a heading keeps its text view and the caret
            let heading = node.type == "heading"
            TextBlock(store: store, node: node, path: path,
                      style: heading ? .heading(Int(node.attr("level")?.number ?? 1)) : .paragraph, context: context)
                .accessibilityAddTraits(heading ? .isHeader : [])
        case "codeBlock":
            CodeBlockView(store: store, node: node, path: path)
        case "bulletList", "orderedList", "taskList":
            ListBlock(store: store, node: node, path: path, context: context, depth: depth)
        case "blockquote":
            HStack(alignment: .top, spacing: 0) {
                Rectangle()
                    .fill(.tint.opacity(0.35))
                    .frame(width: 3)
                BlockList(store: store, nodes: node.content ?? [], path: path, context: .init(quoted: true, checked: context.checked), depth: depth + 1)
                    .padding(.leading, EditorStyle.bodySize(font))
            }
            .fixedSize(horizontal: false, vertical: true)
        case "horizontalRule":
            Divider()
                .padding(.vertical, EditorStyle.bodySize(font) * 1.6)
                .accessibilityLabel("Divider")
        case "detailsSummary":
            TextBlock(store: store, node: node, path: path, style: .summary, context: context)
        case "table":
            TableBlockView(store: store, node: node, path: path, context: context, depth: depth)
        case "callout":
            CalloutBlockView(store: store, node: node, path: path, depth: depth)
        case "details":
            DetailsBlockView(store: store, node: node, path: path, context: context, depth: depth)
        case "columns":
            ColumnsBlockView(store: store, node: node, path: path, context: context, depth: depth)
        case "tableOfContents":
            ContentsBlockView(store: store)
        case "image":
            ImageBlockView(store: store, node: node)
                .padding(.vertical, EditorStyle.bodySize(font) * 0.9)
        case "fileAttachment":
            FileBlockView(store: store, node: node)
        case "rawBlock":
            RawBlockView(store: store, node: node, path: path)
        case "blockMath":
            MathBlockView(store: store, node: node, path: path)
        default:
            // the screen is only chosen for pages whose blocks this editor draws
            EmptyView()
        }
    }
}

/// a text block with Morrow's placeholder when it is empty: on the block with the caret, or on the first
/// when the page is empty
struct TextBlock: View {
    let store: EditorStore
    let node: DocNode
    let path: EditorEdits.Path
    let style: EditorStyle.Block
    let context: EditorStyle.Context
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let font = store.controller.preferences.font
        let ranges = matches
        EditorTextBlock(store: store, path: path, block: node, style: style, context: context, font: font, editable: true, matches: ranges,
                        dark: colorScheme == .dark, rendered: hasFormula ? WebRenderer.shared.version : 0)
            .overlay(alignment: .topLeading) {
                if let placeholder {
                    Text(placeholder)
                        .font(SwiftUI.Font(EditorStyle.font(style, font)))
                        .foregroundStyle(.tertiary)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
            }
            .id(BlockList.key(path))
    }

    private var hasFormula: Bool { (node.content ?? []).contains { $0.type == "inlineMath" } }

    private var matches: [NSRange] {
        guard store.find != nil else { return [] }
        return store.findMatches.filter { $0.path == path }.map(\.range)
    }

    private var placeholder: String? {
        guard (node.content ?? []).isEmpty else { return nil }
        let content = store.doc.content ?? []
        let pageEmpty = content.count == 1 && (content.first?.content ?? []).isEmpty
        guard store.focus?.path == path || (pageEmpty && store.focus == nil) else { return nil }
        if case .heading(let level) = style { return "Heading \(level)" }
        return pageEmpty ? "Start writing, or press / for blocks" : "Press / for blocks"
    }
}

/// bullets, numbers or checkboxes beside each item's blocks
private struct ListBlock: View {
    let store: EditorStore
    let node: DocNode
    let path: EditorEdits.Path
    let context: EditorStyle.Context
    let depth: Int

    private var font: AppPreferences.Font { store.controller.preferences.font }
    private var body_: CGFloat { EditorStyle.bodySize(font) }

    var body: some View {
        VStack(alignment: .leading, spacing: body_ * 0.2) {
            ForEach(Array((node.content ?? []).enumerated()), id: \.offset) { index, item in
                HStack(alignment: .top, spacing: node.type == "taskList" ? body_ * 0.6 : 0) {
                    marker(index, item)
                    BlockList(store: store, nodes: item.content ?? [], path: path + [index],
                              context: .init(quoted: context.quoted, checked: item.type == "taskItem" && item.attr("checked") == .bool(true)),
                              depth: depth + 1)
                }
            }
        }
    }

    /// the height of an item's first line of text, so a marker sits on it: the text view puts its line spacing
    /// below each line, so the first line is as tall as the font's own line
    private var lineHeight: CGFloat { EditorStyle.lineHeight(of: EditorStyle.font(.paragraph, font)) }

    @ViewBuilder private func marker(_ index: Int, _ item: DocNode) -> some View {
        switch node.type {
        case "taskList":
            let checked = item.attr("checked") == .bool(true)
            Button {
                store.setChecked(path + [index], !checked)
            } label: {
                Image(systemName: checked ? "checkmark.square.fill" : "square")
                    .font(.system(size: body_ * 0.95))
                    .foregroundStyle(checked ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
                    .frame(height: lineHeight)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(checked ? "Done" : "Not done")
            .accessibilityAddTraits(checked ? .isSelected : [])
        case "orderedList":
            let start = Int(node.attr("start")?.number ?? 1)
            Text("\(start + index).")
                .font(.system(size: body_).monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(minWidth: body_ * 1.45, alignment: .leading)
                .frame(height: lineHeight)
        default:
            Text(["•", "◦", "▪"][(depth / 2) % 3])
                .font(.system(size: body_ * 1.1, weight: .bold))
                .foregroundStyle(.secondary)
                .frame(width: body_ * 1.45, alignment: .leading)
                .frame(height: lineHeight)
        }
    }
}

/// Morrow's code block: the code in the monospaced font on its own background, the language above it
private struct CodeBlockView: View {
    let store: EditorStore
    let node: DocNode
    let path: EditorEdits.Path
    /// a diagram's code shows while it is empty, and folds away once there is a diagram (Extras.ts CodeBlock)
    @State private var showCode: Bool
    @State private var width: CGFloat = 0

    init(store: EditorStore, node: DocNode, path: EditorEdits.Path) {
        self.store = store
        self.node = node
        self.path = path
        _showCode = State(initialValue: InlineText.string(node.content ?? []).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    static var languages: [String] { CodeHighlight.languages }

    var body: some View {
        let language = node.attr("language")?.string
        let mermaid = language == "mermaid"
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Spacer()
                if mermaid {
                    Button(showCode ? "Hide code" : "Edit diagram") { showCode.toggle() }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                }
                if !mermaid || showCode {
                    Menu(language ?? "Plain text") {
                        Button("Plain text") { store.setLanguage(path, nil) }
                        ForEach(Self.languages + (language.map { Self.languages.contains($0) ? [] : [$0] } ?? []), id: \.self) { name in
                            Button(name) { store.setLanguage(path, name) }
                        }
                    }
                    .menuStyle(.borderlessButton)
                    .fixedSize()
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Code language")
                }
            }
            if !mermaid || showCode {
                TextBlock(store: store, node: node, path: path, style: .code, context: .init())
            }
            if mermaid {
                // the block's padding and the diagram's own, 16 on each side
                DiagramView(source: InlineText.string(node.content ?? []), width: max(0, width - 64))
                    .contentShape(.rect)
                    .onTapGesture(count: 2) { showCode = true }
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
        .background(Color(EditorStyle.codeBackground), in: .rect(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.separator))
        .onGeometryChange(for: CGFloat.self, of: \.size.width) { width = $0 }
    }
}
