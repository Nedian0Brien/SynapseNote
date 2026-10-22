import Foundation
import Testing
@testable import SynapseNote

/// The changes Morrow's database screen makes (DatabaseView.tsx, PropertyValue.tsx, data.ts), as DatabaseEdits
/// makes them. The expected values follow those components line by line.
struct DatabaseEditsTests {
    static let status = PropDef(id: "status", name: "Status", type: "select", options: [
        SelectOption(id: "todo", name: "To do", color: "gray"), SelectOption(id: "doing", name: "Doing", color: "blue"),
        SelectOption(id: "done", name: "Done", color: "green"),
    ])
    static let due = PropDef(id: "due", name: "Due", type: "date", options: [])
    static let check = PropDef(id: "check", name: "Check", type: "checkbox", options: [])
    static let kind = PropDef(id: "kind", name: "Kind", type: "text", options: [])

    static func database() -> DatabaseDef {
        let table = ViewDef(id: "v1", name: "Table", type: "table", filters: [], sorts: [], groupBy: nil, dateProp: nil, hidden: [])
        return DatabaseDef(properties: [status, due, check, kind], views: [table])
    }

    static func row(_ id: String, _ values: [(String, JSValue)]) -> PageMeta {
        var page = PageMeta(id: id, parentId: "db")
        page.properties = JSObject(values)
        return page
    }

    @Test func viewsAreAddedRenamedLaidOutCopiedAndDeleted() throws {
        var database = Self.database()
        let added = DatabaseEdits.addView(database, type: "board", newId: { "v2" })
        #expect(added.view.groupBy == "status")
        #expect(added.view.name == "Board")
        database = added.database
        #expect(database.views.map(\.id) == ["v1", "v2"])

        #expect(DatabaseEdits.renameView(database, "v1", "   ").views[0].name == "Table")
        #expect(DatabaseEdits.renameView(database, "v1", "  Mine ").views[0].name == "Mine")

        // a layout keeps a group and a date that are set, otherwise takes the new layout's
        let board = DatabaseEdits.setLayout(database, "v1", "board").views[0]
        #expect(board.type == "board" && board.groupBy == "status" && board.dateProp == nil)
        var boardDb = database
        boardDb.views[0] = board
        let calendar = DatabaseEdits.setLayout(boardDb, "v1", "calendar").views[0]
        #expect(calendar.groupBy == "status" && calendar.dateProp == "due")

        let copied = DatabaseEdits.duplicateView(database, database.views[0], newId: { "v3" })
        #expect(copied.views.last?.id == "v3")
        #expect(copied.views.last?.name == "Table copy")

        #expect(DatabaseEdits.deleteView(Self.database(), "v1") == nil)
        #expect(DatabaseEdits.deleteView(database, "v1")?.views.map(\.id) == ["v2"])
    }

    @Test func filtersStartOnTheNameAndFollowThePropertyType() {
        let database = Self.database()
        let ids = VaultLoadTests.counter("f")
        var view = DatabaseEdits.addFilter(database.views[0], newId: ids)
        #expect(view.filters == [FilterRule(id: "f1", prop: "title", op: "contains", value: "")])
        view = DatabaseEdits.setFilterProp(view, "f1", "status", database)
        #expect(view.filters[0].op == "is" && view.filters[0].value == .null)
        view = DatabaseEdits.setFilterProp(view, "f1", "check", database)
        #expect(view.filters[0].op == "checked")
        #expect(DatabaseEdits.filterOps(database, "title") == Database.filterOpsFor("text"))
        #expect(DatabaseEdits.filterOps(database, "created") == Database.filterOpsFor("date"))
        view = DatabaseEdits.setFilterOp(view, "f1", "unchecked")
        #expect(DatabaseEdits.filterNeedsValue("unchecked") == false)
        #expect(DatabaseEdits.filterNeedsValue("contains"))
        #expect(DatabaseEdits.removeFilter(view, "f1").filters.isEmpty)

        #expect(DatabaseEdits.filterValue("12", propType: "number") == .number(12))
        #expect(DatabaseEdits.filterValue("", propType: "number") == .string(""))
        #expect(DatabaseEdits.filterValue("abc", propType: "number") == .string(""))
        #expect(DatabaseEdits.filterValue("x", propType: "text") == .string("x"))
        #expect(DatabaseEdits.filterOption("") == .null)
        #expect(DatabaseEdits.filterOption("todo") == .string("todo"))
    }

