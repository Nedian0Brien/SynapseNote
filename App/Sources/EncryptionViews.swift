import SwiftUI

/// Encrypt with a password, as Morrow's `EncryptDialog`: a password of at least eight characters, typed twice.
struct EncryptSheet: View {
    let controller: EditorController
    let pageId: String
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var repeated = ""
    @State private var busy = false
    @State private var failure: String?
    @State private var done: String?

    static let minimumLength = 8

    private var title: String { controller.workspace.infos[pageId]?.displayTitle ?? "Untitled" }
    private var tooShort: Bool { password.count < Self.minimumLength }
    private var mismatch: Bool { !repeated.isEmpty && repeated != password }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    SecureField("Password", text: $password)
                        .textContentType(.newPassword)
                    SecureField("Repeat it", text: $repeated)
                        .textContentType(.newPassword)
                        .onSubmit(submit)
                } footer: {
                    VStack(alignment: .leading, spacing: 6) {
                        if !password.isEmpty && tooShort {
                            Text("Use at least \(Self.minimumLength) characters.").foregroundStyle(.red)
                        }
                        if mismatch { Text("The two passwords are different.").foregroundStyle(.red) }
                        if let failure { Text(failure).foregroundStyle(.red) }
                        Text("The page’s file is encrypted with AES-256. SynapseNote keeps no copy of the password and no plain version in page history. **If you forget the password, the page cannot be recovered.**")
                    }
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Encrypt “\(title)”")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Encrypting…" : "Encrypt", action: submit)
                        .disabled(tooShort || password != repeated || busy)
                }
            }
            .alert("Encrypted", isPresented: Binding(get: { done != nil }, set: { if !$0 { dismiss() } })) {
                Button("OK") { dismiss() }
            } message: {
                Text(done ?? "")
            }
        }
        #if os(macOS)
        .frame(minWidth: 420, minHeight: 320)
        #endif
    }

    private func submit() {
        guard !tooShort, password == repeated, !busy else { return }
        busy = true
        failure = nil
        Task {
            let error = await controller.encrypt(pageId, password: password)
            busy = false
            if let error {
                failure = error
            } else {
                password = ""
                repeated = ""
                done = "“\(title)” is encrypted. Its file on disk can only be read with the password."
            }
        }
    }
}

/// A locked encrypted page asks for its password, as Morrow's `LockedPage`.
struct UnlockView: View {
    let controller: EditorController
    let pageId: String
    @State private var password = ""
    @State private var failure: String?
    @State private var busy = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "lock")
                .font(.system(size: 36, weight: .light))
                .foregroundStyle(.secondary)
            Text(controller.workspace.infos[pageId]?.displayTitle ?? "Untitled")
                .font(.title2.weight(.semibold))
            Text("This page is encrypted. Enter its password to read it.")
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            HStack {
                SecureField("Password", text: $password)
                    .textContentType(.password)
                    .textFieldStyle(.roundedBorder)
                    .focused($focused)
                    .onSubmit(unlock)
                    .frame(maxWidth: 280)
                Button(busy ? "Unlocking…" : "Unlock", action: unlock)
                    .buttonStyle(.borderedProminent)
                    .disabled(password.isEmpty || busy)
            }
            if let failure {
                Text(failure).foregroundStyle(.red).font(.callout)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.background)
        .onAppear { focused = true }
        .onChange(of: pageId) {
            password = ""
            failure = nil
        }
    }

    private func unlock() {
        guard !password.isEmpty, !busy else { return }
        busy = true
        Task {
            let error = await controller.unlock(pageId, password: password)
            busy = false
            if let error {
                failure = error
                password = ""
            }
        }
    }
}
