import SwiftUI
import UniformTypeIdentifiers

/// Favourites, the page tree and the trash, with Morrow's sidebar actions.
struct Sidebar: View {
    @Bindable var controller: EditorController
    @State private var counts: SidebarCounts?

    var body: some View {
        let workspace = controller.workspace
        List(selection: $controller.sidebarItem) {
            Label("Home", systemImage: "house")
                .tag(Destination.home)
            // today's note is made when it does not exist yet, so this row opens it rather than being a place
            Button { controller.openToday() } label: {
                Label("Today", systemImage: "calendar")
                    .fontWeight(isOnToday ? .semibold : .regular)
            }
            .buttonStyle(.plain)
            CountedRow(title: "Tasks", symbol: "checklist", count: counts?.openTasks)
                .tag(Destination.tasks)
            CountedRow(title: "Tags", symbol: "number", count: counts?.tags)
                .tag(Destination.tags)
            CountedRow(title: "Review", symbol: "graduationcap", count: counts?.dueCards)
                .tag(Destination.review)
            Label("Graph", systemImage: "point.3.connected.trianglepath.dotted")
                .tag(Destination.graph(nil))

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
                CountedRow(title: "Trash", symbol: "trash", count: workspace.trashed.count)
                    .tag(Destination.trash)
            }
        }
        // the counts beside Tasks and Tags, asked again after a short pause whenever the workspace changes
        .task(id: controller.revision) {
            if counts != nil { try? await Task.sleep(for: .milliseconds(400)) }
            guard !Task.isCancelled, let next = await controller.sidebarCounts() else { return }
            counts = next
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

    private var isOnToday: Bool {
        controller.selection.flatMap { controller.workspace.infos[$0]?.dailyDate } == DailyNote.key(for: .now)
    }
}

/// A sidebar row with a number beside it, left out when there is nothing to count.
private struct CountedRow: View {
    let title: String
    let symbol: String
    let count: Int?

    var body: some View {
        HStack {
            Label(title, systemImage: symbol)
            Spacer()
            if let count, count > 0 { Text("\(count)").foregroundStyle(.secondary).monospacedDigit() }
        }
    }
}

enum DailyNote {
    /// Morrow's `dateKey`: the local calendar day as yyyy-mm-dd.
    static func key(for date: Date, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
}

/// A page's icon and title.
struct PageLabel: View {
    let page: PageInfo

    var body: some View {
        Label {
            Text(page.displayTitle).lineLimit(1)
        } icon: {
            PageIcon(page: page, size: 16)
        }
    }
}

/// The page's emoji, or a symbol for its kind as Morrow's `pageIcon` picks one.
struct PageIcon: View {
    let page: PageInfo
    let size: CGFloat

    var body: some View {
        // a locked page shows the lock even when it has an emoji, as morrow's PageIcon
        if let icon = page.icon, !page.encrypted {
            EmojiImage(emoji: icon, size: size)
        } else {
            Image(systemName: Self.symbol(for: page))
        }
    }

    static func symbol(for page: PageInfo) -> String {
        if page.encrypted { return "lock" }
        if page.dailyDate != nil { return "calendar" }
        switch page.kind {
        case "journal": return "book"
        case "templates": return "square.on.square.dashed"
        case "canvas": return "scribble"
        case "database": return "tablecells"
        default: return "doc.text"
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
        Button("Add Database Inside", systemImage: "tablecells") { controller.createDatabase(parent: page.id) }
        Button("Add Canvas Inside", systemImage: "scribble") { controller.createCanvas(parent: page.id) }
        Button(page.icon == nil ? "Add Icon" : "Change Icon", systemImage: "face.smiling") { controller.iconPage = page.id }
        if page.favorite {
            Button("Remove from Favorites", systemImage: "star.slash") { controller.perform(.setFavorite(id: page.id, favorite: false)) }
        } else {
            Button("Add to Favorites", systemImage: "star") { controller.perform(.setFavorite(id: page.id, favorite: true)) }
        }
        Button("Duplicate", systemImage: "doc.on.doc") { controller.duplicate(page.id) }
        Button("Move To…", systemImage: "arrow.right.arrow.left") { controller.movingPage = page.id }
        Button("Open Local Graph", systemImage: "point.3.connected.trianglepath.dotted") { controller.go(to: .graph(page.id)) }
        if page.kind == "page" {
            Button("Save as Template", systemImage: "square.on.square.dashed") { controller.saveAsTemplate(page.id) }
        }
        Button("Page History", systemImage: "clock.arrow.circlepath") { controller.openHistory(page.id) }
        #if os(macOS)
        Button("Show in Finder", systemImage: "folder") { controller.reveal(page.id) }
        #endif
        // as morrow's page menu: encryption for ordinary pages, lock and remove once it is unlocked
        if page.kind == "page" {
            if !page.encrypted {
                Button("Encrypt with a Password…", systemImage: "lock") { controller.encryptingPage = page.id }
            } else if !controller.workspace.locked.contains(page.id) {
                Button("Lock Now", systemImage: "lock") { controller.lock(page.id) }
                Button("Remove Encryption", systemImage: "lock.open") { controller.removeEncryption(page.id) }
            }
        }
        // the markdown source, for text pages that can be read
        if page.kind == "page" && !controller.workspace.locked.contains(page.id) {
            if controller.sourceMode == page.id {
                Button("Back to the Editor", systemImage: "doc.text") { controller.setSourceMode(nil) }
            } else {
                Button("Edit as Markdown", systemImage: "chevron.left.forwardslash.chevron.right") { controller.setSourceMode(page.id) }
            }
        }
        Divider()
        Button("Export as Markdown…", systemImage: "arrow.down.doc") { controller.exportMarkdown(page.id) }
        if page.kind != "canvas" {
            Button("Export as PDF…", systemImage: "doc.richtext") { controller.exportPDF(page.id) }
                .disabled(controller.exportingPDF)
        }
        Button("Publish as a Website…", systemImage: "globe") { controller.publish(page.id) }
        Button("Import Markdown Here…", systemImage: "arrow.up.doc") { controller.importMarkdown(into: page.id) }
        Divider()
        Button("Move to Trash", systemImage: "trash", role: .destructive) { controller.trash(page.id) }
    }
}
