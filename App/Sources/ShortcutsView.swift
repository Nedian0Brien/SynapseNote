import SwiftUI

/// The keyboard shortcuts, as Morrow's shortcuts dialog: the app's actions from `AppAction`, and the editor's.
struct ShortcutsView: View {
    let controller: EditorController
    @Environment(\.dismiss) private var dismiss

    /// Morrow's list of editing keys, `Dialogs.tsx`.
    static let writing: [(String, String)] = [
        ("Bold, italic, underline", "Mod+B  Mod+I  Mod+U"),
        ("Strikethrough", "Mod+Shift+S"),
        ("Inline code", "Mod+E"),
        ("Link selected text", "Mod+K"),
        ("Headings", "Mod+Alt+1  2  3"),
        ("Insert a block", "/"),
        ("Link to a page", "[["),
        ("Move block up or down", "Alt+Shift+↑  ↓"),
        ("Indent or outdent list item", "Tab  Shift+Tab"),
        ("Undo and redo", "Mod+Z  Mod+Shift+Z"),
        ("Save immediately", "Mod+S"),
        ("Find and replace", "Mod+F"),
        ("Add an image or file", "paste or drop it"),
    ]

    /// Morrow's `formatShortcut` on Apple keyboards.
    static func format(_ keys: String) -> String {
        keys.components(separatedBy: "  ").map { part in
            guard part.contains("+") else { return part }
            return part.split(separator: "+").map { key in
                switch key {
                case "Mod": "⌘"
                case "Alt": "⌥"
                case "Shift": "⇧"
                default: String(key)
                }
            }.joined()
        }.joined(separator: "  ")
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Everywhere") {
                    ForEach(AppAction.all.filter { $0.shortcut != nil }) { action in
                        row(action.label(controller), action.shortcut!.label)
                    }
                }
                Section("Writing") {
                    ForEach(Self.writing, id: \.0) { label, keys in
                        row(label, Self.format(keys))
                    }
                }
            }
            .navigationTitle("Keyboard Shortcuts")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
        #if os(macOS)
        .frame(minWidth: 460, minHeight: 560)
        #endif
    }

    private func row(_ label: String, _ keys: String) -> some View {
        LabeledContent(label) {
            Text(keys).monospaced().foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }
}
