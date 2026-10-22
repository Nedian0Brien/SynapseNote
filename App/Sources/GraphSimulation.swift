import Foundation

/// Lays the graph out as Morrow's `GraphView` does with d3-force 3.0.0: a link force (distance 50, strength
/// 0.6), many-body repulsion (-90 within 400), centring, a pull to the middle (0.04) and collision (radius + 4),
/// with d3's alpha and velocity decay. The formulas follow d3-force's `src/*.js`, the repulsion with d3-quadtree's
/// Barnes–Hut estimate, so a graph lays out as it does in Morrow.
nonisolated struct GraphSimulation: Sendable {
    struct Node: Sendable {
        var x: Double
        var y: Double
        var vx: Double = 0
        var vy: Double = 0
        /// A node held where the pointer is.
        var fixed: (x: Double, y: Double)?
        /// The drawn radius.
        let radius: Double
    }

    struct Link: Sendable {
        let source: Int
        let target: Int
        /// How much of the pull moves the target, d3's `bias`.
        let bias: Double
    }

    static let linkDistance = 50.0
    static let linkStrength = 0.6
    static let charge = -90.0
    static let chargeReach2 = 400.0 * 400.0
    static let pull = 0.04
    /// Morrow collides dots at their drawn radius plus this.
    static let collisionPadding = 4.0
    static let alphaMin = 0.001
    static let alphaDecay = 1 - pow(0.001, 1.0 / 300)
    /// d3 keeps this share of the velocity each tick (its `velocityDecay(0.4)`).
    static let velocityKept = 0.6

    private(set) var nodes: [Node]
    let links: [Link]
    var alpha = 1.0
    var alphaTarget = 0.0
    private var random = LCG()

    /// Nodes start on d3's phyllotaxis spiral, so a layout is the same every time.
    init(radii: [Double], links pairs: [(Int, Int)]) {
        let angle = Double.pi * (3 - 5.0.squareRoot())
        nodes = radii.enumerated().map { index, radius in
            let distance = 10 * (0.5 + Double(index)).squareRoot()
            let turn = Double(index) * angle
            return Node(x: distance * cos(turn), y: distance * sin(turn), radius: radius)
        }
        var count = [Int](repeating: 0, count: radii.count)
        for (source, target) in pairs {
            count[source] += 1
            count[target] += 1
        }
        links = pairs.map { source, target in
            Link(source: source, target: target, bias: Double(count[source]) / Double(count[source] + count[target]))
        }
    }

    /// Still moving: d3 stops once alpha falls below its minimum.
    var isActive: Bool { alpha >= Self.alphaMin || alphaTarget > 0 }

    mutating func hold(_ index: Int, at point: (x: Double, y: Double)?) {
        nodes[index].fixed = point
        if let point {
            nodes[index].x = point.x
            nodes[index].y = point.y
        }
    }

    /// One step of d3's `tick`: cool down, apply each force in Morrow's order, then move.
    mutating func tick() {
        alpha += (alphaTarget - alpha) * Self.alphaDecay
        applyLinks()
        applyCharge()
        applyCenter()
        applyPull()
        applyCollision()
        for index in nodes.indices {
            if let fixed = nodes[index].fixed {
                nodes[index].x = fixed.x
                nodes[index].vx = 0
                nodes[index].y = fixed.y
                nodes[index].vy = 0
            } else {
                nodes[index].vx *= Self.velocityKept
                nodes[index].x += nodes[index].vx
                nodes[index].vy *= Self.velocityKept
                nodes[index].y += nodes[index].vy
            }
        }
    }

    private mutating func jiggle() -> Double { (random.next() - 0.5) * 1e-6 }

    /// d3 `forceLink`.
    private mutating func applyLinks() {
        for link in links {
            let source = nodes[link.source], target = nodes[link.target]
            var x = target.x + target.vx - source.x - source.vx
            var y = target.y + target.vy - source.y - source.vy
            if x == 0 { x = jiggle() }
            if y == 0 { y = jiggle() }
            var l = (x * x + y * y).squareRoot()
            l = (l - Self.linkDistance) / l * alpha * Self.linkStrength
            x *= l
            y *= l
            nodes[link.target].vx -= x * link.bias
            nodes[link.target].vy -= y * link.bias
            nodes[link.source].vx += x * (1 - link.bias)
            nodes[link.source].vy += y * (1 - link.bias)
        }
    }

    /// d3 `forceManyBody` with its Barnes–Hut estimate (theta 0.9): far groups of nodes push as one, at their
    /// centre of charge, `v += d · strength · alpha / |d|²`; closer than 1 is limited.
    private mutating func applyCharge() {
        guard nodes.count > 1, let tree = Quadtree(points: nodes.map { ($0.x, $0.y) }) else { return }
        tree.accumulate(strength: Self.charge)
        for index in nodes.indices { apply(tree.root, extent: tree.extent, to: index) }
    }

    private static let theta2 = 0.81

    private mutating func apply(_ quad: Quadtree.Node, extent: (x0: Double, y0: Double, x1: Double, y1: Double), to index: Int) {
        guard quad.value != 0 else { return }
        var x = quad.x - nodes[index].x
        var y = quad.y - nodes[index].y
        var w = extent.x1 - extent.x0
        var l = x * x + y * y
        if w * w / Self.theta2 < l {
            if l < Self.chargeReach2 {
                if x == 0 { x = jiggle(); l += x * x }
                if y == 0 { y = jiggle(); l += y * y }
                if l < 1 { l = l.squareRoot() }
                nodes[index].vx += x * quad.value * alpha / l
                nodes[index].vy += y * quad.value * alpha / l
            }
            return
        }
        if let children = quad.children {
            let xm = (extent.x0 + extent.x1) / 2, ym = (extent.y0 + extent.y1) / 2
            let boxes = [(extent.x0, extent.y0, xm, ym), (xm, extent.y0, extent.x1, ym),
                         (extent.x0, ym, xm, extent.y1), (xm, ym, extent.x1, extent.y1)]
            for (child, box) in zip(children, boxes) {
                if let child { apply(child, extent: box, to: index) }
            }
            return
        }
        guard l < Self.chargeReach2 else { return }
        if quad.point != index || quad.next != nil {
            if x == 0 { x = jiggle(); l += x * x }
            if y == 0 { y = jiggle(); l += y * y }
            if l < 1 { l = l.squareRoot() }
        }
        var leaf: Quadtree.Node? = quad
        while let current = leaf {
            if current.point != index {
                w = Self.charge * alpha / l
                nodes[index].vx += x * w
                nodes[index].vy += y * w
            }
            leaf = current.next
        }
    }

    /// d3 `forceCenter(0, 0)`: the mean position moves to the middle.
    private mutating func applyCenter() {
        guard !nodes.isEmpty else { return }
        let count = Double(nodes.count)
        let sx = nodes.reduce(0) { $0 + $1.x } / count
        let sy = nodes.reduce(0) { $0 + $1.y } / count
        for index in nodes.indices {
            nodes[index].x -= sx
            nodes[index].y -= sy
        }
    }

    /// d3 `forceX(0)` and `forceY(0)` at strength 0.04.
    private mutating func applyPull() {
        for index in nodes.indices {
            nodes[index].vx += -nodes[index].x * Self.pull * alpha
            nodes[index].vy += -nodes[index].y * Self.pull * alpha
        }
    }

    /// d3 `forceCollide`: each node, in order, visits a quadtree of the next positions and pushes apart the
    /// later nodes it overlaps, weighted by area. The visiting order is d3's, which matters because each push
    /// changes velocities the next one reads.
    private mutating func applyCollision() {
        guard nodes.count > 1,
              let tree = Quadtree(points: nodes.map { ($0.x + $0.vx, $0.y + $0.vy) })
        else { return }
        tree.prepareRadii(nodes.map { $0.radius + Self.collisionPadding })
        for i in nodes.indices {
            let ri = nodes[i].radius + Self.collisionPadding, ri2 = ri * ri
            // d3 reads the node's next position once, before it visits the others
            let xi = nodes[i].x + nodes[i].vx, yi = nodes[i].y + nodes[i].vy
            tree.visit { quad, x0, y0, x1, y1 in
                let rj = quad.radius
                let r = ri + rj
                if quad.children == nil {
                    let j = quad.point
                    guard j > i else { return true }
                    var x = xi - nodes[j].x - nodes[j].vx
                    var y = yi - nodes[j].y - nodes[j].vy
                    var l = x * x + y * y
                    guard l < r * r else { return true }
                    if x == 0 { x = jiggle(); l += x * x }
                    if y == 0 { y = jiggle(); l += y * y }
                    l = l.squareRoot()
                    l = (r - l) / l
                    x *= l
                    y *= l
                    let share = (rj * rj) / (ri2 + rj * rj)
                    nodes[i].vx += x * share
                    nodes[i].vy += y * share
                    nodes[j].vx -= x * (1 - share)
                    nodes[j].vy -= y * (1 - share)
                    return true
                }
                return x0 > xi + r || x1 < xi - r || y0 > yi + r || y1 < yi - r
            }
        }
    }
}

