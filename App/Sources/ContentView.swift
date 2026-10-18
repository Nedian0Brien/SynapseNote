import SwiftUI
import UniformTypeIdentifiers
import WebKit

struct ContentView: View {
    @Bindable var controller: EditorController
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase

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

    private var workspace: some View {
        NavigationSplitView {
            Sidebar(controller: controller)
                .navigationTitle(controller.vaultName ?? "SynapseNote")
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
            // the web view stays fully visible: WebKit stops painting a page it starts out hidden
            WebView(controller.page)
                .ignoresSafeArea(.container, edges: .bottom)
                .overlay {
                    if controller.phase != .ready {
                        ProgressView()
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .background(.background)
                    } else if controller.showingTrash {
                        NavigationStack { TrashView(controller: controller) }
                            .background(.background)
                    } else if controller.selection == nil {
                        ContentUnavailableView("No page selected", systemImage: "doc.text", description: Text("Choose a page or make a new one."))
                            .background(.background)
                    }
                }
                .toolbar {
                    ToolbarItem(placement: .status) { SaveStatusView(state: controller.saveState) }
                }
        }
        .onChange(of: controller.selection) { controller.showSelection() }
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
