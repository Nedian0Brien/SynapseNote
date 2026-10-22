import Foundation
import Testing
@testable import SynapseNote

/// The structure edits of Morrow's editor (tables, columns, callouts, toggles, the block menu, Markdown paste and
/// the "@" menu's dates) as EditorEdits and DateMentions make them, each written out as the JSON the editor saves.
struct EditorBlockEditsTests {
    typealias T = EditorEditsTests
    typealias Caret = EditorEdits.Caret

    static func cell(_ value: String, header: Bool = false) -> JSValue {
        var node = EditorEdits.cell(header: header)
        if !value.isEmpty { node["content"] = [T.p(value)] }
        return .object(node)
    }

    static func row(_ cells: JSValue...) -> JSValue { .object(.node("tableRow", ("content", .array(cells)))) }
    static func table(_ rows: JSValue...) -> JSValue { .object(.node("table", ("content", .array(rows)))) }

    @Test func blocksGoInAtTheCaret() {
        let toc = DocNode.node("tableOfContents")
        // in place of an empty block, with a paragraph after to type in
        let (empty, caret) = EditorEdits.insertBlock(T.doc(T.p()), [0], 0, toc)
        #expect(T.json(empty) == T.json(T.doc(.object(toc), T.p())))
        #expect(caret == Caret(path: [1], offset: 0))
        // in the middle of a paragraph, splitting it
        let (middle, inside) = EditorEdits.insertBlock(T.doc(T.p("ab")), [0], 1, EditorEdits.table(rows: 2, columns: 2))
        #expect(middle.content?.map(\.type) == ["paragraph", "table", "paragraph"])
        #expect(inside == Caret(path: [1, 0, 0, 0], offset: 0))
        // the first row is header cells with TipTap's cell attributes
        #expect(JSJSON.stringify(.object(EditorEdits.cell(header: true)))
            == #"{"type":"tableHeader","attrs":{"colspan":1,"rowspan":1,"colwidth":null,"align":null},"content":[{"type":"paragraph"}]}"#)
        let columns = EditorEdits.insertBlock(T.doc(T.p("x")), [0], 1, EditorEdits.columns(3))
        #expect(columns.doc.content?.last?.content?.count == 3)
        #expect(columns.caret == Caret(path: [1, 0, 0], offset: 0))
        #expect(EditorEdits.columns(9).content?.count == 4)
    }

    @Test func atomsGoInAtTheCaret() {
        let link = DocNode.node("pageLink", ("attrs", ["id": "p1", "label": "Plan"]))
        let (doc, caret) = EditorEdits.insertInline(T.doc(T.p("see [[pl")), [0], NSRange(location: 4, length: 4),
                                                    [link, JSObject([("type", "text"), ("text", " ")])])
        #expect(T.json(doc) == T.json(T.doc(.object(.node("paragraph", ("content", [T.text("see "), .object(link), T.text(" ")]))))))
        #expect(caret == Caret(path: [0], offset: 6))
    }

    @Test func calloutsAndTogglesWrapABlock() {
        let (callout, caret) = EditorEdits.wrapInCallout(T.doc(T.p("note")), [0])
        #expect(T.json(callout) == #"{"type":"doc","content":[{"type":"callout","attrs":{"tone":"note","kind":null,"title":null,"fold":null},"content":[{"type":"paragraph","content":[{"type":"text","text":"note"}]}]}]}"#)
        #expect(caret == Caret(path: [0, 0], offset: 0))
        let (toggle, summary) = EditorEdits.wrapInDetails(T.doc(T.p("body")), [0])
        #expect(T.json(toggle) == #"{"type":"doc","content":[{"type":"details","attrs":{"open":false},"content":[{"type":"detailsSummary"},{"type":"detailsContent","content":[{"type":"paragraph","content":[{"type":"text","text":"body"}]}]}]}]}"#)
        #expect(summary == Caret(path: [0, 0], offset: 0))
    }

