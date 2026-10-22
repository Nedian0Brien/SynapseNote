import SwiftUI

/// Morrow's EditorMenus over the selection: the formatting bar when text is selected (with its link field and
/// colour panel), the link bar when the caret is in a link, and the slash menu under a typed "/".
struct EditorMenus: View {
    let store: EditorStore
    let font: AppPreferences.Font

    var body: some View {
        GeometryReader { proxy in
            let frame = proxy.frame(in: .global)
            if let rect = store.selectionRect, let focus = store.focus {
                let local = rect.offsetBy(dx: -frame.minX, dy: -frame.minY)
                if store.slash != nil {
                    // its top just under the caret, or its bottom just over it when the page has no room left under it
                    let below = local.maxY + 8 + 340 <= frame.height
                    ZStack(alignment: .topLeading) {
                        Color.clear
                        SlashMenu(store: store)
                            .alignmentGuide(.top) { below ? $0[.top] : $0[.bottom] }
                            .offset(x: min(max(8, local.minX), max(8, frame.width - 308)), y: below ? local.maxY + 6 : local.minY - 6)
                    }
                }
                Group {
                    if store.slash != nil {
                        EmptyView()
                    } else if focus.range.length > 0, store.focusedBlockType != "codeBlock" {
                        FormattingBar(store: store)
                            .fixedSize()
                            .position(x: clamp(local.midX, frame.width, 230), y: max(30, local.minY - 30))
                    } else if store.activeMark("link") != nil || store.editingLink {
                        LinkBar(store: store)
                            .fixedSize()
                            .position(x: clamp(local.minX + 140, frame.width, 160), y: local.maxY + 26)
                    }
                }
            }
        }
    }

    /// keeps a menu of half-width `half` inside the page
    private func clamp(_ x: CGFloat, _ width: CGFloat, _ half: CGFloat) -> CGFloat {
        min(max(x, half + 8), max(half + 8, width - half - 8))
    }
}

private struct ToolButton: View {
    let label: String
    let symbol: String
    var active = false
    var shortcut: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .medium))
                .frame(width: 30, height: 30)
                .background(active ? AnyShapeStyle(.tint.opacity(0.18)) : AnyShapeStyle(.clear), in: .rect(cornerRadius: 6))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(active ? .isSelected : [])
        .help(shortcut.map { "\(label) (\($0))" } ?? label)
    }
}

private struct FormattingBar: View {
    let store: EditorStore

    var body: some View {
        HStack(spacing: 2) {
            if store.editingLink {
                LinkField(store: store)
            } else if store.coloring {
                ColorPanel(store: store)
            } else {
                ToolButton(label: "Bold", symbol: "bold", active: store.isMarkActive("bold"), shortcut: "⌘B") { store.toggleMark("bold") }
                ToolButton(label: "Italic", symbol: "italic", active: store.isMarkActive("italic"), shortcut: "⌘I") { store.toggleMark("italic") }
                ToolButton(label: "Underline", symbol: "underline", active: store.isMarkActive("underline"), shortcut: "⌘U") { store.toggleMark("underline") }
                ToolButton(label: "Strikethrough", symbol: "strikethrough", active: store.isMarkActive("strike"), shortcut: "⇧⌘S") { store.toggleMark("strike") }
                ToolButton(label: "Inline code", symbol: "chevron.left.forwardslash.chevron.right", active: store.isMarkActive("code"), shortcut: "⌘E") {
                    store.toggleMark("code")
                }
                ToolButton(label: "Highlight", symbol: "highlighter", active: store.isMarkActive("highlight"), shortcut: "⇧⌘H") { store.toggleMark("highlight") }
                ToolButton(label: "Colour", symbol: "paintpalette") { store.coloring = true }
                Divider().frame(height: 20)
                ToolButton(label: "Link", symbol: "link", active: store.isMarkActive("link"), shortcut: "⌘K") { store.editingLink = true }
                Divider().frame(height: 20)
                ToolButton(label: "Heading 1", symbol: "textformat.size.larger", active: store.isHeading(1)) { store.setBlockType("heading", level: 1, toggle: true) }
                ToolButton(label: "Heading 2", symbol: "textformat.size", active: store.isHeading(2)) { store.setBlockType("heading", level: 2, toggle: true) }
                ToolButton(label: "Heading 3", symbol: "textformat.size.smaller", active: store.isHeading(3)) { store.setBlockType("heading", level: 3, toggle: true) }
            }
        }
        .padding(4)
        .background(.regularMaterial, in: .rect(cornerRadius: 10))
        .shadow(color: .black.opacity(0.12), radius: 8, y: 3)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Formatting")
    }
}

