import Foundation
import Testing
@testable import EditingCore

// Runs the shared conformance fixtures (packages/core/src/editing-model/fixtures,
// SPEC.md §10) through the JavaScriptCore bundle, the way the macOS editor
// calls it. The notation parsers mirror `parseMarked`/`parseCursor` in
// fixtures.ts; offsets are UTF-16 units like JS string indices.

private let fixturesDir = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .appendingPathComponent("../../../../packages/core/src/editing-model/fixtures")
    .standardizedFileURL

private func loadFixtures(_ name: String) throws -> [[String: Any]] {
    let data = try Data(contentsOf: fixturesDir.appendingPathComponent(name))
    return try #require(JSONSerialization.jsonObject(with: data) as? [[String: Any]])
}

struct Marked {
    var source = ""
    var hidden: [[Int]] = []
    var widgets: [[Int]] = []
}

func parseMarked(_ marked: String) -> Marked {
    var out = Marked()
    var length = 0
    var open: (hidden: Bool, from: Int)?
    for ch in marked {
        switch ch {
        case "⟨", "⦃": open = (ch == "⟨", length)
        case "⟩", "⦄":
            if let o = open {
                if o.hidden { out.hidden.append([o.from, length]) } else { out.widgets.append([o.from, length]) }
            }
            open = nil
        default:
            out.source.append(ch)
            length += ch.utf16.count
        }
    }
    return out
}

struct Cursor {
    var source: String
    var anchor: Int
    var head: Int
}

func parseCursor(_ text: String) -> Cursor {
    let ns = text as NSString
    let caret = ns.range(of: "│")
    if caret.location != NSNotFound {
        return Cursor(source: ns.replacingCharacters(in: caret, with: ""), anchor: caret.location, head: caret.location)
    }
    let from = ns.range(of: "⟪").location
    let to = ns.range(of: "⟫").location - 1
    let source = text.replacingOccurrences(of: "⟪", with: "").replacingOccurrences(of: "⟫", with: "")
    return Cursor(source: source, anchor: from, head: to)
}

/// Offsets separated only by hidden syntax are the same screen position (edit.test.ts).
@MainActor
func screenPosition(_ runtime: EditingRuntime, _ source: String, _ offset: Int) throws -> Int {
    let length = (source as NSString).length
    var hidden = [Bool](repeating: false, count: length)
    for h in try runtime.computeLayout(source).hidden {
        for i in h.from..<h.to where i < length { hidden[i] = true }
    }
    return (0..<offset).filter { !hidden[$0] }.count
}

func apply(_ changes: [SourceChange], to source: String) -> String {
    let ns = NSMutableString(string: source)
    for c in changes.reversed() { ns.replaceCharacters(in: NSRange(location: c.from, length: c.to - c.from), with: c.insert) }
    return ns as String
}

@MainActor
@Suite struct FixtureTests {
    let runtime: EditingRuntime

    init() throws { runtime = try EditingRuntime() }

    @Test func bundleVersion() { #expect(runtime.bundleVersion == 1) }

    @Test func hideFixtures() throws {
        let fixtures = try loadFixtures("hide.json")
        #expect(fixtures.count >= 42)
        var failures: [String] = []
        for f in fixtures {
            let id = f["id"] as? String ?? "?"
            let marked = parseMarked(f["marked"] as? String ?? "")
            let layout = try runtime.computeLayout(marked.source)
            let hidden = layout.hidden.map { [$0.from, $0.to] }
            let widgets = layout.widgets.map { [$0.from, $0.to] }
            if hidden != marked.hidden || widgets != marked.widgets {
                failures.append("\(id): hidden \(hidden) widgets \(widgets), expected \(marked.hidden) / \(marked.widgets)")
            }
        }
        #expect(failures.isEmpty, "\(failures.count) hide fixtures differ:\n\(failures.joined(separator: "\n"))")
    }

    /// Each case goes through a session (`select` + `edit`), the path the text view uses.
    @Test func editFixtures() throws {
        let fixtures = try loadFixtures("edit.json")
        #expect(fixtures.count >= 125)
        var failures: [String] = []
        for f in fixtures {
            let id = f["id"] as? String ?? "?"
            let before = parseCursor(f["before"] as? String ?? "")
            let actions = try JSONSerialization.data(withJSONObject: f["actions"] ?? [])
            let session = try runtime.makeSession(source: before.source)
            try session.select(anchor: before.anchor, head: before.head)
            let result = try session.edit(actionsJSON: String(decoding: actions, as: UTF8.self))
            let source = apply(result.changes, to: before.source)
            if source != session.source { failures.append("\(id): changes do not rebuild the session source") }
            if let clipboard = f["clipboard"] as? [String: Any], result.clipboard?.markdown != clipboard["markdown"] as? String {
                failures.append("\(id): clipboard \(String(describing: result.clipboard?.markdown))")
            }
            if let ui = f["ui"] as? String, result.ui != ui { failures.append("\(id): ui \(String(describing: result.ui))") }
            guard let afterText = f["after"] as? String else { continue }
            let after = parseCursor(afterText)
            if source != after.source {
                failures.append("\(id): source \(source.debugDescription), expected \(after.source.debugDescription)")
            } else if after.anchor == after.head {
                let got = try screenPosition(runtime, source, result.head)
                let want = try screenPosition(runtime, after.source, after.head)
                if result.anchor != result.head || got != want { failures.append("\(id): cursor \(result.head), expected \(after.head)") }
            } else if [result.anchor, result.head] != [after.anchor, after.head] {
                failures.append("\(id): selection \([result.anchor, result.head]), expected \([after.anchor, after.head])")
            }
        }
        #expect(failures.isEmpty, "\(failures.count) edit fixtures differ:\n\(failures.joined(separator: "\n"))")
    }

    @Test func remoteChangesMapTheCursor() throws {
        let session = try runtime.makeSession(source: "abc def\n")
        try session.select(anchor: 5, head: 5)
        let result = try session.applyRemote([SourceChange(from: 0, to: 0, insert: "한글")])
        #expect(session.source == "한글abc def\n")
        #expect(result.anchor == 7)
    }

    @Test func surrogatePairsCountAsTwoUnits() throws {
        let session = try runtime.makeSession(source: "a😀b\n")
        try session.select(anchor: 3, head: 3)
        let result = try session.edit([.text("!")])
        #expect(session.source == "a😀!b\n")
        #expect(result.head == 4)
    }
}
