import Foundation
import Testing
@testable import SynapseNote

struct CoreDualRunTests {
    /// The editor page's `state` answer, made from what Morrow's loadVault gave for the fixture vault.
    private func webState(_ loaded: JSValue) -> JSValue {
        let docs = loaded["docs"] ?? .object(JSObject())
        return ["pages": loaded["pages"] ?? [], "docs": docs, "unreadable": loaded["unreadable"] ?? [], "problems": loaded["problems"] ?? []]
    }

    @Test func theSameVaultShowsNoDifference() throws {
        VaultLoadTests.useFixtureEnvironment()
        for vault in try #require(CoreFixtures.load("vaults").array) {
            let files = try #require(vault["files"]?.object)
            let loaded = VaultLoad.loadVault(try VaultLoadTests.scan(files), newId: VaultLoadTests.counter("v"), now: VaultLoadTests.fixedNow)
            let report = CoreDualRun.compare(loaded, web: webState(try #require(vault["loaded"])))
            #expect(report.differences.isEmpty, "\(vault["name"]?.string ?? ""): \(report.differences)")
            #expect(report.pages == loaded.pages.count)
        }
    }

    @Test func aDifferenceIsReported() throws {
        VaultLoadTests.useFixtureEnvironment()
        let vault = try #require(CoreFixtures.load("vaults").array?.first)
        let files = try #require(vault["files"]?.object)
        let loaded = VaultLoad.loadVault(try VaultLoadTests.scan(files), newId: VaultLoadTests.counter("v"), now: VaultLoadTests.fixedNow)
        var web = webState(try #require(vault["loaded"])).object!
        var pages = web["pages"]!.array!
        var first = pages[0].object!
        first["title"] = "Something else"
        pages[0] = .object(first)
        web["pages"] = .array(pages)
        let report = CoreDualRun.compare(loaded, web: .object(web))
        #expect(report.differences.count == 1)
        #expect(report.differences.first?.contains("title") == true)
    }
}
