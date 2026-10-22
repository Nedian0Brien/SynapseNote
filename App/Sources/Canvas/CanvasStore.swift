import Foundation
import Observation

/// The state of the canvas on screen, Morrow's CanvasView: the canvas as edited here, the view, what is chosen
/// and being done, the undo history, and the save waiting 400 ms after the last change.
@MainActor
@Observable
final class CanvasStore {
    typealias Point = CanvasEdits.Point

    enum Tool: String, CaseIterable { case select, pen, highlighter, eraser }

    /// what a press on the canvas is doing until it is let go
    enum Interaction {
        case pan(start: Point, origin: CanvasEdits.Viewport)
        case move(start: Point, origins: [String: Point], moved: Bool)
        case resize(id: String, start: Point, width: Double, height: Double)
        case connect(from: String, side: String)
        case draw(points: [Double])
        case erase(removed: Bool)
    }

    let controller: EditorController
    let pageId: String
    private(set) var data = CanvasFile.Data()
    private(set) var pages: [String: CanvasSnapshot.PageCard] = [:]
    private(set) var loaded = false
    var view = CanvasEdits.Viewport.start
    var selected: Set<String> = []
    var selectedEdge: String?
    /// the text card being edited and its text as typed; it is saved whenever the editing ends, however it ends
    private(set) var editing: String?
    var editingText = ""
    private(set) var tool = Tool.select
    var ink = CanvasEdits.Ink()
    /// the line being drawn, in canvas coordinates
    private(set) var draft: [Double]?
    /// the end of the edge being drawn from a card's handle
    private(set) var link: (from: String, side: String, at: Point)?

    @ObservationIgnored private(set) var interaction: Interaction?
    @ObservationIgnored private var history = CanvasEdits.History()
    @ObservationIgnored private var activeDrawing: String?
    /// the document last saved from here, to tell an outside change from our own
    @ObservationIgnored private var saved: DocNode?
    @ObservationIgnored private var pending: CanvasFile.Data?
    @ObservationIgnored private var timer: Task<Void, Never>?
    @ObservationIgnored private var saving: Task<Void, Never>?
    @ObservationIgnored private var fitted = false

    init(controller: EditorController, pageId: String) {
        self.controller = controller
        self.pageId = pageId
    }

    static func newId() -> String { UUID().uuidString.lowercased() }

    // MARK: reading

    /// the session's canvas after a report; it replaces this one only when it changed elsewhere, nothing waits
    /// to be saved and nothing is being done, as in Morrow
    func load() async {
        guard let snapshot = await controller.canvasSnapshot(pageId) else { return }
        pages = snapshot.pages
        if !loaded {
            loaded = true
            saved = snapshot.doc
            data = snapshot.data
            return
        }
        guard snapshot.doc != saved, pending == nil, interaction == nil else { return }
        saved = snapshot.doc
        data = snapshot.data
    }

    /// starts fitted to what is on the canvas, once its size is known
    func fitOnce(width: Double, height: Double) {
        guard loaded, !fitted, width > 0, height > 0 else { return }
        fitted = true
        view = CanvasEdits.fit(data, width: width, height: height)
    }

    // MARK: saving

    /// a change: kept, recorded for undo unless it says not to, and saved after the delay
    func commit(_ next: CanvasFile.Data, record: Bool = true) {
        if record { history.record(data) }
        data = next
        pending = next
        timer?.cancel()
        timer = Task { [weak self] in
            try? await Task.sleep(for: CanvasEdits.saveDelay)
            guard !Task.isCancelled else { return }
            await self?.flush()
        }
        holdSave()
    }

    private func holdSave() {
        controller.holdSave(saveKey) { [weak self] in
            self?.finishEditing()
            await self?.flush()
        }
    }

    func beginEditing(_ id: String) {
        if editing != nil && editing != id { finishEditing() }
        editing = id
        editingText = CanvasEdits.node(data, id)?["text"]?.string ?? ""
        holdSave()
    }

    /// the card being edited keeps what was typed, as Morrow's textarea does when it loses focus
    func finishEditing() {
        guard let id = editing else { return }
        editing = nil
        if CanvasEdits.node(data, id)?["text"]?.string?.utf16.elementsEqual(editingText.utf16) != true {
            commit(CanvasEdits.update(data, id, [("text", .string(editingText))]))
        }
    }

    private var saveKey: String { "canvas:\(pageId)" }

