import Foundation
import Testing
@testable import SynapseNote

/// What 11d-5c-2 adds around the editor: every node and mark Morrow knows is drawn natively, the history
/// dialog folds unchanged lines as Morrow's DiffView does (expected rows from the component's own code in node),
/// and an inline canvas resizes within Morrow's limits.
struct EditorEmbedsTests {
    @Test func everyKnownTypeIsDrawn() {
        #expect(Doc.knownNodeTypes.isSubset(of: EditorScreen.nodes))
        #expect(Doc.knownMarkTypes.isSubset(of: EditorScreen.marks))
        let embed = DocNode.node("doc", ("content", [.object(.node("paragraph", ("content", [.object(.node("pageLink", ("attrs", ["id": "p", "embed": true])))])))]))
        #expect(EditorScreen.draws(embed))
    }

    @Test func historyFoldsAsMorrowsDiffView() {
        func same(_ count: Int, _ prefix: String) -> [Diff.Line] { (0..<count).map { Diff.Line(kind: .same, text: "\(prefix)\($0)") } }
        func text(_ rows: [HistoryText.Row]) -> [String] {
            rows.map { row in
                switch row {
                case .gap(let count): "gap\(count)"
                case .line(let line): "\(line.kind.rawValue.prefix(1))\(line.text)"
                }
            }
        }
        let first = same(10, "a") + [Diff.Line(kind: .added, text: "x")] + same(3, "b") + [Diff.Line(kind: .removed, text: "y")] + same(9, "c")
        #expect(text(HistoryText.rows(first)) == ["gap8", "sa8", "sa9", "ax", "sb0", "sb1", "sb2", "ry", "sc0", "sc1", "gap7"])
        #expect(text(HistoryText.rows(same(7, "a"))) == ["gap7"])
        let middle = [Diff.Line(kind: .added, text: "x")] + same(7, "b") + [Diff.Line(kind: .added, text: "z")]
        #expect(text(HistoryText.rows(middle)) == ["ax", "sb0", "sb1", "gap3", "sb5", "sb6", "az"])
        #expect(HistoryText.words(.node("doc", ("content", [.object(.node("paragraph", ("content", [.object(JSObject([("type", "text"), ("text", "two  words\u{00A0}three")]))])))]))) == 3)
    }

    @Test func inlineCanvasesResizeWithinMorrowsLimits() {
        let start = AppPreferences.CanvasSize(width: nil, height: 420)
        #expect(EmbeddedCanvas.resized(from: start, room: 700, by: CGSize(width: -100, height: 50.4)) == .init(width: 600, height: 470))
        #expect(EmbeddedCanvas.resized(from: start, room: 700, by: CGSize(width: -600, height: -400)) == .init(width: 360, height: 180))
        // as wide as the room: no width, the page's
        #expect(EmbeddedCanvas.resized(from: .init(width: 500, height: 420), room: 700, by: CGSize(width: 400, height: 5000)) == .init(width: nil, height: 1600))
        #expect(AppPreferences.readCanvasSizes(["a": ["height": 300.0, "width": 400.0], "b": ["width": 3.0], "c": ["height": 200.0]])
            == ["a": .init(width: 400, height: 300), "c": .init(width: nil, height: 200)])
    }
}
