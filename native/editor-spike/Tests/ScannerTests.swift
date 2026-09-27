import XCTest
@testable import EditorSpike

final class MarkdownScannerTests: XCTestCase {
    private func scan(_ text: String) -> [MarkdownScanner.Line] {
        MarkdownScanner.scan(text as NSString, range: NSRange(location: 0, length: (text as NSString).length), state: .normal)
    }

    func testBlockKinds() {
        let text = """
        ---
        title: x
        ---
        # Title
        - item
        1. one
        - [ ] todo
        - [x] done
        > quote
        ```swift
        let a = 1
        ```
        <DatabaseView databaseId="db" />
        <Accordion title="Folded">
        </Accordion>

        plain
        """
        let kinds = scan(text).map(\.kind)
        XCTAssertEqual(kinds[0], .frontmatter)
        XCTAssertEqual(kinds[1], .frontmatter)
        XCTAssertEqual(kinds[2], .frontmatter)
        XCTAssertEqual(kinds[3], .heading(level: 1))
        XCTAssertEqual(kinds[4], .listItem(ordered: false))
        XCTAssertEqual(kinds[5], .listItem(ordered: true))
        guard case .task(false, _) = kinds[6], case .task(true, _) = kinds[7] else { return XCTFail("tasks: \(kinds[6]) \(kinds[7])") }
        XCTAssertEqual(kinds[8], .quote)
        XCTAssertEqual(kinds[9], .fence)
        XCTAssertEqual(kinds[10], .code)
        XCTAssertEqual(kinds[11], .fence)
        XCTAssertEqual(kinds[12], .component(name: "DatabaseView"))
        guard case .accordionOpen(let title?) = kinds[13] else { return XCTFail("accordion: \(kinds[13])") }
        XCTAssertEqual((text as NSString).substring(with: title), "Folded")
        XCTAssertEqual(kinds[14], .accordionClose)
        XCTAssertEqual(kinds[15], .blank)
        XCTAssertEqual(kinds[16], .paragraph)
    }

    func testTaskBoxPointsAtTheCheckCharacter() {
        let text = "intro\n- [ ] todo"
        let line = scan(text)[1]
        guard case .task(_, let box) = line.kind else { return XCTFail() }
        XCTAssertEqual((text as NSString).substring(with: NSRange(location: box, length: 1)), " ")
    }

    func testInlineSpansAndSyntax() {
        let text = "a **b** *c* `d` [e](f)"
        let line = scan(text)[0]
        let ns = text as NSString
        XCTAssertEqual(Set(line.spans.map { ns.substring(with: $0.range) }), ["b", "c", "d", "e"])
        XCTAssertEqual(line.syntax.map { ns.substring(with: $0) }.sorted(), ["*", "*", "**", "**", "[", "](f)", "`", "`"].sorted())
    }

    func testCodeSpanShieldsEmphasis() {
        let line = scan("`**not bold**`")[0]
        XCTAssertEqual(line.spans.map(\.style), [.code])
    }

    /// Incremental updates must equal a full rescan after any edit.
    func testIncrementalMatchesFullRescan() {
        let fixture = """
        # Title
        Some **bold** text
        - [ ] task
        ```
        code **not**
        ```
        > quote
        <Accordion title="A">
        inside
        </Accordion>
        end
        """
        let pieces = ["\n", "```", "# ", "- [ ] ", "**x**", "`", "a", "\n\n", ">", "<DatabaseView />", "한글😀", "---\n"]
        var rng = SeededGenerator(seed: 42)
        for _ in 0..<400 {
            let storage = NSMutableString(string: fixture)
            let index = LineIndex()
            index.rebuild(storage)
            for _ in 0..<15 {
                let length = storage.length
                let location = Int.random(in: 0...length, using: &rng)
                let deleteLength = Bool.random(using: &rng) ? min(Int.random(in: 0...6, using: &rng), length - location) : 0
                let insert = Bool.random(using: &rng) ? pieces.randomElement(using: &rng)! : ""
                let safe = Self.composedSafe(storage, NSRange(location: location, length: deleteLength))
                storage.replaceCharacters(in: safe, with: insert)
                let edited = NSRange(location: safe.location, length: (insert as NSString).length)
                index.applyEdit(storage, editedRange: edited, delta: (insert as NSString).length - safe.length)
                let full = LineIndex()
                full.rebuild(storage)
                if index.lines != full.lines {
                    XCTFail("diverged after replacing \(safe) with \(insert.debugDescription) in:\n\(storage)")
                    return
                }
            }
        }
    }

    private static func composedSafe(_ s: NSMutableString, _ r: NSRange) -> NSRange {
        guard s.length > 0 else { return NSRange(location: 0, length: 0) }
        let start = r.location < s.length ? s.rangeOfComposedCharacterSequence(at: r.location).location : s.length
        guard r.length > 0 else { return NSRange(location: start, length: 0) }
        let endAnchor = min(s.length - 1, NSMaxRange(r) - 1)
        let end = NSMaxRange(s.rangeOfComposedCharacterSequence(at: endAnchor))
        return NSRange(location: start, length: max(0, end - start))
    }
}

struct SeededGenerator: RandomNumberGenerator {
    private var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return state
    }
}
