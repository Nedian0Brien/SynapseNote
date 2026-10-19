import Foundation
import Testing
@testable import SynapseNote

/// The deltas web/src/stateDelta.ts makes over the guide vault's session steps, Fixtures/core/expected/mirror.json:
/// applied in turn they give the session's workspace.
struct StateMirrorTests {
    @Test func deltasAddUpToTheSession() throws {
        let steps = try #require(CoreFixtures.load("mirror").array)
        #expect(steps.count == 10)
        let mirror = StateMirror()
        for (index, step) in steps.enumerated() {
            if let delta = step["delta"], !delta.isNull { #expect(mirror.apply(delta), "step \(index)") }
            let expected = QueriesTests.state(try #require(step["state"]))
            #expect(mirror.state.pages.keys == expected.pages.keys, "step \(index) pages")
            for (id, page) in expected.pages { #expect(mirror.state.pages[id] == page, "step \(index) page \(id)") }
            #expect(mirror.state.docs == expected.docs, "step \(index) docs")
        }
        #expect(mirror.revision > 1)
    }

    @Test func oldDeltasAreRefused() {
        let mirror = StateMirror()
        #expect(!mirror.apply(["revision": 3, "full": false, "pages": []]))
        #expect(mirror.apply(["revision": 3, "full": true, "pages": [["id": "a", "title": "A"]], "docs": [:]]))
        #expect(mirror.state.pages["a"]?.title == "A")
        #expect(!mirror.apply(["revision": 2, "full": false, "pages": [["id": "a", "title": "Old"]]]))
        #expect(mirror.apply(["revision": 4, "full": false, "pages": [["id": "a", "title": "New"]], "removedDocs": ["a"]]))
        #expect(mirror.state.pages["a"]?.title == "New")
        #expect(mirror.apply(["revision": 5, "full": false, "removed": ["a"]]))
        #expect(mirror.state.pages.isEmpty)
    }
}
