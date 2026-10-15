import SwiftUI

/// Server address entry, shown in the window until a server answers and in Settings.
struct ServerConnectView: View {
    @Bindable var model: AppModel
    @State private var address = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("SynapseNote 서버").font(.title2.bold())
            Text("문서와 에이전트가 있는 서버의 주소를 입력합니다. 이 맥에서 띄운 서버는 `localhost:<포트>`입니다.")
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            HStack {
                TextField("localhost:5173", text: $address)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit(connect)
                Button("연결", action: connect)
                    .keyboardShortcut(.defaultAction)
                    .disabled(address.trimmingCharacters(in: .whitespaces).isEmpty || model.connection == .checking)
            }
            switch model.connection {
            case .checking:
                ProgressView().controlSize(.small)
            case .failed(let message):
                Text(message).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true)
            case .connected:
                Label("연결됨: \(model.serverAddress)", systemImage: "checkmark.circle").foregroundStyle(.green)
            case .notConfigured:
                EmptyView()
            }
        }
        .padding(28)
        .frame(maxWidth: 520)
        .onAppear { address = model.serverAddress }
    }

    private func connect() {
        let value = address
        Task { await model.connect(to: value) }
    }
}
