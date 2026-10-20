import Foundation
import Testing
@testable import SynapseNote

/// Morrow's canvas changes (src/app/components/CanvasView.tsx) as CanvasEdits makes them. strokePath and inkColor
/// are compared with Morrow's own functions run in node (Fixtures/core/expected/canvas.json); the rest follow the
/// component line by line.
struct CanvasEditsTests {
    typealias Point = CanvasEdits.Point

    static func card(_ id: String, _ x: Double, _ y: Double, _ width: Double = 100, _ height: Double = 50, type: String = "text") -> JSObject {
        JSObject([("id", .string(id)), ("x", .number(x)), ("y", .number(y)), ("width", .number(width)), ("height", .number(height)),
                  ("type", .string(type)), ("text", "")])
    }

    static func ids() -> () -> String {
        var next = 0
        return {
            next += 1
            return String(format: "%08x-aaaa-bbbb-cccc-%012x", next, next)
        }
    }

    @Test func strokesAndInkMatchMorrow() throws {
        let fixture = try CoreFixtures.load("canvas")
        for item in try #require(fixture["strokePath"]?.array) {
            let points = (item["points"]?.array ?? []).map { $0.number ?? 0 }
            #expect(CanvasEdits.strokePath(points) == item["path"]?.string, "strokePath \(points)")
        }
        for item in try #require(fixture["inkColor"]?.array) {
            // nil stands for Morrow's var(--text), the text colour
            let expected = item["ink"]?.string == "var(--text)" ? nil : item["ink"]?.string
            #expect(CanvasEdits.inkColor(item["color"]?.string) == expected)
        }
    }

    @Test func edgesMeetTheFacingSides() throws {
        let a = Self.card("a", 0, 0, 100, 50)
        #expect(CanvasEdits.anchor(a, "top") == Point(x: 50, y: 0))
        #expect(CanvasEdits.anchor(a, "bottom") == Point(x: 50, y: 50))
        #expect(CanvasEdits.anchor(a, "left") == Point(x: 0, y: 25))
        #expect(CanvasEdits.anchor(a, "right") == Point(x: 100, y: 25))
        // the side is chosen by distance relative to the card's size
        #expect(CanvasEdits.facing(a, 200, 30) == "right")
        #expect(CanvasEdits.facing(a, -100, 20) == "left")
        #expect(CanvasEdits.facing(a, 60, 200) == "bottom")
        #expect(CanvasEdits.facing(a, 120, -60) == "top")

        // the bend is half the distance, between 30 and 150; a loose end has no bend
        let short = CanvasEdits.edgeControls(from: Point(x: 0, y: 0), fromSide: "right", to: Point(x: 40, y: 0), toSide: "left")
        #expect(short.0 == Point(x: 30, y: 0) && short.1 == Point(x: 10, y: 0))
        let long = CanvasEdits.edgeControls(from: Point(x: 0, y: 0), fromSide: "bottom", to: Point(x: 0, y: 1000), toSide: nil)
        #expect(long.0 == Point(x: 0, y: 150) && long.1 == Point(x: 0, y: 1000))

        let b = Self.card("b", 300, 0, 100, 50)
        let edge = JSObject([("id", "e"), ("fromNode", "a"), ("toNode", "b")])
        let ends = try #require(CanvasEdits.edgeEnds(edge, CanvasFile.Data(nodes: [a, b], edges: [edge])))
        #expect(ends.fromSide == "right" && ends.toSide == "left")
        #expect(ends.from == Point(x: 100, y: 25) && ends.to == Point(x: 300, y: 25))
    }

    @Test func viewportsFitAndZoomAroundAPoint() {
        #expect(CanvasEdits.fit(CanvasFile.Data(), width: 800, height: 600) == .start)
        let data = CanvasFile.Data(nodes: [Self.card("a", 0, 0, 200, 100), Self.card("b", 300, 200, 100, 100)])
        // span 400 by 300 in 800 by 600: (800-120)/400 = 1.7, (600-120)/300 = 1.6, capped at 1.2
        #expect(CanvasEdits.fit(data, width: 800, height: 600) == CanvasEdits.Viewport(x: 400 - 200 * 1.2, y: 300 - 150 * 1.2, zoom: 1.2))
        let small = CanvasEdits.fit(data, width: 520, height: 600)
        #expect(small.zoom == 1)
        let one = CanvasFile.Data(nodes: [Self.card("a", 10, 10, 0.5, 0.5)])
        #expect(CanvasEdits.fit(one, width: 100, height: 100).zoom == 0.1)

        let view = CanvasEdits.Viewport(x: 0, y: 0, zoom: 1)
        let zoomed = CanvasEdits.zoomAt(view, 2, Point(x: 100, y: 50))
        #expect(zoomed == CanvasEdits.Viewport(x: -100, y: -50, zoom: 2))
        #expect(zoomed.toWorld(Point(x: 100, y: 50)) == Point(x: 100, y: 50))
        #expect(CanvasEdits.zoomAt(view, 100, Point(x: 0, y: 0)).zoom == 3)
        #expect(CanvasEdits.zoomAt(view, 0.001, Point(x: 0, y: 0)).zoom == 0.1)
    }

    @Test func cardsAreAddedInMorrowsShape() {
        #expect(CanvasEdits.newNodeId { "0123abcd-4567-89ef-0123-456789abcdef" } == "0123abcd456789ef")
        // a double click at (-0.5, 10.5): Math.round(-125.5) is -125, Math.round(-19.5) is -19
        let card = CanvasEdits.textCard(at: Point(x: -0.5, y: 10.5), id: "n")
        #expect(JSJSON.stringify(.object(card)) == #"{"type":"text","text":"","x":-125,"y":-19,"width":250,"height":60,"id":"n"}"#)
        let group = CanvasEdits.groupNode(at: Point(x: 0, y: 0), id: "g")
        #expect(JSJSON.stringify(.object(group)) == #"{"type":"group","label":"Group","x":-200,"y":-150,"width":400,"height":300,"id":"g"}"#)
        let page = CanvasEdits.pageNode("p1", at: Point(x: 0, y: 0), id: "q")
        #expect(JSJSON.stringify(.object(page)) == #"{"type":"page","pageId":"p1","x":-200,"y":-120,"width":400,"height":240,"id":"q"}"#)

        var data = CanvasEdits.add(CanvasFile.Data(), card)
        data = CanvasEdits.add(data, group)
        #expect(data.nodes.map(CanvasEdits.id) == ["g", "n"])
        data = CanvasEdits.update(data, "n", [("text", "hello"), ("color", "3")])
        #expect(data.nodes[1]["text"] == "hello" && data.nodes[1]["color"] == "3")
        data = CanvasEdits.update(data, "n", [("color", nil)])
        #expect(data.nodes[1]["color"] == nil)
    }

    @Test func selectingMovingAndRemoving() {
        #expect(CanvasEdits.select([], "a", shift: false) == ["a"])
        #expect(CanvasEdits.select(["a", "b"], "a", shift: false) == ["a", "b"])
        #expect(CanvasEdits.select(["a", "b"], "c", shift: false) == ["c"])
        #expect(CanvasEdits.select(["a", "b"], "a", shift: true) == ["b"])
        #expect(CanvasEdits.select(["a"], "c", shift: true) == ["a", "c"])

        let group = Self.card("g", 0, 0, 400, 300, type: "group")
        let inside = Self.card("i", 10, 10, 100, 50)
        let across = Self.card("x", 350, 10, 100, 50)
        let data = CanvasFile.Data(nodes: [group, inside, across], edges: [JSObject([("id", "e"), ("fromNode", "i"), ("toNode", "x")])])
        let origins = CanvasEdits.movingSet(data, ["g"])
        #expect(Set(origins.keys) == ["g", "i"])
        #expect(!CanvasEdits.startsMoving(dx: 2, dy: 2))
        #expect(CanvasEdits.startsMoving(dx: 3, dy: 0))
        let moved = CanvasEdits.move(data, origins, dx: 10.5, dy: -0.5)
        #expect(moved.nodes.map { CanvasEdits.number($0, "x") } == [11, 21, 350])
        #expect(moved.nodes.map { CanvasEdits.number($0, "y") } == [0, 10, 10])

        #expect(CanvasEdits.remove(data, nodes: [], edge: nil) == nil)
        #expect(CanvasEdits.remove(data, nodes: [], edge: "e")?.edges.isEmpty == true)
        let removed = CanvasEdits.remove(data, nodes: ["i"], edge: nil)
        #expect(removed?.nodes.map(CanvasEdits.id) == ["g", "x"])
        #expect(removed?.edges.isEmpty == true)

        let nudged = CanvasEdits.nudge(data, ["i"], dx: -50, dy: 0)
        #expect(CanvasEdits.number(nudged.nodes[1], "x") == -40)
    }

    @Test func resizingKeepsAMinimumAndStretchesDrawings() throws {
        let data = CanvasFile.Data(nodes: [Self.card("a", 0, 0, 100, 50)])
        let small = CanvasEdits.resize(data, "a", width: 100, height: 50, dx: -200, dy: -200, zoom: 1)
        #expect(CanvasEdits.number(small.nodes[0], "width") == 60 && CanvasEdits.number(small.nodes[0], "height") == 40)
        let zoomed = CanvasEdits.resize(data, "a", width: 100, height: 50, dx: 50, dy: 25, zoom: 2)
        #expect(CanvasEdits.number(zoomed.nodes[0], "width") == 125 && CanvasEdits.number(zoomed.nodes[0], "height") == 63)

        let stroke: JSValue = ["points": [10, 20, 30, 40], "width": 4]
        let drawing = JSObject([("id", "d"), ("type", "drawing"), ("x", 0), ("y", 0), ("width", 100), ("height", 100), ("strokes", [stroke])])
        let stretched = CanvasEdits.resize(CanvasFile.Data(nodes: [drawing]), "d", width: 100, height: 100, dx: 100, dy: -50, zoom: 1)
        let finished = CanvasEdits.finishResize(stretched, "d", width: 100, height: 100)
        #expect(finished.data.nodes[0]["strokes"]?.array?[0]["points"] == [20, 10, 60, 20])
        // the undo entry has the size before, the lines as they are now, as in Morrow
        #expect(CanvasEdits.number(finished.before.nodes[0], "width") == 100)
        #expect(finished.before.nodes[0]["strokes"] == finished.data.nodes[0]["strokes"])
    }

    @Test func connectingJoinsOrMakesACard() throws {
        let a = Self.card("a", 0, 0, 100, 50)
        let b = Self.card("b", 300, 0, 100, 50)
        let group = Self.card("g", 250, -50, 300, 300, type: "group")
        let data = CanvasFile.Data(nodes: [group, a, b])
        #expect(CanvasEdits.connectTarget(data, from: "a", at: Point(x: 350, y: 25)).map(CanvasEdits.id) == "b")
        #expect(CanvasEdits.connectTarget(data, from: "a", at: Point(x: 260, y: 200)) == nil)
        #expect(CanvasEdits.connectTarget(data, from: "a", at: Point(x: 50, y: 25)) == nil)

        let joined = CanvasEdits.connect(data, from: "a", side: "right", at: Point(x: 350, y: 25), newId: Self.ids())
        #expect(joined.newCard == nil)
        #expect(JSJSON.stringify(.object(joined.data.edges[0])) == #"{"id":"00000001aaaabbbb","fromNode":"a","toNode":"b","fromSide":"right","toSide":"left"}"#)

        let made = CanvasEdits.connect(data, from: "a", side: "bottom", at: Point(x: 50, y: 400), newId: Self.ids())
        let id = try #require(made.newCard)
        #expect(id == "00000001aaaabbbb")
        #expect(CanvasEdits.number(made.data.nodes.last!, "x") == -75 && CanvasEdits.number(made.data.nodes.last!, "y") == 370)
        #expect(JSJSON.stringify(.object(made.data.edges[0])) == #"{"id":"00000001aaaabbbbe","fromNode":"a","toNode":"00000001aaaabbbb","fromSide":"bottom","toSide":"top"}"#)
    }

    @Test func linesJoinTheDrawingNearbyAndEraseAway() throws {
        let ink = CanvasEdits.Ink(color: "2", width: 4)
        let first = CanvasEdits.finishStroke(CanvasFile.Data(), [100, 100, 110.04, 120], highlighter: false, ink: ink, activeDrawing: nil, newId: Self.ids())
        let drawing = first.data.nodes[0]
        // pad = 4/2 + 6 = 8: x = floor(100 - 8) = 92, width = ceil(110.04 + 8 - 92) = 27
        #expect(JSJSON.stringify(.object(drawing)) == #"{"id":"00000001aaaabbbb","type":"drawing","x":92,"y":92,"width":27,"height":36,"strokes":[{"points":[8,8,18,28],"width":4,"color":"2"}]}"#)

        // a dot becomes a short line; a highlighter is three and a half times as wide
        let dot = CanvasEdits.finishStroke(CanvasFile.Data(), [5, 5], highlighter: true, ink: CanvasEdits.Ink(color: nil, width: 2), activeDrawing: nil, newId: Self.ids())
        let dotStroke = dot.data.nodes[0]["strokes"]?.array?[0]
        #expect(dotStroke?["width"] == 7 && dotStroke?["highlighter"] == true && dotStroke?["points"]?.array?.count == 4)

        // the next line near the active drawing joins it
        let second = CanvasEdits.finishStroke(first.data, [200, 100, 210, 110], highlighter: false, ink: ink, activeDrawing: first.drawing, newId: Self.ids())
        #expect(second.data.nodes.count == 1 && second.drawing == first.drawing)
        #expect(second.data.nodes[0]["strokes"]?.array?.count == 2)
        #expect(CanvasEdits.number(second.data.nodes[0], "width") == 126)
        // far away, or with no active drawing, it starts another
        let far = CanvasEdits.finishStroke(first.data, [900, 900, 910, 910], highlighter: false, ink: ink, activeDrawing: first.drawing, newId: Self.ids())
        #expect(far.data.nodes.count == 2)

        // the eraser takes the line whose point is under it, then the drawing left empty and its edges
        let card = Self.card("c", 0, 0)
        var data = CanvasEdits.add(first.data, card)
        data.edges = [JSObject([("id", "e"), ("fromNode", "c"), ("toNode", .string(first.drawing))])]
        #expect(CanvasEdits.erase(data, at: Point(x: 500, y: 500), zoom: 1) == nil)
        let erased = try #require(CanvasEdits.erase(data, at: Point(x: 101, y: 101), zoom: 1))
        #expect(erased.nodes.map(CanvasEdits.id) == ["c"])
        #expect(erased.edges.isEmpty)
    }

    @Test func coloursLabelsAndCardText() {
        let data = CanvasFile.Data(nodes: [Self.card("a", 0, 0), Self.card("b", 0, 0)], edges: [JSObject([("id", "e"), ("fromNode", "a"), ("toNode", "b")])])
        let coloured = CanvasEdits.setColor(data, nodes: ["a"], edge: nil, "4")
        #expect(coloured.nodes[0]["color"] == "4" && coloured.nodes[1]["color"] == nil)
        #expect(CanvasEdits.setColor(coloured, nodes: ["a"], edge: nil, nil).nodes[0]["color"] == nil)
        #expect(CanvasEdits.setColor(data, nodes: ["a"], edge: "e", "1").edges[0]["color"] == "1")
        #expect(CanvasEdits.setColor(data, nodes: ["a"], edge: "e", "1").nodes[0]["color"] == nil)
        #expect(CanvasEdits.setLabel(data, edge: "e", "  next  ").edges[0]["label"] == "next")
        #expect(CanvasEdits.setLabel(data, node: "a", "   ").nodes[0]["label"] == nil)

        #expect(CanvasEdits.cardLines("  \n ") == nil)
        #expect(CanvasEdits.cardLines("# Title\n  - item\n\nplain\n#### four") == [
            .heading(level: 1, text: "Title"), .bullet("item"), .plain(" "), .plain("plain"), .plain("#### four"),
        ])
        #expect(CanvasEdits.safeHost("https://example.com:8080/a?b") == "example.com:8080")
        #expect(CanvasEdits.safeHost("not a url") == "not a url")
        let long = (["type": "doc", "content": [["type": "paragraph", "content": [["type": "text", "text": .string(String(repeating: "가", count: 500))]]]]] as JSValue).object!
        #expect(CanvasEdits.pageSnippet(long).utf16.count == 400)
        #expect(CanvasEdits.pageSnippet(nil) == "")
    }

    @Test func undoKeepsAHundredStates() {
        var history = CanvasEdits.History()
        let states = (0..<120).map { CanvasFile.Data(nodes: [Self.card("\($0)", 0, 0)]) }
        for state in states { history.record(state) }
        #expect(history.past.count == 100)
        let current = CanvasFile.Data()
        #expect(history.undo(current) == states[119])
        #expect(history.redo(states[119]) == current)
        history.record(states[0])
        #expect(history.future.isEmpty)
        history.push(states[1])
        history.dropLast()
        #expect(history.past.last == states[0])
    }
}
