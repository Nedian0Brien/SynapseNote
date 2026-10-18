import SwiftUI
import WebKit

struct ContentView: View {
    @State private var controller = EditorController.bundled()
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationSplitView {
            PageList(rows: controller.workspace.rows, selection: $controller.selection)
                .navigationTitle("SynapseNote")
        } detail: {
            if let error = controller.loadError {
                ContentUnavailableView("Pages unavailable", systemImage: "exclamationmark.triangle", description: Text(error))
            } else {
                // the web view stays fully visible: WebKit stops painting a page it starts out hidden
                WebView(controller.page)
                    .ignoresSafeArea(.container, edges: .bottom)
                    .overlay {
                        if !controller.isReady {
                            ProgressView()
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .background(.background)
                        }
                    }
            }
        }
        .onAppear {
            controller.openURL = { url in openURL(url) }
            controller.setDarkMode(colorScheme == .dark)
            controller.start()
        }
        .onChange(of: colorScheme) { _, scheme in controller.setDarkMode(scheme == .dark) }
        .onChange(of: controller.selection) { controller.showSelection() }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { controller.flush() }
        }
    }
}

private struct PageList: View {
    let rows: [Workspace.Row]
    @Binding var selection: String?

    var body: some View {
        List(rows, selection: $selection) { row in
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
        }
    }
}
