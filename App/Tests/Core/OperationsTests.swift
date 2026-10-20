import Foundation
import Testing
@testable import SynapseNote

/// The documents and commands Morrow's operations make (src/app/operations.ts), as the app's operations make them.
struct OperationsTests {
    typealias T = EditorEditsTests

    @Test func captureAddsToTodaysNote() {
        // the time in bold before the first paragraph, a line break for each new line, an empty first paragraph left out
        let doc = EditorController.captured("first line\nsecond\n\n[x] done thing\n\n[ ] open\nmore", into: T.doc(T.p()), time: "09:05 AM")
        #expect(T.json(doc) == """
        {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"09:05 AM ","marks":[{"type":"bold"}]},\
        {"type":"text","text":"first line"},{"type":"hardBreak"},{"type":"text","text":"second"}]},\
        {"type":"taskList","content":[{"type":"taskItem","attrs":{"checked":true},"content":[{"type":"paragraph","content":[{"type":"text","text":"done thing"}]}]}]},\
        {"type":"taskList","content":[{"type":"taskItem","attrs":{"checked":false},"content":[{"type":"paragraph","content":[{"type":"text","text":"open"},{"type":"hardBreak"},{"type":"text","text":"more"}]}]}]}]}
        """)
        // a first part that is a task has no time; text already there stays
        let task = EditorController.captured("[X] Ship", into: T.doc(T.p("kept")), time: "09:05 AM")
        #expect(T.json(task) == #"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"kept"}]},{"type":"taskList","content":[{"type":"taskItem","attrs":{"checked":true},"content":[{"type":"paragraph","content":[{"type":"text","text":"Ship"}]}]}]}]}"#)
        // an empty line inside a part keeps its break
        let blank = EditorController.captured("a\n\n\nb", into: T.doc(), time: "t")
        #expect(blank.content?.count == 2)
    }

    @Test func captureTimeIsTwoDigits() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        let date = calendar.date(from: DateComponents(year: 2026, month: 10, day: 21, hour: 9, minute: 5))!
        // toLocaleTimeString with { hour: '2-digit', minute: '2-digit' } in WebKit's JavaScriptCore
        #expect(EditorController.captureTime(date, locale: Locale(identifier: "en_US")) == "09:05 AM")
        #expect(EditorController.captureTime(date, locale: Locale(identifier: "ko_KR")) == "오전 09:05")
    }
}

/// What the data operations make: formulas for published pages from the KaTeX the app carries, the same as
/// Morrow's (Fixtures/core/expected/katex.json from node), nested zips opened as Morrow's unzipAll does, and
/// the names and messages Morrow writes.
struct DataOperationsTests {
    @Test func formulasRenderAsMorrowPublishesThem() throws {
        let cases = try #require(CoreFixtures.load("katex").array)
        #expect(cases.count == 5)
        for item in cases {
            let latex = try #require(item["latex"]?.string)
            #expect(Katex.mathML(latex, display: item["display"]?.truthy == true) == item["html"]?.string, "\(latex)")
        }
    }

    @Test func nestedZipsOpenTwoLevels() throws {
        let inner = Zip.write([("Part/Page.md", Data("# Page".utf8))])
        let middle = Zip.write([("inner.zip", inner), ("a.md", Data("a".utf8))])
        let deepest = Zip.write([("deep.md", Data("deep".utf8))])
        let third = Zip.write([("third.zip", Zip.write([("deeper.zip", deepest)]))])
        let outer = Zip.write([("middle.ZIP", middle), ("Notes/b.md", Data("b".utf8)), ("third.zip", third)])
        let entries = try EditorController.unzipAll(outer)
        // a zip two levels down is kept as a file, as Morrow's depth < 2
        #expect(entries.map(\.path) == ["Part/Page.md", "a.md", "Notes/b.md", "deeper.zip"])
    }

    @Test func namesAndCountsAreMorrows() {
        var calendar = Calendar.current
        calendar.timeZone = .current
        let date = calendar.date(from: DateComponents(year: 2026, month: 3, day: 4, hour: 5, minute: 6))!
        #expect(EditorController.stamp(date) == "2026-03-04-0506")
        #expect(EditorController.plural(1, "page") == "1 page")
        #expect(EditorController.plural(3, "unused file") == "3 unused files")
    }

    @Test func printedPagesAreThePublishedPage() throws {
        var state = WorkspaceState()
        var page = PageMeta(id: "p", parentId: nil)
        page.title = "Plan & notes"
        page.icon = "📝"
        page.tags = ["work"]
        state.pages["p"] = page
        state.docs["p"] = .node("doc", ("content", [.object(.node("paragraph", ("content", [
            .object(JSObject([("type", "text"), ("text", "See ")])), .object(.node("inlineMath", ("attrs", ["latex": "x^2"])))]))),
            .object(.node("image", ("attrs", ["fileId": "attachments/a b.png", "alt": "pic"])))]))
        let html = try #require(Site.printPage(state, "p", assetPath: { VaultSchemeHandler.url(for: $0)?.absoluteString ?? "" }))
        #expect(html.contains("<h1><span class=\"icon\">📝</span> Plan &amp; notes</h1>"))
        #expect(html.contains("<span>#work</span>"))
        #expect(html.contains(Katex.mathML("x^2", display: false)))
        #expect(html.contains("synapse-vault://vault/attachments/a%20b.png"))
        #expect(!html.contains("<nav"))
    }
}
