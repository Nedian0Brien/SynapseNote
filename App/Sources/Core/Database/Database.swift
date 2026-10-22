import Foundation

/// Morrow's core/database.ts: databases are pages whose subpages are rows, each row keeps its values in its
/// frontmatter. Values are `JSValue`s as Morrow keeps them (text, number, true/false, option ids, lists).
nonisolated enum Database {
    // pseudo properties every row has
    static let titleProp = "title"
    static let createdProp = "created"
    static let updatedProp = "updated"

    static let propLabels: [String: String] = [
        "text": "Text", "number": "Number", "select": "Select", "multiSelect": "Multi-select", "date": "Date",
        "checkbox": "Checkbox", "url": "Link", "relation": "Relation", "formula": "Formula",
    ]
    static let viewLabels: [String: String] = ["table": "Table", "board": "Board", "calendar": "Calendar", "list": "List", "gallery": "Gallery"]
    static let filterLabels: [String: String] = [
        "contains": "contains", "notContains": "does not contain", "is": "is", "isNot": "is not", "empty": "is empty",
        "notEmpty": "is not empty", "gt": "is greater than", "lt": "is less than", "checked": "is checked", "unchecked": "is not checked",
    ]

    static func filterOpsFor(_ type: String) -> [String] {
        switch type {
        case "number", "date": ["is", "isNot", "gt", "lt", "empty", "notEmpty"]
        case "checkbox": ["checked", "unchecked"]
        case "select", "multiSelect": ["is", "isNot", "empty", "notEmpty"]
        default: ["contains", "notContains", "is", "isNot", "empty", "notEmpty"]
        }
    }

    static func newOption(_ name: String, _ index: Int, _ newId: () -> String) -> SelectOption {
        SelectOption(id: newId(), name: name, color: Model.colors[index % Model.colors.count])
    }

    static func newView(_ type: String, _ database: DatabaseDef, _ newId: () -> String) -> ViewDef {
        let select = database.properties.first { $0.type == "select" }
        let date = database.properties.first { $0.type == "date" }
        return ViewDef(id: newId(), name: viewLabels[type] ?? type, type: type, filters: [], sorts: [],
                       groupBy: type == "board" ? select?.id : nil, dateProp: type == "calendar" ? date?.id : nil, hidden: [])
    }

    static func defaultDatabase(_ newId: () -> String) -> DatabaseDef {
        let statusId = newId()
        let options = ["To do", "Doing", "Done"].enumerated().map { index, name in
            SelectOption(id: newId(), name: name, color: ["gray", "blue", "green"][index])
        }
        let status = PropDef(id: statusId, name: "Status", type: "select", options: options)
        let date = PropDef(id: newId(), name: "Date", type: "date", options: [])
        var database = DatabaseDef(properties: [status, date], views: [])
        database.views = [newView("table", database, newId), newView("board", database, newId), newView("calendar", database, newId)]
        return database
    }

    static func rowsOf(_ state: WorkspaceState, _ databaseId: String) -> [PageMeta] {
        Tree.childrenOf(state.pages, databaseId)
    }

    static func findDatabaseOf(_ state: WorkspaceState, _ page: PageMeta) -> PageMeta? {
        guard let parentId = page.parentId, let parent = state.pages[parentId], parent.kind == .database, parent.database != nil else { return nil }
        return parent
    }

    static func valueOf(_ page: PageMeta, _ propId: String, _ database: DatabaseDef?, now: Double) -> JSValue {
        if propId.jsEquals(titleProp) { return .string(Model.displayTitle(page)) }
        if propId.jsEquals(createdProp) { return .number(page.createdAt) }
        if propId.jsEquals(updatedProp) { return .number(page.updatedAt) }
        if let database, let prop = database.properties.first(where: { $0.id.jsEquals(propId) }), prop.type == "formula" {
            return formulaResult(page, prop, database, now: now).value
        }
        return page.properties[propId] ?? .null
    }

    /// a formula's value for one row, other properties are found by name with prop("Name")
    static func formulaResult(_ page: PageMeta, _ prop: PropDef, _ database: DatabaseDef, depth: Int = 0, now: Double) -> (value: JSValue, error: String?) {
        if depth > 8 { return (.null, "Formulas refer to each other in a loop") }
        return Formula.compute(prop.formula ?? "", prop: { name in
            let wanted = JSText.string(JSText.lowercased(JSText.trim(name.units)))
            guard let other = database.properties.first(where: { JSText.string(JSText.lowercased($0.name.units)).jsEquals(wanted) }) else {
                if wanted == "title" || wanted == "name" { return .string(Model.displayTitle(page)) }
                if wanted == "created" { return .number(page.createdAt) }
                if wanted == "updated" || wanted == "edited" { return .number(page.updatedAt) }
                return .null
            }
            if other.type == "formula" { return formulaResult(page, other, database, depth: depth + 1, now: now).value }
            let value = page.properties[other.id] ?? .null
            if other.type == "checkbox" { return .bool(value == .bool(true)) }
            if other.type == "number" { return value }
            if case .bool = value { return value }
            let text = formatValue(other, value)
            return text.isEmpty ? .null : .string(text)
        }, now: now)
    }

    static func propType(_ database: DatabaseDef, _ propId: String) -> String? {
        if propId.jsEquals(titleProp) { return "title" }
        if propId.jsEquals(createdProp) || propId.jsEquals(updatedProp) { return "number" }
        return database.properties.first { $0.id.jsEquals(propId) }?.type
    }

    /// plain text for searching, sorting and exporting
    static func formatValue(_ prop: PropDef?, _ value: JSValue?) -> String {
        guard let value, !value.isNull else { return "" }
        guard let prop else {
            if case .array(let items) = value { return items.map { $0.isNull ? "" : $0.jsString }.joined(separator: ", ") }
            return value.jsString
        }
        switch prop.type {
        case "select":
            return prop.options.first { .string($0.id) == value }?.name ?? ""
        case "multiSelect":
            let ids = value.array ?? []
            return ids.compactMap { id in prop.options.first { .string($0.id) == id }?.name }.filter { !$0.isEmpty }.joined(separator: ", ")
        case "checkbox":
            return value == .bool(true) ? "Yes" : "No"
        case "relation":
            let items = value.array ?? [value]
            return items.map { $0.isNull ? "" : $0.jsString }.joined(separator: ", ")
        case "formula":
            switch value {
            case .number(let number): return JSNumber.string(Formula.mathRound(number * 1e6) / 1e6)
            case .bool(let flag): return flag ? "Yes" : "No"
            default: return value.jsString
            }
        default:
            return value.jsString
        }
    }

    /// JavaScript's `Number(value)`
    static func toNumber(_ value: JSValue) -> Double {
        switch value {
        case .null: 0
        case .bool(let flag): flag ? 1 : 0
        case .number(let number): number
        case .string(let text): JSNumber.parse(text)
        case .array(let items): items.isEmpty ? 0 : items.count == 1 ? JSNumber.parse(items[0].isNull ? "" : items[0].jsString) : .nan
        case .object: .nan
        }
    }

    static func isEmpty(_ value: JSValue?) -> Bool {
        switch value {
        case nil, .null: true
        case .string(let text): text.isEmpty
        case .bool(let flag): !flag
        case .array(let items): items.isEmpty
        default: false
        }
    }

    private static func compareValues(_ a: JSValue, _ b: JSValue, _ prop: PropDef?) -> Double {
        if isEmpty(a), isEmpty(b) { return 0 }
        // empty values sort last whichever way the column is sorted
        if isEmpty(a) { return 1 }
        if isEmpty(b) { return -1 }
        if case .number(let x) = a, case .number(let y) = b { return x - y }
        if case .bool(let x) = a, case .bool(let y) = b { return (y ? 1 : 0) - (x ? 1 : 0) }
        if let prop, prop.type == "select" {
            let x = prop.options.firstIndex { .string($0.id) == a } ?? -1
            let y = prop.options.firstIndex { .string($0.id) == b } ?? -1
            return Double(x - y)
        }
        return Double(JSCollator.compare(formatValue(prop, a), formatValue(prop, b), locale: JSEnvironment.locale, titles: true))
    }

    static func matchesFilter(_ page: PageMeta, _ rule: FilterRule, _ database: DatabaseDef, now: Double) -> Bool {
        let prop = database.properties.first { $0.id.jsEquals(rule.prop) }
        let value = valueOf(page, rule.prop, database, now: now)
        let text = JSText.lowercased(formatValue(prop, value).units)
        let wanted = rule.value
        /// `String(wanted ?? '')`
        let wantedText = wanted.isNull ? "" : wanted.jsString
        switch rule.op {
        case "empty": return isEmpty(value)
        case "notEmpty": return !isEmpty(value)
        case "checked": return value == .bool(true)
        case "unchecked": return value != .bool(true)
        case "contains": return JSText.indexOf(text, JSText.lowercased(wantedText.units)) != -1
        case "notContains": return JSText.indexOf(text, JSText.lowercased(wantedText.units)) == -1
        case "gt", "lt":
            if isEmpty(value) || wanted.isNull || wanted == .string("") { return false }
            let order: Double
            if case .number(let number) = value {
                order = number - toNumber(wanted)
            } else {
                order = Double(JSCollator.compare(value.jsString, wanted.jsString, locale: JSEnvironment.locale))
            }
            return rule.op == "gt" ? order > 0 : order < 0
        case "is", "isNot":
            let same: Bool
            if wanted.isNull || wanted == .string("") {
                same = isEmpty(value)
            } else if case .array(let items) = value {
                same = items.contains(.string(wanted.jsString))
            } else if case .number(let number) = value {
                same = number == toNumber(wanted)
            } else if prop?.type == "select" || rule.prop.jsEquals(titleProp) || prop?.type == "date" {
                same = JSText.lowercased((value.isNull ? "" : value.jsString).units) == JSText.lowercased(wanted.jsString.units)
            } else {
                same = text == JSText.lowercased(wanted.jsString.units)
            }
            return rule.op == "is" ? same : !same
        default:
            return true
        }
    }

    static func sortRows(_ rows: [PageMeta], _ sorts: [SortRule], _ database: DatabaseDef, now: Double) -> [PageMeta] {
        if sorts.isEmpty { return rows }
        return rows.jsSorted { a, b in
            for sort in sorts {
                let prop = database.properties.first { $0.id.jsEquals(sort.prop) }
                let va = valueOf(a, sort.prop, database, now: now)
                let vb = valueOf(b, sort.prop, database, now: now)
                var order = compareValues(va, vb, prop)
                if sort.dir == "desc", !isEmpty(va), !isEmpty(vb) { order = -order }
                // Morrow returns any order other than 0; Array.prototype.sort reads NaN as equal
                if order.isNaN { return 0 }
                if order != 0 { return order < 0 ? -1 : 1 }
            }
            let order = a.order - b.order
            return order == 0 || order.isNaN ? 0 : order < 0 ? -1 : 1
        }
    }

    static func visibleRows(_ rows: [PageMeta], _ view: ViewDef, _ database: DatabaseDef, now: Double) -> [PageMeta] {
        let filtered = rows.filter { row in view.filters.allSatisfy { matchesFilter(row, $0, database, now: now) } }
        return sortRows(filtered, view.sorts, database, now: now)
    }

    struct RowGroup: Sendable {
        /// the option id, or nil for rows without a value
        var key: String?
        var label: String
        var color: String
        var rows: [PageMeta]
    }

    /// board columns: one per option in order, rows without a value come first
    static func groupRows(_ rows: [PageMeta], _ propId: String?, _ database: DatabaseDef) -> [RowGroup] {
        guard let prop = database.properties.first(where: { propId != nil && $0.id.jsEquals(propId!) }) else {
            return [RowGroup(key: nil, label: "All", color: "gray", rows: rows)]
        }
        if prop.type == "checkbox" {
            return [
                RowGroup(key: "false", label: "Not checked", color: "gray", rows: rows.filter { $0.properties[prop.id] != .bool(true) }),
                RowGroup(key: "true", label: "Checked", color: "green", rows: rows.filter { $0.properties[prop.id] == .bool(true) }),
            ]
        }
        let label = JSText.string(JSText.lowercased(prop.name.units))
        var groups = [RowGroup(key: nil, label: "No \(label.isEmpty ? "value" : label)", color: "gray", rows: [])]
        groups += prop.options.map { RowGroup(key: $0.id, label: $0.name, color: $0.color, rows: []) }
        for row in rows {
            let value = row.properties[prop.id]
            let keys: [JSValue]
            switch value {
            case .array(let items)?: keys = items
            case .string?: keys = [value!]
            default: keys = []
            }
            let matched = groups.indices.filter { index in groups[index].key.map { keys.contains(.string($0)) } ?? false }
            if matched.isEmpty { groups[0].rows.append(row) } else { for index in matched { groups[index].rows.append(row) } }
        }
        return groups
    }

    private static let numberInText = JSRegex(#"-?\d+(?:\.\d+)?"#)
    private static let truthyText = JSRegex(#"^(yes|true|x|1)$"#, ignoreCase: true)
    private static let dateStart = JSRegex(#"^\d{4}-\d{2}-\d{2}"#)

    /// keeps what still makes sense when a property changes type
    static func convertValue(_ from: PropDef, _ to: PropDef, _ value: JSValue?) -> JSValue {
        guard let value, !value.isNull else { return .null }
        let text = formatValue(from, value)
        switch to.type {
        case "number":
            let plain = JSText.removing(text, [0x2C])
            let number: Double
            if case .number(let given) = value {
                number = given
            } else if let match = numberInText.exec(plain.units) {
                number = JSNumber.parse(JSText.string(plain.units[match.range]))
            } else {
                number = .nan
            }
            return number.isFinite ? .number(number) : .null
        case "checkbox":
            return .bool(value == .bool(true) || truthyText.test(JSText.trim(text)))
        case "date":
            return dateStart.test(text) ? .string(JSText.string(JSText.slice(text.units, 0, 10))) : .null
        case "select":
            let first = JSText.string(JSText.lowercased(JSText.trim(JSText.split(text, on: 0x2C)[0].units)))
            return to.options.first { JSText.string(JSText.lowercased($0.name.units)).jsEquals(first) }.map { .string($0.id) } ?? .null
        case "multiSelect":
            let names = JSText.split(text, on: 0x2C).map { JSText.string(JSText.lowercased(JSText.trim($0.units))) }
            let ids = to.options.filter { option in names.contains { $0.jsEquals(JSText.string(JSText.lowercased(option.name.units))) } }.map { JSValue.string($0.id) }
            return ids.isEmpty ? .null : .array(ids)
        case "relation":
            if text.isEmpty { return .null }
            return .array(JSText.split(text, on: 0x2C).map { JSText.trim($0) }.filter { !$0.isEmpty }.map(JSValue.string))
        case "formula":
            return .null
        default:
            return text.isEmpty ? .null : .string(text)
        }
    }

    /// options a converted select needs, made from the values the rows already have
    static func optionsFromValues(_ from: PropDef, _ values: [JSValue], _ newId: () -> String) -> [SelectOption] {
        var names = JSMap<String>()
        for value in values {
            for part in JSText.split(formatValue(from, value), on: 0x2C) {
                let name = JSText.trim(part)
                let key = JSText.string(JSText.lowercased(name.units))
                if !name.isEmpty, !names.has(key) { names[key] = name }
            }
        }
        return names.valuesInOrder.prefix(200).enumerated().map { newOption($1, $0, newId) }
    }

    private static let booleanText = JSRegex(#"^(yes|no|true|false)$"#, ignoreCase: true)
    private static let decimal = JSRegex(#"^-?\d+(\.\d+)?$"#)
    private static let dateLike = JSRegex(#"\d{4}|\d{1,2} \w+ \d{2,4}|\w+ \d{1,2}, \d{4}"#)
    private static let webAddress = JSRegex(#"^https?:\/\/\S+$"#, ignoreCase: true)
    private static let spaceRun = JSRegex(#"\s+"#)

    /// picks the most fitting type for a column of text values, used when importing csv files
    static func inferType(_ values: [String]) -> String {
        let filled = values.map { JSText.trim($0) }.filter { !$0.isEmpty }
        if filled.isEmpty { return "text" }
        if filled.allSatisfy(booleanText.test) { return "checkbox" }
        if filled.allSatisfy({ decimal.test(JSText.removing($0, [0x2C])) }) { return "number" }
        if filled.allSatisfy({ JSDate.parse($0) != nil && dateLike.test($0) }) { return "date" }
        if filled.allSatisfy(webAddress.test) { return "url" }
        let distinct = JSSet(filled.map { JSText.string(JSText.lowercased($0.units)) })
        if filled.contains(where: { JSText.indexOf($0.units, ", ".units) != -1 }), distinct.items.count < max(4, filled.count) {
            let parts = JSSet(filled.flatMap { JSText.split($0, on: 0x2C).map { JSText.string(JSText.lowercased(JSText.trim($0.units))) } })
            if parts.items.count <= 30 { return "multiSelect" }
        }
        // a few short values that repeat look like a status or a category
        if distinct.items.count <= 12, Double(distinct.items.count) <= max(2, Double(filled.count) * 0.75),
           filled.allSatisfy({ $0.utf16.count <= 40 && splitOnSpace($0).count <= 3 }) {
            return "select"
        }
        return "text"
    }

    /// `text.split(/\s+/)`
    private static func splitOnSpace(_ text: String) -> [String] {
        Search.splitOnSpace(text)
    }

    private static let yesTrue = JSRegex(#"^(yes|true)$"#, ignoreCase: true)

    static func parseCellValue(_ prop: PropDef, _ raw: String) -> JSValue {
        let value = JSText.trim(raw)
        if value.isEmpty { return .null }
        switch prop.type {
        case "number":
            let number = JSNumber.parse(JSText.removing(value, [0x2C]))
            return number.isFinite ? .number(number) : .null
        case "checkbox":
            return .bool(yesTrue.test(value))
        case "date":
            guard let time = JSDate.parse(value) else { return .null }
            return .string(Daily.dateKey(Date(timeIntervalSince1970: time / 1000)))
        case "select":
            let wanted = JSText.lowercased(value.units)
            return prop.options.first { JSText.lowercased($0.name.units) == wanted }.map { .string($0.id) } ?? .null
        case "multiSelect":
            let names = JSText.split(value, on: 0x2C).map { JSText.lowercased(JSText.trim($0.units)) }
            let ids = prop.options.filter { names.contains(JSText.lowercased($0.name.units)) }.map { JSValue.string($0.id) }
            return ids.isEmpty ? .null : .array(ids)
        default:
            return .string(value)
        }
    }

    /// builds a database schema for csv columns, the first column is the row title
    static func databaseFromTable(_ header: [String], _ rows: [[String]], _ newId: () -> String) -> DatabaseDef {
        // frontmatter keys are case sensitive, so Tags is a property while tags stays morrow's own
        let reserved: Set<String> = ["title", "icon", "kind", "tags", "tag", "database", "aliases"]
        var used = JSSet()
        var properties: [PropDef] = []
        for (offset, rawName) in header.dropFirst().enumerated() {
            let column = offset + 1
            let trimmed = JSText.trim(rawName)
            var name = trimmed.isEmpty ? "Column \(column + 1)" : trimmed
            var n = 2
            while used.has(JSText.string(JSText.lowercased(name.units))) || reserved.contains(name) {
                name = "\(trimmed.isEmpty ? "Column" : trimmed) \(n)"
                n += 1
            }
            used.insert(JSText.string(JSText.lowercased(name.units)))
            let values = rows.map { column < $0.count ? $0[column] : "" }
            let type = inferType(values)
            var prop = PropDef(id: newId(), name: name, type: type, options: [])
            if type == "select" || type == "multiSelect" {
                var names = JSMap<String>()
                for value in values {
                    for part in type == "multiSelect" ? JSText.split(value, on: 0x2C) : [value] {
                        let cleaned = JSText.trim(part)
                        let key = JSText.string(JSText.lowercased(cleaned.units))
                        if !cleaned.isEmpty, !names.has(key) { names[key] = cleaned }
                    }
                }
                prop.options = names.valuesInOrder.enumerated().map { newOption($1, $0, newId) }
            }
            properties.append(prop)
        }
        var database = DatabaseDef(properties: properties, views: [])
        database.views = [newView("table", database, newId)]
        if properties.contains(where: { $0.type == "select" }) { database.views.append(newView("board", database, newId)) }
        if properties.contains(where: { $0.type == "date" }) { database.views.append(newView("calendar", database, newId)) }
        return database
    }
}
