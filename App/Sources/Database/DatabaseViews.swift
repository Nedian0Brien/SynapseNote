import SwiftUI

/// What every view of a database is drawn from.
struct DatabaseViewInput {
    let store: DatabaseStore
    let view: ViewDef
    let rows: [PageMeta]
    /// the properties the view shows
    let props: [PropDef]
    let editable: Bool
}

// MARK: table

/// Morrow's TableView: a row per page, the name then every shown property, each cell editable in place.
struct DatabaseTableView: View {
    let input: DatabaseViewInput
    @State private var settingsFor: String?
    @State private var addingProperty = false

    private static let titleWidth: CGFloat = 260
    private static let cellWidth: CGFloat = 190

    var body: some View {
        let store = input.store
        VStack(alignment: .leading, spacing: 0) {
            ScrollView(.horizontal) {
                Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
                    GridRow {
                        Text("Name")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.secondary)
                            .frame(width: Self.titleWidth, alignment: .leading)
                            .padding(8)
                        ForEach(input.props, id: \.id) { prop in
                            Button { settingsFor = prop.id } label: {
                                Text(prop.name)
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                                    .frame(width: Self.cellWidth, alignment: .leading)
                                    .contentShape(.rect)
                            }
                            .buttonStyle(.plain)
                            .disabled(!input.editable)
                            .padding(8)
                            .accessibilityHint("Property settings")
                            .popover(isPresented: Binding(get: { settingsFor == prop.id }, set: { if !$0 { settingsFor = nil } })) {
                                PropertySettings(store: store, propId: prop.id, viewId: input.view.id) { settingsFor = nil }
                            }
                        }
                        if input.editable {
                            Button("Add a property", systemImage: "plus") { addingProperty = true }
                                .labelStyle(.iconOnly)
                                .buttonStyle(.borderless)
                                .padding(8)
                                .popover(isPresented: $addingProperty) {
                                    NewPropertyForm(store: store) { addingProperty = false }
                                        .padding(12)
                                        .frame(width: 320)
                                }
                        }
                    }
                    Divider().gridCellUnsizedAxes(.horizontal)
                    ForEach(input.rows, id: \.id) { row in
                        GridRow {
                            RowTitleCell(store: store, row: row, editable: input.editable)
                                .frame(width: Self.titleWidth, alignment: .leading)
                                .padding(8)
                            ForEach(input.props, id: \.id) { prop in
                                PropertyInput(store: store, prop: prop, row: row, editable: input.editable)
                                    .frame(width: Self.cellWidth, alignment: .leading)
                                    .padding(8)
                            }
                            if input.editable { Color.clear.frame(width: 1, height: 1) }
                        }
                        Divider().gridCellUnsizedAxes(.horizontal)
                    }
                }
            }
            if input.editable {
                Button("New", systemImage: "plus") { store.focusRow = store.createRow() }
                    .buttonStyle(.borderless)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 8)
            }
        }
    }
}

/// A table row's name, saved on return or when the field loses focus, and the button that opens the page.
struct RowTitleCell: View {
    let store: DatabaseStore
    let row: PageMeta
    let editable: Bool

    var body: some View {
        HStack(spacing: 6) {
            if let info = store.info(row.id) { PageIcon(page: info, size: 15) }
            DraftField(label: "Name", value: row.title, placeholder: "Untitled", editable: editable,
                       focusRequested: store.focusRow == row.id) { title in
                store.rename(row.id, title)
            }
            .fontWeight(.medium)
            Button("Open \(Model.displayTitle(row))", systemImage: "arrow.up.left.and.arrow.down.right") { store.open(row.id) }
                .labelStyle(.iconOnly)
                .buttonStyle(.borderless)
                .foregroundStyle(.secondary)
        }
        .onAppear { if store.focusRow == row.id { store.focusRow = nil } }
    }
}

// MARK: cards

/// Morrow's Card: a page's cover picture in a gallery, its icon and name, the shown values, and how many of its
/// checklist items are done.
struct DatabaseCard: View {
    let store: DatabaseStore
    let row: PageMeta
    let props: [PropDef]
    var cover = false
    @State private var image: Image?

