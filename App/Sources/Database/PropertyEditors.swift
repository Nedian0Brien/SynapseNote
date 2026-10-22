import SwiftUI

/// Morrow's select chip: a solid colour with white text, dark text on yellow.
struct OptionChip: View {
    let name: String
    let color: String
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Text(name)
            .font(.subheadline.weight(.medium))
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 1)
            .foregroundStyle(color == "yellow" ? Color(hex: 0x2b2100) : .white)
            .background(TagColor.solid(color, dark: colorScheme == .dark), in: .rect(cornerRadius: 5))
    }
}

/// PropertyValue.tsx's formatDay: a yyyy-mm-dd date in the device's words, other text as it is.
nonisolated enum DayText {
    static func format(_ key: String) -> String {
        guard let date = date(key) else { return key }
        return date.formatted(.dateTime.day().month(.abbreviated).year())
    }

    static func date(_ key: String) -> Date? {
        let parts = key.split(separator: "-")
        guard key.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil, parts.count == 3,
              let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2])
        else { return nil }
        // new Date(y, m - 1, d): a day past the month's end rolls over, as in JavaScript
        return Calendar.current.date(from: DateComponents(year: year, month: month, day: day))
    }
}

/// A value on a card or in a list, never editable; nothing for an empty value.
struct PropertyDisplay: View {
    let store: DatabaseStore
    let prop: PropDef
    let value: JSValue

    var body: some View {
        switch value {
        case .null, .bool(false): EmptyView()
        case .string(let text) where text.isEmpty: EmptyView()
        default: content
        }
    }

    @ViewBuilder private var content: some View {
        switch prop.type {
        case "select", "multiSelect":
            ForEach(DatabaseEdits.selectedIds(value), id: \.self) { id in
                if let option = prop.options.first(where: { $0.id.jsEquals(id) }) {
                    OptionChip(name: option.name, color: option.color)
                }
            }
        case "checkbox":
            Label(prop.name, systemImage: "checkmark")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        case "date":
            Text(DayText.format(value.jsString)).font(.subheadline).foregroundStyle(.secondary)
        case "relation":
            RelationChips(store: store, targets: DatabaseEdits.relationTargets(value))
        default:
            Text(Database.formatValue(prop, value)).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
        }
    }
}

/// Related pages as small chips; a title that no longer finds a page is shown faded. Chips sit inside cells and
/// cards that are buttons themselves, so they are not buttons: RelationPicker opens a related page.
struct RelationChips: View {
    let store: DatabaseStore
    let targets: [String]

    var body: some View {
        ForEach(targets, id: \.self) { target in
            if let page = store.snapshot?.relations[target] {
                HStack(spacing: 4) {
                    if let info = store.info(page.id) { PageIcon(page: info, size: 13) }
                    Text(page.title).lineLimit(1)
                }
                .font(.subheadline)
                .padding(.horizontal, 6)
                .padding(.vertical, 1)
                .background(.quaternary, in: .rect(cornerRadius: 5))
            } else {
                Text(target)
                    .font(.subheadline)
                    .strikethrough()
                    .foregroundStyle(.tertiary)
                    .padding(.horizontal, 6)
                    .accessibilityLabel("\(target), does not exist")
            }
        }
    }
}

/// Morrow's DraftInput: typing stays here and is saved on return or when the field loses focus, so every key
/// is not a separate change; escape puts the saved text back.
struct DraftField: View {
    let label: String
    let value: String
    var placeholder = "Empty"
    let editable: Bool
    var keyboard: Keyboard = .text
    var focusRequested = false
    let commit: (String) -> Void
    @State private var draft: String?
    @FocusState private var focused: Bool

    enum Keyboard { case text, number, url }

    var body: some View {
        TextField(placeholder, text: Binding(get: { draft ?? value }, set: { draft = $0 }))
            .textFieldStyle(.plain)
            .disabled(!editable)
            .focused($focused)
            .lineLimit(1)
            .accessibilityLabel(label)
            #if os(iOS)
            // the number pad has no return key on iPad, so a number could not be saved with it
            .keyboardType(keyboard == .number ? .numbersAndPunctuation : keyboard == .url ? .URL : .default)
            .textInputAutocapitalization(keyboard == .text ? .sentences : .never)
            #endif
            .autocorrectionDisabled(keyboard != .text)
            .onSubmit(save)
            .onChange(of: focused) { _, isFocused in
                if !isFocused { save() }
            }
            .onKeyPress(.escape) {
                draft = nil
                focused = false
                return .handled
            }
            .onAppear { if focusRequested { focused = true } }
    }

    private func save() {
        if let draft, !draft.utf16.elementsEqual(value.utf16) { commit(draft) }
        draft = nil
    }
}

/// The editor for one value of one row, in table cells.
struct PropertyInput: View {
    let store: DatabaseStore
    let prop: PropDef
    let row: PageMeta
    let editable: Bool
    @State private var picking = false

