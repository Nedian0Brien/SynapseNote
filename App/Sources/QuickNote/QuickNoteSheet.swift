import SwiftUI

/// Morrow's quick note (`CaptureDialog.tsx`): a few lines that go to the end of today's note, with the time;
/// a paragraph starting [ ] becomes a task.
struct QuickNoteSheet: View {
    let controller: EditorController
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            TextEditor(text: $text)
                .focused($focused)
                .scrollContentBackground(.hidden)
                .padding(8)
                .overlay(alignment: .topLeading) {
                    if text.isEmpty {
                        Text("What’s on your mind? Start with [ ] to make it a task.")
                            .foregroundStyle(.tertiary)
                            .padding(.horizontal, 13)
                            .padding(.vertical, 16)
                            .allowsHitTesting(false)
                    }
                }
                .accessibilityLabel("Quick note")
                .navigationTitle("Quick Note")
                #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
                #endif
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        // short on iOS, where the title shares a narrow bar with both buttons
                        Button(Self.addLabel, action: save)
                            .keyboardShortcut(.return, modifiers: .command)
                            .accessibilityLabel("Add to Today")
                    }
                }
        }
        #if os(macOS)
        .frame(minWidth: 440, minHeight: 220)
        #else
        .presentationDetents([.medium, .large])
        #endif
        .onAppear { focused = true }
    }

    #if os(iOS)
    private static let addLabel = "Add"
    #else
    private static let addLabel = "Add to Today"
    #endif

    /// As Morrow's: nothing written closes the sheet, otherwise the note goes to today's page.
    private func save() {
        if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { controller.capture(text) }
        dismiss()
    }
}

/// The links the app opens: `synapsenote://capture` for a quick note.
enum AppLink: Equatable {
    case capture

    static let scheme = "synapsenote"

    init?(_ url: URL) {
        guard url.scheme?.lowercased() == Self.scheme, url.host()?.lowercased() == "capture" else { return nil }
        self = .capture
    }
}
