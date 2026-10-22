import Foundation
import Observation

/// The page open as its Markdown source, as Morrow's SourceEditor keeps it: the text as typed, read back and
/// saved half a second after typing stops, when the field loses focus, and before anything leaves the page.
@MainActor
@Observable
final class SourceDraft {
    static let saveDelay = Duration.milliseconds(500)
    static let unreadableMessage = "This Markdown could not be read, the page keeps its last good version."

    let pageId: String
    private(set) var text: String
    /// Set while the last text typed could not be read back.
    private(set) var error: String?

    /// reads the text back and sets the page to it, false when it gives no document
    @ObservationIgnored private let save: (String) async -> Bool
    @ObservationIgnored private var unsaved: String?
    @ObservationIgnored private var timer: Task<Void, Never>?
    /// the save in progress; each save waits for the one before, so the page ends on the last text typed
    @ObservationIgnored private var saving: Task<Void, Never>?

    init(pageId: String, text: String, save: @escaping (String) async -> Bool) {
        self.pageId = pageId
        self.text = text
        self.save = save
    }

    func edit(_ newText: String) {
        guard !newText.utf16.elementsEqual(text.utf16) else { return }
        text = newText
        unsaved = newText
        timer?.cancel()
        timer = Task { [weak self] in
            try? await Task.sleep(for: Self.saveDelay)
            guard !Task.isCancelled else { return }
            await self?.flush()
        }
    }

    /// Saves what is typed now, and returns once every save so far is done.
    func flush() async {
        timer?.cancel()
        timer = nil
        if let text = unsaved {
            unsaved = nil
            let previous = saving
            saving = Task { [save] in
                await previous?.value
                let saved = await save(text)
                self.error = saved ? nil : Self.unreadableMessage
            }
        }
        await saving?.value
    }
}
