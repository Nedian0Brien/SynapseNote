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
