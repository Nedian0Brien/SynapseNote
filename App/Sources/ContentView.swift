import SwiftUI
import UniformTypeIdentifiers
import WebKit

struct ContentView: View {
    @Bindable var controller: EditorController
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @State private var pickingFolder = false

    var body: some View {
        Group {
            switch controller.phase {
            case .choosing(let reason):
                VaultChooserView(reason: reason, onOpen: { pickingFolder = true }, onCreate: { Task { await controller.createVault() } })
            case .opening, .ready:
                workspace
            }
        }
        .fileImporter(isPresented: $pickingFolder, allowedContentTypes: [.folder]) { result in
            if case .success(let url) = result { controller.choose(folder: url) }
        }
        .fileImporter(
            isPresented: Binding(get: { controller.fileRequest != nil }, set: { if !$0 { finishFileRequest(nil) } }),
            allowedContentTypes: [.item],
            allowsMultipleSelection: controller.fileRequest?.allowsMultiple ?? false
        ) { result in
            finishFileRequest(try? result.get())
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
            PageList(controller: controller)
                .navigationTitle(controller.vaultName ?? "SynapseNote")
                .toolbar {
                    ToolbarItem {
                        Button("New Page", systemImage: "square.and.pencil") { controller.createPage() }
                            .disabled(controller.phase != .ready)
                    }
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

private struct PageList: View {
    @Bindable var controller: EditorController

    var body: some View {
        List(controller.workspace.rows, selection: $controller.selection) { row in
            Label {
                Text(row.title).lineLimit(1)
            } icon: {
                if let icon = row.icon {
                    Text(icon)
                } else {
                    Image(systemName: "doc.text")
                }
            }
            .padding(.leading, CGFloat(row.depth) * 14)
            .tag(row.id)
            .contextMenu {
                Button("New Subpage", systemImage: "plus") { controller.createPage(parent: row.id) }
                Button("Move to Trash", systemImage: "trash", role: .destructive) { controller.trash(row.id) }
            }
        }
        .overlay {
            if controller.phase == .ready && controller.workspace.rows.isEmpty {
                ContentUnavailableView {
                    Label("No pages yet", systemImage: "doc.text")
                } actions: {
                    Button("New Page") { controller.createPage() }
                }
            }
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
