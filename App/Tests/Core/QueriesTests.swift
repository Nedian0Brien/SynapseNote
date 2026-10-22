import Foundation
import Testing
@testable import SynapseNote

/// web/src/queries.ts on four workspaces, Fixtures/core/expected/queries.json.
struct QueriesTests {
    static func state(_ json: JSValue) -> WorkspaceState {
        var state = WorkspaceState()
        for (id, page) in json["pages"]?.object ?? JSObject() { if let meta = PageMeta(json: page) { state.pages[id] = meta } }
        for (id, doc) in json["docs"]?.object ?? JSObject() { if let object = doc.object { state.docs[id] = object } }
        return state
    }

    @Test func answersMatchTheEditorPages() throws {
        VaultLoadTests.useFixtureEnvironment()
        let now = Date(timeIntervalSince1970: VaultLoadTests.fixedNow / 1000)
        var total = 0
        for item in try #require(CoreFixtures.load("queries").array) {
            let name = item["name"]?.string ?? "?"
            let state = Self.state(try #require(item["state"]))
            let activity = item["activity"]?.object ?? JSObject()
            let log = item["log"]?.object ?? JSObject()
            var failures = 0
            for entry in try #require(item["answers"]?.array) {
                let query = try #require(entry["query"]?.string)
                let params = entry["params"]?.object ?? JSObject()
                let context = CoreQueries.Context(
                    state: state, activity: params["activity"] == "none" ? JSObject() : activity,
                    reviewLog: params["log"] == "none" ? JSObject() : log, now: now,
                )
                let answer = try JSJSON.parse(JSJSON.stringify(CoreQueries.answer(query, params, context) ?? .null))
                total += 1
                guard answer != entry["answer"] else { continue }
                failures += 1
                if failures <= 6 {
                    Issue.record("\(name) \(query) \(JSJSON.stringify(.object(params)))\nswift: \(JSJSON.stringify(answer).prefix(1500))\nweb:   \(JSJSON.stringify(entry["answer"] ?? .null).prefix(1500))")
                }
            }
            #expect(failures == 0, "\(name)")
        }
        #expect(total > 400)
    }
}
