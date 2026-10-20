import SwiftUI

/// Morrow's structure blocks as the app draws them: a table of cells that each hold blocks, a callout with its
/// kind, title and fold, a toggle that opens and closes, columns side by side, and a table of contents.

/// tables: a grid of cells; header cells in bold on a tinted background (prosemirror-tables, Morrow's `.prose table`)
struct TableBlockView: View {
    let store: EditorStore
    let node: DocNode
    let path: EditorEdits.Path
    let context: EditorStyle.Context
    let depth: Int

    var body: some View {
        let rows = node.content ?? []
        let width = rows.map { ($0.content ?? []).count }.max() ?? 0
        // columns share the page's width, as Morrow's table with `table-layout: fixed`
        Grid(horizontalSpacing: 0, verticalSpacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.offset) { r, row in
                    GridRow {
                        ForEach(0..<width, id: \.self) { c in
                            let cells = row.content ?? []
                            if cells.indices.contains(c) {
                                cell(cells[c], path: path + [r, c])
                            } else {
                                Color.clear.gridCellUnsizedAxes([.horizontal, .vertical])
                            }
                        }
                    }
                }
        }
        .overlay(Rectangle().strokeBorder(.separator))
    }

    private func cell(_ cell: DocNode, path: EditorEdits.Path) -> some View {
        let header = cell.type == "tableHeader"
        var cellContext = context
        cellContext.header = header
        return BlockList(store: store, nodes: cell.content ?? [], path: path, context: cellContext, depth: depth + 1)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .background(header ? AnyShapeStyle(.quaternary.opacity(0.6)) : AnyShapeStyle(.clear))
            .overlay(Rectangle().strokeBorder(.separator, lineWidth: 0.5))
    }
}

/// Morrow's TableMenu while the caret is in a table
struct TableBar: View {
    let store: EditorStore

    var body: some View {
        HStack(spacing: 14) {
            button("+ Row") { store.table(.addRow) }
            button("+ Column") { store.table(.addColumn) }
            Divider().frame(height: 18)
            button("Delete row") { store.table(.deleteRow) }
            button("Delete column") { store.table(.deleteColumn) }
            Divider().frame(height: 18)
            button("Header row") { store.table(.toggleHeaderRow) }
            Button("Delete table", role: .destructive) { store.table(.deleteTable) }
                .buttonStyle(.borderless)
        }
        .font(.callout)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(.regularMaterial, in: .rect(cornerRadius: 10))
        .shadow(color: .black.opacity(0.12), radius: 8, y: 3)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Table")
    }

    private func button(_ title: String, action: @escaping () -> Void) -> some View {
        Button(title, action: action).buttonStyle(.borderless)
    }
}

/// Morrow's callout: a tinted box with its kind's emoji and name (pressing it moves to the next tone), a title
/// field, a Hide or Show button when it can fold, and its blocks
struct CalloutBlockView: View {
    let store: EditorStore
    let node: DocNode
    let path: EditorEdits.Path
    let depth: Int
    @State private var title = ""
    @FocusState private var editingTitle: Bool

    static let tones = ["note", "tip", "warning", "danger"]
    static let toneLabels = ["note": "Note", "tip": "Tip", "warning": "Warning", "danger": "Danger"]
    /// the emoji each Obsidian callout type is shown with (Extras.ts KIND_EMOJI)
    static let kindEmoji: [String: String] = [
        "note": "📝", "info": "ℹ️", "abstract": "📄", "summary": "📄", "tldr": "📄", "todo": "☑️", "tip": "💡", "hint": "💡", "important": "❗", "success": "✅", "check": "✅", "done": "✅", "question": "❓", "help": "❓", "faq": "❓", "warning": "⚠️", "caution": "⚠️", "attention": "⚠️", "failure": "❌", "fail": "❌", "missing": "❌", "danger": "🔥", "error": "🛑", "bug": "🐞", "example": "🧪", "quote": "💬", "cite": "💬",
    ]

    private var tone: String {
        let value = node.attr("tone")?.string ?? "note"
        return Self.tones.contains(value) ? value : "note"
    }

