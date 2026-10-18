import SwiftUI

/// Every page as a dot joined to the pages it links, as Morrow's `GraphView`: drag dots, pan, zoom, find, and
/// open a page by choosing its dot. With a focus it shows only the pages near that one.
struct GraphView: View {
    let controller: EditorController
    let focus: String?
    @State private var options = GraphView.savedOptions()
    @State private var data: GraphData?
    @State private var layout = GraphLayout()
    @State private var running = false
    @State private var query = ""
    @State private var offset = CGSize.zero
    @State private var scale = 1.0
    @State private var gestureScale = 1.0
    @State private var hover: Int?
    @State private var drag: DragState?
    @Environment(\.colorScheme) private var colorScheme

    private enum DragState {
        case node(Int, moved: Bool)
        case pan(start: CGSize, moved: Bool)
    }

    private static let optionsKey = "graphOptions"

    static func savedOptions() -> GraphOptions {
        guard let data = UserDefaults.standard.data(forKey: optionsKey),
              let options = try? JSONDecoder().decode(GraphOptions.self, from: data)
        else { return GraphOptions() }
        return options
    }

    private func save(_ options: GraphOptions) {
        if let data = try? JSONEncoder().encode(options) { UserDefaults.standard.set(data, forKey: Self.optionsKey) }
    }

    private var zoom: Double { scale * gestureScale }

    var body: some View {
        GeometryReader { geometry in
            let size = geometry.size
            TimelineView(.animation(minimumInterval: 1.0 / 60, paused: !running)) { timeline in
                Canvas { context, size in
                    // one simulation step for each frame drawn while the layout settles
                    if running { layout.step() }
                    draw(in: &context, size: size)
                }
                .onChange(of: timeline.date) {
                    if running && !layout.isActive { running = false }
                }
            }
            .contentShape(.rect)
            .gesture(dragGesture(size: size))
            .simultaneousGesture(
                MagnifyGesture()
                    .onChanged { gestureScale = $0.magnification }
                    .onEnded { value in
                        scale = min(6, max(0.1, scale * value.magnification))
                        gestureScale = 1
                    }
            )
            .onContinuousHover { phase in
                switch phase {
                case .active(let point): hover = node(at: point, size: size)
                case .ended: hover = nil
                }
            }
            .accessibilityElement()
            .accessibilityLabel("Graph of \(data?.nodes.count ?? 0) pages and \(data?.links.count ?? 0) links")
            .accessibilityHint("Choose a dot to open its page.")
        }
        .overlay(alignment: .topTrailing) { controls.padding(12) }
        .overlay(alignment: .bottomTrailing) { zoomButtons.padding(12) }
        .background(.background)
        .task(id: Lookup(options: options, focus: focus, revision: controller.revision)) {
            if data != nil { try? await Task.sleep(for: .milliseconds(400)) }
            guard !Task.isCancelled, let next = await controller.graph(options, focus: focus) else { return }
            guard next != data else { return }
            data = next
            layout.update(with: next, focus: focus)
            running = true
        }
    }

    private struct Lookup: Equatable {
        let options: GraphOptions
        let focus: String?
        let revision: Int
    }

    // MARK: drawing

    private struct Palette {
        let node: Color
        let tag: Color
        let accent: Color
        let link: Color
        let text: Color
        let strong: Color
        let groups: [Color]
    }

    /// Morrow's graph colours: `--c-*-text` for each section, light then dark, from `features.css`.
    private var palette: Palette {
        let dark = colorScheme == .dark
        let groups: [(UInt32, UInt32)] = [
            (0x3b628c, 0x9cc1ea), (0xa3521c, 0xf0a971), (0x3a6e47, 0x93cf9f), (0x67468c, 0xc6a8ec),
            (0x9a3a6c, 0xefa3c9), (0x876214, 0xe9cb6d), (0xa3302a, 0xf39a90), (0x7a5232, 0xd9b394),
        ]
        return Palette(
            node: .secondary, tag: Color.accentColor.opacity(0.45), accent: .accentColor,
            link: Color.secondary.opacity(0.5), text: .secondary, strong: .primary,
            groups: groups.map { Color(hex: dark ? $0.1 : $0.0) }
        )
    }

    /// Morrow's `groupColor`: `(hash * 31 + code) >>> 0` over the section's id.
    static func groupIndex(_ group: String, count: Int) -> Int {
        var hash: UInt32 = 0
        for unit in group.utf16 { hash = hash &* 31 &+ UInt32(unit) }
        return Int(hash % UInt32(count))
    }

    private func toScreen(_ x: Double, _ y: Double, size: CGSize) -> CGPoint {
        CGPoint(x: size.width / 2 + offset.width + x * zoom, y: size.height / 2 + offset.height + y * zoom)
    }

