import AppIntents

/// Quick Note in the Shortcuts app, Siri and Spotlight: opens the app on the quick note sheet. The app comes to
/// the front first, the note is written in the app (iOS 26 `supportedModes`, which replaces `openAppWhenRun`).
struct QuickNoteIntent: AppIntent {
    static let title: LocalizedStringResource = "Quick Note"
    static let description = IntentDescription("Adds a note to the end of today’s note in SynapseNote.")
    static let supportedModes: IntentModes = .foreground(.immediate)

    @MainActor
    func perform() async throws -> some IntentResult {
        QuickNoteRequests.shared.request()
        return .result()
    }
}

/// Hands a quick note asked for outside the app's windows, by an intent or the global shortcut, to the app.
/// An intent can run before the window exists, so the request waits until the window takes it.
@Observable
final class QuickNoteRequests {
    static let shared = QuickNoteRequests()
    private(set) var pending = false

    func request() {
        pending = true
    }

    /// True once for each request.
    func take() -> Bool {
        defer { pending = false }
        return pending
    }
}

struct SynapseNoteShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: QuickNoteIntent(),
            phrases: ["Add a quick note in \(.applicationName)", "Quick note in \(.applicationName)"],
            shortTitle: "Quick Note",
            systemImageName: "square.and.pencil"
        )
    }
}
