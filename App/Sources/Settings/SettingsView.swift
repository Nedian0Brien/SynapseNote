import SwiftUI

/// Morrow's settings dialog (`Dialogs.tsx`) as the app's settings: tabs in the macOS settings window, one
/// sheet on iOS and iPadOS. Each part is its own form so both use the same ones.
struct SettingsView: View {
    @Bindable var controller: EditorController

    /// The custom CSS sheet is shown from here: a sheet attached inside a form section closes the settings
    /// sheet on iOS instead of opening.
    private var editingCss: Binding<Bool> { $controller.editingCustomCss }

    var body: some View {
        #if os(macOS)
        TabView {
            Tab("General", systemImage: "gearshape") { GeneralSettings(controller: controller) }
            Tab("Appearance", systemImage: "paintpalette") { AppearanceSettings(controller: controller) }
            Tab("Data", systemImage: "externaldrive") { DataSettings(controller: controller) }
            Tab("Sync", systemImage: "arrow.triangle.2.circlepath") { SyncSettingsView(controller: controller) }
            Tab("About", systemImage: "info.circle") { AboutSettings() }
        }
        .frame(width: 560, height: 560)
        .sheet(isPresented: editingCss) { CustomCSSSheet(controller: controller) }
        #else
        NavigationStack {
            Form {
                GeneralSettings.Sections(controller: controller)
                AppearanceSettings.Sections(controller: controller)
                Section {
                    NavigationLink {
                        Form { DataSettings.Sections(controller: controller) }
                            .navigationTitle("Your Data")
                    } label: {
                        Label("Your Data", systemImage: "externaldrive")
                    }
                    NavigationLink {
                        SyncSettingsView(controller: controller)
                            .navigationTitle("Sync")
                    } label: {
                        Label("Sync", systemImage: "arrow.triangle.2.circlepath")
                    }
                    NavigationLink {
                        AboutSettings().navigationTitle("About")
                    } label: {
                        Label("About", systemImage: "info.circle")
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { controller.showingSettings = false } }
            }
        }
        .presentationSizing(.page)
        .sheet(isPresented: editingCss) { CustomCSSSheet(controller: controller) }
        #endif
    }
}

// MARK: general

/// Morrow's "You" section, and on macOS the quick note shortcut from any app.
struct GeneralSettings: View {
    let controller: EditorController

    var body: some View {
        Form { Sections(controller: controller) }
            .formStyle(.grouped)
    }

    struct Sections: View {
        let controller: EditorController
        @State private var name = ""

        private var preferences: AppPreferences { controller.preferences }

        var body: some View {
            Section {
                TextField("Your name", text: $name, prompt: Text("Optional"))
                    .onSubmit(saveName)
                    .onChange(of: name) { _, value in
                        if value.count > AppPreferences.nameLimit { name = String(value.prefix(AppPreferences.nameLimit)) }
                    }
                    .onAppear { name = preferences.name }
                    .onDisappear(perform: saveName)
            } header: {
                Text("You")
            } footer: {
                Text("The home page greets you with it.")
            }
            Section {
                #if os(macOS)
                Toggle("Quick note from any app", isOn: Binding(get: { preferences.quickNoteFromAnyApp }, set: { preferences.quickNoteFromAnyApp = $0 }))
                #else
                Button("New Quick Note", systemImage: "square.and.pencil") {
                    controller.closeSettings { controller.requestQuickNote() }
                }
                #endif
            } header: {
                Text("Quick note")
            } footer: {
                #if os(macOS)
                Text("Press ⌥⌘M in any app, even with SynapseNote in the background, to add a note to the end of today’s note. While this is on, other apps cannot use ⌥⌘M.")
                #else
                Text("Add a note to the end of today’s note with Quick Note in the Shortcuts app or with Siri, or press ⌥⌘M on a keyboard.")
                #endif
            }
        }

        private func saveName() {
            let clean = AppPreferences.clean(name)
            if clean != preferences.name { preferences.name = clean }
        }
    }
}

// MARK: appearance

/// Morrow's appearance section: theme, writing font, page width, accent colour, colourful pages and custom CSS.
struct AppearanceSettings: View {
    let controller: EditorController

    var body: some View {
        Form { Sections(controller: controller) }
            .formStyle(.grouped)
    }

    struct Sections: View {
        @Bindable var preferences: AppPreferences
        let controller: EditorController

