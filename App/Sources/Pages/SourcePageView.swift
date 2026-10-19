import SwiftUI

/// Morrow's PageView in source mode: the cover and header, a note saying so with the way back, and the page as
/// the Markdown in its file, read back as it is typed (`SourceDraft`).
struct SourcePageView: View {
    let controller: EditorController
    let page: PageInfo
    @State private var draft: SourceDraft?
    @FocusState private var editing: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                CoverBanner(controller: controller, page: page, editable: true)
                PageColumn(controller: controller) {
                    VStack(alignment: .leading, spacing: 0) {
                        PageHeaderView(controller: controller, page: page, editable: true, onEnter: { editing = true })
                        PageBanner(text: "You are editing this page as Markdown.") {
                            Button("Back to the editor") { controller.setSourceMode(nil) }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                        }
                        .padding(.top, 8)
                        .padding(.bottom, 12)
                        if let draft {
                            editor(draft)
                        } else {
                            ProgressView().frame(maxWidth: .infinity, minHeight: 320)
                        }
                    }
                }
                .padding(.top, page.cover == nil ? 32 : 0)
            }
            .padding(.bottom, 120)
        }
        .background(.background)
        .task(id: page.id) { draft = await controller.sourceDraft(for: page.id) }
        .onChange(of: editing) { _, isEditing in
            if !isEditing, let draft { Task { await draft.flush() } }
        }
        .onDisappear {
            if let draft { Task { await draft.flush() } }
        }
    }

    /// the text grows with what is in it and the page scrolls, as Morrow's textarea
    private func editor(_ draft: SourceDraft) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            TextEditor(text: Binding(get: { draft.text }, set: { draft.edit($0) }))
                .font(.system(size: 14, design: .monospaced))
                .scrollDisabled(true)
                .scrollContentBackground(.hidden)
                .autocorrectionDisabled()
                #if os(iOS)
                .textInputAutocapitalization(.never)
                #endif
                .focused($editing)
                .frame(minHeight: 320)
                .padding(10)
                .background(.quaternary.opacity(0.5), in: .rect(cornerRadius: 8))
                .overlay {
                    RoundedRectangle(cornerRadius: 8)
                        .strokeBorder(editing ? AnyShapeStyle(.tint.opacity(0.6)) : AnyShapeStyle(.separator), lineWidth: 1)
                }
                .accessibilityLabel("Markdown source")
            if let error = draft.error {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .accessibilityAddTraits(.isStaticText)
            }
        }
        .padding(.top, 4)
    }
}