    /// saves what waits now, and returns once every save so far is done
    func flush() async {
        timer?.cancel()
        timer = nil
        if let next = pending {
            pending = nil
            let doc = CanvasFile.canvasDoc(next)
            saved = doc
            let previous = saving
            saving = Task { [controller, pageId] in
                await previous?.value
                await controller.setDoc(pageId, doc)
            }
        }
        await saving?.value
        if pending == nil && editing == nil { controller.releaseSave(saveKey) }
    }

    func undo() {
        guard let previous = history.undo(data) else { return }
        commit(previous, record: false)
    }

    func redo() {
        guard let next = history.redo(data) else { return }
        commit(next, record: false)
    }

    // MARK: tools

    func choose(_ next: Tool) {
        tool = next
        activeDrawing = nil
        if next != .select {
            selected = []
            finishEditing()
        }
    }

    func add(_ node: JSObject, edit: Bool = false) {
        finishEditing()
        commit(CanvasEdits.add(data, node))
        selected = [CanvasEdits.id(node)]
        if edit { beginEditing(CanvasEdits.id(node)) }
    }

    /// a page card from the page picker; its title shows at once, the rest comes with the next report
    func addPage(_ page: DatabaseSnapshot.RelatedPage, at point: Point) {
        if pages[page.id] == nil {
            pages[page.id] = .init(title: page.title, icon: controller.workspace.infos[page.id]?.icon, snippet: "")
        }
        add(CanvasEdits.pageNode(page.id, at: point, id: CanvasEdits.newNodeId(Self.newId)))
    }

    func addCard(at point: Point) {
        add(CanvasEdits.textCard(at: point, id: CanvasEdits.newNodeId(Self.newId)), edit: true)
    }

    func removeSelection() {
        guard let next = CanvasEdits.remove(data, nodes: selected, edge: selectedEdge) else { return }
        commit(next)
        if selectedEdge != nil { selectedEdge = nil } else { selected = [] }
    }

    func setColor(_ color: String?) {
        commit(CanvasEdits.setColor(data, nodes: selected, edge: selectedEdge, color))
    }

    func nudge(dx: Double, dy: Double) {
        guard !selected.isEmpty else { return }
        commit(CanvasEdits.nudge(data, selected, dx: dx, dy: dy))
    }

    // MARK: pressing, dragging and letting go (screen points in the canvas's own space)

    enum Target {
        case handle(id: String, side: String)
        case resize(id: String)
        case node(String)
        case edge(String)
        case empty
    }

    static let handleRadius = 14.0

    /// what is under a point: a handle of a chosen card, a card (the topmost), an edge, or nothing
    func target(at screen: Point, editable: Bool) -> Target {
        let world = view.toWorld(screen)
        if editable && tool == .select {
            for node in data.nodes where selected.contains(CanvasEdits.id(node)) {
                let id = CanvasEdits.id(node)
                let corner = Point(x: CanvasEdits.number(node, "x") + CanvasEdits.number(node, "width"),
                                   y: CanvasEdits.number(node, "y") + CanvasEdits.number(node, "height"))
                if distance(screen, toScreen(corner)) <= Self.handleRadius { return .resize(id: id) }
                let kind = CanvasEdits.type(node)
                guard kind != "group" && kind != "drawing" else { continue }
                for side in CanvasEdits.sides where distance(screen, toScreen(CanvasEdits.anchor(node, side))) <= Self.handleRadius {
                    return .handle(id: id, side: side)
                }
            }
        }
        if let node = ordered.reversed().first(where: { node in
            let x = CanvasEdits.number(node, "x"), y = CanvasEdits.number(node, "y")
            return world.x >= x && world.x <= x + CanvasEdits.number(node, "width")
                && world.y >= y && world.y <= y + CanvasEdits.number(node, "height")
        }) {
            return .node(CanvasEdits.id(node))
        }
        for edge in data.edges.reversed() {
            if let ends = CanvasEdits.edgeEnds(edge, data), CanvasGeometry.near(world, ends, within: 8 / view.zoom) {
                return .edge(CanvasEdits.id(edge))
            }
        }
        return .empty
    }

    /// groups first, so cards inside them are on top, as Morrow orders them
    var ordered: [JSObject] {
        data.nodes.filter { CanvasEdits.type($0) == "group" } + data.nodes.filter { CanvasEdits.type($0) != "group" }
    }

    func toScreen(_ world: Point) -> Point { Point(x: view.x + world.x * view.zoom, y: view.y + world.y * view.zoom) }

    private func distance(_ a: Point, _ b: Point) -> Double { hypot(a.x - b.x, a.y - b.y) }