    private var value: JSValue { row.properties[prop.id] ?? .null }
    private var label: String { "\(prop.name) of \(row.title.isEmpty ? "Untitled" : row.title)" }

    var body: some View {
        switch prop.type {
        case "formula":
            let result = Database.formulaResult(row, prop, store.database, now: store.now)
            if let error = result.error {
                Text("Error").foregroundStyle(.red).help(error).accessibilityLabel("Error: \(error)")
            } else {
                Text(Database.formatValue(prop, result.value)).foregroundStyle(.secondary).lineLimit(1)
            }
        case "relation":
            let targets = DatabaseEdits.relationTargets(value)
            Button { picking = true } label: {
                HStack(spacing: 4) {
                    if targets.isEmpty && editable { Text("Empty").foregroundStyle(.tertiary) }
                    RelationChips(store: store, targets: targets)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .disabled(!editable)
            .accessibilityLabel(label)
            .popover(isPresented: $picking) {
                RelationPicker(store: store, prop: prop, row: row, targets: targets)
            }
        case "checkbox":
            Button { store.setValue(row.id, prop.id, .bool(value != .bool(true))) } label: {
                Image(systemName: value == .bool(true) ? "checkmark.square.fill" : "square")
                    .foregroundStyle(value == .bool(true) ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
            }
            .buttonStyle(.plain)
            .disabled(!editable)
            .accessibilityLabel(label)
            .accessibilityValue(value == .bool(true) ? "Checked" : "Not checked")
        case "number":
            DraftField(label: label, value: value.number.map(JSNumber.string) ?? "", editable: editable, keyboard: .number) {
                store.setValue(row.id, prop.id, DatabaseEdits.numberValue($0))
            }
        case "date":
            DateCell(store: store, prop: prop, row: row, editable: editable, label: label)
        case "url":
            HStack(spacing: 4) {
                DraftField(label: label, value: value.string ?? "", editable: editable, keyboard: .url) {
                    store.setValue(row.id, prop.id, DatabaseEdits.urlValue($0))
                }
                if let link = value.string, DatabaseEdits.isOpenableURL(link), let url = URL(string: link) {
                    Button("Open link", systemImage: "arrow.up.right.square") { store.controller.openURL(url) }
                        .labelStyle(.iconOnly)
                        .buttonStyle(.borderless)
                }
            }
        case "select", "multiSelect":
            let ids = DatabaseEdits.selectedIds(value)
            Button { picking = true } label: {
                HStack(spacing: 4) {
                    if ids.isEmpty && editable { Text("Empty").foregroundStyle(.tertiary) }
                    ForEach(ids, id: \.self) { id in
                        if let option = prop.options.first(where: { $0.id.jsEquals(id) }) { OptionChip(name: option.name, color: option.color) }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .disabled(!editable)
            .accessibilityLabel(label)
            .popover(isPresented: $picking) {
                OptionPicker(store: store, prop: prop, row: row, selected: ids) { picking = false }
            }
        default:
            DraftField(label: label, value: value.string ?? (value.isNull ? "" : value.jsString), editable: editable) {
                store.setValue(row.id, prop.id, DatabaseEdits.textValue($0))
            }
        }
    }
}

/// A date cell: the day in words, a calendar to pick another, and Clear. The value is the yyyy-mm-dd text.
struct DateCell: View {
    let store: DatabaseStore
    let prop: PropDef
    let row: PageMeta
    let editable: Bool
    let label: String
    @State private var picking = false

    var body: some View {
        let key = row.properties[prop.id]?.string
        Button { picking = true } label: {
            Text(key.map(DayText.format) ?? (editable ? "Empty" : ""))
                .foregroundStyle(key == nil ? .tertiary : .primary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(!editable)
        .accessibilityLabel(label)
        .popover(isPresented: $picking) {
            VStack(alignment: .leading, spacing: 8) {
                DatePicker(label, selection: Binding(
                    get: { key.flatMap(DayText.date) ?? Date() },
                    set: { store.setValue(row.id, prop.id, .string(Daily.dateKey($0))) }
                ), displayedComponents: .date)
                .datePickerStyle(.graphical)
                .labelsHidden()
                HStack {
                    // an empty date shows today in the calendar, where tapping today would change nothing
                    if key == nil {
                        Button("Today") {
                            store.setValue(row.id, prop.id, .string(Daily.dateKey(Date())))
                            picking = false
                        }
                    } else {
                        Button("Clear", systemImage: "xmark") {
                            store.setValue(row.id, prop.id, .null)
                            picking = false
                        }
                    }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
            .padding(12)
            .frame(minWidth: 320)
        }
    }
}

/// Morrow's OptionPicker: find an option by name, or make one; a select takes one and closes, a multi-select
/// toggles and stays open.
struct OptionPicker: View {
    let store: DatabaseStore
    let prop: PropDef
    let row: PageMeta
    let selected: [String]
    let close: () -> Void
    @State private var query = ""
    @FocusState private var focused: Bool

    private var multi: Bool { prop.type == "multiSelect" }
    /// the property as it is now, options added a moment ago included
    private var current: PropDef { store.database.properties.first { $0.id.jsEquals(prop.id) } ?? prop }
    private var chosen: [String] {
        store.snapshot?.rows.first { $0.id.jsEquals(row.id) }.map { DatabaseEdits.selectedIds($0.properties[prop.id]) } ?? selected
    }

    var body: some View {
        let match = DatabaseEdits.optionsMatching(current, query)
        let clean = JSText.trim(query)
        VStack(alignment: .leading, spacing: 6) {
            TextField(current.options.isEmpty ? "Create an option" : "Find or create an option", text: $query)
                .textFieldStyle(.roundedBorder)
                .focused($focused)
                .accessibilityLabel("Option")
                .onSubmit {
                    if !clean.isEmpty && !match.exact { create() } else if let first = match.shown.first { choose(first.id) }
                }
            ScrollView {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(match.shown, id: \.id) { option in
                        Button { choose(option.id) } label: {
                            HStack {
                                OptionChip(name: option.name, color: option.color)
                                Spacer()
                                if chosen.contains(where: { $0.jsEquals(option.id) }) { Image(systemName: "checkmark") }
                            }
                            .padding(.vertical, 4)
                            .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(chosen.contains(where: { $0.jsEquals(option.id) }) ? .isSelected : [])
                    }
                    if !clean.isEmpty && !match.exact {
                        Button(action: create) {
                            HStack {
                                Image(systemName: "plus")
                                Text("Create")
                                OptionChip(name: clean, color: "gray")
                            }
                            .padding(.vertical, 4)
                        }
                        .buttonStyle(.plain)
                    }
                    if !chosen.isEmpty {
                        Button("Clear", systemImage: "xmark") {
                            store.setValue(row.id, prop.id, .null)
                            close()
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 4)
                    }
                }
            }
            .frame(maxHeight: 280)
        }
        .padding(12)
        .frame(width: 280)
        .onAppear { focused = true }
    }

    private func choose(_ id: String) {
        let result = DatabaseEdits.choose(id, selected: chosen, multi: multi)
        store.setValue(row.id, prop.id, result.value)
        if result.close { close() }
    }

    private func create() {
        guard store.createOption(current, named: query, for: row, selected: chosen) else { return }
        query = ""
        if !multi { close() }
    }
}

/// Morrow's RelationPicker: pages to relate a row to, searched by title; the row keeps their titles.
struct RelationPicker: View {
    let store: DatabaseStore
    let prop: PropDef
    let row: PageMeta
    let targets: [String]
    @State private var query = ""
    @State private var found: [DatabaseSnapshot.RelatedPage] = []
    @FocusState private var focused: Bool

    private var current: [String] {
        store.snapshot?.rows.first { $0.id.jsEquals(row.id) }.map { DatabaseEdits.relationTargets($0.properties[prop.id]) } ?? targets
    }

    var body: some View {
        let chosen = Set(current.map { $0.lowercased() })
        VStack(alignment: .leading, spacing: 6) {
            TextField("Search pages", text: $query)
                .textFieldStyle(.roundedBorder)
                .focused($focused)
            if !current.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(current, id: \.self) { title in
                        if let page = store.snapshot?.relations[title] {
                            Button { store.open(page.id) } label: {
                                Label("Open \(page.title)", systemImage: "arrow.up.right").lineLimit(1)
                            }
                            .buttonStyle(.borderless)
                            .font(.subheadline)
                        }
                    }
                }
                Divider()
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(found, id: \.id) { page in
                        Button {
                            store.setValue(row.id, prop.id, DatabaseEdits.toggleRelation(page.title, targets: current))
                        } label: {
                            HStack(spacing: 6) {
                                if let info = store.info(page.id) { PageIcon(page: info, size: 14) }
                                Text(page.title).lineLimit(1)
                                Spacer()
                                if chosen.contains(page.title.lowercased()) { Image(systemName: "checkmark") }
                            }
                            .padding(.vertical, 4)
                            .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(chosen.contains(page.title.lowercased()) ? .isSelected : [])
                        .contextMenu {
                            Button("Open \(page.title)", systemImage: "arrow.up.right") { store.open(page.id) }
                        }
                    }
                    if found.isEmpty { Text("No pages match.").font(.footnote).foregroundStyle(.secondary) }
                }
            }
            .frame(maxHeight: 300)
        }
        .padding(12)
        .frame(width: 300)
        .onAppear { focused = true }
        .task(id: query) { found = await store.controller.findPages(query, excluding: row.id) }
    }
}
