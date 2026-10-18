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

/// The editor page's answers, in the shape `web/src/queries.ts` sends.
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
        let counts = try #require(try WorkspaceQuery.decode(#"{"openTasks":3,"tags":1}"#, as: SidebarCounts.self))
        #expect(counts == SidebarCounts(openTasks: 3, tags: 1))
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
        let daily = try #require(PageInfo(.object(["id": .string("d"), "dailyDate": .string("2026-10-19")])))
        let journal = try #require(PageInfo(.object(["id": .string("j"), "kind": .string("journal")])))
        let templates = try #require(PageInfo(.object(["id": .string("t"), "kind": .string("templates")])))
        #expect(PageIcon.symbol(for: daily) == "calendar")
        #expect(PageIcon.symbol(for: journal) == "book")
        #expect(PageIcon.symbol(for: templates) == "square.on.square.dashed")
        #expect(daily.dailyDate == "2026-10-19")
        let locked = try #require(PageInfo(.object(["id": .string("l"), "encrypted": .bool(true), "icon": .string("😀")])))
        #expect(PageIcon.symbol(for: locked) == "lock")
    }
}
