import SwiftUI

/// Morrow's RowProperties: the values of a database row, shown at the top of its page under the title, each
/// with the editor its table cell has, and Add a property.
struct RowPropertiesView: View {
    let controller: EditorController
    let rowId: String
    let editable: Bool
    @State private var store: DatabaseStore
    @State private var adding = false

    init(controller: EditorController, rowId: String, dbId: String, editable: Bool) {
        self.controller = controller
        self.rowId = rowId
        self.editable = editable
        _store = State(initialValue: DatabaseStore(controller: controller, dbId: dbId))
    }

    var body: some View {
        Group {
            if let row = store.snapshot?.rows.first(where: { $0.id == rowId }), !store.database.properties.isEmpty || editable {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(store.database.properties, id: \.id) { prop in
                        HStack(spacing: 0) {
                            Text(prop.name)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                                .padding(.horizontal, 8)
                                .frame(width: 150, alignment: .leading)
                            PropertyInput(store: store, prop: prop, row: row, editable: editable)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .frame(minHeight: 34)
                    }
                    if editable {
                        Button("Add a property", systemImage: "plus") { adding = true }
                            .buttonStyle(.borderless)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 8)
                            .padding(.top, 4)
                            .popover(isPresented: $adding) {
                                NewPropertyForm(store: store) { adding = false }
                                    .padding(12)
                                    .frame(minWidth: 320)
                            }
                    }
                }
                .padding(.bottom, 12)
                .overlay(alignment: .bottom) { Divider() }
                .padding(.top, 8)
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Properties")
            }
        }
        .task(id: controller.revision) { await store.load() }
    }
}