        init(controller: EditorController) {
            self.controller = controller
            preferences = controller.preferences
        }

        var body: some View {
            Section("Appearance") {
                Picker("Theme", selection: $preferences.theme) {
                    ForEach(AppPreferences.Theme.allCases) { Text($0.label).tag($0) }
                }
                Picker("Writing font", selection: $preferences.font) {
                    ForEach(AppPreferences.Font.allCases) { Text($0.label).tag($0) }
                }
                Picker("Page width", selection: $preferences.width) {
                    ForEach(AppPreferences.Width.allCases) { Text($0.label).tag($0) }
                }
                LabeledContent("Accent colour") {
                    AccentSwatches(selection: $preferences.accent)
                }
                Toggle(isOn: $preferences.colorful) {
                    Text("Colourful pages")
                    Text("Coloured headings, lists, icons and tags")
                }
                Button {
                    controller.editingCustomCss = true
                } label: {
                    LabeledContent {
                        Text(controller.customCss?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? "On" : "None")
                    } label: {
                        Text("Custom CSS")
                        Text("Restyle the pages, saved in your vault as .morrow/style.css")
                    }
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .disabled(controller.customCss == nil)
            }
        }
    }
}

/// Morrow's eight accent swatches, the chosen one ringed.
private struct AccentSwatches: View {
    @Binding var selection: AppPreferences.Accent
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 8) {
            ForEach(AppPreferences.Accent.allCases) { accent in
                let color = Color(hex: colorScheme == .dark ? accent.swatch.dark : accent.swatch.light)
                Button {
                    selection = accent
                } label: {
                    Circle()
                        .fill(color)
                        .frame(width: 22, height: 22)
                        .padding(3)
                        .overlay {
                            if selection == accent { Circle().strokeBorder(color, lineWidth: 2) }
                        }
                        .contentShape(.circle)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(accent.label)
                .accessibilityAddTraits(selection == accent ? .isSelected : [])
            }
        }
    }
}

/// Morrow's custom CSS editor: shown on the pages as it is typed, saved to the vault, or put back as it was.
struct CustomCSSSheet: View {
    let controller: EditorController
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var saved = ""

    var body: some View {
        NavigationStack {
            TextEditor(text: $text)
                .font(.body.monospaced())
                .autocorrectionDisabled()
                #if os(iOS)
                .textInputAutocapitalization(.never)
                #endif
                .scrollContentBackground(.hidden)
                .padding(8)
                .overlay(alignment: .topLeading) {
                    if text.isEmpty {
                        Text(".page-title { letter-spacing: -0.03em; }\n:root { --accent: #e5484d; }")
                            .font(.body.monospaced())
                            .foregroundStyle(.tertiary)
                            .padding(.horizontal, 13)
                            .padding(.vertical, 16)
                            .allowsHitTesting(false)
                    }
                }
                .onChange(of: text) { _, value in controller.previewCss(value) }
                .navigationTitle("Custom CSS")
                #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
                #endif
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Discard Changes") {
                            controller.previewCss(saved)
                            dismiss()
                        }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            controller.saveCss(text)
                            saved = text
                            dismiss()
                        }
                        .disabled(text == saved)
                    }
                }
        }
        #if os(macOS)
        .frame(minWidth: 520, minHeight: 380)
        #endif
        .onAppear {
            saved = controller.customCss ?? ""
            text = saved
        }
        // closed some other way, the pages show what is saved
        .onDisappear { controller.previewCss(controller.customCss ?? saved) }
    }
}

// MARK: data

/// The vault's images and files, as the editor page counts them.
nonisolated struct FilesSummary: Decodable, Equatable, Sendable {
    let count: Int
    let bytes: Int
    let unused: Int
}

/// Morrow's "Your data" and "Images and files" sections.
struct DataSettings: View {
    let controller: EditorController

    var body: some View {
        Form { Sections(controller: controller) }
            .formStyle(.grouped)
    }

    struct Sections: View {
        let controller: EditorController
        @State private var summary: FilesSummary?

