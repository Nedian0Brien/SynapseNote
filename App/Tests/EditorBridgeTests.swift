import Foundation
import Testing
@testable import SynapseNote

struct EditorBridgeTests {
    private let doc: [String: Any] = ["type": "doc", "content": [["type": "paragraph"]]]

    @Test func readsKnownMessages() {
        #expect(EditorEvent(body: ["type": "ready"]) == .ready)
        #expect(EditorEvent(body: ["type": "openPage", "pageId": "p"]) == .openPage(pageId: "p"))
        #expect(
            EditorEvent(body: ["type": "docChanged", "pageId": "p", "doc": doc])
                == .docChanged(pageId: "p", doc: .object(["type": .string("doc"), "content": .array([.object(["type": .string("paragraph")])])]))
        )
        #expect(EditorEvent(body: ["type": "openExternal", "url": "https://example.com"]) == .openExternal(URL(string: "https://example.com")!))
    }

    @Test func dropsMalformedMessages() {
        #expect(EditorEvent(body: ["type": "eval"]) == nil)
        #expect(EditorEvent(body: "ready") == nil)
        #expect(EditorEvent(body: ["type": "docChanged", "pageId": "p", "doc": ["type": "paragraph"]]) == nil)
        #expect(EditorEvent(body: ["type": "pageCreated", "page": ["title": "x"], "doc": doc]) == nil)
        #expect(EditorEvent(body: ["type": "openPage"]) == nil)
    }

    @Test func opensOnlyWebAndMailLinks() {
        #expect(EditorEvent(body: ["type": "openExternal", "url": "mailto:a@example.com"]) != nil)
        #expect(EditorEvent(body: ["type": "openExternal", "url": "file:///etc/hosts"]) == nil)
        #expect(EditorEvent(body: ["type": "openExternal", "url": "javascript:alert(1)"]) == nil)
    }

    @Test func loadCarriesTheWholeWorkspace() throws {
        let workspace = Workspace(pages: ["p": .object(["id": .string("p")])], docs: ["p": .object(["type": .string("doc")])])
        let json = EditorCommand.load(pageId: "p", workspace: workspace, editable: true).json
        #expect(json["type"] == .string("load"))
        #expect(json["state"]?["pages"]?["p"]?["id"] == .string("p"))
        #expect(json["state"]?["docs"]?["p"]?["type"] == .string("doc"))
        #expect(EditorCommand.theme(dark: true).json["theme"] == .string("dark"))
    }
}
