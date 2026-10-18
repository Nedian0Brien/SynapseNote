import SwiftUI

/// Pages sent to the trash, to restore or delete forever, as Morrow's trash view.
struct TrashView: View {
    let controller: EditorController
    @State private var deleting: PageInfo?
    @State private var emptying = false

    var body: some View {
        let trashed = controller.workspace.trashed
        Group {
            if trashed.isEmpty {
                ContentUnavailableView("The trash is empty", systemImage: "trash", description: Text("Pages you move to the trash appear here."))
            } else {
                List {
                    Section {
                        ForEach(trashed) { page in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    PageLabel(page: page)
                                    if let trashedAt = page.trashedAt {
                                        Text("Trashed \(Self.relative(trashedAt))")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                Spacer()
                                Button("Restore") { controller.perform(.restore(id: page.id)) }
                                Button("Delete Forever", role: .destructive) { deleting = page }
                            }
                            .buttonStyle(.bordered)
                        }
                    } footer: {
                        Text("Pages in the trash stay in the vault's .trash folder until they are deleted forever. Deleted files go to the system trash.")
                    }
                }
            }
        }
        .navigationTitle("Trash")
        .toolbar {
            ToolbarItem {
                Button("Empty Trash", role: .destructive) { emptying = true }
                    .disabled(trashed.isEmpty)
            }
        }
        .confirmationDialog(
            deleting.map { "Delete “\($0.displayTitle)” forever?" } ?? "",
            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
            titleVisibility: .visible,
            presenting: deleting
        ) { page in
            Button("Delete Forever", role: .destructive) { controller.perform(.deleteForever(id: page.id)) }
        } message: { page in
            let count = controller.workspace.descendants(of: page.id).count
            Text(count > 0 ? "This also deletes \(count) subpage\(count == 1 ? "" : "s"). This cannot be undone." : "This cannot be undone.")
        }
        .confirmationDialog("Empty the trash?", isPresented: $emptying, titleVisibility: .visible) {
            Button("Empty Trash", role: .destructive) { controller.perform(.emptyTrash) }
        } message: {
            let count = trashed.count
            Text("\(count) page\(count == 1 ? "" : "s") and everything inside \(count == 1 ? "it" : "them") will be deleted forever.")
        }
    }

    private static func relative(_ milliseconds: Double) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: Date(timeIntervalSince1970: milliseconds / 1000), relativeTo: Date())
    }
}
