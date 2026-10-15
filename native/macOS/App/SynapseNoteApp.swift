import EditingCore
import SwiftUI

@main
struct SynapseNoteApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            if KeystrokeProbe.options != nil {
                ProbeView(runtime: model.runtime)
            } else {
                MainView(model: model)
                    .frame(minWidth: 760, minHeight: 480)
            }
        }
        .commands { EditorCommands() }

        Settings {
            ServerConnectView(model: model)
                .frame(width: 520)
        }
    }
}

/// `-perfSeconds N`: measure keystrokes on a generated 5,000-line document without a server.
private struct ProbeView: View {
    let runtime: EditingRuntime?

    var body: some View {
        if let runtime {
            EditorView(controller: DocumentController(localSource: LargeDocument.make(lines: 5000), runtime: runtime)) { textView in
                KeystrokeProbe.startIfRequested(textView)
            }
        } else {
            Text("편집기를 시작하지 못했습니다")
        }
    }
}
