import ServerAPI
import SwiftUI

/// The content tree. Folders load one level at a time as they open.
struct SidebarView: View {
    @Bindable var model: AppModel

    var body: some View {
        List(selection: $model.selectedDocument) {
            TreeLevel(model: model, dir: "")
        }
        .listStyle(.sidebar)
        .overlay {
            if model.connection == .connected, model.children[""]?.isEmpty == true {
                Text("문서가 없습니다").foregroundStyle(.secondary)
            }
        }
        .toolbar {
            ToolbarItem {
                Button {
                    Task { await model.refreshTree() }
                } label: {
                    Label("새로 고침", systemImage: "arrow.clockwise")
                }
                .disabled(model.connection != .connected)
            }
        }
    }
}

private struct TreeLevel: View {
    let model: AppModel
    let dir: String

    var body: some View {
        ForEach(model.children[dir] ?? [], id: \.treePath) { entry in
            if entry.kind == .folder {
                DisclosureGroup(isExpanded: Binding(
                    get: { model.expanded.contains(entry.treePath) },
                    set: { model.setExpanded(entry.treePath, $0) }
                )) {
                    AnyView(TreeLevel(model: model, dir: entry.treePath))
                } label: {
                    Label(entry.name, systemImage: "folder")
                }
            } else if let docName = entry.docName {
                Label(entry.name, systemImage: "doc.text")
                    .tag(docName)
            }
        }
    }
}