        var body: some View {
            Section {
                if let url = controller.vaultURL {
                    LabeledContent("Vault") {
                        #if os(macOS)
                        Text(url.path(percentEncoded: false))
                            .lineLimit(2)
                            .truncationMode(.middle)
                            .textSelection(.enabled)
                        #else
                        // the sandbox path means nothing on iOS; the Files app shows the folder by its name
                        Text(controller.vaultName ?? url.lastPathComponent)
                        #endif
                    }
                }
                #if os(macOS)
                Button("Show in Finder", systemImage: "folder") { controller.revealVault() }
                    .disabled(controller.vaultURL == nil)
                #endif
                Button("Open Another…", systemImage: "folder.badge.plus") { controller.closeSettings { controller.choosingFolder = true } }
            } header: {
                Text("Your data")
            } footer: {
                Text("Every page is a Markdown file in this folder. Open it in any app, sync it with any tool, or keep it under version control. SynapseNote never sends anything anywhere.")
            }
            Section {
                // each one shows a file dialog, which on iOS waits for the settings sheet to close
                action("Save a backup", "One file with every page, including the trash. SynapseNote can restore it.", "arrow.down.doc") { controller.closeSettings { controller.backup() } }
                action("Restore a backup", "Adds the pages from a backup. Existing pages are never overwritten.", "arrow.up.doc") { controller.closeSettings { controller.restoreBackup() } }
                action("Export as Markdown", "A zip of plain text files, readable by almost any app.", "doc.zipper") { controller.closeSettings { controller.exportAll() } }
                action("Import Markdown", "Turn .md files into pages. Links like [[Page]] are connected.", "square.and.arrow.down") { controller.closeSettings { controller.importMarkdown() } }
            }
            .disabled(controller.phase != .ready)
            Section {
                LabeledContent {
                    Button(summary.map { $0.unused > 0 ? "Remove \($0.unused) unused" : "No unused files" } ?? "Remove unused") {
                        controller.deleteUnusedFiles()
                        Task {
                            // morrow's removal reports in a toast; the count is asked again once it is done
                            try? await Task.sleep(for: .seconds(1))
                            summary = await controller.filesSummary()
                        }
                    }
                    .disabled((summary?.unused ?? 0) == 0)
                } label: {
                    Label(summary.map { "\($0.count) file\($0.count == 1 ? "" : "s"), \(ByteCountFormatter.string(fromByteCount: Int64($0.bytes), countStyle: .file))" } ?? "Counting…", systemImage: "paperclip")
                }
            } header: {
                Text("Images and files")
            } footer: {
                Text("Files stay while any page, trashed page or page version uses them. Backups include them.")
            }
            .task { summary = await controller.filesSummary() }
        }

        private func action(_ title: String, _ detail: String, _ symbol: String, run: @escaping () -> Void) -> some View {
            Button(action: run) {
                Label {
                    Text(title)
                    Text(detail)
                } icon: {
                    Image(systemName: symbol)
                }
            }
        }
    }
}

// MARK: about

/// Morrow's about section, for this app: the version, what it does not have, and the work it is built on.
struct AboutSettings: View {
    @State private var licences = false

    private var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? ""
        let build = info?["CFBundleVersion"] as? String ?? ""
        return build.isEmpty ? short : "\(short) (\(build))"
    }

    var body: some View {
        Form {
            Section {
                LabeledContent("SynapseNote", value: version)
                Text("SynapseNote has no accounts, no tracking, no ads and no AI features, by design.")
            }
            Section {
                Text("SynapseNote is built on Morrow by Aarav Gupta and the Morrow contributors, used under the Apache License 2.0.")
                Link("Morrow on GitHub", destination: URL(string: "https://github.com/Aarav2709/Morrow")!)
                Button("Licences…") { licences = true }
            } header: {
                Text("Built on Morrow")
            }
        }
        .formStyle(.grouped)
        .sheet(isPresented: $licences) { LicencesSheet() }
    }
}

/// The notice, Morrow's licence and the licences of the packages the editor bundles, as the app carries them.
private struct LicencesSheet: View {
    @Environment(\.dismiss) private var dismiss

    private var text: String {
        let resources = Bundle.main.resourceURL
        let files = ["NOTICE", "Morrow-Apache-2.0.txt", "Editor/THIRD_PARTY_LICENSES.txt"]
        return files.compactMap { name in
            resources.flatMap { try? String(contentsOf: $0.appending(path: name), encoding: .utf8) }
        }
        .joined(separator: "\n\n" + String(repeating: "-", count: 72) + "\n\n")
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                Text(text)
                    .font(.caption.monospaced())
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
            }
            .navigationTitle("Licences")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
        #if os(macOS)
        .frame(minWidth: 560, minHeight: 480)
        #endif
    }
}
