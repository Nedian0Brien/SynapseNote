import Foundation
import Testing
@testable import SynapseNote

/// Pictures, files and formulas put in as Morrow's editor puts them (Media.ts insertFiles, tiptap's
/// insertContentAt and mathematics input rules), each written out as the JSON the editor saves. The expected
/// splits were read from ProseMirror's replaceWith in node, the rule matches from the rules' own code in node.
struct EditorMediaEditsTests {
    typealias T = EditorEditsTests
    typealias Caret = EditorEdits.Caret

    static let picture = FileMeta(id: "f1", name: "photo.final.png", type: "image/png", size: 10, createdAt: 0)
    static let report = FileMeta(id: "f2", name: "report.pdf", type: "application/pdf", size: 1_310_720, createdAt: 0)

    static func image(_ id: String, _ alt: String) -> JSValue { .object(.node("image", ("attrs", ["fileId": .string(id), "alt": .string(alt)]))) }

    @Test func filesGoInAsMorrowsMediaNodes() {
        let nodes = EditorEdits.mediaNodes([Self.picture, Self.report])
        #expect(JSJSON.stringify(.array(nodes.map(JSValue.object)))
            == #"[{"type":"image","attrs":{"fileId":"f1","alt":"photo.final"}},{"type":"fileAttachment","attrs":{"fileId":"f2","name":"report.pdf","size":1310720}}]"#)
        // in place of an empty paragraph, the caret in the paragraph after
        let (empty, caret) = EditorEdits.insertMedia(T.doc(T.p("a"), T.p()), [1], 0, [Self.picture])
        #expect(T.json(empty) == T.json(T.doc(T.p("a"), Self.image("f1", "photo.final"), T.p())))
        #expect(caret == Caret(path: [2], offset: 0))
        // at the end of a paragraph nothing is left after it
        let (end, endCaret) = EditorEdits.insertMedia(T.doc(T.p("ab"), T.p("z")), [0], 2, [Self.picture])
        #expect(T.json(end) == T.json(T.doc(T.p("ab"), Self.image("f1", "photo.final"), T.p(), T.p("z"))))
        #expect(endCaret == Caret(path: [2], offset: 0))
        // in the middle it splits; at the start of a paragraph it goes before it
        let middle = EditorEdits.insertMedia(T.doc(T.p("ab")), [0], 1, [Self.picture]).doc
        #expect(T.json(middle) == T.json(T.doc(T.p("a"), Self.image("f1", "photo.final"), T.p(), T.p("b"))))
        let start = EditorEdits.insertMedia(T.doc(T.p("ab")), [0], 0, [Self.picture]).doc
        #expect(T.json(start) == T.json(T.doc(Self.image("f1", "photo.final"), T.p(), T.p("ab"))))
    }

    @Test func filesPlayAndReadAsMorrowShowsThem() {
        #expect(EditorEdits.mediaKind("Song.MP3") == .audio)
        #expect(EditorEdits.mediaKind("clip.mov") == .video)
        #expect(EditorEdits.mediaKind("a.pdf") == .pdf)
        #expect(EditorEdits.mediaKind("notes.txt") == nil)
        #expect(EditorEdits.mediaKind("pdf") == nil)
        let sizes: [(Double, String)] = [(0, "0 B"), (1023, "1023 B"), (1024, "1 KB"), (1536, "2 KB"), (2560, "3 KB"),
                                         (1_310_720, "1.3 MB"), (5_905_580_032, "5.50 GB")]
        for (bytes, text) in sizes { #expect(EditorEdits.formatBytes(bytes) == text) }
        #expect(JSNumber.toFixed(2.5, 0) == "3")
        #expect(JSNumber.toFixed(1.005, 2) == "1.00")
        #expect(JSNumber.toFixed(9.995, 2) == "9.99")
        #expect(JSNumber.toFixed(99.96, 1) == "100.0")
    }

    @Test func formulaRulesMatchAsTipTapsDo() {
        typealias Rule = EditorEdits.MathRule
        #expect(EditorEdits.mathInputRule(textBefore: "a $$x^2$$") == .inline(range: NSRange(location: 2, length: 7), latex: "x^2"))
        #expect(EditorEdits.mathInputRule(textBefore: "see $x+1$") == .inline(range: NSRange(location: 4, length: 5), latex: "x+1"))
        #expect(EditorEdits.mathInputRule(textBefore: "price $5 and $10$") == .inline(range: NSRange(location: 13, length: 4), latex: "10"))
        #expect(EditorEdits.mathInputRule(textBefore: "é$x$") == .inline(range: NSRange(location: 1, length: 3), latex: "x"))
        #expect(EditorEdits.mathInputRule(textBefore: "$$$a+b$$$") == .block(latex: "a+b"))
        for text in ["a$x$", "$ x$", "\\$x$", "$$$a$$", "x $$y$$ z $$w$$", "$5", "a $\u{FFFC}$"] {
            #expect(EditorEdits.mathInputRule(textBefore: text) == nil, "\(text)")
        }
    }

    @Test func formulasGoInAndChange() throws {
        // $$$x$$$ typed as the whole block: the formula takes its place
        let math = JSValue.object(.node("blockMath", ("attrs", ["latex": "x"])))
        let (whole, wholeCaret) = EditorEdits.applyBlockMath(T.doc(T.p("$$$x$$$"), T.p("b")), [0], textLength: 7, caret: 7, latex: "x")
        #expect(T.json(whole) == T.json(T.doc(math, T.p("b"))))
        #expect(wholeCaret == Caret(path: [1], offset: 0))
        // with text after the caret: an empty block before and the rest after
        let (split, splitCaret) = EditorEdits.applyBlockMath(T.doc(T.p("$$$x$$$rest")), [0], textLength: 11, caret: 7, latex: "x")
        #expect(T.json(split) == T.json(T.doc(T.p(), math, T.p("rest"))))
        #expect(splitCaret == Caret(path: [2], offset: 0))
        // an inline formula changed, then taken out
        let formula = DocNode.node("inlineMath", ("attrs", ["latex": "a"]))
        let doc = T.doc(.object(.node("paragraph", ("content", [T.text("x "), .object(formula), T.text("!")]))))
        let changed = EditorEdits.settingInlineAtom(doc, [0], 2, .node("inlineMath", ("attrs", ["latex": "b^2"])))
        #expect(T.json(changed) == #"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x "},{"type":"inlineMath","attrs":{"latex":"b^2"}},{"type":"text","text":"!"}]}]}"#)
        #expect(T.json(EditorEdits.settingInlineAtom(doc, [0], 2, nil)) == T.json(T.doc(T.p("x !"))))
        // offsets that are not an atom change nothing
        #expect(T.json(EditorEdits.settingInlineAtom(doc, [0], 0, nil)) == T.json(doc))
        // a formula block put in from the slash menu, the caret in the paragraph after it
        let (inserted, caret) = EditorEdits.insertContent(T.doc(T.p(), T.p("z")), [0], 0, [.node("blockMath", ("attrs", ["latex": ""]))])
        #expect(T.json(inserted) == T.json(T.doc(.object(.node("blockMath", ("attrs", ["latex": ""]))), T.p("z"))))
        #expect(caret == Caret(path: [1], offset: 0))
        #expect(T.json(EditorEdits.settingBlock(inserted, [0], nil)) == T.json(T.doc(T.p("z"))))
    }
}
