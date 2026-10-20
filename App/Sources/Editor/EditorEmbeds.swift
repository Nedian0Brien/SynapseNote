import SwiftUI

/// Pages shown inside a page (`![[page]]`), as Morrow's PageLink node view shows them: a database with all its
/// views and a canvas to draw on, live (`mountEmbed`, EmbeddedDatabase, EmbeddedCanvas), any other page read
/// only under its link (`renderEmbed`).
extension EditorStore {
    enum Embed: Equatable {
        case page(String)
        case database(PageInfo)
        case canvas(PageInfo)

        var live: Bool { if case .page = self { false } else { true } }
    }

    /// what an embed link shows: nothing for a link that is not an embed, a missing or trashed page, the page
    /// itself, or inside a page that is itself shown in another (docToHtml draws its embeds as links)
    func embed(_ node: DocNode) -> Embed? {
        guard embedDepth == 0, node.type == "pageLink", node.attr("embed") == .bool(true),
              let id = EditorAtoms.resolved(node, atomLookup), id != pageId else { return nil }
        let workspace = controller.workspace
        guard let page = workspace.infos[id] else { return nil }
        if page.kind == "database" { return .database(page) }
        if page.encrypted || workspace.isTrashed(id) { return nil }
        return page.kind == "canvas" ? .canvas(page) : .page(id)
    }

    /// the embeds of a text block, in order
    func embeds(in block: DocNode) -> [Embed] {
        (block.content ?? []).compactMap(embed)
    }
}

/// the pages a text block's embed links show, below the block
struct EmbedBodies: View {
    let store: EditorStore
    let node: DocNode

    var body: some View {
        let embeds = store.embeds(in: node)
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(embeds.enumerated()), id: \.offset) { _, embed in
                switch embed {
                case .page(let id): EmbeddedPage(host: store, pageId: id)
                case .database(let page): EmbeddedDatabase(controller: store.controller, page: page, editable: store.editable)
                case .canvas(let page): EmbeddedCanvas(controller: store.controller, page: page, editable: store.editable)
                }
            }
        }
    }
}

/// Morrow's `.page-embed`: the other page read only, on a soft background with an accent line, scrolling past
/// 420 points
struct EmbeddedPage: View {
    let host: EditorStore
    let pageId: String
    @State private var store: EditorStore?
    @State private var height: CGFloat = 0

    var body: some View {
        ScrollView {
            Group {
                if let store, store.loaded {
                    BlockList(store: store, nodes: store.doc.content ?? [], path: [], context: .init(), depth: 0)
                } else {
                    Color.clear.frame(height: 1)
                }
            }
            .padding(.top, 10)
            .padding(.horizontal, 14)
            .padding(.bottom, 4)
            .onGeometryChange(for: CGFloat.self, of: \.size.height) { height = $0 }
        }
        .frame(height: min(max(height, 1), 420))
        .background(.quaternary.opacity(0.5), in: UnevenRoundedRectangle(bottomTrailingRadius: 8, topTrailingRadius: 8))
        .overlay(alignment: .leading) { Rectangle().fill(.tint.opacity(0.35)).frame(width: 3) }
        .padding(.vertical, 6)
        .task(id: "\(pageId)|\(host.controller.revision)") {
            let embedded = store?.pageId == pageId ? store! : EditorStore(controller: host.controller, pageId: pageId, editable: false,
                                                                          embedDepth: host.embedDepth + 1)
            await embedded.load()
            store = embedded
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Embedded page")
    }
}

/// Morrow's `.inline-database-head`: the page's icon and title, opening it, and Open as a full page
private struct EmbedHead: View {
    let controller: EditorController
    let page: PageInfo

    var body: some View {
        HStack(spacing: 6) {
            Button { controller.go(to: .page(page.id)) } label: {
                HStack(spacing: 6) {
                    PageIcon(page: page, size: 16)
                    Text(page.displayTitle).fontWeight(.semibold)
                }
            }
            .buttonStyle(.plain)
            Spacer()
            Button("Open as a full page", systemImage: "arrow.up.left.and.arrow.down.right") { controller.go(to: .page(page.id)) }
                .labelStyle(.iconOnly)
                .buttonStyle(.borderless)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 6)
    }
}

/// Morrow's EmbeddedDatabase: a database living inside another page, with all its views
struct EmbeddedDatabase: View {
    let controller: EditorController
    let page: PageInfo
    let editable: Bool
    @State private var store: DatabaseStore