    func press(at screen: Point, shift: Bool, editable: Bool) {
        let world = view.toWorld(screen)
        let hit = target(at: screen, editable: editable)
        if case .node(let id) = hit, id == editing { return }
        finishEditing()
        if editable && tool != .select {
            if tool == .eraser {
                history.record(data)
                interaction = .erase(removed: false)
                erase(at: world)
            } else {
                interaction = .draw(points: [world.x, world.y])
                draft = [world.x, world.y]
            }
            return
        }
        switch hit {
        case .resize(let id):
            guard let node = CanvasEdits.node(data, id) else { return }
            interaction = .resize(id: id, start: screen, width: CanvasEdits.number(node, "width"), height: CanvasEdits.number(node, "height"))
        case .handle(let id, let side):
            interaction = .connect(from: id, side: side)
            link = (id, side, world)
        case .node(let id):
            let next = CanvasEdits.select(selected, id, shift: shift)
            selected = next
            selectedEdge = nil
            if editable {
                interaction = .move(start: screen, origins: CanvasEdits.movingSet(data, next), moved: false)
            }
        case .edge(let id):
            selectedEdge = id
            selected = []
        case .empty:
            if !shift { selected = [] }
            selectedEdge = nil
            interaction = .pan(start: screen, origin: view)
        }
    }

    func drag(to screen: Point) {
        guard let current = interaction else { return }
        let world = view.toWorld(screen)
        switch current {
        case .draw(var points):
            // points closer than a pixel and a half add nothing but weight
            let last = points.count
            if hypot(world.x - points[last - 2], world.y - points[last - 1]) * view.zoom < 1.5 { return }
            points += [world.x, world.y]
            interaction = .draw(points: points)
            draft = points
        case .erase:
            erase(at: world)
        case .pan(let start, let origin):
            view = CanvasEdits.Viewport(x: origin.x + screen.x - start.x, y: origin.y + screen.y - start.y, zoom: origin.zoom)
        case .move(let start, let origins, let moved):
            let dx = (screen.x - start.x) / view.zoom
            let dy = (screen.y - start.y) / view.zoom
            if !moved && !CanvasEdits.startsMoving(dx: dx, dy: dy) { return }
            if !moved { history.push(data) }
            interaction = .move(start: start, origins: origins, moved: true)
            data = CanvasEdits.move(data, origins, dx: dx, dy: dy)
        case .resize(let id, let start, let width, let height):
            data = CanvasEdits.resize(data, id, width: width, height: height, dx: screen.x - start.x, dy: screen.y - start.y, zoom: view.zoom)
        case .connect(let from, let side):
            link = (from, side, world)
        }
    }

    /// the press ends; a press that did not move a card or the view is a tap, which the caller handles
    func release(at screen: Point) {
        guard let current = interaction else { return }
        interaction = nil
        switch current {
        case .draw(let points):
            draft = nil
            let finished = CanvasEdits.finishStroke(data, points, highlighter: tool == .highlighter, ink: ink,
                                                    activeDrawing: activeDrawing, newId: Self.newId)
            activeDrawing = finished.drawing
            commit(finished.data)
        case .erase(let removed):
            if removed { commit(data, record: false) } else { history.dropLast() }
        case .move(_, _, let moved):
            if moved { commit(data, record: false) }
        case .resize(let id, _, let width, let height):
            let finished = CanvasEdits.finishResize(data, id, width: width, height: height)
            history.push(finished.before)
            commit(finished.data, record: false)
        case .connect(let from, let side):
            link = nil
            let made = CanvasEdits.connect(data, from: from, side: side, at: view.toWorld(screen), newId: Self.newId)
            commit(made.data)
            if let card = made.newCard {
                selected = [card]
                beginEditing(card)
            }
        case .pan:
            break
        }
    }

    /// a gesture taken over by another, such as a pinch: a line or an edge being drawn is dropped, a move, a
    /// resize or an erase keeps what was done so far
    func cancel() {
        guard let current = interaction else { return }
        switch current {
        case .draw:
            interaction = nil
            draft = nil
        case .connect:
            interaction = nil
            link = nil
        case .pan:
            interaction = nil
        case .move, .resize, .erase:
            release(at: Point(x: 0, y: 0))
        }
    }

    private func erase(at world: Point) {
        guard let next = CanvasEdits.erase(data, at: world, zoom: view.zoom) else { return }
        if case .erase = interaction { interaction = .erase(removed: true) }
        data = next
    }

    func zoom(by factor: Double, at screen: Point) {
        view = CanvasEdits.zoomAt(view, factor, screen)
    }
}
