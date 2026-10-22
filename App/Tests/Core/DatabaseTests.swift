import Foundation
import Testing
@testable import SynapseNote

/// Morrow's core/database.ts in node, Fixtures/core/expected/database.json: a database with every property type,
/// formulas included, and rows with every kind of value give the same values, filters, sorts, groups,
/// conversions, cell readings and inferred types.
struct DatabaseTests {
    private static let now = 1_792_402_200_000.0

    private func load() throws -> (fixture: JSValue, database: DatabaseDef, rows: [PageMeta]) {
        VaultLoadTests.useFixtureEnvironment()
        let fixture = try CoreFixtures.load("database")
        let database = try #require(Migrations.normalizeDatabase(fixture["database"]))
        let rows = try #require(fixture["rows"]?.array).map { try #require(PageMeta(json: $0)) }
        return (fixture, database, rows)
    }

    private func check(_ actual: JSValue, _ expected: JSValue?, _ label: String) {
        #expect(actual == expected, "\(label)\n swift \(CoreFixtures.describe(actual).prefix(600))\n morrow \(CoreFixtures.describe(expected ?? .null).prefix(600))")
    }

    @Test func valuesFormulasAndText() throws {
        let (fixture, database, rows) = try load()
        let propIds = ["title", "created", "updated"] + database.properties.map(\.id)
        check(.array(rows.map { row in .array(propIds.map { Database.valueOf(row, $0, database, now: Self.now) }) }), fixture["values"], "values")
        let formulas = database.properties.filter { $0.type == "formula" }
        check(.array(rows.map { row in
            .array(formulas.map { prop in
                let result = Database.formulaResult(row, prop, database, now: Self.now)
                return ["value": result.value, "error": result.error.map(JSValue.string) ?? .null]
            })
        }), fixture["formulas"], "formulas")
        check(.array(rows.map { row in .array(database.properties.map { .string(Database.formatValue($0, row.properties[$0.id] ?? .null)) }) }),
              fixture["formatted"], "formatted")
        let loose: [JSValue] = [.null, "x", 3, true, ["a", "b"], [1, .null]]
        check(.array(loose.map { .string(Database.formatValue(nil, $0)) }), fixture["formatWithout"], "formatWithout")
    }

    @Test func filtersSortsAndGroups() throws {
        let (fixture, database, rows) = try load()
        let filters = try #require(fixture["filters"]?.array)
        #expect(filters.count > 1000)
        for item in filters {
            let rule = try #require(item["rule"])
            let filter = FilterRule(id: rule["id"]!.string!, prop: rule["prop"]!.string!, op: rule["op"]!.string!, value: rule["value"] ?? .null)
            let matched = rows.filter { Database.matchesFilter($0, filter, database, now: Self.now) }.map { JSValue.string($0.id) }
            check(.array(matched), item["rows"], "filter \(CoreFixtures.describe(rule))")
        }
        for item in try #require(fixture["sorts"]?.array) {
            let rules = try #require(item["rules"]?.array).map { SortRule(prop: $0["prop"]!.string!, dir: $0["dir"]!.string!) }
            let sorted = Database.sortRows(rows, rules, database, now: Self.now).map { JSValue.string($0.id) }
            check(.array(sorted), item["rows"], "sort \(CoreFixtures.describe(item["rules"] ?? .null))")
        }
        let view = try #require(fixture["view"]?["view"])
        let viewDef = try #require(Migrations.normalizeDatabase(["properties": [], "views": [view]])?.views.first)
        check(.array(Database.visibleRows(rows, viewDef, database, now: Self.now).map { .string($0.id) }), fixture["view"]?["rows"], "view")
        for item in try #require(fixture["groups"]?.array) {
            let groups = Database.groupRows(rows, item["propId"]?.string, database).map { group -> JSValue in
                ["key": group.key.map(JSValue.string) ?? .null, "label": .string(group.label), "color": .string(group.color),
                 "rows": .array(group.rows.map { .string($0.id) })]
            }
            check(.array(groups), item["groups"], "groups by \(item["propId"]?.string ?? "nothing")")
        }
    }

    @Test func conversionsCellsTypesAndSchemas() throws {
        let (fixture, database, rows) = try load()
        let byId = Dictionary(uniqueKeysWithValues: database.properties.map { ($0.id, $0) })
        for item in try #require(fixture["conversions"]?.array) {
            let from = try #require(byId[item["from"]!.string!])
            let to = try #require(byId[item["to"]!.string!])
            check(.array(rows.map { Database.convertValue(from, to, $0.properties[from.id] ?? .null) }), item["values"], "convert \(from.id) → \(to.id)")
        }
        let options = database.properties.map { from in
            JSValue.array(Database.optionsFromValues(from, rows.map { $0.properties[from.id] ?? .null }, VaultLoadTests.counter("opt")).map(\.json))
        }
        check(.array(options), fixture["options"], "options")
        let cells = ["", "  ", "1,234.5", "x", "yes", "TRUE", "no", "2026-10-19", "October 19, 2026", "19 Oct 2026", "10/19/2026", "2026/2/31",
                     "Sept 5, 2026", "Monday", "doing", "Red, blue", "red,gone"]
        for item in try #require(fixture["cells"]?.array) {
            let prop = try #require(byId[item["prop"]!.string!])
            check(.array(cells.map { Database.parseCellValue(prop, $0) }), item["values"], "cells of \(prop.id)")
        }
        for item in try #require(fixture["types"]?.array) {
            let column = try #require(item["column"]?.array).map { $0.string! }
            check(.string(Database.inferType(column)), item["type"], "type of \(column)")
        }
        let table = Database.databaseFromTable(
            ["Name", "Done", "Pages", "When", "Site", "Tags", "Status", "", "tags", "Notes", "notes"],
            [
                ["A", "yes", "1", "2026-10-19", "https://a.org", "red, blue", "To do", "", "x", "free text", "n"],
                ["B", "no", "2", "2026-10-20", "https://b.org", "blue", "Done", "", "y", "more", "m"],
                ["C", "", "3,000", "Oct 21, 2026", "http://c.org", "red", "To do", "", "z", "and more words here", "o"],
            ],
            VaultLoadTests.counter("t"),
        )
        check(table.json, fixture["table"], "table")
        check(Database.defaultDatabase(VaultLoadTests.counter("n")).json, fixture["defaultDatabase"], "defaultDatabase")
    }
}
