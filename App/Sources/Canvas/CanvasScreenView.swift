import SwiftUI

/// Edge geometry shared by drawing and pressing: the cubic curve of an edge, points along it, and its arrowhead.
nonisolated enum CanvasGeometry {
    typealias Point = CanvasEdits.Point

    static func curve(_ ends: (from: Point, fromSide: String, to: Point, toSide: String?)) -> (Point, Point, Point, Point) {
        let (c1, c2) = CanvasEdits.edgeControls(from: ends.from, fromSide: ends.fromSide, to: ends.to, toSide: ends.toSide)
        return (ends.from, c1, c2, ends.to)
    }

    static func point(_ curve: (Point, Point, Point, Point), _ t: Double) -> Point {
        let u = 1 - t
        let a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t
        return Point(x: a * curve.0.x + b * curve.1.x + c * curve.2.x + d * curve.3.x,
                     y: a * curve.0.y + b * curve.1.y + c * curve.2.y + d * curve.3.y)
    }

    /// whether a point lies within a distance of an edge, as Morrow's wide invisible hit path
    static func near(_ world: Point, _ ends: (from: Point, fromSide: String, to: Point, toSide: String), within: Double) -> Bool {
        let shape = curve((ends.from, ends.fromSide, ends.to, ends.toSide))
        var previous = shape.0
        for step in 1...32 {
            let next = point(shape, Double(step) / 32)
            if distance(world, previous, next) <= within { return true }
            previous = next
        }
        return false
    }

    private static func distance(_ p: Point, _ a: Point, _ b: Point) -> Double {
        let dx = b.x - a.x, dy = b.y - a.y
        let length = dx * dx + dy * dy
        let t = length == 0 ? 0 : max(0, min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length))
        return hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    }
}

/// A canvas page as Morrow's CanvasView draws it, filling the page: the dotted grid, groups, edges and cards, the
/// line being drawn, and the toolbar. A canvas whose file could not be read shows Morrow's notice instead.
struct CanvasScreenView: View {
    let controller: EditorController
    let page: PageInfo
    let unreadable: Bool
    @State private var store: CanvasStore

    init(controller: EditorController, page: PageInfo, unreadable: Bool) {
        self.controller = controller
        self.page = page
        self.unreadable = unreadable
        _store = State(initialValue: CanvasStore(controller: controller, pageId: page.id))
    }

    var body: some View {
        Group {
            if unreadable {
                PageBanner(text: "This canvas file could not be read. It has been left untouched on disk.", error: true)
                    .padding(24)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            } else {
                CanvasBoard(store: store, editable: true)
            }
        }
        .background(.background)
        .task(id: controller.revision) { await store.load() }
        .onDisappear {
            store.finishEditing()
            Task { await store.flush() }
        }
    }
}

private struct CanvasBoard: View {
    let store: CanvasStore
    let editable: Bool
    @State private var pressed: CGPoint?
    @State private var lastTap: (time: Date, point: CGPoint)?
    @State private var pinchStart: CanvasEdits.Viewport?
    @State private var pickingPage = false
    @State private var naming: Naming?
    @State private var nameDraft = ""
    @FocusState private var focused: Bool
    @Environment(\.colorScheme) private var colorScheme

    enum Naming: Identifiable {
        case group(String)
        case edge(String)
        var id: String { switch self { case .group(let id): "g\(id)"; case .edge(let id): "e\(id)" } }
    }

