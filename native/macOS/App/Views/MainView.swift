import SwiftUI

/// The window: the content tree beside the open document.
struct MainView: View {
    @Bindable var model: AppModel
    @State private var newItem: NewItemKind?

    var body: some View {
        NavigationSplitView {
            SidebarView(model: model)
                .navigationSplitViewColumnWidth(min: 200, ideal: 260)
        } detail: {
            detail
        }
        .task { await model.start() }
        .onChange(of: model.selectedDocument) { model.publishCurrentView() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            model.publishCurrentView()
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didResignActiveNotification)) { _ in
            model.publishCurrentView()
        }
        .focusedSceneValue(\.newItemAction) { newItem = $0 }
        .sheet(item: $newItem) { kind in
            NewItemSheet(kind: kind, folder: model.targetFolder) { name in
                Task {
                    switch kind {
                    case .document: await model.createDocument(named: name)
                    case .folder: await model.createFolder(named: name)
                    }
                }
            }
        }
        .alert("작업을 마치지 못했습니다", isPresented: Binding(get: { model.lastError != nil }, set: { if !$0 { model.lastError = nil } })) {
            Button("확인") { model.lastError = nil }
        } message: {
            Text(model.lastError ?? "")
        }
    }

    @ViewBuilder private var detail: some View {
        if let error = model.runtimeError {
            ContentUnavailableView("편집기를 시작하지 못했습니다", systemImage: "exclamationmark.triangle", description: Text(error))
        } else if model.connection != .connected {
            ServerConnectView(model: model)
        } else if let docName = model.selectedDocument, let client = model.client, let runtime = model.runtime {
            DocumentPane(documentName: docName, collabURL: client.collabURL, runtime: runtime) { name in
                Task { await model.openDocument(named: name) }
            }
            .id(docName)
        } else {
            ContentUnavailableView("문서를 고르세요", systemImage: "doc.text", description: Text("왼쪽 목록에서 문서를 열거나 ⌘N으로 새 문서를 만듭니다."))
        }
    }
}

enum NewItemKind: String, Identifiable {
    case document, folder
    var id: String { rawValue }
}

struct NewItemActionKey: FocusedValueKey {
    typealias Value = (NewItemKind) -> Void
}

extension FocusedValues {
    var newItemAction: NewItemActionKey.Value? {
        get { self[NewItemActionKey.self] }
        set { self[NewItemActionKey.self] = newValue }
    }
}

/// Name a new document or folder; it is created in the open document's folder.
struct NewItemSheet: View {
    let kind: NewItemKind
    let folder: String
    let onCreate: (String) -> Void
    @State private var name = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            TextField(kind == .document ? "문서 이름" : "폴더 이름", text: $name)
                .onSubmit(create)
            Text(folder.isEmpty ? "위치: 최상위" : "위치: \(folder)")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .formStyle(.grouped)
        .frame(width: 360)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("만들기", action: create).disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .navigationTitle(kind == .document ? "새 문서" : "새 폴더")
    }

    private func create() {
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        onCreate(name)
        dismiss()
    }
}