    var body: some View {
        let kind = node.attr("kind")?.string ?? tone
        let folded = node.attr("fold")?.string == "-"
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Button {
                    // the next tone; a custom Obsidian type keeps its name while it already looks right
                    let next = Self.tones[(Self.tones.firstIndex(of: tone).map { $0 + 1 } ?? 0) % Self.tones.count]
                    let custom = node.attr("kind")?.string ?? ""
                    store.setAttrs(path, [("tone", .string(next)), ("kind", .string(!custom.isEmpty && Model.calloutTone(custom) == next ? custom : next))])
                } label: {
                    HStack(spacing: 4) {
                        EmojiImage(emoji: Self.kindEmoji[kind.lowercased()] ?? "📝", size: 16)
                        Text(kind.prefix(1).uppercased() + kind.dropFirst()).fontWeight(.semibold)
                    }
                }
                .buttonStyle(.plain)
                .help("\(Self.toneLabels[tone] ?? "Note"), click to change")
                TextField("Add a title", text: $title)
                    .textFieldStyle(.plain)
                    .focused($editingTitle)
                    .onSubmit { saveTitle() }
                    .onChange(of: editingTitle) { _, editing in if !editing { saveTitle() } }
                    .accessibilityLabel("Callout title")
                if node.attr("fold")?.string != nil {
                    Button(folded ? "Show" : "Hide") { store.setAttrs(path, [("fold", .string(folded ? "+" : "-"))]) }
                        .buttonStyle(.borderless)
                        .font(.caption)
                }
            }
            if !folded {
                BlockList(store: store, nodes: node.content ?? [], path: path, context: .init(), depth: depth + 1)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 12)
        .background(Self.color(tone).opacity(Self.backgroundOpacity(tone)), in: .rect(cornerRadius: 8))
        .overlay(alignment: .leading) { Rectangle().fill(Self.color(tone)).frame(width: 3) }
        .clipShape(.rect(cornerRadius: 8))
        .onAppear { title = node.attr("title")?.string ?? "" }
        .onChange(of: node.attr("title")?.string) { _, value in if !editingTitle { title = value ?? "" } }
    }

    private func saveTitle() {
        let trimmed = title.trimmingCharacters(in: .whitespaces)
        let value: JSValue = trimmed.isEmpty ? .null : .string(trimmed)
        if node.attr("title") != value { store.setAttrs(path, [("title", value)]) }
    }

    /// `--callout-line` for each tone (editor.css, features.css); the background is the same colour faded
    static func color(_ tone: String) -> Color {
        switch tone {
        case "tip": Color(hex: 0x4d8a5c)
        case "warning": Color(hex: 0xb7791f)
        case "danger": Color(hex: 0xb3261e)
        default: Color(hex: 0x4f7aa8)
        }
    }

    /// `--callout-bg`'s opacity
    static func backgroundOpacity(_ tone: String) -> Double {
        switch tone {
        case "tip": 0.1
        case "warning": 0.11
        case "danger": 0.08
        default: 0.09
        }
    }
}

/// TipTap's details: a summary line with a disclosure arrow, and the content when open; `open` is saved
struct DetailsBlockView: View {
    let store: EditorStore
    let node: DocNode
    let path: EditorEdits.Path
    let context: EditorStyle.Context
    let depth: Int

    var body: some View {
        let open = node.attr("open") == .bool(true)
        let children = node.content ?? []
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .top, spacing: 4) {
                Button {
                    store.setAttrs(path, [("open", .bool(!open))])
                } label: {
                    Image(systemName: "chevron.right")
                        .rotationEffect(.degrees(open ? 90 : 0))
                        .frame(width: 22, height: 26)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(open ? "Close toggle" : "Open toggle")
                if let summary = children.first {
                    BlockList(store: store, nodes: [summary], path: path, context: context, depth: depth + 1)
                }
            }
            if open, children.count > 1, let content = children.last {
                BlockList(store: store, nodes: content.content ?? [], path: path + [children.count - 1], context: context, depth: depth + 1)
                    .padding(.leading, 26)
            }
        }
    }
}

/// Morrow's columns: two to four side by side, each a run of blocks
struct ColumnsBlockView: View {
    let store: EditorStore
    let node: DocNode
    let path: EditorEdits.Path
    let context: EditorStyle.Context
    let depth: Int