    private static let space = "canvas"

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                grid
                edges
                nodes
                overlayLayer
                if let id = store.editing, let node = CanvasEdits.node(store.data, id) { textEditor(node) }
            }
            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
            .clipped()
            .contentShape(.rect)
            .coordinateSpace(.named(Self.space))
            .gesture(press)
            .simultaneousGesture(pinch)
            .overlay(alignment: .bottom) { CanvasToolbar(store: store, editable: editable, size: proxy.size, pickingPage: $pickingPage) }
            .overlay {
                if store.loaded && store.data.nodes.isEmpty {
                    Text("Double-click anywhere to add a card. Drag from the dot on a card's edge to connect it to another.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(40)
                        .allowsHitTesting(false)
                }
            }
            .focusable()
            .focusEffectDisabled()
            .focused($focused)
            .onKeyPress(phases: .down) { press in keyPress(press) }
            .onAppear { focused = true }
            .onChange(of: store.loaded) { store.fitOnce(width: proxy.size.width, height: proxy.size.height) }
            .onAppear { store.fitOnce(width: proxy.size.width, height: proxy.size.height) }
            .accessibilityLabel("Canvas. Double-tap to add a card, drag to move, Delete to remove.")
            .alert(naming.map { if case .group = $0 { "Group name" } else { "Label" } } ?? "",
                   isPresented: Binding(get: { naming != nil }, set: { if !$0 { naming = nil } })) {
                TextField("Name", text: $nameDraft)
                Button("Cancel", role: .cancel) { naming = nil }
                Button("Save") { saveName() }
            }
        }
    }

    // MARK: layers

    private var grid: some View {
        Canvas { context, size in
            let step = 24 * store.view.zoom
            guard step >= 4 else { return }
            let dot = colorScheme == .dark ? Color.white.opacity(0.16) : Color.black.opacity(0.14)
            var x = store.view.x.truncatingRemainder(dividingBy: step)
            if x < 0 { x += step }
            while x < size.width {
                var y = store.view.y.truncatingRemainder(dividingBy: step)
                if y < 0 { y += step }
                while y < size.height {
                    context.fill(Path(ellipseIn: CGRect(x: x - 1, y: y - 1, width: 2, height: 2)), with: .color(dot))
                    y += step
                }
                x += step
            }
        }
        .allowsHitTesting(false)
    }

    private var edges: some View {
        Canvas { context, _ in
            context.translateBy(x: store.view.x, y: store.view.y)
            context.scaleBy(x: store.view.zoom, y: store.view.zoom)
            for edge in store.data.edges {
                guard let ends = CanvasEdits.edgeEnds(edge, store.data) else { continue }
                let shape = CanvasGeometry.curve((ends.from, ends.fromSide, ends.to, ends.toSide))
                let color = CanvasColor.edge(edge["color"]?.string)
                let selected = store.selectedEdge.map { CanvasEdits.id(edge).jsEquals($0) } == true
                var path = Path()
                path.move(to: cg(shape.0))
                path.addCurve(to: cg(shape.3), control1: cg(shape.1), control2: cg(shape.2))
                if selected { context.stroke(path, with: .color(.accentColor.opacity(0.35)), lineWidth: 8) }
                context.stroke(path, with: .color(color), lineWidth: 2)
                if edge["toEnd"]?.string != "none" { arrow(&context, tip: shape.3, from: shape.2, color: color) }
                if edge["fromEnd"]?.string == "arrow" { arrow(&context, tip: shape.0, from: shape.1, color: color) }
                if let label = edge["label"]?.string {
                    let mid = CGPoint(x: (ends.from.x + ends.to.x) / 2, y: (ends.from.y + ends.to.y) / 2)
                    context.draw(Text(label).font(.system(size: 13)).foregroundStyle(.secondary), at: mid)
                }
            }
            if let link = store.link, let from = CanvasEdits.node(store.data, link.from) {
                let start = CanvasEdits.anchor(from, link.side)
                let shape = CanvasGeometry.curve((start, link.side, link.at, nil))
                var path = Path()
                path.move(to: cg(shape.0))
                path.addCurve(to: cg(shape.3), control1: cg(shape.1), control2: cg(shape.2))
                context.stroke(path, with: .color(.accentColor), style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
            }
        }
        .allowsHitTesting(false)
    }

    private func arrow(_ context: inout GraphicsContext, tip: CanvasEdits.Point, from control: CanvasEdits.Point, color: Color) {
        var dx = tip.x - control.x, dy = tip.y - control.y
        let length = hypot(dx, dy)
        if length == 0 { return }
        dx /= length
        dy /= length
        let size = 10.0
        var head = Path()
        head.move(to: cg(tip))
        head.addLine(to: CGPoint(x: tip.x - dx * size - dy * size * 0.5, y: tip.y - dy * size + dx * size * 0.5))
        head.addLine(to: CGPoint(x: tip.x - dx * size + dy * size * 0.5, y: tip.y - dy * size - dx * size * 0.5))
        head.closeSubpath()
        context.fill(head, with: .color(color))
    }

    private var nodes: some View {
        ForEach(store.ordered.map { CanvasEdits.id($0) }, id: \.self) { id in
            if let node = CanvasEdits.node(store.data, id) {
                let width = CanvasEdits.number(node, "width"), height = CanvasEdits.number(node, "height")
                CanvasCard(store: store, node: node, selected: store.selected.contains(id))
                    .frame(width: width, height: height)
                    .scaleEffect(store.view.zoom, anchor: .topLeading)
                    .offset(x: store.view.x + CanvasEdits.number(node, "x") * store.view.zoom,
                            y: store.view.y + CanvasEdits.number(node, "y") * store.view.zoom)
                    .allowsHitTesting(false)
            }
        }
    }

    /// the line being drawn and the handles of the chosen cards, over everything
    private var overlayLayer: some View {
        Canvas { context, _ in
            if let draft = store.draft {
                var path = Path()
                for segment in CanvasEdits.strokeSegments(draft) { segment.add(to: &path, store.toScreen) }
                let highlighter = store.tool == .highlighter
                let width = (highlighter ? store.ink.width * 3.5 : store.ink.width) * store.view.zoom
                context.stroke(path, with: .color(CanvasColor.ink(store.ink.color).opacity(highlighter ? 0.35 : 1)),
                               style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round))
            }
            guard editable, store.tool == .select else { return }
            for node in store.data.nodes where store.selected.contains(CanvasEdits.id(node)) {
                let kind = CanvasEdits.type(node)
                if kind != "group" && kind != "drawing" {
                    for side in CanvasEdits.sides {
                        let point = store.toScreen(CanvasEdits.anchor(node, side))
                        let dot = Path(ellipseIn: CGRect(x: point.x - 6, y: point.y - 6, width: 12, height: 12))
                        context.fill(dot, with: .color(.accentColor))
                        context.stroke(dot, with: .color(.white), lineWidth: 2)
                    }
                }
                let corner = store.toScreen(CanvasEdits.Point(x: CanvasEdits.number(node, "x") + CanvasEdits.number(node, "width"),
                                                              y: CanvasEdits.number(node, "y") + CanvasEdits.number(node, "height")))
                context.fill(Path(roundedRect: CGRect(x: corner.x - 7, y: corner.y - 7, width: 14, height: 14), cornerRadius: 3),
                             with: .color(.accentColor))
            }
        }
        .allowsHitTesting(false)
    }

    private func textEditor(_ node: JSObject) -> some View {
        CanvasTextEditor(text: Binding(get: { store.editingText }, set: { store.editingText = $0 }), zoom: store.view.zoom) {
            store.finishEditing()
            focused = true
        }
        .frame(width: CanvasEdits.number(node, "width") * store.view.zoom, height: CanvasEdits.number(node, "height") * store.view.zoom)
        .offset(x: store.view.x + CanvasEdits.number(node, "x") * store.view.zoom,
                y: store.view.y + CanvasEdits.number(node, "y") * store.view.zoom)
    }

    // MARK: gestures

    private var press: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .named(Self.space))
            .onChanged { value in
                if pressed == nil {
                    pressed = value.startLocation
                    focused = true
                    store.press(at: point(value.startLocation), shift: NSEventModifiers.shift, editable: editable)
                }
                store.drag(to: point(value.location))
            }
            .onEnded { value in
                pressed = nil
                store.release(at: point(value.location))
                if hypot(value.translation.width, value.translation.height) < 6 { tapped(at: value.location) }
            }
    }

    private var pinch: some Gesture {
        MagnifyGesture(minimumScaleDelta: 0.01)
            .onChanged { value in
                if pinchStart == nil {
                    pinchStart = store.view
                    store.cancel()
                }
                guard let start = pinchStart else { return }
                store.view = CanvasEdits.zoomAt(start, value.magnification, point(value.startLocation))
            }
            .onEnded { _ in pinchStart = nil }
    }

    /// a tap that follows another near it is a double tap, Morrow's double click
    private func tapped(at location: CGPoint) {
        let now = Date()
        defer { lastTap = (now, location) }
        guard let last = lastTap, now.timeIntervalSince(last.time) < 0.35,
              hypot(location.x - last.point.x, location.y - last.point.y) < 24 else { return }
        lastTap = nil
        doubleTapped(at: location)
    }

    private func doubleTapped(at location: CGPoint) {
        guard editable, store.tool == .select else { return }
        switch store.target(at: point(location), editable: editable) {
        case .node(let id):
            guard let node = CanvasEdits.node(store.data, id) else { return }
            switch CanvasEdits.type(node) {
            case "text": store.beginEditing(id)
            case "page": if let pageId = node["pageId"]?.string { store.controller.go(to: .page(pageId)) }
            case "link": if let url = node["url"]?.string.flatMap(URL.init(string:)) { store.controller.openURL(url) }
            case "group":
                nameDraft = node["label"]?.string ?? ""
                naming = .group(id)
            default: break
            }
        case .edge(let id):
            nameDraft = store.data.edges.first { CanvasEdits.id($0).jsEquals(id) }?["label"]?.string ?? ""
            naming = .edge(id)
        case .empty:
            store.addCard(at: store.view.toWorld(point(location)))
        default:
            break
        }
    }

    private func saveName() {
        switch naming {
        case .group(let id): store.commit(CanvasEdits.setLabel(store.data, node: id, nameDraft))
        case .edge(let id): store.commit(CanvasEdits.setLabel(store.data, edge: id, nameDraft))
        case nil: break
        }
        naming = nil
    }

    // MARK: keys

    private func keyPress(_ press: KeyPress) -> KeyPress.Result {
        guard store.editing == nil else { return .ignored }
        let command = press.modifiers.contains(.command)
        let shift = press.modifiers.contains(.shift)
        if !command && editable && !press.modifiers.contains(.option) {
            let tools: [String: CanvasStore.Tool] = ["v": .select, "p": .pen, "h": .highlighter, "e": .eraser]
            if let tool = tools[press.characters.lowercased()] {
                store.choose(tool)
                return .handled
            }
            if press.key == .escape && store.tool != .select {
                store.choose(.select)
                return .handled
            }
        }
        switch press.key {
        case "z" where command: if shift { store.redo() } else { store.undo() }
        case "y" where command: store.redo()
        case "a" where command: store.selected = Set(store.data.nodes.map { CanvasEdits.id($0) })
        case .delete, .deleteForward:
            guard editable else { return .ignored }
            store.removeSelection()
        case .escape:
            store.selected = []
            store.selectedEdge = nil
        case .return:
            guard editable, store.selected.count == 1, let id = store.selected.first,
                  CanvasEdits.node(store.data, id).map(CanvasEdits.type) == "text" else { return .ignored }
            store.beginEditing(id)
        case .leftArrow, .rightArrow, .upArrow, .downArrow:
            guard editable, !store.selected.isEmpty else { return .ignored }
            let step = shift ? 50.0 : 10.0
            let dx = press.key == .leftArrow ? -step : press.key == .rightArrow ? step : 0
            let dy = press.key == .upArrow ? -step : press.key == .downArrow ? step : 0
            store.nudge(dx: dx, dy: dy)
        default:
            return .ignored
        }
        return .handled
    }

    private func point(_ location: CGPoint) -> CanvasEdits.Point { CanvasEdits.Point(x: location.x, y: location.y) }
    private func cg(_ point: CanvasEdits.Point) -> CGPoint { CGPoint(x: point.x, y: point.y) }
}

