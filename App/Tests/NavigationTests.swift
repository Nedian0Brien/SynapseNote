import Foundation
import Testing
@testable import SynapseNote

/// Tabs behave as Morrow's `src/app/tabs.ts`.
struct TabListTests {
    private func places(_ list: TabList) -> [Destination] { list.tabs.map(\.destination) }

    @Test func startsWithOneTabThatFollowsNavigation() {
        var list = TabList()
        #expect(places(list) == [.home])
        list.navigate(to: .page("a"))
        #expect(places(list) == [.page("a")])
        #expect(list.active.destination == .page("a"))
    }

    @Test func opensNewTabsRightAfterTheOpenOne() {
        var list = TabList(.page("a"))
        list.open(.page("b"))
        list.open(.page("c"))
        let first = list.tabs[0].id
        list.activate(first)
        list.open(.trash)
        #expect(places(list) == [.page("a"), .trash, .page("b"), .page("c")])
        #expect(list.active.destination == .trash)
    }

    @Test func stopsOpeningAtTheLimitAndGoesThereInstead() {
        var list = TabList()
        for index in 1..<TabList.limit { list.open(.page("\(index)")) }
        #expect(list.tabs.count == TabList.limit)
        list.open(.page("more"))
        #expect(list.tabs.count == TabList.limit)
        #expect(list.active.destination == .page("more"))
    }

    @Test func closingTheOpenTabOpensTheOneInItsPlace() {
        var list = TabList(.page("a"))
        list.open(.page("b"))
        list.open(.page("c"))
        list.activate(list.tabs[1].id)
        var closed = list.close()
        #expect(closed)
        #expect(places(list) == [.page("a"), .page("c")])
        #expect(list.active.destination == .page("c"))
        closed = list.close()
        #expect(closed)
        #expect(list.active.destination == .page("a"))
        // the last tab stays
        closed = list.close()
        #expect(!closed)
        #expect(places(list) == [.page("a")])
    }

    @Test func closingAnotherTabKeepsTheOpenOne() {
        var list = TabList(.page("a"))
        list.open(.page("b"))
        let closed = list.close(list.tabs[0].id)
        #expect(closed)
        #expect(list.active.destination == .page("b"))
    }

    @Test func stepsAroundBothWays() {
        var list = TabList(.page("a"))
        list.open(.page("b"))
        list.open(.page("c"))
        list.step(1)
        #expect(list.active.destination == .page("a"))
        list.step(-1)
        #expect(list.active.destination == .page("c"))
    }

    @Test func movesATabAsIfItWereOutOfTheList() {
        var list = TabList(.page("a"))
        list.open(.page("b"))
        list.open(.page("c"))
        list.move(list.tabs[2].id, to: 0)
        #expect(places(list) == [.page("c"), .page("a"), .page("b")])
        list.move(list.tabs[0].id, to: 9)
        #expect(places(list) == [.page("a"), .page("b"), .page("c")])
    }

