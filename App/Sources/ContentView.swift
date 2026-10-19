import SwiftUI
import UniformTypeIdentifiers
import WebKit

struct ContentView: View {
    @Bindable var controller: EditorController
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    #if os(macOS)
    @Environment(\.openSettings) private var openSettings
    #endif
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    #endif
    /// On iPhone the split view shows one column; choosing a page or the trash moves to the detail column.
    @State private var compactColumn = NavigationSplitViewColumn.detail
    @State private var columnVisibility = NavigationSplitViewVisibility.automatic

    var body: some View {
        Group {
            switch controller.phase {
            case .choosing(let reason):
                VaultChooserView(
                    reason: reason,
                    recents: controller.recents,
                    onOpen: { controller.choosingFolder = true },
                    onCreate: { Task { await controller.createVault() } },
                    onRecent: { controller.open(recent: $0) }
                )
            case .opening, .ready:
                workspace
            }
        }
        .fileImporter(
            isPresented: $controller.choosingFolder,
            allowedContentTypes: [.folder],
            allowsMultipleSelection: false,
            onCompletion: { result in
                if case .success(let urls) = result, let url = urls.first { controller.choose(folder: url) } else { controller.cancelVaultCopy() }
            },
            onCancellation: { controller.cancelVaultCopy() }
        )
        // the picker is answered from its completion and cancellation alone: the binding is set to false before
        // the completion runs, and answering there would hand the page a cancel in place of the picked files
        .fileImporter(
            isPresented: Binding(get: { controller.fileRequest != nil }, set: { _ in }),
            allowedContentTypes: [.item],
            allowsMultipleSelection: controller.fileRequest?.allowsMultiple ?? false,
            onCompletion: { result in finishFileRequest(try? result.get()) },
            onCancellation: { finishFileRequest(nil) }
        )
        #if os(iOS)
        // its own view: file dialogs on the same view as the two importers above stop the window taking touches
        .background { ExportSheet(controller: controller) }
        #endif
        .overlay(alignment: .bottom) { ToastOverlay(controller: controller) }
        #if os(iOS)
        .sheet(isPresented: $controller.showingSettings, onDismiss: { controller.settingsClosed() }) {
            SettingsView(controller: controller)
        }
        .sheet(isPresented: $controller.showingSyncSettings, onDismiss: { controller.settingsClosed() }) {
            NavigationStack {
                SyncSettingsView(controller: controller)
                    .navigationTitle("Sync")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) { Button("Done") { controller.showingSyncSettings = false } }
                    }
            }
        }
        #else
        .onChange(of: controller.showingSyncSettings) { _, shown in
            guard shown else { return }
            controller.showingSyncSettings = false
            openSettings()
        }
        .onChange(of: controller.showingSettings) { _, shown in
            guard shown else { return }
            controller.showingSettings = false
            openSettings()
        }
        #endif
        .sheet(isPresented: $controller.showingQuickNote) { QuickNoteSheet(controller: controller) }
        .sheet(isPresented: Binding(get: { controller.iconPage != nil }, set: { if !$0 { controller.iconPage = nil } })) {
            if let pageId = controller.iconPage {
                EmojiPickerView(current: controller.workspace.infos[pageId]?.icon) { icon in
                    controller.perform(.setIcon(id: pageId, icon: icon))
                }
            }
        }
        .sheet(isPresented: Binding(get: { controller.movingPage != nil }, set: { if !$0 { controller.movingPage = nil } })) {
            if let pageId = controller.movingPage {
                MoveSheet(workspace: controller.workspace, pageId: pageId) { parent in
                    controller.perform(.move(id: pageId, parent: parent, index: nil))
                }
            }
        }
        .onAppear {
            controller.openURL = { url in openURL(url) }
            controller.setDarkMode(colorScheme == .dark)
        }
        .onChange(of: colorScheme) { _, scheme in controller.setDarkMode(scheme == .dark) }
        #if os(iOS)
        // the theme chosen in the settings; macOS sets it for the whole app in AppPreferences
        .preferredColorScheme(controller.preferences.colorScheme)
        #endif
        // synapsenote://capture, from a shortcut or another app
        .onOpenURL { url in
            if AppLink(url) == .capture { controller.requestQuickNote() }
        }
        // the quick note intent and the macOS shortcut from any app
        .onChange(of: QuickNoteRequests.shared.pending, initial: true) { _, pending in
            if pending, QuickNoteRequests.shared.take() { controller.requestQuickNote() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { controller.checkForOutsideChanges() }
            else { Task { await controller.flush() } }
        }
    }

    private var inspectorShown: Binding<Bool> {
        Binding {
            controller.showingInspector && !controller.focusMode && controller.selection != nil
        } set: { shown in
            if !controller.focusMode { controller.showingInspector = shown }
        }
    }

    /// Tabs show once a second one is open, on screens wide enough for them.
    private var showsTabStrip: Bool {
        guard controller.tabs.tabs.count > 1, !controller.focusMode else { return false }
        #if os(iOS)
        return horizontalSizeClass == .regular
        #else
        return true
        #endif
    }

    private var workspace: some View {
        NavigationSplitView(columnVisibility: $columnVisibility, preferredCompactColumn: $compactColumn) {
            Sidebar(controller: controller)
                .navigationTitle(controller.vaultName ?? "SynapseNote")
                .navigationSplitViewColumnWidth(min: 200, ideal: 250, max: 400)
                .toolbar {
                    ToolbarItem {
                        Button("New Page", systemImage: "square.and.pencil") { controller.createPage() }
                            .disabled(controller.phase != .ready)
                    }
                    #if os(iOS)
                    ToolbarItem(placement: .topBarLeading) { VaultMenu(controller: controller) }
                    #endif
                }
        } detail: {
            page
                .safeAreaInset(edge: .top, spacing: 0) {
                    if showsTabStrip {
                        VStack(spacing: 0) {
                            TabStrip(controller: controller)
                            Divider()
                        }
                    }
                }
            .inspector(isPresented: inspectorShown) {
                if let pageId = controller.selection {
                    PageInspector(controller: controller, pageId: pageId)
                        .inspectorColumnWidth(min: 220, ideal: 280, max: 420)
                }
            }
            .toolbar {
                // at the top on iOS: the bottom of the page is where the editor's notices appear
                #if os(iOS)
                ToolbarItem(placement: .topBarTrailing) { SaveStatusView(state: controller.saveState) }
                #else
                ToolbarItem(placement: .status) { SaveStatusView(state: controller.saveState) }
                #endif
                // the same items every time: items coming and going rebuild the column, and with it the web view;
                // search sits with the main column so it is there when the sidebar is hidden
                ToolbarItem {
                    Button("Search", systemImage: "magnifyingglass") { controller.showingPalette = true }
                        .disabled(controller.phase != .ready)
                }
                ToolbarItem {
                    FocusButton(controller: controller)
                }
                ToolbarItem {
                    Menu {
                        PageActionItems(controller: controller, takesShortcuts: false)
                    } label: {
                        Label("Page Menu", systemImage: "ellipsis.circle")
                    }
                    .menuIndicator(.hidden)
                    .disabled(controller.selection == nil)
                }
                ToolbarItem {
                    Button(controller.showingInspector ? "Hide Inspector" : "Show Inspector", systemImage: "sidebar.right") {
                        controller.showingInspector.toggle()
                    }
                    .disabled(controller.selection == nil || controller.focusMode)
                }
            }
        }
        .overlay {
            if controller.showingPalette { CommandPalette(controller: controller) }
        }
        .sheet(isPresented: $controller.showingShortcuts) { ShortcutsView(controller: controller) }
        .sheet(isPresented: $controller.choosingTemplate) { TemplatePicker(controller: controller, parent: nil) }
        .sheet(isPresented: Binding(get: { controller.encryptingPage != nil }, set: { if !$0 { controller.encryptingPage = nil } })) {
            if let pageId = controller.encryptingPage { EncryptSheet(controller: controller, pageId: pageId) }
        }
        .onChange(of: controller.destination) { compactColumn = .detail }
        .onChange(of: controller.detailRequests) { compactColumn = .detail }
        // the split view's own button and gestures set the visibility; focus mode and the sidebar command set
        // it only when they change, so the two never undo each other
        .onChange(of: controller.focusMode) {
            columnVisibility = controller.focusMode || controller.sidebarHidden ? .detailOnly : .automatic
        }
        .onChange(of: controller.sidebarHidden) {
            guard !controller.focusMode, (columnVisibility == .detailOnly) != controller.sidebarHidden else { return }
            columnVisibility = controller.sidebarHidden ? .detailOnly : .all
        }
        .onChange(of: columnVisibility) {
            if !controller.focusMode { controller.sidebarHidden = columnVisibility == .detailOnly }
        }
    }

    private var page: some View {
        // the web view stays fully visible: WebKit stops painting a page it starts out hidden
        WebView(controller.page)
            .ignoresSafeArea(.container, edges: .bottom)
            .overlay {
                if controller.phase != .ready {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(.background)
                } else {
                    switch controller.destination {
                    case .home:
                        HomeView(controller: controller)
                            .background(.background)
                    case .trash:
                        TrashView(controller: controller)
                            .background(.background)
                    case .tasks:
                        TasksView(controller: controller)
                            .background(.background)
                    case .tags:
                        TagsView(controller: controller)
                            .background(.background)
                    case .tag(let tag):
                        TagView(controller: controller, tag: tag)
                            .background(.background)
                    case .graph(let focus):
                        GraphView(controller: controller, focus: focus)
                    case .review:
                        ReviewView(controller: controller)
                            .background(.background)
                    case .page(let id):
                        if controller.workspace.locked.contains(id) {
                            UnlockView(controller: controller, pageId: id)
                        }
                    }
                }
            }
    }

    private func finishFileRequest(_ urls: [URL]?) {
        guard let request = controller.fileRequest else { return }
        controller.fileRequest = nil
        request.continuation.resume(returning: urls)
    }
}