extension CanvasEdits.Segment {
    func add(to path: inout Path, _ transform: (CanvasEdits.Point) -> CanvasEdits.Point) {
        func cg(_ point: CanvasEdits.Point) -> CGPoint {
            let p = transform(point)
            return CGPoint(x: p.x, y: p.y)
        }
        switch self {
        case .move(let p): path.move(to: cg(p))
        case .line(let p): path.addLine(to: cg(p))
        case .quad(let c, let p): path.addQuadCurve(to: cg(p), control: cg(c))
        }
    }
}

/// Whether shift is held, for adding a card to the choice with a keyboard attached; touch has no shift.
@MainActor
enum NSEventModifiers {
    static var shift: Bool {
        #if os(macOS)
        NSEvent.modifierFlags.contains(.shift)
        #else
        false
        #endif
    }
}

/// Morrow's canvas colours: the six presets, any hex colour, the text colour for ink without one.
enum CanvasColor {
    static func preset(_ color: String?) -> Color? {
        guard let color else { return nil }
        guard let hex = CanvasEdits.inkColors[color] ?? (color.hasPrefix("#") ? color : nil) else { return nil }
        return Color(hexString: hex)
    }

    static func edge(_ color: String?) -> Color { preset(color) ?? .secondary }
    static func ink(_ color: String?) -> Color { preset(color) ?? .primary }
}

