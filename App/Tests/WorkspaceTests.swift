import Foundation
import Testing
@testable import SynapseNote

struct WorkspaceTests {
    private func page(_ id: String, parent: String? = nil, order: Double = 0, created: Double = 0, title: String = "",
                      trashed: Double? = nil, favorite: Bool = false, icon: String? = nil) -> JSONValue {
        .object([
            "id": .string(id),
            "parentId": parent.map(JSONValue.string) ?? .null,
            "title": .string(title),
            "order": .number(order),
            "createdAt": .number(created),
            "trashedAt": trashed.map(JSONValue.number) ?? .null,
            "favorite": .bool(favorite),
            "icon": icon.map(JSONValue.string) ?? .null,
        ])
    }

    private func workspace(_ list: [JSONValue]) -> Workspace {
        Workspace(pages: Dictionary(uniqueKeysWithValues: list.map { ($0["id"]!.stringValue!, $0) }))
    }

    @Test func siblingsSortByOrderThenCreationThenId() {
        let ws = workspace([page("b", order: 1, created: 5), page("a", order: 1, created: 5), page("c", order: 0, created: 9), page("d", order: 1, created: 1)])
        #expect(ws.children(of: nil).map(\.id) == ["c", "d", "a", "b"])
    }

    @Test func rowsShowChildrenOnlyWhenExpanded() {
        let ws = workspace([page("a", order: 1), page("a1", parent: "a", order: 1), page("b", order: 2)])
        #expect(ws.rows(expanded: []).map(\.id) == ["a", "b"])
        #expect(ws.rows(expanded: []).first?.hasChildren == true)
        #expect(ws.rows(expanded: ["a"]).map(\.id) == ["a", "a1", "b"])
        #expect(ws.rows(expanded: ["a"]).map(\.depth) == [0, 1, 0])
    }

    @Test func missingParentsCountAsTheTop() {
        let ws = workspace([page("orphan", parent: "gone", order: 1)])
        #expect(ws.children(of: nil).map(\.id) == ["orphan"])
    }

    @Test func trashedPagesAndTheirSubpagesAreHidden() {
        let ws = workspace([page("a", order: 1, trashed: 10), page("a1", parent: "a"), page("b", order: 2, trashed: 20), page("c", order: 3)])
        #expect(ws.rows(expanded: ["a"]).map(\.id) == ["c"])
        #expect(ws.isTrashed("a1"))
        #expect(!ws.isShowable("a1"))
        #expect(ws.isShowable("c"))
        #expect(ws.trashed.map(\.id) == ["b", "a"])
        #expect(ws.descendants(of: "a").map(\.id) == ["a1"])
    }

    @Test func favoritesAreLiveAndSortedByTitle() {
        let ws = workspace([page("x", title: "Zebra", favorite: true), page("y", title: "apple", favorite: true),
                            page("z", title: "Gone", trashed: 1, favorite: true), page("w", title: "", favorite: true)])
        #expect(ws.favorites.map(\.displayTitle) == ["apple", "Untitled", "Zebra"])
    }

    @Test func movingIntoItselfOrASubpageIsRefused() {
        let ws = workspace([page("a"), page("a1", parent: "a"), page("a2", parent: "a1"), page("b"), page("t", trashed: 1)])
        #expect(!ws.canMove("a", under: "a"))
        #expect(!ws.canMove("a", under: "a2"))
        #expect(!ws.canMove("a", under: "t"))
        #expect(ws.canMove("a2", under: "b"))
        #expect(ws.canMove("a2", under: nil))
    }

    @Test func dropsLandLikeMorrowsSidebar() {
        let ws = workspace([page("a", order: 1), page("b", order: 2), page("c", order: 3), page("b1", parent: "b", order: 1)])
        #expect(ws.dropDestination(of: "a", onto: "c", zone: .after)! == (nil, 2))
        #expect(ws.dropDestination(of: "c", onto: "a", zone: .before)! == (nil, 0))
        #expect(ws.dropDestination(of: "a", onto: "b", zone: .inside)! == ("b", nil))
        #expect(ws.dropDestination(of: "c", onto: "b1", zone: .before)! == ("b", 0))
        #expect(ws.dropDestination(of: "b", onto: "b1", zone: .inside) == nil)
        #expect(ws.dropDestination(of: "a", onto: "a", zone: .after) == nil)
    }

    @Test func commandsHaveMorrowsShape() {
        let now = 1000.0
        func json(_ command: WorkspaceCommand) -> String { JSJSON.stringify(command.morrow(now: now)) }
        #expect(json(.setTaskChecked(pageId: "p", index: 2, checked: true)) == #"{"type":"task.setChecked","pageId":"p","index":2,"checked":true,"now":1000}"#)
        #expect(json(.move(id: "a", parent: nil, index: 2)) == #"{"type":"page.move","id":"a","parentId":null,"index":2}"#)
        #expect(json(.move(id: "a", parent: "b", index: nil)) == #"{"type":"page.move","id":"a","parentId":"b"}"#)
        #expect(json(.setIcon(id: "a", icon: nil)) == #"{"type":"page.setIcon","id":"a","icon":null,"now":1000}"#)
        #expect(WorkspaceCommand.duplicate(id: "a", newId: "n").morrow(now: now)["newId"] == "n")
        #expect(json(.emptyTrash) == #"{"type":"trash.empty"}"#)
        #expect(WorkspaceCommand.deleteForever(id: "a").morrow(now: now)["type"] == "page.deleteForever")
        #expect(json(.rename(id: "a", title: "제목")) == #"{"type":"page.rename","id":"a","title":"제목","now":1000}"#)
        #expect(json(.setTags(id: "a", tags: ["x", "y/z"])) == #"{"type":"page.setTags","id":"a","tags":["x","y/z"],"now":1000}"#)
        #expect(json(.setCover(id: "a", cover: nil)) == #"{"type":"page.setCover","id":"a","cover":null,"now":1000}"#)
        // a document's keys keep their order on the way to the page
        let doc = (["type": "doc", "content": [["type": "paragraph", "content": [["text": "b", "type": "text"]]]]] as JSValue).object!
        #expect(json(.setDoc(id: "a", doc: doc)) == #"{"type":"page.setDoc","id":"a","doc":{"type":"doc","content":[{"type":"paragraph","content":[{"text":"b","type":"text"}]}]},"now":1000}"#)
        // and reach the page as text
        let message = EditorCommand.command(json: json(.rename(id: "a", title: "t"))).json
        #expect(message == .object(["type": .string("command"), "json": .string(#"{"type":"page.rename","id":"a","title":"t","now":1000}"#)]))
    }
}

struct TrashTimeTests {
    @Test func aMomentAgoNeverReadsAsFuture() {
        let now = Date(timeIntervalSince1970: 1000)
        let ahead = TrashView.relative(1_000_500, now: now)
        #expect(!ahead.contains("in "))
    }
}
