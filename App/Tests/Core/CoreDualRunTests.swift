import Foundation
import Testing
@testable import SynapseNote

struct CoreDualRunTests {
    private func guide() throws -> WorkspaceState {
        VaultLoadTests.useFixtureEnvironment()
        let vault = try #require(CoreFixtures.load("vaults").array?.first)
        let loaded = VaultLoad.loadVault(try VaultLoadTests.scan(try #require(vault["files"]?.object)), newId: VaultLoadTests.counter("v"),
                                         now: VaultLoadTests.fixedNow)
        var state = WorkspaceState()
        for page in loaded.pages { state.pages[page.id] = page }
        state.docs = loaded.docs
        return state
    }

    @Test func theSameWorkspaceShowsNoDifference() throws {
        let state = try guide()
        // the page's copy comes through JSON, keys in whatever order the page keeps them
        var web = WorkspaceState()
        for (id, page) in state.pages.map({ ($0.key, $0.value) }).reversed() { web.pages[id] = page }
        web.docs = state.docs
        let report = CoreDualRun.compare(session: state, unreadable: JSSet(), web: web, webUnreadable: JSSet())
        #expect(report.differences.isEmpty, "\(report.differences)")
        #expect(report.pages == state.pages.count)
    }

    @Test func differencesAreReported() throws {
        let state = try guide()
        var web = state
        let first = try #require(web.pages.keys.first)
        web.pages[first]!.title = "Something else"
        let second = web.docs.keys[1]
        web.docs[second] = Model.emptyDoc()
        let report = CoreDualRun.compare(session: state, unreadable: JSSet(["x"]), web: web, webUnreadable: JSSet())
        #expect(report.differences.count == 3, "\(report.differences)")
        #expect(report.differences.contains { $0.contains("title") })
        #expect(report.differences.contains { $0.contains("doc \(second)") })
        #expect(report.differences.contains { $0.contains("unreadable only in Swift") })
    }
}