/// Switches vaults on iOS and iPadOS, where there is no File menu.
private struct VaultMenu: View {
    let controller: EditorController

    var body: some View {
        Menu {
            Section("Recent") {
                ForEach(controller.recents) { vault in
                    Button(vault.name) { controller.open(recent: vault) }
                }
            }
            Button("Open Folder…", systemImage: "folder") { controller.choosingFolder = true }
            Button("New Folder on This Device", systemImage: "folder.badge.plus") { Task { await controller.createVault() } }
            Divider()
            Button("Sync…", systemImage: "arrow.triangle.2.circlepath") { controller.showingSyncSettings = true }
            Button("Settings…", systemImage: "gearshape") { controller.showingSettings = true }
        } label: {
            Label("Vaults", systemImage: "books.vertical")
        }
    }
}

/// Enters focus mode, or leaves it with the button or escape.
private struct FocusButton: View {
    let controller: EditorController

    var body: some View {
        if controller.focusMode {
            // escape closes the palette first, as in morrow
            Button("Leave Focus Mode", systemImage: "arrow.down.right.and.arrow.up.left") { controller.focusMode = false }
                .keyboardShortcut(.cancelAction)
                .disabled(controller.showingPalette)
        } else {
            Button("Focus Mode", systemImage: "arrow.up.left.and.arrow.down.right") { controller.focusMode = true }
        }
    }
}

