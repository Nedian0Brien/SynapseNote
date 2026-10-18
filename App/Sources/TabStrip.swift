import SwiftUI
import UniformTypeIdentifiers

/// The open tabs above the page, as Morrow's `TabBar`: shown once a second tab is open.
struct TabStrip: View {
    let controller: EditorController

    var body: some View {
        HStack(spacing: 4) {
            ScrollView(.horizontal) {
                HStack(spacing: 4) {
                    ForEach(Array(controller.tabs.tabs.enumerated()), id: \.element.id) { index, tab in
                        TabItem(controller: controller, tab: tab, index: index, isActive: tab.id == controller.tabs.activeId)
                    }
                }
                .padding(.horizontal, 8)
            }
            .scrollIndicators(.hidden)
            Button("New Tab", systemImage: "plus") { controller.newTab() }
                .labelStyle(.iconOnly)
                .buttonStyle(.borderless)
                .padding(.trailing, 10)
                .help("New Tab")
        }
        .padding(.vertical, 5)
        .background(.bar)
    }
}

private struct TabItem: View {
    let controller: EditorController
    let tab: TabList.Tab
    let index: Int
    let isActive: Bool
    @State private var hovering = false
    @State private var targeted = false

    var body: some View {
        HStack(spacing: 6) {
            Button { controller.activateTab(tab.id) } label: {
                HStack(spacing: 6) {
                    icon.frame(width: 16)
                    Text(title).lineLimit(1).frame(maxWidth: 160, alignment: .leading)
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(isActive ? .isSelected : [])
            Button {
                controller.closeTab(tab.id)
            } label: {
                Image(systemName: "xmark").font(.caption2.weight(.semibold))
            }
            .buttonStyle(.borderless)
            .opacity(isActive || hovering ? 1 : 0)
            .accessibilityLabel("Close \(title)")
        }
        .font(.callout)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(isActive ? AnyShapeStyle(.background) : AnyShapeStyle(.clear), in: .rect(cornerRadius: 7))
        .overlay(alignment: .leading) {
            if targeted { Rectangle().fill(Color.accentColor).frame(width: 2) }
        }
        .contentShape(.rect)
        .onHover { hovering = $0 }
        .help(title)
        .draggable(tab.id)
        .dropDestination(for: String.self) { ids, _ in
            guard let id = ids.first, controller.tabs.tabs.contains(where: { $0.id == id }) else { return false }
            controller.moveTab(id, to: index)
            return true
        } isTargeted: { targeted = $0 }
        .contextMenu {
            Button("Close Tab") { controller.closeTab(tab.id) }
                .disabled(controller.tabs.tabs.count < 2)
        }
    }

    private var page: PageInfo? { tab.destination.pageId.flatMap { controller.workspace.infos[$0] } }

    private var title: String {
        switch tab.destination {
        case .home: "Home"
        case .trash: "Trash"
        case .tasks: "Tasks"
        case .tags: "Tags"
        case .tag(let tag): "#\(tag)"
        case .graph(let focus): focus.flatMap { controller.workspace.infos[$0]?.displayTitle }.map { "Graph of \($0)" } ?? "Graph"
        case .page: page?.displayTitle ?? "Missing Page"
        }
    }

    @ViewBuilder
    private var icon: some View {
        switch tab.destination {
        case .home: Image(systemName: "house")
        case .trash: Image(systemName: "trash")
        case .tasks: Image(systemName: "checklist")
        case .tags, .tag: Image(systemName: "number")
        case .graph: Image(systemName: "point.3.connected.trianglepath.dotted")
        case .page:
            if let page { PageIcon(page: page, size: 14) } else { Image(systemName: "doc.text") }
        }
    }
}
