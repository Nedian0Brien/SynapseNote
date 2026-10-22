import SwiftUI

/// Pages sent to the trash, to restore or delete forever, as Morrow's trash view.
struct TrashView: View {
    let controller: EditorController
    @State private var emptying = false

    var body: some View {
        let trashed = controller.workspace.trashed
        VStack(spacing: 0) {
            HStack {
                Text("Trash").font(.title2.weight(.semibold))
                Spacer()
                Button("Empty Trash", role: .destructive) { emptying = true }
                    .disabled(trashed.isEmpty)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            Divider()
            content(trashed)
                .frame(maxHeight: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .confirmationDialog("Empty the trash?", isPresented: $emptying, titleVisibility: .visible) {
            Button("Empty Trash", role: .destructive) { controller.perform(.emptyTrash) }
        } message: {
            let count = trashed.count
            Text("\(count) page\(count == 1 ? "" : "s") and everything inside \(count == 1 ? "it" : "them") will be deleted forever.")
        }
    }

    // a plain view, not a navigation stack: it lies over the editor in the same column, and a stack there
    // brought its own title and toolbar into the column, which rebuilt the editor's web view, and WebKit
    // stopped the app when the new view took the page
    @ViewBuilder
    private func content(_ trashed: [PageInfo]) -> some View {
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
                                Button("Restore") { controller.restorePage(page.id) }
                                DeleteForeverButton(controller: controller, page: page)
                            }
                            .buttonStyle(.bordered)
                        }
                    } footer: {
                        Text(Self.footer)
                    }
                }
            }
        }
    }

    private static var footer: String {
        #if os(macOS)
        "Pages in the trash stay in the vault's .trash folder until they are deleted forever. Deleted files go to the Trash in Finder."
        #else
        "Pages in the trash stay in the vault's .trash folder until they are deleted forever. Deleted files are kept in the vault's .morrow/deleted folder."
        #endif
    }

    static func relative(_ milliseconds: Double, now: Date = Date()) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        formatter.dateTimeStyle = .named
        // a page trashed a moment ago can carry a time a little ahead of this clock
        let date = min(Date(timeIntervalSince1970: milliseconds / 1000), now)
        return formatter.localizedString(for: date, relativeTo: now)
    }
}

/// Delete Forever with its confirmation shown at the button.
private struct DeleteForeverButton: View {
    let controller: EditorController
    let page: PageInfo
    @State private var confirming = false

    var body: some View {
        Button("Delete Forever", role: .destructive) { confirming = true }
            .confirmationDialog("Delete “\(page.displayTitle)” forever?", isPresented: $confirming, titleVisibility: .visible) {
                Button("Delete Forever", role: .destructive) { controller.perform(.deleteForever(id: page.id)) }
            } message: {
                let count = controller.workspace.descendants(of: page.id).count
                Text(count > 0 ? "This also deletes \(count) subpage\(count == 1 ? "" : "s"). This cannot be undone." : "This cannot be undone.")
            }
    }
}
