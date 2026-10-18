import Foundation
import Testing
@testable import SynapseNote

struct WorkspaceTests {
    private func page(_ id: String, parent: String? = nil, order: Double, title: String = "", trashed: Bool = false) -> JSONValue {
        .object([
            "id": .string(id),
            "parentId": parent.map(JSONValue.string) ?? .null,
            "title": .string(title),
            "order": .number(order),
            "trashedAt": trashed ? .number(1) : .null,
            "icon": .null,
        ])
    }

    @Test func rowsFollowTheTreeAndOrder() {
        let workspace = Workspace(pages: [
            "b": page("b", order: 2, title: "B"),
            "a": page("a", order: 1, title: "A"),
            "a2": page("a2", parent: "a", order: 2, title: "A2"),
            "a1": page("a1", parent: "a", order: 1, title: "  "),
        ])
        #expect(workspace.rows.map(\.id) == ["a", "a1", "a2", "b"])
        #expect(workspace.rows.map(\.depth) == [0, 1, 1, 0])
        #expect(workspace.rows[1].title == "Untitled")
    }

    @Test func trashedPagesAndTheirSubpagesAreHidden() {
        let workspace = Workspace(pages: [
            "a": page("a", order: 1, trashed: true),
            "a1": page("a1", parent: "a", order: 1),
            "b": page("b", order: 2),
        ])
        #expect(workspace.rows.map(\.id) == ["b"])
        #expect(!workspace.isShowable("a1"))
        #expect(workspace.isShowable("b"))
        #expect(!workspace.isShowable("missing"))
    }

}
