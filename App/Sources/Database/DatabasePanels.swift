import SwiftUI

/// The popovers of Morrow's database toolbar and settings, DatabaseView.tsx.
private struct PanelBox<Content: View>: View {
    var width: CGFloat = 360
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) { content }
                .padding(14)
        }
        .frame(width: width)
        .frame(maxHeight: 520)
    }
}

private struct EmptyNote: View {
    let text: String
    var body: some View { Text(text).font(.footnote).foregroundStyle(.secondary) }
}

// MARK: filters

struct FilterPanel: View {
    let store: DatabaseStore
    let viewId: String

    var body: some View {
        let database = store.database
        let view = database.views.first { $0.id.jsEquals(viewId) }
        PanelBox(width: 440) {
            if let view {
                if view.filters.isEmpty { EmptyNote(text: "No filters. Rows that match every filter are shown.") }
                ForEach(view.filters, id: \.id) { rule in
                    FilterRow(store: store, view: view, rule: rule)
                }
                Button("Add a filter", systemImage: "plus") {
                    store.updateView(viewId) { DatabaseEdits.addFilter($0, newId: DatabaseStore.newId) }
                }
                .buttonStyle(.borderless)
            }
        }
    }
}

private struct FilterRow: View {
    let store: DatabaseStore
    let view: ViewDef
    let rule: FilterRule

    var body: some View {
        let database = store.database
        let prop = database.properties.first { $0.id.jsEquals(rule.prop) }
        HStack(spacing: 6) {
            Picker("Property", selection: Binding(get: { rule.prop }, set: { propId in
                store.updateView(view.id) { DatabaseEdits.setFilterProp($0, rule.id, propId, database) }
            })) {
                ForEach(DatabaseEdits.filterChoices(database), id: \.id) { Text($0.name).tag($0.id) }
            }
            Picker("Condition", selection: Binding(get: { rule.op }, set: { op in
                store.updateView(view.id) { DatabaseEdits.setFilterOp($0, rule.id, op) }
            })) {
                ForEach(DatabaseEdits.filterOps(database, rule.prop), id: \.self) { Text(Database.filterLabels[$0] ?? $0).tag($0) }
            }
            if DatabaseEdits.filterNeedsValue(rule.op) { value(prop) }
            Button("Remove filter", systemImage: "xmark") {
                store.updateView(view.id) { DatabaseEdits.removeFilter($0, rule.id) }
            }
            .labelStyle(.iconOnly)
            .buttonStyle(.borderless)
        }
        .labelsHidden()
        .pickerStyle(.menu)
    }

    @ViewBuilder private func value(_ prop: PropDef?) -> some View {
        if let prop, prop.type == "select" || prop.type == "multiSelect" {
            Picker("Value", selection: Binding(get: { rule.value.string ?? "" }, set: { id in
                store.updateView(view.id) { DatabaseEdits.setFilterValue($0, rule.id, DatabaseEdits.filterOption(id)) }
            })) {
                Text("Choose").tag("")
                ForEach(prop.options, id: \.id) { Text($0.name).tag($0.id) }
            }
        } else if prop?.type == "date" {
            DatePicker("Value", selection: Binding(
                get: { rule.value.string.flatMap(DayText.date) ?? Date() },
                set: { day in store.updateView(view.id) { DatabaseEdits.setFilterValue($0, rule.id, .string(Daily.dateKey(day))) } }
            ), displayedComponents: .date)
        } else {
            DraftField(label: "Value", value: rule.value.isNull ? "" : rule.value.jsString, placeholder: "Value", editable: true,
                       keyboard: prop?.type == "number" ? .number : .text) { text in
                store.updateView(view.id) { DatabaseEdits.setFilterValue($0, rule.id, DatabaseEdits.filterValue(text, propType: prop?.type)) }
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
            .background(.quaternary.opacity(0.5), in: .rect(cornerRadius: 6))
            .frame(minWidth: 90)
        }
    }
}

// MARK: sorts

struct SortPanel: View {
    let store: DatabaseStore
    let viewId: String

