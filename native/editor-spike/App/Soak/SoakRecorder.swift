import CryptoKit
import Foundation

/// Writes soak evidence into the app's Documents directory, where
/// `scripts/soak.ts` reads it through `xcrun simctl get_app_container`.
///
/// - `soak-hash.txt`: `<sha256 of Y.Text UTF-8> <utf16 length> <unix ms>`, rewritten.
/// - `soak-latency.txt`: `<source> <ms>` per marker first seen here, appended.
/// - `soak-keystroke.txt`: `<stage> <ms>` per local edit, appended (R6). Stages:
///   `sync` (binding → yrs → send), `style` (scanner + attributes), `full`
///   (perf driver: replace + synchronous layout).
/// - `soak-inserted.txt`: `<utf16 units> <markers>` the typer inserted, written when typing ends.
/// - `soak-log.txt`: diagnostics, appended.
final class SoakRecorder {
    private let directory: URL
    private var handles: [String: FileHandle] = [:]

    init() {
        directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        try? FileManager.default.removeItem(at: directory.appendingPathComponent("soak-inserted.txt"))
        for name in ["soak-latency.txt", "soak-keystroke.txt", "soak-log.txt"] {
            let url = directory.appendingPathComponent(name)
            FileManager.default.createFile(atPath: url.path, contents: nil)
            handles[name] = try? FileHandle(forWritingTo: url)
        }
    }

    static func sha256(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    func writeHash(of text: String) {
        let line = "\(Self.sha256(text)) \((text as NSString).length) \(Self.nowMs())\n"
        try? line.write(to: directory.appendingPathComponent("soak-hash.txt"), atomically: true, encoding: .utf8)
    }

    func writeInserted(units: Int, markers: Int) {
        try? "\(units) \(markers)\n".write(to: directory.appendingPathComponent("soak-inserted.txt"), atomically: true, encoding: .utf8)
    }

    func latency(source: String, ms: Int) { append("soak-latency.txt", "\(source) \(ms)\n") }
    func keystroke(_ stage: String, ms: Double) { append("soak-keystroke.txt", String(format: "%@ %.3f\n", stage, ms)) }
    func log(_ message: String) { append("soak-log.txt", "\(Self.nowMs()) \(message)\n") }

    private func append(_ name: String, _ line: String) {
        handles[name]?.write(Data(line.utf8))
    }

    static func nowMs() -> Int { Int(Date().timeIntervalSince1970 * 1000) }
}