    private func toWorld(_ point: CGPoint, size: CGSize) -> (x: Double, y: Double) {
        ((point.x - size.width / 2 - offset.width) / zoom, (point.y - size.height / 2 - offset.height) / zoom)
    }

    private func node(at point: CGPoint, size: CGSize) -> Int? {
        let world = toWorld(point, size: size)
        var best: Int?
        var bestDistance = Double.infinity
        for (index, node) in layout.simulation.nodes.enumerated() {
            let distance = hypot(node.x - world.x, node.y - world.y)
            if distance < max(node.radius + 4, 8 / zoom), distance < bestDistance {
                best = index
                bestDistance = distance
            }
        }
        return best
    }

    private func matches(_ index: Int) -> Bool {
        let wanted = CommandPalette.fold(query.trimmingCharacters(in: .whitespaces))
        return wanted.isEmpty || CommandPalette.fold(layout.nodes[index].label).contains(wanted)
    }

    private func draw(in context: inout GraphicsContext, size: CGSize) {
        let colors = palette
        let nodes = layout.simulation.nodes
        guard nodes.count == layout.nodes.count else { return }
        let finding = !query.trimmingCharacters(in: .whitespaces).isEmpty
        let lit: Set<Int>? = hover.map { Set([$0]).union(layout.neighbours[$0] ?? []) }
        for link in layout.simulation.links.enumerated() {
            let source = nodes[link.element.source], target = nodes[link.element.target]
            let on = lit.map { $0.contains(link.element.source) && $0.contains(link.element.target) } ?? false
            var path = Path()
            path.move(to: toScreen(source.x, source.y, size: size))
            path.addLine(to: toScreen(target.x, target.y, size: size))
            let isLink = layout.linkKinds[link.offset] == "link"
            let opacity = lit != nil && !on ? 0.15 : isLink ? 0.9 : 0.5
            context.stroke(path, with: .color((on ? colors.accent : colors.link).opacity(opacity)),
                           style: StrokeStyle(lineWidth: 1, dash: isLink ? [] : [3, 3]))
        }
        for (index, node) in nodes.enumerated() {
            let info = layout.nodes[index]
            let on = lit?.contains(index) ?? true
            let found = matches(index)
            let center = toScreen(node.x, node.y, size: size)
            let r = node.radius * zoom
            let color: Color = info.id == focus || index == hover || (finding && found)
                ? colors.accent
                : info.kind == "tag" ? colors.tag : colors.groups[Self.groupIndex(info.group, count: colors.groups.count)]
            context.fill(Path(ellipseIn: CGRect(x: center.x - r, y: center.y - r, width: r * 2, height: r * 2)),
                         with: .color(color.opacity(on && found ? 1 : 0.18)))
        }
        // labels when zoomed in, for the dot under the pointer and its neighbours, the focus and what was found
        for (index, node) in nodes.enumerated() where index != hover {
            let info = layout.nodes[index]
            let show = zoom > 1.1 || (lit?.contains(index) ?? false) || info.id == focus || (finding && matches(index))
            guard show else { continue }
            let center = toScreen(node.x, node.y, size: size)
            context.opacity = lit.map { $0.contains(index) ? 1 : 0.2 } ?? 1
            context.draw(Text(Self.label(info.label)).font(.caption).foregroundStyle(colors.text),
                         at: CGPoint(x: center.x, y: center.y + node.radius * zoom + 3), anchor: .top)
        }
        context.opacity = 1
        if let hover, hover < nodes.count {
            let node = nodes[hover]
            let center = toScreen(node.x, node.y, size: size)
            context.draw(Text(Self.label(layout.nodes[hover].label)).font(.callout.weight(.medium)).foregroundStyle(colors.strong),
                         at: CGPoint(x: center.x, y: center.y - node.radius * zoom - 6), anchor: .bottom)
        }
    }

    /// Morrow cuts labels longer than 40 characters.
    static func label(_ text: String) -> String {
        text.count > 40 ? "\(text.prefix(39))…" : text
    }

    // MARK: input

