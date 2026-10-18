import SwiftUI

/// Every tag in the vault, as Morrow's `TagsView`: from page properties and from #tags written in pages.
struct TagsView: View {
    let controller: EditorController
    @State private var entries: [TagEntry] = []
    @State private var loaded = false

    var body: some View {
        CollectionScreen(title: "Tags", detail: "Tags from page properties and every #tag written in your pages. A tag like #project/garden also counts as #project.") {
            if !loaded {
                ProgressView().frame(maxWidth: .infinity)
            } else if entries.isEmpty {
                ContentUnavailableView("No tags yet", systemImage: "number", description: Text("Write #something in a page, or add a tag under a page’s title."))
            } else {
                FlowLayout(spacing: 8) {
                    ForEach(entries) { entry in
                        Button { controller.go(to: .tag(entry.tag)) } label: {
                            TagChip(tag: entry.tag, color: entry.color, count: entry.pages)
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            Button("Open in New Tab", systemImage: "plus.square.on.square") { controller.openInNewTab(.tag(entry.tag)) }
                        }
                    }
                }
            }
        }
        .task(id: controller.revision) {
            if loaded { try? await Task.sleep(for: .milliseconds(300)) }
            guard !Task.isCancelled else { return }
            let next = await controller.tags()
            guard !Task.isCancelled else { return }
            entries = next
            loaded = true
        }
    }
}

/// The pages with one tag, the latest edited first, as Morrow's `TagView`.
struct TagView: View {
    let controller: EditorController
    let tag: String
    @State private var ids: [String] = []
    @State private var loaded = false

    var body: some View {
        let pages = ids.compactMap { controller.workspace.infos[$0] }
        CollectionScreen(title: "#\(tag)", detail: loaded ? "\(pages.count) page\(pages.count == 1 ? "" : "s")" : nil) {
            Button("All Tags", systemImage: "chevron.left") { controller.go(to: .tags) }
                .buttonStyle(.borderless)
        } content: {
            if !loaded {
                ProgressView().frame(maxWidth: .infinity)
            } else if pages.isEmpty {
                ContentUnavailableView("No pages have this tag", systemImage: "number")
            } else {
                LazyVStack(alignment: .leading, spacing: 4) {
                    ForEach(pages) { page in
                        Button { controller.go(to: .page(page.id)) } label: { row(page) }
                            .buttonStyle(.plain)
                            .contextMenu {
                                Button("Open in New Tab", systemImage: "plus.square.on.square") { controller.openInNewTab(.page(page.id)) }
                            }
                    }
                }
            }
        }
        .task(id: TagLookup(tag: tag, revision: controller.revision)) {
            if loaded { try? await Task.sleep(for: .milliseconds(300)) }
            guard !Task.isCancelled else { return }
            let next = await controller.pages(tagged: tag)
            guard !Task.isCancelled else { return }
            ids = next
            loaded = true
        }
    }

    private struct TagLookup: Equatable {
        let tag: String
        let revision: Int
    }

    private func row(_ page: PageInfo) -> some View {
        let path = controller.workspace.ancestors(of: page.id).reversed().map(\.displayTitle).joined(separator: " / ")
        return HStack(alignment: .firstTextBaseline, spacing: 8) {
            PageLabel(page: page)
            if !path.isEmpty { Text(path).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
            Spacer(minLength: 8)
            Text(TrashView.relative(page.updatedAt)).font(.caption).foregroundStyle(.secondary)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 10)
        .background(.fill.quinary, in: .rect(cornerRadius: 8))
        .contentShape(.rect)
    }
}

/// A tag in Morrow's colour for it.
struct TagChip: View {
    let tag: String
    let color: String
    var count: Int?
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 6) {
            Text("#\(tag)")
            if let count { Text("\(count)").opacity(0.75).monospacedDigit() }
        }
        .font(.callout.weight(.medium))
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .foregroundStyle(color == "yellow" ? Color(hex: 0x2b2100) : .white)
        .background(TagColor.solid(color, dark: colorScheme == .dark), in: .capsule)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(count.map { "\(tag), \($0) page\($0 == 1 ? "" : "s")" } ?? tag)
    }
}

/// Morrow's solid tag colours, `features.css`, light then dark.
enum TagColor {
    static let solids: [String: (UInt32, UInt32)] = [
        "gray": (0x8e8e93, 0x6e6e73), "brown": (0xa2724f, 0x8c6142), "orange": (0xf2711c, 0xdd6a1c),
        "yellow": (0xf5b800, 0xd9a300), "green": (0x22a565, 0x1f9259), "blue": (0x2f80ed, 0x2a72d4),
        "purple": (0x8b5cf6, 0x7c4ff0), "pink": (0xe64a98, 0xd13f88), "red": (0xeb4d4d, 0xd64545),
    ]

    static func solid(_ name: String, dark: Bool) -> Color {
        let pair = solids[name] ?? solids["gray"]!
        return Color(hex: dark ? pair.1 : pair.0)
    }
}

/// Lays children out in rows, wrapping to the next row when one is full.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let width = rows.map { $0.width }.max() ?? 0
        let height = rows.reduce(0) { $0 + $1.height } + spacing * CGFloat(max(0, rows.count - 1))
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = [Row()]
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let added = rows[rows.count - 1].indices.isEmpty ? size.width : rows[rows.count - 1].width + spacing + size.width
            if added > width, !rows[rows.count - 1].indices.isEmpty {
                rows.append(Row())
            }
            var row = rows[rows.count - 1]
            row.width = row.indices.isEmpty ? size.width : row.width + spacing + size.width
            row.height = max(row.height, size.height)
            row.indices.append(index)
            rows[rows.count - 1] = row
        }
        return rows.filter { !$0.indices.isEmpty }
    }
}
