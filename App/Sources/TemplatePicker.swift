import SwiftUI

/// New Page from Template, as Morrow's `TemplateDialog`: the pages inside the Templates page.
struct TemplatePicker: View {
    let controller: EditorController
    /// Where the new page goes, the top of the vault when nil.
    let parent: String?
    @Environment(\.dismiss) private var dismiss
    @State private var list: TemplateList?

    var body: some View {
        NavigationStack {
            Group {
                if let list {
                    let templates = list.templates.compactMap { controller.workspace.infos[$0] }
                    if templates.isEmpty {
                        ContentUnavailableView {
                            Label("No templates yet", systemImage: "square.on.square.dashed")
                        } description: {
                            Text("Templates are the pages inside your Templates page. Write {{date}}, {{time}} or {{title}} and they are filled in when a page is made from the template. A template called “Daily note” is used for every new daily note.")
                        } actions: {
                            Button("Make a Template", systemImage: "doc.badge.plus") {
                                dismiss()
                                controller.newTemplate()
                            }
                            .buttonStyle(.borderedProminent)
                        }
                    } else {
                        List(templates) { template in
                            Button {
                                dismiss()
                                controller.createPage(fromTemplate: template.id, parent: parent)
                            } label: {
                                PageLabel(page: template)
                            }
                        }
                    }
                } else {
                    ProgressView()
                }
            }
            .navigationTitle("New Page from Template")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
        #if os(macOS)
        .frame(minWidth: 420, minHeight: 380)
        #endif
        .task { list = await controller.templates() ?? TemplateList(container: nil, templates: []) }
    }
}
