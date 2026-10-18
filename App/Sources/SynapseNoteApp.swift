import SwiftUI

@main
struct SynapseNoteApp: App {
    @State private var controller = EditorController()
    #if os(macOS)
    @NSApplicationDelegateAdaptor private var appDelegate: AppDelegate
    #endif

    var body: some Scene {
        // one window: the vault's single editor page cannot be shown in two places at once
        #if os(macOS)
        Window("SynapseNote", id: "main") {
            ContentView(controller: controller)
                .onAppear { appDelegate.controller = controller }
        }
        .defaultSize(width: 1180, height: 780)
        .commands { PageCommands(controller: controller) }
        #else
        WindowGroup {
            ContentView(controller: controller)
        }
        .commands { PageCommands(controller: controller) }
        #endif
    }
}

/// New Page and Move Page to Trash in the File menu, also reachable from a hardware keyboard.
private struct PageCommands: Commands {
    let controller: EditorController

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("New Page") { controller.createPage() }
                .keyboardShortcut("n")
                .disabled(controller.phase != .ready)
            Divider()
            Button("Open Folder…") { controller.choosingFolder = true }
                .keyboardShortcut("o", modifiers: [.command, .shift])
            Menu("Open Recent") {
                ForEach(controller.recents) { vault in
                    Button(vault.name) { controller.open(recent: vault) }
                }
            }
            .disabled(controller.recents.isEmpty)
            #if os(macOS)
            Button("New Folder…") { Task { await controller.createVault() } }
            #endif
            Divider()
            Button("Move Page to Trash") {
                if let selection = controller.selection { controller.trash(selection) }
            }
            .keyboardShortcut(.delete)
            .disabled(controller.phase != .ready || controller.selection == nil)
        }
    }
}

#if os(macOS)
/// Saves edits still waiting before the app quits, giving up after three seconds.
final class AppDelegate: NSObject, NSApplicationDelegate {
    weak var controller: EditorController?

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let controller else { return .terminateNow }
        Task { @MainActor in
            let saved = await withTaskGroup(of: Bool.self) { group in
                group.addTask { await controller.flush() }
                group.addTask {
                    try? await Task.sleep(for: .seconds(3))
                    return false
                }
                let first = await group.next() ?? false
                group.cancelAll()
                return first
            }
            if !saved { NSLog("SynapseNote quit before every change was saved") }
            sender.reply(toApplicationShouldTerminate: true)
        }
        return .terminateLater
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}
#endif