    var body: some View {
        let progress = store.snapshot?.progress[row.id] ?? (0, 0)
        let picture = cover ? store.snapshot?.firstImages[row.id] : nil
        Button { store.open(row.id) } label: {
            VStack(alignment: .leading, spacing: 8) {
                if cover {
                    Rectangle()
                        .fill(.quaternary)
                        .frame(height: 130)
                        .overlay { if let image { image.resizable().scaledToFill() } }
                        .clipped()
                }
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        if let icon = row.icon { EmojiImage(emoji: icon, size: 16) }
                        Text(Model.displayTitle(row)).font(.body.weight(.medium)).lineLimit(2)
                    }
                    FlowLayout(spacing: 4) {
                        ForEach(props, id: \.id) { prop in
                            PropertyDisplay(store: store, prop: prop, value: store.value(row, prop))
                        }
                    }
                    if progress.total > 0 {
                        HStack(spacing: 6) {
                            ProgressView(value: Double(progress.done), total: Double(progress.total))
                            Text("\(progress.done)/\(progress.total)").font(.caption).monospacedDigit().foregroundStyle(.secondary)
                        }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(progress.done) of \(progress.total) tasks done")
                    }
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 10)
                .padding(.top, cover ? 0 : 10)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.background.secondary, in: .rect(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.separator))
            .clipShape(.rect(cornerRadius: 8))
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .task(id: picture) {
            image = nil
            guard let picture, let data = await store.controller.vaultFile(picture) else { return }
            image = await Task.detached { CoverPicture.decode(data, maxPixels: 600) }.value
        }
    }
}

// MARK: board

/// Morrow's BoardView: a column per option of the group property, cards dragged between columns take its value.
struct DatabaseBoardView: View {
    let input: DatabaseViewInput
    @State private var over: String?

    var body: some View {
        let store = input.store
        if let prop = store.database.properties.first(where: { input.view.groupBy.map($0.id.jsEquals) == true }) {
            let shown = input.props.filter { !$0.id.jsEquals(prop.id) }
            ScrollView(.horizontal) {
                HStack(alignment: .top, spacing: 12) {
                    ForEach(DatabaseEdits.boardGroups(input.rows, input.view, store.database), id: \.key) { group in
                        let key = group.key ?? "__none"
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 6) {
                                OptionChip(name: group.label, color: group.color)
                                Text("\(group.rows.count)").font(.subheadline).foregroundStyle(.secondary)
                            }
                            ForEach(group.rows, id: \.id) { row in
                                DatabaseCard(store: store, row: row, props: shown)
                                    .draggable(row.id) { Text(Model.displayTitle(row)).padding(8) }
                            }
                            if input.editable {
                                Button("New", systemImage: "plus") {
                                    store.newRowAndOpen(JSObject([(prop.id, DatabaseEdits.boardValue(prop, key: group.key))]))
                                }
                                .buttonStyle(.borderless)
                                .foregroundStyle(.secondary)
                            }
                        }
                        .padding(10)
                        .frame(width: 260, alignment: .topLeading)
                        .background(over == key ? AnyShapeStyle(.tint.opacity(0.12)) : AnyShapeStyle(.quaternary.opacity(0.4)),
                                    in: .rect(cornerRadius: 10))
                        .accessibilityElement(children: .contain)
                        .accessibilityLabel(group.label)
                        .dropDestination(for: String.self) { ids, _ in
                            guard input.editable, let id = ids.first else { return false }
                            store.setValue(id, prop.id, DatabaseEdits.boardValue(prop, key: group.key))
                            return true
                        } isTargeted: { targeted in
                            if targeted { over = key } else if over == key { over = nil }
                        }
                    }
                }
                .padding(.vertical, 4)
            }
        } else {
            Text("Choose a select or checkbox property to group cards by, under Group.")
                .foregroundStyle(.secondary)
                .padding(.vertical, 12)
        }
    }
}

// MARK: calendar

/// Morrow's CalendarView: a month from Monday, rows on the day their date property names; dragging a row to
/// another day changes it.
struct DatabaseCalendarView: View {
    let input: DatabaseViewInput
    @State private var month = Calendar.current.date(from: Calendar.current.dateComponents([.year, .month], from: Date())) ?? Date()
    @State private var over: String?