    @Test func restoresSavedTabsAndRejectsBrokenData() throws {
        var list = TabList(.page("a"))
        list.open(.trash)
        let restored = TabList.restore(try JSONEncoder().encode(list))
        #expect(restored == list)
        #expect(TabList.restore(Data("{}".utf8)) == nil)
        #expect(TabList.restore(nil) == nil)
        #expect(TabList.restore(Data(#"{"tabs":[],"activeId":"x"}"#.utf8)) == nil)
        let stray = TabList.restore(Data(#"{"tabs":[{"id":"t","destination":{"home":{}}}],"activeId":"gone"}"#.utf8))
        #expect(stray?.active.id == "t")
    }
}

/// The answers, in the shape `web/src/queries.ts` gives.
struct WorkspaceQueryTests {
    @Test func readsSearchHits() throws {
        let text = #"[{"id":"g","path":["Garden"],"titleMatch":false,"snippet":{"before":"Buy ","match":"stakes","after":""},"firstMatch":"stakes"},{"id":"t","path":[],"titleMatch":true,"snippet":null,"firstMatch":null}]"#
        let hits = try #require(try WorkspaceQuery.decode(text, as: [SearchHit].self))
        #expect(hits.map(\.id) == ["g", "t"])
        #expect(hits[0].snippet?.match == "stakes")
        #expect(hits[1].snippet == nil)
    }

    @Test func readsHomeFacts() throws {
        let text = #"{"streak":2,"pages":3,"words":40,"openTasks":1,"tasks":[{"pageId":"g","index":0,"text":"Buy stakes","checked":false}],"recent":["t","g"],"weeks":[[{"key":"2026-10-19","count":2,"future":false}]],"onThisDay":[],"rediscover":null}"#
        let facts = try #require(try WorkspaceQuery.decode(text, as: HomeFacts.self))
        #expect(facts.streak == 2)
        #expect(facts.tasks.first?.id == "g:0")
        #expect(facts.weeks[0][0] == HomeFacts.Day(key: "2026-10-19", count: 2, future: false))
        #expect(facts.rediscover == nil)
    }

    @Test func readsLinksAndHeadings() throws {
        let links = try #require(try WorkspaceQuery.decode(#"[{"id":"g","context":null}]"#, as: [Backlink].self))
        #expect(links == [Backlink(id: "g", context: nil)])
        let headings = try #require(try WorkspaceQuery.decode(#"[{"index":2,"level":2,"text":"Watering"}]"#, as: [Heading].self))
        #expect(headings == [Heading(index: 2, level: 2, text: "Watering")])
    }

    @Test func noAnswerIsNil() throws {
        #expect(try WorkspaceQuery.decode(nil, as: [Backlink].self) == nil)
        #expect(try WorkspaceQuery.decode(NSNull(), as: [Backlink].self) == nil)
    }

    @Test func namesAndParamsMatchThePage() {
        #expect(WorkspaceQuery.search("milk", limit: 30).name == "search")
        #expect(WorkspaceQuery.search("milk", limit: 30).params["query"] as? String == "milk")
        #expect(WorkspaceQuery.outline("p").params["id"] as? String == "p")
        #expect(WorkspaceQuery.home.params.isEmpty)
    }
}

struct CoverGradientTests {
    /// The numbers Morrow's `cardGradient` gives, worked out with node.
    @Test func picksMorrowsGradientForAPage() {
        #expect(CoverGradient.number(for: "abc") == 7)
        #expect(CoverGradient.number(for: "3f2a9c1e-7b4d-4e8a-9f00-1c2d3e4f5a6b") == 3)
    }
}

struct DailyViewsTests {
    @Test func tabsSavedBeforeTheNewPlacesStillRestore() throws {
        // the shape phase 2 saved: home, a page and the trash
        let saved = #"{"tabs":[{"id":"a","destination":{"home":{}}},{"id":"b","destination":{"page":{"_0":"p"}}},{"id":"c","destination":{"trash":{}}}],"activeId":"b"}"#
        let list = try #require(TabList.restore(Data(saved.utf8)))
        #expect(list.tabs.map(\.destination) == [.home, .page("p"), .trash])
        var next = list
        next.open(.tag("project/garden"))
        next.open(.tasks)
        #expect(TabList.restore(try JSONEncoder().encode(next)) == next)
    }

    @Test func readsTagsTemplatesAndCounts() throws {
        let tags = try #require(try WorkspaceQuery.decode(#"[{"tag":"Project","pages":2,"color":"blue"}]"#, as: [TagEntry].self))
        #expect(tags == [TagEntry(tag: "Project", pages: 2, color: "blue")])
        #expect(tags[0].id == "project")
        let list = try #require(try WorkspaceQuery.decode(#"{"container":null,"templates":[]}"#, as: TemplateList.self))
        #expect(list == TemplateList(container: nil, templates: []))
        let counts = try #require(try WorkspaceQuery.decode(#"{"openTasks":3,"tags":1,"dueCards":2}"#, as: SidebarCounts.self))
        #expect(counts == SidebarCounts(openTasks: 3, tags: 1, dueCards: 2))
        let review = try #require(try WorkspaceQuery.decode(#"{"cards":[{"id":"c","pageId":"p","front":"Q","back":"A"}],"due":["c"]}"#, as: ReviewData.self))
        #expect(review.cards.first == Flashcard(id: "c", pageId: "p", front: "Q", back: "A"))
        #expect(review.due == ["c"])
        #expect(WorkspaceQuery.tagPages("a/b").params["tag"] as? String == "a/b")
    }

    @Test func dailyKeysAreTheLocalDay() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Seoul")!
        // 2026-10-18 20:30 UTC is already the 19th in Seoul
        let date = Date(timeIntervalSince1970: 1_792_355_400)
        #expect(DailyNote.key(for: date, calendar: calendar) == "2026-10-19")
    }

    @Test func iconsFollowMorrowsPageIcon() throws {
        func info(_ id: String, _ change: (inout PageMeta) -> Void) -> PageInfo {
            var page = PageMeta(id: id, parentId: nil)
            change(&page)
            return PageInfo(page)
        }
        let daily = info("d") { $0.dailyDate = "2026-10-19" }
        let journal = info("j") { $0.kind = .journal }
        let templates = info("t") { $0.kind = .templates }
        #expect(PageIcon.symbol(for: daily) == "calendar")
        #expect(PageIcon.symbol(for: journal) == "book")
        #expect(PageIcon.symbol(for: templates) == "square.on.square.dashed")
        #expect(daily.dailyDate == "2026-10-19")
        let locked = info("l") {
            $0.encrypted = true
            $0.icon = "😀"
        }
        #expect(PageIcon.symbol(for: locked) == "lock")
    }
}

/// The layout matches d3-force 3.0.0 with Morrow's settings: the expected positions come from running d3 on
/// the same four nodes and three links (see the phase 5 verification notes).
struct GraphSimulationTests {
    private func simulation() -> GraphSimulation {
        GraphSimulation(radii: [5, 4.6, 3, 4.6], links: [(0, 1), (0, 3), (1, 3)])
    }