    var body: some View {
        let database = store.database
        let view = database.views.first { $0.id.jsEquals(viewId) }
        PanelBox {
            if let view {
                if view.sorts.isEmpty { EmptyNote(text: "Rows keep the order you give them.") }
                ForEach(Array(view.sorts.enumerated()), id: \.offset) { index, sort in
                    HStack(spacing: 6) {
                        Picker("Sort by", selection: Binding(get: { sort.prop }, set: { propId in
                            store.updateView(viewId) { DatabaseEdits.setSortProp($0, index, propId) }
                        })) {
                            ForEach(DatabaseEdits.sortChoices(database), id: \.id) { Text($0.name).tag($0.id) }
                        }
                        Picker("Direction", selection: Binding(get: { sort.dir }, set: { dir in
                            store.updateView(viewId) { DatabaseEdits.setSortDir($0, index, dir) }
                        })) {
                            Text("Ascending").tag("asc")
                            Text("Descending").tag("desc")
                        }
                        Button("Remove sort", systemImage: "xmark") {
                            store.updateView(viewId) { DatabaseEdits.removeSort($0, index) }
                        }
                        .labelStyle(.iconOnly)
                        .buttonStyle(.borderless)
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                }
                Button("Add a sort", systemImage: "plus") {
                    store.updateView(viewId) { DatabaseEdits.addSort($0) }
                }
                .buttonStyle(.borderless)
            }
        }
    }
}

// MARK: board group and calendar date

struct LayoutPanel: View {
    let store: DatabaseStore
    let viewId: String

    var body: some View {
        let database = store.database
        if let view = database.views.first(where: { $0.id.jsEquals(viewId) }) {
            PanelBox(width: 300) {
                Picker(view.type == "board" ? "Group cards by" : "Place rows by", selection: Binding(
                    get: { (view.type == "board" ? view.groupBy : view.dateProp) ?? "" },
                    set: { propId in store.updateView(viewId) { DatabaseEdits.setLayoutProp($0, propId) } }
                )) {
                    Text("None").tag("")
                    ForEach(DatabaseEdits.layoutChoices(database, viewType: view.type), id: \.id) { Text($0.name).tag($0.id) }
                }
                .pickerStyle(.menu)
            }
        }
    }
}

// MARK: shown properties

struct PropertiesPanel: View {
    let store: DatabaseStore
    let viewId: String
    let editable: Bool

    var body: some View {
        let database = store.database
        let view = database.views.first { $0.id.jsEquals(viewId) }
        PanelBox {
            ForEach(database.properties, id: \.id) { prop in
                let hidden = view?.hidden.contains { $0.jsEquals(prop.id) } ?? false
                HStack {
                    Text(prop.name).lineLimit(1)
                    Text(Database.propLabels[prop.type] ?? prop.type).font(.footnote).foregroundStyle(.secondary)
                    Spacer()
                    Button(hidden ? "Show \(prop.name)" : "Hide \(prop.name)", systemImage: hidden ? "eye.slash" : "eye") {
                        store.updateView(viewId) { DatabaseEdits.toggleHidden($0, prop.id) }
                    }
                    .labelStyle(.iconOnly)
                    .buttonStyle(.borderless)
                    .disabled(!editable)
                }
            }
            if editable {
                Divider()
                NewPropertyForm(store: store, done: nil)
            }
        }
    }
}

/// Morrow's NewProperty: a name and a type.
struct NewPropertyForm: View {
    let store: DatabaseStore
    let done: (() -> Void)?
    @State private var name = ""
    @State private var type = "text"

