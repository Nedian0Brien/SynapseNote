import SwiftUI

/// Morrow's sync settings (`SyncSettings.tsx`): turning sync on, this device's name, the paired devices with
/// Sync now, Copy its vault here and Forget, and pairing another one.
struct SyncSettingsView: View {
    let controller: EditorController
    @State private var name = ""
    @State private var pairing = false

    private var sync: SyncService { controller.sync }

    var body: some View {
        Form {
            Section {
                Toggle("Sync on this network", isOn: Binding(get: { sync.config.enabled }, set: { on in Task { await sync.setEnabled(on) } }))
                LabeledContent("This device is called") {
                    TextField("Name", text: $name)
                        .multilineTextAlignment(.trailing)
                        .onSubmit { sync.setName(name) }
                }
            } header: {
                Text("Sync between your devices")
            } footer: {
                Text("Keeps this vault the same on your own devices while they are on the same network. Nothing goes through a server and every transfer is encrypted. When a page changed on both, both versions are kept.")
            }
            if !sync.peers.isEmpty {
                Section("Paired devices") {
                    ForEach(sync.peers) { peer in
                        PeerRow(controller: controller, peer: peer)
                    }
                }
            }
            Section {
                Button("Pair a Device…", systemImage: "link") { pairing = true }
            }
        }
        .formStyle(.grouped)
        .onAppear {
            name = sync.config.name
            sync.refresh()
        }
        .onDisappear {
            if name != sync.config.name { sync.setName(name) }
        }
        .sheet(isPresented: $pairing) { PairSheet(sync: sync) }
    }
}

private struct PeerRow: View {
    let controller: EditorController
    let peer: SyncService.PeerStatus

    private var sync: SyncService { controller.sync }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "laptopcomputer.and.iphone")
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(peer.name)
                Label(status, systemImage: peer.online ? "wifi" : "wifi.slash")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if sync.busyPeer == peer.id {
                ProgressView().controlSize(.small)
            }
            Button("Sync Now") { Task { await sync.syncNow(peer.id) } }
                .disabled(!peer.reachable || !sync.config.enabled || sync.busyPeer != nil)
            Menu {
                Button("Copy Its Vault Here…", systemImage: "square.and.arrow.down.on.square") { controller.copyVault(from: peer.id) }
                    .disabled(!peer.reachable || !sync.config.enabled)
                Button("Forget \(peer.name)", systemImage: "trash", role: .destructive) { sync.forget(peer.id) }
            } label: {
                Label("More", systemImage: "ellipsis.circle")
            }
            .labelStyle(.iconOnly)
            .menuIndicator(.hidden)
            .fixedSize()
        }
    }

    /// Morrow's line under the name: on this network or not, and when it last synced.
    private var status: String {
        let place = peer.online ? "On this network" : "Not seen lately"
        guard let last = peer.lastSync else { return "\(place) · never synced" }
        return "\(place) · synced \(last.formatted(.relative(presentation: .named)))"
    }
}

/// Morrow's pair dialog: this device's code for the other one to type, or a device showing a code, found on
/// the network or typed in by its address.
struct PairSheet: View {
    let sync: SyncService
    @Environment(\.dismiss) private var dismiss
    @State private var target: SyncService.Waiting?
    @State private var address = ""
    @State private var code = ""
    @State private var error: String?
    @State private var busy = false
    @State private var pairedCount = 0

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(sync.pairingCode ?? "…")
                        .font(.system(.title, design: .monospaced).weight(.semibold))
                        .textSelection(.enabled)
                        .accessibilityLabel("Pairing code \(sync.pairingCode ?? "")")
                } header: {
                    Text("On the other device, enter this code")
                } footer: {
                    Text("Open the sync settings there, choose Pair a Device, pick this one and type the code. It works for ten minutes.")
                }
                Section {
                    if sync.waiting.isEmpty {
                        Text("Looking for devices showing a code… If yours does not appear, type its address.")
                            .foregroundStyle(.secondary)
                    } else {
                        Picker("Device", selection: $target) {
                            Text("Type an address").tag(SyncService.Waiting?.none)
                            ForEach(sync.waiting) { item in
                                Text(item.name).tag(Optional(item))
                            }
                        }
                        .pickerStyle(.inline)
                        .labelsHidden()
                    }
                    if target == nil {
                        TextField("Address, like 192.168.1.20", text: $address)
                            .textContentType(.URL)
                            #if os(iOS)
                            .keyboardType(.numbersAndPunctuation)
                            .textInputAutocapitalization(.never)
                            #endif
                            .autocorrectionDisabled()
                    }
                    TextField("XXXX-XXXX-XXXX-XXXX", text: $code)
                        .font(.body.monospaced())
                        .autocorrectionDisabled()
                        #if os(iOS)
                        .textInputAutocapitalization(.characters)
                        #endif
                        .onSubmit(pair)
                        .accessibilityLabel("Code shown on the other device")
                    if let error {
                        Text(error).foregroundStyle(.red)
                    }
                } header: {
                    Text("Or pair with a device showing a code")
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Pair a Device")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Pairing…" : "Pair", action: pair)
                        .disabled(busy || code.trimmingCharacters(in: .whitespaces).isEmpty || (target == nil && address.trimmingCharacters(in: .whitespaces).isEmpty))
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 460, minHeight: 440)
        #endif
        .task {
            pairedCount = sync.config.peers.count
            await sync.startPairing()
        }
        .onDisappear { Task { await sync.stopPairing() } }
        // the other device typed this one's code: pairing is done
        .onChange(of: sync.config.peers.count) { _, count in
            if count > pairedCount, sync.pairingCode == nil { dismiss() }
        }
    }

    private func pair() {
        let chosen: (id: String?, address: String, port: UInt16?)
        if let target {
            chosen = (target.id, target.address, target.port)
        } else {
            let typed = address.trimmingCharacters(in: .whitespaces)
            guard !typed.isEmpty else { return }
            chosen = (nil, typed, nil)
        }
        guard !code.trimmingCharacters(in: .whitespaces).isEmpty, !busy else { return }
        busy = true
        error = nil
        Task {
            let result = await sync.pair(with: chosen, code: code)
            busy = false
            if result.ok {
                sync.notify("Paired with \(result.name ?? "the other device"). Turn on sync there too, then press Sync Now.", false)
                dismiss()
            } else {
                error = result.error ?? "Pairing failed."
            }
        }
    }
}