/// Morrow's ColorPanel: nine text colours and nine highlights, each row with its default
private struct ColorPanel: View {
    let store: EditorStore

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Text").font(.caption).foregroundStyle(.secondary)
            row(kind: "textColor")
            Text("Highlight").font(.caption).foregroundStyle(.secondary)
            row(kind: "highlight")
        }
        .padding(6)
    }

    private func row(kind: String) -> some View {
        let current = store.activeMark(kind)?.attrs?["color"]?.string
        return HStack(spacing: 4) {
            dot(label: kind == "textColor" ? "Default text colour" : "No highlight", fill: Color.clear, text: kind == "textColor",
                active: current == nil) { store.setColor(kind, nil) }
            ForEach(EditorStyle.colorNames, id: \.self) { name in
                let fill = kind == "textColor" ? Color.clear : Color(EditorStyle.background(name) ?? .clear)
                dot(label: "\(name.capitalized)\(kind == "textColor" ? " text" : " highlight")", fill: fill, text: kind == "textColor",
                    color: kind == "textColor" ? Color(EditorStyle.textColor(name) ?? .clear) : .primary, active: current == name) {
                    store.setColor(kind, name)
                }
            }
        }
    }

    private func dot(label: String, fill: Color, text: Bool, color: Color = .primary, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            ZStack {
                Circle().fill(fill)
                Circle().strokeBorder(active ? AnyShapeStyle(.tint) : AnyShapeStyle(.separator), lineWidth: active ? 2 : 1)
                if text { Text("A").font(.system(size: 12, weight: .semibold)).foregroundStyle(color) }
            }
            .frame(width: 24, height: 24)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// Morrow's LinkInput: an address made a link the way normalizeHref makes it, an empty one taking the link off
private struct LinkField: View {
    let store: EditorStore
    @State private var value = ""
    @State private var invalid = false
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 6) {
            TextField("Paste or type a link", text: $value)
                .textFieldStyle(.roundedBorder)
                .frame(width: 240)
                .focused($focused)
                .onSubmit(apply)
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(invalid ? Color.red : .clear))
                .accessibilityLabel("Link address")
                #if os(iOS)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                #endif
                .autocorrectionDisabled()
                .onChange(of: value) { invalid = false }
            Button("Apply", action: apply)
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
        }
        .padding(4)
        .onAppear {
            value = store.activeMark("link")?.attrs?["href"]?.string ?? ""
            focused = true
        }
        .onKeyPress(.escape) {
            store.editingLink = false
            return .handled
        }
    }

    private func apply() {
        let trimmed = value.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty {
            store.setLink(nil)
            store.editingLink = false
            return
        }
        guard let href = LinkHref.normalize(trimmed) else {
            invalid = true
            return
        }
        store.setLink(href)
        store.editingLink = false
    }
}

/// Morrow's LinkMenu: where the link goes, open it, edit it, take it off
private struct LinkBar: View {
    let store: EditorStore
    @Environment(\.openURL) private var openURL

    var body: some View {
        HStack(spacing: 2) {
            if store.editingLink {
                LinkField(store: store)
            } else if let href = store.activeMark("link")?.attrs?["href"]?.string {
                Button(LinkHref.preview(href)) { open(href) }
                    .buttonStyle(.plain)
                    .lineLimit(1)
                    .frame(maxWidth: 220)
                    .padding(.horizontal, 8)
                    .help(href)
                ToolButton(label: "Open link", symbol: "arrow.up.right.square") { open(href) }
                ToolButton(label: "Edit link", symbol: "pencil") { store.editingLink = true }
                ToolButton(label: "Remove link", symbol: "link.badge.minus") { store.setLink(nil) }
            }
        }
        .padding(4)
        .background(.regularMaterial, in: .rect(cornerRadius: 10))
        .shadow(color: .black.opacity(0.12), radius: 8, y: 3)
    }

    private func open(_ href: String) {
        if let pageId = LinkHref.pageId(href) {
            store.controller.go(to: .page(pageId))
        } else if let url = URL(string: href) {
            openURL(url)
        }
    }
}

/// Morrow's normalizeHref, openHref and the link preview's text
enum LinkHref {
    static func normalize(_ raw: String) -> String? {
        let value = raw.trimmingCharacters(in: .whitespaces)
        guard !value.isEmpty else { return nil }
        func matches(_ pattern: String) -> Bool { value.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil }
        if matches("^(https?:|mailto:|#/page/)") { return value }
        if matches("^[\\w.-]+@[\\w.-]+\\.\\w+$") { return "mailto:\(value)" }
        if matches("^[a-z][a-z0-9+.-]*:") { return nil }
        return "https://\(value)"
    }

