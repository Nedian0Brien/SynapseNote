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
                .onAppear {
                    appDelegate.controller = controller
                    controller.preferences.applyTheme()
                }
                .onChange(of: controller.preferences.quickNoteFromAnyApp, initial: true) { _, on in
                    appDelegate.quickNoteFromAnyApp(on)
                }
        }
        .defaultSize(width: 1180, height: 780)
        .commands { PageCommands(controller: controller) }

        Settings {
            SettingsView(controller: controller)
        }
        #else
        WindowGroup {
            ContentView(controller: controller)
        }
        .commands { PageCommands(controller: controller) }
        #endif
    }
}

/// The app's menus, built from `AppAction`, also reachable from a hardware keyboard.
private struct PageCommands: Commands {
    let controller: EditorController

    private func item(_ id: String) -> ActionButton {
        ActionButton(action: .named(id), controller: controller)
    }

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            item("page.new")
            item("page.newDatabase")
            item("page.newCanvas")
            item("page.newSubpage")
            item("page.fromTemplate")
            item("capture")
            item("tab.new")
            Divider()
            item("vault.open")
            Menu("Open Recent") {
                ForEach(controller.recents) { vault in
                    Button(vault.name) { controller.open(recent: vault) }
                }
            }
            .disabled(controller.recents.isEmpty)
            #if os(macOS)
            Button("New Folder…") { Task { await controller.createVault() } }
            item("vault.reveal")
            #endif
        }
        // macOS puts Close here; with more than one tab the key closes a tab, with one it closes the window
        CommandGroup(replacing: .saveItem) {
            #if os(macOS)
            // decided when pressed: the menu bar does not always rebuild when the number of tabs changes
            Button(controller.tabs.tabs.count > 1 ? "Close Tab" : "Close Window") {
                if !controller.closeTab() { NSApp.keyWindow?.performClose(nil) }
            }
            .keyboardShortcut("w")
            #else
            item("tab.close")
            #endif
        }
        CommandGroup(replacing: .importExport) {
            item("data.importMarkdown")
            item("data.restore")
            Divider()
            item("data.exportAll")
            item("data.publish")
            item("data.backup")
            Divider()
            item("data.deleteUnused")
            Divider()
            item("sync.now")
            #if os(macOS)
            item("data.showBackups")
            #endif
        }
        CommandMenu("Page") {
            PageActionItems(controller: controller)
        }
        CommandGroup(before: .toolbar) {
            item("view.sidebar")
            item("view.inspector")
            item("view.focus")
            item("view.theme")
            Divider()
        }
        CommandMenu("Go") {
            item("search")
            item("go.home")
            item("daily.today")
            item("go.tasks")
            item("go.tags")
            item("go.graph")
            item("go.review")
            item("go.templates")
            item("go.trash")
            Divider()
            item("tab.next")
            item("tab.previous")
        }
        #if os(iOS)
        // macOS has the settings window's own item
        CommandGroup(replacing: .appSettings) {
            item("settings")
        }
        #endif
        CommandGroup(replacing: .help) {
            item("view.shortcuts")
        }
    }
}

#if os(macOS)
/// Saves edits still waiting before the app quits, giving up after three seconds.
final class AppDelegate: NSObject, NSApplicationDelegate {
    weak var controller: EditorController?
    private lazy var hotKey = GlobalHotKey {
        QuickNoteRequests.shared.request()
        NSApp.activate()
        for window in NSApp.windows where window.isMiniaturized { window.deminiaturize(nil) }
    }

    /// Takes or gives back ⌥⌘M for every app.
    func quickNoteFromAnyApp(_ on: Bool) {
        if on {
            if !hotKey.register() { NSLog("another app already uses ⌥⌘M, the quick note shortcut works inside SynapseNote only") }
        } else {
            hotKey.unregister()
        }
    }

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

