import Foundation
import Testing
@testable import SynapseNote

/// What the keys and input rules of Morrow's editor do to a document (ProseMirror's commands with TipTap's
/// StarterKit, ListKeymap and input rules), as EditorEdits makes them. Each case is written out as the JSON the
/// editor would save.
struct EditorEditsTests {
    typealias Caret = EditorEdits.Caret

    static func text(_ value: String, _ marks: [String] = []) -> JSValue {
        marks.isEmpty
            ? .object(JSObject([("type", "text"), ("text", .string(value))]))
            : .object(JSObject([("type", "text"), ("marks", .array(marks.map { .object(InlineText.mark($0)) })), ("text", .string(value))]))
    }

    static func p(_ value: String = "") -> JSValue {
        value.isEmpty ? .object(.node("paragraph")) : .object(.node("paragraph", ("content", [text(value)])))
    }

    static func h(_ level: Int, _ value: String = "") -> JSValue {
        var node = DocNode.node("heading", ("attrs", ["level": .number(Double(level))]))
        if !value.isEmpty { node["content"] = [text(value)] }
        return .object(node)
    }

    static func code(_ value: String) -> JSValue {
        .object(.node("codeBlock", ("attrs", ["language": .null]), ("content", [text(value)])))
    }

    static func li(_ blocks: JSValue...) -> JSValue { .object(.node("listItem", ("content", .array(blocks)))) }
    static func task(_ checked: Bool, _ blocks: JSValue...) -> JSValue {
        .object(.node("taskItem", ("attrs", ["checked": .bool(checked)]), ("content", .array(blocks))))
    }
    static func bullets(_ items: JSValue...) -> JSValue { .object(.node("bulletList", ("content", .array(items)))) }
    static func numbers(_ start: Int, _ items: JSValue...) -> JSValue {
        .object(.node("orderedList", ("attrs", ["start": .number(Double(start)), "type": .null]), ("content", .array(items))))
    }
    static func tasks(_ items: JSValue...) -> JSValue { .object(.node("taskList", ("content", .array(items)))) }
    static func quote(_ blocks: JSValue...) -> JSValue { .object(.node("blockquote", ("content", .array(blocks)))) }
    static let rule: JSValue = .object(.node("horizontalRule"))

    static func doc(_ blocks: JSValue...) -> DocNode { .node("doc", ("content", .array(blocks))) }

    static func json(_ doc: DocNode) -> String { JSJSON.stringify(.object(doc)) }

    // MARK: Enter