    var body: some View {
        let store = input.store
        if let prop = store.database.properties.first(where: { input.view.dateProp.map($0.id.jsEquals) == true }) {
            let calendar = Calendar.current
            let days = DatabaseEdits.calendarDays(month: month, calendar: calendar)
            let byDay = DatabaseEdits.rowsByDay(input.rows, prop.id)
            let today = Daily.dateKey(Date())
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Text(month.formatted(.dateTime.month(.wide).year())).font(.title3.weight(.semibold))
                    Spacer()
                    Button("Previous month", systemImage: "chevron.left") { shift(-1) }.labelStyle(.iconOnly)
                    Button("Today") { month = calendar.date(from: calendar.dateComponents([.year, .month], from: Date())) ?? Date() }
                    Button("Next month", systemImage: "chevron.right") { shift(1) }.labelStyle(.iconOnly)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(minimum: 60), spacing: 2), count: 7), spacing: 2) {
                    ForEach(days.prefix(7), id: \.self) { day in
                        Text(day.formatted(.dateTime.weekday(.abbreviated)))
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                    }
                    ForEach(days, id: \.self) { day in
                        let key = Daily.dateKey(day)
                        let inMonth = calendar.isDate(day, equalTo: month, toGranularity: .month)
                        VStack(alignment: .leading, spacing: 3) {
                            HStack {
                                Text("\(calendar.component(.day, from: day))")
                                    .font(.caption.weight(key == today ? .bold : .regular))
                                    .foregroundStyle(key == today ? AnyShapeStyle(.tint) : AnyShapeStyle(inMonth ? .primary : .tertiary))
                                Spacer()
                                if input.editable {
                                    Button("New row on \(day.formatted(date: .abbreviated, time: .omitted))", systemImage: "plus") {
                                        store.newRowAndOpen(JSObject([(prop.id, .string(key))]))
                                    }
                                    .labelStyle(.iconOnly)
                                    .buttonStyle(.borderless)
                                    .font(.caption)
                                }
                            }
                            ForEach(byDay[key] ?? [], id: \.id) { row in
                                Button { store.open(row.id) } label: {
                                    Text(Model.displayTitle(row))
                                        .font(.caption)
                                        .lineLimit(1)
                                        .padding(.horizontal, 4)
                                        .padding(.vertical, 2)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .background(.tint.opacity(0.15), in: .rect(cornerRadius: 4))
                                }
                                .buttonStyle(.plain)
                                .draggable(row.id) { Text(Model.displayTitle(row)).padding(6) }
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(4)
                        .frame(minHeight: 90, alignment: .top)
                        .background(over == key ? AnyShapeStyle(.tint.opacity(0.12)) : AnyShapeStyle(.quaternary.opacity(inMonth ? 0.35 : 0.15)))
                        .accessibilityElement(children: .contain)
                        .accessibilityLabel(day.formatted(date: .complete, time: .omitted))
                        .dropDestination(for: String.self) { ids, _ in
                            guard input.editable, let id = ids.first else { return false }
                            store.setValue(id, prop.id, .string(key))
                            return true
                        } isTargeted: { targeted in
                            if targeted { over = key } else if over == key { over = nil }
                        }
                    }
                }
            }
        } else {
            Text("Choose a date property to place rows by, under Date.")
                .foregroundStyle(.secondary)
                .padding(.vertical, 12)
        }
    }

    private func shift(_ delta: Int) {
        month = Calendar.current.date(byAdding: .month, value: delta, to: month) ?? month
    }
}

// MARK: list and gallery

/// Morrow's ListView: each page with its icon, name and shown values.
struct DatabaseListView: View {
    let input: DatabaseViewInput

    var body: some View {
        let store = input.store
        LazyVStack(alignment: .leading, spacing: 0) {
            ForEach(input.rows, id: \.id) { row in
                Button { store.open(row.id) } label: {
                    HStack(spacing: 8) {
                        if let info = store.info(row.id) { PageIcon(page: info, size: 15) }
                        Text(Model.displayTitle(row)).lineLimit(1)
                        Spacer(minLength: 12)
                        HStack(spacing: 4) {
                            ForEach(input.props, id: \.id) { prop in
                                PropertyDisplay(store: store, prop: prop, value: store.value(row, prop))
                            }
                        }
                    }
                    .padding(.vertical, 8)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                Divider()
            }
        }
    }
}

/// Morrow's GalleryView: cards with the first picture of each page.
struct DatabaseGalleryView: View {
    let input: DatabaseViewInput

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 200), spacing: 12)], spacing: 12) {
            ForEach(input.rows, id: \.id) { row in
                DatabaseCard(store: input.store, row: row, props: input.props, cover: true)
            }
        }
    }
}