    static func pageId(_ href: String) -> String? { Links.pageIdFromHref(.string(href)) }

    static func preview(_ href: String) -> String {
        if href.hasPrefix("#/page/") { return "SynapseNote page" }
        return href.replacingOccurrences(of: "^https?://", with: "", options: .regularExpression)
    }
}

/// Morrow's SuggestionMenu: "Insert block" for "/", "Link to page" for "[[", "Mention a date or page" for "@",
/// each with what it says when nothing matches
private struct SlashMenu: View {
    let store: EditorStore

    private var titles: (String, String) {
        switch store.slash?.kind {
        case .link: ("Link to page", "No pages found")
        case .mention: ("Mention a date or page", "Nothing matches")
        default: ("Insert block", "No matching blocks")
        }
    }

    var body: some View {
        let items = store.slashItems
        VStack(alignment: .leading, spacing: 0) {
            Text(titles.0)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
            if items.isEmpty {
                Text(titles.1)
                    .foregroundStyle(.secondary)
                    .padding(10)
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(spacing: 0) {
                            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                                Button { store.runSlash(item) } label: {
                                    row(item, selected: index == store.slash?.selected)
                                }
                                .buttonStyle(.plain)
                                .id(item.id)
                            }
                        }
                    }
                    .onChange(of: store.slash?.selected) { _, selected in
                        if let selected, items.indices.contains(selected) { proxy.scrollTo(items[selected].id) }
                    }
                }
            }
        }
        .frame(width: 300)
        .frame(maxHeight: 340)
        .fixedSize(horizontal: false, vertical: true)
        .background(.regularMaterial, in: .rect(cornerRadius: 10))
        .shadow(color: .black.opacity(0.15), radius: 10, y: 4)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Insert block")
    }

    private func row(_ item: SlashItem, selected: Bool) -> some View {
        HStack(spacing: 10) {
            Image(systemName: item.symbol)
                .frame(width: 32, height: 32)
                .background(.quaternary, in: .rect(cornerRadius: 6))
            VStack(alignment: .leading, spacing: 1) {
                Text(item.title).font(.callout.weight(.medium)).lineLimit(1)
                if !item.description.isEmpty {
                    Text(item.description).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            Spacer()
            if let hint = item.hint {
                Text(hint).font(.caption.monospaced()).foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(selected ? AnyShapeStyle(.tint.opacity(0.15)) : AnyShapeStyle(.clear))
        .contentShape(.rect)
    }
}

/// Morrow's FindBar: find in the page, step through matches, replace one or all
struct FindBar: View {
    let store: EditorStore
    @State private var replacing = false
    @FocusState private var focused: Bool

    var body: some View {
        let count = store.findMatches.count
        let query = store.find?.query ?? ""
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                TextField("Find in page", text: Binding(get: { store.find?.query ?? "" }, set: { store.find?.query = $0; store.find?.current = 0 }))
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 200)
                    .focused($focused)
                    .onSubmit { store.findNext(1) }
                    .autocorrectionDisabled()
                    #if os(iOS)
                    .textInputAutocapitalization(.never)
                    #endif
                    .accessibilityLabel("Find in page")
                Text(query.isEmpty ? "" : count > 0 ? "\(min((store.find?.current ?? 0) + 1, count)) of \(count)" : "No results")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .frame(minWidth: 64)
                ToolButton(label: "Previous match", symbol: "chevron.up") { store.findNext(-1) }
                ToolButton(label: "Next match", symbol: "chevron.down") { store.findNext(1) }
                ToolButton(label: "Replace", symbol: "arrow.2.squarepath", active: replacing) { replacing.toggle() }
                ToolButton(label: "Close find", symbol: "xmark") { store.find = nil }
            }
            if replacing {
                HStack(spacing: 6) {
                    TextField("Replace with", text: Binding(get: { store.find?.replacement ?? "" }, set: { store.find?.replacement = $0 }))
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 200)
                        .accessibilityLabel("Replace with")
                    Button("Replace") { store.replace(all: false) }
                        .disabled(count == 0)
                    Button("Replace all") { store.replace(all: true) }
                        .disabled(count == 0)
                }
                .controlSize(.small)
            }
        }
        .padding(8)
        .background(.regularMaterial, in: .rect(cornerRadius: 10))
        .shadow(color: .black.opacity(0.12), radius: 8, y: 3)
        .onAppear { focused = true }
        .onKeyPress(.escape) {
            store.find = nil
            return .handled
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Find and replace")
    }
}
