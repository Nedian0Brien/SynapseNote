import UIKit

/// Folds `<Accordion …>` bodies without touching the text: TextKit 2 asks the
/// content manager's delegate whether to enumerate each paragraph, and folded
/// paragraphs are skipped (the approach from WWDC21 "Meet TextKit 2").
/// Fold state is keyed by the `<Accordion` line's location and moved with edits.
@MainActor
final class FoldingController: NSObject, NSTextContentStorageDelegate {
    private(set) var foldedOpeners = Set<Int>()
    private var hiddenRanges: [NSRange] = []
    weak var styler: LivePreviewStyler?

    func isFolded(_ openerLocation: Int) -> Bool { foldedOpeners.contains(openerLocation) }

    func toggle(opener: Int) {
        if foldedOpeners.contains(opener) { foldedOpeners.remove(opener) } else { foldedOpeners.insert(opener) }
        recomputeHiddenRanges()
    }

    /// Shift fold keys for an edit (new-coordinate `editedRange`, `delta`).
    func charactersEdited(editedRange: NSRange, delta: Int) {
        guard !foldedOpeners.isEmpty else { return }
        let oldEnd = NSMaxRange(editedRange) - delta
        foldedOpeners = Set(foldedOpeners.compactMap { location in
            if location < editedRange.location { return location }
            if location >= oldEnd { return location + delta }
            return nil  // the opener line itself was edited away
        })
        recomputeHiddenRanges()
    }

    /// Body of each folded accordion: from the line after the opener through
    /// the matching `</Accordion>` line.
    func recomputeHiddenRanges() {
        guard let lines = styler?.index.lines else { return }
        var ranges: [NSRange] = []
        var i = 0
        while i < lines.count {
            if case .accordionOpen = lines[i].kind, foldedOpeners.contains(lines[i].range.location) {
                var j = i + 1
                while j < lines.count, lines[j].kind != .accordionClose { j += 1 }
                if i + 1 < lines.count {
                    let start = lines[i + 1].fullRange.location
                    let end = j < lines.count ? NSMaxRange(lines[j].fullRange) : NSMaxRange(lines[lines.count - 1].fullRange)
                    ranges.append(NSRange(location: start, length: end - start))
                }
                i = j
            }
            i += 1
        }
        hiddenRanges = ranges
    }

    func isHidden(_ location: Int) -> Bool {
        hiddenRanges.contains { NSLocationInRange(location, $0) }
    }

    nonisolated func textContentManager(
        _ textContentManager: NSTextContentManager,
        shouldEnumerate textElement: NSTextElement,
        options: NSTextContentManager.EnumerationOptions = []
    ) -> Bool {
        MainActor.assumeIsolated {
            guard !hiddenRanges.isEmpty, let range = textElement.elementRange else { return true }
            let offset = textContentManager.offset(from: textContentManager.documentRange.location, to: range.location)
            return !isHidden(offset)
        }
    }
}