    var body: some View {
        HStack(spacing: 6) {
            TextField("New property", text: $name)
                .textFieldStyle(.roundedBorder)
                .onSubmit(add)
            Picker("Type", selection: $type) {
                ForEach(Model.propTypes, id: \.self) { Text(Database.propLabels[$0] ?? $0).tag($0) }
            }
            .labelsHidden()
            .pickerStyle(.menu)
            Button("Add", action: add)
                .buttonStyle(.bordered)
                .disabled(JSText.trim(name).isEmpty)
        }
    }

    private func add() {
        if store.apply(DatabaseEdits.addProperty(store.database, name: name, type: type, newId: DatabaseStore.newId)) {
            name = ""
            done?()
        }
    }
}

// MARK: property settings

/// Morrow's PropertySettings: rename, change the type (values converted), the formula, the options, sort by it,
/// hide it, or delete it.
struct PropertySettings: View {
    let store: DatabaseStore
    let propId: String
    let viewId: String
    let close: () -> Void

    var body: some View {
        if let prop = store.database.properties.first(where: { $0.id.jsEquals(propId) }) {
            PanelBox(width: 380) {
                LabeledContent("Name") {
                    DraftField(label: "Property name", value: prop.name, placeholder: "Name", editable: true) { name in
                        store.apply(DatabaseEdits.renameProperty(store.database, prop.id, name))
                    }
                    .padding(6)
                    .background(.quaternary.opacity(0.5), in: .rect(cornerRadius: 6))
                }
                Picker("Type", selection: Binding(get: { prop.type }, set: { store.changeType(prop.id, to: $0) })) {
                    ForEach(Model.propTypes, id: \.self) { Text(Database.propLabels[$0] ?? $0).tag($0) }
                }
                .pickerStyle(.menu)
                if prop.type == "formula" { FormulaField(store: store, prop: prop) }
                if prop.type == "select" || prop.type == "multiSelect" { OptionsEditor(store: store, prop: prop) }
                Divider()
                HStack {
                    Button("Sort ascending") {
                        store.updateView(viewId) { DatabaseEdits.sortAscending($0, by: prop.id) }
                        close()
                    }
                    Button("Hide", systemImage: "eye.slash") {
                        store.updateView(viewId) { DatabaseEdits.hide($0, prop.id) }
                        close()
                    }
                    Button("Delete", systemImage: "trash", role: .destructive) {
                        store.save(DatabaseEdits.deleteProperty(store.database, prop.id))
                        close()
                    }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
    }
}

private struct OptionsEditor: View {
    let store: DatabaseStore
    let prop: PropDef

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(prop.options, id: \.id) { option in
                HStack(spacing: 6) {
                    DraftField(label: "Option name", value: option.name, placeholder: "Option", editable: true) { name in
                        if let next = DatabaseEdits.renameOption(store.database, prop.id, option.id, name) { store.save(next) }
                    }
                    .padding(6)
                    .background(.quaternary.opacity(0.5), in: .rect(cornerRadius: 6))
                    Picker("Colour", selection: Binding(get: { option.color }, set: { color in
                        store.save(DatabaseEdits.setOptionColor(store.database, prop.id, option.id, color))
                    })) {
                        ForEach(Model.colors, id: \.self) { color in Text(color).tag(color) }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                    Button("Delete option \(option.name)", systemImage: "xmark") {
                        store.save(DatabaseEdits.deleteOption(store.database, prop.id, option.id))
                    }
                    .labelStyle(.iconOnly)
                    .buttonStyle(.borderless)
                }
            }
        }
    }
}

/// Morrow's FormulaField: the expression, checked against the first row as it is typed, saved on return or
/// when the field loses focus.
struct FormulaField: View {
    let store: DatabaseStore
    let prop: PropDef
    @State private var draft: String?
    @FocusState private var focused: Bool

    private static let examples = [
        #"prop("Price") * prop("Count")"#,
        #"if(prop("Done"), "✅", "⏳")"#,
        #"dateBetween(prop("Due"), today(), "days")"#,
        #"concat(prop("Name"), " · ", prop("Status"))"#,
    ]

    var body: some View {
        let text = draft ?? prop.formula ?? ""
        VStack(alignment: .leading, spacing: 6) {
            Text("Formula").font(.subheadline.weight(.medium))
            TextField(#"prop("Price") * prop("Count")"#, text: Binding(get: { text }, set: { draft = $0 }), axis: .vertical)
                .font(.system(.callout, design: .monospaced))
                .textFieldStyle(.roundedBorder)
                .autocorrectionDisabled()
                #if os(iOS)
                .textInputAutocapitalization(.never)
                #endif
                .focused($focused)
                .accessibilityLabel("Formula")
                .onChange(of: text) { _, value in
                    // return saves, shift-return is not offered on a touch keyboard
                    if value.contains("\n") {
                        draft = value.replacingOccurrences(of: "\n", with: "")
                        save()
                    }
                }
                .onChange(of: focused) { _, isFocused in if !isFocused { save() } }
            preview(text)
            DisclosureGroup("How formulas work") {
                VStack(alignment: .leading, spacing: 6) {
                    Text("""
                    Use prop("Name") for another property, maths like + - * / ^, comparisons like > == !=, and, or, not, \
                    and functions: if, empty, round, floor, ceil, abs, min, max, sum, length, concat, join, upper, lower, \
                    contains, replace, slice, today, now, dateAdd, dateBetween, year, month, day.
                    """)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    ForEach(Self.examples, id: \.self) { example in
                        Button { draft = example } label: {
                            Text(example).font(.system(.footnote, design: .monospaced))
                        }
                        .buttonStyle(.borderless)
                    }
                }
            }
            .font(.footnote)
        }
    }

    @ViewBuilder private func preview(_ text: String) -> some View {
        if let sample = store.snapshot?.rows.first {
            var trial = prop
            let _ = trial.formula = text
            let result = Database.formulaResult(sample, trial, store.database, now: store.now)
            if let error = result.error {
                Text(error).font(.footnote).foregroundStyle(.red)
            } else if !JSText.trim(text).isEmpty {
                let shown = Database.formatValue(prop, result.value)
                (Text("First row: ") + Text(shown.isEmpty ? "empty" : shown).bold())
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func save() {
        guard let draft else { return }
        if draft != (prop.formula ?? "") { store.save(DatabaseEdits.setFormula(store.database, prop.id, draft)) }
        self.draft = nil
    }
}

// MARK: view settings

/// Morrow's ViewSettings: the view's name and layout, duplicate it, or delete it while another is left.
struct ViewSettings: View {
    let store: DatabaseStore
    let viewId: String
    let close: () -> Void

    var body: some View {
        let database = store.database
        if let view = database.views.first(where: { $0.id.jsEquals(viewId) }) {
            PanelBox(width: 320) {
                LabeledContent("Name") {
                    DraftField(label: "View name", value: view.name, placeholder: "Name", editable: true) { name in
                        store.save(DatabaseEdits.renameView(store.database, viewId, name))
                    }
                    .padding(6)
                    .background(.quaternary.opacity(0.5), in: .rect(cornerRadius: 6))
                }
                Picker("Layout", selection: Binding(get: { view.type }, set: { type in
                    store.save(DatabaseEdits.setLayout(store.database, viewId, type))
                })) {
                    ForEach(Model.viewTypes, id: \.self) { Text(Database.viewLabels[$0] ?? $0).tag($0) }
                }
                .pickerStyle(.menu)
                HStack {
                    Button("Duplicate") {
                        store.save(DatabaseEdits.duplicateView(store.database, view, newId: DatabaseStore.newId))
                        close()
                    }
                    Button("Delete view", systemImage: "trash", role: .destructive) {
                        if let next = DatabaseEdits.deleteView(store.database, viewId) { store.save(next) }
                        close()
                    }
                    .disabled(database.views.count <= 1)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
    }
}
