import SwiftUI
import UniformTypeIdentifiers
import WebKit

struct ContentView: View {
    @Bindable var controller: EditorController
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
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
        .fileImporter(isPresented: $controller.choosingFolder, allowedContentTypes: [.folder]) { result in
            if case .success(let url) = result { controller.choose(folder: url) }
        }
        .fileImporter(
            isPresented: Binding(get: { controller.fileRequest != nil }, set: { if !$0 { finishFileRequest(nil) } }),
            allowedContentTypes: [.item],
            allowsMultipleSelection: controller.fileRequest?.allowsMultiple ?? false
        ) { result in
            finishFileRequest(try? result.get())
        }
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
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { controller.checkForOutsideChanges() }
            else { Task { await controller.flush() } }
        }
    }

    /// Hidden in focus mode or when the person hid it; otherwise as the system lays it out.
    private var wantedVisibility: NavigationSplitViewVisibility {
        controller.focusMode || controller.sidebarHidden ? .detailOnly : .automatic
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
                    ToolbarItem {
                        Button("Search", systemImage: "magnifyingglass") { controller.showingPalette = true }
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
                // the same items every time: items coming and going rebuild the column, and with it the web view
                ToolbarItem {
                    FocusButton(controller: controller)
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
        .onChange(of: controller.destination) { compactColumn = .detail }
        .onChange(of: wantedVisibility) { columnVisibility = wantedVisibility }
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
                    case .page:
                        EmptyView()
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
            Button("Leave Focus Mode", systemImage: "arrow.down.right.and.arrow.up.left") { controller.focusMode = false }
                .keyboardShortcut(.cancelAction)
        } else {
            Button("Focus Mode", systemImage: "arrow.up.left.and.arrow.down.right") { controller.focusMode = true }
        }
    }
}

private struct SaveStatusView: View {
    let state: EditorController.SaveState

    var body: some View {
        switch state {
        case .saved:
            Label("Saved", systemImage: "checkmark.circle")
                .labelStyle(.titleAndIcon)
                .foregroundStyle(.secondary)
        case .pending, .saving:
            Label("Saving…", systemImage: "arrow.triangle.2.circlepath")
                .labelStyle(.titleAndIcon)
                .foregroundStyle(.secondary)
        case .failed(let message):
            Label("Not saved", systemImage: "exclamationmark.triangle")
                .labelStyle(.titleAndIcon)
                .foregroundStyle(.red)
                .help(message)
                .accessibilityHint(message)
        }
    }
}
