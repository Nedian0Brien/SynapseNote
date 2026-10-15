import AppKit
import QuartzCore

/// Measures keystroke → screen time on the generated 5,000-line document.
///
///     SynapseNote -perfSeconds 60 -caretLine 2500
///
/// Types ten keys a second at the end of `caretLine` through the same
/// `insertText` path the keyboard uses, forces layout and display after each
/// key, then writes the percentiles to `Documents/keystroke-perf.txt` in the
/// app container, logs them and quits.
@MainActor
enum KeystrokeProbe {
    struct Options {
        var seconds: Int
        var caretLine: Int
    }

    static var options: Options? {
        let defaults = UserDefaults.standard
        let seconds = defaults.integer(forKey: "perfSeconds")
        guard seconds > 0 else { return nil }
        return Options(seconds: seconds, caretLine: max(1, defaults.integer(forKey: "caretLine")))
    }

    private static var samples: [(total: Double, model: Double, apply: Double, display: Double)] = []

    static func startIfRequested(_ textView: SourceTextView) {
        guard let options else { return }
        let text = textView.string as NSString
        var location = 0
        for _ in 0..<options.caretLine {
            let line = text.lineRange(for: NSRange(location: location, length: 0))
            location = min(text.length, line.location + line.length)
        }
        let caret = max(0, location - 1)
        textView.window?.makeFirstResponder(textView)
        textView.setSelectedRange(NSRange(location: caret, length: 0))

        Task { @MainActor in
            try? await Task.sleep(for: .seconds(1))
            for count in 0..<(options.seconds * 10) {
                type(into: textView, key: count % 6 == 5 ? " " : "a")
                try? await Task.sleep(for: .milliseconds(100))
            }
            finish(options)
        }
    }

    private static func type(into textView: SourceTextView, key: String) {
        let start = CACurrentMediaTime()
        textView.insertText(key, replacementRange: NSRange(location: NSNotFound, length: 0))
        let applied = CACurrentMediaTime()
        textView.layoutSubtreeIfNeeded()
        if let manager = textView.textLayoutManager {
            manager.textViewportLayoutController.layoutViewport()
        }
        textView.displayIfNeeded()
        let end = CACurrentMediaTime()
        let timing = textView.lastTiming
        samples.append((
            total: (end - start) * 1000,
            model: timing?.model ?? 0,
            apply: timing?.apply ?? 0,
            display: (end - applied) * 1000
        ))
    }

    private static func finish(_ options: Options) {
        func line(_ name: String, _ values: [Double]) -> String {
            let sorted = values.sorted()
            func p(_ q: Double) -> Double { sorted[min(sorted.count - 1, Int(Double(sorted.count) * q))] }
            return String(format: "%@ p50 %.2f p95 %.2f max %.2f ms", name, p(0.5), p(0.95), sorted.last ?? 0)
        }
        let report = [
            "keystrokes \(samples.count), caret line \(options.caretLine)",
            line("total  ", samples.map(\.total)),
            line("model  ", samples.map(\.model)),
            line("apply  ", samples.map(\.apply)),
            line("display", samples.map(\.display)),
        ].joined(separator: "\n")
        NSLog("SynapseNote keystroke probe\n%@", report)
        if let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
            try? report.write(to: dir.appendingPathComponent("keystroke-perf.txt"), atomically: true, encoding: .utf8)
        }
        NSApp.terminate(nil)
    }
}

/// The 5,000-line measurement document (same shape as the spike's
/// `gen-fixture.ts` large.md).
enum LargeDocument {
    static func make(lines count: Int) -> String {
        var lines: [String] = []
        var section = 0
        while lines.count < count {
            lines.append("## Section \(section)")
            lines.append("")
            for i in 0..<8 {
                lines.append("Paragraph \(section).\(i) with **bold**, *italic*, `code`, and a [link](https://example.com/\(section)/\(i)).")
            }
            lines.append(contentsOf: ["", "- [ ] a task", "- [x] a done task", "- a bullet with **emphasis**", "", "> a quote line", ""])
            section += 1
        }
        return lines.prefix(count).joined(separator: "\n") + "\n"
    }
}
