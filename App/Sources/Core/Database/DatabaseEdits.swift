import Foundation

/// The changes Morrow's database screen makes, src/app/components/database/{DatabaseView,PropertyValue,data}.tsx,
/// as pure functions over the database definition and row values. The screen sends the result as one command.
nonisolated enum DatabaseEdits {
    // MARK: views

    static func updateView(_ database: DatabaseDef, _ viewId: String, _ change: (ViewDef) -> ViewDef) -> DatabaseDef {
        var next = database
        next.views = database.views.map { $0.id.jsEquals(viewId) ? change($0) : $0 }
        return next
    }

    static func addView(_ database: DatabaseDef, type: String, newId: () -> String) -> (database: DatabaseDef, view: ViewDef) {
        let view = Database.newView(type, database, newId)
        var next = database
        next.views.append(view)
        return (next, view)
    }

    /// ViewSettings' name: a blank name gives the layout's label
    static func renameView(_ database: DatabaseDef, _ viewId: String, _ name: String) -> DatabaseDef {
        updateView(database, viewId) { view in
            var next = view
            let clean = JSText.trim(name)
            next.name = clean.isEmpty ? Database.viewLabels[view.type] ?? view.type : clean
            return next
        }
    }

    /// ViewSettings' layout: the board's group and the calendar's date stay when set, otherwise the new layout's
    static func setLayout(_ database: DatabaseDef, _ viewId: String, _ type: String) -> DatabaseDef {
        updateView(database, viewId) { view in
            let fresh = Database.newView(type, database) { view.id }
            var next = view
            next.type = type
            next.groupBy = view.groupBy ?? fresh.groupBy
            next.dateProp = view.dateProp ?? fresh.dateProp
            return next
        }
    }

    static func duplicateView(_ database: DatabaseDef, _ view: ViewDef, newId: () -> String) -> DatabaseDef {
        var copy = view
        copy.id = newId()
        copy.name = "\(view.name) copy"
        var next = database
        next.views.append(copy)
        return next
    }

    /// nil while it is the only view, Morrow's button is disabled then
    static func deleteView(_ database: DatabaseDef, _ viewId: String) -> DatabaseDef? {
        guard database.views.count > 1 else { return nil }
        var next = database
        next.views = database.views.filter { !$0.id.jsEquals(viewId) }
        return next
    }

    // MARK: filters

    static func addFilter(_ view: ViewDef, newId: () -> String) -> ViewDef {
        var next = view
        next.filters.append(FilterRule(id: newId(), prop: Database.titleProp, op: "contains", value: ""))
        return next
    }

    /// the operators offered for a property, the title as text
    static func filterOps(_ database: DatabaseDef, _ propId: String) -> [String] {
        let type = Database.propType(database, propId) ?? "text"
        return Database.filterOpsFor(type == "title" ? "text" : type)
    }

    /// a new property for a rule starts at its first operator and no value
    static func setFilterProp(_ view: ViewDef, _ ruleId: String, _ propId: String, _ database: DatabaseDef) -> ViewDef {
        changeFilter(view, ruleId) { rule in
            FilterRule(id: rule.id, prop: propId, op: filterOps(database, propId)[0], value: .null)
        }
    }

    static func setFilterOp(_ view: ViewDef, _ ruleId: String, _ op: String) -> ViewDef {
        changeFilter(view, ruleId) { rule in
            var next = rule
            next.op = op
            return next
        }
    }

    static func setFilterValue(_ view: ViewDef, _ ruleId: String, _ value: JSValue) -> ViewDef {
        changeFilter(view, ruleId) { rule in
            var next = rule
            next.value = value
            return next
        }
    }

    static func removeFilter(_ view: ViewDef, _ ruleId: String) -> ViewDef {
        var next = view
        next.filters = view.filters.filter { !$0.id.jsEquals(ruleId) }
        return next
    }

    /// operators that compare with nothing
    static func filterNeedsValue(_ op: String) -> Bool {
        !["empty", "notEmpty", "checked", "unchecked"].contains(op)
    }

    /// what a typed filter value is kept as: a number for a number property, otherwise the text as typed. Morrow's
    /// number field only gives numbers or nothing, so text that is not a number is kept as nothing typed
    static func filterValue(_ text: String, propType: String?) -> JSValue {
        guard propType == "number", !text.isEmpty else { return .string(text) }
        let number = JSNumber.parse(text)
        return number.isFinite ? .number(number) : .string("")
    }

    /// an option filter: the option id, or null for Choose
    static func filterOption(_ optionId: String?) -> JSValue {
        guard let optionId, !optionId.isEmpty else { return .null }
        return .string(optionId)
    }

    private static func changeFilter(_ view: ViewDef, _ ruleId: String, _ change: (FilterRule) -> FilterRule) -> ViewDef {
        var next = view
        next.filters = view.filters.map { $0.id.jsEquals(ruleId) ? change($0) : $0 }
        return next
    }

    // MARK: sorts

    static func addSort(_ view: ViewDef) -> ViewDef {
        var next = view
        next.sorts.append(SortRule(prop: Database.titleProp, dir: "asc"))
        return next
    }

    static func setSortProp(_ view: ViewDef, _ index: Int, _ propId: String) -> ViewDef {
        var next = view
        if next.sorts.indices.contains(index) { next.sorts[index].prop = propId }
        return next
    }

    static func setSortDir(_ view: ViewDef, _ index: Int, _ dir: String) -> ViewDef {
        var next = view
        if next.sorts.indices.contains(index) { next.sorts[index].dir = dir == "desc" ? "desc" : "asc" }
        return next
    }

    static func removeSort(_ view: ViewDef, _ index: Int) -> ViewDef {
        var next = view
        if next.sorts.indices.contains(index) { next.sorts.remove(at: index) }
        return next
    }

    /// PropertySettings' Sort ascending: this property alone
    static func sortAscending(_ view: ViewDef, by propId: String) -> ViewDef {
        var next = view
        next.sorts = [SortRule(prop: propId, dir: "asc")]
        return next
    }

    /// the choices of a sort: the name, every property, then when made and edited
    static func sortChoices(_ database: DatabaseDef) -> [(id: String, name: String)] {
        [(Database.titleProp, "Name")] + database.properties.map { ($0.id, $0.name) }
            + [(Database.createdProp, "Created"), (Database.updatedProp, "Edited")]
    }

    /// the choices of a filter: the name, then every property
    static func filterChoices(_ database: DatabaseDef) -> [(id: String, name: String)] {
        [(Database.titleProp, "Name")] + database.properties.map { ($0.id, $0.name) }
    }

    // MARK: shown properties and layout

    static func toggleHidden(_ view: ViewDef, _ propId: String) -> ViewDef {
        var next = view
        if view.hidden.contains(where: { $0.jsEquals(propId) }) {
            next.hidden = view.hidden.filter { !$0.jsEquals(propId) }
        } else {
            next.hidden.append(propId)
        }
        return next
    }

    static func hide(_ view: ViewDef, _ propId: String) -> ViewDef {
        var next = view
        next.hidden.append(propId)
        return next
    }

    /// the board's group or the calendar's date, nil for None
    static func setLayoutProp(_ view: ViewDef, _ propId: String?) -> ViewDef {
        var next = view
        let value = propId.flatMap { $0.isEmpty ? nil : $0 }
        if view.type == "board" { next.groupBy = value } else { next.dateProp = value }
        return next
    }

    /// the properties a board can group by, or a calendar place rows by
    static func layoutChoices(_ database: DatabaseDef, viewType: String) -> [PropDef] {
        database.properties.filter { prop in
            viewType == "board" ? ["select", "multiSelect", "checkbox"].contains(prop.type) : prop.type == "date"
        }
    }

    // MARK: properties

    /// a property name that may not be used: reserved by Morrow or another property's, ignoring case
    static func nameTaken(_ name: String, _ database: DatabaseDef, except propId: String? = nil) -> Bool {
        let lower = JSText.string(JSText.lowercased(name.units))
        return PageFile.reservedPropertyName(name) || database.properties.contains { prop in
            (propId == nil || !prop.id.jsEquals(propId!)) && JSText.string(JSText.lowercased(prop.name.units)).jsEquals(lower)
        }
    }

    enum NameResult: Equatable {
        case ok(DatabaseDef)
        /// nothing to do, an empty name
        case empty
        /// shown to the person as an error toast
        case refused(String)
    }

    /// NewProperty's add
    static func addProperty(_ database: DatabaseDef, name: String, type: String, newId: () -> String) -> NameResult {
        let clean = JSText.trim(name)
        if clean.isEmpty { return .empty }
        if nameTaken(clean, database) { return .refused("“\(clean)” is already used, choose another name.") }
        var next = database
        next.properties.append(PropDef(id: newId(), name: clean, type: type, options: []))
        return .ok(next)
    }

    /// PropertySettings' name
    static func renameProperty(_ database: DatabaseDef, _ propId: String, _ name: String) -> NameResult {
        let clean = JSText.trim(name)
        if clean.isEmpty || nameTaken(clean, database, except: propId) { return .refused("That name is empty or already used.") }
        return .ok(updateProp(database, propId) { prop in
            var next = prop
            next.name = clean
            return next
        })
    }

    static func updateProp(_ database: DatabaseDef, _ propId: String, _ change: (PropDef) -> PropDef) -> DatabaseDef {
        var next = database
        next.properties = database.properties.map { $0.id.jsEquals(propId) ? change($0) : $0 }
        return next
    }

    /// PropertySettings' Delete: the property leaves every view's filters, sorts, hidden list, group and date too
    static func deleteProperty(_ database: DatabaseDef, _ propId: String) -> DatabaseDef {
        DatabaseDef(
            properties: database.properties.filter { !$0.id.jsEquals(propId) },
            views: database.views.map { view in
                var next = view
                next.filters = view.filters.filter { !$0.prop.jsEquals(propId) }
                next.sorts = view.sorts.filter { !$0.prop.jsEquals(propId) }
                next.hidden = view.hidden.filter { !$0.jsEquals(propId) }
                if view.groupBy.map({ $0.jsEquals(propId) }) == true { next.groupBy = nil }
                if view.dateProp.map({ $0.jsEquals(propId) }) == true { next.dateProp = nil }
                return next
            })
    }

    /// PropertySettings' type change: the new definition and each row's converted value, applied together.
    /// Options stay between select and multi-select, come from the values when a property becomes one, and
    /// are dropped otherwise. Nil when the type is the same.
    static func changeType(_ database: DatabaseDef, _ propId: String, to type: String, rows: [PageMeta],
                           newId: () -> String) -> (database: DatabaseDef, values: [(rowId: String, value: JSValue)])? {
        guard let prop = database.properties.first(where: { $0.id.jsEquals(propId) }), prop.type != type else { return nil }
        let choice = ["select", "multiSelect"]
        let options: [SelectOption] = choice.contains(type)
            ? (choice.contains(prop.type) ? prop.options : Database.optionsFromValues(prop, rows.map { $0.properties[prop.id] ?? .null }, newId))
            : []
        var next = prop
        next.type = type
        next.options = options
        let changed = updateProp(database, propId) { _ in next }
        let values = rows.map { row in (row.id, Database.convertValue(prop, next, row.properties[prop.id] ?? .null)) }
        return (changed, values)
    }

    static func setFormula(_ database: DatabaseDef, _ propId: String, _ formula: String) -> DatabaseDef {
        updateProp(database, propId) { prop in
            var next = prop
            next.formula = formula
            return next
        }
    }

    // MARK: options

    /// data.ts' ensureOption: the option with that name, ignoring case, or a new one; the new definition is nil
    /// when the option was already there, and the whole answer nil for an empty name
    static func ensureOption(_ database: DatabaseDef, _ propId: String, _ name: String,
                             newId: () -> String) -> (database: DatabaseDef?, option: SelectOption)? {
        guard let prop = database.properties.first(where: { $0.id.jsEquals(propId) }) else { return nil }
        let clean = JSText.trim(name)
        if clean.isEmpty { return nil }
        let lower = JSText.string(JSText.lowercased(clean.units))
        if let existing = prop.options.first(where: { JSText.string(JSText.lowercased($0.name.units)).jsEquals(lower) }) {
            return (nil, existing)
        }
        let option = Database.newOption(clean, prop.options.count, newId)
        return (updateProp(database, propId) { current in
            var next = current
            next.options.append(option)
            return next
        }, option)
    }

    static func renameOption(_ database: DatabaseDef, _ propId: String, _ optionId: String, _ name: String) -> DatabaseDef? {
        let clean = JSText.trim(name)
        if clean.isEmpty { return nil }
        return changeOption(database, propId, optionId) { $0.name = clean }
    }

    static func setOptionColor(_ database: DatabaseDef, _ propId: String, _ optionId: String, _ color: String) -> DatabaseDef {
        changeOption(database, propId, optionId) { $0.color = color }
    }

    static func deleteOption(_ database: DatabaseDef, _ propId: String, _ optionId: String) -> DatabaseDef {
        updateProp(database, propId) { prop in
            var next = prop
            next.options = prop.options.filter { !$0.id.jsEquals(optionId) }
            return next
        }
    }

    private static func changeOption(_ database: DatabaseDef, _ propId: String, _ optionId: String,
                                     _ change: (inout SelectOption) -> Void) -> DatabaseDef {
        updateProp(database, propId) { prop in
            var next = prop
            next.options = prop.options.map { option in
                guard option.id.jsEquals(optionId) else { return option }
                var changed = option
                change(&changed)
                return changed
            }
            return next
        }
    }

    // MARK: values (PropertyValue.tsx)

    /// a text cell: empty text is no value
    static func textValue(_ text: String) -> JSValue { text.isEmpty ? .null : .string(text) }

    /// a number cell: blank or not a number is no value
    static func numberValue(_ text: String) -> JSValue {
        let number = JSNumber.parse(text)
        return !JSText.trim(text).isEmpty && number.isFinite ? .number(number) : .null
    }

    static func urlValue(_ text: String) -> JSValue {
        let clean = JSText.trim(text)
        return clean.isEmpty ? .null : .string(clean)
    }

    /// a link Morrow offers to open
    static func isOpenableURL(_ text: String) -> Bool {
        text.range(of: #"^https?://"#, options: [.regularExpression, .caseInsensitive]) != nil
    }

    /// the option ids a select or multi-select cell holds
    static func selectedIds(_ value: JSValue?) -> [String] {
        switch value {
        case .array(let items)?: items.compactMap(\.string)
        case .string(let id)?: [id]
        default: []
        }
    }

    /// OptionPicker's choose: a multi-select toggles the option and stays open, a select takes it, or clears it
    /// when it was the one chosen, and closes
    static func choose(_ optionId: String, selected: [String], multi: Bool) -> (value: JSValue, close: Bool) {
        if multi {
            let next = selected.contains(where: { $0.jsEquals(optionId) })
                ? selected.filter { !$0.jsEquals(optionId) } : selected + [optionId]
            return (next.isEmpty ? .null : .array(next.map(JSValue.string)), false)
        }
        return (selected.first.map { $0.jsEquals(optionId) } == true ? .null : .string(optionId), true)
    }

    /// OptionPicker's create: the new or found option goes in, last for a multi-select
    static func chooseCreated(_ optionId: String, selected: [String], multi: Bool) -> JSValue {
        multi ? .array((selected.filter { !$0.jsEquals(optionId) } + [optionId]).map(JSValue.string)) : .string(optionId)
    }

    /// the options OptionPicker lists for a query, and whether one has that exact name
    static func optionsMatching(_ prop: PropDef, _ query: String) -> (shown: [SelectOption], exact: Bool) {
        let lower = JSText.string(JSText.lowercased(JSText.trim(query).units))
        let shown = prop.options.filter { JSText.string(JSText.lowercased($0.name.units)).contains(lower) || lower.isEmpty }
        let exact = prop.options.contains { JSText.string(JSText.lowercased($0.name.units)).jsEquals(lower) }
        return (shown, exact)
    }

    /// the page titles a relation cell holds
    static func relationTargets(_ value: JSValue?) -> [String] {
        switch value {
        case .array(let items)?: items.compactMap(\.string)
        case .string(let title)?: [title]
        default: []
        }
    }

    /// RelationPicker's toggle, titles compared ignoring case
    static func toggleRelation(_ title: String, targets: [String]) -> JSValue {
        let lower = JSText.string(JSText.lowercased(title.units))
        let on = targets.contains { JSText.string(JSText.lowercased($0.units)).jsEquals(lower) }
        let next = on ? targets.filter { !JSText.string(JSText.lowercased($0.units)).jsEquals(lower) } : targets + [title]
        return next.isEmpty ? .null : .array(next.map(JSValue.string))
    }

    // MARK: board, calendar and cards

    /// the value a card dropped on a board column, or made in it, takes
    static func boardValue(_ prop: PropDef, key: String?) -> JSValue {
        if prop.type == "checkbox" { return .bool(key == "true") }
        guard let key else { return .null }
        return prop.type == "multiSelect" ? .array([.string(key)]) : .string(key)
    }

    /// board columns without the empty one when nothing is in it
    static func boardGroups(_ rows: [PageMeta], _ view: ViewDef, _ database: DatabaseDef) -> [Database.RowGroup] {
        Database.groupRows(rows, view.groupBy, database).filter { $0.key != nil || !$0.rows.isEmpty }
    }

    /// the six weeks a calendar month shows, from the Monday on or before the first
    static func calendarDays(month: Date, calendar: Calendar) -> [Date] {
        let first = calendar.date(from: calendar.dateComponents([.year, .month], from: month)) ?? month
        let weekday = calendar.component(.weekday, from: first) - 1 // 0 for Sunday, as getDay()
        let start = calendar.date(byAdding: .day, value: -((weekday + 6) % 7), to: first) ?? first
        return (0..<42).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
    }

    /// the rows a calendar places on each day: the date property's text as stored
    static func rowsByDay(_ rows: [PageMeta], _ propId: String) -> [String: [PageMeta]] {
        var byDay: [String: [PageMeta]] = [:]
        for row in rows {
            if case .string(let day)? = row.properties[propId] { byDay[day, default: []].append(row) }
        }
        return byDay
    }

    static func countText(shown: Int, all: Int) -> String {
        shown == all ? "\(shown) \(shown == 1 ? "row" : "rows")" : "\(shown) of \(all) rows"
    }

    /// a gallery card's cover: the first picture at the top level of the page
    static func firstImage(_ doc: DocNode?) -> String? {
        guard let node = doc?.content?.first(where: { $0.type == "image" && $0.attr("fileId")?.string != nil }) else { return nil }
        return node.attr("fileId")?.string
    }

    /// how many of the checklist items in a page are ticked
    static func taskProgress(_ doc: DocNode?) -> (done: Int, total: Int) {
        var done = 0
        var total = 0
        func visit(_ node: DocNode) {
            if node.type == "taskItem" {
                total += 1
                if node.attr("checked") == .bool(true) { done += 1 }
            }
            for child in node.content ?? [] { visit(child) }
        }
        if let doc { visit(doc) }
        return (done, total)
    }
}
