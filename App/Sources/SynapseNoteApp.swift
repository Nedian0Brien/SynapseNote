import SwiftUI

@main
struct SynapseNoteApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        #if os(macOS)
        .defaultSize(width: 1180, height: 780)
        #endif
    }
}