/// d3-quadtree 3 as d3-force builds it, `add.js` and `cover.js`: the extent starts on whole numbers around the
/// first point and doubles until it covers all of them, so its quadrants are the same as d3's.
nonisolated final class Quadtree {
    final class Node {
        /// Four quadrants for an inner node, nil for a leaf.
        var children: [Node?]?
        /// The node a leaf holds, and the next leaf at exactly the same place.
        var point = -1
        var next: Node?
        var x = 0.0
        var y = 0.0
        var value = 0.0
        /// The largest radius below this node, for collisions.
        var radius = 0.0

        init(children: [Node?]?) { self.children = children }
        init(point: Int) { self.point = point }
    }

    private(set) var root: Node
    private(set) var extent: (x0: Double, y0: Double, x1: Double, y1: Double)
    private let points: [(Double, Double)]

    init?(points: [(Double, Double)]) {
        guard let first = points.first else { return nil }
        self.points = points
        var x0 = Double.infinity, y0 = Double.infinity, x1 = -Double.infinity, y1 = -Double.infinity
        for (x, y) in points {
            x0 = min(x0, x); x1 = max(x1, x)
            y0 = min(y0, y); y1 = max(y1, y)
        }
        // cover(x0, y0): a unit square on whole numbers; cover(x1, y1): doubled until it holds the far corner
        var ex0 = x0.rounded(.down), ey0 = y0.rounded(.down)
        var ex1 = ex0 + 1, ey1 = ey0 + 1
        var z = ex1 - ex0
        while ex0 > x1 || x1 >= ex1 || ey0 > y1 || y1 >= ey1 {
            let i = (y1 < ey0 ? 2 : 0) | (x1 < ex0 ? 1 : 0)
            z *= 2
            switch i {
            case 0: ex1 = ex0 + z; ey1 = ey0 + z
            case 1: ex0 = ex1 - z; ey1 = ey0 + z
            case 2: ex1 = ex0 + z; ey0 = ey1 - z
            default: ex0 = ex1 - z; ey0 = ey1 - z
            }
        }
        extent = (ex0, ey0, ex1, ey1)
        root = Node(point: 0)
        _ = first
        for index in points.indices.dropFirst() { add(index) }
    }

    private func add(_ index: Int) {
        let (x, y) = points[index]
        var (x0, y0, x1, y1) = extent
        let leaf = Node(point: index)
        var parent: Node?
        var node = root
        var i = 0
        while let children = node.children {
            let xm = (x0 + x1) / 2, ym = (y0 + y1) / 2
            let right = x >= xm, bottom = y >= ym
            if right { x0 = xm } else { x1 = xm }
            if bottom { y0 = ym } else { y1 = ym }
            i = (bottom ? 2 : 0) | (right ? 1 : 0)
            parent = node
            guard let child = children[i] else {
                node.children![i] = leaf
                return
            }
            node = child
        }
        let (xp, yp) = points[node.point]
        if x == xp && y == yp {
            leaf.next = node
            if let parent { parent.children![i] = leaf } else { root = leaf }
            return
        }
        var j = 0
        repeat {
            let split = Node(children: [nil, nil, nil, nil])
            if let parent { parent.children![i] = split } else { root = split }
            parent = split
            let xm = (x0 + x1) / 2, ym = (y0 + y1) / 2
            let right = x >= xm, bottom = y >= ym
            if right { x0 = xm } else { x1 = xm }
            if bottom { y0 = ym } else { y1 = ym }
            i = (bottom ? 2 : 0) | (right ? 1 : 0)
            j = (yp >= ym ? 2 : 0) | (xp >= xm ? 1 : 0)
        } while i == j
        parent!.children![j] = node
        parent!.children![i] = leaf
    }

    /// d3 `forceCollide`'s `prepare`: each node's largest radius below it; a leaf counts its first point only.
    func prepareRadii(_ radii: [Double]) { prepare(root, radii) }

    private func prepare(_ quad: Node, _ radii: [Double]) {
        guard let children = quad.children else {
            quad.radius = radii[quad.point]
            return
        }
        quad.radius = 0
        for child in children {
            guard let child else { continue }
            prepare(child, radii)
            quad.radius = max(quad.radius, child.radius)
        }
    }

    /// d3-quadtree `visit`: depth first, quadrants in order; returning true skips a node's children.
    func visit(_ callback: (Node, Double, Double, Double, Double) -> Bool) {
        var stack: [(Node, Double, Double, Double, Double)] = [(root, extent.x0, extent.y0, extent.x1, extent.y1)]
        while let (node, x0, y0, x1, y1) = stack.popLast() {
            guard !callback(node, x0, y0, x1, y1), let children = node.children else { continue }
            let xm = (x0 + x1) / 2, ym = (y0 + y1) / 2
            if let child = children[3] { stack.append((child, xm, ym, x1, y1)) }
            if let child = children[2] { stack.append((child, x0, ym, xm, y1)) }
            if let child = children[1] { stack.append((child, xm, y0, x1, ym)) }
            if let child = children[0] { stack.append((child, x0, y0, xm, ym)) }
        }
    }

    /// d3 `forceManyBody`'s `accumulate`, every node with the same strength: total charge and its centre.
    func accumulate(strength: Double) { accumulate(root, strength: strength) }

    private func accumulate(_ quad: Node, strength: Double) {
        if let children = quad.children {
            var total = 0.0, weight = 0.0, x = 0.0, y = 0.0
            for child in children {
                guard let child else { continue }
                accumulate(child, strength: strength)
                let c = abs(child.value)
                guard c != 0 else { continue }
                total += child.value
                weight += c
                x += c * child.x
                y += c * child.y
            }
            quad.x = x / weight
            quad.y = y / weight
            quad.value = total
        } else {
            quad.x = points[quad.point].0
            quad.y = points[quad.point].1
            var total = 0.0
            var leaf: Node? = quad
            while let current = leaf {
                total += strength
                leaf = current.next
            }
            quad.value = total
        }
    }
}

/// d3-force's random source, `lcg.js`, so a layout repeats.
nonisolated struct LCG: Sendable {
    private var state: UInt64 = 1

    mutating func next() -> Double {
        state = (1_664_525 &* state &+ 1_013_904_223) % 4_294_967_296
        return Double(state) / 4_294_967_296
    }
}
