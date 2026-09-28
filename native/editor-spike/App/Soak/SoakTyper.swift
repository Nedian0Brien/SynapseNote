import UIKit

/// Timer-driven typing for the concurrency soak (`-soakSeconds N`).
///
/// Edits go through `UITextInput.replace(_:withText:)`, the same path the
/// keyboard uses. The token list deliberately includes Markdown caught
/// mid-typing (`*`, `**bo`, `[x`, a lone `#`) because Y.Text-only edits are
/// re-parsed by the server into the ProseMirror fragment, and half-typed
/// syntax is where that round trip could lose or rewrite bytes.
///
/// Every few edits it inserts a marker `⟦a:<unix ms>⟧`; the soak script
/// measures how long that marker takes to reach the other clients.
@MainActor
final class SoakTyper {
    private weak var textView: UITextView?
    private let duration: TimeInterval
    /// Insert-only mode (`-soakInsertOnly 1`): no deletions, so every marker
    /// must survive — a missing one means an edit was lost, not deleted.
    private let insertOnly: Bool
    private let plainTokens: Bool
    private var timer: Timer?
    private var startedAt = Date()
    private var editCount = 0
    /// UTF-16 units this typer inserted (the soak's size bound in insert-only mode).
    private(set) var insertedUnits = 0
    /// Markers this typer inserted; the soak checks each one reached the server.
    private(set) var insertedMarkers = 0
    private var rng = SystemRandomNumberGenerator()
    var onFinish: (() -> Void)?

    static let tokens: [String] = [
        "hello", "세상", "노트", "sync", " ", " ", "\n", "\n\n",
        "*", "**", "**bo", "bold**", "_", "`", "``", "[", "[ ]", "[x", "] ",
        "- ", "- [ ] ", "1. ", "# ", "## ", "#", "> ", "|", "😀", "é",
        "[link](", "https://example.com)", "<", "/>", "{", "}",
    ]

    /// `-soakPlainTokens 1`: words and spaces only, for control runs that
    /// separate sync behavior from Markdown/MDX re-serialization.
    static let plainTokens: [String] = ["hello", "세상", "노트", "sync", " ", " ", "word", "😀"]

    /// Documents above this length get trimmed so the soak stays bounded.
    static let maxLength = 12_000

    init(textView: UITextView, duration: TimeInterval, insertOnly: Bool = false, plainTokens: Bool = false) {
        self.textView = textView
        self.duration = duration
        self.insertOnly = insertOnly
        self.plainTokens = plainTokens
    }

    func start() {
        startedAt = Date()
        timer = Timer.scheduledTimer(withTimeInterval: 0.15, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.step() }
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func step() {
        guard let textView else { return }
        if Date().timeIntervalSince(startedAt) >= duration {
            stop()
            onFinish?()
            return
        }
        editCount += 1
        let length = textView.textStorage.length

        if length > Self.maxLength && !insertOnly {
            replace(in: textView, range: NSRange(location: Int.random(in: 0..<(length - 60), using: &rng), length: 50), with: "")
            return
        }

        let roll = Int.random(in: 0..<100, using: &rng)
        let location = Self.safeLocation(in: textView.textStorage.string as NSString, near: Int.random(in: 0...length, using: &rng))
        if editCount % 10 == 0 {
            replace(in: textView, range: NSRange(location: location, length: 0), with: "⟦a:\(SoakRecorder.nowMs())⟧")
            insertedMarkers += 1
        } else if roll < 30 && length > 10 && !insertOnly {
            let deleteLength = min(Int.random(in: 1...5, using: &rng), length - location)
            let range = Self.composedRange(in: textView.textStorage.string as NSString, NSRange(location: location, length: deleteLength))
            replace(in: textView, range: range, with: "")
        } else {
            let token = (plainTokens ? Self.plainTokens : Self.tokens).randomElement(using: &rng)!
            replace(in: textView, range: NSRange(location: location, length: 0), with: token)
        }
    }

    private func replace(in textView: UITextView, range: NSRange, with text: String) {
        guard
            let start = textView.position(from: textView.beginningOfDocument, offset: range.location),
            let end = textView.position(from: start, offset: range.length),
            let textRange = textView.textRange(from: start, to: end)
        else { return }
        textView.replace(textRange, withText: text)
        insertedUnits += (text as NSString).length
    }

    private static let markerPattern = try! NSRegularExpression(pattern: "⟦[a-z]:\\d{13}⟧")

    /// Never split a surrogate pair, a composed character, or a soak marker
    /// (a split marker would read as a lost edit) when picking a spot.
    static func safeLocation(in string: NSString, near location: Int) -> Int {
        guard location < string.length else { return string.length }
        var spot = string.rangeOfComposedCharacterSequence(at: location).location
        let window = NSRange(location: max(0, spot - 20), length: min(40, string.length - max(0, spot - 20)))
        for match in markerPattern.matches(in: string as String, range: window) where match.range.location < spot && spot < NSMaxRange(match.range) {
            spot = NSMaxRange(match.range)
        }
        return spot
    }

    static func composedRange(in string: NSString, _ range: NSRange) -> NSRange {
        guard range.length > 0 else { return range }
        return string.rangeOfComposedCharacterSequences(for: range)
    }
}