    @Test func sortsHiddenAndLayoutProperties() {
        let database = Self.database()
        var view = DatabaseEdits.addSort(database.views[0])
        #expect(view.sorts == [SortRule(prop: "title", dir: "asc")])
        view = DatabaseEdits.setSortProp(view, 0, "due")
        view = DatabaseEdits.setSortDir(view, 0, "sideways")
        #expect(view.sorts == [SortRule(prop: "due", dir: "asc")])
        view = DatabaseEdits.addSort(view)
        #expect(DatabaseEdits.sortAscending(view, by: "status").sorts == [SortRule(prop: "status", dir: "asc")])
        #expect(DatabaseEdits.removeSort(view, 0).sorts == [SortRule(prop: "title", dir: "asc")])
        #expect(DatabaseEdits.sortChoices(database).map(\.id) == ["title", "status", "due", "check", "kind", "created", "updated"])

        view = DatabaseEdits.toggleHidden(view, "due")
        #expect(view.hidden == ["due"])
        #expect(DatabaseEdits.toggleHidden(view, "due").hidden.isEmpty)

        var board = database.views[0]
        board.type = "board"
        #expect(DatabaseEdits.setLayoutProp(board, "check").groupBy == "check")
        #expect(DatabaseEdits.setLayoutProp(board, "").groupBy == nil)
        #expect(DatabaseEdits.layoutChoices(database, viewType: "board").map(\.id) == ["status", "check"])
        #expect(DatabaseEdits.layoutChoices(database, viewType: "calendar").map(\.id) == ["due"])
    }

