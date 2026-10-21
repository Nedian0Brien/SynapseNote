import Foundation
import Testing
@testable import SynapseNote

/// The welcome guide the app puts in a new vault: Morrow's sampleCommands with this app's wording, filled at the
/// time the vault opens (Fixtures/core/expected/guide.json from node, `npm run guide-resource`).
struct WelcomeGuideTests {
    private func guide() throws -> (made: [JSValue], expected: JSValue) {
        JSEnvironment.timeZone = TimeZone(identifier: "UTC")!
        let expected = try CoreFixtures.load("guide")
        let now = try #require(expected["now"]?.number)
        var next = 0
        let made = try #require(WelcomeGuide.commands(newId: {
            next += 1
            return "s\(next)"
        }, now: now))
        return (made, expected)
    }

    @Test func fillsTheGuideAsMorrowMakesIt() throws {
        let (made, expected) = try guide()
        #expect(JSJSON.stringify(.array(made)) == JSJSON.stringify(expected["commands"]!))
        // every command is one the session reads
        #expect(made.compactMap(CoreCommand.init(json:)).count == made.count)
    }

    /// web/src/guide.test.ts: the app's name and keys, never Windows and Linux ones
    @Test func namesThisAppAndItsKeys() throws {
        var words: [String] = []
        func walk(_ node: JSValue) {
            if let text = node["text"]?.string { words.append(text) }
            for child in node["content"]?.array ?? [] { walk(child) }
        }
        for command in try guide().made where command["type"]?.string == "page.create" {
            if let title = command["title"]?.string { words.append(title) }
            if let doc = command["doc"] { walk(doc) }
        }
        let text = words.joined(separator: "\n")
        #expect(text.contains("Welcome to SynapseNote"))
        #expect(!text.contains("Morrow"))
        for word in ["Ctrl", "Alt ", "Windows", "Linux", "middle click"] { #expect(!text.contains(word), "\(word)") }
        for keys in ["⌘ N", "⌘ K", "⇧ ⌘ D", "⌥ ⌘ M", "⇧ ⌘ G", "⌥ ⌘ T", "⇧ ⌘ R", "⇧ ⌘ F", "⇧ ⌘ L", "⌃ ⌘ S"] {
            #expect(text.contains(keys), "\(keys)")
        }
        // the licence is not decided
        #expect(text.range(of: "open source", options: .caseInsensitive) == nil)
    }
}
