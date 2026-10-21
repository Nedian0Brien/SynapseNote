import SwiftUI

/// A database page as Morrow's PageView draws one: the cover and header without tags, then DatabaseView: the
/// views as tabs, the toolbar, the rows in the chosen view, and how many rows are shown.
struct DatabaseScreenView: View {
    let controller: EditorController
    let page: PageInfo
    let editable: Bool
    @State private var store: DatabaseStore

    init(controller: EditorController, page: PageInfo, editable: Bool) {
        self.controller = controller
        self.page = page
        self.editable = editable
        _store = State(initialValue: DatabaseStore(controller: controller, dbId: page.id))
    }

    var body: some View {
        ScrollView {
            CoverBanner(controller: controller, page: page, editable: editable)
            PageColumn(controller: controller) {
                VStack(alignment: .leading, spacing: 0) {
                    PageHeaderView(controller: controller, page: page, editable: editable, showsTags: false)
                    if store.snapshot != nil, let view = store.view {
                        DatabaseBody(store: store, view: view, editable: editable)
                    } else if store.snapshot == nil {
                        ProgressView().frame(maxWidth: .infinity, minHeight: 120)
                    }
                }
            }
            .padding(.top, page.cover == nil ? 32 : 0)
            .padding(.bottom, 120)
        }
        .background(.background)
        // asked again whenever the session reports a change, as the other screens are
        .task(id: controller.revision) {
            await store.load()
            store.ensureView(editable: editable)
        }
    }
}

struct DatabaseBody: View {
    let store: DatabaseStore
    let view: ViewDef
    let editable: Bool
    @State private var addingView = false
    @State private var settingsFor: String?
    @State private var panel: Panel?

    enum Panel: String, Identifiable {
        case filter, sort, layout, properties
        var id: String { rawValue }
    }

    private static let icons = ["table": "tablecells", "board": "rectangle.split.3x1", "calendar": "calendar",
                                "list": "list.bullet", "gallery": "square.grid.2x2"]

    var body: some View {
        let snapshot = store.snapshot!
        let database = store.database
        let rows = Database.visibleRows(snapshot.rows, view, database, now: snapshot.now)
        let props = database.properties.filter { prop in !view.hidden.contains { $0.jsEquals(prop.id) } }
        let input = DatabaseViewInput(store: store, view: view, rows: rows, props: props, editable: editable)
        VStack(alignment: .leading, spacing: 12) {
            tabs(database)
            toolbar
            switch view.type {
            case "board": DatabaseBoardView(input: input)
            case "calendar": DatabaseCalendarView(input: input)
            case "list": DatabaseListView(input: input)
            case "gallery": DatabaseGalleryView(input: input)
            default: DatabaseTableView(input: input)
            }
            if view.type != "table" && editable {
                Button("New", systemImage: "plus") { store.newRowAndOpen() }
                    .buttonStyle(.borderless)
                    .foregroundStyle(.secondary)
            }
            Text(DatabaseEdits.countText(shown: rows.count, all: snapshot.rows.count))
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding(.top, 8)
    }

    private func tabs(_ database: DatabaseDef) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 4) {
                ForEach(database.views, id: \.id) { candidate in
                    let active = candidate.id.jsEquals(view.id)
                    Button { store.choose(candidate.id) } label: {
                        Label(candidate.name.isEmpty ? Database.viewLabels[candidate.type] ?? candidate.type : candidate.name,
                              systemImage: Self.icons[candidate.type] ?? "tablecells")
                            .font(.subheadline.weight(active ? .semibold : .regular))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(active ? AnyShapeStyle(.quaternary) : AnyShapeStyle(.clear), in: .rect(cornerRadius: 6))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(active ? .primary : .secondary)
                    .accessibilityAddTraits(active ? .isSelected : [])
                    .contextMenu {
                        if editable { Button("View Settings…", systemImage: "slider.horizontal.3") { settingsFor = candidate.id } }
                    }
                    .popover(isPresented: Binding(get: { settingsFor == candidate.id }, set: { if !$0 { settingsFor = nil } })) {
                        ViewSettings(store: store, viewId: candidate.id) { settingsFor = nil }
                    }
                }
                if editable {
                    Menu {
                        ForEach(Model.viewTypes, id: \.self) { type in
                            Button(Database.viewLabels[type] ?? type, systemImage: Self.icons[type] ?? "tablecells") {
                                let added = DatabaseEdits.addView(store.database, type: type, newId: DatabaseStore.newId)
                                store.save(added.database)
                                store.choose(added.view.id)
                            }
                        }
                    } label: {
                        Label("Add a view", systemImage: "plus").labelStyle(.iconOnly).padding(6)
                    }
                    .menuIndicator(.hidden)
                }
            }
        }
        .accessibilityLabel("Views")
    }

    private var toolbar: some View {
        HStack(spacing: 4) {
            tool(.filter, "Filter\(view.filters.isEmpty ? "" : " \(view.filters.count)")", "line.3.horizontal.decrease",
                 active: !view.filters.isEmpty, enabled: editable)
            tool(.sort, "Sort\(view.sorts.isEmpty ? "" : " \(view.sorts.count)")", "arrow.up.arrow.down",
                 active: !view.sorts.isEmpty, enabled: editable)
            if view.type == "board" || view.type == "calendar" {
                tool(.layout, view.type == "board" ? "Group" : "Date", "slider.horizontal.3", active: false, enabled: editable)
            }
            tool(.properties, "Properties", "eye", active: false, enabled: true)
        }
        .font(.subheadline)
    }

    private func tool(_ kind: Panel, _ title: String, _ symbol: String, active: Bool, enabled: Bool) -> some View {
        Button { panel = kind } label: {
            Label(title, systemImage: symbol)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(active ? AnyShapeStyle(.tint.opacity(0.14)) : AnyShapeStyle(.clear), in: .rect(cornerRadius: 6))
        }
        .buttonStyle(.plain)
        .foregroundStyle(active ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
        .disabled(!enabled)
        .popover(isPresented: Binding(get: { panel == kind }, set: { if !$0 { panel = nil } })) {
            switch kind {
            case .filter: FilterPanel(store: store, viewId: view.id)
            case .sort: SortPanel(store: store, viewId: view.id)
            case .layout: LayoutPanel(store: store, viewId: view.id)
            case .properties: PropertiesPanel(store: store, viewId: view.id, editable: editable)
            }
        }
    }
}