    @Test func propertyNamesAreCheckedAsMorrowChecksThem() {
        let database = Self.database()
        #expect(DatabaseEdits.addProperty(database, name: "  ", type: "text", newId: { "p" }) == .empty)
        #expect(DatabaseEdits.addProperty(database, name: " status ", type: "text", newId: { "p" })
            == .refused("“status” is already used, choose another name."))
        #expect(DatabaseEdits.addProperty(database, name: "tags", type: "text", newId: { "p" })
            == .refused("“tags” is already used, choose another name."))
        guard case .ok(let added) = DatabaseEdits.addProperty(database, name: " Price ", type: "number", newId: { "p" }) else {
            Issue.record("Price was not added")
            return
        }
        #expect(added.properties.last == PropDef(id: "p", name: "Price", type: "number", options: []))

        #expect(DatabaseEdits.renameProperty(database, "status", " ") == .refused("That name is empty or already used."))
        #expect(DatabaseEdits.renameProperty(database, "status", "DUE") == .refused("That name is empty or already used."))
        // a property may take its own name in other letters
        guard case .ok(let renamed) = DatabaseEdits.renameProperty(database, "status", " status ") else {
            Issue.record("status was not renamed")
            return
        }
        #expect(renamed.properties[0].name == "status")
    }

    @Test func deletingAPropertyLeavesEveryView() {
        var database = Self.database()
        database.views[0].filters = [FilterRule(id: "f", prop: "status", op: "is", value: "todo"), FilterRule(id: "g", prop: "kind", op: "empty", value: .null)]
        database.views[0].sorts = [SortRule(prop: "status", dir: "asc"), SortRule(prop: "due", dir: "desc")]
        database.views[0].hidden = ["status", "check"]
        database.views[0].groupBy = "status"
        database.views[0].dateProp = "due"
        let next = DatabaseEdits.deleteProperty(database, "status")
        #expect(next.properties.map(\.id) == ["due", "check", "kind"])
        #expect(next.views[0].filters.map(\.id) == ["g"])
        #expect(next.views[0].sorts == [SortRule(prop: "due", dir: "desc")])
        #expect(next.views[0].hidden == ["check"])
        #expect(next.views[0].groupBy == nil)
        #expect(next.views[0].dateProp == "due")
    }

    @Test func typeChangesConvertEveryRow() throws {
        let database = Self.database()
        let rows = [Self.row("r1", [("kind", "a"), ("status", "doing")]), Self.row("r2", [("kind", "b")]),
                    Self.row("r3", [("kind", "a")]), Self.row("r4", [])]
        #expect(DatabaseEdits.changeType(database, "kind", to: "text", rows: rows, newId: { "x" }) == nil)

        let toSelect = try #require(DatabaseEdits.changeType(database, "kind", to: "select", rows: rows, newId: VaultLoadTests.counter("o")))
        let kind = try #require(toSelect.database.properties.first { $0.id == "kind" })
        #expect(kind.type == "select")
        #expect(kind.options == Database.optionsFromValues(Self.kind, rows.map { $0.properties["kind"] ?? .null }, VaultLoadTests.counter("o")))
        #expect(kind.options.map(\.name) == ["a", "b"])
        #expect(toSelect.values.map(\.rowId) == ["r1", "r2", "r3", "r4"])
        #expect(toSelect.values.map(\.value) == rows.map { Database.convertValue(Self.kind, kind, $0.properties["kind"] ?? .null) })

        // options stay between select and multi-select, and go when the property becomes text
        let toMulti = try #require(DatabaseEdits.changeType(database, "status", to: "multiSelect", rows: rows, newId: { "x" }))
        #expect(toMulti.database.properties[0].options == Self.status.options)
        #expect(toMulti.values[0].value == .array(["doing"]))
        let toText = try #require(DatabaseEdits.changeType(database, "status", to: "text", rows: rows, newId: { "x" }))
        #expect(toText.database.properties[0].options.isEmpty)
        #expect(toText.values[0].value == .string("Doing"))
    }

    @Test func optionsAreFoundOrMade() throws {
        let database = Self.database()
        let found = try #require(DatabaseEdits.ensureOption(database, "status", " DOING ", newId: { "n" }))
        #expect(found.database == nil)
        #expect(found.option.id == "doing")
        let made = try #require(DatabaseEdits.ensureOption(database, "status", "  New ", newId: { "n" }))
        #expect(made.option == SelectOption(id: "n", name: "New", color: Model.colors[3]))
        #expect(made.database?.properties[0].options.last == made.option)
        #expect(DatabaseEdits.ensureOption(database, "status", "  ", newId: { "n" }) == nil)

        #expect(DatabaseEdits.renameOption(database, "status", "todo", " ") == nil)
        #expect(DatabaseEdits.renameOption(database, "status", "todo", " Later ")?.properties[0].options[0].name == "Later")
        #expect(DatabaseEdits.setOptionColor(database, "status", "todo", "red").properties[0].options[0].color == "red")
        #expect(DatabaseEdits.deleteOption(database, "status", "todo").properties[0].options.map(\.id) == ["doing", "done"])

        let matching = DatabaseEdits.optionsMatching(Self.status, " DO")
        #expect(matching.shown.map(\.id) == ["todo", "doing", "done"])
        #expect(matching.exact == false)
        #expect(DatabaseEdits.optionsMatching(Self.status, "done ").exact)
        #expect(DatabaseEdits.optionsMatching(Self.status, "").shown.count == 3)
    }

    @Test func cellValuesAreSavedAsMorrowSavesThem() {
        #expect(DatabaseEdits.textValue("") == .null)
        #expect(DatabaseEdits.textValue(" a ") == .string(" a "))
        #expect(DatabaseEdits.numberValue(" 12.5 ") == .number(12.5))
        #expect(DatabaseEdits.numberValue("  ") == .null)
        #expect(DatabaseEdits.numberValue("abc") == .null)
        #expect(DatabaseEdits.numberValue("0x10") == .number(16))
        #expect(DatabaseEdits.urlValue("  https://a.b  ") == .string("https://a.b"))
        #expect(DatabaseEdits.urlValue("   ") == .null)
        #expect(DatabaseEdits.isOpenableURL("HTTPS://a.b"))
        #expect(!DatabaseEdits.isOpenableURL("ftp://a.b"))

        // a select takes one and closes, choosing it again clears it; a multi-select toggles and stays open
        #expect(DatabaseEdits.choose("todo", selected: [], multi: false) == (.string("todo"), true))
        #expect(DatabaseEdits.choose("todo", selected: ["todo"], multi: false) == (.null, true))
        #expect(DatabaseEdits.choose("b", selected: ["a"], multi: true) == (.array(["a", "b"]), false))
        #expect(DatabaseEdits.choose("a", selected: ["a"], multi: true) == (.null, false))
        #expect(DatabaseEdits.chooseCreated("a", selected: ["a", "b"], multi: true) == .array(["b", "a"]))
        #expect(DatabaseEdits.chooseCreated("a", selected: ["b"], multi: false) == .string("a"))
        #expect(DatabaseEdits.selectedIds("x") == ["x"])
        #expect(DatabaseEdits.selectedIds(.array(["x", 1, "y"])) == ["x", "y"])

        // relations keep page titles, compared ignoring case
        #expect(DatabaseEdits.toggleRelation("Home", targets: ["home"]) == .null)
        #expect(DatabaseEdits.toggleRelation("Other", targets: ["Home"]) == .array(["Home", "Other"]))
    }

    @Test func boardsCalendarsAndCards() throws {
        #expect(DatabaseEdits.boardValue(Self.check, key: "true") == .bool(true))
        #expect(DatabaseEdits.boardValue(Self.check, key: nil) == .bool(false))
        #expect(DatabaseEdits.boardValue(Self.status, key: nil) == .null)
        #expect(DatabaseEdits.boardValue(Self.status, key: "todo") == .string("todo"))
        var multi = Self.status
        multi.type = "multiSelect"
        #expect(DatabaseEdits.boardValue(multi, key: "todo") == .array(["todo"]))

        var database = Self.database()
        database.views[0].groupBy = "status"
        let rows = [Self.row("r1", [("status", "doing")])]
        // the column of rows without a value only shows when it has rows
        #expect(DatabaseEdits.boardGroups(rows, database.views[0], database).map(\.key) == ["todo", "doing", "done"])
        let loose = rows + [Self.row("r2", [])]
        #expect(DatabaseEdits.boardGroups(loose, database.views[0], database).map(\.key) == [nil, "todo", "doing", "done"])

        // October 2026 starts on a Thursday: the grid starts on Monday 28 September and ends on Sunday 8 November
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: "UTC"))
        let month = try #require(calendar.date(from: DateComponents(year: 2026, month: 10, day: 17)))
        let days = DatabaseEdits.calendarDays(month: month, calendar: calendar)
        #expect(days.count == 42)
        #expect(calendar.dateComponents([.month, .day], from: days[0]) == DateComponents(month: 9, day: 28))
        #expect(calendar.dateComponents([.month, .day], from: days[41]) == DateComponents(month: 11, day: 8))
        #expect(calendar.component(.weekday, from: days[0]) == 2)

        let dated = [Self.row("a", [("due", "2026-10-20")]), Self.row("b", [("due", "2026-10-20")]), Self.row("c", [("due", 5)])]
        #expect(DatabaseEdits.rowsByDay(dated, "due").mapValues { $0.map(\.id) } == ["2026-10-20": ["a", "b"]])

        #expect(DatabaseEdits.countText(shown: 1, all: 1) == "1 row")
        #expect(DatabaseEdits.countText(shown: 3, all: 3) == "3 rows")
        #expect(DatabaseEdits.countText(shown: 1, all: 4) == "1 of 4 rows")

        let doc = try #require((["type": "doc", "content": [
            ["type": "paragraph", "content": [["type": "image", "attrs": ["fileId": "nested.png"]]]],
            ["type": "image", "attrs": ["fileId": 7]],
            ["type": "image", "attrs": ["fileId": "top.png"]],
            ["type": "taskList", "content": [
                ["type": "taskItem", "attrs": ["checked": true], "content": [["type": "taskList", "content": [["type": "taskItem", "attrs": ["checked": false]]]]]],
                ["type": "taskItem", "attrs": ["checked": true]],
            ]],
        ]] as JSValue).object)
        #expect(DatabaseEdits.firstImage(doc) == "top.png")
        #expect(DatabaseEdits.firstImage(nil) == nil)
        let progress = DatabaseEdits.taskProgress(doc)
        #expect(progress.done == 2 && progress.total == 3)
    }
}