extension Color {
    /// #rgb, #rgba, #rrggbb or #rrggbbaa
    init?(hexString: String) {
        var text = String(hexString.dropFirst())
        if text.count == 3 || text.count == 4 { text = text.map { "\($0)\($0)" }.joined() }
        guard text.count == 6 || text.count == 8, let value = UInt64(text, radix: 16) else { return nil }
        let hasAlpha = text.count == 8
        let r = Double((value >> (hasAlpha ? 24 : 16)) & 0xff) / 255
        let g = Double((value >> (hasAlpha ? 16 : 8)) & 0xff) / 255
        let b = Double((value >> (hasAlpha ? 8 : 0)) & 0xff) / 255
        let a = hasAlpha ? Double(value & 0xff) / 255 : 1
        self = Color(red: r, green: g, blue: b, opacity: a)
    }
}

/// The text of a card being edited: saved when it loses focus, with escape, or with command-return; the canvas
/// also saves it when anything else ends the editing.
private struct CanvasTextEditor: View {
    @Binding var text: String
    let zoom: Double
    let done: () -> Void
    @FocusState private var focused: Bool

    var body: some View {
        TextEditor(text: $text)
            .font(.system(size: 15 * zoom))
            .scrollContentBackground(.hidden)
            .padding(6 * zoom)
            .background(.background, in: .rect(cornerRadius: 10 * zoom))
            .overlay(RoundedRectangle(cornerRadius: 10 * zoom).strokeBorder(.tint, lineWidth: 2))
            .focused($focused)
            .accessibilityLabel("Card text")
            .onAppear { focused = true }
            .onChange(of: focused) { _, isFocused in if !isFocused { done() } }
            .onKeyPress(.escape) {
                done()
                return .handled
            }
            .onKeyPress(.return, phases: .down) { press in
                guard press.modifiers.contains(.command) else { return .ignored }
                done()
                return .handled
            }
    }
}