    init(controller: EditorController, page: PageInfo, editable: Bool) {
        self.controller = controller
        self.page = page
        self.editable = editable
        _store = State(initialValue: DatabaseStore(controller: controller, dbId: page.id))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            EmbedHead(controller: controller, page: page)
            if store.snapshot != nil, let view = store.view {
                DatabaseBody(store: store, view: view, editable: editable)
            } else {
                ProgressView().frame(maxWidth: .infinity, minHeight: 80)
            }
        }
        .padding(.vertical, 16)
        .task(id: controller.revision) {
            await store.load()
            store.ensureView(editable: editable)
        }
    }
}

/// Morrow's EmbeddedCanvas: a canvas living inside another page, fully usable, sized by dragging its corner
struct EmbeddedCanvas: View {
    let controller: EditorController
    let page: PageInfo
    let editable: Bool
    @State private var store: CanvasStore
    /// the size while the corner is dragged
    @State private var resizing: AppPreferences.CanvasSize?
    @State private var room: CGFloat = 0

    static let minWidth = 360.0
    static let minHeight = 180.0
    static let maxHeight = 1600.0
    static let defaultHeight = 420.0

    init(controller: EditorController, page: PageInfo, editable: Bool) {
        self.controller = controller
        self.page = page
        self.editable = editable
        _store = State(initialValue: CanvasStore(controller: controller, pageId: page.id))
    }

    var body: some View {
        let size = resizing ?? controller.preferences.canvasSizes[page.id]
        VStack(alignment: .leading, spacing: 0) {
            EmbedHead(controller: controller, page: page)
            CanvasBoard(store: store, editable: editable)
                .frame(width: size?.width.map { min(room, $0) }, height: size?.height ?? Self.defaultHeight)
                .frame(maxWidth: .infinity, alignment: .leading)
                .clipShape(.rect(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.separator))
                .overlay(alignment: .bottomTrailing) { grip(size) }
        }
        .onGeometryChange(for: CGFloat.self, of: \.size.width) { room = $0 }
        .padding(.vertical, 16)
        .task(id: controller.revision) { await store.load() }
        .onDisappear {
            store.finishEditing()
            Task { await store.flush() }
        }
    }

    /// the corner to drag, as Morrow's `.inline-canvas-resize`
    private func grip(_ size: AppPreferences.CanvasSize?) -> some View {
        ResizeCorner()
            .stroke(.secondary, lineWidth: 1.6)
            .frame(width: 16, height: 16)
            .clipped()
            .frame(width: 28, height: 28, alignment: .bottomTrailing)
            .contentShape(.rect)
            .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .global)
                .onChanged { drag in
                    let start = size ?? AppPreferences.CanvasSize(width: nil, height: Self.defaultHeight)
                    resizing = Self.resized(from: start, room: room, by: drag.translation)
                }
                .onEnded { _ in
                    if let resizing { controller.preferences.canvasSizes[page.id] = resizing }
                    resizing = nil
                })
            .accessibilityLabel("Drag to resize")
    }

    /// Morrow's resize: the width between 360 and the room there is (the room itself for none), the height
    /// between 180 and 1600, rounded
    static func resized(from start: AppPreferences.CanvasSize, room: Double, by translation: CGSize) -> AppPreferences.CanvasSize {
        let width = (min(room, max(minWidth, (start.width ?? room) + translation.width))).rounded()
        let height = (min(maxHeight, max(minHeight, start.height + translation.height))).rounded()
        return AppPreferences.CanvasSize(width: width >= room - 1 ? nil : width, height: height)
    }
}

/// Morrow's `.inline-canvas-resize` corner: two short lines across it, at 48% and 72% of the way from its
/// top left to its bottom right
private nonisolated struct ResizeCorner: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        for share in [0.485, 0.715] {
            let point = CGPoint(x: rect.minX + rect.width * share, y: rect.minY + rect.height * share)
            path.move(to: CGPoint(x: point.x - rect.width, y: point.y + rect.height))
            path.addLine(to: CGPoint(x: point.x + rect.width, y: point.y - rect.height))
        }
        return path
    }
}
