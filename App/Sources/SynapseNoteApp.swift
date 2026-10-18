import SwiftUI

@main
struct SynapseNoteApp: App {
    @State private var controller = EditorController()
    #if os(macOS)
    @NSApplicationDelegateAdaptor private var appDelegate: AppDelegate
    #endif

    var body: some Scene {
        WindowGroup {
            ContentView(controller: controller)
                #if os(macOS)
                .onAppear { appDelegate.controller = controller }
                #endif
        }
        #if os(macOS)
        .defaultSize(width: 1180, height: 780)
        #endif
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