    @Test func tablesGrowAndShrink() throws {
        let start = T.doc(Self.table(Self.row(Self.cell("a", header: true), Self.cell("b", header: true)), Self.row(Self.cell("c"), Self.cell("d"))))
        let place = try #require(EditorEdits.cellPlace(start, [0, 1, 1, 0]))
        #expect(place == EditorEdits.CellPlace(table: [0], row: 1, column: 1))
        // a new row after the last one, plain cells as the columns are not header columns
        let (rows, rowCaret) = EditorEdits.addRow(start, place)
        #expect(T.json(rows) == T.json(T.doc(Self.table(Self.row(Self.cell("a", header: true), Self.cell("b", header: true)),
                                                        Self.row(Self.cell("c"), Self.cell("d")), Self.row(Self.cell(""), Self.cell(""))))))
        #expect(rowCaret == Caret(path: [0, 2, 1, 0], offset: 0))
        // in a header column the new row's cell is a header cell
        let sideways = T.doc(Self.table(Self.row(Self.cell("a", header: true), Self.cell("b")), Self.row(Self.cell("c", header: true), Self.cell("d"))))
        #expect(T.json(EditorEdits.addRow(sideways, place).doc) == T.json(T.doc(Self.table(
            Self.row(Self.cell("a", header: true), Self.cell("b")), Self.row(Self.cell("c", header: true), Self.cell("d")),
            Self.row(Self.cell("", header: true), Self.cell(""))))))
        // a new column: a header cell in the header row
        let (columns, _) = EditorEdits.addColumn(start, EditorEdits.CellPlace(table: [0], row: 0, column: 0))
        #expect(T.json(columns) == T.json(T.doc(Self.table(Self.row(Self.cell("a", header: true), Self.cell("", header: true), Self.cell("b", header: true)),
                                                           Self.row(Self.cell("c"), Self.cell(""), Self.cell("d"))))))
        #expect(T.json(EditorEdits.deleteRow(start, place).doc) == T.json(T.doc(Self.table(Self.row(Self.cell("a", header: true), Self.cell("b", header: true))))))
        #expect(T.json(EditorEdits.deleteColumn(start, place).doc) == T.json(T.doc(Self.table(Self.row(Self.cell("a", header: true)), Self.row(Self.cell("c"))))))
        #expect(T.json(EditorEdits.deleteTable(start, place).doc) == T.json(T.doc(T.p())))
        #expect(T.json(EditorEdits.toggleHeaderRow(start, place)) == T.json(T.doc(Self.table(Self.row(Self.cell("a"), Self.cell("b")), Self.row(Self.cell("c"), Self.cell("d"))))))
        // Tab goes cell by cell, row by row
        #expect(EditorEdits.neighbourCell(start, EditorEdits.CellPlace(table: [0], row: 0, column: 1), forward: true) == [0, 1, 0, 0])
        #expect(EditorEdits.neighbourCell(start, place, forward: true) == nil)
        #expect(EditorEdits.neighbourCell(start, place, forward: false) == [0, 1, 0, 0])
    }

    @Test func theBlockMenuMovesCopiesAndRemoves() throws {
        let doc = T.doc(T.p("a"), T.bullets(T.li(T.p("x")), T.li(T.p("y"))), T.p("b"))
        // the nearest list item, or the top-level block
        #expect(EditorEdits.movable(doc, [1, 1, 0]) == [1, 1])
        #expect(EditorEdits.movable(doc, [2]) == [2])
        let (up, path) = try #require(EditorEdits.move(doc, [1, 1], by: -1))
        #expect(T.json(up) == T.json(T.doc(T.p("a"), T.bullets(T.li(T.p("y")), T.li(T.p("x"))), T.p("b"))))
        #expect(path == [1, 0])
        #expect(EditorEdits.move(doc, [0], by: -1) == nil)
        #expect(T.json(EditorEdits.duplicate(doc, [0])) == T.json(T.doc(T.p("a"), T.p("a"), T.bullets(T.li(T.p("x")), T.li(T.p("y"))), T.p("b"))))
        #expect(T.json(EditorEdits.delete(T.doc(T.p("only")), [0])) == T.json(T.doc(T.p())))
    }

    @Test func pastedMarkdownJoinsTheTextAround() {
        #expect(EditorEdits.looksLikeMarkdown("# Title"))
        #expect(EditorEdits.looksLikeMarkdown("one\n- two"))
        #expect(EditorEdits.looksLikeMarkdown("a **b** c"))
        #expect(!EditorEdits.looksLikeMarkdown("plain words"))
        let pasted = [T.p("one").object!, T.h(2, "two").object!, T.p("three").object!]
        let (doc, caret) = EditorEdits.insertBlocks(T.doc(T.p("XY")), [0], 1, pasted)
        #expect(T.json(doc) == T.json(T.doc(T.p("Xone"), T.h(2, "two"), T.p("threeY"))))
        #expect(caret == Caret(path: [2], offset: 5))
        // a heading first: the text before stays its own paragraph
        let (heading, _) = EditorEdits.insertBlocks(T.doc(T.p("XY")), [0], 1, [T.h(1, "h").object!])
        #expect(T.json(heading) == T.json(T.doc(T.p("X"), T.h(1, "h"), T.p("Y"))))
    }

    @Test func datesReadAndAreOfferedAsMorrowDoes() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = JSEnvironment.calendar.timeZone
        let today = try #require(Daily.parseDateKey("2026-10-21"))
        let locale = Locale(identifier: "en_US")
        #expect(DateMentions.describe("2026-10-21", today: today, locale: locale) == "Today")
        #expect(DateMentions.describe("2026-10-22", today: today, locale: locale) == "Tomorrow")
        #expect(DateMentions.describe("2026-10-20", today: today, locale: locale) == "Yesterday")
        #expect(DateMentions.describe("2026-10-24", today: today, locale: locale) == "Saturday, Oct 24")
        #expect(DateMentions.describe("2026-12-01", today: today, locale: locale) == "Dec 1")
        #expect(DateMentions.describe("2027-01-05", today: today, locale: locale) == "Jan 5, 2027")
        #expect(DateMentions.describe("soon", today: today, locale: locale) == "soon")
        let keys = { (query: String) in DateMentions.suggestions(query, today: today).map(Daily.dateKey) }
        #expect(keys("") == ["2026-10-21", "2026-10-22", "2026-10-20", "2026-10-28"])
        // today, tomorrow, thursday (the same day as tomorrow, once) and tuesday
        #expect(keys("t") == ["2026-10-21", "2026-10-22", "2026-10-27"])
        #expect(keys("fri") == ["2026-10-23"])
        #expect(keys("2026-12-25") == ["2026-12-25"])
        #expect(keys("oct 30") == ["2026-10-30"])
        #expect(keys("week") == ["2026-10-28"])
    }
}
