import SwiftUI

@MainActor
struct CatalogSidebarView: View {
  @Bindable var catalog: CatalogModel

  var body: some View {
    VStack(spacing: 0) {
      VStack(alignment: .leading, spacing: 4) {
        Label("SynapseNote", systemImage: "point.3.connected.trianglepath.dotted")
          .font(.headline)
        Text("Native Design System")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(16)

      Divider()

      List(selection: $catalog.selection) {
        ForEach(CatalogGroup.allCases) { group in
          Section(group.rawValue) {
            ForEach(filteredItems(in: group)) { item in
              Label(item.title, systemImage: item.symbol)
                .tag(item)
            }
          }
        }
      }
      .listStyle(.sidebar)
      .searchable(text: $catalog.searchText, placement: .sidebar, prompt: "Search catalog")

      Divider()

      Text("Product UI · Apple platforms 26")
        .font(.caption2)
        .foregroundStyle(.tertiary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
    }
    .navigationTitle("Design System")
  }

  private func filteredItems(in group: CatalogGroup) -> [CatalogItem] {
    guard !catalog.searchText.isEmpty else { return group.items }
    return group.items.filter { item in
      item.title.localizedCaseInsensitiveContains(catalog.searchText)
        || item.summary.localizedCaseInsensitiveContains(catalog.searchText)
    }
  }
}
