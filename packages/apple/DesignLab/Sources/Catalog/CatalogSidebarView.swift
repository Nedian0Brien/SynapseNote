import SwiftUI

@MainActor
struct CatalogSidebarView: View {
  @Bindable var catalog: CatalogModel

  var body: some View {
    VStack(spacing: 0) {
      VStack(alignment: .leading, spacing: 4) {
        Label("SynapseNote", systemImage: "point.3.connected.trianglepath.dotted")
          .font(.headline)
        Text("Design System")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(16)

      Divider()

      List(selection: $catalog.selection) {
        ForEach(CatalogGroup.allCases) { group in
          Section(group.rawValue) {
            ForEach(group.items) { item in
              Label(item.title, systemImage: item.symbol)
                .tag(item)
            }
          }
        }
      }
      .listStyle(.sidebar)

      Divider()

      Text("iOS · iPadOS · macOS 26")
        .font(.caption2)
        .foregroundStyle(.tertiary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
    }
    .background(.bar)
  }
}
