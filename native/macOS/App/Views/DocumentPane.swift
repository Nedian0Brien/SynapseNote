import EditingCore
import SwiftUI
import SyncCore

/// One open document: the editor and its sync state.
struct DocumentPane: View {
    let documentName: String
    @State private var controller: DocumentController

    init(documentName: String, collabURL: URL, runtime: EditingRuntime, openDocument: @escaping (String) -> Void) {
        self.documentName = documentName
        let controller = DocumentController(documentName: documentName, collabURL: collabURL, runtime: runtime)
        controller.onOpenDocument = openDocument
        _controller = State(initialValue: controller)
    }

    var body: some View {
        ZStack {
            EditorView(controller: controller)
                .opacity(controller.loaded ? 1 : 0)
            if !controller.loaded {
                ProgressView("문서를 불러오는 중")
            }
        }
        .navigationTitle(documentName.split(separator: "/").last.map(String.init) ?? documentName)
        .navigationSubtitle(status)
        .onDisappear { controller.close() }
    }

    private var status: String {
        switch controller.state {
        case .connecting: "연결 중"
        case .synced: "동기화됨"
        case .offline: "오프라인 · 다시 연결하는 중"
        }
    }
}