    var body: some View {
        HStack(alignment: .top, spacing: 24) {
            ForEach(Array((node.content ?? []).enumerated()), id: \.offset) { index, column in
                BlockList(store: store, nodes: column.content ?? [], path: path + [index], context: context, depth: depth + 1)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
            }
        }
    }
}

/// Morrow's table of contents: every heading of the page, indented by level; pressing one goes to it
struct ContentsBlockView: View {
    let store: EditorStore

    var body: some View {
        let headings = store.headingPaths.compactMap { path -> (EditorEdits.Path, Int, String)? in
            guard let block = store.block(path) else { return nil }
            return (path, Int(block.attr("level")?.number ?? 1), InlineText.string(block.content ?? []))
        }
        VStack(alignment: .leading, spacing: 4) {
            if headings.isEmpty {
                Text("Add headings to see them here.").foregroundStyle(.tertiary)
            }
            ForEach(Array(headings.enumerated()), id: \.offset) { _, heading in
                Button(heading.2.isEmpty ? "Untitled" : heading.2) { store.requestFocus(heading.0, NSRange(location: 0, length: 0)) }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .padding(.leading, CGFloat(heading.1 - 1) * 16)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.35), in: .rect(cornerRadius: 8))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Table of contents")
    }
}

/// Morrow's block handle: beside the block the caret is in, a grip that opens the block menu (BlockHandle.ts,
/// EditorMenus.tsx BlockMenu): turn into, move up and down, duplicate, delete, and a callout's tone
struct BlockHandle: View {
    let store: EditorStore
    let path: EditorEdits.Path

    var body: some View {
        let target = store.menuBlock ?? path
        let node = store.block(target)
        let textual = node.map { EditorSchema.textBlocks.contains($0.type) || EditorEdits.edgeTextBlock($0, last: false) == [0] } ?? false
        Menu {
            if node?.type == "callout" {
                Section("Callout") {
                    ForEach([("note", "Note"), ("tip", "Tip"), ("warning", "Warning")], id: \.0) { tone, label in
                        Button {
                            store.setAttrs(target, [("tone", .string(tone))])
                        } label: {
                            if node?.attr("tone")?.string == tone { Label(label, systemImage: "checkmark") } else { Text(label) }
                        }
                    }
                }
            }
            if textual {
                Section("Turn into") {
                    Button("Text", systemImage: "paragraphsign") { store.turnInto(target, "paragraph") }
                    Button("Heading 1", systemImage: "textformat.size.larger") { store.turnInto(target, "h1") }
                    Button("Heading 2", systemImage: "textformat.size") { store.turnInto(target, "h2") }
                    Button("Heading 3", systemImage: "textformat.size.smaller") { store.turnInto(target, "h3") }
                    Button("Bulleted list", systemImage: "list.bullet") { store.turnInto(target, "bulletList") }
                    Button("Numbered list", systemImage: "list.number") { store.turnInto(target, "orderedList") }
                    Button("Checklist", systemImage: "checklist") { store.turnInto(target, "taskList") }
                    Button("Quote", systemImage: "text.quote") { store.turnInto(target, "quote") }
                    Button("Code block", systemImage: "chevron.left.forwardslash.chevron.right") { store.turnInto(target, "code") }
                }
            }
            Button("Move up", systemImage: "arrow.up") { store.moveBlock(target, by: -1) }
                .keyboardShortcut(.upArrow, modifiers: [.option, .shift])
            Button("Move down", systemImage: "arrow.down") { store.moveBlock(target, by: 1) }
                .keyboardShortcut(.downArrow, modifiers: [.option, .shift])
            Button("Duplicate", systemImage: "plus.square.on.square") { store.duplicateBlock(target) }
            Button("Delete", systemImage: "trash", role: .destructive) { store.deleteBlock(target) }
        } label: {
            Image(systemName: "line.3.horizontal")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.tertiary)
                .frame(width: 24, height: 28)
                .contentShape(.rect)
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .fixedSize()
        .offset(x: -32)
        .accessibilityLabel("Block options")
    }
}