    private func dragGesture(size: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                switch drag {
                case nil:
                    if let index = node(at: value.startLocation, size: size) {
                        drag = .node(index, moved: false)
                        layout.simulation.alphaTarget = 0.3
                        running = true
                    } else {
                        drag = .pan(start: offset, moved: false)
                    }
                case .node(let index, let moved):
                    let distance = hypot(value.translation.width, value.translation.height)
                    layout.simulation.hold(index, at: toWorld(value.location, size: size))
                    drag = .node(index, moved: moved || distance > 3)
                case .pan(let start, let moved):
                    offset = CGSize(width: start.width + value.translation.width, height: start.height + value.translation.height)
                    drag = .pan(start: start, moved: moved || abs(value.translation.width) + abs(value.translation.height) > 3)
                }
            }
            .onEnded { _ in
                if case .node(let index, let moved) = drag {
                    layout.simulation.hold(index, at: nil)
                    layout.simulation.alphaTarget = 0
                    if !moved { open(index) }
                }
                drag = nil
            }
    }

    private func open(_ index: Int) {
        let info = layout.nodes[index]
        if let pageId = info.pageId {
            controller.go(to: .page(pageId))
        } else {
            controller.go(to: .tag(String(info.label.drop { $0 == "#" })))
        }
    }

    // MARK: controls

    private var controls: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("Find in graph", text: $query)
                .textFieldStyle(.roundedBorder)
            Toggle("Tags", isOn: binding(\.tags))
            Toggle("Subpages", isOn: binding(\.hierarchy))
            if focus != nil {
                Picker("Depth", selection: binding(\.depth)) {
                    ForEach(1...3, id: \.self) { Text("\($0)").tag($0) }
                }
                Button("Whole Graph", systemImage: "point.3.connected.trianglepath.dotted") { controller.go(to: .graph(nil)) }
                    .buttonStyle(.borderless)
            } else {
                Toggle("Unlinked pages", isOn: binding(\.orphans))
            }
            if let data {
                Text("\(data.nodes.count) page\(data.nodes.count == 1 ? "" : "s") · \(data.links.count) link\(data.links.count == 1 ? "" : "s")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        #if os(macOS)
        .toggleStyle(.checkbox)
        #endif
        .frame(width: 220, alignment: .leading)
        .padding(12)
        .background(.regularMaterial, in: .rect(cornerRadius: 12))
    }

    private func binding<T>(_ path: WritableKeyPath<GraphOptions, T>) -> Binding<T> {
        Binding {
            options[keyPath: path]
        } set: { value in
            options[keyPath: path] = value
            save(options)
        }
    }

    private var zoomButtons: some View {
        HStack(spacing: 4) {
            Button("Zoom Out", systemImage: "minus.magnifyingglass") { scale = max(0.1, scale / 1.4) }
            Button("Zoom In", systemImage: "plus.magnifyingglass") { scale = min(6, scale * 1.4) }
            Button("Center", systemImage: "scope") {
                scale = 1
                offset = .zero
            }
        }
        .labelStyle(.iconOnly)
        .buttonStyle(.bordered)
    }
}

/// The nodes on screen with their simulation, kept apart from SwiftUI state so a frame can step it.
final class GraphLayout {
    private(set) var nodes: [GraphData.Node] = []
    private(set) var linkKinds: [String] = []
    private(set) var neighbours: [Int: Set<Int>] = [:]
    var simulation = GraphSimulation(radii: [], links: [])

    var isActive: Bool { simulation.isActive }

    func step() {
        if simulation.isActive { simulation.tick() }
    }

    /// Morrow's dot size: tags 3, pages `3 + √degree × 1.6`, the focus 2 larger.
    static func radius(_ node: GraphData.Node, focus: String?) -> Double {
        (node.kind == "tag" ? 3 : 3 + Double(node.degree).squareRoot() * 1.6) + (node.id == focus ? 2 : 0)
    }

    /// A new graph keeps the place of dots that were already there, so a change in the vault does not scatter it.
    func update(with data: GraphData, focus: String?) {
        let previous = Dictionary(uniqueKeysWithValues: zip(nodes.map(\.id), simulation.nodes))
        let index = Dictionary(uniqueKeysWithValues: data.nodes.enumerated().map { ($1.id, $0) })
        let pairs = data.links.compactMap { link -> (Int, Int)? in
            guard let source = index[link.source], let target = index[link.target] else { return nil }
            return (source, target)
        }
        var next = GraphSimulation(radii: data.nodes.map { Self.radius($0, focus: focus) }, links: pairs)
        var kept = false
        for (position, node) in data.nodes.enumerated() {
            if let old = previous[node.id] {
                next.place(position, x: old.x, y: old.y)
                kept = true
            }
        }
        // a graph that mostly stayed starts warm rather than from scratch
        if kept { next.alpha = 0.3 }
        nodes = data.nodes
        linkKinds = data.links.filter { index[$0.source] != nil && index[$0.target] != nil }.map(\.kind)
        var near: [Int: Set<Int>] = [:]
        for (source, target) in pairs {
            near[source, default: []].insert(target)
            near[target, default: []].insert(source)
        }
        neighbours = near
        simulation = next
    }
}

extension GraphSimulation {
    mutating func place(_ index: Int, x: Double, y: Double) {
        hold(index, at: (x, y))
        hold(index, at: nil)
    }
}