    @Test func enterSplitsBlocks() {
        let (middle, caret) = EditorEdits.enter(Self.doc(Self.p("hello")), [0], 2)
        #expect(Self.json(middle) == Self.json(Self.doc(Self.p("he"), Self.p("llo"))))
        #expect(caret == Caret(path: [1], offset: 0))
        // a heading split at its end goes on as a paragraph, in its middle as two headings
        #expect(Self.json(EditorEdits.enter(Self.doc(Self.h(2, "Title")), [0], 5).doc) == Self.json(Self.doc(Self.h(2, "Title"), Self.p())))
        #expect(Self.json(EditorEdits.enter(Self.doc(Self.h(2, "Title")), [0], 2).doc) == Self.json(Self.doc(Self.h(2, "Ti"), Self.h(2, "tle"))))
        // marks stay with their text on both sides
        let marked = Self.doc(.object(.node("paragraph", ("content", [Self.text("bold", ["bold"])]))))
        #expect(Self.json(EditorEdits.enter(marked, [0], 2).doc)
            == Self.json(Self.doc(.object(.node("paragraph", ("content", [Self.text("bo", ["bold"])]))), .object(.node("paragraph", ("content", [Self.text("ld", ["bold"])]))))))
    }

    @Test func enterInCodeAddsALineAndThreeLeave() {
        let (one, caret) = EditorEdits.enter(Self.doc(Self.code("let a")), [0], 5)
        #expect(Self.json(one) == Self.json(Self.doc(Self.code("let a\n"))))
        #expect(caret == Caret(path: [0], offset: 6))
        let (out, exit) = EditorEdits.enter(Self.doc(Self.code("let a\n\n")), [0], 7)
        #expect(Self.json(out) == Self.json(Self.doc(Self.code("let a"), Self.p())))
        #expect(exit == Caret(path: [1], offset: 0))
    }

    @Test func enterInListsSplitsItemsAndLeavesWhenEmpty() {
        let (split, caret) = EditorEdits.enter(Self.doc(Self.bullets(Self.li(Self.p("one two")))), [0, 0, 0], 3)
        #expect(Self.json(split) == Self.json(Self.doc(Self.bullets(Self.li(Self.p("one")), Self.li(Self.p(" two"))))))
        #expect(caret == Caret(path: [0, 1, 0], offset: 0))
        // a new task starts unticked
        let ticked = EditorEdits.enter(Self.doc(Self.tasks(Self.task(true, Self.p("done")))), [0, 0, 0], 4).doc
        #expect(Self.json(ticked) == Self.json(Self.doc(Self.tasks(Self.task(true, Self.p("done")), Self.task(false, Self.p())))))
        // the item's nested blocks go with the second half
        let nested = Self.doc(Self.bullets(Self.li(Self.p("ab"), Self.bullets(Self.li(Self.p("child"))))))
        #expect(Self.json(EditorEdits.enter(nested, [0, 0, 0], 1).doc)
            == Self.json(Self.doc(Self.bullets(Self.li(Self.p("a")), Self.li(Self.p("b"), Self.bullets(Self.li(Self.p("child"))))))))
        // an empty item leaves the list
        let (left, out) = EditorEdits.enter(Self.doc(Self.bullets(Self.li(Self.p("one")), Self.li(Self.p()))), [0, 1, 0], 0)
        #expect(Self.json(left) == Self.json(Self.doc(Self.bullets(Self.li(Self.p("one"))), Self.p())))
        #expect(out == Caret(path: [1], offset: 0))
    }

    @Test func enterOnAnEmptyQuoteLineLeavesTheQuote() {
        let (last, caret) = EditorEdits.enter(Self.doc(Self.quote(Self.p("said"), Self.p())), [0, 1], 0)
        #expect(Self.json(last) == Self.json(Self.doc(Self.quote(Self.p("said")), Self.p())))
        #expect(caret == Caret(path: [1], offset: 0))
        let (middle, split) = EditorEdits.enter(Self.doc(Self.quote(Self.p("a"), Self.p(), Self.p("b"))), [0, 1], 0)
        #expect(Self.json(middle) == Self.json(Self.doc(Self.quote(Self.p("a")), Self.quote(Self.p(), Self.p("b")))))
        #expect(split == Caret(path: [1, 0], offset: 0))
    }

    // MARK: Backspace and Delete

    @Test func backspaceJoinsAndLifts() throws {
        let (joined, caret) = try #require(EditorEdits.backspaceAtStart(Self.doc(Self.p("one"), Self.h(1, "two")), [1]))
        #expect(Self.json(joined) == Self.json(Self.doc(Self.p("onetwo"))))
        #expect(caret == Caret(path: [0], offset: 3))
        // after a list, into its last item (ListKeymap)
        let list = Self.doc(Self.bullets(Self.li(Self.p("a")), Self.li(Self.p("b"), Self.bullets(Self.li(Self.p("c"))))), Self.p("d"))
        let (intoList, listCaret) = try #require(EditorEdits.backspaceAtStart(list, [1]))
        #expect(Self.json(intoList) == Self.json(Self.doc(Self.bullets(Self.li(Self.p("a")), Self.li(Self.p("b"), Self.bullets(Self.li(Self.p("cd"))))))))
        #expect(listCaret == Caret(path: [0, 1, 1, 0, 0], offset: 1))
        // the start of an item lifts it
        let (lifted, _) = try #require(EditorEdits.backspaceAtStart(Self.doc(Self.bullets(Self.li(Self.p("a")), Self.li(Self.p("b")))), [0, 1, 0]))
        #expect(Self.json(lifted) == Self.json(Self.doc(Self.bullets(Self.li(Self.p("a"))), Self.p("b"))))
        // the start of a quote leaves it
        let (unquoted, _) = try #require(EditorEdits.backspaceAtStart(Self.doc(Self.quote(Self.p("a"), Self.p("b"))), [0, 0]))
        #expect(Self.json(unquoted) == Self.json(Self.doc(Self.p("a"), Self.quote(Self.p("b")))))
        // an empty heading at the start becomes a paragraph; a first paragraph does nothing
        #expect(Self.json(try #require(EditorEdits.backspaceAtStart(Self.doc(Self.h(1), Self.p("x")), [0])).doc) == Self.json(Self.doc(Self.p(), Self.p("x"))))
        #expect(EditorEdits.backspaceAtStart(Self.doc(Self.p("x")), [0]) == nil)
        // a divider before: an empty block goes, otherwise the divider
        let (gone, goneCaret) = try #require(EditorEdits.backspaceAtStart(Self.doc(Self.p("a"), Self.rule, Self.p()), [2]))
        #expect(Self.json(gone) == Self.json(Self.doc(Self.p("a"), Self.rule)))
        #expect(goneCaret == Caret(path: [0], offset: 1))
        #expect(Self.json(try #require(EditorEdits.backspaceAtStart(Self.doc(Self.p("a"), Self.rule, Self.p("b")), [2])).doc) == Self.json(Self.doc(Self.p("a"), Self.p("b"))))
        // into code the text comes without marks
        let markedAfterCode = Self.doc(Self.code("x"), .object(.node("paragraph", ("content", [Self.text("y", ["bold"])]))))
        #expect(Self.json(try #require(EditorEdits.backspaceAtStart(markedAfterCode, [1])).doc) == Self.json(Self.doc(Self.code("xy"))))
    }

    @Test func deleteJoinsTheNextBlock() throws {
        let (joined, caret) = try #require(EditorEdits.deleteAtEnd(Self.doc(Self.p("a"), Self.quote(Self.p("b"))), [0]))
        #expect(Self.json(joined) == Self.json(Self.doc(Self.p("ab"))))
        #expect(caret == Caret(path: [0], offset: 1))
        #expect(Self.json(try #require(EditorEdits.deleteAtEnd(Self.doc(Self.p("a"), Self.rule, Self.p("b")), [0])).doc) == Self.json(Self.doc(Self.p("a"), Self.p("b"))))
        #expect(EditorEdits.deleteAtEnd(Self.doc(Self.p("a")), [0]) == nil)
    }

    // MARK: lists

    @Test func tabAndShiftTabMoveItems() throws {
        let flat = Self.doc(Self.bullets(Self.li(Self.p("a")), Self.li(Self.p("b")), Self.li(Self.p("c"))))
        #expect(EditorEdits.indent(flat, [0, 0]) == nil)
        let (nested, caret) = try #require(EditorEdits.indent(flat, [0, 1]))
        #expect(Self.json(nested) == Self.json(Self.doc(Self.bullets(Self.li(Self.p("a"), Self.bullets(Self.li(Self.p("b")))), Self.li(Self.p("c"))))))
        #expect(caret == Caret(path: [0, 0, 1, 0, 0], offset: 0))
        // the next one joins the same nested list
        let (twice, _) = try #require(EditorEdits.indent(nested, [0, 1]))
        #expect(Self.json(twice) == Self.json(Self.doc(Self.bullets(Self.li(Self.p("a"), Self.bullets(Self.li(Self.p("b")), Self.li(Self.p("c"))))))))
        // out again: the items after it become its children
        let (out, outCaret) = try #require(EditorEdits.outdent(twice, [0, 0, 1, 0]))
        #expect(Self.json(out) == Self.json(Self.doc(Self.bullets(Self.li(Self.p("a")), Self.li(Self.p("b"), Self.bullets(Self.li(Self.p("c"))))))))
        #expect(outCaret == Caret(path: [0, 1, 0], offset: 0))
        // a top-level numbered item leaves its list; the rest keeps the list's start
        let numbered = Self.doc(Self.numbers(1, Self.li(Self.p("a")), Self.li(Self.p("b")), Self.li(Self.p("c"))))
        #expect(Self.json(try #require(EditorEdits.outdent(numbered, [0, 1])).doc)
            == Self.json(Self.doc(Self.numbers(1, Self.li(Self.p("a"))), Self.p("b"), Self.numbers(1, Self.li(Self.p("c"))))))
    }

    @Test func listsToggleAndJoin() {
        // into a list, joining the one before
        let (joined, caret) = EditorEdits.toggleList(Self.doc(Self.bullets(Self.li(Self.p("a"))), Self.h(1, "b")), [1], "bulletList")
        #expect(Self.json(joined) == Self.json(Self.doc(Self.bullets(Self.li(Self.p("a")), Self.li(Self.p("b"))))))
        #expect(caret == Caret(path: [0, 1, 0], offset: 0))
        // the same kind again lifts the item out
        #expect(Self.json(EditorEdits.toggleList(joined, [0, 1, 0], "bulletList").doc) == Self.json(Self.doc(Self.bullets(Self.li(Self.p("a"))), Self.p("b"))))
        // bullets to numbers changes the whole list
        #expect(Self.json(EditorEdits.toggleList(joined, [0, 0, 0], "orderedList").doc)
            == Self.json(Self.doc(Self.numbers(1, Self.li(Self.p("a")), Self.li(Self.p("b"))))))
        // to a checklist only the item moves
        #expect(Self.json(EditorEdits.toggleList(joined, [0, 1, 0], "taskList").doc)
            == Self.json(Self.doc(Self.bullets(Self.li(Self.p("a"))), Self.tasks(Self.task(false, Self.p("b"))))))
        #expect(Self.json(EditorEdits.setChecked(Self.doc(Self.tasks(Self.task(false, Self.p("x")))), [0, 0], true)) == Self.json(Self.doc(Self.tasks(Self.task(true, Self.p("x"))))))
    }

    @Test func blockTypesChange() {
        #expect(Self.json(EditorEdits.setBlockType(Self.doc(Self.p("x")), [0], "heading", level: 2)) == Self.json(Self.doc(Self.h(2, "x"))))
        #expect(Self.json(EditorEdits.setBlockType(Self.doc(Self.h(2, "x")), [0], "heading", level: 2, toggle: true)) == Self.json(Self.doc(Self.p("x"))))
        let broken = Self.doc(.object(.node("paragraph", ("content", [Self.text("a", ["bold"]), .object(.node("hardBreak")), Self.text("b")]))))
        #expect(Self.json(EditorEdits.setBlockType(broken, [0], "codeBlock")) == Self.json(Self.doc(Self.code("a\nb"))))
        #expect(Self.json(EditorEdits.setBlockType(Self.doc(Self.code("a\nb")), [0], "paragraph"))
            == Self.json(Self.doc(.object(.node("paragraph", ("content", [Self.text("a"), .object(.node("hardBreak")), Self.text("b")]))))))
        // the first block of an item stays a paragraph
        let list = Self.doc(Self.bullets(Self.li(Self.p("x"))))
        #expect(EditorEdits.setBlockType(list, [0, 0, 0], "heading", level: 1) == list)
        let (ruled, caret) = EditorEdits.insertRule(Self.doc(Self.p("ab")), [0], 1)
        #expect(Self.json(ruled) == Self.json(Self.doc(Self.p("a"), Self.rule, Self.p("b"))))
        #expect(caret == Caret(path: [2], offset: 0))
        #expect(Self.json(EditorEdits.insertRule(Self.doc(Self.p()), [0], 0).doc) == Self.json(Self.doc(Self.rule, Self.p())))
    }

    // MARK: input rules

    static func typed(_ doc: DocNode, _ path: EditorEdits.Path, _ before: String) -> DocNode? {
        EditorEdits.blockInputRule(doc, path, textBefore: before, caretAfter: (before as NSString).length)?.doc
    }

    @Test func blockInputRulesFollowTipTap() {
        #expect(Self.typed(Self.doc(Self.p("## ")), [0], "## ").map(Self.json) == Self.json(Self.doc(Self.h(2))))
        #expect(Self.typed(Self.doc(Self.p("#### ")), [0], "#### ") == nil)
        #expect(Self.typed(Self.doc(Self.p("- ")), [0], "- ").map(Self.json) == Self.json(Self.doc(Self.bullets(Self.li(Self.p())))))
        #expect(Self.typed(Self.doc(Self.p("[x] ")), [0], "[x] ").map(Self.json) == Self.json(Self.doc(Self.tasks(Self.task(true, Self.p())))))
        #expect(Self.typed(Self.doc(Self.p("> ")), [0], "> ").map(Self.json) == Self.json(Self.doc(Self.quote(Self.p()))))
        #expect(Self.typed(Self.doc(Self.p("```swift ")), [0], "```swift ").map(Self.json)
            == Self.json(Self.doc(.object(.node("codeBlock", ("attrs", ["language": "swift"]))))))
        #expect(Self.typed(Self.doc(Self.p("---")), [0], "---").map(Self.json) == Self.json(Self.doc(Self.rule, Self.p())))
        // text after the caret stays
        #expect(EditorEdits.blockInputRule(Self.doc(Self.p("# Title")), [0], textBefore: "# ", caretAfter: 2).map { Self.json($0.doc) }
            == Self.json(Self.doc(Self.h(1, "Title"))))
        // numbers start where typed and join a list only when they carry on
        #expect(Self.typed(Self.doc(Self.p("4. ")), [0], "4. ").map(Self.json) == Self.json(Self.doc(Self.numbers(4, Self.li(Self.p())))))
        let two = Self.numbers(1, Self.li(Self.p("a")), Self.li(Self.p("b")))
        #expect(Self.typed(Self.doc(two, Self.p("3. ")), [1], "3. ").map(Self.json) == Self.json(Self.doc(Self.numbers(1, Self.li(Self.p("a")), Self.li(Self.p("b")), Self.li(Self.p())))))
        #expect(Self.typed(Self.doc(two, Self.p("7. ")), [1], "7. ").map(Self.json) == Self.json(Self.doc(two, Self.numbers(7, Self.li(Self.p())))))
        // the first block of an item takes no wrapping and no heading
        #expect(Self.typed(Self.doc(Self.bullets(Self.li(Self.p("- ")))), [0, 0, 0], "- ") == nil)
        #expect(Self.typed(Self.doc(Self.bullets(Self.li(Self.p("# ")))), [0, 0, 0], "# ") == nil)
        #expect(Self.typed(Self.doc(Self.code("# ")), [0], "# ") == nil)
    }

    @Test func markInputRulesFindTheMarkers() throws {
        let bold = try #require(EditorEdits.markInputRule(textBefore: "say **loud**"))
        #expect(bold.mark == "bold" && bold.whole == NSRange(location: 4, length: 8) && bold.inner == NSRange(location: 6, length: 4))
        #expect(EditorEdits.markInputRule(textBefore: "a *b*")?.mark == "italic")
        #expect(EditorEdits.markInputRule(textBefore: "x`code`")?.whole == NSRange(location: 1, length: 6))
        #expect(EditorEdits.markInputRule(textBefore: "==hi==")?.mark == "highlight")
        #expect(EditorEdits.markInputRule(textBefore: "a **b") == nil)
        #expect(EditorEdits.markInputRule(textBefore: "plain") == nil)
    }

    // MARK: marks

    @Test func marksAddAsProseMirrorAddsThem() {
        let bold = InlineText.mark("bold"), code = InlineText.mark("code"), italic = InlineText.mark("italic")
        let link = InlineText.mark("link", [("href", "https://a.example")])
        #expect(InlineText.addToSet([italic], bold).map(\.type) == ["bold", "italic"])
        #expect(InlineText.addToSet([bold, italic], code).map(\.type) == ["code"])
        #expect(InlineText.addToSet([code], bold).map(\.type) == ["code"])
        let other = InlineText.mark("link", [("href", "https://b.example")])
        #expect(InlineText.addToSet([link, bold], other).map { $0.attrs?["href"] ?? .null } == ["https://b.example", .null])
        #expect(JSJSON.stringify(.object(link)) == #"{"type":"link","attrs":{"href":"https://a.example","target":null,"rel":"noopener noreferrer nofollow","class":null,"title":null}}"#)
    }

    @Test func togglingMarksOverText() throws {
        let text = InlineText.attributed([JSObject([("type", "text"), ("text", "ab")]), JSObject([("type", "text"), ("marks", [.object(InlineText.mark("bold"))]), ("text", "cd")])])
        // part of the range lacks bold, so it all becomes bold
        let all = InlineText.toggleMark(text, NSRange(location: 0, length: 4), InlineText.mark("bold"))
        #expect(JSJSON.stringify(.array(InlineText.content(all).map(JSValue.object))) == #"[{"type":"text","marks":[{"type":"bold"}],"text":"abcd"}]"#)
        let none = InlineText.toggleMark(all, NSRange(location: 1, length: 2), InlineText.mark("bold"))
        #expect(InlineText.content(none).map { $0.text ?? "" } == ["a", "bc", "d"])
        let linked = InlineText.addMark(text, NSRange(location: 1, length: 2), InlineText.mark("link", [("href", "https://a.example")]))
        #expect(InlineText.markRange(linked, at: 2, type: "link") == NSRange(location: 1, length: 2))
        #expect(InlineText.markRange(linked, at: 3, type: "link") == NSRange(location: 1, length: 2))
        #expect(InlineText.markRange(linked, at: 0, type: "link") == nil)
    }
}
