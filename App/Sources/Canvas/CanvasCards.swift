import SwiftUI

/// Morrow's CanvasCard at the canvas's own size: a text card, a page, a file or picture, a link, a group or a
/// drawing, with its colour and the outline when chosen.
struct CanvasCard: View {
    let store: CanvasStore
    let node: JSObject
    let selected: Bool

    private var kind: String { CanvasEdits.type(node) }
    private var color: Color? { CanvasColor.preset(node["color"]?.string) }

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(background, in: .rect(cornerRadius: 10))
            .overlay {
                if kind != "drawing" {
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(color ?? Color.secondary.opacity(0.45),
                                      style: StrokeStyle(lineWidth: 1.5, dash: kind == "group" ? [6, 4] : []))
                }
            }
            .overlay {
                if selected {
                    RoundedRectangle(cornerRadius: 12).stroke(.tint, lineWidth: 2).padding(-4)
                }
            }
            .overlay(alignment: .topLeading) {
                if kind == "group" {
                    Text(node["label"]?.string ?? "")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .fixedSize()
                        .offset(y: -26)
                }
            }
    }

    private var background: AnyShapeStyle {
        switch kind {
        case "drawing": AnyShapeStyle(.clear)
        case "group": AnyShapeStyle((color ?? .secondary).opacity(0.07))
        default: AnyShapeStyle(.background.secondary)
        }
    }

    @ViewBuilder private var content: some View {
        switch kind {
        case "text": TextCardView(text: node["text"]?.string ?? "")
        case "page": PageCardView(card: node["pageId"]?.string.flatMap { store.pages[$0] })
        case "file": FileCardView(store: store, path: node["file"]?.string ?? "")
        case "link":
            VStack(alignment: .leading, spacing: 4) {
                Text(CanvasEdits.safeHost(node["url"]?.string ?? "")).font(.system(size: 15, weight: .semibold))
                Text(node["url"]?.string ?? "").font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(2)
            }
            .padding(12)
        case "drawing": DrawingView(node: node)
        // a group is its frame and its name; an empty view would take its border and outline away with it
        default: Color.clear
        }
    }
}

/// TextCard: headings and bullets lightly styled, Empty card when there is nothing
private struct TextCardView: View {
    let text: String

    var body: some View {
        if let lines = CanvasEdits.cardLines(text) {
            VStack(alignment: .leading, spacing: 2) {
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                    switch line {
                    case .heading(let level, let text):
                        Text(text).font(.system(size: [0, 22, 18, 16][min(level, 3)], weight: .bold))
                    case .bullet(let text):
                        Text("• \(text)").font(.system(size: 15))
                    case .plain(let text):
                        Text(text).font(.system(size: 15))
                    }
                }
            }
            .padding(12)
        } else {
            Text("Empty card").font(.system(size: 15)).foregroundStyle(.tertiary).padding(12)
        }
    }
}

private struct PageCardView: View {
    let card: CanvasSnapshot.PageCard?

    var body: some View {
        if let card {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    if let icon = card.icon { EmojiImage(emoji: icon, size: 18) }
                    Text(card.title).font(.system(size: 16, weight: .semibold)).lineLimit(1)
                }
                Text(card.snippet).font(.system(size: 13)).foregroundStyle(.secondary)
            }
            .padding(12)
        } else {
            Text("This page no longer exists.").font(.system(size: 15)).foregroundStyle(.tertiary).padding(12)
        }
    }
}

/// FileCard: a picture in the vault, or the file's name
private struct FileCardView: View {
    let store: CanvasStore
    let path: String
    @State private var image: Image?

    var body: some View {
        Group {
            if let image {
                Color.clear.overlay { image.resizable().scaledToFit() }.clipShape(.rect(cornerRadius: 10))
            } else {
                Text(path.split(separator: "/").last.map(String.init) ?? path).font(.system(size: 15)).padding(12)
            }
        }
        .task(id: path) {
            image = nil
            guard Paths.isImagePath(path), let data = await store.controller.vaultFile(path) else { return }
            image = await Task.detached { CoverPicture.decode(data, maxPixels: 1600) }.value
        }
    }
}

/// DrawingCard: the lines of a drawing in its own box
private struct DrawingView: View {
    let node: JSObject

    var body: some View {
        Canvas { context, _ in
            for stroke in node["strokes"]?.array ?? [] {
                let points = (stroke["points"]?.array ?? []).map { $0.number ?? 0 }
                var path = Path()
                for segment in CanvasEdits.strokeSegments(points) { segment.add(to: &path) { $0 } }
                let highlighter = stroke["highlighter"] == .bool(true)
                context.stroke(path, with: .color(CanvasColor.ink(stroke["color"]?.string).opacity(highlighter ? 0.35 : 1)),
                               style: StrokeStyle(lineWidth: stroke["width"]?.number ?? 3, lineCap: .round, lineJoin: .round))
            }
        }
        .accessibilityLabel("Drawing")
    }
}

/// Morrow's canvas toolbar: tools and ink, adding cards, pages and groups, undo, zoom and fit, and colours and
/// delete for what is chosen.
struct CanvasToolbar: View {
    let store: CanvasStore
    let editable: Bool
    let size: CGSize
    @Binding var pickingPage: Bool