private struct SaveStatusView: View {
    let state: EditorController.SaveState
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    #endif

    /// On an iPhone the toolbar has room for the symbol only; the words stay for VoiceOver.
    private var style: some LabelStyle {
        #if os(iOS)
        return horizontalSizeClass == .compact ? AnyLabelStyle.iconOnly : AnyLabelStyle.titleAndIcon
        #else
        return AnyLabelStyle.titleAndIcon
        #endif
    }

    var body: some View {
        switch state {
        case .saved:
            Label("Saved", systemImage: "checkmark.circle")
                .labelStyle(style)
                .foregroundStyle(.secondary)
        case .pending, .saving:
            Label("Saving…", systemImage: "arrow.triangle.2.circlepath")
                .labelStyle(style)
                .foregroundStyle(.secondary)
        case .failed(let message):
            Label("Not saved", systemImage: "exclamationmark.triangle")
                .labelStyle(style)
                .foregroundStyle(.red)
                .help(message)
                .accessibilityHint(message)
        }
    }
}

/// Either of the two label styles the save status uses.
private enum AnyLabelStyle: LabelStyle {
    case iconOnly, titleAndIcon

    func makeBody(configuration: Configuration) -> some View {
        switch self {
        case .iconOnly: Label(configuration).labelStyle(.iconOnly)
        case .titleAndIcon: Label(configuration).labelStyle(.titleAndIcon)
        }
    }
}

#if os(iOS)
/// The system's save sheet for a file Morrow saves, such as an export.
private struct ExportSheet: View {
    let controller: EditorController

    var body: some View {
        Color.clear
            .fileExporter(
                isPresented: Binding(get: { controller.exportFile != nil }, set: { if !$0 { controller.exportFile = nil } }),
                document: controller.exportFile.map { ExportDocument(data: $0.data) },
                contentType: controller.exportFile?.contentType ?? .data,
                defaultFilename: controller.exportFile?.name
            ) { [file = controller.exportFile] result in
                switch result {
                case .success(let url): controller.finishExport(file, savedAs: url.lastPathComponent)
                case .failure(let error): controller.finishExport(file, savedAs: nil, error: error)
                }
            }
    }
}
#endif
