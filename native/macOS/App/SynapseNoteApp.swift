import EditingCore
import SwiftUI

@main
struct SynapseNoteApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .frame(minWidth: 640, minHeight: 480)
        }
    }
}

/// P0 opens a document bundled with the app (or the generated 5,000-line
/// document for `-perfSeconds`); P1 replaces this with the server's documents.
struct ContentView: View {
    @State private var state = LoadState.load()

    var body: some View {
        switch state {
        case .ready(let runtime, let source):
            EditorView(source: source, runtime: runtime) { textView in
                KeystrokeProbe.startIfRequested(textView)
            }
        case .failed(let message):
            ContentUnavailableView("편집기를 시작하지 못했습니다", systemImage: "exclamationmark.triangle", description: Text(message))
        }
    }
}

@MainActor
enum LoadState {
    case ready(EditingRuntime, String)
    case failed(String)

    static func load() -> LoadState {
        do {
            let runtime = try EditingRuntime()
            let source: String
            if KeystrokeProbe.options != nil {
                source = LargeDocument.make(lines: 5000)
            } else if let url = Bundle.main.url(forResource: "sample", withExtension: "md") {
                source = try String(contentsOf: url, encoding: .utf8)
            } else {
                source = ""
            }
            return .ready(runtime, source)
        } catch {
            return .failed(String(describing: error))
        }
    }
}