    var body: some View {
        // its own width when it fits, scrolling when the window is narrower
        ViewThatFits(in: .horizontal) {
            bar
            ScrollView(.horizontal) { bar }.scrollIndicators(.hidden)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 16)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Canvas tools")
    }

    private var bar: some View {
        HStack(spacing: 2) {
            if editable {
                tool(.select, "Select and move (V)", "cursorarrow")
                tool(.pen, "Pen (P)", "pencil")
                tool(.highlighter, "Highlighter (H)", "highlighter")
                tool(.eraser, "Eraser (E)", "eraser")
                if store.tool == .pen || store.tool == .highlighter {
                    Divider().frame(height: 22)
                    ForEach([nil] + CanvasEdits.colors, id: \.self) { (color: String?) in
                        swatch(CanvasColor.ink(color), active: store.ink.color == color,
                               label: color.map { "Ink colour \($0)" } ?? "Ink in the text colour") { store.ink.color = color }
                    }
                    ForEach(CanvasEdits.inkWidths, id: \.self) { width in
                        Button { store.ink.width = width } label: {
                            Circle().frame(width: width + 4, height: width + 4).frame(width: 28, height: 28)
                                .background(store.ink.width == width ? AnyShapeStyle(.tint.opacity(0.18)) : AnyShapeStyle(.clear), in: .circle)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Line width \(Int(width))")
                    }
                }
                Divider().frame(height: 22)
                icon("Add a card", "note.text") {
                    store.addCard(at: store.view.toWorld(CanvasEdits.Point(x: size.width / 2, y: size.height / 2)))
                }
                icon("Add a page", "doc.text") { pickingPage = true }
                    .popover(isPresented: $pickingPage) { CanvasPagePicker(store: store, size: size) { pickingPage = false } }
                icon("Add a group", "square.dashed") {
                    let center = store.view.toWorld(CanvasEdits.Point(x: size.width / 2, y: size.height / 2))
                    store.add(CanvasEdits.groupNode(at: center, id: CanvasEdits.newNodeId(CanvasStore.newId)))
                }
                Divider().frame(height: 22)
                icon("Undo", "arrow.uturn.backward") { store.undo() }
                icon("Redo", "arrow.uturn.forward") { store.redo() }
                Divider().frame(height: 22)
            }
            icon("Zoom out", "minus") { store.zoom(by: 1 / 1.25, at: center) }
            Text("\(Int(Formula.mathRound(store.view.zoom * 100)))%")
                .font(.footnote.monospacedDigit())
                .frame(minWidth: 44)
            icon("Zoom in", "plus") { store.zoom(by: 1.25, at: center) }
            icon("Fit everything in view", "arrow.up.left.and.arrow.down.right") {
                store.view = CanvasEdits.fit(store.data, width: size.width, height: size.height)
            }
            if editable && (!store.selected.isEmpty || store.selectedEdge != nil) {
                Divider().frame(height: 22)
                ForEach([nil] + CanvasEdits.colors, id: \.self) { (color: String?) in
                    swatch(CanvasColor.preset(color) ?? .secondary.opacity(0.4), active: false,
                           label: color.map { "Colour \($0)" } ?? "No colour") { store.setColor(color) }
                }
                icon("Delete selection", "trash") { store.removeSelection() }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(.regularMaterial, in: .capsule)
        .fixedSize()
    }

    private var center: CanvasEdits.Point { CanvasEdits.Point(x: size.width / 2, y: size.height / 2) }

    private func tool(_ value: CanvasStore.Tool, _ label: String, _ symbol: String) -> some View {
        Button { store.choose(value) } label: {
            Image(systemName: symbol).frame(width: 30, height: 30)
                .background(store.tool == value ? AnyShapeStyle(.tint.opacity(0.18)) : AnyShapeStyle(.clear), in: .rect(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(store.tool == value ? .isSelected : [])
        .help(label)
    }

    private func icon(_ label: String, _ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: symbol).frame(width: 30, height: 30) }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
            .help(label)
    }

    private func swatch(_ color: Color, active: Bool, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Circle().fill(color).frame(width: 18, height: 18)
                .overlay(Circle().strokeBorder(active ? AnyShapeStyle(.tint) : AnyShapeStyle(.separator), lineWidth: active ? 2 : 1))
                .frame(width: 26, height: 26)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// Morrow's PagePicker: find a page by title, return takes the first
private struct CanvasPagePicker: View {
    let store: CanvasStore
    let size: CGSize
    let close: () -> Void
    @State private var query = ""
    @State private var found: [DatabaseSnapshot.RelatedPage] = []
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField("Find a page", text: $query)
                .textFieldStyle(.roundedBorder)
                .focused($focused)
                .onSubmit { if let first = found.first { pick(first) } }
            ScrollView {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(found, id: \.id) { page in
                        Button { pick(page) } label: {
                            Text(page.title).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 4)
                                .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .frame(maxHeight: 280)
        }
        .padding(12)
        .frame(width: 280)
        .onAppear { focused = true }
        .task(id: query) { found = await store.controller.findPages(query, excluding: store.pageId, limit: 10) }
    }

    private func pick(_ page: DatabaseSnapshot.RelatedPage) {
        store.addPage(page, at: store.view.toWorld(CanvasEdits.Point(x: size.width / 2, y: size.height / 2)))
        close()
    }
}
