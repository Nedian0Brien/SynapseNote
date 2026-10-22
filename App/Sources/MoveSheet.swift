import SwiftUI

/// Picks where a page goes: the top of the vault or under another page it may be placed in.
struct MoveSheet: View {
    let workspace: Workspace
    let pageId: String
    let onMove: (String?) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var candidates: [Workspace.Row] {
        let all = workspace.rows(expanded: Set(workspace.infos.keys))
        return all.filter { row in
            workspace.canMove(pageId, under: row.id)
                && (query.isEmpty || row.page.displayTitle.localizedCaseInsensitiveContains(query))
        }
    }

    var body: some View {
        NavigationStack {
            List {
                if query.isEmpty {
                    Button {
                        move(to: nil)
                    } label: {
                        Label("Top Level", systemImage: "tray.full")
                    }
                    .disabled(workspace.infos[pageId]?.parentId == nil)
                }
                ForEach(candidates) { row in
                    Button {
                        move(to: row.id)
                    } label: {
                        PageLabel(page: row.page)
                            .padding(.leading, query.isEmpty ? CGFloat(row.depth) * 14 : 0)
                    }
                    .disabled(workspace.infos[pageId]?.parentId == row.id)
                }
            }
            .searchable(text: $query, prompt: "Search pages")
            .navigationTitle("Move “\(workspace.infos[pageId]?.displayTitle ?? "Page")”")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
        #if os(macOS)
        .frame(minWidth: 420, minHeight: 460)
        #endif
    }

    private func move(to parent: String?) {
        onMove(parent)
        dismiss()
    }
}
