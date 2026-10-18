import SwiftUI

/// The first screen: open an existing notes folder or make a new one.
struct VaultChooserView: View {
    let reason: String?
    var recents: [VaultLocation.RecentVault] = []
    let onOpen: () -> Void
    let onCreate: () -> Void
    var onRecent: (VaultLocation.RecentVault) -> Void = { _ in }

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "folder")
                .font(.system(size: 44, weight: .light))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            VStack(spacing: 8) {
                Text("Your notes live in a folder")
                    .font(.title2.weight(.semibold))
                Text("Every page is a Markdown file in a folder you choose. Open an existing folder, such as an Obsidian vault, or start a new one.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 420)
            }
            if let reason {
                Label(reason, systemImage: "exclamationmark.triangle")
                    .font(.callout)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 420)
            }
            HStack(spacing: 12) {
                Button("Open Folder…", action: onOpen)
                    .buttonStyle(.borderedProminent)
                Button(newFolderLabel, action: onCreate)
                    .buttonStyle(.bordered)
            }
            .controlSize(.large)
            if !recents.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Recent").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    ForEach(recents) { vault in
                        Button {
                            onRecent(vault)
                        } label: {
                            Label(vault.name, systemImage: "folder")
                        }
                        .buttonStyle(.plain)
                    }
                }
                .frame(maxWidth: 320, alignment: .leading)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var newFolderLabel: String {
        #if os(macOS)
        "New Folder…"
        #else
        "New Folder on This Device"
        #endif
    }
}