    private func expect(_ simulation: GraphSimulation, _ expected: [(Double, Double)], within tolerance: Double) {
        for (node, position) in zip(simulation.nodes, expected) {
            #expect(abs(node.x - position.0) < tolerance)
            #expect(abs(node.y - position.1) < tolerance)
        }
    }

    @Test func oneStepIsD3s() {
        var simulation = simulation()
        simulation.tick()
        expect(simulation, [
            (13.068002955808453, -11.254390687149881), (-26.42189184604546, 9.564136935732417),
            (-1.8697020352837934, -23.115718694030875), (14.587016321849514, 24.932361831397195),
        ], within: 1e-9)
    }

    @Test func fiftyStepsAreD3s() {
        var simulation = simulation()
        for _ in 0..<50 { simulation.tick() }
        expect(simulation, [
            (24.265155808751807, -5.212513948793907), (-22.97793970746638, 22.059512880082583),
            (-25.811502609420838, -64.03962334840003), (24.61741494902629, 47.01122871660772),
        ], within: 1e-6)
        #expect(abs(simulation.alpha - 0.3162277660168378) < 1e-12)
    }

    @Test func aLargerTreeIsD3s() {
        // 40 nodes, i linked to i / 3, and 5 to 30, after 120 steps in d3
        var links = (1..<40).map { ($0, $0 / 3) }
        links.append((5, 30))
        var simulation = GraphSimulation(radii: (0..<40).map { 3 + Double($0 % 5).squareRoot() * 1.6 }, links: links)
        for _ in 0..<120 { simulation.tick() }
        let expected = [(0, 30.63854871283068, -16.327100621896488), (13, -99.95460198885772, -120.26238071924104),
                        (39, -73.50960097705621, -178.48871200630956)]
        for (index, x, y) in expected {
            #expect(abs(simulation.nodes[index].x - x) < 1e-6)
            #expect(abs(simulation.nodes[index].y - y) < 1e-6)
        }
    }

    @Test func settlesAndHeldNodesStay() {
        var simulation = simulation()
        simulation.hold(2, at: (100, 100))
        var steps = 0
        while simulation.isActive, steps < 1000 {
            simulation.tick()
            steps += 1
        }
        #expect(!simulation.isActive)
        #expect(steps < 400)
        #expect(simulation.nodes[2].x == 100 && simulation.nodes[2].y == 100)
    }

    @Test func readsTheGraphAndKeepsGraphTabs() throws {
        let text = ##"{"nodes":[{"id":"g","label":"Garden","kind":"page","pageId":"g","degree":1,"group":"g"},{"id":"#plants","label":"#plants","kind":"tag","pageId":null,"degree":1,"group":"#plants"}],"links":[{"source":"g","target":"#plants","kind":"tag"}]}"##
        let graph = try #require(try WorkspaceQuery.decode(text, as: GraphData.self))
        #expect(graph.nodes.map(\.id) == ["g", "#plants"])
        #expect(graph.links.first?.kind == "tag")
        #expect(GraphLayout.radius(graph.nodes[1], focus: nil) == 3)
        #expect(GraphLayout.radius(graph.nodes[0], focus: "g") == 3 + 1.6 + 2)
        var list = TabList(.graph(nil))
        list.open(.graph("g"))
        #expect(TabList.restore(try JSONEncoder().encode(list)) == list)
        #expect(WorkspaceQuery.graph(GraphOptions(), focus: nil).params["focus"] == nil)
        #expect(WorkspaceQuery.graph(GraphOptions(), focus: "g").params["focus"] as? String == "g")
    }

    @Test func groupColoursFollowMorrow() {
        // morrow: (hash * 31 + code) >>> 0, then hash % 8
        #expect(GraphView.groupIndex("abc", count: 8) == 96354 % 8)
        #expect(GraphView.label(String(repeating: "a", count: 41)) == String(repeating: "a", count: 39) + "…")
    }
}
