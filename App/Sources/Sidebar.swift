import SwiftUI
import UniformTypeIdentifiers

/// Favourites, the page tree and the trash, with Morrow's sidebar actions.
struct Sidebar: View {
    @Bindable var controller: EditorController

    var body: some View {
        let workspace = controller.workspace
        List(selection: $controller.sidebarItem) {
            Label("Home", systemImage: "house")
                .tag(Destination.home)
            let favorites = workspace.favorites
            if !favorites.isEmpty {
                Section("Favorites") {
                    ForEach(favorites) { page in
                        Button {
                            controller.go(to: .page(page.id))
                        } label: {
                            PageLabel(page: page)
                        }
                        .buttonStyle(.plain)
                        .contextMenu { PageMenu(controller: controller, page: page) }
                    }
                }
            }
            Section("Pages") {
                ForEach(workspace.rows(expanded: controller.expanded)) { row in
                    TreeRow(controller: controller, row: row)
                        .tag(Destination.page(row.id))
                }
            }
            Section {
                HStack {
                    Label("Trash", systemImage: "trash")
                    Spacer()
                    let count = workspace.trashed.count
                    if count > 0 { Text("\(count)").foregroundStyle(.secondary).monospacedDigit() }
                }
                .tag(Destination.trash)
            }
        }
        .overlay {
            if controller.phase == .ready && workspace.rows(expanded: []).isEmpty && workspace.trashed.isEmpty {
                ContentUnavailableView {
                    Label("No pages yet", systemImage: "doc.text")
                } actions: {
                    Button("New Page") { controller.createPage() }
                }
            }
        }
    }
}

/// A page's icon and title.
struct PageLabel: View {
    let page: PageInfo

    var body: some View {
        Label {
            Text(page.displayTitle).lineLimit(1)
        } icon: {
            if let icon = page.icon {
                EmojiImage(emoji: icon, size: 16)
            } else {
                Image(systemName: page.kind == "canvas" ? "scribble" : page.kind == "database" ? "tablecells" : "doc.text")
            }
        }
    }
}

/// One page in the tree: a disclosure arrow, its label, a drag source and a drop target.
private struct TreeRow: View {
    @Bindable var controller: EditorController
    let row: Workspace.Row
    @State private var zone: Workspace.DropZone?
    @State private var height: CGFloat = 28

    var body: some View {
        HStack(spacing: 4) {
            Group {
                if row.hasChildren {
                    Button {
                        if controller.expanded.contains(row.id) { controller.expanded.remove(row.id) }
                        else { controller.expanded.insert(row.id) }
                    } label: {
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .rotationEffect(.degrees(controller.expanded.contains(row.id) ? 90 : 0))
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(controller.expanded.contains(row.id) ? "Collapse" : "Expand")
                } else {
                    Color.clear
                }
            }
            .frame(width: 14)
            PageLabel(page: row.page)
            Spacer(minLength: 0)
        }
        .padding(.leading, CGFloat(row.depth) * 14)
        .contentShape(.rect)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
        .overlay(alignment: zone == .after ? .bottom : .top) {
            if zone == .before || zone == .after {
                Rectangle().fill(Color.accentColor).frame(height: 2)
            }
        }
        .background(zone == .inside ? Color.accentColor.opacity(0.2) : .clear, in: .rect(cornerRadius: 6))
        .onDrag { NSItemProvider(object: row.id as NSString) }
        .onDrop(of: [.text], delegate: PageDropDelegate(controller: controller, target: row.id, height: height, zone: $zone))
        .contextMenu { PageMenu(controller: controller, page: row.page) }
    }
}

/// Places a dragged page before, inside or after a row, by where it is over the row, as Morrow's `zoneFor`.
private struct PageDropDelegate: DropDelegate {
    let controller: EditorController
    let target: String
    let height: CGFloat
    @Binding var zone: Workspace.DropZone?

    private func zone(at y: CGFloat) -> Workspace.DropZone {
        if y < height * 0.25 { return .before }
        if y > height * 0.75 { return .after }
        return .inside
    }

    func dropEntered(info: DropInfo) { zone = zone(at: info.location.y) }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        zone = zone(at: info.location.y)
        return DropProposal(operation: .move)
    }

    func dropExited(info: DropInfo) { zone = nil }

    func performDrop(info: DropInfo) -> Bool {
        let place = zone(at: info.location.y)
        zone = nil
        guard let provider = info.itemProviders(for: [.text]).first else { return false }
        _ = provider.loadObject(ofClass: NSString.self) { object, _ in
            guard let dragged = object as? String else { return }
            Task { @MainActor in
                guard let destination = controller.workspace.dropDestination(of: dragged, onto: target, zone: place) else { return }
                controller.perform(.move(id: dragged, parent: destination.parent, index: destination.index))
            }
        }
        return true
    }
}

/// Morrow's page menu items for page management.
struct PageMenu: View {
    let controller: EditorController
    let page: PageInfo

    var body: some View {
        Button("Open in New Tab", systemImage: "plus.square.on.square") { controller.openInNewTab(.page(page.id)) }
        Divider()
        Button("Add Subpage", systemImage: "plus") { controller.createPage(parent: page.id) }
        Button(page.icon == nil ? "Add Icon" : "Change Icon", systemImage: "face.smiling") { controller.iconPage = page.id }
        if page.favorite {
            Button("Remove from Favorites", systemImage: "star.slash") { controller.perform(.setFavorite(id: page.id, favorite: false)) }
        } else {
            Button("Add to Favorites", systemImage: "star") { controller.perform(.setFavorite(id: page.id, favorite: true)) }
        }
        Button("Duplicate", systemImage: "doc.on.doc") { controller.duplicate(page.id) }
        Button("Move To…", systemImage: "arrow.right.arrow.left") { controller.movingPage = page.id }
        #if os(macOS)
        Button("Show in Finder", systemImage: "folder") { controller.reveal(page.id) }
        #endif
        Divider()
        Button("Move to Trash", systemImage: "trash", role: .destructive) { controller.trash(page.id) }
    }
}
